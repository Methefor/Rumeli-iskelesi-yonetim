# Current State

Last updated: 2026-09-26 (Stage 2: Management Center, local only; see docs/LOCAL_MANAGEMENT_VALIDATION_2026-09-26.md).

## Two applications live in this repo right now

### 1. Legacy production app (repo root) — untouched, still live

`index.html`, `entry.html`, `cashier-dashboard.html`, `admin-dashboard.html`,
`js/supabase-client.js`, `service-worker.js`, `manifest.json`, `vercel.json`.
Static HTML/JS/Supabase PWA, no build step, no framework. Contains real
2026 production data and is what staff use today. **Nothing in this phase
modified these files, the Supabase schema, RLS policies, or any data.**

Known issues (see the Phase A audit, reproduced in `DECISIONS.md` context):
plaintext-PIN login queried directly from the browser, cashier identity
carried in a URL query parameter, no admin session guard at all. These are
real, currently-live exposures — not yet fixed, fixing them is Phase C.

### 2. V4 app (`app/`) — new, in development, not yet live

React 19 + TypeScript (strict) + Vite + React Router 7 + Supabase JS,
Vitest + Testing Library, ESLint + Prettier. No CSS framework — plain CSS
Modules over a design-token system. See `app/README.md` for scripts and
structure.

**What exists as of Phase B:**
- Project scaffold, strict TypeScript, ESLint/Prettier, Vitest wired up and
  passing (35 tests, all green).
- Design-system primitives: Button, Input, CurrencyInput, Card, StatCard,
  StatusChip, Avatar, Modal, BottomSheet, Toast, Skeleton, EmptyState.
- Routing skeleton: `/` (Login placeholder), `/app/employee/*` (Home,
  Shifts, Profile under `EmployeeLayout`), `/app/manager/*` (Overview,
  Branches, Employees, Reports, Management under `ManagerLayout`). Every
  route beyond Login currently renders a `RoutePlaceholder` — no real
  feature UI yet.
- `services/supabase` — a single validated Supabase client factory reading
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from env. **No auth is wired
  up.** The legacy plaintext-PIN pattern was deliberately not ported; see
  `DECISIONS.md`.
- `domain/revenue`, `domain/shifts`, `domain/scoring`, `domain/badges`,
  `domain/reconciliation` — pure, unit-tested business logic with no
  Supabase or React dependency. These are the first real implementations
  of calculations that exist only informally (and duplicated 2-3x) in the
  legacy HTML files.

**What does not exist yet (as of Phase B):** no login, no data fetching, no
real feature screens, no new database tables, no legacy data migration/
adapter. The V4 app cannot be used for real operations yet.

### Phase C (2026-09-17): auth/authorization design, prepared but not applied

The live Supabase audit is now complete (see `AUTH_ARCHITECTURE.md` "Why
this exists" for the confirmed findings — RLS enabled but effectively
public on every legacy table; `avatars` bucket public/anon-writable). Based
on that, Phase C produced:

- `supabase/migrations/001-008` — the full identity/authorization schema +
  RLS + storage policies + audited admin RPCs, as reviewable SQL. **Not
  applied to any database, staging or production.**
- `supabase/functions/pin-login/` — a prepared Edge Function source.
  **Not deployed.** Functionally complete (resolves `employee_code`, verifies
  the PIN, mints a session via `generateLink`/`verifyOtp`) but the
  session-minting step is **not live-verified against a real Supabase
  project** — see `AUTH_ARCHITECTURE.md` "Not live-verified" for the exact
  smoke test required before deployment.
- A frontend auth scaffold in `app/` (`AuthProvider`, `useAuth`,
  `ProtectedRoute`, `RoleGuard`, `BranchGuard`, a `LoginPage` shell) that
  tracks a real Supabase session today but has no way to create one yet —
  submitting the login form shows an explicit "not ready" state.
- `docs/LEGACY_RECONCILIATION.md` — an **unresolved** finding that live
  `daily_reports` totals don't reproduce the frozen 2026 presentation
  totals. Not investigated further (no DB query access this session); do
  not build Phase J regression fixtures until this is resolved.

**Security review (2026-09-17), same day:** a review of the above found four
blocking issues before it could be considered "hardened" — see
`DECISIONS.md` for the full reasoning behind each fix:
1. `profiles` self-update had no column restriction (any user could flip
   their own `is_active`). Fixed via a Postgres column-level `GRANT`
   restricting client `UPDATE` to `full_name`/`phone`/`avatar_url` only.
2. `branch_manager` held the org-wide `employee.manage` permission. Replaced
   with a new `employee.manage_branch` permission, paired everywhere with an
   explicit shared-branch-membership check
   (`current_user_shares_branch_with()`, `005_auth_helpers.sql`).
