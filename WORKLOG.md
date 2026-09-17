# Worklog

Reverse-chronological. One entry per work session.

## 2026-09-17 (continuation 2) — Phase C local staging smoke test

Goal: prove — not assume — that the prepared, never-executed Phase C design
(commit e13c88c) actually works against a real Postgres/GoTrue instance.
Production Supabase project (`iwikwbjsznjuefvuemdb`) was never touched;
its credentials in the root `.env` were never read by any tool in this
session (see below) and the file's content is byte-identical
(sha256 `14a47bea...` before and after).

- Confirmed Docker Desktop 29.8.0 running (`docker ps`); this session's
  shell had a stale `PATH` from before Docker was installed, worked around
  by invoking the discovered install path directly / exporting it per call.
- `npx supabase init` (no prior `config.toml`) then `npx supabase start`:
  the Supabase CLI reads the repo-root `.env` for its own variable
  substitution and fails to parse it (a pre-existing UTF-8 BOM in that
  file, unrelated to this work). Worked around by renaming `.env` aside for
  the duration of each `supabase` CLI invocation only, verifying its
  sha256 checksum unchanged immediately before and after every rename —
  never touched its content, never let local Supabase read production
  values.
- Applied migrations 001-008 to the local stack: **all 8 succeeded on the
  first attempt**, both the initial run and a full `supabase db reset`
  (fresh database, chain re-verified from zero after the fixes below).
- Seeded 3 minimal synthetic test identities (M001/manager/Rumeli İskelesi,
  K001/cashier/Rumeli İskelesi, D001/employee/İskele Dondurma) via
  `auth.admin.createUser` + direct service-role table inserts (profiles,
  user_roles, branch_memberships, pin_credentials) — this is legitimate
  seeding (mirrors how Phase D's data migration will provision accounts),
  not a client-write path being tested.
- Ran a 39-assertion Node test suite against the live stack covering:
  full pin-login flow (valid/wrong code/PIN, inactive profile, PIN format
  validation), concurrent-lockout behavior (6 parallel wrong attempts →
  exactly one lockout, one audit row, no flooding), session mechanics
  (`auth.uid()` resolution via RLS self-select, `/auth/v1/token?grant_type=
  refresh_token`, session restore via `setSession` in a fresh client),
  RLS enforcement per role (cashier/employee cannot read unrelated
  profiles, cannot touch `pin_credentials`, cannot call admin RPCs; manager
  can grant an allowed role but not `owner`; every raw `user_roles`/
  `branch_memberships` write denied regardless of role), and an
  audited-RPC round-trip (`admin_set_employee_code`) with full
  `audit_logs` column verification. **Found and fixed two real defects**
  that only a live run could surface — see `DECISIONS.md`:
  (1) `verify_pin()`/`admin_reset_pin()` called unqualified `crypt()`/
  `gen_salt()`, unresolvable under `search_path = public` because pgcrypto
  lives in the `extensions` schema; (2) `pin-login`'s `verifyOtp` call
  passed `email` alongside `token_hash`, which supabase-js rejects
  outright. After both fixes, re-ran from a fresh `supabase db reset`:
  **39/39 assertions pass**, migrations apply cleanly, zero Mailpit
  messages (no email sent) across the run.
- Verified the real frontend chain in a browser against the local stack
  (temporary `app/.env.local` + a one-line, fully-reverted dev-only
  `window.__sb` exposure in `client.ts`, both removed before finishing —
  `git status` on `app/` is clean): unauthenticated → redirected to `/`;
  M001 (manager) → `/app/manager` renders (`ProtectedRoute` + `RoleGuard`
  pass, real roles/branchIds loaded via `fetchAuthorizationContext()` from
  the live `user_roles`/`branch_memberships` tables); K001 (cashier) →
  `/app/manager` shows the real `Unauthorized` component; K001 →
  `/app/employee` renders normally. `BranchGuard` is not wired to any route
  yet (documented, pre-existing gap — see `AUTH_ARCHITECTURE.md`), so it
  was not exercised live; its allow/deny logic is already unit-tested.
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (50/50), and
  `npm run build` all pass clean in `app/` after reverting the temporary
  browser-test wiring.
- Did NOT: apply anything to production, deploy the Edge Function to any
  hosted project, modify production RLS/Auth/data, merge to `main`, or
  start Phase D.
- Result: **LOCAL PASS** for the full Phase C flow (auth, RLS, audited
  RPCs, PIN security). The `generateLink`/`verifyOtp` session-minting
  design itself is now proven correct in code — see
  `AUTH_ARCHITECTURE.md`'s updated "Live-verified" note for the one
  remaining caveat (a hosted project's own configuration is the last
  unverified variable, not the design).

## 2026-09-17 (continuation) — Phase C security review: fixes applied to prepared files

Continuing this project on a different machine after a git-history check
showed the previous session's security-fix work (reported as already done:
`002`/`006` updates, a new `008_admin_rpcs.sql`, a rewritten Edge Function)
had never actually been committed to `v4-2027` — the branch as pushed still
contained the original, pre-review Phase C design with all four findings
below unfixed. Re-did that work directly against the current files rather
than assuming it existed:

