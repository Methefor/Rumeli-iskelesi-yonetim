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

## Phase E

`migrations/012`-`014` (inventory) are prepared, **still not applied to any
hosted/production project**. Executable DB assertions live in
`tests/inventory_security.test.sql`, `tests/timezone_regression.test.sql`,
`tests/timezone_rpc.test.sql`, and `tests/local_inventory_api.mjs` — run
**only** against a local/disposable database
(`supabase db reset --local --no-seed`, then feed each `.sql` file to `psql`
inside the `supabase_db_<project>` container; `local_inventory_api.mjs` needs
`SUPABASE_CLI`/`DOCKER_CLI` pointed at real executables if they aren't on
`PATH`). As of 2026-09-22 all four have passed against a real local Supabase
stack (Docker) — see `../docs/LOCAL_VALIDATION_2026-09-22.md`. That is local
validation, not hosted/staging validation, and does not by itself authorize
applying these migrations anywhere else.
