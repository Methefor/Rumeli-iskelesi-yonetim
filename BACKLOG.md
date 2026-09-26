# Backlog

Not commitments or dates — a working list, grouped roughly by the phases
in the original brief. Move items up when a phase actually starts.

## Immediate blocker for Phase C completion

- [x] Database-side audit: live schema, RLS policies confirmed
      (2026-09-17) — see `AUTH_ARCHITECTURE.md` "Why this exists" and
      `RLS_PLAN.md` "Confirmed current production state".
- [x] Security review of the Phase C design, and fixes applied
      (2026-09-17): `profiles` self-update column restriction,
      `branch_manager` branch-scoping, RPC-only critical writes,
      `service_credentials` rejected in favor of `generateLink`/`verifyOtp`
      — see `DECISIONS.md` and `WORKLOG.md`.
- [x] Decide the login-handle column — resolved as `profiles.employee_code`
      (`001_profiles_roles.sql`), see `AUTH_ARCHITECTURE.md` "Login handle".
- [ ] Backup strategy for the Supabase project before any schema migration
      (still needed before migrations 001-008 are applied, even to staging).
- [x] **Local staging smoke test (2026-09-17)** — full Phase C flow run
      against a local Supabase stack (Docker): migrations 001-008,
      `generateLink`/`verifyOtp` session minting, RLS per role, audited
      RPCs, PIN lockout/security. 39/39 assertions pass, zero email sent.
      Found and fixed two real defects (pgcrypto schema qualification;
      `verifyOtp` email+token_hash conflict) — see `DECISIONS.md` and
      `WORKLOG.md`. Result: LOCAL PASS.
- [ ] **Cloud staging validation still recommended** before production
      deployment — local GoTrue is believed configuration-identical to a
      hosted Supabase project for this flow, but that was not confirmed
      against an actual hosted project in this session. Low-risk relative
      to the design-level uncertainty that existed before the local test;
      see `AUTH_ARCHITECTURE.md` "Live-verified".
- [ ] Investigate the `daily_reports` vs frozen-presentation-totals
      discrepancy — see `docs/LEGACY_RECONCILIATION.md`. Needs live
      read-only DB query access, not available in this session.

## Phase C — Auth & authorization

- [x] Design complete: identity model, PIN mechanism, session model, RLS
      policies, storage policies, audit logging, audited admin RPCs — see
      `AUTH_ARCHITECTURE.md`, `RLS_PLAN.md`, `MIGRATION_PLAN.md`. Prepared as
      SQL in `supabase/migrations/001-008`, **not applied**.
- [x] Security review round complete (2026-09-17) — see `DECISIONS.md`.
- [x] Frontend scaffold: `AuthProvider`/`useAuth`, `ProtectedRoute`,
      `RoleGuard`, `BranchGuard`, login UI shell, logout action, session
      restore, loading/unauthorized states — all in `app/`, unit-tested,
      not connected to a working backend yet.
- [ ] Deploy `pin-login` Edge Function to a real (cloud) Supabase project —
      local staging passed (see above); a hosted-project run is
      recommended, not blocking, before this.
- [ ] Apply migrations 001-011 to a staging Supabase project, run the
      policy test plan in `RLS_PLAN.md`, then production (see
      `MIGRATION_PLAN.md` sign-off checklists).
- [ ] Wire `LoginPage` to the real Edge Function + `supabase.auth.setSession`
      once deployed.
- [ ] Fix the two currently-live exposures found in the Phase A audit:
      forgeable `?cashier_id=` identity, and admin-dashboard.html having no
      session guard at all. (Legacy files stay untouched until this is
      approved and ready to ship — see CURRENT_STATE.md.)

## Phase D — Normalized core schema

- [x] Identity/authorization tables prepared ahead of schedule during Phase
      C prep: `profiles`, `roles`, `permissions`, `role_permissions`,
      `user_roles`, `branches`, `branch_memberships`, `audit_logs` — see
      `supabase/migrations/001-004`, not applied yet.
- [x] Core operational tables (2026-09-17): `shift_definitions`,
      `registers`, `sales_categories`, `sales_category_branches`,
      `reconciliation_thresholds`, `shifts`, `shift_assignments`,
      `sales_reports`, `sales_report_items`, `sales_report_overrides` —
      `supabase/migrations/009-011`, RLS + audited RPCs, **local-staging-
      validated (34/34 integration assertions + live browser drive-through)**,
      not applied to any staging/production project. See
      `CORE_DATA_MODEL.md`, `SHIFT_MODEL.md`, `SALES_MODEL.md`.
- [x] Frontend feature scaffolding for shifts/sales (2026-09-17): seven
      functional mobile-first screens (employee: My Shift, New Sales
      Report, My Recent Reports; manager: Shift Overview, Assign Shift,
      Sales Overview, Reconciliation Queue), `services/supabase/{shifts,
      sales}.ts`. No analytics dashboard yet — matches the brief.
