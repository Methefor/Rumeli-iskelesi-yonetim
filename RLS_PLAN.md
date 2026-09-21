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
- `current_user_shares_branch_with(p_user_id)` — added 2026-09-17 security
  review: whether the caller shares any branch membership with a target
  user. Returns a boolean only, never branch identities.
- `write_audit_log(...)` — the only path by which `audit_logs` gets a row.

Added in Phase D (`010_operational_rls.sql`), same pattern:

- `current_user_assigned_shift_ids()` — shift ids the caller is assigned to.
- `shift_branch_id(p_shift_id)` — a shift's branch_id, bypassing `shifts`' RLS.
  Both exist specifically to break the `shifts`↔`shift_assignments` RLS
  recursion described below — not general-purpose helpers.

## Identity/authorization tables (applied policies — `006_rls_policies.sql`, amended 2026-09-17)

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `profiles` | self, or owner/manager, or `employee.manage_branch` **and** a shared branch with the target row | UPDATE only, column-restricted via GRANT to `full_name`/`phone`/`avatar_url` (see below): self, or `employee.manage` (org-wide), or `employee.manage_branch` **and** a shared branch. `is_active`/`employee_code` are excluded from the grant — only `008`'s RPCs can change them. No client INSERT (a trigger creates the row on signup) or DELETE. |
| `roles` / `permissions` / `role_permissions` | any `authenticated` user | none (migration-managed only in this phase) |
| `user_roles` | self, or owner/manager, or `employee.manage_branch` **and** a shared branch | none — `assign_role()`/`revoke_role()` (`008_admin_rpcs.sql`) are the only path; they enforce the role hierarchy (manager can't grant owner; branch_manager can't grant owner/manager/branch_manager and only within a shared branch) and always write an audit row. |
| `branches` | any `authenticated` user | ALL for `branch.manage` |
| `branch_memberships` | self, or owner/manager, or a fellow member of the same branch (via `current_user_branch_ids()`) | none — `assign_branch_membership()`/`remove_branch_membership()` (`008`) are the only path. |
| `audit_logs` | owner/manager or `reports.read` | none — rows are written exclusively via `write_audit_log()`, never updated/deleted by anyone through the client API |
| `pin_credentials` | nobody (RLS enabled, zero policies) | nobody — only `verify_pin()` (SECURITY DEFINER, `service_role`-only execute) and `admin_reset_pin()` (`008`) touch this table |

**Column-level grant on `profiles` (security review fix, not expressible via
RLS alone):** `revoke update on public.profiles from authenticated; grant
update (full_name, phone, avatar_url) on public.profiles to authenticated;`.
RLS policies above still control *which rows* are reachable; this grant
controls *which columns* — Postgres RLS has no per-column concept, so a raw
`using (id = auth.uid())` policy alone would have let a user rewrite their
own `is_active`. See `DECISIONS.md`.

## Operational tables (Phase D, 2026-09-17 — applied policies, `010_operational_rls.sql`)

Built and local-staging-validated — see `CORE_DATA_MODEL.md`. All tables
below use the exact `current_user_is_owner_or_manager()`/
`current_user_has_permission()`/`current_user_branch_ids()` helpers from
Phase C; no anonymous access anywhere.

| Table | SELECT | INSERT/UPDATE/DELETE |
|---|---|---|
| `shift_definitions` / `registers` | any `authenticated` user | `shift.manage`, org-wide or branch-scoped |
| `sales_categories` / `sales_category_branches` / `reconciliation_thresholds` | any `authenticated` user | `settings.manage`, org-wide only |
| `shifts` | org-wide roles, branch members, or the assigned employee (via `current_user_assigned_shift_ids()`) | none — `schedule_shift`/`cancel_shift`/`reassign_shift_branch` (011) only |
| `shift_assignments` | self, org-wide roles, or the shift's branch members (via `shift_branch_id()`) | none — `assign_shift`/`update_shift_assignment_status`/`override_shift_lateness` (011) only |
| `sales_reports` / `sales_report_items` | submitter, org-wide roles, branch members, or `reports.read` | none — `create_sales_report`/`edit_sales_report`/`cancel_sales_report` (011) only |
| `sales_report_overrides` | follows its parent report's visibility | none — `override_reconciliation` (011) only |

**Cross-table RLS recursion (found by a live smoke test, not static
review):** `shifts`' and `shift_assignments`' policies each need to check
the other table. A direct subquery in either re-enters the other's RLS,
which re-enters this one — Postgres reports this as `42P17` infinite
recursion, not an infinite loop. Fixed with two more `SECURITY DEFINER`
helpers, `current_user_assigned_shift_ids()` and `shift_branch_id(uuid)`,
which bypass RLS on their own internal query — same mechanism as
`current_user_branch_ids()` in Phase C. See `DECISIONS.md`.

## Future operational tables (still design template, not yet a migration)

`shifts`/`shift_assignments`/`sales_reports`/`sales_report_items` above are
now built — this section is only what Phase D deliberately deferred:

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
| 6 | Cashier attempts raw UPDATE on `user_roles` (self-promote) | denied (no policy permits any client write) |
| 7 | Manager calls `assign_role(user, 'owner')` | denied (`42501` — manager may not grant owner) |
| 7a | Manager calls `assign_role(user, 'cashier')` | allowed; `user_roles` row inserted, `audit_logs` row with `action = 'role_change'` written |
| 7b | Branch manager of Branch X calls `assign_role(userInBranchY, 'cashier')` | denied (`42501` — no shared branch) |
| 7c | Branch manager calls `assign_role(userInOwnBranch, 'branch_manager')` | denied (`42501` — branch_manager may not grant branch_manager) |
| 8 | Any authenticated role selects `pin_credentials` | 0 rows / permission denied |
| 9 | `service_role` calls `verify_pin` with correct PIN | returns `true`, resets `failed_attempts` |
| 10 | `service_role` calls `verify_pin` 5x with wrong PIN | 5th call sets `locked_until`, writes an `audit_logs` row with action `pin_lockout` |
| 11 | Authenticated user calls `verify_pin` directly via RPC | permission denied (not granted to `authenticated`) |
| 12 | Anon uploads to `avatars-v4` outside their own folder | denied |
| 13 | Authenticated user uploads to `avatars-v4/{own-uid}/...` | allowed |
| 14 | Authenticated user uploads to `avatars-v4/{other-uid}/...` without `employee.manage` | denied |
| 15 | Any client attempts INSERT into `audit_logs` directly (not via RPC) | denied (no insert policy) |
| 16 | User attempts raw `update profiles set is_active = false where id = auth.uid()` | denied (`is_active` not in the column-level `UPDATE` grant) |
| 17 | User attempts raw `update profiles set full_name = 'X' where id = auth.uid()` | allowed (row: self; column: granted) |
| 18 | Branch manager of Branch X calls `admin_set_employee_active(userInBranchY, false)` | denied (`42501` — no shared branch) |
| 19 | Branch manager of Branch X calls `admin_set_employee_active(userInBranchX, false)` | allowed; `audit_logs` row with `action = 'employee_deactivation'` written |

## Phase E: inventory tables

SELECT-only policies via `current_user_can_inventory(permission, branch)`;
cost rows need `inventory.cost.read`; `inventory_movements.unit_cost_snapshot`
is excluded from the client column grant; all writes are audited RPCs (014).
Full matrix and test plan: `INVENTORY_SECURITY.md`.
