-- =============================================================================
-- Phase 1C (1/2): procurement / supply-order core - tables, guards, RLS
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production.
--
-- Built ON TOP of the existing inventory model; nothing here is a second inventory truth:
--   * items          = public.inventory_items (branch-scoped, unchanged)
--   * stock          = public.inventory_movements (append-only ledger, unchanged; receiving uses RECEIPT movements)
--   * authorization  = public.current_user_can_inventory(permission, branch) (permission + branch scope in one check)
--   * audit          = public.write_audit_log
-- New: suppliers, item_supply_params, purchase_orders (+lines, status history, receipt links).
--
-- UNIT CONTRACT (canonical model; the ledger is always in the item's BASE (stock) unit):
--   BASE unit (inventory_items.unit): on-hand, pending inbound, minimum_stock, target_stock, safety_stock, ledger RECEIPT quantity,
--                                     base_quantity of receipt links, units_per_pack (base units per order unit), unit costs.
--   ORDER unit (item_supply_params.order_unit, snapshotted on the line): purchase_order_lines.ordered_quantity / received_quantity,
--                                     minimum_order_quantity, order_multiple, receive input, suggested order quantity.
--   Conversion: base = order quantity * units_per_pack_snapshot. order_unit and units_per_pack are set TOGETHER or not at all;
--   neither set = ordering in the base unit (factor 1). A half-configured conversion is never guessed: ordering/suggestion/receiving refuse it.
--   The factor is SNAPSHOTTED on the line when the line is written; later changes to the supply parameters never alter an existing order.
--
-- Nothing is invented: no supplier, weekday, cutoff, lead time, stock threshold, minimum order or price is seeded.
-- Writes happen only through the RPCs of migration 600 (audited); clients get SELECT only.
-- Rollback: supabase/rollback/v4_schema_teardown.sql.
-- =============================================================================

insert into public.permissions (key, description) values
  ('procurement.supplier.read',   'View the supplier catalogue.'),
  ('procurement.supplier.manage', 'Create, edit and (de)activate suppliers.'),
  ('procurement.supply.manage',   'Configure item supply parameters (supplier, order rules, stock thresholds).'),
  ('procurement.order.read',      'View purchase orders, suggestions and procurement attention lists for permitted branches.'),
  ('procurement.order.create',    'Create and edit DRAFT purchase orders and submit them, for permitted branches.'),
  ('procurement.order.approve',   'Approve submitted purchase orders.'),
  ('procurement.order.manage',    'Move approved orders through preparing/in-transit, cancel and close short, with a reason.'),
  ('procurement.order.receive',   'Receive a purchase order into stock (creates RECEIPT movements) for permitted branches.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'procurement.%'
where r.key in ('owner', 'manager')
   or (r.key = 'branch_manager' and p.key in ('procurement.supplier.read', 'procurement.order.read', 'procurement.order.create', 'procurement.order.receive'))
on conflict do nothing;
-- cashier / employee / viewer: none by default (the existing inventory.receive stays for plain stock receipts).

-- ---------------------------------------------------------------------------
-- suppliers
-- ---------------------------------------------------------------------------
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9._-]{1,31}$'),
  name text not null check (length(trim(name)) between 1 and 80),
  supplier_type text not null check (supplier_type in ('COMPANY', 'CENTRAL_WAREHOUSE')),
  contact_name text check (contact_name is null or length(contact_name) <= 80),
  phone text check (phone is null or length(phone) <= 30),
  email text check (email is null or length(email) <= 120),
  notes text check (notes is null or length(notes) <= 500),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);
comment on table public.suppliers is
  'Supplier catalogue (external COMPANY or CENTRAL_WAREHOUSE). Nothing is seeded. code is immutable; suppliers are deactivated, never deleted. Written only by upsert_supplier / set_supplier_active (audited).';
create trigger set_updated_at before update on public.suppliers
  for each row execute function public.set_updated_at();

create or replace function public.procurement_guard_supplier()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'suppliers are never deleted (deactivate instead)' using errcode = '42501';
  end if;
  if new.code is distinct from old.code then
    raise exception 'a supplier code is immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger suppliers_guard before update or delete on public.suppliers
  for each row execute function public.procurement_guard_supplier();

