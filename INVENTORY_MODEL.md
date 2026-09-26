# Inventory Model (Phase E)

Status: **prepared, not applied to any hosted Supabase project.** Migrations
`012`–`014`. As of 2026-09-22, validated against a real local Supabase stack
(see "Validation performed" below) — a real disposable Docker/Postgres/GoTrue/
PostgREST setup, not the earlier PGlite substitute; hosted/staging validation
is still not done. Initially used by **İskele Dondurma**, but the schema is
generic by branch — no branch-named columns, no seeded products/SKUs/costs
(the business enters its own catalogue).

## Principles

1. **The stock ledger is append-oriented.** `inventory_movements` is never
   updated or deleted (privileges + trigger). A mistake is a `REVERSAL` row
   that copies the original's quantity and cost snapshot with the opposite
   sign. Server clock only (`occurred_at default now()`); no RPC accepts a
   movement time.
2. **Revenue and inventory quantity are different facts.** A sales report
   line may optionally carry `inventory_item_id` + an explicit
   `inventory_quantity`. Quantity is never inferred from TL. Category-level
   (legacy-shape) lines stay valid and have no stock effect. Within one report
   a category is either category-level or product-level, never both.
3. **A physical count does not rewrite theoretical stock.**
   `inventory_counts` / `inventory_count_items` record physical quantity plus
   a server-side *theoretical snapshot*; `variance = physical − theoretical`.
   The only way the ledger changes to explain a variance is an explicit,
   reasoned, audited `ADJUSTMENT` (optionally linked to the count).
4. **Cost history is effective-dated and append-only.** A new cost is a new
   row; it must be later than the latest existing one (so history cannot be
   back-filled) and at most 30 days ahead. Each movement snapshots the cost
   in effect when it happened (`unit_cost_snapshot`), so historical gross
   profit is reproducible. `NULL` snapshot = "no cost known" and is treated as
   *uncosted*, never as zero.
5. **Gross profit is not net profit.** `gross profit = product revenue − COGS`,
   `COGS = Σ quantity × cost snapshot`. Payroll, rent, utilities and other
   overhead are excluded and the UI says "Brüt Kâr". If revenue cannot be
   mapped to products, or a cost is missing, the result is shown as
   *partial/unavailable* — never fabricated.

## Tables (`012_inventory_core.sql`)

