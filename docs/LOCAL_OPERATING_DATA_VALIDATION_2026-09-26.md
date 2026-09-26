# Local operating-data validation (Stage 3) - 2026-09-26

Scope: Stage 3 only, real LOCAL Supabase (Docker). Hosted, staging and
production were not contacted. Stage 3 was committed locally as `8a023bb` and
was not pushed. **Gate 3 remains INPUT REQUIRED for the catalogue and the
other branches' configuration.**

## What was built
- `supabase/migrations/017_operating_data_loader.sql` (prepared; validated only
  on local Supabase; not applied hosted): `operating_data_provenance`
  (source + approval of every configured value, owner/manager read-only) and
  `internal_run_operating_data` (service_role only; verifies an active owner
  actor; one transaction; reuses the audited inventory RPCs; dry run rolls back).
  It also classifies the values seeded by 003/009 without changing them.
- `operating-data/`: contract, CSV parser, validator, loader CLI, real/test-only/
  owner-input files, provenance matrix, owner checklist.
- App: read-only "Veri kalitesi" screen (`/app/manager/management/data-quality`)
  with trust labels, missing-mapping warnings, unit/decimal/active info; demo
  mirror labels everything as test data.

## Findings about the existing seeds (classification, values unchanged)
- Branches (3): confirmed.
- 10 categories: legacy_observed / owner-approved 2026-09-26.
- Category->branch seeds start unknown / pending. The owner approved all 10
  Rumeli mappings; the three seeded İskele Dondurma mappings remain unknown.
- Shift definitions (4, 009): generic seeds start as demo_only / pending. The
  owner approved Rumeli's legacy Sabah 09:00-17:30 and Akşam 16:00-01:00
  definitions on 2026-09-26; the loader replaces the two Rumeli seeds.
- Thresholds 2/5 (2 rows): demo_only / pending.
- No legacy product, price, cost, stock or waste data exists. No confirmed
  register/shift/category layout exists for İskele Dondurma or Balık Ekmek.

## Real dataset after owner approval (fresh reset, default dry run)
created 3 | updated 2 | unchanged 22 | skipped 0 | rejected 0 - applied: no.
The plan creates two Rumeli registers plus the missing Rumeli/Dondurma category
mapping, updates the two Rumeli shift seeds, and leaves 22 already-present rows
unchanged. Apply then succeeds; a second apply creates or updates nothing.

## Data-quality snapshot (local DB after loading the synthetic catalogue)
The earlier browser snapshot preceded the owner's approval and is superseded by
the locally validated real-data apply. Balık Ekmek still has no shift, register,
category or threshold; İskele Dondurma still has no confirmed register/shift/
category configuration. Synthetic items remain labelled "Yalnızca test verisi".

## Loader tests (`supabase/tests/operating_data_loader.test.mjs`, 75 assertions)
Dry run changes nothing (rows, provenance, audit, ledger); apply creates the
right rows; second apply creates/updates nothing; controlled update (rename,
category survives); back-dated cost, different cost for an existing date,
different opening quantity and unit change after movements are rejected; a
database-level rejection rolls back the valid rows of the same load; only an
owner actor works; anon/owner-JWT/cashier-JWT cannot call the function via the
Data API; provenance is read-only even for an owner; reports and audit rows hold
no secret.

## Validator tests (`operating-data/tests/validate.test.mjs`, 20 tests)
Header/duplicate/reference/unit/decimal/negative/cost-window/overlap/threshold/
shift-time/waste-reason/mixed-level/cross-branch rules; unapproved, unknown and
demo rows never applied as real; local-URL guard; dry-run default; no DB call
when a row is rejected.

## Daily operation on the SYNTHETIC catalogue (technical proof, not business approval)
assignment -> shift selection -> Z report with product quantities (stock 20->15,
10.5->8) -> duplicate refused, fractional whole-unit refused -> receipt (+10)
-> waste with reason code (-1; unsupported reason refused) -> count (variance -1
on A, 0 on B; ledger unchanged) -> COGS 60 + 125 = 185 with the effective cost
snapshot, gross profit 460 - 185 = 275 (gross, not net), no uncosted quantity
-> reconciliation OK for a matching report, ERROR for 1000 vs 100 under the
seeded (unapproved) thresholds -> audit rows for load, report, receipt, waste/
count. Cashier cannot receive, read costs or call the loader.

## Regression (fresh `supabase db reset --local --no-seed`, 001-017)
SQL: timezone_regression, timezone_rpc (32), inventory_security, backdated_entry,
backdated_entry_timezone (24), management_center - pass.
HTTP: local_inventory_api 137, storage_policy 48, pin_login 45,
management_center 76, operating_data_loader 75 - pass (each on its own reset).
App: typecheck, lint clean; 246 tests pass (3 consecutive runs); `build:local`
ok; dist has 0 production-ref / service_role / loader-function matches;
`git diff --check` clean. Browser (local stack, manager L002): data-quality,
inventory, costs, items and settings screens at 360px with no horizontal
overflow, showing the loaded synthetic catalogue.

## Known local-tooling caveats
- After several `db reset` runs the Storage container can go stale and return
  500/42P10 on uploads even without migration 017; `supabase stop` + `start`
  fixes it (storage suite then passes 48/48).
- A new Edge Function directory is only served after `supabase stop` + `start`.
- One AuthProvider test flaked once under parallel load (passed on re-run).

## Not done / risks
Hosted validation, real catalogue, and the remaining owner decisions (see
`operating-data/OWNER_INPUT_CHECKLIST.md`). Rumeli legacy categories, registers
and shifts are approved. The loader is validated only
against local Supabase, and its CLI refuses non-local hosts. Migration 017 is
part of the prepared migration chain and therefore requires a separate hosted
deployment approval later. The audit actor of a load is the named owner, so run
it under the owner's code only.
