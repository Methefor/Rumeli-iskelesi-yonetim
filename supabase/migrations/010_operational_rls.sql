-- =============================================================================
-- 010_operational_rls.sql
-- =============================================================================
-- STATUS: NOT APPLIED to production. Prepared for review, applied only to
-- local staging so far — see MIGRATION_PLAN.md and RLS_PLAN.md.
--
-- Purpose:
--   RLS for every table in 009_operational_core.sql, following the exact
--   pattern 006_rls_policies.sql established: helper-function checks, no
--   anonymous access anywhere, and critical writes routed through audited
--   RPCs (011) rather than permission-gated raw table policies — see
--   DECISIONS.md "Phase D inherits the RPC-only rule for critical writes"
--   for why this generalizes the Phase C security-review fix rather than
--   re-introducing the pattern it replaced.
--
-- Depends on: 001-005 (helpers), 009 (tables).
-- Required by: 011_operational_rpcs.sql (some RPCs re-check these same
--   conditions in-function since SECURITY DEFINER bypasses RLS).
--
-- Rollback: disable RLS and drop every policy created below, in reverse
--   order, exactly as 006's rollback note describes — see that file.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- shift_definitions / registers / sales_categories / sales_category_branches
-- / reconciliation_thresholds — reference/config data. Read: any
-- authenticated user (needed to render forms). Write: settings.manage
-- (org-wide only) for the branch-agnostic catalogs; shift.manage
-- (org-wide OR branch-scoped) for the branch-scoped ones.
-- ---------------------------------------------------------------------------
alter table public.shift_definitions enable row level security;
alter table public.registers enable row level security;
alter table public.sales_categories enable row level security;
alter table public.sales_category_branches enable row level security;
alter table public.reconciliation_thresholds enable row level security;

create policy shift_definitions_select_authenticated on public.shift_definitions
  for select using (auth.role() = 'authenticated');

create policy shift_definitions_write_scoped on public.shift_definitions
  for all
  using (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and branch_id in (select public.current_user_branch_ids()))
  )
  with check (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and branch_id in (select public.current_user_branch_ids()))
  );

create policy registers_select_authenticated on public.registers
  for select using (auth.role() = 'authenticated');

create policy registers_write_scoped on public.registers
  for all
  using (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and branch_id in (select public.current_user_branch_ids()))
  )
  with check (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and branch_id in (select public.current_user_branch_ids()))
  );

create policy sales_categories_select_authenticated on public.sales_categories
  for select using (auth.role() = 'authenticated');

create policy sales_categories_write_privileged on public.sales_categories
  for all
  using (public.current_user_has_permission('settings.manage'))
  with check (public.current_user_has_permission('settings.manage'));

create policy sales_category_branches_select_authenticated on public.sales_category_branches
  for select using (auth.role() = 'authenticated');

create policy sales_category_branches_write_privileged on public.sales_category_branches
  for all
  using (public.current_user_has_permission('settings.manage'))
  with check (public.current_user_has_permission('settings.manage'));

create policy reconciliation_thresholds_select_authenticated on public.reconciliation_thresholds
  for select using (auth.role() = 'authenticated');

create policy reconciliation_thresholds_write_privileged on public.reconciliation_thresholds
  for all
  using (public.current_user_has_permission('settings.manage'))
  with check (public.current_user_has_permission('settings.manage'));

-- ---------------------------------------------------------------------------
-- Cross-table RLS helpers. `shifts`' policy needs to check
-- `shift_assignments`, and `shift_assignments`' policy needs to check
-- `shifts` — a direct subquery in either policy body re-enters the OTHER
-- table's RLS, which re-enters this one, which Postgres detects as
-- infinite recursion (42P17) rather than looping forever. SECURITY DEFINER
-- functions (the same fix Phase C's current_user_branch_ids() etc. already
-- established) run as the function owner and so bypass RLS on their own
-- internal query, breaking the cycle. This was found only by an actual
-- browser smoke test against local Supabase — a static review of the SQL
-- cannot see this class of bug, since each policy is syntactically valid
-- and only recurses once both are combined at query time.
-- ---------------------------------------------------------------------------
create or replace function public.current_user_assigned_shift_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select shift_id from public.shift_assignments where user_id = auth.uid();
$$;

comment on function public.current_user_assigned_shift_ids() is
  'Shift ids the calling user is assigned to. SECURITY DEFINER to avoid shifts<->shift_assignments RLS recursion — see the comment above.';