- [ ] `tasks`, `performance_events`/`performance_scores` (rules live in app
      config per `domain/scoring`), `badge_definitions`, `employee_badges`
      — explicitly deferred past Phase D core; RLS design template exists,
      see `RLS_PLAN.md` "Future operational tables".
- [ ] İskele Dondurma inventory/waste/cost depth — explicitly deferred
      until the core sales/shift model (just built) is validated in a real
      environment, per the Phase D brief.
- [ ] Balık Ekmek shift_definitions / sales_category_branches — not seeded
      in this pass (lower priority per the brief); needs an explicit
      follow-up once someone confirms its actual shift pattern.
- [ ] Legacy adapter layer so `daily_reports` etc. remain readable/reproducible
      without mixing legacy compatibility logic into new business logic —
      mapping documented (not built) in `docs/LEGACY_RECONCILIATION.md`
      "Legacy adapter strategy".
- [ ] Data migration script: legacy `cashiers`/`admins` rows → `profiles` +
      `pin_credentials` (hash re-derived or PINs reset — plaintext PINs are
      never carried forward as plaintext). Separate, explicitly-approved
      step per `MIGRATION_PLAN.md`.

## Phase E/F — Employees, branches, shifts, Rumeli sales reporting

- [ ] Real screens replacing `features/branches`, `features/employees`,
      `features/shifts`, `features/sales` placeholders.
- [ ] Configurable category definitions (currently hardcoded columns in
      legacy: gıda, kahvaltı, kahve, meyve suyu, sıcak/soğuk içecek, tatlı,
      salata, dondurma, börek&çörek).
- [ ] Wire `CurrencyInput` + `domain/revenue` into an actual entry form.

## Phase G — Analytics & reconciliation

- [ ] `components/charts` — pick a charting library, build trend/comparison
      primitives.
- [ ] Wire `domain/reconciliation.reconcile` into a real screen with
      manager-override-with-reason + audit trail.
- [ ] Today vs yesterday / week vs week / month vs month / season vs season
      comparisons, each separating absolute change, % change, and drivers.

## Phase E follow-ups (inventory)

- [ ] **Local Supabase validation** (Docker): `supabase db reset` from 001, then
      run `supabase/tests/inventory_security.test.sql`. Only a scratch-PGlite run exists.
- [ ] Apply 012-014 to a staging project + policy test plan (`INVENTORY_SECURITY.md`).
- [ ] Business input needed: real Dondurma catalogue (codes/units/categories),
      opening stock, costs, waste reason codes, who may receive stock (currently
      manager/branch_manager only).
- [ ] Edit / cancel sales-report UI (RPCs and ledger handling exist; no screen yet).
- [ ] Pagination for movement history; per-item sell-through report screen.
- [ ] Review 011 cutoff timezone (session tz vs Istanbul).
- [ ] Balık Ekmek inventory/shift setup (out of scope by design).
- Deferred by design: recipes/unit conversion, transfers, procurement, generic tasks, performance/badges, 2026 migration.

## Phase H/I — Performance, badges, İskele Dondurma

- [ ] Management Center screens (create/disable employee, assign
      branch/role, reset PIN, manage shift times, lateness tolerance,
      scoring rules, badge definitions, review late entries/overrides,
      audit log viewer).
- [ ] Dondurma module: inventory_items, stock_movements, waste_records,
      product_costs; revenue/day, avg basket, revenue/labor-hour, waste %,
      gross margin (never claim net profit without full cost data).

## Phase J — Legacy migration & regression testing

- [ ] Regression fixtures from 2026 historical data using the known
      reference totals (June 5,056,781.50 / July 5,026,842.50 / August
      5,959,133.74 / 3-month total 16,042,757.74 TRY; Rumeli main
      13,383,339.24 / Balık 762,181.50 / İskele Dondurma 1,897,237.00 TRY).

## Phase K/L — PWA/mobile QA, production cutover

- [ ] Replace the placeholder `manifest.webmanifest` icon (currently just
      the Vite default favicon.svg) with real production icons.
- [ ] Build-generated service-worker/caching strategy (e.g. a Vite PWA
      plugin) — deliberately not added in Phase B to avoid caching
      Supabase responses before there's real data-fetching code to reason
      about; must guarantee Supabase requests never serve stale cached
      business data.
- [ ] Real device QA pass (~95% of usage is mobile per the brief).
- [ ] Migrate/retire the legacy public `avatars` bucket once V4 fully uses
      `avatars-v4` (`supabase/migrations/007`, not applied) — not before
      cutover.
- [ ] Controlled cutover plan — do not touch production until explicitly
      approved.

## Housekeeping (low priority, not blocking)

- [ ] `PROJE_YAPISI.md` at the repo root is stale (describes a
      Google-Sheets/Alpine.js stack that no longer exists) — flagged in the
      Phase A audit as safe to delete or replace once someone confirms
      nothing external links to it.
