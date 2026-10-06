# Manager Command Center Model (Phase 1D)

Status: **local development only**. Migrations `20261006000700_weather_context` and `20261006000800_command_center` are NOT applied to
production; nothing was committed, pushed or deployed. The Command Center works **without AI**: if an AI report is missing or fails,
every card, alert and metric stays functional.

## 1. Principle: composition, not a new engine

The Command Center re-uses what exists and adds only three things: a bundled read model (`get_branch_operations_signals`), a
deterministic attention feed (`domain/commandCenter`), and the weather cache (see `WEATHER_MODEL.md`).

| Area | Reused source (nothing duplicated) |
|---|---|
| revenue, finalization, completeness, reconciliation, shifts, stock alerts | `domain/dashboard` (`buildDashboard`, MetricState, X/Z business-day rule) |
| closing counts, waste | `get_branch_count_overview`, `get_waste_report` (inventory control) |
| orders, deliveries, low stock, receipt reconciliation | `get_procurement_attention` (+ suggestions) |
| weather | `get_branch_weather` (forecast cache) |
| observations | latest daily/weekly analytics snapshot insights (Analytics Engine V1; **no recomputation**) |

Why not one SQL RPC for everything: the dashboard's revenue/finalization logic lives in the TypeScript domain; re-implementing it in SQL
would create a second revenue engine. SQL therefore bundles only the *other* read models of one branch; the app composes the rest.

## 2. Information hierarchy (mobile-first, 375 px)

Header/date -> **A. Today summary** -> **B. Attention required** -> **C. Operations** -> **D. Weather** -> **E. Analytics** ->
*Performance* (the existing period selector, branch comparison and drill-down, unchanged). Progressive disclosure: the top 5 attention
items first ("Tümünü göster"), detail by tap. No grid of equal cards.

