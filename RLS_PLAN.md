# RLS Plan (Phase C — design, not yet live)

Status: **design only**. The policies below for identity/authorization
tables are written as SQL in `supabase/migrations/006_rls_policies.sql`,
**not applied**. The policies for future operational tables (shifts,
sales_reports, etc.) are design/templates only — those tables don't exist
yet (Phase D), so there is no migration file for them yet.

**Legacy tables are not touched by any of this.** `admins`, `cashiers`,
`daily_reports`, `daily_revenue`, `entry_history`, `shift_schedule`,
`targets` keep their current (public) policies until cutover — see
"Legacy transition" below.

## Confirmed current production state (audited 2026-09-17)

| Table | Current policy |
|---|---|
| `admins` | public SELECT |
| `cashiers` | public SELECT, UPDATE |
| `daily_reports` | public SELECT, INSERT, UPDATE, DELETE |
| `daily_revenue` | public ALL |
| `entry_history` | public SELECT, INSERT |
| `shift_schedule` | public ALL |
| `targets` | public ALL |
| `avatars` storage bucket | public; anon SELECT and INSERT |

RLS is *enabled* on these tables, but the policies grant effectively
unauthenticated (anon-role) access to everything. This is the baseline V4
must not inherit for its own tables, and must not touch for legacy's.

## Principles (per the brief)

| Role | Access |
|---|---|
| `owner` | Full organization access, unrestricted by branch. |
| `manager` | Management access within the organization, not branch-restricted. |
| `branch_manager` | Management access, restricted to assigned branches only. |
| `cashier` / `employee` | Own profile; assigned branch(es); own/allowed shifts; own operational submissions. |
| `viewer` | Read-only, permitted reports only. |

No table holding operational data grants public/anon access in the new
schema. Every policy uses `auth.uid()` plus the membership/role tables —
never a client-supplied id, never a URL parameter.

## Helper functions (`supabase/migrations/005_auth_helpers.sql`)

All `SECURITY DEFINER`, all operate only on `auth.uid()` (no target-user
parameter, so they can't be used to probe another user's data), granted to
`authenticated` only:

- `current_user_role_keys()` — this user's role keys.
- `current_user_has_permission(key)` — permission check via role_permissions.
- `current_user_branch_ids()` — this user's branch memberships.
- `current_user_is_owner_or_manager()` — org-wide bypass check.
- `write_audit_log(...)` — the only path by which `audit_logs` gets a row.

## Identity/authorization tables (applied policies — `006_rls_policies.sql`)

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `profiles` | self, or owner/manager, or `employee.read` | UPDATE: self (limited) or `employee.manage`. No client INSERT (a trigger creates the row on signup) or DELETE (deactivate via `is_active`, never delete). |
| `roles` / `permissions` / `role_permissions` | any `authenticated` user | none (migration-managed only in this phase) |
| `user_roles` | self, or owner/manager, or `employee.manage` | ALL for `employee.manage` — a safety net; the Management Center UI must use an audited RPC instead (role change is a critical action). |
| `branches` | any `authenticated` user | ALL for `branch.manage` |
| `branch_memberships` | self, or owner/manager, or a fellow member of the same branch (via `current_user_branch_ids()`) | ALL for `branch.manage` |
| `audit_logs` | owner/manager or `reports.read` | none — rows are written exclusively via `write_audit_log()`, never updated/deleted by anyone through the client API |
| `pin_credentials` | nobody (RLS enabled, zero policies) | nobody — only `verify_pin()` (SECURITY DEFINER, `service_role`-only execute) touches this table |

## Future operational tables (Phase D — design template, not yet a migration)

These tables don't exist yet. When Phase D creates them, their RLS should
follow this shape (to become `0XX_operational_rls.sql` at that time):

- **`shifts` / `shift_assignments`**: SELECT for org-wide roles, or branch
  members (`branch_id in (select current_user_branch_ids())`), or the
  assigned employee themselves. INSERT/UPDATE for `shift.manage` or the
  branch's `branch_manager`.
