-- =============================================================================
-- 012_inventory_core.sql
-- =============================================================================
-- STATUS: PREPARED ONLY (Phase E). Not applied to any hosted Supabase project.
-- See INVENTORY_MODEL.md and MIGRATION_PLAN.md.
--
-- Purpose:
--   A branch-generic inventory + product-cost model, first used by İskele
--   Dondurma. Nothing here is Dondurma-specific: no branch-named columns, no
--   seeded products/SKUs/costs (those are operational facts only the business
--   can supply). Branch is always a foreign key.
--
--   Core rules encoded structurally, not by convention:
--     * inventory_movements is an APPEND-ORIENTED LEDGER — rows are never
--       updated or deleted (trigger + no client privileges). A mistake is
--       corrected by a REVERSAL movement, never by rewriting history.
--     * inventory_item_costs is EFFECTIVE-DATED and append-only — a new cost
--       is a new row; old rows are never edited, so historical gross profit
--       stays reproducible. Each movement also snapshots the cost that
--       applied when it happened (unit_cost_snapshot).
--     * A physical count (inventory_counts / inventory_count_items) is a
--       SEPARATE fact from the theoretical ledger. Submitting a count records
--       theoretical-vs-physical variance; it never touches the ledger. The
--       only way the ledger changes to explain a variance is an explicit,
--       audited ADJUSTMENT movement (014).
--     * Revenue and inventory quantity are different facts. A sales report
--       line MAY reference an inventory item + explicit quantity
--       (sales_report_items.inventory_item_id / inventory_quantity). Quantity
--       is never inferred from TL revenue; category-level legacy lines stay
--       valid and untouched.
--
-- Depends on: 001 (profiles), 002 (permissions/role_permissions), 003
--   (branches), 009 (sales_categories, shifts, sales_reports, sales_report_items).
-- Required by: 013_inventory_rls.sql, 014_inventory_rpcs.sql.
--
-- Rollback (reverse dependency order):
--   drop view if exists public.inventory_last_counts;
--   drop view if exists public.inventory_stock_balances;
--   drop index if exists public.sales_report_items_unique_product;
--   drop index if exists public.sales_report_items_unique_category;
--   alter table public.sales_report_items drop constraint if exists sales_report_items_inventory_pair;
--   alter table public.sales_report_items drop constraint if exists sales_report_items_inventory_qty_positive;
--   alter table public.sales_report_items drop column if exists inventory_quantity;
--   alter table public.sales_report_items drop column if exists inventory_item_id;
--   alter table public.sales_report_items add constraint sales_report_items_sales_report_id_category_id_key unique (sales_report_id, category_id);
--   drop table if exists public.inventory_movements;
--   drop table if exists public.inventory_count_items;
--   drop table if exists public.inventory_counts;
--   drop table if exists public.inventory_item_costs;
--   drop table if exists public.inventory_items;
--   drop function if exists public.inventory_prevent_mutation();
--   drop function if exists public.inventory_guard_count_update();
--   delete from public.role_permissions where permission_id in (select id from public.permissions where key like 'inventory.%');
--   delete from public.permissions where key like 'inventory.%';
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Permissions. Same catalog/role_permissions pattern as 002. New keys only —
-- nothing existing is changed.
--   inventory.read         see items, stock, movements, counts (branch-scoped)
--   inventory.record       record waste
--   inventory.receive      record stock receipts
--   inventory.count        submit a physical closing count
--   inventory.adjust       privileged: adjustments, movement reversal, void count
--   inventory.item.manage  create/update/(de)activate inventory items
--   inventory.cost.read    see product cost history and gross profit
--   inventory.cost.manage  set a new effective product cost
-- Cost is deliberately its own pair of keys, separate from operational
-- inventory access, so cost visibility is opt-in per role.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('inventory.read',        'View inventory items, stock levels, movements and counts for permitted branches.'),
  ('inventory.record',      'Record stock waste for permitted branches.'),
  ('inventory.receive',     'Record incoming stock (receipts) for permitted branches.'),
  ('inventory.count',       'Submit a physical closing count for permitted branches.'),
  ('inventory.adjust',      'Privileged: stock adjustments, movement reversals, voiding a count.'),
  ('inventory.item.manage', 'Create/update/activate/deactivate inventory items for permitted branches.'),
  ('inventory.cost.read',   'View product cost history and gross profit.'),
  ('inventory.cost.manage', 'Set a new effective product cost (append-only cost history).')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'inventory.%'
