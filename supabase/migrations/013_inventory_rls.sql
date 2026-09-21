-- =============================================================================
-- 013_inventory_rls.sql
-- =============================================================================
-- STATUS: PREPARED ONLY (Phase E). Not applied to any hosted Supabase project.
--
-- Purpose:
--   Access control for the inventory tables, following the exact pattern of
--   006/010: no anonymous access, SELECT-only policies, and NO client write
--   path of any kind — every mutation goes through an audited SECURITY
--   DEFINER RPC (014). Privileges are revoked at the table level as well, so
--   a missing/incorrect policy can never accidentally re-open a write path.
--
--   Cost confidentiality (two layers):
--     * inventory_item_costs rows: RLS requires inventory.cost.read.
--     * inventory_movements.unit_cost_snapshot: a per-movement copy of cost.
--       RLS is row-level and cannot hide one column, so the column is
--       excluded from the authenticated role's column-level SELECT grant
--       (same technique 006 uses for profiles). Consequence: clients must
--       list columns explicitly (no select=*) — services/supabase/inventory.ts
--       does. Cost/gross profit is only readable through
--       get_inventory_gross_profit() (014), which checks inventory.cost.read.
--
-- Depends on: 001-005 (helpers), 009 (shifts), 012 (tables).
-- Required by: 014_inventory_rpcs.sql (uses current_user_can_inventory).
--
-- Rollback:
--   drop policy ... on each table below; alter table ... disable row level
--   security; grant all on the four tables + inventory_movements to
--   authenticated; drop function public.inventory_item_branch_id(uuid);
--   drop function public.current_user_can_inventory(text, uuid);
--   (only as part of a full rollback of 012-014 together).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- The single implementation of "may the caller do <inventory permission> in
-- <branch>": holds the permission AND is org-wide (owner/manager) or a member
-- of that branch. Used by every policy below and by every 014 RPC, so the
-- branch-scoping rule cannot be forgotten in one place and present in
-- another. branch_manager therefore never gains cross-branch access merely
-- by holding an inventory.* permission.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_can_inventory(p_permission_key text, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_has_permission(p_permission_key)
    and (
      public.current_user_is_owner_or_manager()
      or p_branch_id in (select public.current_user_branch_ids())
    );
$$;

comment on function public.current_user_can_inventory(text, uuid) is
  'Permission + branch scope in one check: caller holds p_permission_key AND is owner/manager or a member of p_branch_id. Returns only a boolean.';

revoke all on function public.current_user_can_inventory(text, uuid) from public, anon;
grant execute on function public.current_user_can_inventory(text, uuid) to authenticated;


-- Branch of an item, bypassing inventory_items' own RLS, so inventory_item_costs'
-- policy can scope by branch without a recursive policy chain (same class of
-- fix as 010's shift_branch_id).
create or replace function public.inventory_item_branch_id(p_item_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.inventory_items where id = p_item_id;
$$;

comment on function public.inventory_item_branch_id(uuid) is
  'branch_id of an inventory item, bypassing RLS. Returns a branch id only (never cost/stock data).';

revoke all on function public.inventory_item_branch_id(uuid) from public, anon;
grant execute on function public.inventory_item_branch_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Privileges: nothing writable by clients, anywhere.
-- ---------------------------------------------------------------------------
revoke all on public.inventory_items from anon, authenticated;
revoke all on public.inventory_item_costs from anon, authenticated;
revoke all on public.inventory_movements from anon, authenticated;
revoke all on public.inventory_counts from anon, authenticated;
revoke all on public.inventory_count_items from anon, authenticated;

grant select on public.inventory_items to authenticated;
grant select on public.inventory_item_costs to authenticated;
grant select on public.inventory_counts to authenticated;
grant select on public.inventory_count_items to authenticated;

-- Every inventory_movements column EXCEPT unit_cost_snapshot.
grant select (
  id, branch_id, inventory_item_id, movement_type, quantity, stock_delta,
  shift_id, sales_report_id, inventory_count_id, reverses_movement_id,
  reason_code, reason, reference, occurred_at, created_by, created_at
) on public.inventory_movements to authenticated;

revoke all on public.inventory_stock_balances from anon, authenticated;
revoke all on public.inventory_last_counts from anon, authenticated;
grant select on public.inventory_stock_balances to authenticated;
grant select on public.inventory_last_counts to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security. SELECT policies only; the absence of INSERT/UPDATE/
-- DELETE policies (plus the revoked privileges above) is deliberate.
-- ---------------------------------------------------------------------------
alter table public.inventory_items enable row level security;
alter table public.inventory_item_costs enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_items enable row level security;

create policy inventory_items_select_scoped on public.inventory_items
  for select
  using (public.current_user_can_inventory('inventory.read', branch_id));

create policy inventory_item_costs_select_cost_readers on public.inventory_item_costs
  for select
  using (
    public.current_user_can_inventory(
      'inventory.cost.read',
      public.inventory_item_branch_id(inventory_item_id)
    )
  );

create policy inventory_movements_select_scoped on public.inventory_movements
  for select
  using (public.current_user_can_inventory('inventory.read', branch_id));

create policy inventory_counts_select_scoped on public.inventory_counts
  for select
  using (public.current_user_can_inventory('inventory.read', branch_id));

create policy inventory_count_items_select_scoped on public.inventory_count_items
  for select
  using (
    public.current_user_can_inventory(
      'inventory.read',
      public.inventory_item_branch_id(inventory_item_id)
    )
  );

-- No INSERT/UPDATE/DELETE policy on any table above. Mutations:
--   items                 upsert_inventory_item / set_inventory_item_active
--   item costs            set_inventory_item_cost (and receipt with a cost)
--   movements             record_inventory_receipt / _waste / _adjustment,
--                         reverse_inventory_movement, and the SALE/REVERSAL
--                         rows written by create/edit/cancel_sales_report
--   counts/count items    submit_inventory_count / void_inventory_count
