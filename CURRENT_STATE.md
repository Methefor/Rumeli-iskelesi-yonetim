# Current State

Last updated: 2026-09-21 (Phase E).

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

* Migrations 012-014 (prepared, not applied anywhere): generic branch-scoped
  inventory, append-only ledger, effective-dated cost, separate physical
  counts, product-linked sales lines. Validated only in a scratch Postgres
  harness; **local Supabase validation is open** (no Docker on this laptop).
* V4 now has a coherent shell (branch, identity, role, logout), real manager
  and employee homes, and inventory screens (overview, receive, waste,
  closing count, items, cost, gross profit, movements). Demo mode
  (`VITE_DEMO_MODE=true`) runs every screen on synthetic fixtures with zero
  Supabase requests.
* See `INVENTORY_MODEL.md`, `INVENTORY_SECURITY.md`. 2026 data untouched.

**Validation status (Phase E) — keep this distinction:**

| Item | Status |
|---|---|
| Phase E application / domain / UI tests (typecheck, lint, 150 unit + demo-flow tests, build) | **VALIDATED** |
| Migrations 012-014 | **PREPARED** (not applied anywhere) |
| PGlite security harness (`supabase/tests/inventory_security.test.sql`, ~150 assertions) | **PASSED, but NOT equivalent to real Supabase** (WASM Postgres + hand-written auth/storage shim; no GoTrue, PostgREST or real roles/grants) |
| Real local Supabase `db reset` + integration run | **OPEN** |
| Hosted / staging validation | **NOT DONE** |
| Production | **UNTOUCHED** |

The SQL must not be described as fully validated until it passes on a real
local Supabase stack.
