# Manager Report Model (Phase 1E: daily + weekly narrative foundation)

Status: **local development only.** Migration `20261007000100_manager_reports` is NOT applied to production; nothing was committed,
pushed or deployed. No AI provider, key, model or Edge Function exists. The reports work **without AI**; an AI may later only *phrase* a
validated Fact Pack and never calculates.

## 1. Principle: a narrative layer, not a second analytics engine

```
 existing deterministic read models                 A. FACT PACK            B. POLICY/VALIDATOR        C. RENDERER
 dashboard X/Z model, attention feed,   ───►  typed JSON, support    ───►  what may be said,    ───►  deterministic Turkish
 analytics snapshots, inventory control,       states, limitations,         evidence ids, no            text (fallback AND
 procurement, weather                          evidence registry            causal wording              what an AI is held to)
```

Everything is TypeScript in `app/src/domain/managerReport/`, composed from **existing** read models (see `COMMAND_CENTER_MODEL.md`,
`ANALYTICS_MODEL.md`, `WEATHER_MODEL.md`, `INVENTORY_CONTROL_MODEL.md`, `PROCUREMENT_MODEL.md`). Reused, not duplicated:

| Need | Reused source |
|---|---|
| finalized / provisional revenue, Z below X, reconciliation counts, shifts, stock-alert count, gross profit | `domain/dashboard` (`buildDashboard`, fed by `get_dashboard_inputs`): the only X/Z engine |
| attention items and their severity/order | `domain/commandCenter` `buildAttentionFeed` (no severity is recomputed) |
| transactions, average basket, origin, completeness reasons, same-weekday and previous-week comparisons, weather relationship | stored, immutable analytics snapshots (`get_daily_analytics` / `get_weekly_analytics`) |
| waste of a period, closing counts | `get_waste_report`, `get_branch_count_overview` |
| overdue / due / awaiting-approval orders, low stock without order | `get_procurement_attention` (inside the Command Center signals) |
| weather forecast state, historical context with provenance | `get_branch_weather`, `external_context_daily` |

The only new database object is **`get_manager_report_inputs(branch_ids, scope, date)`** (read-only, `SECURITY INVOKER`, STABLE): it bundles
the per-branch pieces those read models do not already carry for a report. It contains no revenue, finalization, comparison or severity logic.

## 2. Binding revenue rule

Z present ⇒ finalized revenue is **exactly** Z. X only ⇒ provisional: it is exposed separately (`provisionalRevenue`, support `partial`) and
never added to finalized revenue. X + Z is never revenue. Z below X uses Z and surfaces the anomaly. A provisional day is never a comparison
sample (the analytics engine already refuses it). The narrative layer never calculates or reinterprets revenue; organization totals are sums of
the branch facts, and an organization-wide average basket is only taken over from a single-branch scope (the engine defines it per day and branch).

## 2a. Four different concepts (never conflate them)

| Concept | Question it answers | Where it lives | Values |
|---|---|---|---|
| **Business-data completeness** | is the revenue picture of the period whole? | `completeness.overall` (+ `limitations`) | `complete` (every branch finalized, no blocking limitation) / `partial` / `no_data` |
| **Metric support** | can THIS metric be stated, and how firmly? | every `Fact.support` | `complete` / `partial` / `unsupported` (value `null`, never 0) |
| **Evidence confidence** | what KIND of statement is this evidence? | `evidence[ref].kind` + `support` | `fact` (directly computed) / `relationship` (association, never a cause); `support` complete/partial; a hypothesis never exists |
| **Report reproducibility** | could this exact Fact Pack be rebuilt later? | `reproducibility.state` + `evidence[ref].origin` | `exact` / `partial` / `live` |