where
  r.key in ('owner', 'manager')
  or (r.key = 'branch_manager' and p.key in (
    'inventory.read', 'inventory.record', 'inventory.receive', 'inventory.count',
    'inventory.adjust', 'inventory.item.manage', 'inventory.cost.read'
  ))
  or (r.key in ('cashier', 'employee') and p.key in (
    'inventory.read', 'inventory.record', 'inventory.count'
  ))
on conflict do nothing;
-- viewer: intentionally NO inventory permission by default ("read/report-only
-- where explicitly authorized" — nothing is authorized until a reviewer adds
-- a grant). branch_manager has cost.read for its own branch but NOT
-- cost.manage: changing product cost stays owner/manager-only.

-- ---------------------------------------------------------------------------
-- Append-only guard. RLS/privileges already deny client writes; this trigger
-- protects against a future bug in a SECURITY DEFINER function (which
-- bypasses RLS) silently rewriting ledger or cost history.
-- ---------------------------------------------------------------------------
create or replace function public.inventory_prevent_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only: % is not permitted (corrections use a REVERSAL movement / a new cost row)',
    tg_table_name, tg_op
    using errcode = '42501';
end;
$$;

comment on function public.inventory_prevent_mutation() is
  'Trigger function: raises on any UPDATE/DELETE/TRUNCATE. Attached to inventory_movements and inventory_item_costs.';

-- ---------------------------------------------------------------------------
-- inventory_items — one base stock unit per item (no unit conversion / recipe
-- logic in this phase). Branch-scoped; the same code may exist in two
-- branches. allows_decimal lets an item measured in pieces reject 2.5.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  code text not null check (code ~ '^[A-Z0-9][A-Z0-9._-]{0,31}$'),
  name text not null check (length(trim(name)) > 0),
  unit text not null check (length(trim(unit)) between 1 and 16),
  allows_decimal boolean not null default true,
  sales_category_id uuid references public.sales_categories (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (branch_id, code),
  -- Lets child tables enforce "the movement's branch equals its item's branch"
  -- with a composite foreign key instead of trusting application code.
  unique (id, branch_id)
);

comment on table public.inventory_items is
  'Branch-scoped stock items. Generic: no branch-specific columns and no seeded products — the catalog is entered by the business via upsert_inventory_item() (014).';
comment on column public.inventory_items.sales_category_id is
  'Optional link to sales_categories. Required for an item to be sold via a product-linked sales_report_items line (its category is what that line reconciles under).';

create index if not exists idx_inventory_items_branch on public.inventory_items (branch_id) where is_active;

create trigger set_updated_at before update on public.inventory_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- inventory_item_costs — effective-dated, append-only. The applicable cost at
-- time T is the row with the greatest effective_from <= T.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_item_costs (
  id uuid primary key default gen_random_uuid(),
  inventory_item_id uuid not null references public.inventory_items (id),
  unit_cost numeric(14, 4) not null check (unit_cost >= 0),
  effective_from timestamptz not null default now(),
  reason text,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (inventory_item_id, effective_from)
);

comment on table public.inventory_item_costs is
  'Append-only, effective-dated unit cost per item. Never UPDATE/DELETE (trigger). Cost changes go through set_inventory_item_cost() (014), which is cost.manage-gated and audited. Historical gross profit reads unit_cost_snapshot on movements, so it is unaffected by later cost changes.';

create index if not exists idx_inventory_item_costs_item_effective
  on public.inventory_item_costs (inventory_item_id, effective_from desc);

create trigger inventory_item_costs_no_update before update or delete on public.inventory_item_costs
  for each row execute function public.inventory_prevent_mutation();
create trigger inventory_item_costs_no_truncate before truncate on public.inventory_item_costs
  for each statement execute function public.inventory_prevent_mutation();

-- ---------------------------------------------------------------------------
-- inventory_counts / inventory_count_items — the PHYSICAL fact, separate from
-- the theoretical ledger. A count row is created already 'submitted' by
-- submit_inventory_count() (014); a mistaken count is 'voided' (never
-- deleted) by void_inventory_count(). theoretical_quantity is a server-side
-- snapshot of the ledger balance at submission time, so variance is
-- reproducible later even after more movements occur.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  shift_id uuid references public.shifts (id),
  business_date date not null,
  status text not null default 'submitted' check (status in ('submitted', 'voided')),
  note text,
  counted_by uuid not null references public.profiles (id),
  submitted_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references public.profiles (id),
  void_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_counts_void_shape check (
    (status = 'voided') = (voided_at is not null and voided_by is not null and void_reason is not null)
  )
);

comment on table public.inventory_counts is
  'A submitted physical count. Never edited or deleted; the only lifecycle change is submitted -> voided via void_inventory_count() (014). Submitting a count NEVER changes the stock ledger.';

