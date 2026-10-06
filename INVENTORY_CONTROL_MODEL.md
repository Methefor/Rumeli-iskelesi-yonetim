# Inventory Control Model (Phase 1B — fire reasons, fire report, closing-count review, branch location)

Status: **local development only**. Migrations `20261006000200_waste_reasons`, `20261006000300_inventory_control_reports`,
`20261006000400_branch_location` (after `20261006000100_analytics_engine_v1`) are NOT applied to production; nothing was
committed, pushed or deployed. They extend the existing inventory ledger, counts and `branches`; no parallel
inventory, fire or counting system exists.

## 1. Fire (waste) reasons — `public.waste_reasons`

- The reason is **data**. `inventory_movements.reason_code` references `waste_reasons.code` (foreign key, replacing the
  fixed CHECK). The six historical codes are seeded in the same migration, before the FK is added, so every existing WASTE
  movement stays valid; no ledger row is rewritten. The seeded names are historical defaults, **not a decided final
  catalogue** (open decision).
- `code` is immutable (movements reference it); reasons are **deactivated, never deleted** (`on delete restrict`).
- Management only through audited RPCs: `upsert_waste_reason`, `set_waste_reason_active` (permission
  `inventory.waste_reason.manage` = owner + manager; mandatory reason ≥ 5 chars; audit actions `waste_reason_create/update/
  activate/deactivate`; audit values hold only code/name/description/sort/active — no personal data). No direct write grant.
- Visibility (RLS): managers see all reasons, everyone with `inventory.record`/`inventory.read` sees only **active** ones.
  `record_inventory_waste` accepts only an active catalogue code.
- History: a movement whose reason was later deactivated stays readable (tested for a cashier and in the manager report, which
  still names the inactive reason). The append-only trigger still blocks UPDATE/DELETE of movements.

## 2. Fire report — `get_waste_report(branch, from, to)`

Deterministic SQL over WASTE movements (Istanbul calendar dates; `today / 7 days / month-to-date / custom` are UI presets of
the same function). Returns entries, reversed entries, quantity per unit, cost, cost coverage and groupings by item, reason,
employee and shift. A WASTE movement that has a REVERSAL is excluded and counted in `reversedEntries`.
Permission `inventory.waste_report.read` (owner/manager org-wide, branch_manager own branches; cashier/employee/viewer denied).

### Cost states (never confuse "unknown" with 0; missing cost is never estimated)

Every cost is a metric `{state, value, knownCostKurus, costedQuantity, totalQuantity, reason}`:

| state | rule | knownCostKurus |
|---|---|---|
| `available` | every included quantity has a `unit_cost_snapshot` (a real 0 only when nothing was wasted) | exact |
| `partial` | some but not all quantity has a snapshot; `reason: missing_cost` | the costed part only |
| `unavailable` | no quantity has a snapshot (`missing_cost`) or the caller lacks `inventory.cost.read` (`no_permission`) | `null` (never 0) |

The report also returns `costCoverage {state, costedEntries, entries}`. Single helper: `inventory_cost_metric()`; TypeScript
twin `costMetric` in `domain/inventory/control.ts`.

## 3. Closing-count classification

`variance = physical − expected`; `expected` is the server-side theoretical stock snapshot taken when the count was submitted.
Classification: `balanced | shortage | surplus` (exact, **no tolerance**).

### Timestamp semantics (exact rule)

The ledger has **one** time per movement, `occurred_at`: the server clock at insertion (`default now()`; no RPC accepts a client
timestamp; `created_at` is the same instant). It does **not** distinguish when a waste physically happened from when it was
entered. Consequences:

1. Waste recorded **before** the count is already deducted in `expected`; it is not a candidate and is never used again.
2. Waste recorded **after** the count may have happened before it (entered late) or after it (a later state). The data model
   cannot tell, so it is **never** treated as an explanation. It is a **candidate**: the shortage line becomes
   `timing_uncertain`, with `candidateWasteQuantity`, `potentialExplainedQuantity = min(shortage, candidate)`,
   `confirmedExplainedQuantity = 0` and `unexplainedQuantity` = the whole shortage.
