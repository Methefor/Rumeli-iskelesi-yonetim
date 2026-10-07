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
- [x] Legacy sales transformation/import layer with X/Z rule, branch mapping,
      frozen-reference evidence, lineage, fingerprint and local real-source rehearsal.
      without mixing legacy compatibility logic into new business logic —
      mapping documented (not built) in `docs/LEGACY_RECONCILIATION.md`
      "Legacy adapter strategy".
- [ ] Production identity step: provision the owner-confirmed active roster
      (`identity-data/approved_staff.csv`) and privately map the five legacy
      cashier identifiers: two to active profiles, three to inactive no-login
      archival profiles (never migrate PINs or reassign historical authorship).
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

- [x] Replace the placeholder `manifest.webmanifest` icon with the existing
      Rumeli lighthouse artwork in 192px, 512px, maskable and Apple touch
      variants (local build/browser validated 2026-09-27).
- [x] Build-generated service worker via `vite-plugin-pwa`: precache only the
      static application shell and icons; do not runtime-cache Supabase/Auth/
      Storage/Function responses. Updates wait for an explicit user action.
      Offline business-data entry remains deliberately unsupported.
- [ ] Before the mobile pilot, split manager/employee feature routes into lazy
      chunks and measure first load on a throttled cellular connection. Current
      production bundle is about 690 KB minified / 198 KB gzip and triggers the
      Vite 500 KB chunk warning.
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

- [x] Owner approved Rumeli legacy categories, category mapping, registers and
      shift times on 2026-09-26; locally validated through the real loader.
- [x] Owner approved 2% warning / 5% error thresholds for all branches and the
      six supported waste reasons on 2026-09-26; locally validated.
- [x] Owner confirmed İskele Dondurma's S900 register and fixed year-round
      16:00-00:00 single-shift model; locally validated 2026-10-01.
- [x] Owner approved İskele Dondurma categories: Dondurma, Sıcak İçecek, Soğuk İçecek.
- [x] Owner approved Balık Ekmek: S900 register, daily 16:00-00:00 shift (cutoff
      00:00 next day), categories Balık Ekmek and Soğuk İçecek.
- [x] Owner approved legacy revenue mapping: balik_ekmek -> branch balik_ekmek,
      dondurma -> branch iskele_dondurma (for the Stage 4 adapter; not built).
- [ ] **Remaining owner input** (Gate 3): Pavo activation name/date; real product
      catalogue; product-to-category mapping; opening stock from a physical count;
      dated unit costs.
      See `operating-data/OWNER_INPUT_CHECKLIST.md`.
- [ ] Re-run the daily-operation rehearsal on the real catalogue once supplied.
- [ ] Hosted/staging validation of 017 and the loader flow (NOT DONE).
- [x] Legacy sabah/aksam map to V4 morning/evening.
- [x] Balık Ekmek / Dondurma revenue fields map to their branches (approved 2026-09-26).

- [x] Owner corrected İskele Dondurma categories to Dondurma + Su (supersedes the
      earlier three-category approval); mapping removals built (migration 018).
- [ ] Remaining Gate 3 input: Pavo activation name/date; real product catalogue;
      product-to-category mapping; opening stock; dated unit costs.

## Manager Dashboard follow-ups (2026-09-27)

- [x] Rebuild the Manager Dashboard as an operational control center and prepare
      the approved package for Preview review (see DASHBOARD_MODEL.md).
- [ ] Previous-period comparison (same length/rules, clearly labelled) — not
      implemented in this phase.
- [ ] A custom date-range picker in the UI (the domain/service support
      already exists: `resolveCustomPeriod`/`validateCustomRange`).
- [ ] Waste VALUE on the dashboard (currently a count only — cost is not
      readable by every role).
- [ ] A trusted, explicitly-wired historical (pre-V4) data source before any
      "2026 history" mode is added — LEGACY_RECONCILIATION.md's gap is still
      open.

## Workforce and receipt workflow follow-ups (2026-10-01)

- [x] Build cashier shift-change requests with mandatory reason, requested
      date/shift, pending state, manager approve/reject decision and audit log.
- [x] Add an in-app manager notification badge/inbox for pending requests.
      Web Push remains a later enhancement and must not require a paid service.
- [x] Add zero-cost, on-device receipt OCR as a review-only draft helper.
- [x] Allow cashier/employee stock receipts for their own branch while keeping
      cost and adjustment permissions denied.
- [ ] Decide whether verified receipt photos need private Supabase Storage
      retention. The first OCR version does not upload or retain the image.
- [x] Re-run fresh local Supabase reset and Auth/PostgREST permission tests
      after Docker Desktop restarted.
