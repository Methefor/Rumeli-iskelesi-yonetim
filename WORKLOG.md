# Worklog

Reverse-chronological. One entry per work session.

## 2026-09-21 — Phase E: İskele Dondurma inventory depth + V4 UI/UX (committed to v4-2027)

Branch `v4-2027`, base `32bde7b`. Nothing deployed or applied; no hosted
Supabase, Vercel, or legacy file touched. Old stash `laptop-old-phase-c-before-sync` untouched.

- Migrations `012_inventory_core`, `013_inventory_rls`, `014_inventory_rpcs`
  (generic, branch-scoped inventory; append-only ledger; effective-dated cost;
  counts separate from the ledger; product-linked sales lines with server-side
  SALE/REVERSAL movements). See `INVENTORY_MODEL.md`, `INVENTORY_SECURITY.md`.
- `supabase/tests/inventory_security.test.sql` (~150 assertions). Docker is not
  installed on this laptop, so it was run in a scratch PGlite harness (outside
  the repo) with an auth/storage shim; negative controls proved role switching
  and RLS are really enforced. Local Supabase run remains OPEN.
- Domain `app/src/domain/inventory` (stock, variance, sell-through, cost,
  gross profit, alerts, closing, permission map) + 52 tests.
- Data layer: `services/data` facade -> real (`services/supabase/inventory.ts`)
  or synthetic (`services/demo`) by `VITE_DEMO_MODE`; friendly Turkish errors
  (`services/errors.ts`); `useAsync` + `DataBoundary` for loading/error states.
- UI: new app shell (branch switcher, identity, role, Demo chip, visible
  logout, one responsive nav), manager/employee homes, 8 inventory screens,
  profile, management hub; existing 7 screens moved to the shared components
  and shared branch selection. Removed placeholder pages and "Faz" labels.
- Tests: 150 total (was 71), incl. full-app demo flows with a fetch spy.
- Validation status: app/domain/UI tests VALIDATED; migrations 012-014 PREPARED;
  PGlite harness PASSED but NOT equivalent to real Supabase; real local Supabase
  reset/integration OPEN; hosted/staging NOT DONE; Production UNTOUCHED.
- Browser review (demo mode): 360px mobile as M001 and D001, desktop sidebar;
  no horizontal overflow on 22 routes. Found/fixed a wrapping stat card.

## 2026-09-17 (continuation 3) — Phase D: core operational data model, prepared and local-staging-validated

Goal: the normalized operational core (Branch → Employee → Shift → Sales)
per the Phase D brief, built and proven against local Supabase rather than
left as untested design — same discipline as the Phase C smoke test.
Production untouched throughout; `v4-2027` only.

- Added `supabase/migrations/009_operational_core.sql`: `shift_definitions`,
  `registers`, `sales_categories` (+ legacy category seed), 
  `sales_category_branches`, `reconciliation_thresholds` (seeded 2%/5% for
  the two primary branches), `shifts`, `shift_assignments`,
  `sales_reports` (with two partial unique indexes for duplicate
  prevention), `sales_report_items`, `sales_report_overrides`. A shared
  `set_updated_at()` trigger keeps every table's `updated_at` column
  correct without relying on every RPC to remember it. Seeded a generic
  sabah/akşam `shift_definitions` pair for Rumeli İskelesi and İskele
  Dondurma only — Balık Ekmek is lower priority per the brief and left
  unseeded rather than guessed at.
- Added `010_operational_rls.sql`: RLS for every new table, no anonymous
  access, no direct client write on any lifecycle-critical table (`shifts`,
  `shift_assignments`, `sales_reports`, `sales_report_items`,
  `sales_report_overrides`) — same RPC-only rule Phase C established for
  `user_roles`/`branch_memberships`.
- Added `011_operational_rpcs.sql`: `schedule_shift`, `cancel_shift`,
  `reassign_shift_branch` (org-wide only, reason mandatory),
  `assign_shift`, `update_shift_assignment_status` (self-confirm allowed,
  cancel is privileged), `override_shift_lateness`, `create_sales_report`
  (shift ownership + allowed/active shift + server-side timing + duplicate
  prevention + server-computed `reconciliation_status`), `edit_sales_report`,
  `cancel_sales_report` (status lifecycle, never a raw DELETE),
  `override_reconciliation` (writes both a `sales_report_overrides` row and
  an `audit_logs` row). Every one audited.
- Added `app/src/domain/revenue/deriveShiftRevenueFromReports.ts` (+ 6
  unit tests) bridging `sales_reports` rows to the existing (Phase B)
  `calculateDailyRevenue` — did NOT rewrite `domain/revenue` or
  `domain/reconciliation`, both were already correct for this phase.
- Added `app/src/services/supabase/shifts.ts` and `sales.ts` — every
  Supabase call for the new tables/RPCs lives here; confirmed no
  `supabase.from()` call exists inside any UI component.
