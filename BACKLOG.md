# Backlog

Not commitments or dates — a working list, grouped roughly by the phases
in the original brief. Move items up when a phase actually starts.

## Immediate blocker for Phase C completion

- [x] Database-side audit: live schema, RLS policies confirmed
      (2026-09-17) — see `AUTH_ARCHITECTURE.md` "Why this exists" and
      `RLS_PLAN.md` "Confirmed current production state".
- [ ] Backup strategy for the Supabase project before any schema migration
      (still needed before migrations 001-007 are applied, even to staging).
- [ ] Decide the login-handle column (`profiles` has no email/phone/employee
      code to resolve a login against yet) — see `AUTH_ARCHITECTURE.md`
      "Open question".
- [ ] Design and migrate `service_credentials` (per-profile service password
      for the PIN-login password-grant flow) — see `AUTH_ARCHITECTURE.md`
      "Open design item".
- [ ] Investigate the `daily_reports` vs frozen-presentation-totals
      discrepancy — see `docs/LEGACY_RECONCILIATION.md`. Needs live
      read-only DB query access, not available in this session.

## Phase C — Auth & authorization

- [x] Design complete: identity model, PIN mechanism, session model, RLS
      policies, storage policies, audit logging — see `AUTH_ARCHITECTURE.md`,
      `RLS_PLAN.md`, `MIGRATION_PLAN.md`. Prepared as SQL in
      `supabase/migrations/001-007`, **not applied**.
- [x] Frontend scaffold: `AuthProvider`/`useAuth`, `ProtectedRoute`,
      `RoleGuard`, `BranchGuard`, login UI shell, logout action, session
      restore, loading/unauthorized states — all in `app/`, unit-tested,
      not connected to a working backend yet.
- [ ] Deploy `pin-login` Edge Function (blocked on the two open design
      items above — see its `// TODO` markers).
- [ ] Apply migrations 001-007 to a staging Supabase project, run the
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
- [ ] Remaining operational tables per the Phase A target model: `shifts`,
      `shift_assignments`, `sales_reports`, `sales_report_items`, `tasks`*,
      `performance_events`/`performance_scores` (rules live in app config
      per `domain/scoring`), `badge_definitions`, `employee_badges`. RLS
      design template for these already exists — see `RLS_PLAN.md` "Future
      operational tables".
- [ ] Legacy adapter layer so `daily_reports` etc. remain readable/reproducible
      without mixing legacy compatibility logic into new business logic.
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
