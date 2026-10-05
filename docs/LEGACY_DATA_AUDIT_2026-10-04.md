# Legacy Data Audit — 2026-10-04

Supersedes `LEGACY_DATA_AUDIT_2026-10-03.md` (its fingerprint and 840-report plan
are **obsolete**).

## Safety

Read-only. The legacy source was read with `legacy-migration/audit.mjs` (HTTP GET
through the legacy app's own public read path; report fields and cashier ids
only — no names, no PINs). The production catalog was inspected with SELECT
statements only. No production row, schema, user, Storage object or function was
changed. The only file written was an export of the single public Storage object
body to a folder **outside Git**.

## Source profile (fingerprint 2026-10-04)

| Check | Result |
|---|---:|
| `daily_reports` rows | **542** (was 541) |
| Date range | 2026-02-01 — 2026-10-03 |
| X (`sabah`) rows | 265 |
| Z (`aksam`) rows | **277** (was 276) |
| Cashier identifiers | 5 |
| Rows with an unknown cashier | 0 |
| Duplicate date/shift/register groups | 0 |
| `total_revenue` vs branch-component mismatches | 11 |

**Source SHA-256 fingerprint**

`8195640b1eb36fc3458b1d204673de8977c16f898841c8ed1a7370270716794c`

Previous approved snapshot (2026-10-03): `e83b3fa15fc262bd2fab3f6eb2a415ed726c618e82c45801b30d995bb883a67c`
(541 rows). One Z row was added by the live legacy app since then.

## Verdict: DATA APPLY BLOCKED until this fingerprint is reviewed and re-approved

The fingerprint differs from the last approved snapshot, so under the standing
rule **no data apply may use either value as an approval**. The legacy app keeps
accepting reports every day, so the fingerprint will keep moving until legacy
writes are frozen. The cutover runbook therefore takes the *final* fingerprint
inside the maintenance window (T-60m, legacy frozen) and requires the owner to
approve **that** value. The 2026-10-03 value must never be reused.

## Current target plan (independently recomputed)

| Branch | Reports |
|---|---:|
| Rumeli İskelesi (one per source row: 265 X + 277 Z) | 542 |
| Balık Ekmek (Z rows with `balik_ekmek` > 0) | 192 |
| İskele Dondurma (Z rows with `dondurma` > 0) | 108 |
| **Total** | **842** |

The "~840" in earlier plans was a snapshot of an older source; **842** is the
number for the current fingerprint. It is derived, never pinned: the rehearsal
suites compute it from the raw rows.

## Reconciliation against the frozen management references

Unchanged from earlier audits (Z components = `rumeli_z1 + rumeli_z2 +
balik_ekmek + dondurma`; X and Z are never added):

| Month | Current (kuruş) | Frozen (kuruş) | Difference (kuruş) | Status |
|---|---:|---:|---:|---|
| 2026-06 | 501 132 150 | 505 678 150 | −4 546 000 | variance disclosed, **not** balanced |
| 2026-07 | 517 017 100 | 502 684 250 | +14 332 850 | variance disclosed, **not** balanced |
| 2026-08 | 595 913 374 | 595 913 374 | 0 | **exact reproduction** |

The June/July differences remain unexplained legacy-data facts; the importer
never writes balancing rows (verified by the rehearsal and by
`post_apply_checks.sql`).

## Production read-only facts gathered today

- Linked project ref `iwikwbjsznjuefvuemdb` ("Rumeli İskelesi Database").
- Remote migration history: exactly one entry, `20260611233031 add_kategori_devri`
  (`ALTER TABLE daily_reports ADD COLUMN IF NOT EXISTS kategori_devri …`). None of
  the 21 V4 migrations is applied.
- `auth.users`: 0. Storage: bucket `avatars` (public) with 1 object; no
  `avatars-v4`. No Edge Function deployed.
- Legacy tables carry wide-open anon policies (public insert/update/**delete** on
  `daily_reports`, public read of `cashiers` incl. PIN column). This is the known
  legacy exposure that the V4 cutover removes from daily use; it is **not**
  changed by this phase.

## Backups

- 2026-10-03 pre-V4 role/schema/data dumps exist outside Git with a SHA-256
  manifest. They contain 541 `daily_reports` and are therefore **stale for
  cutover**: a fresh dump is required at T-60m (see `PRODUCTION_BACKUP_RUNBOOK.md`).
- The single Storage object body (`avatars/…/avatar.jpeg`, 535 312 bytes, JPEG)
  was exported read-only on 2026-10-04 to
  `C:\projects\Rumeli-iskelesi-yonetim-backups\20261004-storage-object\` outside
  Git. SHA-256 of the body:
  `80a8d0ecc5cb8600aaea722c4f93f13695c1252d25c402ded6a86ef00d7651e7`.
  This closes the "open backup item" of the 2026-10-03 audit.

## Addendum — the source moved again the same day (latest read-only audit)

Later on 2026-10-04 the live legacy app had accepted more reports:

| Check | Result |
|---|---:|
| `daily_reports` rows | **544** |
| Date range | 2026-02-01 — 2026-10-04 |
| X / Z rows | 266 / 278 |
| Unknown cashier rows / formula mismatches | 0 / 11 |
| Plan | 544 Rumeli + 193 Balık Ekmek + 108 Dondurma = **845** |
| June / July / August difference (kuruş) | −4 546 000 / +14 332 850 / 0 (unchanged) |

Latest fingerprint: `00fed3c2f19fed2299391a1e7c631dc3e9f63343b472ca9e8f168e19fd0aa26d`.

Three fingerprints in 48 hours (`e83b3fa1…` → `8195640b…` → `00fed3c2…`) prove that
**no pre-freeze fingerprint can be approved**; only the value taken at T-60m with
legacy entry stopped counts. DATA APPLY remains BLOCKED. The 842 figures elsewhere
in the 2026-10-04 documents belong to the `8195640b…` snapshot.
