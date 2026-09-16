# auth (Phase C: preparation only)

Status: frontend scaffold exists, backend is not deployed.

- `routes/LoginPage.tsx` — a real UI shell (employee code + PIN fields,
  submit button) that is **not wired to Supabase**. Submitting shows an
  explicit "not ready" toast instead of faking success.
- The session model itself (`AuthProvider`/`useAuth`, `ProtectedRoute`,
  `RoleGuard`, `BranchGuard`) lives in `app/providers/` and
  `app/router/guards/` — it already tracks a real Supabase Auth session
  today, there's just no way to create one yet, because:
  - the `pin-login` Edge Function is prepared but not deployed
    (`supabase/functions/pin-login/`, two open TODOs), and
  - the `profiles`/`pin_credentials`/`roles` schema it depends on is
    prepared but not applied (`supabase/migrations/001-006`).

See `AUTH_ARCHITECTURE.md` at the repo root for the full login-flow design
and rationale, and `DECISIONS.md` for why the legacy plaintext-PIN pattern
was not ported here as a stopgap.