3. A candidate must be for the same item, not reversed, recorded strictly after the count (equal instants are ambiguous and
   excluded), before the next submitted count of that item (a voided count does not end the window), in the same shift when
   both have one, otherwise on the same Istanbul business date. Same date with unknown ordering is therefore only a candidate.
4. No candidate → `unexplained`. Balanced/surplus lines → `not_applicable`.
5. `explained_by_waste` is **not emitted by this model**. It becomes possible only after waste entries carry a reliable effective
   event time (a future decision/migration); the response contract already separates candidate from confirmed quantities.

Other limits (also returned in every payload as `method`): no tolerance (exact quantities), precision is shift or business
date, it concerns quantities not causes, voided counts are listed and labelled but excluded from totals and from "latest count".
Review functions are read-only; counts and the ledger never change. Corrections follow the existing void/adjustment/reversal +
audit patterns.

RPCs: `get_inventory_count_review(count)`, `get_branch_count_overview(branch, limit)` (permission
`inventory.count_review.read`, branch-scoped: owner/manager/branch_manager). Service-role only: `inventory_count_classified_lines`,
`inventory_count_summary`. Overview today status: `submitted | voided_only | missing`.

## 4. Branch location

`public.branches` is **unchanged** except for one non-sensitive column, `timezone` (default `Europe/Istanbul`, existing values never
overwritten, validated against the IANA list by a trigger on every write path). Sensitive detail lives in
`public.branch_locations` (one optional row per branch: `latitude`, `longitude`, `address`, `location_label`; coordinates both or
neither, −90..90 / −180..180; **no row is seeded, no coordinate is invented**; no geocoding, no weather provider).

Why a side table: a column-level SELECT revoke on `branches` would make `select *` fail for every authenticated user and break
existing branch lookups (frontend, embeds like `branches(name)`, tests, tools). With the side table every existing consumer is
untouched and the detail is hidden by its own RLS.

Privilege model: reads need permission `branch.location.read` (owner, manager org-wide; branch_manager own branches only), by RLS
on `branch_locations` or `list_branch_locations()`; cashier/employee/viewer get no rows; anon is denied. Writes only through
`update_branch_location` (`branch.manage` = owner + manager, mandatory reason, audited, validated); no direct INSERT/UPDATE/DELETE
grant. Audited consumers of `branches`: `listBranches`, `dataQuality`, PostgREST embeds in `shifts.ts`/`sales.ts`, the HTTP/SQL
suites and the import/operating-data tools — none select the new detail and none changed.

## 5. App layers

SQL is authoritative. `domain/inventory/control.ts` holds payload types and pure rules (`costMetric`, `classifyCountLine`,
`validateCoordinates`, `periodRange`, role-visibility helpers); it is the twin used by the demo service and unit tests with the same
fixture numbers as `supabase/tests/inventory_control.test.sql`. Supabase calls live only in `services/supabase/inventoryControl.ts`;
`services/demo/inventoryControl.ts` is the synthetic mirror. Screens (Management hub, not the Command Center):
`management/waste-reasons`, `waste-report`, `count-review`, `count-review/:id`, `branch-location`; fire entry reads the active catalogue.

## 6. Synthetic QA data (`VITE_DEMO_FIXTURES=qa`, demo mode only)

`services/demo/qaInventoryControl.ts`: normal fire, missing-cost fire, shortages with later-recorded waste (timing_uncertain),
an unexplained shortage (waste recorded before the count), a surplus, a branch without today's count, a branch whose only count is
voided, three branches. Everything is invented; no production values, URLs, keys or identities.

## 7. Open owner decisions (not invented here)

- the final fire reason catalogue and names; whether `other` requires a note;
- whether waste entries should carry a reliable **effective event time** (needed before any `explained_by_waste`);
- count tolerance thresholds and approval rules for variances; who may correct a count after the fact;
- real branch coordinates / address and which weather provider (if any) uses them;
- supplier relationships, minimum/target stock (not modelled); fire-report scheduling/notification (none exists).
