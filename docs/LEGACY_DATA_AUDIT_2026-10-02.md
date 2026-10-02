# Legacy Data Audit — 2026-10-02

## Scope and safety

The hosted legacy project was queried read-only through the same public read
path used by the running legacy application. No hosted row, schema, user,
Storage object or function was changed. The audit fetched report fields and
cashier identifiers only; cashier names and legacy PINs were not fetched or
written to disk.

Source fingerprint:
`41124dba55c87eaabee72a911d0ab8a1c60fe226fab84754b9bced6922f2e257`

## Source profile

| Check | Result |
|---|---:|
| `daily_reports` rows | 538 |
| Date range | 2026-02-01 — 2026-10-01 |
| X (`sabah`) rows | 263 |
| Z (`aksam`) rows | 275 |
| Cashier identifiers | 5 |
| Rows with unknown cashier | 0 |
| Duplicate date/shift/register groups | 0 |
| Negative/invalid monetary values | 0 |
| `total_revenue` vs branch-component mismatches | 11 |

The legacy `total_revenue` field is not authoritative for migration. V4 Rumeli
gross revenue is reconstructed in integer kuruş from `rumeli_z1 + rumeli_z2`;
`balik_ekmek` and `dondurma` become separate branch reports.

## X/Z root cause and frozen-reference variance

Adding every legacy row counts morning X and evening Z together even though Z
is the closing revenue. Historical management revenue must use Z reports.

| Month | Current source Z | Frozen presentation | Difference |
|---|---:|---:|---:|
| June 2026 | ₺5,011,321.50 | ₺5,056,781.50 | -₺45,460.00 |
| July 2026 | ₺5,170,171.00 | ₺5,026,842.50 | +₺143,328.50 |
| August 2026 | ₺5,959,133.74 | ₺5,959,133.74 | ₺0.00 |
| **Summer** | **₺16,140,626.24** | **₺16,042,757.74** | **+₺97,868.50** |

August proves the X/Z interpretation exactly. June and July no longer reproduce
the frozen presentation; the legacy table has editable rows and no version
history capable of reconstructing their earlier values. The migration preserves
the current row-level source and preserves the frozen totals in
`legacy_reference_totals` as separate comparison evidence. It does not invent a
balancing row or alter source data to force a match.

## Target plan and local evidence

The transaction plans 836 V4 reports:

- 538 Rumeli register reports;
- 190 Balık Ekmek Z reports;
- 108 İskele Dondurma Z reports.

Balık Ekmek and Dondurma category splits do not exist in the legacy source.
Their gross revenue is preserved with an explicit missing-breakdown note and
ERROR reconciliation state. Historical `cafetarya` and `restoran` register
keys remain inactive historical registers instead of being guessed to be the
current Ana Kasa / 2. Kasa devices.

A fresh local Supabase reset applied every migration, including the new legacy
import migration. The real-source/local-target suite passed 15 assertions, including the inactive archival-profile case:
dry-run rollback, exact row plan, atomic apply, source lineage for every report,
Z total equality to the kuruş, missing-category disclosure, idempotent rerun,
and source-drift rejection. Production remains untouched.

## Remaining production gate

Before a hosted apply, provision the five owner-confirmed active V4 cashiers
from `identity-data/approved_staff.csv`, plus the owner profile. Of the five
legacy identities, two map to active cashiers and three map to inactive,
no-login archival profiles so historical authorship is retained without
creating current accounts. Then take verified database and Storage backups,
re-run this audit and confirm the exact fingerprint. A hosted apply still
requires a separate explicit owner approval.