revoke all on function public.current_user_assigned_shift_ids() from public;
grant execute on function public.current_user_assigned_shift_ids() to authenticated;


create or replace function public.shift_branch_id(p_shift_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.shifts where id = p_shift_id;
$$;

comment on function public.shift_branch_id(uuid) is
  'branch_id for a shift, bypassing shifts'' own RLS. Used by shift_assignments'' policy to avoid the same recursion class.';

revoke all on function public.shift_branch_id(uuid) from public;
grant execute on function public.shift_branch_id(uuid) to authenticated;


-- ---------------------------------------------------------------------------
-- shifts — visible to org-wide roles, branch members (any role) of that
-- branch, or an employee assigned to it. Writes are RPC-only for the
-- lifecycle-critical paths (assign/cancel/branch-reassign — see 011); a
-- direct client write policy is intentionally NOT provided for status
-- transitions, only for the initial "create the shift row" case, itself
-- also gated the same way create_sales_report's shift resolution is.
-- ---------------------------------------------------------------------------
alter table public.shifts enable row level security;

create policy shifts_select_scoped on public.shifts
  for select
  using (
    public.current_user_is_owner_or_manager()
    or branch_id in (select public.current_user_branch_ids())
    or id in (select public.current_user_assigned_shift_ids())
  );

-- No insert/update/delete policy: shifts are created and transitioned only
-- via schedule_shift()/cancel_shift()/reassign_shift_branch() (011),
-- SECURITY DEFINER, so they bypass RLS and enforce the branch/permission
-- checks in-function instead of here — see 011 header for why (the same
-- reasoning as 006's removal of the raw user_roles/branch_memberships
-- write policies: a permission-gated table policy cannot express "and
-- write an audit_logs row", which every one of these actions requires).

-- ---------------------------------------------------------------------------
-- shift_assignments
-- ---------------------------------------------------------------------------
alter table public.shift_assignments enable row level security;

create policy shift_assignments_select_scoped on public.shift_assignments
  for select
  using (
    user_id = auth.uid()
    or public.current_user_is_owner_or_manager()
    or public.shift_branch_id(shift_id) in (select public.current_user_branch_ids())
  );

-- No insert/update/delete policy: assign_shift()/update_shift_assignment_status()/
-- override_shift_lateness() (011) are the only path — role assignment-shaped
-- actions follow the same "critical write = RPC only" rule as Phase C's
-- user_roles/branch_memberships.

-- ---------------------------------------------------------------------------
-- sales_reports — select scoped like shifts; writes are RPC-only
-- (create_sales_report/edit_sales_report/cancel_sales_report/
-- override_reconciliation, 011) because every one of them is a "critical
-- action" per the Phase D brief's audit list.
-- ---------------------------------------------------------------------------
alter table public.sales_reports enable row level security;

create policy sales_reports_select_scoped on public.sales_reports
  for select
  using (
    submitted_by = auth.uid()
    or public.current_user_is_owner_or_manager()
    or branch_id in (select public.current_user_branch_ids())
    or public.current_user_has_permission('reports.read')
  );

-- ---------------------------------------------------------------------------
-- sales_report_items — follows its parent report's visibility exactly.
-- Writes are RPC-only (always written atomically with the parent report).
-- ---------------------------------------------------------------------------
alter table public.sales_report_items enable row level security;

create policy sales_report_items_select_scoped on public.sales_report_items
  for select
  using (
    sales_report_id in (
      select id from public.sales_reports
      where submitted_by = auth.uid()
        or public.current_user_is_owner_or_manager()
        or branch_id in (select public.current_user_branch_ids())
        or public.current_user_has_permission('reports.read')
    )
  );

-- ---------------------------------------------------------------------------
-- sales_report_overrides — visible alongside the report; write is
-- override_reconciliation() (011) only, matching audit_logs' own
-- "no client insert" rule (004/006).
-- ---------------------------------------------------------------------------
alter table public.sales_report_overrides enable row level security;

create policy sales_report_overrides_select_scoped on public.sales_report_overrides
  for select
  using (
    sales_report_id in (
      select id from public.sales_reports
      where submitted_by = auth.uid()
        or public.current_user_is_owner_or_manager()
        or branch_id in (select public.current_user_branch_ids())
        or public.current_user_has_permission('reports.read')
    )
  );
