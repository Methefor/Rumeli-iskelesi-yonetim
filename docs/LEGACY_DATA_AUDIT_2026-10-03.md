# Legacy Data Audit — 2026-10-03

## Scope and safety

The hosted legacy project was queried read-only after the cashier continued
using the legacy application. No hosted row, schema, user, Storage object or
function was changed. The audit fetched report fields and cashier identifiers
only; cashier names and legacy PINs were not included in the audit output.

Source fingerprint:
`e83b3fa15fc262bd2fab3f6eb2a415ed726c618e82c45801b30d995bb883a67c`

## Source profile

| Check | Result |
|---|---:|
| `daily_reports` rows | 541 |
| Date range | 2026-02-01 — 2026-10-03 |
| X (`sabah`) rows | 265 |
| Z (`aksam`) rows | 276 |
| Cashier identifiers | 5 |
| Rows with unknown cashier | 0 |
| Duplicate date/shift/register groups | 0 |
| `total_revenue` vs branch-component mismatches | 11 |

Compared with the 2026-10-02 audit, the live legacy application added three
reports: two X rows and one Z row. The Z row added one Balık Ekmek target report;
the Dondurma target count did not change. The earlier fingerprint and 836-report
plan are therefore obsolete and must not be used for a production apply.

## Current target plan

The transaction now plans 840 V4 reports:

- 541 Rumeli register reports;
- 191 Balık Ekmek Z reports;
- 108 İskele Dondurma Z reports.

Historical revenue still uses Z only. Rumeli remains `rumeli_z1 + rumeli_z2`;
Balık Ekmek and Dondurma remain separate branches. The June, July and August
current/frozen comparison is unchanged from the 2026-10-02 audit.

## Backup evidence

A pre-V4 production backup was created outside Git on 2026-10-03 with separate
role, schema and data dumps plus SHA-256 manifest. A disposable local restore
successfully reconstructed 541 `daily_reports`, five `cashiers`, zero
`auth.users` and one `storage.objects` metadata row. The hosted dump needs
two local bootstrap schema grants during a blank restore because the disposable
local Supabase roles use different `NOINHERIT` defaults; the original backup
files and their hashes were not modified.

The single Storage object body is not contained in the database dump. It remains
a separate backup gate.

## Local migration and schema-collision evidence

A fresh local reset and the real-source/local-target suite passed 15 assertions
with the new fingerprint and exact 840-report plan. Dry run changed nothing;
apply, lineage, kuruş equality, inactive archival profiles, idempotency and drift
rejection all passed. The local database was reset afterward.

The restored production schema contains eight public tables and four public
functions. The prepared V4 migrations contain 30 tables and 71 functions. An
offline name comparison found zero table collisions and zero function
collisions.

## Remaining production gate

Complete the single Storage object-body backup, then provision the hosted V4
schema/functions and identities before running the hosted migration dry run.
Any further legacy write invalidates this fingerprint and requires another
audit. Production data apply still requires a separate explicit owner approval.
