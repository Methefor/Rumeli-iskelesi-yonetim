# Manager Dashboard model

Status: local/demo-validated only, not deployed. Rebuilt at
`app/src/features/dashboard/` (`ManagerDashboardPage.tsx` + sections), backed
by a pure aggregation layer at `app/src/domain/dashboard/` and two thin fetch
orchestrators (`app/src/services/supabase/dashboard.ts`,
`app/src/services/demo/dashboard.ts`). The route is `/app/manager` (owner,
manager, branch_manager), replacing the old single-branch `ManagerHomePage`.

**Rule for the whole dashboard: the UI renders, it never computes.** Every
number on screen comes from `domain/dashboard`'s pure functions given
already-fetched data; no JSX file sums money, groups shifts, or decides a
reconciliation status.

## Money aggregation

`domain/dashboard/money.ts`. All TL amounts from the data layer are converted
to integer **kuruş** (`toKurus`, 1 TL = 100 kuruş) before any summation;
`fromKurus` + `formatMoney` convert back only at the final presentation step.
This avoids float drift when summing many report amounts (see
`money.test.ts` for the classic `0.1 × 1000 !== 100` float case, and the
kuruş-exact equivalent).

Per-shift revenue still uses the single existing X/Z rule
(`domain/revenue/deriveShiftRevenueFromReports`) — fed kuruş integers instead
of TL floats, since the rule (`max(0, Z-X)`, `X + increment`) is unit-agnostic.
This means the dashboard reuses the one shared X/Z implementation rather than
re-deriving it, while still summing in kuruş.

## Missing / partial / not-applicable data

`domain/dashboard/metricState.ts`. Every metric that can fail to exist is a
`MetricState<T>`:

- `available` — a real, fully-covered value.
- `partial` — real but incomplete (e.g. gross profit with an uncosted item);
  UI must show "Kısmi" and the amount is never presented as complete.
- `unavailable` — cannot be calculated right now (e.g. no cost mapping at
  all) — renders "Veri yok", never a bare `₺0,00`.
- `not_applicable` — the metric does not apply here (inventory KPIs for a
  branch with no inventory tracking configured) — renders "Takip edilmiyor",
  visually distinct from "0 alerts on a tracked branch".

**Revenue is the one exception that is always `available`, never
`unavailable`**: a period with zero submitted reports has a real, computed
revenue of 0 — that is a fact, not missing data. "Missing" is reserved for
metrics the aggregation genuinely cannot derive from what exists (gross
profit without a cost/category mapping), not for an empty but correctly
queried period.

Compact value slots (StatCard values, comparison-row cells) show the SHORT
fallback word only ("Veri yok" / "Takip edilmiyor"); the longer, specific
reason (e.g. "Maliyet eşlemesi yetersiz; Brüt Kâr hesaplanamıyor.") is only
used in spacious contexts (a paragraph in Branch Detail), never squeezed into
a stat card — an earlier local-review pass caught a stat card visually
breaking when the full reason sentence was used as its value.

## Period model

