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
--   created below. Also revoke/re-grant: `grant update on public.profiles to
--   authenticated;` to undo the column-level restriction below.
--   Disabling RLS on a table with no policies makes it fully
--   readable/writable by anon+authenticated again — only do this as part of
--   a full rollback of 001-006 together, never on its own.
--
-- Amended 2026-09-17 (security review): profiles self-update is now
-- column-restricted (not just row-restricted); a branch-scoped profiles
-- update policy was added for 'employee.manage_branch'; the raw
-- user_roles/branch_memberships write policies were removed in favor of the
-- audited RPCs in 008_admin_rpcs.sql (required by this migration from now
-- on, not just the reverse). Still not applied anywhere, so amending in
-- place is safe.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Security review (2026-09-17), finding #1: the original
-- `profiles_update_self_limited` policy was `using (id = auth.uid())` with
-- NO column restriction — a normal user could UPDATE any column on their
-- own row, including `is_active`, `employee_code`, `legacy_cashier_id`.
-- Postgres RLS policies are row-scoped only; they cannot restrict which
-- columns a role may write. The fix uses Postgres COLUMN-LEVEL PRIVILEGES
-- (a separate mechanism from RLS) to restrict `authenticated`'s raw UPDATE
-- to exactly the three self-editable fields, for every row RLS lets them
-- reach (self, or a privileged/branch-scoped row below). `is_active`,
-- `employee_code`, and `legacy_cashier_id` are excluded from this grant
-- entirely — the only way to change them is a SECURITY DEFINER RPC in
-- 008_admin_rpcs.sql, which runs as the function owner and so bypasses this
-- grant regardless of the caller's own privileges.
alter table public.profiles enable row level security;

revoke update on public.profiles from authenticated;
grant update (full_name, phone, avatar_url) on public.profiles to authenticated;

create policy profiles_select_self_or_privileged on public.profiles
  for select
  using (
    id = auth.uid()
    or public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('employee.manage_branch')
      and public.current_user_shares_branch_with(id)
    )
  );

create policy profiles_update_self on public.profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_update_privileged on public.profiles
  for update
  using (public.current_user_has_permission('employee.manage'))
  with check (public.current_user_has_permission('employee.manage'));

-- Security review (2026-09-17), finding #2: branch_manager no longer holds
-- 'employee.manage' (see 002) — this branch-scoped policy is its
-- replacement, gated on BOTH the permission and an actual shared branch
-- membership with the target row, closing the org-wide-access bug.
create policy profiles_update_branch_scoped on public.profiles
  for update
  using (
    public.current_user_has_permission('employee.manage_branch')
    and public.current_user_shares_branch_with(id)
  )
  with check (
    public.current_user_has_permission('employee.manage_branch')
    and public.current_user_shares_branch_with(id)
  );

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
    or (
      public.current_user_has_permission('employee.manage_branch')
      and public.current_user_shares_branch_with(user_id)
    )
  );

-- Security review (2026-09-17), finding #3: role assignment/revocation is a
-- "critical action" and must NOT be a raw table write, even for privileged
-- roles — a permission-gated `for all` policy has no way to enforce the role
-- hierarchy (a manager must not be able to grant 'owner'; a branch_manager
-- must not grant any role outside their own branch). Removed entirely. The
-- ONLY way to write this table now is assign_role()/revoke_role() in
-- 008_admin_rpcs.sql, which enforce the hierarchy and write an audit_logs
-- row on every change. No INSERT/UPDATE/DELETE policy is defined here on
-- purpose — RLS denies all direct client writes, and the RPCs are
-- SECURITY DEFINER so they bypass RLS regardless.

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

-- Security review (2026-09-17), finding #3: branch assignment/removal is a
-- "critical action" per AUTH_ARCHITECTURE.md's audited-actions list. Removed
-- the raw `branch.manage`-gated write policy that was here; the only path
-- now is assign_branch_membership()/remove_branch_membership() in
-- 008_admin_rpcs.sql (SECURITY DEFINER, audit-logged, and — unlike a table
-- policy — able to also allow a branch_manager to add/remove members of
-- their OWN branch specifically, which a single permission-gated policy on
-- this table could not express without also exposing other branches).

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