- Built seven functional (not placeholder) screens and wired them into
  `router.tsx`, replacing the Phase B `ShiftsPage`/`ReportsPage`
  placeholders (deleted, fully superseded): employee `MyShiftPage`,
  `NewSalesReportPage`, `MyRecentReportsPage`; manager `ShiftOverviewPage`,
  `AssignShiftPage`, `SalesOverviewPage`, `ReconciliationQueuePage`. Added
  `hooks/useSelectedBranch.ts` (shared branch-picker logic for the four
  manager screens — real duplication, not a premature abstraction).
- **Local-staging-validated end to end:**
  - `supabase db reset` applied migrations 001-011 cleanly from a fresh
    database (repeated 3 times across this session as fixes landed).
  - A 34-assertion Node integration suite against local Supabase covering
    shift scheduling/assignment/confirmation, X/Z submission, duplicate
    rejection, reconciliation OK/WARNING/ERROR, edit/cancel/override with
    full `audit_logs` column verification, raw-write denial on every
    RPC-only table, cross-branch RLS scoping, server-side submission
    timing (ordinary employee denied past cutoff, manager privileged
    bypass allowed), and branch reassignment (org-wide only, audited).
    **34/34 pass** on a clean run.
  - Drove all seven screens in a real browser (temporary, fully-reverted
    `app/.env.local` + a one-line dev-only `window.__sb` exposure,
    identical pattern to the Phase C smoke test) as M001 (manager), K001
    (cashier), and D001 (employee): shift list/confirm, shift assignment,
    a real sales report submission through the actual form, the sales
    overview + reconciliation queue including a real override via button
    click, and the server-side late-submission rejection surfacing
    correctly in the UI. `git status` on `app/` confirmed clean before
    finishing — no temporary test wiring left behind.
  - **Found and fixed two real defects this way**, neither visible from
    reading the code alone — see `DECISIONS.md`:
    1. RLS infinite recursion (`42P17`) between `shifts` and
       `shift_assignments`' policies. Fixed with two more `SECURITY
       DEFINER` helpers, same fix class as Phase C's
       `current_user_branch_ids()`.
    2. `NewSalesReportPage`'s post-submit `navigate('../reports', {relative:
       'path'})` resolved to an unmatched route, landing on the router's
       catch-all (`<Navigate to="/" />`) and showing the Login page instead
       of "My Recent Reports." Fixed to an absolute path.
  - A lint rule (`react-hooks/set-state-in-effect`) caught three
    data-fetching effects written as "call a named async function from the
    effect body" (matching an existing pattern already in `AuthProvider`,
    which turned out to still be lint-clean only because of a subtler
    structural difference) — restructured to the documented React pattern:
    the fetch + `setState` live directly inside the effect's `.then()`, a
    `cancelled` flag guards against a stale response, and a `reloadKey`
    state number triggers re-fetches after a write action rather than
    calling the loader function directly.
  - Verified: `npm run typecheck`, `npm run lint`, `npm test` (56/56 —
    50 existing + 6 new `deriveShiftRevenueFromReports` tests), and
    `npm run build` all pass clean after every fix, including after
    reverting the temporary browser-test wiring.
- Updated `docs/LEGACY_RECONCILIATION.md` with a documented-only (not
  built) legacy-column → V4-row mapping table (Phase D brief: "only
  document mapping strategy"). Did not touch any legacy table, did not
  backfill or migrate 2026 data.
- Created `CORE_DATA_MODEL.md`, `SHIFT_MODEL.md`, `SALES_MODEL.md`.
- Did NOT: apply anything to production, deploy any Edge Function, modify
  legacy HTML/JS, merge to `main`, or start Phase E/inventory/performance/
  badges/analytics.

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


### 2026-09-21 — local validation attempt and timezone correction

Verified clean v4-2027 at 5a3922e before edits. Local start blocked by missing Docker/Podman; no db reset or Auth/PostgREST validation performed. Prepared explicit Europe/Istanbul SQL cutoff and device-independent application evaluation; all 158 application tests, lint, typecheck and build pass. Reviewed branch_manager adjust/reverse/count-void without changing grants. Full findings and outstanding tests: docs/LOCAL_VALIDATION_2026-09-21.md. No commit/push.


###  2026-09-22 — completed real local validation

Fresh 001– 014 local reset PASS after repairing interrupted012 block delimiters. SQL inventory security PASS, timezone arithmetic PASS, 32 actual RPC timezone cases PASS, 135 Auth/PostgREST assertions PASS. 163 app tests/21 files, typecheck/lint/build PASS; local security advisors no warn/error issues. Demo browser cashier adjust/reverse and manager count-void/audit verified, audit 360px layout checked. Corrected management relative links found in browser; count-void warning clarified. No production/commit/push. Full report: docs/LOCAL_VALIDATION_ 2026-09-22.md.

### 2026-09-22 (later) — rolled back cashier inventory.adjust; branch_manager loses reversal

Per explicit user instruction: reverted the cashier `inventory.adjust` grant added earlier the same day (migration 012), and additionally restricted `reverse_inventory_movement` (014) to owner/manager only — branch_manager keeps `record_inventory_adjustment` and `void_inventory_count` in their own branch, but not reversal. Updated the frontend UI-visibility mirror (new `isOwnerOrManager` helper, `canReverseMovement` in `useInventoryContext`), gated the reverse button in `MovementHistoryPage` on it, fixed stale cashier-can-void copy in `ClosingCountPage`, updated the demo API/store and its tests, added a new SQL test section exercising the rollback against real own-branch fixtures (not just cross-branch denial), and rewrote `local_inventory_api.mjs`'s adjust/reverse/void flow end to end (137 assertions, all actor/stock/audit numbers recomputed).

Re-ran the full local validation from a fresh `supabase db reset --local --no-seed`: inventory security SQL, both timezone SQL suites, and the Auth/PostgREST script all pass, plus `npm run typecheck`/`lint`/`test` (165 tests)/`build`. No commit, no push, no hosted/production change.

### 2026-09-24 — backdated-entry policy + real Storage/Edge Function validation

Added `015_sales_backdated_policy.sql`: Europe/Istanbul calendar-date backdated-entry limit (today..-3 days) for cashier/employee/branch_manager on `create_sales_report`/`edit_sales_report`, future dates always denied, owner/manager override with mandatory reason audited as `sales_report_backdated_override`. Added `app/src/domain/shifts/backdatedPolicy.ts` (pure UI mirror + tests), wired into `NewSalesReportPage.tsx` (Turkish messaging, reason field for the override) and `services/errors.ts`; mirrored in `services/demo/api.ts` with matching demo tests. New SQL suites `backdated_entry.test.sql` and `backdated_entry_timezone.test.sql` (24 cases across UTC/Istanbul/New York/Tokyo).

Wrote and ran, for the first time, REAL executable tests (not SQL inspection) against the local Storage API and the `pin-login` Edge Function:
- `storage_policy.test.mjs` (48 assertions, real Auth JWTs, real HTTP against `avatars-v4`) found a genuine bug — the local Storage API implements "replace" as an INSERT-with-conflict, so the INSERT policy's WITH CHECK (not the UPDATE policy) gates it; the manager/owner `employee.manage` override was missing from `avatars_v4_insert`. Fixed in `007_storage_policies.sql`.
- `pin_login.test.mjs` (45 assertions, real HTTP against the local edge runtime) found no defects — identity, generic-failure parity, lockout/concurrency (5 parallel wrong-PIN attempts → exactly 5 failures, exactly one lockout audit row, no flooding), session issuance/refresh, and "no email sent" (checked against the local Mailpit catcher) all passed.

Fresh `supabase db reset --local --no-seed`: migrations 001-015 apply clean. All SQL/timezone/backdated suites, `local_inventory_api.mjs` (137), `storage_policy.test.mjs` (48), `pin_login.test.mjs` (45) pass. App: typecheck, lint, 175 tests, build — all pass. No commit/push; hosted Supabase and production untouched. Full report: `docs/LOCAL_VALIDATION_2026-09-24.md`.

### 2026-09-26 — local-first execution strategy approved

Recorded the owner's decision to keep Supabase, preserve both important Free
Plan projects and avoid a paid staging project. Replaced the hosted-first
roadmap with a gated local-first sequence: local real login, Management Center,
realistic configuration and migration rehearsal, followed by a separately
authorized production-readiness package and short side-by-side cutover. No
production access, deployment, commit or push was performed.

### 2026-09-26 - Stage 1 real login (local)

Added `pinLogin.ts`, `signInWithPin`, fail-closed `fetchAuthorizationContext`,
LoginPage wiring, local env guard (`assert-local-supabase.mjs`, `dev:local`,
`build:local`, gitignored `.env.development.local`/`.env.production.local`),
`local_login_fixtures.mjs`, tests (207 total). Real browser flows all pass on
the local stack; full local backend regression passes. No commit/push, no
hosted or production contact.

### 2026-09-26 - Stage 2 Management Center and local provisioning (local)

Added migration `016_management_center.sql`: inactive-aware `current_user_*`
helpers, a PostgREST `db_pre_request` hook (`enforce_active_user`) so an old
JWT of a deactivated user is refused on every Data API/RPC call, storage
avatar policies with the active check, GoTrue ban + session deletion on
deactivation, a strict rank hierarchy (owner 4 > manager 3 > branch_manager 2 >
rest 1) with audited RPCs (activate, code, PIN reset, role, branch, shift
definition, reconciliation thresholds), and raw-write revokes on the settings
tables. New Edge Function `employee-provision` (service role server-side only,
caller JWT verified, authority read from the DB, one-transaction provisioning,
compensating auth-user delete). Management Center UI (list/filter/search,
create, detail, settings, audit) with demo mirror and 240 app tests. Local
validation only: full regression passes on a fresh reset (001-016). No
commit/push, no hosted or production contact. Report:
`docs/LOCAL_MANAGEMENT_VALIDATION_2026-09-26.md`.

Independent review then found and fixed one hierarchy defect in the prepared
migration: owner could grant/provision another owner despite the documented
strict outrank rule, creating an RPC-immutable privileged account. The review
also restored permission checks alongside rank, replaced the recreated avatar
policies' deprecated `auth.role()` predicate with `TO authenticated`, and
made the HTTP test runner work with Windows' npx-only Supabase CLI setup. Fresh
001-016 reset, real-role SQL assertions and 76/76 management HTTP assertions
pass after the fix.

### 2026-09-26 - Stage 3 realistic local catalog and operating configuration (local)

Added migration 017 (provenance registry + service-role-only loader function),
`operating-data/` (contract, validator, idempotent local loader, real/test-only/
owner-input files, provenance matrix, owner checklist), a read-only data-quality
screen, and 75 + 20 + 6 new tests. Only the three branches are confirmed; every
other legacy observation (categories, Rumeli registers, sabah/aksam times) is
pending owner approval and was not applied; the 009 shift times and 2/5
thresholds are classified demo_only. No catalogue, stock, cost or waste data
exists anywhere, so a synthetic test-only catalogue proves the full daily flow.
Gate 3: INPUT REQUIRED. No commit/push; hosted and production untouched.
Report: `docs/LOCAL_OPERATING_DATA_VALIDATION_2026-09-26.md`.

### 2026-09-26 - Rumeli operating-data owner approval

Recorded the owner's approval of Rumeli's ten categories, two registers and
Sabah/Akşam definitions in the real dataset. Updated the validator and loader
regression expectations. Fresh local 001-017 reset and the 75-assertion loader
suite prove that dry-run is non-mutating, apply creates both registers and the
missing Dondurma category mapping, replaces the two generic Rumeli shift seeds
with 09:00-17:30 / 16:00-01:00, records provenance/audit, and is idempotent.
The 20 validator tests also pass. Hosted and production were not contacted.

### 2026-09-26 - Threshold and waste-reason owner approval

Added the owner-approved 2%/5% thresholds for all three branches and six
approved waste reasons to the real dataset. Fresh local reset plus the expanded
77-assertion loader suite proves all three threshold rows, trusted provenance,
reconciliation behavior, idempotency and access controls. The 20 validator
tests pass. Hosted and production were not contacted.

### 2026-09-26 - İskele Dondurma register and seasonal shifts

Recorded S900 as the current single register, disabled the branch's two generic
seed shifts, added summer 16:00-00:00 inactive and cold-season 14:00-22:00
active, and left Pavo pending until cutover details are supplied. Fresh local
reset plus the expanded 79-assertion loader suite proves the active/inactive
state, register, scheduling, idempotency and daily operation. Categories remain
unapproved. Hosted and production were not contacted.

### 2026-09-26 - İskele Dondurma category mapping approved

Added the three owner-approved mappings to the real dataset. Real dry run:
created 13, updated 4, unchanged 27, skipped 0, rejected 0. Validator 21/21,
loader suite 82/82 on a fresh 001-017 reset. Remaining Gate 3 input: Pavo
activation details/date; Balık Ekmek register, shifts and categories; mapping of
the legacy Balık Ekmek/Dondurma revenue fields; real catalogue, product/category
mapping, opening stock, dated unit costs. No push; hosted/production untouched.

### 2026-09-26 - Balık Ekmek operations configured

Added the `balik_ekmek` category, its two mappings, S900 register and daily shift
to the real dataset. Real dry run: created 18, updated 4, unchanged 27, skipped 0,
rejected 0. Validator 22/22, loader suite 89/89 on a fresh 001-017 reset. Legacy
revenue mapping (balik_ekmek -> balik_ekmek, dondurma -> iskele_dondurma)
recorded as a decision only. Remaining Gate 3 input: Pavo, catalogue,
product/category mapping, opening stock, dated costs. No push.

### 2026-09-26 - Dondurma category correction (Dondurma + Su)

Migration 018, `category_branch_removals` contract/validator/data, new global `su`,
Dondurma mappings corrected. Supersedes the three-category approval. Real dry run:
created 20, updated 6, unchanged 25, skipped 0, rejected 0. Validator 25/25, loader
119/119 on a fresh 001-018 reset; existing SQL/HTTP suites pass. No push.