- Added `profiles.employee_code` (`001_profiles_roles.sql`) as the resolved
  login handle, with a format check constraint. `legacy_cashier_id` stays
  traceability-only, per `DECISIONS.md`.
- Added `employee.manage_branch` permission and corrected the
  `branch_manager` grant set (`002_permissions.sql`) — was `employee.manage`
  (org-wide), now the branch-scoped equivalent.
- Added `current_user_shares_branch_with(p_user_id)` helper
  (`005_auth_helpers.sql`) for branch-overlap checks in policies and RPCs.
- Rewrote the `profiles` section of `006_rls_policies.sql`: column-level
  `GRANT` restricting client `UPDATE` to `full_name`/`phone`/`avatar_url`
  (closes the no-column-limit self-update bug); added a branch-scoped update
  policy for `employee.manage_branch`; removed the org-wide `employee.read`
  clause from the SELECT policy in favor of the branch-scoped check.
  Removed the raw `user_roles`/`branch_memberships` write policies entirely
  — both tables are now RPC-only.
- Added `008_admin_rpcs.sql`: `assign_role`, `revoke_role` (enforce the role
  hierarchy — manager can't grant owner; branch_manager can't grant
  owner/manager/branch_manager and only within a shared branch),
  `assign_branch_membership`, `remove_branch_membership`,
  `admin_set_employee_active`, `admin_reset_pin`, `admin_set_employee_code`.
  Every one writes an `audit_logs` row.
- Rewrote `supabase/functions/pin-login/index.ts`: removed the
  `service_credentials`/`signInWithPassword` design entirely; session
  minting now uses `generateLink`/`verifyOtp` (no stored password, no email
  actually sent). Marked NOT live-verified in the file header — needs one
  staging smoke test before deployment, tracked in `BACKLOG.md`.
- Updated `AUTH_ARCHITECTURE.md`, `DECISIONS.md` (6 new entries),
  `CURRENT_STATE.md`, `RLS_PLAN.md`, and `MIGRATION_PLAN.md` to match.
- Did NOT run `npm run typecheck`/`lint`/`test`/`build` as part of this SQL
  work — none of these changes touch `app/`'s TypeScript. That validation
  pass (against the existing `app/` scaffold) is a separate step; see the
  next entry if run in this same session.
- Confirmed via `git status`/`git diff` that no legacy file, no file outside
  `supabase/` and the four root docs, and no `app/src` file was touched by
  this pass — this was a SQL/Edge-Function-only fix, not new frontend work.
- Nothing applied to any database. No Edge Function deployed.

## 2026-09-17 — Phase C preparation: auth/authorization design (not applied)

Received the completed live Supabase audit: RLS enabled but every policy on
`admins`/`cashiers`/`daily_reports`/`daily_revenue`/`entry_history`/
`shift_schedule`/`targets` is effectively public, and the `avatars` bucket
allows anon SELECT/INSERT. Confirms and extends the Phase A frontend-only
findings. Nothing in this session queried the live database directly (no
DB access configured) — findings were supplied and are documented as-is.

- Designed the full identity/authorization model (`auth.users` → `profiles`
  → `roles`/`permissions`/`role_permissions`/`user_roles` +
  `branches`/`branch_memberships`) and wrote it as 7 reviewable, **not
  applied** SQL migrations under `supabase/migrations/001-007`, each with
  forward SQL, comments, explicit dependencies, and a rollback snippet.
