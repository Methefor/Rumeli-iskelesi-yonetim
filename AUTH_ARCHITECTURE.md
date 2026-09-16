# Auth Architecture (Phase C — design, not yet live)

Status: **design + prepared code only**. Nothing described here is running
against production. Migrations live in `supabase/migrations/001-006`
(not applied); the Edge Function lives in `supabase/functions/pin-login/`
(not deployed); the frontend scaffold lives in `app/src/app/providers/Auth*`,
`app/src/app/router/guards/`, and `app/src/features/auth/` (deployed as part
of the V4 app, but functionally inert — there is nowhere yet to log in).

## Why this exists

The live Supabase audit (confirmed 2026-09-17) found:
- `admins`/`cashiers` tables hold a plaintext `pin` column, matched via
  `.eq('pin', <value>)` directly from the browser.
- There is no Supabase Auth session anywhere in the legacy app.
- Cashier identity travels as a forgeable `?cashier_id=<uuid>` URL parameter.
- `admin-dashboard.html` has no session guard at all — reachable by URL.
- RLS is *enabled* on public tables but every policy is effectively public
  (`admins` public SELECT; `cashiers` public SELECT/UPDATE; `daily_reports`
  public SELECT/INSERT/UPDATE/DELETE; `daily_revenue`/`shift_schedule`/
  `targets` public ALL; `entry_history` public SELECT/INSERT).
- The `avatars` storage bucket is public, with anon SELECT and INSERT.

This document designs the replacement. It does not fix the findings above —
that happens at cutover (Phase L), after V4 is validated. See
`CURRENT_STATE.md` and `DECISIONS.md`.

## 1. Identity model

```
auth.users (built-in)
  └── profiles (id = auth.users.id, full_name, phone, avatar_url, is_active,
                legacy_cashier_id for traceability)
        ├── user_roles ──── roles (owner, manager, branch_manager,
        │                          cashier, employee, viewer)
        │                     └── role_permissions ── permissions
        │                          (employee.read, employee.manage,
        │                           branch.manage, sales.create,
        │                           sales.edit_own, sales.edit_all,
        │                           shift.manage, performance.manage,
        │                           badge.manage, reports.read,
        │                           reports.export, settings.manage)
        └── branch_memberships ── branches (rumeli_iskelesi,
                                             iskele_dondurma, balik_ekmek)
```

`profiles.id` is always `auth.users.id` — there is no separate identifier.
Role and permission keys are data (rows), never hardcoded string comparisons
scattered through RLS or the frontend — see `supabase/migrations/001` and
`002`.

**Open question (not resolved in this phase):** how a person authenticates
to begin with — `profiles` has no login handle yet (email/phone/employee
code). The `pin-login` Edge Function assumes an `employee_code` but the
column/table to resolve it against `profiles` is intentionally left as a
`TODO` in that function's source (see `supabase/functions/pin-login/index.ts`)
rather than guessed at here. This needs an explicit decision before that
function can be deployed — likely a short numeric/text code separate from
`legacy_cashier_id`, decided alongside the Phase D data migration script
that populates `profiles` from legacy `cashiers`/`admins`.

## 2. PIN mechanism

PIN is a **fast unlock factor**, never an authorization mechanism and never
stored in plaintext.

- `pin_credentials` (`supabase/migrations/005`): `user_id`, `pin_hash`
  (pgcrypto `crypt()`/`gen_salt('bf')`), `failed_attempts`, `locked_until`,
  `last_attempt_at`. RLS enabled, **zero policies** — unreachable by
  anon/authenticated through PostgREST at all.
- `verify_pin(user_id, pin)`: `SECURITY DEFINER` RPC, granted only to
  `service_role`. Checks lockout, compares hash, updates
  attempt/lockout counters, writes an audit log row on lockout. Never
  returns or logs the hash or the submitted PIN.
- Lockout policy (documented as constants for now — no settings table
  exists yet, see `BACKLOG.md`): **5 failed attempts → 15 minute lockout.**

### Why an Edge Function is required (not just the RPC)

`verify_pin()` can answer "is this the right PIN," but a Postgres function
cannot mint a real Supabase Auth session — session issuance (access token +
refresh token) is GoTrue's job, not Postgres's, and there is no supported
way to fabricate a GoTrue-valid JWT from inside SQL/plpgsql.

**Chosen design:**
1. Browser → `pin-login` Edge Function: `{ employeeCode, pin }`. No
   Supabase client credentials involved at this point.
