# Production backup runbook (prepared 2026-10-04 — NOT executed)

Status: **prepared only.** Nothing in this file has been run against production
for the cutover. The read-only exports already taken (2026-10-03 dumps and the
2026-10-04 Storage object body) are recorded in `LEGACY_DATA_AUDIT_2026-10-04.md`.
The 2026-10-03 dumps are **stale** (541 reports; the source is now 542) and must
not be treated as the cutover backup.

Every command below is read-only against production (`pg_dump` takes only
`ACCESS SHARE` locks; Storage download is a GET). Run them at **T-60m** inside
the maintenance window, after the legacy app has been told to stop entering
reports, and keep the output **outside Git** (`C:\projects\Rumeli-iskelesi-yonetim-backups\<timestamp>-cutover\`).
Backup files contain real business data and must never be committed or pasted
into chat. Printing keys or the database password is forbidden.

> A fresh backup is a precondition of every production WRITE step. Writing
> without a verified backup is **BLOCKED**.

## 1. Database (logical)

Prerequisite: `supabase` CLI 2.117.x logged in and linked to ref
`iwikwbjsznjuefvuemdb` (verify with `supabase projects list` — the ref must match
exactly; the second project `tatli-imalat-dagitim` must never be selected).

```bash
STAMP=$(date +%Y%m%d-%H%M%S)-cutover
OUT="/c/projects/Rumeli-iskelesi-yonetim-backups/$STAMP"; mkdir -p "$OUT"

# roles (cluster roles/grants), schema, data — three separate files
supabase db dump --linked --role-only        -f "$OUT/roles.sql"
supabase db dump --linked                    -f "$OUT/schema.sql"
supabase db dump --linked --data-only --use-copy -f "$OUT/data.sql"
```

Scope: `supabase db dump` covers the application schemas (`public`, `storage`
metadata, `supabase_migrations`, …). Platform schemas (`auth`, internal
`storage` bodies) are managed by Supabase.

### Verification (all required)

1. **Hashes + sizes:** `sha256sum "$OUT"/*.sql > "$OUT/MANIFEST.sha256"` and also
   record `created_at`, project ref and project name in `MANIFEST.txt`.
2. **Row counts from the source** (read-only), saved beside the dump:
   `supabase db query --linked "select 'daily_reports', count(*) from public.daily_reports union all select 'cashiers', count(*) from public.cashiers union all select 'entry_history', count(*) from public.entry_history union all select 'shift_schedule', count(*) from public.shift_schedule union all select 'targets', count(*) from public.targets union all select 'achievements', count(*) from public.achievements union all select 'admins', count(*) from public.admins union all select 'daily_revenue', count(*) from public.daily_revenue"`
3. **Restore into a disposable LOCAL database** (never production) and compare:
   `supabase db reset --local --no-seed` is NOT used here (it would apply V4
   migrations). Instead start a clean local Postgres, load `roles.sql`,
   `schema.sql`, then `data.sql`, and run the same count query. Known quirk
   (observed 2026-10-03): the blank restore needs two bootstrap schema grants
   because local Supabase roles are `NOINHERIT`; never edit the dump files —
   apply the grants in a separate local-only bootstrap script.
4. **Fingerprint cross-check:** re-run `node legacy-migration/audit.mjs` after
   the dump and confirm the fingerprint equals the one recorded in the dump's
   `MANIFEST.txt`. A mismatch means legacy rows changed during the backup:
   repeat both.
5. Record the result as **PASS/FAIL** in the cutover log. Any FAIL = STOP.

### Restore validation strategy

The restore of production is **not** an in-place operation during cutover; the
legacy tables are never modified, so the realistic recovery paths are:

| Failure | Recovery | Uses the backup? |
|---|---|---|
| V4 schema apply fails | `PRODUCTION_ROLLBACK_RUNBOOK.md` (drop V4 objects; legacy untouched) | no |
| Data import fails | transaction already rolled back; if committed, V4 rows removed via the documented cleanup | no |
| Legacy table damaged (should be impossible; importer never writes it) | restore the affected table(s) from `data.sql` into a scratch DB, compare, then use Supabase support / PITR as approved by the owner | **yes** |

Keep the backup folder for at least the pilot period plus 30 days.

## 2. Storage

Database dumps do **not** contain object bodies.

1. **Inventory every bucket** (read-only):
   `supabase db query --linked "select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id"`
   Expected before cutover: `avatars` only (public). `avatars-v4` does not exist
   until migration 007 is applied.
2. **List objects with size + type + checksum material:**
   `supabase db query --linked "select bucket_id, name, metadata->>'size' as size, metadata->>'mimetype' as mime, created_at from storage.objects order by bucket_id, name"`
   Expected on 2026-10-04: one object, `avatars/<uuid>/avatar.jpeg`, 535 312 bytes.
3. **Export each body** (GET only). For a public bucket:
   `curl -sS -o "$OUT/storage/<bucket>/<name>" "<project-url>/storage/v1/object/public/<bucket>/<name>"`.
   For a private bucket use `supabase storage cp ss:///<bucket>/<name> <local-path> --linked`.
4. **Object count verification:** number of files on disk == `count(*)` from
   `storage.objects` for each bucket; every byte size == `metadata->>'size'`.
5. **Manifest/checksum:** `sha256sum` every exported file into
   `STORAGE_MANIFEST.sha256`. (2026-10-04 reference: the single object's SHA-256
   is `80a8d0ecc5cb8600aaea722c4f93f13695c1252d25c402ded6a86ef00d7651e7`.)
6. **`avatars-v4`:** empty until the pilot; re-export after the pilot if staff
   upload avatars. **Never** run a destructive avatar migration before cutover
   (the legacy `avatars` bucket is left exactly as is).

## 3. Auth

| Item | Backup/restore behaviour |
|---|---|
| `auth.users` | **0 rows today.** Nothing to back up now. After provisioning it holds the V4 users; it is *not* restorable from `supabase db dump` of `public` — GoTrue owns it. Treat Auth as re-provisionable from `identity-data/` + the secure PIN flow. |
| Sessions / refresh tokens | Never restored. After any rollback all sessions are invalid by design; users sign in again with their PIN. |
| PIN credentials (`public.pin_credentials`) | bcrypt hashes live in `public` and **are** in the data dump once V4 exists. Plaintext PINs exist nowhere and are never exported, logged or committed. After a restore of V4 data PINs are valid again; after a rebuild they are re-issued individually. |
| Banned/inactive users | Archival profiles (H001–H003) are inactive **and** banned in Auth (`ban_duration`). A restore of `public` does not restore the Auth ban; re-run `provision-archival.mjs` (idempotent) and re-verify with `post_apply_checks.sql` check 42/43. |
| Dashboard Auth settings (public signup, JWT expiry, SMTP) | Not in any dump. Screenshot/record the values at T-24h (read-only) so rollback can restore them. |

## 4. Other state to record at T-24h (read-only)

- Supabase project ref/name, region, plan, PITR/backup retention shown in the dashboard.
- `supabase migration list --linked` output (expected: only `20260611233031`).
- `supabase functions list --linked` (expected: empty).
- Vercel: `vercel ls`, `vercel env ls` (Production currently has **no** `VITE_*`
  variables; Preview has `VITE_DEMO_MODE`, `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`), and the current Production deployment id/alias.

## 5. Gate result

PASS only when: three dump files + manifest exist; the local blank restore row
counts equal the source counts; the fingerprint cross-check matches; the Storage
object count/size/hash check matches; Auth settings are recorded. Record the
folder name and hashes (not contents) in the cutover log.