- [ ] `animated-login-register/` at the repo root is unreferenced by any
      live page — flagged as safe to remove, not yet removed.


### 2026-09-21 validation follow-up

- Enable a local Docker-compatible runtime after system-installation approval; fresh reset 001-014 and real Auth/PostgREST inventory validation remain required.
- Execute prepared timezone SQL regression and actual create_sales_report RPC boundary tests across session timezones.
- Decide branch_manager direct adjustment/reversal/count-void policy; preserve current grants until approval. Include linked-count adjustments and shift-assignment bypass in decision.
- Review existing backdated-entry policy separately from timezone correction.


###  2026-09-22 — validation follow-up resolved

Previous Docker installation, fresh 001– 014 reset, real Auth/PostgREST inventory checks and SQL/RPC timezone checks are complete. Cashier direct-action policy decided and prepared locally. Remaining: investigate local Vector Docker log connection refusal; optional audit pagination/date filtering beyond last 100 entries; retain separate backdated-entry policy review. No production deployment authorized.

### 2026-09-22 (later) — cashier grant rolled back

- Cashier `inventory.adjust` grant reverted; cashier/employee now identical for inventory (read/record/count, own branch, nothing privileged).
- branch_manager additionally lost `reverse_inventory_movement` (owner/manager only from now on) — a deliberate narrowing beyond just undoing the cashier grant.
- Still open: local Vector Docker log connection refusal (cosmetic); audit pagination/date filtering beyond last 100 entries; backdated-entry policy review (separate from the timezone fix). No production deployment authorized.

### 2026-09-24 — backdated policy shipped; Storage/Edge Function validated

- Backdated-entry policy review above is now resolved: see `015_sales_backdated_policy.sql` and `DECISIONS.md`.
- New: `storage.buckets` has RLS enabled with zero policies by default (a Supabase Storage default, not something 007 introduced) — the `/storage/v1/bucket/:id` metadata endpoint 404s for every role. Does not affect object read/write. Worth a one-line policy addition only if the client ever needs to list/query bucket metadata directly (it currently doesn't).
- `pin-login`'s "not live-verified against a real Supabase project" note in `AUTH_ARCHITECTURE.md` is now materially stronger (real local HTTP, real edge runtime, real lockout/concurrency/session checks) but still not a hosted/staging run — that smoke test is still recommended before any deployment.
- Still open: local Vector Docker log connection refusal (cosmetic); audit pagination/date filtering beyond last 100 entries. No production deployment or hosted migration authorized.

### 2026-09-26 — approved local-first priority order

The earlier standalone hosted-staging task is superseded by the approved
local-first sequence in `docs/HOSTED_EXECUTION_ROADMAP.md`:

1. Wire and validate real PIN login against local Supabase.
2. Build and validate Management Center/user provisioning locally.
3. Load and approve realistic catalog and operating configuration locally.
4. Rehearse legacy reconciliation and migration locally.
5. Prepare a separately authorized production inspection, backup and cutover
   package.
6. Perform a short, controlled side-by-side production deployment and limited
   pilot only after a new explicit approval.

Do not use the production-bound gitignored `app/.env.local` for local
non-demo work. No paid staging project, production access or production
mutation is authorized by this backlog update.

### 2026-09-26 - after Stage 1

- Server-side revocation: RLS/RPCs do not check `profiles.is_active`; an issued
  token of a deactivated user lives until expiry (Stage 2 with user management:
  ban the auth user and/or add an active check to the RLS helpers).
- `app/.env.local` (developer machines) still points at production. Local
  development and local builds must continue through the guarded scripts and
  higher-priority gitignored local env files. Remove or replace the stale file
  during the later production-readiness configuration review.
- Stage 2 (Management Center) has not started. Separate hosted staging is no
  longer planned; the next gate remains local-only under the approved roadmap.

## Stage 2 follow-ups (Management Center)

- [x] Server-side `is_active` enforcement for old JWTs (closed by 016).
- [ ] Hosted/staging validation of 016 and `employee-provision` (NOT DONE;
      local only).
- [ ] Owner-only role management for owner/manager grants (owners are
      intentionally not modifiable via RPC today).
- [ ] No lateness-tolerance column exists in the schema; not offered in UI.
- [ ] Demo owner/branch_manager profiles are non-login demo records.
- [ ] New Edge Functions need `supabase stop` + `start` locally to be served.

## Stage 3 follow-ups (operating data)

- [ ] **Owner input** (Gate 3): see `operating-data/OWNER_INPUT_CHECKLIST.md`
      (approve legacy categories/registers/shift times; Balık Ekmek and Iskele
      Dondurma structure; thresholds; catalogue, opening stock, costs).
- [ ] Re-run the daily-operation rehearsal on the real catalogue once supplied.
- [ ] Hosted/staging validation of 017 and the loader flow (NOT DONE).
- [ ] Decide how legacy sabah/aksam and the Balık Ekmek / Dondurma revenue
      fields map to V4 (needed by the Stage 4 adapter).