| Table | Purpose |
|---|---|
| `inventory_items` | branch-scoped items: `code` (unique per branch, upper-case), `name`, one base `unit`, `allows_decimal`, optional `sales_category_id`, `is_active` |
| `inventory_item_costs` | effective-dated unit cost, append-only |
| `inventory_movements` | the ledger: `RECEIPT`, `SALE`, `WASTE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `REVERSAL`; `quantity > 0`, signed `stock_delta`, `unit_cost_snapshot`, optional shift / sales report / count links, `reason_code`, `reason`, `reference` |
| `inventory_counts`, `inventory_count_items` | physical counts; only lifecycle change is `submitted → voided` |
| `sales_report_items` (altered) | + `inventory_item_id`, `inventory_quantity`; the `(report, category)` unique constraint became two partial unique indexes so several products can share a category |

A composite FK `(inventory_item_id, branch_id)` guarantees a movement's branch
equals its item's branch. Views `inventory_stock_balances` and
`inventory_last_counts` are `security_invoker` (the caller's RLS applies).

## RPC surface (`014_inventory_rpcs.sql`)

`upsert_inventory_item`, `set_inventory_item_active`, `set_inventory_item_cost`,
`record_inventory_receipt`, `record_inventory_waste`,
`record_inventory_adjustment`, `reverse_inventory_movement`,
`submit_inventory_count`, `void_inventory_count`, `get_inventory_gross_profit`
(cost-gated read). `create_sales_report` / `edit_sales_report` /
`cancel_sales_report` are replaced (same signatures) so product lines write
`SALE` movements in the same transaction; editing reverses the old movements
and writes new ones, cancelling reverses them. See `INVENTORY_SECURITY.md`.

## Formulas (`app/src/domain/inventory`, unit-tested)

* `theoretical = Σ stock_delta` (= opening + receipts + adjIn − sales − waste − adjOut).
* Reversals are netted into the bucket of the movement they reverse.
* `variance = physical − theoretical`; `% = variance / theoretical`, `null` when theoretical ≤ 0.
* **Sell-through (adopted)** `= sold / (opening + received + adjustmentIn)`; waste
  and outbound adjustments are *not* removed from the denominator (spoiled
  stock was still available, so it lowers the ratio instead of hiding a loss);
  `null` when the denominator ≤ 0; a ratio > 1 flags inconsistent data.
* `effectiveCostAt` = latest `effective_from ≤ t`, `null` before any cost.

## Deliberately not built

Net profit, accounting, suppliers/purchase invoices, recipes/BOM, unit
conversion, inter-branch transfers, procurement, forecasting, reorder levels,
generic task management, performance/badges. Theoretical stock may go negative
(a sale is never blocked; it raises an "eksi stok" alert). `reason_code` for
waste is a fixed generic list (expired, damaged, spilled, quality, sample,
other) — adjust if the business wants different codes.

## Demo mode

`VITE_DEMO_MODE=true` routes every screen through `services/data` →
`services/demo` (deterministic, synthetic, in-memory, zero network). Names
like "Örnek Ürün A" and all figures are invented placeholders. The demo store
mirrors the ledger rules (append-only, reversal on edit/cancel, cost
snapshots) using the same domain functions.

## Validation performed

* `npm run typecheck`, `lint`, `test` (163), `build` — all pass.
* 2026-09-22, real local Supabase (Docker/Postgres/GoTrue/PostgREST), fresh
  `supabase db reset --local --no-seed` applying 001–014 from zero:
  `supabase/tests/inventory_security.test.sql` (≈150 assertions: RLS, RPC
  authorization, raw-write denial, append-only, count-vs-ledger, cost
  confidentiality, sales integration, audit rows), `timezone_regression.test.sql`
  and `timezone_rpc.test.sql` (32 RPC cases across 4 session timezones) all
  pass in real transactions (rolled back). `supabase/tests/local_inventory_api.mjs`
  drove real Auth password sessions through real PostgREST for owner, manager,
  branch_manager, cashier, employee, viewer and anon, and passed 135/135
  assertions — branch isolation, raw-write denial, cost-column
  confidentiality, mandatory reasons, audit immutability. See
  `docs/LOCAL_VALIDATION_2026-09-22.md` for the full run, its limits, and how
  to repeat it. The earlier scratch-PGlite result is superseded by this real
  run but was not wrong; it was always described as a substitute, not
  equivalent to Supabase.
* Hosted/staging validation and production apply: still not done.

**Validation status (Phase E) — keep this distinction:**

| Item | Status |
|---|---|
| Phase E application / domain / UI tests (typecheck, lint, 163 unit + demo-flow tests, build) | **VALIDATED** |
| Migrations 012-014 | **PREPARED**, validated on a real local Supabase stack; **not applied to any hosted project** |
| Fresh local Supabase `db reset` (001-014 from zero) | **VALIDATED LOCALLY** (2026-09-22, real Docker/Postgres/GoTrue/PostgREST) |
| SQL security/timezone suites (`inventory_security.test.sql`, `timezone_regression.test.sql`, `timezone_rpc.test.sql`, ~150+32 assertions) against real local Postgres roles | **VALIDATED LOCALLY** |
| Real local Auth + PostgREST integration (`local_inventory_api.mjs`, 135 assertions, real password sessions/JWTs, every role) | **VALIDATED LOCALLY** |
| Timezone invariance (session TZ UTC / Europe/Istanbul / America/New_York / Asia/Tokyo all produce the same business result) | **VALIDATED LOCALLY** |
| Hosted / staging validation | **NOT DONE** |
| Production | **UNTOUCHED** |

The PGlite harness result described in earlier Phase E docs has been
superseded by the above real local Supabase run; see
`docs/LOCAL_VALIDATION_2026-09-22.md`. Do not describe any of this as
hosted/staging-validated until it has actually run there.

## Operating data and provenance (Stage 3)

No product, cost or stock data exists in the repo or the legacy app. Real data is
loaded only through `operating-data/` (idempotent, local-only, owner-approved
rows). A synthetic `TEST-*` catalogue in `operating-data/test-only/` proves the
technical flow and is labelled test data in the UI. Opening stock is a RECEIPT
with reference `OPENING-STOCK <date>` (append-only; a different quantity is
rejected).
