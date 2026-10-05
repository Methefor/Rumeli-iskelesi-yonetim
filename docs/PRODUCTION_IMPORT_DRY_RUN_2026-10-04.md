# Production import dry-run rehearsal — 2026-10-04

**Local disposable Supabase only.** Input: the current read-only legacy snapshot
(fingerprint `8195640b1eb36fc3458b1d204673de8977c16f898841c8ed1a7370270716794c`,
542 rows). Nothing was written to production. Executable proof:
`supabase/tests/legacy_import_rehearsal.test.mjs` — **48 assertions passed** on a
fresh 22-migration reset (also re-run in the final regression), driving the real
CLI entry points (`legacy-migration/run.mjs`, `identity-data/provision-archival.mjs`)
and `legacy-migration/post_apply_checks.sql`. The older
`legacy_sales_import.test.mjs` (15 assertions) was refactored to derive expected
counts from the raw rows instead of the pinned 541/840 values, and still passes.

## Actual dry-run result (not assumed)

| Quantity | Value |
|---|---:|
| Source rows | 542 (X 265 + Z 277), 2026-02-01 … 2026-10-03, 5 cashier identities |
| Dry-run `createdReports` | **842** |
| Rumeli İskelesi reports | 542 |
| Balık Ekmek reports (Z with `balik_ekmek` > 0) | 192 |
| İskele Dondurma reports (Z with `dondurma` > 0) | 108 |
| Rows written by the dry run | 0 (sales_reports, lineage, runs, map, shifts, registers all unchanged) |

The ~840 of the earlier plan was a snapshot of an older source; today's plan is
842 and is **recomputed**, not pinned, by the guard (`plannedReportCount`), the
audit (`auditLegacyRows`) and an independent count in the test; all three agree.

## Verified properties

| Property | Result |
|---|---|
| Expected source row count / plan equals independent count | PASS |
| No duplicate lineage; one lineage row per report; one immutable import run | PASS (post-apply checks 30–31, 20–21, 10) |
| X is not double-counted with Z | PASS — Rumeli X total (265 reports, 9 943 454.75 TL) and Z total (277 reports, 24 512 524.70 TL) are kept as separate report types and equal `rumeli_z1+rumeli_z2` of `sabah`/`aksam` rows respectively; management revenue uses Z only |
| `rumeli_z1 + rumeli_z2` logic | PASS — Rumeli Z equals the sum of both columns to the kuruş; `total_revenue` is never trusted (11 rows disagree) |
| Balık Ekmek separation | PASS — 192 Z reports on the `daily` shift / S900 register, 1 633 286.50 TL, no X report |
| İskele Dondurma separation | PASS — 108 Z reports, 2 174 767.50 TL, no X report |
| Organization Z total | 28 320 578.70 TL = Rumeli Z + Balık + Dondurma exactly, to the kuruş |
| Frozen references retained separately | PASS — 7 `legacy_reference_totals` rows; June (−4 546 000 kuruş) and July (+14 332 850 kuruş) variance disclosed, **not** balanced; August 0 (exact) |
| No balancing/correction rows | PASS |
| No legacy PIN migration | PASS — `pin_credentials` still contains only the 6 local fixture accounts; importer RPC has no PIN input; source field list contains no PIN/name column |
| Archived identities retain authorship | PASS — H001=261, H002=118, H003=50, K001=303, K002=110 reports (total 842), equal to the independent per-person prediction; no report attributed to an active archival profile |
| Archival profiles cannot log in | PASS — inactive, no PIN, no role/branch, Auth user banned |
| Idempotency | PASS — second apply returns `alreadyImported`, zero new rows |
| Source drift guard | PASS — a changed legacy row (new fingerprint) is rejected (`source drift`) and never overwrites imported history |
| Target collision guard | PASS — same fingerprint cannot re-import; existing lineage cannot be overwritten; hosted collision audit shows zero name collisions |
| Rollback on injected failure | PASS — a row with an invalid shift in a COMMIT run aborts everything; reports/lineage/runs/map/shifts/registers identical to before; an unmapped cashier also aborts and rolls back |
| Wrong project / no target ref / no fingerprint / no dry-run acknowledgement / anon key / hosted without flags | all refused with exit code 3 before any target call |
| Post-apply SQL pack | **35 PASS, 8 INFO, 0 FAIL**, and a negative control (an active archival profile) is detected as FAIL |

## Reconciliation consequences to expect (information for the owner)

Imported status distribution: OK 350, WARNING 8, **ERROR 484**. 300 of the ERRORs
are by design (Balık/Dondurma reports have no category split in the legacy data)
and 184 are Rumeli reports whose category breakdown disagrees with the register
total in the legacy data. After import the manager dashboard and reconciliation
queue will show **492 historical flagged reports**. They are visible, not
corrected; clearing them requires an audited override per report. Decide before
the pilot whether the dashboard period defaults (Bugün/7/30 days) are enough to
keep daily work readable. No bulk-override tool exists (and none was built).

## Not proven by the rehearsal

- Hosted-only behaviour (see the collision audit "Not verifiable without a write").
- The DB function trusts the caller's `p_source_fingerprint`; integrity of
  fingerprint ↔ rows is enforced by `run.mjs` (recomputed from the rows and
  matched against `--expect-fingerprint`), not by SQL.
- The importer writes `legacy_sales_import_runs` and per-report lineage but no
  `audit_logs` row (the service-role path has no `auth.uid()`); the run record
  carries actor, reason, fingerprint and timestamp.

## Re-run before the real thing

Dry-run output must be regenerated at T-60m with the **final** fingerprint and
shown to the owner; the 842 here is only valid for fingerprint `8195640b1eb3…`.

## Addendum — final rehearsal on the latest snapshot

The rehearsal was re-run after the legacy source moved to 544 rows (fingerprint
`00fed3c2f19f…`): dry run planned **845** reports (544 Rumeli / 193 Balık Ekmek /
108 Dondurma), per-person counts H001=261 H002=118 H003=50 K001=304 K002=112, post-apply
pack 35 PASS / 8 INFO / 0 FAIL, and the suite now also proves the data-import
rollback (locked cleanup script, return to the pre-import baseline, clean
re-import): **54 assertions passed**. Tables above show the earlier 842-report
snapshot; every figure is derived from whatever the source holds at run time.
