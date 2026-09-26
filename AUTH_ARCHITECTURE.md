# Auth Architecture (Phase C — design, not yet live)

Status: **design + prepared code only**. Nothing described here is running
against production. Migrations live in `supabase/migrations/001-008`
(not applied); the Edge Function lives in `supabase/functions/pin-login/`
(not deployed, and the session-minting step is not live-verified — see
"PIN login flow" below); the frontend scaffold lives in
`app/src/app/providers/Auth*`, `app/src/app/router/guards/`, and
`app/src/features/auth/` (deployed as part of the V4 app, but functionally
inert — there is nowhere yet to log in).

**2026-09-17 security review round:** this document was updated after a
review found four blocking issues in the original design below (raw
`profiles` self-update with no column limit; `branch_manager` holding an
org-wide `employee.manage` grant; critical writes permitted as raw table
writes; a rejected `service_credentials` design). All four are fixed in the
current `001-008` migrations and this document — see `DECISIONS.md` for the
full reasoning behind each fix.

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

**Login handle (resolved 2026-09-17):** `profiles.employee_code` — a short,
unique, normalized code (`M001`, `K001`, `K002`, `D001`, `D002`; format
`^[A-Z][0-9]{2,4}$`, enforced by a check constraint in `001` and again in
`admin_set_employee_code()` in `008`). Deliberately NOT `legacy_cashier_id`,
which stays traceability-only and is never used for lookup. `employee_code`
is not client-writable at all (excluded from the column-level `UPDATE` grant
in `006`) — it is set only at Phase D provisioning time or via
`admin_set_employee_code()` (org-wide privileged only, audited). The
`pin-login` Edge Function resolves it directly; see "PIN login flow" below.

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

**Chosen design (updated 2026-09-17 security review):**
1. Browser → `pin-login` Edge Function: `{ employeeCode, pin }`. No
   Supabase client credentials involved at this point.
2. Edge Function (holds the `service_role` key — never shipped to the
   browser) resolves `employeeCode → profile.id` (via `profiles.employee_code`,
   see "Login handle" above), calls `verify_pin` via its service-role
   connection.
3. On success, the Edge Function looks up the profile's `auth.users` email
   (`adminClient.auth.admin.getUserById`), then calls
   `adminClient.auth.admin.generateLink({ type: 'magiclink', email })` and
   immediately `anonClient.auth.verifyOtp({ type: 'magiclink', token_hash, email })`
   itself — no email is ever sent, and the token_hash never leaves the
   function's server-side execution.
4. The resulting `{ access_token, refresh_token }` from `verifyOtp`'s
   session are returned to the browser over HTTPS. The browser calls
   `supabase.auth.setSession(...)`.

**Alternatives considered:**
- *`service_credentials` (a per-profile stored password + `signInWithPassword`)*
  — the original design. **REJECTED** in the security review: it requires a
  service-role-only table holding a plaintext-equivalent, readable password
  per employee, with its own generation/rotation/access-control surface to
  design and get right — an entire additional secret-management problem for
  no benefit over `generateLink`/`verifyOtp`, which uses only public,
  documented Supabase Auth Admin/Auth APIs and stores no password anywhere.
  See `DECISIONS.md`.
- *Custom JWT signing* (sign a GoTrue-shaped JWT with the project's JWT
  secret directly in the Edge Function): works, but requires safely
  handling the project's JWT secret inside function code and keeping it in
  lockstep with any future Supabase JWT signing-key rotation. More moving
  parts than the chosen approach for no functional benefit here.
- *Supabase phone/OTP auth*: would mean every employee needs a real phone
  number on file and receiving SMS codes for a fast PIN-based shift login —
  wrong UX for this app's actual usage pattern (shared devices, fast
  numeric entry per the mobile-first requirements).

