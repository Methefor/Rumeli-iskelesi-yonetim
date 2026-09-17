# Sales & Reconciliation Model (Phase D — prepared, local-staging-validated)

See `CORE_DATA_MODEL.md` for how this fits the wider schema.

## X/Z semantics

`sales_reports.report_type` is `'X'` or `'Z'` — a morning and an evening
register reading for the same shift, exactly the legacy accounting rule
(see `domain/revenue/calculateShiftRevenue.ts`, unchanged since Phase B):

- **Both exist:** total = X + max(0, Z − X). The evening reading is a
  cumulative register total that already includes the morning's X, so it's
  never simply added on top.
- **Only one exists:** use that report's own `gross_revenue` directly — no
  guessing which side is "missing."

`domain/revenue/deriveShiftRevenueFromReports.ts` (new, Phase D) bridges the
`sales_reports` row shape to `calculateDailyRevenue`'s `(morningX, eveningZ)`
input, filtering out `cancelled` reports so a cancelled X/Z never silently
counts as "no reading exists" when in fact a real one is just voided. See
its test file for the frozen fixture note below.

**No real 2026 X/Z fixtures exist.** The frozen totals in `BACKLOG.md`
(June/July/August/3-month) are monthly aggregates, not per-shift X/Z pairs
— there is nothing at the shift level to use as a "known-scope" fixture yet
(see `docs/LEGACY_RECONCILIATION.md`, still unresolved). The domain tests
use illustrative round numbers, explicitly documented as such, not
historical data.

## Duplicate prevention

Enforced at two levels, deliberately redundant:

1. **`create_sales_report()`** (011) does an explicit pre-check and raises
   a clear error (`'a % report already exists for this shift/register'`)
   before ever reaching the database constraint.
2. **Two partial unique indexes** (009) are the actual authoritative
   guarantee: at most one non-cancelled `X` and one non-cancelled `Z` per
   `(shift_id, report_type)`, optionally scoped to a specific `register_id`
   for branches that track register-level detail.

A cancelled report frees up its slot — cancel-then-resubmit is the
correction path, not editing report_type.

## What "expected" vs. "actual" means here

The brief asks for a generic `expected/actual/difference/status`
reconciliation. Phase D's concrete interpretation: **expected = the
report's declared `gross_revenue`; actual = the sum of its
`sales_report_items.amount`.** This is the same check the legacy app's own
"kasa dağılımı" (cash distribution) validation was already informally doing
(see `WORKLOG.md`'s Phase B/pre-rebuild history) — category breakdown
should sum to the declared register total; a mismatch means either a
data-entry error or an actual cash discrepancy, and both deserve a flag.

`compute_reconciliation_status(expected, actual, branch_id)` (SQL,
`011_operational_rpcs.sql`) and `domain/reconciliation/reconcile.ts`
(TypeScript, existing since Phase B) implement the identical three-tier
comparison against `reconciliation_thresholds` (per-branch, config-driven —
seeded at 2%/5% warning/error for the two primary branches, adjustable via
`reconciliation_thresholds_write_privileged`, `settings.manage`). SQL is
authoritative for what's actually stored; TypeScript is for an optimistic
client-side preview only, same relationship as the shift-timing rule in
`SHIFT_MODEL.md`.

## Report lifecycle

`status`: `submitted → edited` (via `edit_sales_report()`, reason
mandatory, recomputes `reconciliation_status` from the new items), or
`→ cancelled` (via `cancel_sales_report()`, reason mandatory). **Never a raw
DELETE** — a cancelled report is kept, visible in the caller's own
history, excluded only from `listReconciliationQueue`'s "needs attention"
view.

## Reconciliation override

`override_reconciliation()` (011): owner/manager org-wide, or
`branch_manager` with `sales.edit_all` + a shared branch membership.
**Reason is mandatory** and the action writes two things, not one:

1. A `sales_report_overrides` row — append-only, `previous_status`/
   `new_status`/`reason`/`overridden_by`/`overridden_at`, so overriding a
   report a second time never erases the first override's history.
2. An `audit_logs` row (`action = 'reconciliation_override'`), matching
   every other privileged action in this codebase.

## Ownership vs. permission

`sales.edit_own` (held by cashier/employee) only ever applies when
`submitted_by = auth.uid()` — a cashier cannot edit a colleague's report
even with `sales.edit_own`. `sales.edit_all` (manager org-wide,
`branch_manager` branch-scoped) is the only path to edit/cancel/override a
report the caller didn't submit. Both `edit_sales_report()` and
`cancel_sales_report()` check this identically, so the two actions can
never drift in who's allowed to do them.
