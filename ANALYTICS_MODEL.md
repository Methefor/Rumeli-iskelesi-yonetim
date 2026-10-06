# Analytics Engine V1 — model

Status: **development only.** Migration `supabase/migrations/20261006000100_analytics_engine_v1.sql` is validated on a
local database and is **not applied to production** (production holds migrations up to `20261005000300`). Applying it is a
separate owner-approved production write.

## Core rule

> SQL / deterministic services calculate every metric. AI never calculates a financial metric and only interprets
> structured facts it is given.

- Authoritative calculation: SQL (`analytics_compute_day` and the builders in the migration).
- Deterministic TypeScript twin: `app/src/domain/analytics/engine.ts` (demo mode and parity tests; same fixture numbers as the SQL suite).
- AI: optional interpretation only, behind a strict contract (`app/src/domain/analytics/aiContract.ts`). Never on the metrics path.

## PROVISIONAL vs FINALIZED (project X/Z rule)

Project rule: **X = provisional/intermediate reading, Z = final management revenue.** Finalized revenue uses Z only and is never
normalized or increased using X; X and Z are never two independent revenues. Analytics therefore works at **business-day level**
(not per shift: the legacy import and the report form put the X on the morning shift and the Z on the evening shift).

| State | When | Revenue | Comparisons |
|---|---|---|---|
| `finalized` | a non-cancelled Z exists | **Z exactly**: never normalized or increased by X. If Z < X the revenue stays Z and a `z_below_x` warning is raised (no `max(X, Z)`) | allowed |
| `provisional` | only an X exists | **no finalized revenue** (`grossRevenue` is `unavailable`, reason `missing_z`); the X reading is exposed only as `provisionalRevenue`; completeness `partial` / `missing_z` | none (`not_final`); never used as a baseline (`baseline_not_final`) |
| `no_data` | no active reading (cancelled reports never count) | `0` as a real zero, with `hasData = false` | `no_baseline` |

- **Weekly**: a week is `finalized` only when it has ended **and** none of its days with data is provisional. An X-only day makes
  the week `provisional` (`provisionalDays`, `provisionalRevenue`; the week revenue sums **finalized Z values only** and is `partial` with `missing_z`); a week in progress adds
  `week_in_progress`. A provisional week gets no percentage comparison.
- **Baselines** (4-week same weekday) use finalized days only. Weather correlation uses finalized days only.
- Live/provisional dashboards may show X separately; a FINAL daily/weekly snapshot never presents an X-only day as complete.
- **Inherited behaviour (not changed here, open decision)**: with several active readings of one type on a day (several registers
  or shifts) the **latest** (`submitted_at`, `id`) wins and a `multiple_active_readings` warning is emitted. Regression-tested
  (`analytics_engine.test.sql`, `engine.test.ts`) so a future change is deliberate.

## Product / category line semantics are NOT inferred

Whether Z item lines are cumulative of X is an **open owner decision**. The revenue reconciliation is therefore *not* applied to
lines:

| Readings with lines | Category detail | Product detail | Gross profit |
|---|---|---|---|
| none | partial · `missing_category_detail` | partial · `missing_product_detail` | `unavailable` |
| X only | partial · `missing_z` (provisional) | partial · `missing_z` | `partial` at most |
| Z only | partial · `z_line_semantics_unverified` (shown as reported) | partial · `z_line_semantics_unverified` | `partial` at most (`missing_cost` / `line_semantics_unverified`) |
| X and Z | **unsupported** · `xz_line_semantics_unknown`, no values emitted | **unsupported** | **unsupported** |

Finalized total revenue stays `complete` while product detail is unsupported. Gross profit is never `available` in V1.

## Origin capability (legacy imports)

A report is `legacy_import` when it has a row in `legacy_sales_report_links`. A day's `origin` is `native`, `legacy_import`,
`mixed` or `none` (readings actually used).