- [x] Show the pending shift-request count globally in the manager navigation.
- [x] Add a direct Stok Girişi shortcut to the employee home for roles with
      own-branch receiving permission.

## Production preparation follow-ups (2026-10-04)

- [x] Bootstrap (`bootstrap-owner.mjs`) and owner PIN rotation (`rotate-owner-pin.mjs`) built and tested locally; production execution still needs approval.
- [ ] Build a guarded production operating-data loader (current one refuses non-local hosts) or approve another way.
- [ ] Decide the pilot front-end deployment method (Vercel writes) and the legacy write-freeze procedure.
- [ ] Decide handling of ~490 historical flagged reconciliation reports (no bulk override exists).
- [x] Importer now writes ONE `legacy_sales_import_applied` audit row per live import (2026-10-05). Optional: verify fingerprint-to-rows inside SQL.
- [ ] Cutover-time backup, final fingerprint and owner approvals (see `PRODUCTION_READINESS.md`); all production WRITE steps remain NOT DONE.
- [x] Superseded: "840-report plan / 541 rows / importer refuses hosted apply" - plan is now rows + Balık + Dondurma (845 on the latest snapshot) and hosted apply is possible only through the multi-key guard.

## Readiness blockers closed (2026-10-05)

- [x] Owner bootstrap tool, production operating-data runner, historical reconciliation policy, pilot frontend plan, legacy freeze runbook.
- [ ] Still OPEN (owner action): freeze + final fingerprint approval, identity map review, provisioning, verified cutover backup, pilot frontend creation, pilot.

## Final hardening (2026-10-05)

- [x] Owner break-glass PIN rotation (`rotate-owner-pin.mjs`, `internal_rotate_owner_pin`).
- [x] One import-level audit event per live legacy import; none for dry run / failure / repeat.
- [x] `override_reconciliation` refuses imported historical reports server-side.
- [x] `internal_bootstrap_owner` exposure reviewed: service_role only, closed once any owner exists.
- [ ] Optional: a separate annotation mechanism for historical findings (not needed for cutover).
- [ ] Still OPEN (owner action): DATA APPLY needs a real production backup, legacy write freeze, final stable fingerprint, approved private identity mapping, real identity provisioning and explicit owner approval; PILOT/CUTOVER needs pilot frontend creation, pilot execution, real mobile/device QA and explicit owner approval.

## Analytics Engine V1 (2026-10-06, development only)

- [x] Migration `20261006000100_analytics_engine_v1.sql`: `external_context_daily`, `daily_analytics_snapshots`, `weekly_analytics_snapshots`, `analytics_insights`, `analytics_reports`; permissions `analytics.read|financial.read|ai.read|regenerate`; RLS and redacted read RPCs.
- [x] Deterministic metrics (business-day X/Z revenue: FINALIZED by Z, PROVISIONAL with X only; transactions, derived basket, line detail only where its X/Z semantics are not unknown, gross profit only with cost coverage, origin-aware legacy limits, previous day / week / 4-week finalized baseline, weekly changes) in SQL with a tested TypeScript twin.
- [x] Explicit completeness model (complete / partial / unsupported + reason codes), central analytics settings, multi-register regression test.
- [x] Fact / relationship / hypothesis confidence model, weather/context model, immutable versioned snapshots, stale detection, audited regeneration.
- [x] AI report contract with strict validation and failure containment (no provider wired).
- [x] Mobile-first analytics UI (summary, daily, weekly, products, hourly-unsupported, weather) and tests.
- [ ] Owner decisions listed in `ANALYTICS_MODEL.md` (X/Z item-line semantics, thresholds, pay period, weather/holiday sources, regenerate rights, scheduling, AI provider).
- [ ] Review the manager dashboard revenue against the business-day X/Z rule (it groups per shift; a morning X and an evening Z on different shifts would be summed).
- [ ] Apply the migration to production (separate owner-approved write, after review).
- [ ] Scheduler for daily/weekly snapshots; weather/holiday loader; AI Edge Function; organization-level rollup.

## Phase 1E - daily + weekly manager narrative (2026-10-07, development only, local)

- [x] Migration `20261007000100_manager_reports.sql`: read-only batch read model `get_manager_report_inputs` (no table; teardown now 46 tables, 5 views, 147 functions; the teardown test expects 51 relations).
- [x] Domain `domain/managerReport`: daily + weekly Fact Pack (support states, limitations, evidence registry, provenance), recurrence (frequency only), narrative validator, deterministic Turkish renderers, AI input/output contract + fallback (no provider).
- [x] Pages `/app/manager/reports/daily-summary`, `/weekly-summary` + Command Center links; synthetic QA scenarios; SQL, domain, demo, request-count and UI tests.
- [ ] Apply migration `20261007000100` to production (separate owner-approved write; the earlier unapplied migrations too).
- [ ] Owner decisions: AI provider/model/budget, delivery channel and report time, tone policy, notifications, whether recurrence needs owner-configured thresholds (see `MANAGER_REPORT_MODEL.md`).
- [ ] When an AI provider exists: server-side generation + append-only `manager_report_snapshots` (the runtime `ReportMetadata` fields are defined; a persisted audit trail does not exist in V1); per-day storage of stock/order state to support low-stock/overdue recurrence.