- **`sales_reports` / `sales_report_items`**: SELECT scoped like shifts.
  INSERT requires `sales.create` and the submitter must be the authenticated
  user (`submitted_by = auth.uid()`). UPDATE requires either
  `sales.edit_own` + `submitted_by = auth.uid()`, or `sales.edit_all`. No
  client DELETE — corrections happen via an audited edit RPC that preserves
  history (mirrors the legacy `-5 point penalty on edit` intent, but as an
  explicit audit trail instead of a silent point deduction).
- **`tasks` / `task_assignments` / `task_completions`**: SELECT/write scoped
  to the assignee or `task.manage`-equivalent permission + branch scope.
- **`performance_events`**: INSERT only via a `SECURITY DEFINER` RPC (never
  raw client insert — these are the raw facts scores are computed from and
  must not be forgeable). SELECT: self, or `performance.manage`, or
  owner/manager.
- **`performance_scores`**: read-only to clients (derived/recalculable, per
  `domain/scoring`); written only by a recompute RPC.
- **`badge_definitions`**: SELECT any authenticated user; write requires
  `badge.manage`.
- **`employee_badges`**: SELECT self or `badge.manage`/owner/manager; INSERT
  for automatic badges via RPC, manual badges require `badge.manage` and
  should be audited.
- **`inventory_items` / `stock_movements` / `waste_records` /
  `product_costs`** (İskele Dondurma): SELECT/write scoped to
  `iskele_dondurma` branch membership + relevant permission; no cross-branch
  visibility for branch-scoped roles.

## Storage (`supabase/migrations/007_storage_policies.sql`)

New bucket `avatars-v4` (the existing `avatars` bucket is untouched — see
that migration's header for why a new bucket rather than tightening the
live one in place). Public read (avatars aren't sensitive); INSERT/UPDATE/
DELETE require `auth.uid()` to match the object's folder, or
`employee.manage` for a manager override. MIME type (jpeg/png/webp) and
2 MiB size limit enforced at the bucket level.

## Legacy transition

- Legacy tables' policies are **not modified** by this phase or by Phase D.
  They stay public until an explicit, separately-approved cutover step.
- V4 reads/writes only the new tables throughout Phase C-K.
- Both systems may run concurrently — a manager could, in principle, be
  looking at the legacy admin dashboard and the new V4 reports at the same
  time during validation.
- Legacy tables become read-only/archive only as a deliberate Phase L step,
  not automatically and not as a side effect of any migration in this plan.

## Policy test plan (for future DB integration tests)

No integration tests exist yet — these migrations aren't applied, so there
is nothing to test against. Once 001-007 are applied to a staging project,
the following should become real tests (e.g. via `pgTAP` or a Supabase-CLI
seeded test project), one per row below at minimum:

| # | Scenario | Expected |
|---|---|---|
| 1 | Anon selects `profiles` | 0 rows (RLS denies; no policy matches unauthenticated) |
| 2 | Cashier A selects own `profiles` row | 1 row |
| 3 | Cashier A selects Cashier B's `profiles` row | 0 rows |
| 4 | Owner selects any `profiles` row | 1 row |
| 5 | Branch manager of Branch X selects a `branch_memberships` row for Branch Y | 0 rows |
| 6 | Cashier attempts UPDATE on `user_roles` (self-promote) | denied (no `employee.manage` permission) |
| 7 | Manager attempts UPDATE on `user_roles` | allowed (has `employee.manage`) |
| 8 | Any authenticated role selects `pin_credentials` | 0 rows / permission denied |
| 9 | `service_role` calls `verify_pin` with correct PIN | returns `true`, resets `failed_attempts` |
| 10 | `service_role` calls `verify_pin` 5x with wrong PIN | 5th call sets `locked_until`, writes an `audit_logs` row with action `pin_lockout` |
| 11 | Authenticated user calls `verify_pin` directly via RPC | permission denied (not granted to `authenticated`) |
| 12 | Anon uploads to `avatars-v4` outside their own folder | denied |
| 13 | Authenticated user uploads to `avatars-v4/{own-uid}/...` | allowed |
| 14 | Authenticated user uploads to `avatars-v4/{other-uid}/...` without `employee.manage` | denied |
| 15 | Any client attempts INSERT into `audit_logs` directly (not via RPC) | denied (no insert policy) |