| Metric | native | legacy_import / mixed |
|---|---|---|
| Total revenue | supported | supported |
| Transactions | where `transaction_count` exists | only where it exists; otherwise `missing_transaction_count` + `legacy_source_limitation` |
| Category detail | line rules above | line rules above |
| Product detail / gross profit | line rules above | **unsupported** · `legacy_source_limitation` |
| Hourly | unsupported | unsupported |

Mixed periods never create false precision: **transaction and basket comparisons between native and legacy data are refused**
(`mixed_origin`); revenue comparisons are allowed but flagged `mixedOrigin: true`.

## Completeness model

Every snapshot carries `completeness = { overall, reasons[], metrics{ revenue, transactions, averageBasket, categories, products,
grossProfit, hourly, context } }`. Each metric has `status` = `complete | partial | unsupported` and reason codes. `overall` is
`complete` only when revenue and transactions are complete, `no_data` without reports, else `partial`. Snapshot freshness
(`stale`) is reported by the read RPCs / envelope, not stored in the immutable payload.

Reason codes: `missing_z`, `missing_transaction_count`, `missing_product_detail`, `missing_category_detail`, `missing_cost`,
`missing_context`, `legacy_source_limitation`, `xz_line_semantics_unknown`, `z_line_semantics_unverified`,
`line_semantics_unverified`, `zero_transactions`, `no_reports`, `no_hourly_source`, `week_in_progress`, `insufficient_sample`.

## Data sources (nothing new is collected from staff)

| Source | Used for |
|---|---|
| `sales_reports` (X/Z, `gross_revenue`, `transaction_count`, `status`, `reconciliation_status`) | revenue, transactions, report counts |
| `sales_report_items` (`category_id`, `amount`, `quantity`, `inventory_item_id`, `inventory_quantity`) | category and product detail (single-reading days only) |
| `shifts` (`business_date`) | which day a report belongs to |
| `legacy_sales_report_links` | origin |
| `inventory_movements.unit_cost_snapshot` (SALE rows) | gross profit (same cost lineage as `get_inventory_gross_profit`) |
| `external_context_daily` (manual / service-role entry) | weather and calendar context |

## Time

Everything is an Istanbul `business_date` (`shifts.business_date`), never the submission instant. Weeks are ISO weeks,
Monday..Sunday. A snapshot cannot be generated for a future date; a weekly report can be generated for a week in progress.

## Formulas

All sums are exact `numeric`; money is rounded to 2 decimals, ratios to 4, percentages to 1 (half away from zero).

| Metric | Definition |
|---|---|
| Day revenue | finalized: Z exactly; X-only: none (provisionalRevenue = X) |
| Transactions | Z's `transaction_count` when finalized (unknown if missing); the X count as `partial · missing_z` when provisional |
| Average basket | **derived**: revenue ÷ transactions, never the stored `average_basket`; `unavailable` for zero or missing transactions |
| Item quantity | category-level line quantities of the emitted reading (partial) |
| Category / product revenue | lines of the single reading, as reported (see line semantics) |
| Gross profit | revenue − quantity × weighted SALE `unit_cost_snapshot`, only for costed products on emitted lines; **gross only**, never net |
| Previous day / previous week same weekday | value of date−1 / date−7 (final baselines only) |
| 4-week same-weekday baseline | mean over date−7..−28 days that are **finalized** (≥ `minBaselineSamples`) |
| Comparison states | `ok`, `not_final`, `no_baseline`, `baseline_not_final`, `mixed_origin`, `insufficient_samples`, `zero_base`, `low_base` (delta only), `no_current` |
| Weekly changes | week vs previous week, same states |
| Peak hour | **unsupported** (no hourly data) |

## Central thresholds (technical defaults, not business decisions)

One place: table `public.analytics_settings` (single row, `{}` = defaults) read by `analytics_params()`; changed only through
`update_analytics_settings` (owner/manager with `analytics.regenerate`, validated ranges, mandatory reason, audited; status becomes
`owner_configured`). The TypeScript mirror is `app/src/domain/analytics/settings.ts`. Every snapshot embeds the params it used. No
branch-specific values exist.