A report can be `complete` yet `live` (today's finished day), and `exact` yet `partial` in metric support. Each concept has its own field, its own
limitation codes and its own validator rule.

## 3. Layer A: the Fact Pack (`manager_fact_pack.v1`)

`buildDailyFactPack(...)` and `buildWeeklyFactPack(...)` are pure and deterministic: the same inputs give the same pack (tested). Every metric is
a `Fact { support, value, reasons, ref }`:

| support | meaning |
|---|---|
| `complete` | whole, supported value. A legitimate 0 stays `0` and `complete` |
| `partial` | a real but incomplete value (provisional, week in progress, some branches/costs missing): never worded as final |
| `unsupported` | no value (`null`), never 0, no evidence id: it can not be cited |

**Daily** (`reportType: "daily"`): `businessDate, generatedAt, scope, isCurrentDate, completeness, organization {finalizedRevenue, provisionalRevenue,
reportingCompleteness, transactions, averageBasket, grossProfit}, branches[], attention, operations, inventory, procurement, weather, analytics,
limitations[], evidence{}, provenance`. Live sources (attention feed, procurement, forecast, stock alerts) are only included when the date is the
branch's today; a past date states `not_current_date` instead.

**Weekly** (`reportType: "weekly"`, Monday–Sunday, Europe/Istanbul business dates; a non-Monday `weekStart` is rejected): finalized weekly revenue,
comparison with the previous week (taken from the snapshot comparison; an organization-level comparison exists only when every branch's comparison is
`ok`), daily finalized series, strongest/weakest day (**only for a completed week** and only with ≥ 2 finalized days), per-branch performance, transaction
and basket comparison states, gross profit, completeness, missing-Z days, reconciliation warning/error days, Z-below-X days, waste, count findings,
current-state procurement (only when the week contains today), historical weather context (reanalysis/modelled, with provenance) and weather
relationships. No forecast ever appears in a weekly pack.

**Comparison rules.** Incompatible comparisons are never made silently. A native week against a legacy/mixed week keeps the revenue comparison but
flags `mixedOrigin` (limitation `mixed_origin`); transactions/basket comparisons across origins are refused (the engine returns `mixed_origin` /
`no_baseline`); an unusable previous week gives `no_comparison_baseline`. The reason is always in the pack.

**Limitations are first-class** (`limitations[]` with a Turkish disclosure sentence): `missing_z, missing_transaction_count, missing_product_detail,
line_semantics_unverified, missing_cost, missing_context, legacy_source_limitation, mixed_origin, stale_weather, incomplete_week, snapshot_missing,
snapshot_stale, source_unavailable, not_current_date, no_daily_history, insufficient_sample, no_finalized_data, no_comparison_baseline`. A snapshot
that disagrees with the live finalized revenue is treated as stale: its derived measures are withheld instead of being mixed with it.
`completeness.overall` describes the **revenue picture** (`complete` = every branch finalized and no blocking limitation: `missing_z`,
`no_finalized_data`, `snapshot_missing/stale`, `source_unavailable`, `incomplete_week`, `no_permission`); optional metrics carry their own support state.

**Recurrence (weekly).** Frequency only: `{code, branch, days, dates, observableDays}` for missing Z, reconciliation warning/error, Z below X,
unexplained count shortage and timing-uncertain count shortage ("bu hafta 3 gün görüldü"). No "recurring"/"critical" threshold is invented. Low stock,
overdue orders and awaiting approval are **unsupported** for recurrence because they are not stored per day (`no_daily_history`).

**Fact / relationship / hypothesis.** A fact is stated directly only when complete; a relationship (weather) only as an association with its sample
("yağışlı günlerde ciro %x düşük görüldü … bu bir ilişkidir, neden-sonuç iddiası değildir"); a hypothesis never appears (V1 excludes hypotheses entirely;
the read model filters them out).

## 4. Evidence model

`evidence{}` maps an id to `{kind: fact|relationship, support: complete|partial, value, unit, label}`. Ids are stable and readable:
`org.revenue.final`, `org.revenue.provisional`, `org.reporting.finalizedBranches`, `branch.<key>.revenue.final`, `branch.<key>.revenue.vsLastWeek.pct`,
`attention.<reasonCode>.<branchKey>`, `recurrence.missing_z.<branchKey>`, `weather.daily.<branchKey>.<date>`, `weather.relationship.<branchKey>.sample`, …
Values are stored with the precision they are printed with (TRY 2 decimals, percentages/temperatures 1, ratios 2), so a number in a text can be proven.
Only supported values are registered: an unsupported metric has no id and can not be cited.

## 5. Layer B: narrative policy and validator (`manager_narrative.v1`)

A narrative is `{schemaVersion, reportType, headline, executiveSummary, sections:[{code,title,body,evidenceRefs}], limitations:[{code,text}], generatedAt}`.
`validateNarrative(raw, pack)` rejects:

- schema/version/report-type errors and missing required sections (`result, attention, operations, inventory, procurement, weather` daily;
  `summary, performance, issues, inventory, procurement, weather, quality` weekly): a section without facts says so, it is never dropped;
- an unknown evidence id; **any number in a section that is not a value of the evidence that section cites** (invented or uncited numbers);
  dates and branch names are not numbers;
- causal wording anywhere (because, caused, nedeniyle, yüzünden, çünkü, …; the disclaimer "neden-sonuç" is allowed) and hypothesis sections;
- a claim about a metric the pack marks unsupported (transactions, average basket, gross profit, waste cost, previous-week comparison) without a disclosure;
- partial/provisional evidence worded as final, and relationship evidence not worded as an association;
- any pack limitation (by `code`) missing from `limitations`;
- **live / mutable evidence worded as an immutable historical fact**: a section citing `live` or `mutable` evidence (or any text of a report whose reproducibility is not
  `exact`) must not use archived / immutable / "yeniden üretilebilir" wording (`live_stated_as_historical`). The confidence/evidence model and the reproducibility model agree.

## 6. Layer C: deterministic renderers

`renderDailyNarrative` ("GÜNLÜK YÖNETİCİ ÖZETİ": Günün sonucu, Dikkat gerekenler, Şube görünümü, Operasyon, Stok/fire/sayım, Siparişler, Hava ve bağlam,
Yarın için takip) and `renderWeeklyNarrative` ("HAFTALIK YÖNETİCİ ÖZETİ": Hafta özeti, Ciro ve performans, Şube karşılaştırması, Operasyonel sorunlar,
Stok/fire/sayım, Tedarik ve sipariş, Hava/bağlam ilişkileri, Önümüzdeki hafta takip listesi, Veri kalitesi ve eksikler). The renderers' own output is
validated by the same validator in the tests: they are held to the contract an AI would be. "Yarın / önümüzdeki hafta" is limited to unresolved
existing facts (open attention items, due/overdue orders, missing Z, missing counts); **no** sales prediction, staffing advice, invented purchase
quantity or weather-to-sales prediction is ever produced.

## 7. AI contract (no provider)

`buildNarrativeAiInput(pack)` = a **sanitized Fact Pack** (internal ids removed) + `allowedEvidenceRefs` + the rules; no database credentials, no raw
rows, no personal data. `resolveNarrative(pack, candidate)` / `generateNarrative(pack, callModel)` validate a candidate and **never throw**: any model
error, timeout, bad JSON or contract violation falls back to the deterministic narrative (with `fallbackReason`). The model call is an injected
function; nothing in the repository calls OpenAI/Claude/Gemini, holds a paid key or deploys an AI function. `ReportMetadata` (RUNTIME metadata of the generating call, **not** a persisted audit record) carries report type,
scope, schema versions, source snapshot ids/versions, reproducibility, a non-cryptographic fingerprint of the Fact Pack (`factPackFingerprint`), generator
(`deterministic_renderer` | `ai`), validation result and, for AI, provider/model/prompt-contract version. **A persisted narrative audit trail is deferred until
`manager_report_snapshots` (or an equivalent store) exists**; V1 persists nothing about a generated report, and no existing audit table records report generation.

## 8. Reproducibility, persistence and versioning

**Reproducibility is derived, never claimed.** Every evidence entry has an `origin`:

| origin | source | example |
|---|---|---|
| `immutable` | a stored, versioned analytics snapshot (rebuildable from its pinned version) | transactions, average basket, comparisons, weekly revenue/series, per-day reconciliation history, historical weather and relationships |
| `mutable` | ordinary tables that can still change | a daily report's revenue/reconciliation/shifts (report tables), waste, closing counts |
| `live` | current operational state | attention feed, procurement attention, forecast, stock alerts, open reconciliation backlog |

`reproducibility.state`: **`live`** when the period is still open (today, current week) or any live evidence is cited; else **`partial`** when any mutable
evidence is cited; else **`exact`**. A live pack carries the limitation `live_state`, a partial pack `mutable_sources` (both propagated into the narrative).

| Report | State | Why |
|---|---|---|
| daily, today | `live` | open period + live attention/procurement/forecast |
| daily, historical date | `partial` (never `exact` in V1) | snapshot-derived facts are exact, but revenue/waste/counts are mutable reads |
| weekly, current week | `live` | open period (and live procurement when available) |
| weekly, completed historical week | `exact` only when every cited fact is snapshot-backed (e.g. waste/counts withheld by permission); `partial` when waste/counts are included | waste/counts are mutable ledger/count reads |

The pack records the snapshot ids/versions it used (`provenance.snapshots`); `provenance` and `ReportMetadata` are **runtime report metadata**, not a persisted
audit record.

**V1 adds no table.** Reasons: (1) the revenue, comparison, origin and weather facts of the snapshot-backed parts already come from immutable, versioned
analytics snapshots; (2) the deterministic narrative is a pure function of the pack; (3) storing a client-built payload would persist facts the server did
not compute, and building the pack in SQL would create a second revenue engine; (4) live parts are current state by nature. **Persisted narrative audit trail
(who generated what, from which pack, with which validation result) is deferred until `manager_report_snapshots` or an equivalent store exists**; it must then be
filled server-side (service-role function), append-only, and is justified once a generator whose output is not reproducible (an AI provider) exists.
Schema versions: `manager_fact_pack.v1`, `manager_narrative.v1`, `manager_narrative_contract.v1`.

**Historical / live boundary.** A report for a past date or a completed week never borrows today's state: attention, procurement attention, forecast, stock
alerts, the open reconciliation backlog and the "Yarın için takip" section are absent (`not_current_date` / `no_daily_history`) even if live signals are
supplied to the builder (tested). Recurrence of low stock / overdue orders stays unsupported because no per-day state is stored. A future business date is refused.

## 9. Security: domain permission intersection

`analytics.read` is only the **entry** permission of the report feature. It is never an umbrella: a manager report may only expose data the caller could read
through that domain's own permission model, and an unauthorized part is an explicit `no_permission`, never an empty all-clear.

`get_manager_report_inputs` runs as the caller (`SECURITY INVOKER`, STABLE, locked `search_path`, no PUBLIC/anon execute, `authenticated` only). It requires
`analytics.read` (cashier/employee/viewer: denied; anon: no execute grant) and returns, per branch, the caller's **access flags** computed by the same helpers the
domains use (permission + branch scope), plus parts that keep their own permission:

| Domain | Gate | Without it |
|---|---|---|
| analytics snapshot | `analytics.read` + branch scope (inner RPC) | branch is `{error: unavailable}` |
| financial values (revenue, transactions, basket, gross profit, comparisons, weekly payload) | `analytics.financial.read` (`access.financial`; payload also redacted by the RPC) | `no_permission`, values `null`, no evidence id, nothing in organization totals |
| report data (finalization, reconciliation, shifts, recurrence history) | `reports.read` + branch scope (`access.reports`) | the branch is excluded and named as a missing part (`no_permission`); no attention item of it |
| stock alerts | `inventory.read` + branch scope (`access.stock`) | `no_permission`; no stock-alert attention item |
| waste / closing counts | `inventory.waste_report.read` / `inventory.count_review.read` (own part) | part `unavailable / no_permission` |
| procurement, forecast | `procurement.order.read` / `weather.read` inside the Command Center signals (own part) | part unavailable; the pack says `no_permission` |
| historical weather context and relationships | `weather.read` (`access.weather`) | withheld, `no_permission` |

Organization totals are the sum of the **permitted** branch facts only (never of the dashboard totals) over the whole scope: a withheld or unreadable branch makes the
total `partial`. branch_manager reads only their own branch (another branch is `{error: unavailable}` with nothing of it in the entry). Tested for owner, manager,
branch_manager (own/other branch, without financial, without waste/count, with ONLY `analytics.read`, without `analytics.read`), cashier, employee, viewer, anon
(`supabase/tests/manager_reports.test.sql`, 62 assertions) and in the domain builders (`hardening.test.ts`).

## 10. UI

`/app/manager/reports/daily-summary` and `/app/manager/reports/weekly-summary` (mobile-first): date or week selector with previous/next, completeness chip
(Veri tam / Kısmi veri / Veri yok, Hafta sürüyor, Geçmiş tarih), a hero card (headline + summary), then collapsible section cards (the first two open,
the rest closed: progressive disclosure), a "Dayanak" disclosure per section listing the cited evidence with labelled values, a link to the existing
screen behind each section, a "Sınırlamalar" card and a footnote that no AI was used. Loading skeleton, retryable error state, no-data note and a
past-date state exist. The Command Center only gets two links ("Günün yönetici özeti", "Haftalık özeti aç"); it stays independent of the narrative.

## 11. Performance

Constant request counts independent of the number of branches (tested with a counting client for 1/3/10/20 branches): daily today 3 (dashboard
inputs, Command Center signals, report inputs), daily past date 2, weekly current week 2, weekly past week 1. Snapshots are read, never regenerated; no
table is queried directly; no per-branch call.

## 12. Not supported / not invented

Sales prediction, staffing advice, invented purchase quantities, weather-to-sales causality, hypotheses, per-day history of stock/orders, hourly
analysis, delivery (email/WhatsApp), a send time, a notification schedule, an AI provider/model/budget, a final tone policy.

## 13. Open decisions

AI provider/model/budget and when a stored narrative table is added; delivery channel and report time; whether the daily summary should become a push
notification; tone policy; whether recurrence should ever get owner-configured thresholds; per-day storage of stock/order state to make low-stock and
overdue recurrence supported; a weekly relationship across branches.