2. Edge Function (holds the `service_role` key — never shipped to the
   browser) resolves `employeeCode → user_id`, calls `verify_pin` via its
   service-role connection.
3. On success, the Edge Function calls
   `supabase.auth.signInWithPassword({ email, password })` using a
   per-profile, randomly generated, rotate-able password stored only in a
   service-role-only table (`service_credentials` — **not yet a migration
   in this phase**, an open design item below).
4. The resulting `{ access_token, refresh_token }` are returned to the
   browser over HTTPS. The browser calls `supabase.auth.setSession(...)`.

**Alternatives considered and rejected for now:**
- *Custom JWT signing* (sign a GoTrue-shaped JWT with the project's JWT
  secret directly in the Edge Function): works, but requires safely
  handling the project's JWT secret inside function code and keeping it in
  lockstep with any future Supabase JWT signing-key rotation. More moving
  parts than the chosen approach for no functional benefit here.
- *Supabase phone/OTP auth*: would mean every employee needs a real phone
  number on file and receiving SMS codes for a fast PIN-based shift login —
  wrong UX for this app's actual usage pattern (shared devices, fast
  numeric entry per the mobile-first requirements).

**Open design item — `service_credentials` table:** not written as a
migration in this phase because its own security shape (who can read it —
service_role only, certainly; how the random password is generated/rotated;
whether it's a separate table or a column on `pin_credentials`) deserves its
own review pass rather than being bundled into this one. Tracked in
`BACKLOG.md`. `pin-login/index.ts` has explicit `// TODO` markers at both
points that depend on it.

## 3. Session model

- **Login:** see PIN mechanism above. Not implemented end-to-end yet — the
  `LoginPage` UI shell shows an explicit "not ready" toast instead of a fake
  success (`app/src/features/auth/routes/LoginPage.tsx`).
- **Logout:** `useAuth().signOut()` → `supabase.auth.signOut()`
  (`app/src/services/supabase/auth.ts`). Fully functional today — it's a
  real, safe call regardless of what created the session.
- **Session restore:** `AuthProvider` calls `supabase.auth.getSession()` on
  mount and subscribes to `supabase.auth.onAuthStateChange`, exposing
  `status: 'loading' | 'authenticated' | 'unauthenticated'`. Once
  authenticated, it loads `roles`/`branchIds` via
  `fetchAuthorizationContext()`, which degrades to empty arrays (not a
  crash) if the Phase D schema doesn't exist yet.
- **Route guards** (`app/src/app/router/guards/`):
  - `ProtectedRoute` — requires `status === 'authenticated'`; shows
    `AuthLoading` while restoring; redirects to `/` otherwise. Identity
    comes only from the Supabase session — there is no code path that reads
    a URL parameter for identity anywhere in this scaffold, unlike legacy's
    `?cashier_id=`.
  - `RoleGuard` — takes `allow: string[]` of role keys; shows `Unauthorized`
    if the user's `roles` don't intersect. Already wired onto
    `/app/manager/*` (`allow: ['owner', 'manager', 'branch_manager']`) in
    `app/src/app/router/router.tsx`.
  - `BranchGuard` — takes a `branchId`; grants access to members of that
    branch or to `owner`/`manager` (org-wide bypass, mirroring the RLS
    design in `RLS_PLAN.md`). Built and tested, not yet wired into any route
    — no branch-specific screens exist until Phase E.
- **Unauthorized state:** shared `Unauthorized` component
  (`app/src/components/navigation/Unauthorized.tsx`), shown by both guards.
- **Loading state:** shared `AuthLoading` component (skeleton, `role=status`).

## 4. Audited actions

Per the brief, these are the actions that MUST go through
`write_audit_log()` (`supabase/migrations/005`) once their owning feature is
built: PIN reset, role change, branch assignment, late/on-time override,
score override, badge override, report edit, report delete, employee
activation/deactivation. The RLS design (`RLS_PLAN.md`) permits some of
these as direct table writes for privileged roles as a safety net, but the
Management Center UI (Phase H) must route them through audited RPCs, not
raw table writes — noted inline in `006_rls_policies.sql`.

## 5. What is intentionally NOT done in this phase

- No migration has been applied.
- No Edge Function has been deployed.
- No real login is possible in the V4 app yet — `LoginPage` is a shell.
- The legacy app's plaintext-PIN login, `?cashier_id=` pattern, and
  unguarded admin dashboard are all still live in production, unchanged.