| Setting | Default |
|---|---|
| `lowVolumeBaseRevenue` | 500 TL |
| `lowVolumeBaseTransactions` | 10 |
| `minBaselineSamples` | 2 |
| `minCorrelationSamples` | 14 days |
| `minGroupSamples` (rain / dry group) | 3 |
| `rainMmThreshold` | 1.0 mm |
| `weatherWindowDays` | 84 |
| `baselineWeeks` | 4 (structural, not configurable) |

## Confidence model

| Level | Meaning | Who may produce it |
|---|---|---|
| `fact` | directly computed | the deterministic engine |
| `relationship` | statistical association, not causation (weather vs weekday-adjusted revenue) | the deterministic engine |
| `hypothesis` | a possible explanation, never established | **only** a validated AI report |

Enforced: `analytics_insights` has a CHECK that a hypothesis must have `origin = 'ai'`.

## Weather / context model (`external_context_daily`)

`context_date`, optional `branch_id` (NULL = all branches; a branch row wins), `temperature_c`, `apparent_temperature_c`,
`precipitation_mm`, `wind_kmh`, `is_weekend` (generated), `is_public_holiday` (+ `holiday_name`), `pay_period_tag` (free tag),
`special_event`, `source`. A day without a row is `context.state = 'missing'` (`missing_context`), never a normal day. Entry is
manual (`upsert_external_context_daily`, audited) or by a service-role loader; **no external fetch exists in V1**.

Weather relationship = Pearson correlation of temperature with a weekday-adjusted revenue index plus the rainy-vs-dry mean
index, over **finalized** days. Reported only with at least `minCorrelationSamples` days (rain comparison needs
`minGroupSamples` per group); below that: `insufficient_sample`, no coefficient. Always `relationship` with a no-causation caveat.

## Snapshots

| Rule | Implementation |
|---|---|
| Versioned and immutable | `daily_analytics_snapshots`, `weekly_analytics_snapshots`, `analytics_insights`, `analytics_reports`: UPDATE/DELETE raise 42501; a regeneration inserts `version + 1` |
| Idempotent | identical payload hash → no new version |
| Stale detection | `source_latest_at` vs live source data; read RPCs report `current` / `stale` / `missing` |
| Auditable manual regeneration | `regenerate_*_analytics`: `analytics.regenerate` + branch scope + reason; audit row with the real actor |
| Scheduled generation | `internal_generate_*` exist (service_role); **no scheduler is built** |

## Permissions

| Key | owner | manager | branch_manager | cashier / employee / viewer |
|---|---|---|---|---|
| `analytics.read` | ✔ | ✔ | ✔ (own branch) | ✘ |
| `analytics.financial.read` | ✔ | ✔ | ✔ (own branch) | ✘ |
| `analytics.ai.read` | ✔ | ✔ | ✔ (own branch) | ✘ |
| `analytics.regenerate` | ✔ | ✔ | ✘ | ✘ |

Snapshot tables need `analytics.financial.read`. `analytics.read` alone gets the **redacted** payload from
`get_daily_analytics` / `get_weekly_analytics`: `financial`, `financialComparisons`, `days`, `weatherEffect` and the X/Z
`readings` (they carry revenue) are removed; volume metrics and `completeness` remain. Clients cannot write any analytics table;
internal and builder functions are service_role only; every analytics SECURITY DEFINER function locks `search_path`.

## AI report contract (version 2)

1. **Input** `buildAiInput(weekly, snapshotState)`: a `facts` index (`path → {value, kind, support}`), the per-metric `support`
   map (`complete | partial | unsupported` + reasons), `limitations` (reason codes, `snapshot_stale`), `finalization`, `origin`,
   `unsupported` list and rules. **Unsupported metrics contribute no fact.** Provisional/partial data is marked `support: partial`.
   No branch id, no free text. A redacted payload is refused.
