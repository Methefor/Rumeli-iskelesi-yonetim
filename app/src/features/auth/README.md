# auth

Status (2026-09-26): real login is wired and validated against the **local**
Supabase stack only. Hosted/staging: not done. Production: untouched.

- `routes/LoginPage.tsx` - employee code + PIN. Real mode calls
  `AuthContext.signInWithPin`, which runs the `pin-login` Edge Function
  (`services/supabase/pinLogin.ts`), hands the returned tokens to
  `supabase.auth.setSession()`, loads roles/branches, and only then resolves,
  so the redirect (`/app/manager` for owner/manager/branch_manager,
  `/app/employee` otherwise) never sees a half-loaded state. Every credential
  failure (wrong PIN, unknown code, inactive, locked) shows the same message;
  only a connectivity problem and an unexpected backend response differ.
  Raw backend text, PINs and tokens are never shown or logged.
- `app/providers/AuthProvider.tsx` - session restore on reload, silent token
  refresh (no reload of authorization for the same user), logout, and
  **fail-closed** authorization: a failed lookup, a missing/deactivated
  profile, or a user with no role discards the session instead of logging in
  with no permissions. Only the newest lookup may write state.
- Demo mode (`VITE_DEMO_MODE=true`, Preview only) is unchanged and makes zero
  Supabase/Auth/Function requests; `requestPinLogin` and `signInWithPin`
  refuse to run in demo mode even if imported.
- Route protection: `ProtectedRoute` / `RoleGuard` / `BranchGuard` in
  `app/router/guards/`. UI guards are convenience; RLS and the RPCs are the
  real boundary.

## Local development environment

`app/.env.local` in a developer checkout may point at the PRODUCTION project.
Do not use it for V4 work. Local real-login development uses the gitignored
`app/.env.development.local` and `app/.env.production.local` (Vite gives them
higher priority than `.env.local`), pointing at `http://127.0.0.1:54321`.
`npm run dev:local` and `npm run build:local` first run
`scripts/assert-local-supabase.mjs`, which resolves the effective URL the way
Vite does and aborts unless the host is 127.0.0.1/localhost. Never put the
service-role key in any `VITE_*` variable.

Fake local identities (codes L001-L007, PIN 2027, `.invalid` emails):
`node supabase/tests/local_login_fixtures.mjs` on a fresh local reset.

See `AUTH_ARCHITECTURE.md` and `docs/LOCAL_LOGIN_VALIDATION_2026-09-26.md`.