-- ---------------------------------------------------------------------------
-- item_supply_params: per branch item, one supplier + ordering rules (all business inputs nullable)
-- ---------------------------------------------------------------------------
create table if not exists public.item_supply_params (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  item_id uuid not null,
  supplier_id uuid not null references public.suppliers (id),
  order_unit text check (order_unit is null or length(trim(order_unit)) between 1 and 16),
  units_per_pack numeric(14, 3) check (units_per_pack is null or units_per_pack > 0),
  minimum_stock numeric(14, 3) check (minimum_stock is null or minimum_stock >= 0),
  target_stock numeric(14, 3) check (target_stock is null or target_stock >= 0),
  safety_stock numeric(14, 3) check (safety_stock is null or safety_stock >= 0),
  lead_time_days integer check (lead_time_days is null or lead_time_days between 0 and 365),
  -- ISO weekdays 1 (Monday) .. 7 (Sunday); NULL = not configured (never "every day")
  allowed_order_weekdays smallint[] check (allowed_order_weekdays is null or (cardinality(allowed_order_weekdays) between 1 and 7 and allowed_order_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
  order_cutoff_time time,
  delivery_weekdays smallint[] check (delivery_weekdays is null or (cardinality(delivery_weekdays) between 1 and 7 and delivery_weekdays <@ array[1,2,3,4,5,6,7]::smallint[])),
  minimum_order_quantity numeric(14, 3) check (minimum_order_quantity is null or minimum_order_quantity > 0),
  order_multiple numeric(14, 3) check (order_multiple is null or order_multiple > 0),
  is_active boolean not null default true,
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (branch_id, item_id),
  foreign key (item_id, branch_id) references public.inventory_items (id, branch_id),
  constraint item_supply_target_ge_minimum check (target_stock is null or minimum_stock is null or target_stock >= minimum_stock)
  -- NOTE: order_unit/units_per_pack may be saved half-configured (business input still missing); ordering and suggestions then refuse to guess
);
comment on table public.item_supply_params is
  'Per branch item: supplier + ordering rules + stock thresholds. Units: minimum/target/safety stock and units_per_pack are in the BASE (stock) unit; minimum_order_quantity and order_multiple are in the ORDER unit (order_unit). order_unit and units_per_pack are set together or not at all. Every business value is nullable and nothing is seeded. One configuration per (branch, item) in V1. Written only by upsert_item_supply_params (audited).';
create trigger set_updated_at before update on public.item_supply_params
  for each row execute function public.set_updated_at();
create index if not exists idx_item_supply_params_supplier on public.item_supply_params (supplier_id);

-- ---------------------------------------------------------------------------
-- purchase orders
-- ---------------------------------------------------------------------------
create sequence if not exists public.purchase_order_seq;

create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  supplier_id uuid not null references public.suppliers (id),
  order_number text not null unique
    default ('PO-' || to_char((now() at time zone 'Europe/Istanbul'), 'YYYY') || '-' || lpad(nextval('public.purchase_order_seq')::text, 6, '0')),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED')),
  ordered_for_date date,
  expected_delivery_date date,
  submitted_at timestamptz,
  approved_at timestamptz,
  received_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid not null references public.profiles (id),
  approved_by uuid references public.profiles (id),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_orders_dates_ordered check (expected_delivery_date is null or ordered_for_date is null or expected_delivery_date >= ordered_for_date)
);
comment on table public.purchase_orders is
  'Purchase order header. Status moves only through transition_purchase_order / receive_purchase_order (audited, with purchase_order_status_history). RECEIVED and CANCELLED are terminal. Never deleted.';
create trigger set_updated_at before update on public.purchase_orders
  for each row execute function public.set_updated_at();
create index if not exists idx_purchase_orders_branch_status on public.purchase_orders (branch_id, status);
create index if not exists idx_purchase_orders_supplier on public.purchase_orders (supplier_id);

create table if not exists public.purchase_order_lines (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id),
  inventory_item_id uuid not null references public.inventory_items (id),
  ordered_quantity numeric(14, 3) not null check (ordered_quantity > 0),
  order_unit text,
  units_per_pack_snapshot numeric(14, 3) check (units_per_pack_snapshot is null or units_per_pack_snapshot > 0),
  -- an ESTIMATE only (never used as the ledger cost snapshot); hidden from roles without inventory.cost.read
  unit_cost_estimate_kurus bigint check (unit_cost_estimate_kurus is null or unit_cost_estimate_kurus >= 0),
  received_quantity numeric(14, 3) not null default 0 check (received_quantity >= 0),
  notes text check (notes is null or length(notes) <= 300),
  created_at timestamptz not null default now(),
  unique (purchase_order_id, inventory_item_id),
  constraint purchase_order_lines_received_le_ordered check (received_quantity <= ordered_quantity),
  -- a pack conversion is known or the line is in base units: never a half-known conversion
  constraint purchase_order_lines_conversion_known check ((order_unit is null) = (units_per_pack_snapshot is null))
);
comment on table public.purchase_order_lines is
  'Order lines. ordered_quantity/received_quantity are in the ORDER unit (base unit when order_unit is NULL); units_per_pack_snapshot = base units per order unit, frozen when the line is written. received_quantity only grows through receive_purchase_order (trusted logic, session flag), never above ordered_quantity. Lines are editable only while the order is DRAFT.';