`domain/dashboard/period.ts`. One `DashboardPeriod` object (`resolveDashboardPeriod('today' | '7d' | '30d', now)`)
is resolved once per render and threaded through every fetch and every
aggregation call — no widget computes its own "today" or "7 days ago".
Boundaries are always **Istanbul calendar days**, using the existing
`istanbulDate` (Intl formatter, explicit `Europe/Istanbul`) and a new
`istanbulDayBounds` (UTC+3 fixed offset, no DST since 2016 — the same fact
`services/demo/store.ts`'s `istanbulInstant` already relied on), so the
result never depends on the caller's device/session timezone. Verified in
`period.test.ts` with instants expressed in UTC, New York and Tokyo,
including a late-evening/early-morning case that crosses into the adjacent
Istanbul day, and month/year boundary cases. A `custom` range is supported
(`validateCustomRange` + `resolveCustomPeriod`) but not exposed in the UI in
this phase — only the three fixed options are.

Every branch is fetched and aggregated for the exact same `DashboardPeriod`
and the exact same inclusion rule: a report counts if its **shift's**
`business_date` falls in range (not the report's submission time — a
same-day backdated entry for an in-range shift still counts), and a
cancelled report is always excluded, for every branch alike.

## Branch comparison and inclusion rules

`domain/dashboard/aggregate.ts`. `buildDashboard(period, raws)` builds the
organization summary and every branch's comparison row from the SAME period
data in one pass:

1. Each branch's revenue (grouped by shift, X/Z rule, summed in kuruş).
2. The organization total (sum of every branch's revenue).
3. Each row's revenue share = branch revenue / org total, `unavailable` when
   the org total is 0 or not `available` (never a divide-by-zero NaN, never a
   fabricated 0%/100%).

A branch with genuinely no data in the period is not dropped: it appears
with `available(0)` revenue, `reportCount: 0`, etc. — a real, explicit zero,
distinct from `unavailable`.

Gross profit at the organization level (`combineGrossProfit`) never
fabricates a total: `not_applicable` when no branch tracks inventory,
`available` only when every tracked branch is fully `complete`, and
`partial` (summing whatever amount IS known) the moment any tracked branch is
`partial` or `unavailable`.

## Operational efficiency

`buildOperationalSummary`. Only measurable facts: reconciliation
OK/WARNING/ERROR tallies, shift counts by status, submitted closing counts,
waste-entry counts. The one ratio shown, shift completion, has an explicit
documented formula (also in the UI as a `Note`):

```
Vardiya Tamamlanma = (Gönderildi + Kapandı) / (Planlandı + Devam ediyor + Gönderildi + Kapandı)
```

Cancelled shifts are excluded from both numerator and denominator. No other
synthetic score (an "efficiency index", "on-time rate", etc.) is computed —
the underlying data does not reliably support one yet.

## Branch detail

`buildBranchDetail(row, raw)` — no extra fetch: the comparison table already
loaded every branch's raw period data, so drilling into one branch reuses it
(the same shifts/reports, sorted for a timeline). Manager actions
(overriding reconciliation, editing a report) stay on their existing pages;
the dashboard links to them rather than duplicating their logic.

## Gross profit

Reuses the existing `domain/inventory/summarizeGrossProfit` (complete /
partial / unavailable), unchanged. The dashboard only wraps its result into
kuruş + `MetricState` (`computeGrossProfitCard`). Always labelled "Brüt Kâr"
in the UI, with a standing footnote that it excludes overhead
(rent/payroll/etc.) and is not net profit — "Net Kâr" appears nowhere on
this page.

## 2026 historical data

Not implemented. `docs`/`LEGACY_RECONCILIATION.md` remains the authoritative
record of the unresolved gap between the frozen 2026 presentation totals and
a naive `daily_reports` sum; this dashboard never reads `daily_reports` and
never mixes those frozen totals with V4's own normalized sales data. A
historical mode is future work and needs an explicitly wired, trusted source
first.

## Demo mode

Zero Supabase requests, enforced by `services/demo/dashboard.ts` mirroring
`services/supabase/dashboard.ts`'s shapes and the same inclusion rules
against the in-memory demo store. The existing seeded fixture
(`services/demo/store.ts`, already covering both demo branches over the last
three days) already provided everything section 7 of the brief asked for
without reseeding: Rumeli has zero inventory tracking (a real "not tracked"
branch), İskele Dondurma tracks inventory and has one deliberately uncosted
item (`demo-item-c`) so its gross profit is genuinely `partial`, and Rumeli's
category-level reports include one WARNING and one ERROR reconciliation
case. Demo fixtures are never presented as business data (the existing
"Demo / Önizleme" banner still applies) and Balık Ekmek is not in the demo
fixture at all, matching Stage 3's rule not to invent its operating data.

## Charts

Not built in this phase — the brief marks them optional, and no chart here
would answer a question the existing stat cards and comparison table do not
already answer at this data volume. See `BACKLOG.md`.

## Not built (see BACKLOG.md)

Previous-period comparison, a custom date-range picker in the UI, an
"efficiency score", waste **value** (only a waste-entry **count** is shown —
the client cannot read cost for every role, and the movement itself is
scoped per item/branch), and any historical (pre-V4) reporting.