3. Role/branch-membership writes were raw, permission-gated table policies,
   which cannot express the required role hierarchy or guarantee an audit
   trail. Replaced with audited `SECURITY DEFINER` RPCs
   (`008_admin_rpcs.sql`: `assign_role`, `revoke_role`,
   `assign_branch_membership`, `remove_branch_membership`,
   `admin_set_employee_active`, `admin_reset_pin`, `admin_set_employee_code`).
4. The `service_credentials` design (a stored, readable per-employee
   password) was rejected outright and replaced with
   `generateLink`/`verifyOtp` — no password is stored anywhere.

Also resolved: `profiles.employee_code` (format `^[A-Z][0-9]{2,4}$`, e.g.
`M001`/`K002`) is now the login handle `pin-login` resolves against —
closing the previously-open "how does anyone log in" question. See
`AUTH_ARCHITECTURE.md` "Login handle".

**Updated same day:** the `generateLink`/`verifyOtp` flow above was run
against a real local Supabase stack (Docker: Postgres + GoTrue + Kong +
Edge Runtime) and found two real defects (pgcrypto schema qualification;
a `verifyOtp` argument conflict), both fixed — 39/39 backend assertions and
the live `AuthProvider`/`ProtectedRoute`/`RoleGuard` chain pass. Result:
**LOCAL PASS**; a real cloud staging project run is still recommended, not
required, before production — see `AUTH_ARCHITECTURE.md` "Live-verified".

### Phase D (2026-09-17): core operational data model, prepared and local-staging-validated

Branch → Employee → Shift → Sales, normalized (no `rumeli_z1`/
`balik_ekmek`/`dondurma`-style columns anywhere — branch/category/register
are always a foreign key). See `CORE_DATA_MODEL.md`, `SHIFT_MODEL.md`,
`SALES_MODEL.md` for the full design.

- `supabase/migrations/009-011` — `shifts`, `shift_assignments`,
  `sales_reports`, `sales_report_items`, plus config tables
  (`shift_definitions`, `registers`, `sales_categories`,
  `sales_category_branches`, `reconciliation_thresholds`) and an
  append-only `sales_report_overrides` audit trail. RLS follows the exact
  Phase C pattern (no anonymous access, RPC-only critical writes). Audited
  RPCs: `schedule_shift`, `cancel_shift`, `reassign_shift_branch`,
  `assign_shift`, `update_shift_assignment_status`,
  `override_shift_lateness`, `create_sales_report`, `edit_sales_report`,
  `cancel_sales_report`, `override_reconciliation`.
- `app/src/domain/revenue/deriveShiftRevenueFromReports.ts` — new domain
  glue bridging the `sales_reports` table shape to the existing (Phase B)
  `calculateDailyRevenue`; `domain/revenue`/`domain/reconciliation`
  themselves were already correct for this phase's needs and were not
  rewritten.
- `app/src/services/supabase/{shifts,sales}.ts` — the only place these
  tables/RPCs are called from; no `supabase.from()` call exists inside any
  UI component.
- Seven functional (not placeholder) mobile-first screens: employee
  `MyShiftPage`/`NewSalesReportPage`/`MyRecentReportsPage`, manager
  `ShiftOverviewPage`/`AssignShiftPage`/`SalesOverviewPage`/
  `ReconciliationQueuePage`. No analytics dashboard — matches the brief.
- **Local-staging-validated, not just prepared:** applied migrations
  001-011 to local Supabase from a fresh `db reset`, ran a 34-assertion
  backend integration suite (schedule/assign/confirm, X/Z submission,
  duplicate prevention, reconciliation OK/WARNING/ERROR, edit/cancel/
  override with full audit verification, raw-write denial, cross-branch
  RLS scoping, server-side timing enforcement, branch reassignment), and
  drove all seven screens in a real browser against the same local stack.
  Found and fixed **two** real defects this way, neither visible from
  reading the SQL/TypeScript alone — see `DECISIONS.md`:
  1. An RLS infinite-recursion (`42P17`) between `shifts` and
     `shift_assignments`' policies, each referencing the other.
  2. A wrong relative-path `navigate()` call after a successful report
     submission, landing on the router's catch-all and showing the Login
     page instead of "My Recent Reports."
- Nothing applied to any staging/production Supabase project. No Edge
  Function changes. No legacy table touched — see
  `docs/LEGACY_RECONCILIATION.md` "Legacy adapter strategy" for the
  documented-only (not built) mapping from legacy columns to this schema.

