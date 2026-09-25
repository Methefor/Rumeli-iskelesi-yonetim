# Stage 1 - real login on local Supabase (2026-09-26)

Scope: local Supabase only. Hosted/staging: NOT DONE. Production
(`iwikwbjsznjuefvuemdb`): untouched, never contacted. Not committed.

## What was built
- `services/supabase/pinLogin.ts`: typed `requestPinLogin` (contract taken from
  `supabase/functions/pin-login`: 200 tokens, 400/401 generic, 5xx unexpected)
  and `establishSession` (`supabase.auth.setSession`). Token shape validated;
  malformed/missing responses rejected; no logging; no-op in demo mode.
- `AuthProvider.signInWithPin`: resolves ok only after session + authorization
  are loaded. Fail-closed authorization (`fetchAuthorizationContext` now
  returns `active:false` on error / missing or inactive profile / no role, and
  the session is discarded). Stale-lookup guard, no authorization reload on
  `TOKEN_REFRESHED` for the same user.
- `LoginPage`: loading + double-submit guard, one generic credential message,
  separate network / unexpected messages, role redirect, redirect for a
  restored real session. The "not ready" path is gone.
- Local env safety: `app/.env.development.local` / `.env.production.local`
  (gitignored, higher priority than `.env.local`) +
  `scripts/assert-local-supabase.mjs` behind `dev:local` / `build:local`.
  Guard proven: aborts against the production host, passes for 127.0.0.1.
  `app/.env.local` was not modified.
- `supabase/tests/local_login_fixtures.mjs`: reproducible fake identities.

## Real browser flows (dev server on local stack, real GoTrue/PostgREST/Edge)
owner, manager, branch_manager, cashier, employee: login -> correct home,
name + role label, logout -> `/`. Wrong PIN, unknown code, inactive user,
locked account (5 failures, then correct PIN) all show the identical message.
Hard reload restores the session; an expired access token was refreshed
transparently from the stored refresh token. Logout clears tokens and the
per-user branch selection; deep link while logged out -> login. Cashier on
`/app/manager` and branch_manager on the owner/manager audit page: access
denied. A profile deactivated while signed in is signed out on next load.
Simulated network failure shows the separate connectivity message.

## Automated
Fresh local reset 001-015; timezone regression + RPC (32), inventory security,
backdated entry, backdated timezone matrix (24), Auth/PostgREST 137/137,
Storage 48/48, pin-login HTTP 45/45 all pass. App: typecheck, lint,
207 tests, `build:local` pass. Dist scan: 0 production refs, 0 `service_role`,
0 PIN/token strings.

## Known limits
- RLS does not check `profiles.is_active`: a deactivated user's already-issued
  token keeps working until expiry (<=1h) or the next app load; the client
  discards it on load. Server-side revocation (ban / RLS check) is Stage 2.
- Wrong-credential and lockout share one message by design; per-account
  lockout only, no IP rate limit.
- Local start printed the well-known local demo keys once to the terminal;
  they are the public Supabase local defaults, not secrets.
