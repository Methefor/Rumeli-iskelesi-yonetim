# Worklog

Reverse-chronological. One entry per work session.

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