create index if not exists idx_purchase_order_lines_item on public.purchase_order_lines (inventory_item_id);

create table if not exists public.purchase_order_status_history (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id),
  from_status text,
  to_status text not null,
  changed_by uuid references public.profiles (id),
  reason text,
  changed_at timestamptz not null default now()
);
comment on table public.purchase_order_status_history is 'Append-only status history of purchase orders (not reconstructed from updated_at).';
create index if not exists idx_po_history_order on public.purchase_order_status_history (purchase_order_id, changed_at);

-- links a purchase-order line to the EXISTING ledger RECEIPT movement it created (the ledger itself is unchanged)
create table if not exists public.purchase_order_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_orders (id),
  purchase_order_line_id uuid not null references public.purchase_order_lines (id),
  inventory_movement_id uuid not null unique references public.inventory_movements (id),
  quantity numeric(14, 3) not null check (quantity > 0),          -- ORDER unit (same unit as the line)
  base_quantity numeric(14, 3) not null check (base_quantity > 0), -- BASE unit: exactly the RECEIPT movement quantity
  received_by uuid references public.profiles (id),
  received_at timestamptz not null default now(),
  note text
);
comment on table public.purchase_order_receipts is
  'Append-only link between a purchase-order line and the RECEIPT movement of the existing inventory ledger that stocked it (quantity in order units, base_quantity = the ledger quantity). There is no second stock balance; received_quantity stays reconcilable to this table and to the ledger (a later reversal of the movement is surfaced as a reconciliation warning, never hidden).';
create index if not exists idx_po_receipts_order on public.purchase_order_receipts (purchase_order_id);

-- append-only guard for history and receipt links
create or replace function public.procurement_prevent_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only', tg_table_name using errcode = '42501';
end;
$$;
create trigger po_history_append_only before update or delete on public.purchase_order_status_history
  for each row execute function public.procurement_prevent_mutation();
create trigger po_receipts_append_only before update or delete on public.purchase_order_receipts
  for each row execute function public.procurement_prevent_mutation();

-- the one place that defines which transitions exist
create or replace function public.procurement_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
as $$
  select (p_from, p_to) in (
    ('DRAFT', 'SUBMITTED'), ('DRAFT', 'CANCELLED'),
    ('SUBMITTED', 'APPROVED'), ('SUBMITTED', 'DRAFT'), ('SUBMITTED', 'CANCELLED'),
    ('APPROVED', 'PREPARING'), ('APPROVED', 'IN_TRANSIT'), ('APPROVED', 'CANCELLED'),
    ('PREPARING', 'IN_TRANSIT'), ('PREPARING', 'CANCELLED'),
    ('IN_TRANSIT', 'CANCELLED'),
    ('APPROVED', 'PARTIALLY_RECEIVED'), ('PREPARING', 'PARTIALLY_RECEIVED'), ('IN_TRANSIT', 'PARTIALLY_RECEIVED'),
    ('APPROVED', 'RECEIVED'), ('PREPARING', 'RECEIVED'), ('IN_TRANSIT', 'RECEIVED'),
    ('PARTIALLY_RECEIVED', 'RECEIVED')
  );
$$;
comment on function public.procurement_transition_allowed(text, text) is
  'Single source of the purchase-order state machine. RECEIVED/CANCELLED have no outgoing transition. Receiving transitions are only reachable through receive_purchase_order.';

