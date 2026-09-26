# supabase/ — prepared, not applied

Everything in this directory is **design/review material only**. Nothing
here has been run against the production Supabase project.

- `migrations/001` through `007` — SQL migrations for the Phase C identity/
  authorization model. See `../MIGRATION_PLAN.md` for sequencing, review
  checklist, and how to actually apply them once approved.
- `functions/pin-login/` — a prepared Edge Function source, **not deployed**.
  `employee_code` is the resolved login handle and `service_credentials` was
  rejected outright (see `../DECISIONS.md`) — both earlier TODOs are closed.
  As of 2026-09-24 it has been exercised with real HTTP calls against the
  local edge runtime (`tests/pin_login.test.mjs`, 45 assertions) — still not
  deployed anywhere; see `../AUTH_ARCHITECTURE.md` "PIN login flow" and
  `../docs/LOCAL_VALIDATION_2026-09-24.md`.

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

## 015 — backdated-entry policy

`migrations/015_sales_backdated_policy.sql` (prepared, not applied to any
hosted project): Europe/Istanbul calendar-date backdated-entry limit on
sales reports. Executable tests: `tests/backdated_entry.test.sql` and
`tests/backdated_entry_timezone.test.sql` (run the same way as the Phase E
SQL suites above). See `../docs/LOCAL_VALIDATION_2026-09-24.md`.

## Storage and Edge Function — real executable tests (2026-09-24)

`tests/storage_policy.test.mjs` and `tests/pin_login.test.mjs` are the first
tests of `007_storage_policies.sql` (`avatars-v4`) and `functions/pin-login/`
against the real local Storage API / edge runtime, not SQL inspection —
run like `local_inventory_api.mjs` (`node tests/<file>.mjs`, fresh reset
first, `SUPABASE_CLI`/`DOCKER_CLI` env vars if needed). The Storage test
found and fixed a real bug in 007 (see `../DECISIONS.md` and
`../docs/LOCAL_VALIDATION_2026-09-24.md`); the Edge Function test found none.
Both remain local-only — nothing here has been deployed to any hosted
project.

## Migration 016 / employee-provision

`016_management_center.sql` plus `functions/employee-provision`. Tests:
`tests/management_center.test.sql` (real roles) and
`tests/management_center.test.mjs` (real HTTP, 76 assertions). A new Edge
Function directory is only served after `supabase stop` + `start`.

## Migration 017 / operating-data loader

`017_operating_data_loader.sql`; loader and data in `../operating-data/`.
Tests: `tests/operating_data_loader.test.mjs` (75 assertions incl. the full daily
flow on the synthetic catalogue). If Storage returns 500/42P10 after many
resets, run `supabase stop` + `start`.
