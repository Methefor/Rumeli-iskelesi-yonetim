# Legacy Reconciliation

Status: **unresolved discrepancy, documented, not fixed.** Do not treat the
live `daily_reports` table's current totals as automatically authoritative
for historical regression testing, and do not migrate or rewrite historical
calculation logic until this is resolved.

## The problem

A naive current-data query against the live 2026 `daily_reports` dataset
does **not** reproduce the frozen, previously-verified management
presentation totals:

| Period | Frozen presentation total (TRY) |
|---|---|
| June 2026 | 5,056,781.50 |
| July 2026 | 5,026,842.50 |
| August 2026 | 5,959,133.74 |
| **3-month total** | **16,042,757.74** |
| Rumeli main | 13,383,339.24 |
| Balık Ekmek | 762,181.50 |
| İskele Dondurma | 1,897,237.00 |

These figures were presented to management as the authoritative 2026
summer totals. A straightforward `sum(total_revenue)` (or equivalent) over
`daily_reports` for the same calendar periods, as the table exists live
today, does not match them. This was flagged during the live DB audit for
Phase C and has **not** been root-caused or resolved in this session — no
query was run against the live database as part of this phase (no DB
access is configured in this session; this finding was reported to me and
is being documented, not independently re-derived here).

## Why this matters for the rebuild

`BACKLOG.md` (Phase J) calls for regression fixtures built from these exact
reference numbers. Building those fixtures against the current live dataset
*as-is* would silently bake in whatever caused the mismatch — and Phase J's
entire purpose is catching exactly this kind of silent drift before
historical reports are trusted in the V4 app. Migrating historical data or
writing regression tests before this is understood would produce fixtures
that look rigorous but validate against the wrong scope.

## What must happen before migration (not yet done)

1. **Define the frozen reference scope precisely** — not just "June total"
   but: which table rows count (all `daily_reports` rows for the date
   range, or a specific subset?), which `kasa` values are included (does
   `iki_kasa` count toward the presentation total, or only `ana_kasa`?),
   whether `rumeli_z2` or `depo` columns factor in, whether edited/
   corrected entries use their latest value or original value, and how
   timezone/business-date boundaries were interpreted when the frozen
   numbers were first produced.
2. **Identify the actual discrepancy**, once scope is pinned down —
   candidates to check (not yet checked): duplicate rows, rows excluded
   from the original presentation (e.g. test/void entries), a different
   revenue formula than `domain/revenue.calculateDailyRevenue` assumes,
   rows added/edited after the presentation was produced, or a difference
   in how `iki_kasa`/`balik_ekmek`/`dondurma` were attributed to branches.
3. **Reconcile or explicitly annotate** — either the live data can be
   queried in a way that reproduces the frozen totals exactly (in which
   case that query becomes the documented "official" historical scope), or
   it can't, in which case the frozen totals need to be treated as an
   external, hand-verified reference that the live table cannot currently
   reproduce, and that gap needs to be explained in plain language before
   any regression fixture uses these numbers as ground truth.
4. Only after (1)-(3) are done should Phase J regression fixtures be built.

## What this phase does NOT do

- Does not rewrite `domain/revenue` or any calculation to force a match.
- Does not touch `daily_reports` or any other legacy table.
- Does not assume the frozen totals are correct and the live data is wrong,
  or vice versa — both are possible, and this needs an actual data
  investigation with DB query access, not a guess.

## Next step

Requires live, read-only DB query access (not available in this session)
to actually investigate the discrepancy — see `BACKLOG.md` "Immediate
blocker" item, which already tracks the broader need for DB-side access.
