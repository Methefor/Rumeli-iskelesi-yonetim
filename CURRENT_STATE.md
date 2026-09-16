# Current State

Last updated: 2026-09-16 (Phase B).

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

- `supabase/migrations/001-007` — the full identity/authorization schema +
  RLS + storage policies, as reviewable SQL. **Not applied to any
  database, staging or production.**
- `supabase/functions/pin-login/` — a prepared Edge Function source.
  **Not deployed**, and cannot be until two open design items are resolved
  (see `AUTH_ARCHITECTURE.md` "Open question" / "Open design item").
- A frontend auth scaffold in `app/` (`AuthProvider`, `useAuth`,
  `ProtectedRoute`, `RoleGuard`, `BranchGuard`, a `LoginPage` shell) that
  tracks a real Supabase session today but has no way to create one yet —
  submitting the login form shows an explicit "not ready" state.
- `docs/LEGACY_RECONCILIATION.md` — an **unresolved** finding that live
  `daily_reports` totals don't reproduce the frozen 2026 presentation
  totals. Not investigated further (no DB query access this session); do
  not build Phase J regression fixtures until this is resolved.

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
