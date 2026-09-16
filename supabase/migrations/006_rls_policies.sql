-- =============================================================================
-- 006_rls_policies.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md and
-- RLS_PLAN.md for the full role/table matrix and rationale.
--
-- Purpose:
--   Enable and define RLS for every table created in 001-004. This migration
--   covers ONLY the new identity/authorization tables. It does NOT touch any
--   legacy table (admins, cashiers, daily_reports, daily_revenue,
--   entry_history, shift_schedule, targets) and does NOT touch the
--   not-yet-created Phase D operational tables (shifts, sales_reports,
--   tasks, performance_*, badge_*, inventory_*) — those get their own RLS
--   migration when Phase D creates them; see RLS_PLAN.md "Future operational
--   tables" for the design those policies will follow.
--
-- Depends on: 001, 002, 003, 004, 005 (auth_helpers functions).
--
-- Rollback:
--   alter table public.profiles disable row level security;
--   (repeat per table, then) drop policy <name> on <table>; for every policy
--   created below. Disabling RLS on a table with no policies makes it fully
--   readable/writable by anon+authenticated again — only do this as part of
--   a full rollback of 001-006 together, never on its own.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_self_or_privileged on public.profiles
  for select
  using (
    id = auth.uid()
    or public.current_user_is_owner_or_manager()
    or public.current_user_has_permission('employee.read')
  );

create policy profiles_update_self_limited on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_privileged on public.profiles
  for update
  using (public.current_user_has_permission('employee.manage'))
  with check (public.current_user_has_permission('employee.manage'));

-- No INSERT policy: profile rows are created by a trigger on auth.users
-- (SECURITY DEFINER, added alongside the Phase C data-migration script, not
-- in this file) — never by direct client insert.
-- No DELETE policy: profiles are deactivated (is_active = false), never
-- deleted, to preserve historical joins.

-- ---------------------------------------------------------------------------
-- roles / permissions / role_permissions — read-only reference data
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

create policy roles_select_authenticated on public.roles
  for select using (auth.role() = 'authenticated');

create policy permissions_select_authenticated on public.permissions
  for select using (auth.role() = 'authenticated');

create policy role_permissions_select_authenticated on public.role_permissions
  for select using (auth.role() = 'authenticated');

-- No insert/update/delete policies on any of the three: managed by
-- migration only in this phase (see BACKLOG.md for a future admin UI over
-- these, which would go through an audited RPC, not raw table writes).

-- ---------------------------------------------------------------------------
-- user_roles
-- ---------------------------------------------------------------------------
alter table public.user_roles enable row level security;

create policy user_roles_select_self_or_privileged on public.user_roles
  for select
  using (
    user_id = auth.uid()
    or public.current_user_is_owner_or_manager()
    or public.current_user_has_permission('employee.manage')
  );

create policy user_roles_write_privileged on public.user_roles
  for all
  using (public.current_user_has_permission('employee.manage'))
  with check (public.current_user_has_permission('employee.manage'));

-- Role changes are a "critical action" per the brief — the RECOMMENDED path
-- is an audited RPC (assign_role(...)/revoke_role(...), added alongside the
-- Phase D admin features) that calls write_audit_log() internally, not a
-- raw table write from the client. This policy permits the raw write as a
-- safety net so authorization isn't blocked on that RPC existing, but the
-- Management Center UI (Phase H) must use the RPC path once it exists.

-- ---------------------------------------------------------------------------
-- branches
-- ---------------------------------------------------------------------------
alter table public.branches enable row level security;

create policy branches_select_authenticated on public.branches
  for select using (auth.role() = 'authenticated');

create policy branches_write_owner on public.branches
  for all
  using (public.current_user_has_permission('branch.manage'))
  with check (public.current_user_has_permission('branch.manage'));

-- ---------------------------------------------------------------------------
-- branch_memberships
-- ---------------------------------------------------------------------------
alter table public.branch_memberships enable row level security;

create policy branch_memberships_select_self_or_privileged on public.branch_memberships
  for select
  using (
    user_id = auth.uid()
    or public.current_user_is_owner_or_manager()
    or branch_id in (select public.current_user_branch_ids()) -- a branch_manager can see co-members of their own branch
  );

create policy branch_memberships_write_privileged on public.branch_memberships
  for all
  using (public.current_user_has_permission('branch.manage'))
  with check (public.current_user_has_permission('branch.manage'));

-- ---------------------------------------------------------------------------
-- audit_logs — append-only, read restricted
-- ---------------------------------------------------------------------------
alter table public.audit_logs enable row level security;

create policy audit_logs_select_privileged on public.audit_logs
  for select
  using (
    public.current_user_is_owner_or_manager()
    or public.current_user_has_permission('reports.read')
  );

-- No insert/update/delete policy for anon/authenticated: rows are written
-- exclusively via write_audit_log() (SECURITY DEFINER, 005), and are never
-- updated or deleted by anyone through this API.

-- ---------------------------------------------------------------------------
-- pin_credentials — completely inaccessible to clients
-- ---------------------------------------------------------------------------
-- RLS was already enabled in 005_auth_helpers.sql. Deliberately no policies
-- are added here: with RLS enabled and zero policies, PostgREST denies
-- every operation (select/insert/update/delete) to both anon and
-- authenticated. The only access path is verify_pin() (SECURITY DEFINER,
-- 005), executable only by service_role, called only from the pin-login
-- Edge Function. This is intentionally restated here (not just in 005) so
-- it is visible in the same file as every other table's access rules.