See `AUTH_ARCHITECTURE.md`, `RLS_PLAN.md`, and `MIGRATION_PLAN.md` for the
full design and the approval gates before any of this touches a real
database.

## Source of truth

The running legacy source code and the actual Supabase schema are the
source of truth for how the business currently operates — not
`PROJE_YAPISI.md` or the old `README.md` at the repo root, both of which
describe a Google Sheets/Alpine.js/Tailwind stack that no longer exists and
should not be trusted.

## Next planned phase

Nothing in `supabase/` should be applied without a fresh, explicit approval
step per `MIGRATION_PLAN.md`'s sign-off checklists — that approval has not
been given yet. In parallel, the `docs/LEGACY_RECONCILIATION.md` gap needs
live DB query access to investigate, which is not configured in this
session.

### Phase E (2026-09-21): İskele Dondurma inventory + UI/UX — committed to v4-2027

* Migrations 012-014 (prepared, not applied to any hosted project): generic
  branch-scoped inventory, append-only ledger, effective-dated cost, separate
  physical counts, product-linked sales lines. As of 2026-09-22, validated
  against a real local Supabase stack (fresh `db reset`, real Auth/PostgREST/
  RLS) — see the table below and `docs/LOCAL_VALIDATION_2026-09-22.md`.
* V4 now has a coherent shell (branch, identity, role, logout), real manager
  and employee homes, and inventory screens (overview, receive, waste,
  closing count, items, cost, gross profit, movements). Demo mode
  (`VITE_DEMO_MODE=true`) runs every screen on synthetic fixtures with zero
  Supabase requests.
* See `INVENTORY_MODEL.md`, `INVENTORY_SECURITY.md`. 2026 data untouched.

**Validation status (Phase E) — keep this distinction:**

| Item | Status |
|---|---|
| Phase E application / domain / UI tests (typecheck, lint, 175 unit + demo-flow tests, build) | **VALIDATED** |
| Migrations 012-015 | **PREPARED**, validated on a real local Supabase stack; **not applied to any hosted project** |
| Fresh local Supabase `db reset` (001-015 from zero) | **VALIDATED LOCALLY** (2026-09-24, real Docker/Postgres/GoTrue/PostgREST) |
| SQL security/timezone/backdated suites (`inventory_security.test.sql`, `timezone_regression.test.sql`, `timezone_rpc.test.sql`, `backdated_entry.test.sql`, `backdated_entry_timezone.test.sql`) against real local Postgres roles | **VALIDATED LOCALLY** |
| Real local Auth + PostgREST integration (`local_inventory_api.mjs`, 137 assertions, real password sessions/JWTs, every role) | **VALIDATED LOCALLY** |
| Real local Storage API (`storage_policy.test.mjs`, `avatars-v4`, 48 assertions, real Auth JWTs) | **VALIDATED LOCALLY** — one real bug found and fixed (see `docs/LOCAL_VALIDATION_2026-09-24.md`) |
| Real local Edge Function (`pin_login.test.mjs`, `pin-login`, 45 assertions, real HTTP) | **VALIDATED LOCALLY** — no fix needed |
| Backdated-entry policy timezone invariance (session TZ UTC / Europe/Istanbul / America/New_York / Asia/Tokyo all produce the same decision) | **VALIDATED LOCALLY** |
| Hosted / staging validation | **NOT DONE** |
| Production | **UNTOUCHED** |

The PGlite harness result described in earlier Phase E docs has been
superseded by the above real local Supabase run; see
`docs/LOCAL_VALIDATION_2026-09-22.md`. Do not describe any of this as
hosted/staging-validated until it has actually run there.


### 2026-09-21 local validation follow-up (uncommitted)

Real Supabase validation remains OPEN: CLI 2.117.0 start failed because Docker/Podman is absent. Migration 011 and the application cutoff evaluator now explicitly use Istanbul business time (prepared files only). Typecheck/lint/build and 158 tests passed; 13 timezone tests additionally passed under UTC/New York/Tokyo. SQL regression is prepared, not executed. No hosted/production changes or permission changes. See docs/LOCAL_VALIDATION_2026-09-21.md.


###  2026-09-22 — real local validation PASS (uncommitted)

Supersedes the previous Docker-blocked/OPEN entry. Fresh local Supabase reset applied 001– 014. Real role SQL security suite and timezone arithmetic pass; 32 actual timezone RPC cases and 135 real Auth/PostgREST assertions pass. 163 application tests, typecheck, lint and build pass. Local security advisors report no warn/error issues. Cashier own-branch adjust/non-sale reverse/count void is explicitly approved and implemented in prepared files, with owner/manager audit UI.011 AND 014 timezone expressions fixed. Hosted/production untouched; no commit/push. See docs/LOCAL_VALIDATION_ 2026-09-22.md for limitations, including local Vector log collection and bundle-size warning.

