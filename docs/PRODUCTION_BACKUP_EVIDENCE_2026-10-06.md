# Production backup evidence — 2026-10-06 (schema-apply gate)

Evidence only: no credentials, no signed URLs, no dump contents, no PINs. The backup files live
**outside the repository** (`C:\projects\Rumeli-iskelesi-yonetim-backups\20261006-023822-schema-gate\`)
and are not committed. Everything here was read-only against production.

| Item | Value |
|---|---|
| Backup time | 2026-10-05T23:38Z – 23:41Z (2026-10-06 02:38–02:41 local, UTC+3) |
| Source project ref | `iwikwbjsznjuefvuemdb` (verified linked; the other project was never selected) |
| Repo state | branch `v4-2027`, HEAD `f9839e5fafa7dba1a232871ccbc43bdf59e666c3`, tree clean |
| Tool | Supabase CLI 2.117.0 (`supabase db dump --linked`, uses a Docker `pg_dump`), `curl` GET for Storage |
| Approved scope | read-only dumps/queries, off-repo files, local disposable restore. No schema apply, no write of any kind |

## Final backup set (selected)

**Final verified set: `20261006-023822-schema-gate`.** It is the only directory holding the full evidence set
(three SQL dumps, `MANIFEST.sha256`, the Storage export, `STORAGE_MANIFEST.sha256`, source/dump row counts) and
it is the set that the restore rehearsal and hash comparisons below were run against.

A second directory, `20261006-023942-schema-gate`, holds a later repeat of the three SQL dumps only (no Storage
export, no manifests, no restore verification). Its `roles.sql` and `schema.sql` are byte-identical (same SHA-256)
and its `data.sql` has the same size; the only difference is the random restrict-token comment line that pg_dump
writes at the top and bottom of the file (lines 7 and 1171), which is why its `data.sql` hash differs
(`e0b059cf...8b1f82b6`). Its values are not used as evidence; it is a redundant copy, not the verified set.

## Database files

Commands (credentials never printed; the CLI uses the linked login):

```
supabase db dump --linked --role-only            -f <OUT>/roles.sql
supabase db dump --linked                        -f <OUT>/schema.sql
supabase db dump --linked --data-only --use-copy -f <OUT>/data.sql
```

| File | Bytes | SHA-256 |
|---|---:|---|
| `roles.sql` | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `schema.sql` | 22 210 | `51223df392ac3c52c137fa8e600e95d3865344ff13abbdab9825b46342bb86f2` |
| `data.sql` | 220 813 | `009cdbda4eee6e2fc84e50e71821adb07f9dcf8995e00db6a999f054ebeb5846` |

`data.sql` contains the legacy plaintext `cashiers.pin` / `admins.pin` columns (pre-existing legacy
design): treat the folder as sensitive, never paste or commit it.

## Integrity and content checks (all PASS)

- All three files exist and are non-empty; `schema.sql` holds the 8 legacy tables, 2 views
  (`daily_performance`, `weekly_performance`) and 4 legacy functions; `data.sql` ends cleanly with its
  restrict footer (no truncation).
- Row counts: dump `COPY` blocks vs live production (read-only `count(*)`):

| Table | Production | Dump |
|---|---:|---:|
| `cashiers` | 5 | 5 |
| `achievements` | 2 | 2 |
| `admins` | 1 | 1 |
| `daily_reports` | 547 | 547 |
| `daily_revenue` | 0 | 0 |
| `entry_history` | 215 | 215 |
| `shift_schedule` | 19 | 19 |
| `targets` | 3 | 3 |
| `storage.objects` | 1 | 1 |
| `auth.users` / sessions / identities | 0 / 0 / 0 | 0 |
| views `daily_performance` / `weekly_performance` | 1 / 5 rows | restored: 1 / 5 |

- Legacy importer audit after the dump: `sourceRows` 547 (equals `daily_reports` in the dump), X 268 / Z 279.
  The legacy app is still live, so this fingerprint is informational only and is **not** the final fingerprint.

## Restore rehearsal (disposable LOCAL database only) — legacy/public business schema and data only

- This is **not** a complete Supabase platform restore. The `auth` and `storage` platform schemas were **not** restored.
- Target: a scratch database `restore_rehearsal` inside the local Supabase Postgres container, dropped afterwards. Production was never a target.
- Loaded `roles.sql`, `schema.sql` (3 benign errors from platform objects that do not exist in a plain scratch
  database: `vault` schema, `supabase_realtime` publication, a `pg_read_file` privilege) and the **public-schema
  COPY blocks** of `data.sql` (a filtered copy; the dump files were not edited).
- Restored counts equal production for all 8 legacy tables and both views, and `daily_reports.kategori_devri` exists.
- **Stronger check:** per-table MD5 of the ordered row text for `daily_reports`, `entry_history`, `cashiers`,
  `shift_schedule`, `admins`, `targets` and `achievements` is **identical** between the restored copy and live
  production.
- The original dump files were NOT modified; the filtered public-schema copy was a separate temporary file.
- The scratch restore database was dropped afterwards.
- Not restored: `auth.*` and `storage.*` platform schemas (platform-owned; `auth.users` has 0 rows, `storage.objects` has 1 row, and the object body is backed up separately below). Loading the unfiltered `data.sql` into a plain database was not attempted, because it carries `auth`/`storage` platform tables that do not exist there.

## Storage (read-only) — PASS

| Bucket | Public | Objects in production | Objects exported | Bytes | SHA-256 |
|---|---|---:|---:|---:|---|
| `avatars` | yes | 1 | 1 | 535 312 (= `metadata.size`) | `80a8d0ecc5cb8600aaea722c4f93f13695c1252d25c402ded6a86ef00d7651e7` |

The hash equals the 2026-10-04 reference. Manifest files `STORAGE_MANIFEST.sha256` and
`storage_objects_listing.json` sit in the backup folder. Nothing was uploaded, replaced, deleted or reconfigured.
`avatars-v4` does not exist yet.

## Auth recovery record (read-only; nothing mutated)

- `auth.users` = 0, `auth.identities` = 0, `auth.sessions` = 0: production contains **no V4 users** and no other Auth users.
- The database dump therefore carries no Auth data; Auth is GoTrue-owned and not restorable from `public`.
  After any future provisioning, Auth users must be re-provisioned from `identity-data/` (PIN hashes in `public.pin_credentials` would be in a later data dump); sessions and refresh tokens are never restored.
- Dashboard Auth settings (signup, JWT expiry, SMTP) are not in any dump and still need to be recorded at T-24h (not captured here).
- `supabase migration list --linked`: only `20260611233031` is applied remotely; `supabase functions list` is not supported by this CLI version in this form, so deployed functions were not re-listed here (expected: none).

## Limitations

- Point-in-time: legacy keeps being written (547 reports now vs 541/542 in earlier audits). This backup must be repeated at T-60m before data apply.
- PITR/backup retention shown in the dashboard and Vercel state were not captured in this gate.
- Restore of the platform schemas was not rehearsed.

## Verdict

**BACKUP GATE PASS.** The PASS covers recoverability of the legacy/public business schema and data (verified by
row counts and row-content hashes against production) and the Storage object export. It does **not** cover:

- Auth platform state, which is not recoverable from these SQL dumps. Auth currently contains 0 users, 0 identities and 0 sessions.
- Dashboard Auth configuration and PITR/backup retention, which were not captured.
- A complete platform (auth/storage schema) restore, which was not performed.

Production writes: **NONE**. Schema apply, data apply and pilot/cutover remain unapproved.