2. **Output**: JSON `{ summary, claims[{ id, confidence, text, evidence[{ metric, value }] }], limitations[] }`.
3. **Validation**: every evidence metric must exist with exactly the cited value; every number in any text must be an input
   number (dates must be input dates); a `fact` claim needs evidence with kind `fact` **and support `complete`** (provisional,
   partial or unverified data can never be a fact; a product trend from partial detail may only be a hypothesis); causal wording
   only in `hypothesis`; ≤ 12 claims, ≤ 400 chars; unique ids.
4. **Failure**: `generateAiReport` never throws (`ai_unavailable` / `ai_timeout` / `ai_bad_json` / `invalid`); the report is
   loaded independently of the metrics. `analytics_reports` stores output only if validated.
5. No model is wired: no Edge Function, no provider.

## UI (`/app/manager/analytics`, mobile-first)

`Özet`, `Günlük`, `Haftalık` (+ AI card), `Ürünler`, `Saatlik` (explicitly unsupported; shows the X/Z readings instead), `Hava`.
Daily/weekly show a **Kesinleşmiş / Geçici** chip, the X and Z readings side by side (never summed), a **Veri tamlığı** card
(complete / partial / unsupported + reasons), comparison states in Turkish and the freshness chip with the audited regenerate sheet.

## Unsupported metrics (not invented)

| Metric | Why |
|---|---|
| Peak hour / hourly sales | no per-transaction or hourly timestamp in the source |
| Category/product values when X and Z both carry lines | X/Z line semantics undecided |
| Product metrics and gross profit for legacy-imported reports | legacy source has no reliable item/cost history |
| Net profit | overhead is not modelled |
| Weather ingestion, holiday calendar, pay-period definition | no source/definition supplied |
| Snapshot scheduling, AI provider integration, organization-level rollup | not built |

## Open decisions (owner)

1. **Z item lines**: cumulative of X, or only the evening increment? Until decided, line detail stays partial/unsupported and gross profit never complete.
2. **Technical thresholds** above are defaults (central, configurable) pending review.
3. **Multi-register shifts**: inherited "latest X / latest Z wins" — keep, or sum per register?
4. **Pay-period** definition and tag vocabulary.
5. **Weather source/location** and a public-holiday source.
6. **Who may regenerate**: owner/manager only today.
7. **Scheduling** of daily/weekly snapshots.
8. **AI**: provider/model, where it runs, input retention, cost limits.
9. **Dashboard consistency**: the existing manager dashboard groups reports per shift, which sums a morning X and an evening Z that sit on different shifts (as the legacy import and the report form place them); analytics follows the project rule at day level. The dashboard should be reviewed against the same rule (flagged, not changed here).
10. **Production**: applying `20261006000100` needs a separate approval (the teardown script already includes it).

## Risks

- `analytics_compute_day` runs ~7 times per daily snapshot and ~14 + up to 84 times per weekly one; fine on demand, measure before automating.
- SQL and the TypeScript twin must stay in step; shared fixture numbers guard parity.
- The demo store holds no financial data; populated states are covered by unit/SQL tests.
- Line detail is deliberately thin until decision 1 is made.
- Six nav items for manager roles on mobile (verified to fit at 375 px).

## Tests

`supabase/tests/analytics_engine.test.sql` (permissions, business-day X/Z finalization, provisional days/weeks, line-semantics
capabilities, legacy origin capability and mixed-origin refusal, comparisons, central settings, week boundary, multi-register
regression, weather rules, role isolation, redaction, immutability, versioning, stale detection, audited regeneration, AI report
persistence, function ACLs); `app/src/domain/analytics/*.test.ts` (engine parity, AI contract and support states, week helpers,
permissions); `AnalyticsPage.integration.test.tsx`; `supabase/tests/schema_teardown.test.mjs`.