## Phase 1D - Command Center + weather (2026-10-07, development only, local)

- [x] Migrations 700/800: forecast snapshots (append-only, `weather.read`), historical context columns with provenance (Open-Meteo archive = reanalysis, never observed) + loaders, central technical TTL (`weather_settings`), `get_branch_weather`, `get_branch_operations_signals`, batch `get_dashboard_inputs` / `get_command_center_signals`.
- [x] Weather provider abstraction + Open-Meteo adapter + local-only loader (tests with injected fetch); weather domain (conditions, facts-only context, freshness).
- [x] Command Center page: today summary, attention engine, operations, weather, analytics summary; synthetic QA scenarios; tests; teardown (46 tables, 5 views, 146 functions at that time; 147 with Phase 1E; the teardown test expects 51 relations).
- [ ] Apply migrations `20261006000700..800` to production (separate owner-approved write; earlier unapplied migrations too).
- [ ] Owner decisions: real branch coordinates, loader scheduling/hosting/retention, thresholds that may justify critical stock/count/weather alerts, notifications (see the two model docs).
- [x] Weekly manager summary narrative: done in Phase 1E (deterministic; AI later).
- [ ] Deeper weather relationships (product/category, wind), detailed weather page.

## Phase 1C - procurement core (2026-10-06, development only, local)

- [x] Suppliers, item supply parameters, purchase orders + lines + status history + receipt links (migrations 500/600), RLS, audited RPCs.
- [x] State machine (DRAFT..RECEIVED, CANCELLED terminal), receiving via the existing RECEIPT ledger path (partial/full, no double receive), close short.
- [x] Order calendar (branch time zone, estimated delivery), suggestion primitives, Command Center read models, manager screens, synthetic QA data, tests, teardown.
- [ ] Apply migrations `20261006000500..600` to production (separate owner-approved write; Phase 1B and analytics migrations are also still unapplied).
- [x] Hardening: unit contract (base vs order unit, frozen pack snapshot), receiving concurrency/atomicity, fulfillment reconciliation, supplier/item deactivation behaviour.
- [x] Owner decisions for V1 (recorded in `DECISIONS.md` / `PROCUREMENT_MODEL.md`): PO receiving = option A (owner/manager/branch_manager; generic `inventory.receive` unchanged), self-approval allowed, a reversed receipt never reopens the PO (reconciliation warning).
- [ ] Still open: real suppliers/rules/thresholds, multiple suppliers per item, reopening a cancelled order, over-receipt tolerance (see `PROCUREMENT_MODEL.md`).
- [ ] Surface procurement attention in the Command Center; sales-velocity/weather-aware suggestions; central-warehouse stock visibility; invoices/payments (out of scope).

## Phase 1B — inventory control (2026-10-07, development only, local)

- [x] `waste_reasons` catalogue (FK replaces the fixed CHECK; historical six seeded; code immutable; deactivate only; audited RPCs; RLS: managers all, entry roles active only).
- [x] Fire report `get_waste_report` (item/reason/employee/shift, cost states, reversed entries excluded) + manager screen.
- [x] Closing-count classification (balanced/shortage/surplus; timing_uncertain/unexplained; waste recorded after the count is only a candidate, never a confirmed explanation) + review RPCs + manager overview/drill-down screens.
- [x] Branch location: `branches.timezone` + management-only `branch_locations` (optional validated coordinates, address, label; `branches` grants untouched) + audited `update_branch_location` + form.
- [x] Teardown regenerated (38 tables, 5 views, 113 functions), synthetic QA scenarios, SQL/domain/demo/UI tests.
- [ ] Apply migrations `20261006000200..400` to production (separate owner-approved write, after review; the analytics migration is also still unapplied).
- [ ] Owner decisions: final fire reason catalogue, count tolerance/approval rules, real branch coordinates, weather provider, who may correct counts (see `INVENTORY_CONTROL_MODEL.md`).
- [ ] Decide whether waste entries need a reliable effective event time (prerequisite for any `explained_by_waste`).
- [ ] Surface "missing closing count" / unexplained variance in the Command Center (building blocks exist, not integrated yet).
- [ ] Fire-report scheduling/notifications; branch create/edit beyond location fields.