- Designed the PIN mechanism: `pin_credentials` (one-way `pgcrypto` hash,
  RLS enabled with zero policies — unreachable by any client role),
  `verify_pin()` (SECURITY DEFINER, `service_role`-only, rate-limit/lockout
  built in), and a `pin-login` Edge Function (prepared source under
  `supabase/functions/pin-login/`, **not deployed**, two explicit `TODO`s
  blocking deployment — see AUTH_ARCHITECTURE.md "Open question"/"Open
  design item").
- Designed and wrote RLS policies (`006_rls_policies.sql`) for every new
  identity table, plus a design template (in RLS_PLAN.md, not yet a
  migration) for the Phase D operational tables that don't exist yet.
- Designed a new `avatars-v4` storage bucket + policies
  (`007_storage_policies.sql`) rather than touching the live `avatars`
  bucket, to avoid breaking legacy uploads before cutover.
- Built the non-destructive frontend auth scaffold in `app/`:
  `AuthProvider`/`useAuth` (real Supabase session tracking + graceful
  degradation when the Phase D schema doesn't exist yet), `ProtectedRoute`,
  `RoleGuard`, `BranchGuard`, `AuthLoading`/`Unauthorized` shared states, and
  a `LoginPage` UI shell that shows an explicit "not ready" toast instead of
  faking authentication. Wired `RoleGuard`/`ProtectedRoute` onto
  `/app/manager/*` and `/app/employee/*` in the router.
- Added 15 new tests covering session loading, authenticated/unauthenticated
  transitions, logout, role-guard allow/deny, and branch-guard
  membership/org-wide-bypass logic (50 total, all passing).
- Wrote `AUTH_ARCHITECTURE.md`, `RLS_PLAN.md`, `MIGRATION_PLAN.md`, and
  `docs/LEGACY_RECONCILIATION.md` (documenting, not resolving, the finding
  that live `daily_reports` totals don't reproduce the frozen 2026
  presentation totals — needs a scope-definition pass before any regression
  fixture can trust either source).
- Updated `DECISIONS.md` (5 new entries) and `BACKLOG.md` (Phase C/D items
  reorganized to reflect what got designed vs what's still open).
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (50/50), and
  `npm run build` all pass clean.
- Confirmed via `git status` that no file outside `app/`, `supabase/`,
  `docs/`, and the four new/updated root docs was touched — no legacy HTML/
  JS file, no production schema, no live RLS, no live Auth config.

## 2026-09-16 — Phase B: V4 foundation scaffold

- Ran Phase A architecture audit (repo tree, data flow, duplicated
  calculations, obsolete files, security review of the legacy frontend
  code). Reported separately in-session; key findings captured in
  `DECISIONS.md` and `CURRENT_STATE.md`.
- Scaffolded `app/` with Vite's `react-ts` template, then customized:
  - Added `react-router-dom`, `@supabase/supabase-js`.
  - Replaced default `oxlint` with ESLint (flat config, typescript-eslint,
    react-hooks, react-refresh) + `eslint-config-prettier`, and Prettier.
  - Added Vitest + Testing Library + jsdom, wired into `vite.config.ts`.
  - Tightened `tsconfig.app.json`: `strict`, `noUncheckedIndexedAccess`,
    `noImplicitOverride`.
- Built the target `src/` structure: `app/{router,providers,layouts}`,
  `components/{ui,charts,forms,navigation}`, `features/*` (one folder per
  product area), `domain/{revenue,scoring,reconciliation,badges,shifts}`,
  `services/supabase`, `hooks`, `types`, `utils`.
- Implemented `services/supabase/env.ts` + `client.ts` — a single
  validated Supabase client reading `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` from env, throwing loudly if either is missing.
  Added `.env.example`. No auth wired — see `DECISIONS.md`.
- Built 12 design-system primitives (Button, Input, CurrencyInput, Card,
  StatCard, StatusChip, Avatar, Modal, BottomSheet, Toast, Skeleton,
  EmptyState) as CSS Modules over `src/styles/tokens.css`.
- Wired `react-router-dom` (`createBrowserRouter`) with `EmployeeLayout`
  and `ManagerLayout` (each with a mobile bottom nav), and placeholder
  routes for Login, Overview, Branches, Employees, Shifts, Reports,
  Management, Profile.
- Implemented first real domain logic, each with unit tests:
  - `domain/revenue`: `calculateEveningIncrement` (Z−X), `calculateDailyRevenue`.
  - `domain/shifts`: `evaluateOnTime`, config-driven shift cutoffs
    (caught and fixed a midnight-rollover ambiguity bug during test-writing
    — see DECISIONS.md).
  - `domain/scoring`: `calculateScore` over `PerformanceEvent` +
    `ScoringRule`, fully recalculable, no revenue input.
  - `domain/badges`: `evaluateAutomaticBadges`, threshold-driven.
  - `domain/reconciliation`: `reconcile`, OK/WARNING/ERROR thresholds.
- Fixed a repo-root `.gitignore` bug that blanket-ignored
  `package.json`/`package-lock.json` (would have silently dropped the new
  lockfile from git).
- Verified: `npm run typecheck`, `npm run lint`, `npm test` (35/35
  passing), `npm run build` all pass clean from a fresh `npm install`.
- Confirmed via `git status` that no legacy file outside `app/` and the
  `.gitignore` fix was touched.