create index if not exists idx_inventory_counts_branch_date on public.inventory_counts (branch_id, business_date desc);
create index if not exists idx_inventory_counts_shift on public.inventory_counts (shift_id);

create trigger set_updated_at before update on public.inventory_counts
  for each row execute function public.set_updated_at();

create table if not exists public.inventory_count_items (
  id uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references public.inventory_counts (id),
  inventory_item_id uuid not null references public.inventory_items (id),
  physical_quantity numeric(14, 3) not null check (physical_quantity >= 0),
  theoretical_quantity numeric(14, 3) not null,
  variance_quantity numeric(14, 3) generated always as (physical_quantity - theoretical_quantity) stored,
  created_at timestamptz not null default now(),
  unique (inventory_count_id, inventory_item_id)
);

comment on table public.inventory_count_items is
  'Per-item physical quantity plus the server-side theoretical snapshot; variance_quantity = physical - theoretical. Immutable once written.';

create index if not exists idx_inventory_count_items_item on public.inventory_count_items (inventory_item_id);

create trigger inventory_count_items_no_update before update or delete on public.inventory_count_items
  for each row execute function public.inventory_prevent_mutation();

-- Counts may only move submitted -> voided; every other column is frozen.
create or replace function public.inventory_guard_count_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'inventory_counts rows are never deleted (void instead)' using errcode = '42501';
  end if;

  if old.status = 'voided' then
    raise exception 'a voided inventory count is final' using errcode = '42501';
  end if;

  if new.status <> 'voided'
     or new.branch_id is distinct from old.branch_id
     or new.shift_id is distinct from old.shift_id
     or new.business_date is distinct from old.business_date
     or new.counted_by is distinct from old.counted_by
     or new.submitted_at is distinct from old.submitted_at
     or new.note is distinct from old.note then
    raise exception 'inventory_counts may only transition submitted -> voided' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.inventory_guard_count_update() is
  'Freezes every inventory_counts column except the submitted -> voided transition.';

create trigger inventory_counts_guard before update or delete on public.inventory_counts
  for each row execute function public.inventory_guard_count_update();

-- ---------------------------------------------------------------------------
-- inventory_movements — the stock ledger.
--   quantity     always > 0 (the amount moved)
--   stock_delta  signed effect on theoretical stock; set server-side only
--   REVERSAL     undoes exactly one earlier movement (reverses_movement_id,
--                unique) with the opposite stock_delta and the SAME cost
--                snapshot, so reversing a sale also reverses its COGS.
-- occurred_at is the SERVER clock (default now()); no RPC accepts a
-- client-supplied timestamp.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null,
  inventory_item_id uuid not null,
  movement_type text not null
    check (movement_type in ('RECEIPT', 'SALE', 'WASTE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL')),
  quantity numeric(14, 3) not null check (quantity > 0),
  stock_delta numeric(14, 3) not null,
  -- The cost that applied when this movement happened. NULL means no cost had
  -- been set yet — gross profit treats such quantity as UNCOSTED (partial /
  -- unavailable), never as zero cost. Column-level privileges hide this from
  -- roles without inventory.cost.read (see 013).
  unit_cost_snapshot numeric(14, 4) check (unit_cost_snapshot is null or unit_cost_snapshot >= 0),
  shift_id uuid references public.shifts (id),
  sales_report_id uuid references public.sales_reports (id),
  inventory_count_id uuid references public.inventory_counts (id),
  reverses_movement_id uuid references public.inventory_movements (id),
  reason_code text check (reason_code is null or reason_code in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other')),
  reason text,
  reference text,
  occurred_at timestamptz not null default now(),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  foreign key (inventory_item_id, branch_id) references public.inventory_items (id, branch_id),
  constraint inventory_movements_delta_consistent check (
    (movement_type in ('RECEIPT', 'ADJUSTMENT_IN') and stock_delta = quantity)
    or (movement_type in ('SALE', 'WASTE', 'ADJUSTMENT_OUT') and stock_delta = -quantity)
    or (movement_type = 'REVERSAL' and abs(stock_delta) = quantity)
  ),
  constraint inventory_movements_reversal_shape check (
    (movement_type = 'REVERSAL') = (reverses_movement_id is not null)
  ),
  constraint inventory_movements_waste_has_reason_code check (
    movement_type <> 'WASTE' or reason_code is not null
  ),
  constraint inventory_movements_privileged_has_reason check (
    movement_type not in ('ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL')
    or (reason is not null and length(trim(reason)) > 0)
  ),
  constraint inventory_movements_sale_has_report check (
    movement_type <> 'SALE' or sales_report_id is not null
  )
);