create or replace function public.procurement_guard_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'purchase orders are never deleted (cancel instead)' using errcode = '42501';
  end if;
  if old.status in ('RECEIVED', 'CANCELLED') then
    raise exception 'a % purchase order is final', old.status using errcode = '42501';
  end if;
  if new.status is distinct from old.status and not public.procurement_transition_allowed(old.status, new.status) then
    raise exception 'transition % -> % is not allowed', old.status, new.status using errcode = '42501';
  end if;
  if new.order_number is distinct from old.order_number or new.created_by is distinct from old.created_by or new.branch_id is distinct from old.branch_id then
    raise exception 'order number, creator and branch are immutable' using errcode = '42501';
  end if;
  if old.status <> 'DRAFT' and (new.supplier_id is distinct from old.supplier_id) then
    raise exception 'the supplier of a submitted order cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger purchase_orders_guard before update or delete on public.purchase_orders
  for each row execute function public.procurement_guard_order();

create or replace function public.procurement_guard_line()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
begin
  select status into v_status from public.purchase_orders
   where id = case when tg_op = 'DELETE' then old.purchase_order_id else new.purchase_order_id end;
  if tg_op in ('INSERT', 'DELETE') then
    if v_status is distinct from 'DRAFT' then
      raise exception 'order lines can only change while the order is DRAFT' using errcode = '42501';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  -- UPDATE: only received_quantity may change, and only on an order that can still receive
  if new.purchase_order_id is distinct from old.purchase_order_id or new.inventory_item_id is distinct from old.inventory_item_id
     or new.ordered_quantity is distinct from old.ordered_quantity or new.order_unit is distinct from old.order_unit
     or new.units_per_pack_snapshot is distinct from old.units_per_pack_snapshot
     or new.unit_cost_estimate_kurus is distinct from old.unit_cost_estimate_kurus or new.notes is distinct from old.notes then
    raise exception 'approved quantities cannot be rewritten; only received_quantity changes' using errcode = '42501';
  end if;
  if new.received_quantity < old.received_quantity then
    raise exception 'received_quantity can never decrease' using errcode = '42501';
  end if;
  if new.received_quantity is distinct from old.received_quantity and coalesce(current_setting('procurement.receiving', true), '') <> 'on' then
    raise exception 'received_quantity is changed only by receive_purchase_order' using errcode = '42501';
  end if;
  if v_status not in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED') then
    raise exception 'order status % cannot receive', v_status using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger purchase_order_lines_guard before insert or update or delete on public.purchase_order_lines
  for each row execute function public.procurement_guard_line();

-- ---------------------------------------------------------------------------
-- RLS: SELECT only; writes go through audited RPCs
-- ---------------------------------------------------------------------------
alter table public.suppliers enable row level security;
alter table public.item_supply_params enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.purchase_order_lines enable row level security;
alter table public.purchase_order_status_history enable row level security;
alter table public.purchase_order_receipts enable row level security;

revoke all on public.suppliers, public.item_supply_params, public.purchase_orders, public.purchase_order_lines,
  public.purchase_order_status_history, public.purchase_order_receipts from anon, authenticated;
grant select on public.suppliers, public.item_supply_params, public.purchase_orders,
  public.purchase_order_status_history, public.purchase_order_receipts to authenticated;
-- the cost estimate is not selectable directly (get_purchase_order returns it to cost.read holders)
grant select (id, purchase_order_id, inventory_item_id, ordered_quantity, order_unit, units_per_pack_snapshot, received_quantity, notes, created_at)
  on public.purchase_order_lines to authenticated;

create policy suppliers_select on public.suppliers
  for select to authenticated using (public.current_user_has_permission('procurement.supplier.read'));
create policy item_supply_params_select on public.item_supply_params
  for select to authenticated using (public.current_user_can_inventory('procurement.order.read', branch_id));
create policy purchase_orders_select on public.purchase_orders
  for select to authenticated using (public.current_user_can_inventory('procurement.order.read', branch_id));
create policy purchase_order_lines_select on public.purchase_order_lines
  for select to authenticated using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id));
create policy po_history_select on public.purchase_order_status_history
  for select to authenticated using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id));
create policy po_receipts_select on public.purchase_order_receipts
  for select to authenticated using (exists (select 1 from public.purchase_orders po where po.id = purchase_order_id));