### 2026-09-22 (later) — cashier `inventory.adjust` grant rolled back; branch_manager loses reversal

The user's explicit approval reversed the cashier grant above and narrowed the design further: **cashier/employee have no privileged inventory access at all** (no adjust, no reversal, no count-void, no cost, no receive — same as before Phase E's cashier experiment). **branch_manager keeps own-branch adjust and count-void, but not `reverse_inventory_movement`** — reversal is now owner/manager only, the one substantive change from the original Phase E design. See `DECISIONS.md` "cashier grant rolled back; final inventory authorization scope" for the full rationale.

Re-validated end to end on a fresh real local Supabase reset (Docker): `inventory_security.test.sql` (with a new section testing the rollback against real own-branch fixtures for cashier and branch_manager, not just cross-branch), `timezone_regression.test.sql`, `timezone_rpc.test.sql` (32/32), and `local_inventory_api.mjs` (rewritten, 137/137 real Auth+PostgREST assertions) all pass. App suite: typecheck, lint, 165 tests, build — all pass. No commit/push; production and hosted Supabase untouched.

### 2026-09-24 — backdated-entry policy, real Storage/Edge Function validation

New `015_sales_backdated_policy.sql`: server-side backdated-entry policy for
sales reports (`create_sales_report`/`edit_sales_report`), Europe/Istanbul
**calendar date**. Normal operational users (cashier, employee,
branch_manager) may create/edit only today or the previous 3 Istanbul
calendar days; a future date is always denied for everyone; owner/manager
may go further back only with a mandatory reason, audited separately
(`sales_report_backdated_override`). branch_manager's `sales.edit_all` does
NOT count as privileged for this rule (it still bypasses the unrelated
same-day cutoff, unchanged) — this is the one behavioral narrowing here.
Frontend mirror: `domain/shifts/backdatedPolicy.ts`, wired into
`NewSalesReportPage` (clear Turkish message, reason field for an
owner/manager override) and `services/errors.ts`.

Also, for the first time, the local Storage API (`avatars-v4`) and the
`pin-login` Edge Function were validated with REAL executable tests against
the real local stack — not SQL inspection or source reading. The Storage
test found and fixed one real bug: `avatars_v4_insert`'s `WITH CHECK` was
missing the `employee.manage` override, which silently broke a
manager/owner's ability to replace another user's avatar (Supabase's local
Storage API implements "replace" as an upsert, so the INSERT policy — not
just UPDATE — gates it). The Edge Function test needed no fix: identity,
generic-failure shape, lockout/concurrency (a 5-way concurrent wrong-PIN
race lands on exactly 5 failures and exactly one lockout audit row), session
issuance/refresh, and "no email is ever sent" (checked against the local
Mailpit catcher) all passed as designed.

Full re-validation from a fresh reset: all SQL/timezone/backdated suites,
`local_inventory_api.mjs` (137), the new `storage_policy.test.mjs` (48) and
`pin_login.test.mjs` (45) all pass; app: typecheck, lint, 175 tests, build —
all pass. No commit/push; hosted Supabase and production untouched. See
`docs/LOCAL_VALIDATION_2026-09-24.md` for the full report and the access
matrix.

## 2026-09-26 execution strategy

The owner approved a local-first completion path because both available Free
Plan Supabase projects are active and important. Supabase remains the backend;
no paid staging project is planned. Remaining login, Management Center,
catalog/configuration and migration rehearsal work will run against the real
local Supabase stack.

Production remains untouched and unauthorized. After the local gates pass, a
separate production-readiness stage will prepare read-only collision checks,
verified database/Storage backups, target guards, a short maintenance window
and frontend rollback. V4 will then be added beside the retained legacy
objects, followed by a limited pilot. See
`docs/HOSTED_EXECUTION_ROADMAP.md` for the current sequence.

### 2026-09-26 - Stage 1: real login on local Supabase (uncommitted)

The non-demo login is wired: `LoginPage` -> `AuthContext.signInWithPin` ->
`pin-login` -> `supabase.auth.setSession()`, with fail-closed authorization,
session restore/refresh/logout and role redirect. Validated ONLY against the
local Supabase stack (real browser flows for owner, manager, branch_manager,
cashier, employee; wrong PIN, unknown code, inactive, lockout, reload, refresh,
logout, unauthorized routes) plus the full local backend suites and 207 app
tests. Hosted/staging: NOT DONE. Production: untouched. Demo mode unchanged
and zero-network. See `docs/LOCAL_LOGIN_VALIDATION_2026-09-26.md`.