**Live-verified against local Supabase (2026-09-17) — LOCAL PASS / CLOUD
STAGING VALIDATION STILL RECOMMENDED:** ran the full flow against a local
Supabase stack (`supabase start`, Postgres 17 + GoTrue + Kong + Edge Runtime,
all official Supabase images — the same images a hosted project runs).
Confirmed: (a) `generateLink`/`verifyOtp` mint a normal, refreshable session
(`access_token`/`refresh_token`, `session.user.id` matches the target
profile, `auth.uid()` resolves correctly in RLS, `/auth/v1/token?grant_type=
refresh_token` works); (b) Mailpit (the local stack's email capture) recorded
**zero** messages across the whole test run — `generateLink` genuinely does
not send mail; (c) the real `AuthProvider`/`ProtectedRoute`/`RoleGuard` chain
in `app/` correctly authenticates and authorizes using these tokens end to
end (see `WORKLOG.md`, 2026-09-17 local staging entry).

**2026-09-24 — real local HTTP test of the deployed-locally function
itself** (`supabase/tests/pin_login.test.mjs`, 45 assertions, still not
deployed to any hosted project): beyond the 2026-09-17 flow check, this
called the function over real HTTP as a browser would and additionally
confirmed — identity is `employee_code` only, never a legacy id shape;
wrong PIN, wrong employee_code, an inactive user, and a user with no
`pin_credentials` row all fail with the **byte-for-byte identical** generic
`401`; server-side PIN format validation rejects malformed input before any
DB lookup; `verify_pin`'s row lock correctly serializes 5 concurrent
wrong-PIN requests to exactly 5 recorded failures and exactly one lockout
audit row (no lost updates, no audit flooding); a correct PIN presented
while locked is still rejected; a successful login resets the failure
counter; the returned session both resolves via `/auth/v1/user` and
authorizes a real RLS-scoped PostgREST read; the refresh-token flow works;
and — checked against the local Mailpit catcher, not just read from the
source — no email is sent by a successful login. No defects found this
time. See `docs/LOCAL_VALIDATION_2026-09-24.md`.

Two real defects surfaced ONLY by this live run (both fixed, see
`DECISIONS.md`):
1. `verify_pin()` (and the `admin_reset_pin()` RPC copying its pattern)
   called unqualified `crypt()`/`gen_salt()` inside a function that pins
   `search_path = public` — but pgcrypto lives in the `extensions` schema on
   both local and hosted Supabase, so every PIN check failed with
   `function crypt(text, text) does not exist` until schema-qualified.
2. `pin-login`'s `verifyOtp` call passed `email` alongside `token_hash` —
   supabase-js rejects this combination outright ("Only the token_hash and
   type should be provided"); the login failed with `sign_in_failed` on
   every call until `email` was removed from that call.

Why "cloud staging still recommended" rather than a full GO: local GoTrue is
believed configuration-identical to hosted Supabase for this flow (same
image family, no local-only auth settings involved), but this session had no
access to an actual hosted project to confirm that byte-for-byte — e.g. mail
provider wiring, custom SMTP, or a hosted-only auth setting could in
principle change `generateLink`'s no-send behavior. Treat the *design and
code* as proven; treat the *specific hosted project's configuration* as the
one remaining unverified variable before production deployment.

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
activation/deactivation.

As of the 2026-09-17 security review, the ones that exist today are **audited
SECURITY DEFINER RPCs in `supabase/migrations/008_admin_rpcs.sql`**, not raw
table writes — `006_rls_policies.sql` grants no direct client
INSERT/UPDATE/DELETE on `user_roles` or `branch_memberships` at all, and
excludes `profiles.is_active`/`employee_code` from the client's column-level
`UPDATE` grant:

| Action | RPC |
|---|---|
| Role assignment | `assign_role(user_id, role_key, reason)` |
| Role revocation | `revoke_role(user_id, role_key, reason)` |
| Branch assignment | `assign_branch_membership(user_id, branch_id, is_primary, reason)` |
| Branch removal | `remove_branch_membership(user_id, branch_id, reason)` |
| Employee activation/deactivation | `admin_set_employee_active(user_id, is_active, reason)` |
| PIN reset | `admin_reset_pin(user_id, new_pin, reason)` |
| Employee code change | `admin_set_employee_code(user_id, employee_code, reason)` |

Late/on-time override, score override, badge override, and report
edit/delete have no owning table yet (Phase D) — their RPCs will be added
alongside those tables, following this same pattern.

## 5. What is intentionally NOT done in this phase

- No migration has been applied.
- No Edge Function has been deployed — and even once approved for
  deployment, see the "Not live-verified" note above; the session-minting
  step needs one staging smoke test first.
- No real login is possible in the V4 app yet — `LoginPage` is a shell.
- The legacy app's plaintext-PIN login, `?cashier_id=` pattern, and
  unguarded admin dashboard are all still live in production, unchanged.

## Deactivation and provisioning (Stage 2, local)

Deactivating a user bans the auth user, deletes sessions, and the database
refuses any remaining token (`enforce_active_user`). pin-login already rejects
inactive users. New employees are created by the `employee-provision` Edge
Function: caller JWT verified server-side, role/branch authority read from
the database, the service role never reaches the browser, `.invalid` emails.
