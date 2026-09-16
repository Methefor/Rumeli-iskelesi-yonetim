# supabase/ — prepared, not applied

Everything in this directory is **design/review material only**. Nothing
here has been run against the production Supabase project.

- `migrations/001` through `007` — SQL migrations for the Phase C identity/
  authorization model. See `../MIGRATION_PLAN.md` for sequencing, review
  checklist, and how to actually apply them once approved.
- `functions/pin-login/` — a prepared Edge Function source, **not deployed**,
  with two explicit TODOs (employee lookup column, `service_credentials`
  mechanism) that must be resolved before it can be deployed. See
  `../AUTH_ARCHITECTURE.md` "PIN login flow".

Do not run `supabase db push`, `supabase functions deploy`, or apply any of
this SQL via the dashboard SQL editor without explicit approval — see the
warnings at the top of each file.