comment on table public.inventory_movements is
  'Append-only stock ledger. Theoretical stock = sum(stock_delta). No UPDATE/DELETE ever (trigger + no client privileges); corrections are REVERSAL rows. occurred_at is server time.';

create unique index if not exists inventory_movements_one_reversal_per_movement
  on public.inventory_movements (reverses_movement_id) where reverses_movement_id is not null;

create index if not exists idx_inventory_movements_item_time on public.inventory_movements (inventory_item_id, occurred_at desc);
create index if not exists idx_inventory_movements_branch_time on public.inventory_movements (branch_id, occurred_at desc);
create index if not exists idx_inventory_movements_sales_report on public.inventory_movements (sales_report_id) where sales_report_id is not null;
create index if not exists idx_inventory_movements_shift on public.inventory_movements (shift_id) where shift_id is not null;

create trigger inventory_movements_no_update before update or delete on public.inventory_movements
  for each row execute function public.inventory_prevent_mutation();
create trigger inventory_movements_no_truncate before truncate on public.inventory_movements
  for each statement execute function public.inventory_prevent_mutation();

-- ---------------------------------------------------------------------------
-- Sales -> inventory link (revenue and quantity stay separate facts).
--   inventory_item_id + inventory_quantity are optional and set together.
--   Existing category-level rows (both NULL) remain valid and unchanged.
--   quantity (integer) is the legacy per-category count and is left alone;
--   the new inventory_quantity is decimal-capable and is what drives stock.
-- The old UNIQUE (sales_report_id, category_id) would forbid two products in
-- one category, so it is replaced by two partial unique indexes.
-- ---------------------------------------------------------------------------
alter table public.sales_report_items
  add column if not exists inventory_item_id uuid references public.inventory_items (id),
  add column if not exists inventory_quantity numeric(14, 3);

alter table public.sales_report_items
  add constraint sales_report_items_inventory_pair
    check ((inventory_item_id is null) = (inventory_quantity is null)),
  add constraint sales_report_items_inventory_qty_positive
    check (inventory_quantity is null or inventory_quantity > 0);

alter table public.sales_report_items
  drop constraint if exists sales_report_items_sales_report_id_category_id_key;

create unique index if not exists sales_report_items_unique_category
  on public.sales_report_items (sales_report_id, category_id) where inventory_item_id is null;
create unique index if not exists sales_report_items_unique_product
  on public.sales_report_items (sales_report_id, inventory_item_id) where inventory_item_id is not null;

create index if not exists idx_sales_report_items_inventory_item
  on public.sales_report_items (inventory_item_id) where inventory_item_id is not null;

comment on column public.sales_report_items.inventory_item_id is
  'Optional product link. When set, create_sales_report()/edit_sales_report() (014) write a SALE stock movement server-side in the same transaction. NULL = legacy category-level line (revenue only, no stock effect).';
comment on column public.sales_report_items.inventory_quantity is
  'Explicit sold quantity for a product-linked line, in the item''s base unit. Never derived from amount.';

-- ---------------------------------------------------------------------------
-- Read views. security_invoker = true so the CALLER'S RLS on the underlying
-- tables applies (a branch_manager only ever sees their own branches' rows).
-- ---------------------------------------------------------------------------
create or replace view public.inventory_stock_balances
with (security_invoker = true) as
select
  i.id as inventory_item_id,
  i.branch_id,
  coalesce(sum(m.stock_delta), 0)::numeric(14, 3) as theoretical_quantity,
  max(m.occurred_at) as last_movement_at
from public.inventory_items i
left join public.inventory_movements m on m.inventory_item_id = i.id
group by i.id, i.branch_id;

comment on view public.inventory_stock_balances is
  'Theoretical stock per item = sum of ledger stock_delta. Does NOT include physical counts — a count never changes this number.';

create or replace view public.inventory_last_counts
with (security_invoker = true) as
select distinct on (ci.inventory_item_id)
  ci.inventory_item_id,
  c.id as inventory_count_id,
  c.submitted_at as counted_at,
  ci.physical_quantity,
  ci.theoretical_quantity,
  ci.variance_quantity
from public.inventory_count_items ci
join public.inventory_counts c on c.id = ci.inventory_count_id
where c.status = 'submitted'
order by ci.inventory_item_id, c.submitted_at desc;

comment on view public.inventory_last_counts is
  'Most recent non-voided physical count line per item, with its theoretical snapshot and variance.';

-- Fix the shared timestamp trigger search path without rewriting migration 001.
alter function public.set_updated_at() set search_path = public;