**A. Today summary** (existing model): finalized revenue = Z; an X-only day is provisional and shown separately ("Geçici X ... kesinleşmiş
ciroya dahil değil", never added); "n/N şubenin Z raporu tamam", branches waiting for Z; gross profit only when available/partial
(labelled "Kısmi"). Unavailable is "Veri yok", never 0. Transactions and average basket are **not** part of the dashboard model and are not shown.

## 3. Read model: `get_branch_operations_signals(branch)` (one call per branch)

```
{ branchId, businessDate (branch time zone), timezone, location: {state: set|missing},
  counts, waste, procurement, weather, analytics }       each part: {state:'available', data} | {state:'unavailable', reason}
analytics.data = { daily: {businessDate, version, generatedAt, completeness, insights[]} | null,
                   weekly: {weekStart, version, generatedAt, weekComplete, insights[]} | null }
```
Each part is guarded by its own permission and degrades to `unavailable / no_permission` instead of failing the call (a role sees exactly
the parts it may see; every underlying function enforces branch scope). Callers with none of the permissions are denied (cashier, employee,
viewer, anon). Financial insights are withheld without `analytics.financial.read`. Reading signals recomputes and writes nothing.

## 4. Attention engine (`domain/commandCenter/attention.ts`)

Deterministic, no AI, **no invented thresholds**. Item: `id, branchId, branchName, category, severity, title, description, reasonCode,
source, businessDate, actionRoute, count, timeSensitive, observedAt`.

**Severity.** `critical` only for a configured/derived integrity failure (reconciliation ERROR: per-branch configured thresholds).
`warning`: follows from an existing definition (stock alert, unexplained shortage, awaiting approval, overdue delivery, low stock without
order, cutoff passed, X-only day, reconciliation WARNING/backlog, Z below X, reversed receipt). `info`: context and the day's deadlines.
**Weather is always `info`** (no weather threshold is configured). Waste is reported as a fact, never as "unusual" (no waste threshold).
A missing closing count is a warning only when the day's shifts are already complete (otherwise info).

**Order.** severity, then category (1 data integrity, 2 reporting input, 3 inventory/counts, 4 procurement, 5 weather, 6 analytics), then
time-sensitive first (due today, overdue, awaiting a decision), then branch name.

| reasonCode | severity | route |
|---|---|---|
| reconciliation_error / _warning / open_reconciliation_backlog | critical / warning / warning | reconciliation queue |
| z_below_x | warning | reports |
| x_only_provisional (Z missing) / no_reports_yet | warning / info | reports |
| stock_alert | warning | inventory |
| closing_count_missing / closing_count_voided_only | warning or info / warning | count overview |
| count_unexplained_shortage / count_timing_uncertain | warning / info | that count's review |
| waste_today | info | waste report |
| delivery_overdue / order_awaiting_approval | warning | the order (one) or procurement |
| low_stock_no_order / order_cutoff_passed | warning | procurement |
| delivery_due_today / order_partially_received | info | the order or procurement |
| receipt_reconciliation_warning | warning (data integrity) | the order |
| weather_location_missing | info | branch location settings |
| weather_not_loaded / weather_stale / weather_rain_forecast | info | analytics (weather detail) |
| analytics_<code> (facts, weekly relationships) | info | analytics |

**Coverage.** A part that is unavailable (permission, failed call) is listed in `unavailableSources` and shown as "Bazı veriler
görüntülenemiyor, bu yüzden 'sorun yok' anlamına gelmez" - never as an all-clear. Not supported (no configured threshold or data):
"unusual waste", "order cutoff approaching", temperature/rain impact on sales, revenue-decline alerts beyond the existing insights.

## 5. Multi-branch and roles

Owner/manager: all branches (organization summary + attention across branches + compact per-branch state). Branch manager: own branch
only (every part enforces `current_user_can_inventory` scope). Every attention item carries its branch; nothing mixes branches.

## 6. Performance

Opening the page costs **2 backend requests, independent of the number of branches** (1 branch = 2, 3 branches = 2, 20 branches = 2):

1. `get_dashboard_inputs(branch_ids, period)` - the RAW inputs of the existing TypeScript dashboard model (shifts, reports with origin, open
   reconciliation count, items, balances, last counts, waste/count counts, gross-profit payload) for all branches at once. It contains no
   revenue/finalization logic: `buildDashboard` still runs per branch in TypeScript (the only X/Z engine). It runs as the caller (RLS) and
   skips branches the caller cannot see (never an empty all-clear).
2. `get_command_center_signals(branch_ids)` - the bundled signals of every branch; a branch the caller cannot read degrades to `unavailable`
   for that branch only.

The previous per-branch pattern cost up to ~10 requests per branch (30 for 3 branches). The default "Bugün" performance view reuses the same
fetch; 7/30-day views are also 1 request. **Regression guards:** `commandCenter.requests.test.ts` replaces the Supabase client with a
counter and asserts exactly 2 requests for 1/3/10/20 branches (and no table query), the page integration test asserts one batch call each and
no per-branch call, a source guard forbids the per-branch fetchers in the page, and `command_center.test.sql` checks the batch results equal
the per-branch queries. Limit: 20 branches per call.
Analytics are read from stored snapshots; weekly/daily analytics are never recomputed by opening the page. Weather is read from the cache
table; the provider is called only by the loader, never by a render.

## 7. Weekly manager summary readiness

All facts a weekly narrative needs already exist as deterministic payloads: weekly revenue change and quietest/strongest finalized days
(weekly analytics snapshot), count outcomes (`count_unexplained_shortage`, `timing_uncertain`), stock/minimum states and overdue deliveries
(`get_procurement_attention`), and the evidence-gated weather relationship (`weather_relationship`, sample size n, "relationship, not
causation"). A future AI report may only *phrase* them; it must not calculate anything (existing AI contract). Not built here.

## 8. Open decisions

- thresholds that would justify `critical` for stock/count/procurement/weather items, a waste anomaly rule, "cutoff approaching" lead time;
- whether the Command Center should become the default landing page for branch managers; push notifications for critical items;
- weekly summary narrative and AI provider (out of scope).
