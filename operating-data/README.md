# Operating data (Stage 3, local validation)

Human-editable, versioned CSV files that describe the business configuration
(branches, registers, shifts, sales categories, catalogue, opening stock,
costs, waste reasons, reconciliation thresholds), plus the validator and the
idempotent loader that puts it into a **local** Supabase.

Nothing here contacts hosted Supabase or production. The loader refuses any
host except `127.0.0.1` / `localhost`. It is not a production loader and is
not named or wired like one.

Migration 017 is a prepared database migration in the normal migration chain.
It has been validated only on local Supabase and has not been applied to any
hosted project. Applying it remotely requires a separate deployment approval.

## Folders (physically separate)

| Folder | Purpose | Loaded by |
|---|---|---|
| `real/` | Business configuration. Only owner-approved rows are applied. | `--dataset real` (default) |
| `test-only/` | Synthetic catalogue (`TEST-*`, `demo_only`) to prove the technical flow. **Not business data.** | `--dataset test-only --allow-test-data` |
| `owner-input/` | Empty, explained templates for what the owner still has to supply. Never read by the loader. | nobody |
| `tests/` | Validator tests (`node --test`). | — |

## Row status columns (every row of every file)

`provenance`: `confirmed` · `legacy_observed` · `demo_only` · `unknown`
`approval_status`: `approved` · `pending` · `rejected`
`source`: where the value comes from (required)

Policy (real dataset):

* `approved` + `confirmed`/`legacy_observed` → applied.
* `pending` or `rejected` → **skipped** (never written, reported).
* `demo_only` → **rejected** (demo values can never be real data).
* `unknown` + `approved` → **rejected** (nobody can approve a value nobody supplied).

Test-only dataset accepts `demo_only` rows only.

## Running it

Validation tests (no database):

```bash
node --test operating-data/tests/validate.test.mjs
```

Dry run (default; nothing changes):

```bash
node operating-data/load.mjs --actor-code <OWNER_EMPLOYEE_CODE>
```

Apply:

```bash
node operating-data/load.mjs --actor-code <OWNER_EMPLOYEE_CODE> --apply
```

The service-role key is read **only** from the operator shell
(`SUPABASE_SERVICE_ROLE_KEY`); `SUPABASE_URL` defaults to
`http://127.0.0.1:54321`. The key is never printed, logged or committed. The
actor must be an active owner; every change is audited under that owner
(`operating_data_load`).

## Guarantees

* Dry run and apply execute the same database code path; a dry run rolls back.
* Any rejected row (file level or database level) aborts the **whole** load.
* Second apply creates nothing (`unchanged`); changes are controlled updates.
* Costs and opening stock are append-only: a different value for an existing
  effective date / an already-loaded item is rejected, never overwritten.
* Report statuses: `created`, `updated`, `unchanged`, `skipped`, `rejected`.

## Files and their keys

`branches`, `sales_categories`, `registers`, `shift_definitions`,
`category_branches`, `inventory_items`, `product_categories`, `item_costs`,
`opening_stock`, `reconciliation_thresholds`, `waste_reasons` — see
`contract.mjs` for columns, units, limits. Units: adet, kg, g, lt, ml, paket,
kutu, porsiyon. Decimals use a dot; quantities ≤ 3 decimals, costs ≤ 4.
Waste reason codes are fixed by the database (expired, damaged, spilled,
quality, sample, other).

See `SOURCE_PROVENANCE_MATRIX.md` and `OWNER_INPUT_CHECKLIST.md`.
