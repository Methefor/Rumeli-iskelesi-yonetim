# Production rollback runbook (prepared 2026-10-04 — nothing executed)

**Golden rule: the legacy app and its tables stay authoritative until the owner
declares V4 live.** The migration chain only *adds* V4 objects (zero name
collisions — `PRODUCTION_COLLISION_AUDIT_2026-10-04.md`); the importer never
writes a legacy table. Therefore rollback is always "remove V4", never "restore
legacy".

Every destructive step below **REQUIRES EXPLICIT OWNER APPROVAL BEFORE
EXECUTION**. The two SQL scripts are shipped locked (a guard `raise exception`)
so they cannot run by accident; both are verified locally against decoy legacy
tables (`schema_teardown.test.mjs`, `legacy_import_rehearsal.test.mjs`).

**Never weaken production RLS, grants or the `enforce_active_user` hook as an
emergency shortcut.** If V4 misbehaves, take V4 away from users; do not open it up.

## Emergency step 0 — restore the legacy Data API behaviour (any phase, ≤ 1 min)

After migration 016 the PostgREST `db_pre_request` hook runs on **every** Data
API request, including the legacy app's. If legacy requests start failing after a
schema apply (missing/broken `public.enforce_active_user`):

```sql
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

(`supabase db query --linked "<statement>"`). This detaches the hook without
touching data. Anonymous legacy requests have `auth.uid()` NULL and pass the hook
when it is healthy, so this is only a break-glass step.

## A. Schema apply failure

Behaviour: the CLI runs each migration file as one multi-statement execution, so
a failing file is rolled back as a unit; earlier files stay applied and the
history table lists exactly the applied ones. No migration contains an explicit
`BEGIN/COMMIT`.

| Situation | Safe action |
|---|---|
| A migration fails and nothing else is wrong | Stop. Fix forward in a **new** migration (never edit an applied file) or tear down. Legacy is untouched; users stay on legacy. |
| Legacy requests fail | Emergency step 0, then continue. |
| Decision to abandon the attempt | Teardown below. |

**Teardown (REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION):**

1. Fresh backup first (`PRODUCTION_BACKUP_RUNBOOK.md`); record the Auth user ids
   of V4 users if any exist: `select id from public.profiles` (V4 profiles only).
2. Remove the lock guard block and run
   `supabase db query --linked -f supabase/rollback/v4_schema_teardown.sql`
   — drops exactly the V4 relations (30 tables, 2 views), 72 functions, the four
   `avatars_v4_*` storage policies and the pre-request hook; checks post-conditions;
   idempotent. Legacy objects are never referenced.
3. Delete V4 Auth users through the Admin API (service role, operator shell only):
   `DELETE /auth/v1/admin/users/<id>` for each id from step 1 (the database
   cascade already removed their profiles).
4. Delete the `avatars-v4` bucket through the **Storage API** (empty it, then
   `DELETE /storage/v1/bucket/avatars-v4`); hosted Storage blocks SQL deletes
   (`protect_objects_delete` / `protect_buckets_delete` triggers). The legacy
   `avatars` bucket is never touched.
5. Make migration history match again:
   `supabase migration repair --status reverted <each applied V4 version>`
   (never the legacy `20260611233031`).
6. Verify: `supabase migration list --linked` shows only `20260611233031`; the
   catalog audit query returns 12 legacy relations, 4 legacy functions, no
   `avatars-v4`, no `pgrst.db_pre_request`; the legacy app works end to end.

When rollback is **safe**: always, as long as no one has entered *native* V4 data
that must be kept. Native data (reports entered in V4 after cutover) would be
deleted by teardown — export it first or use the data cleanup below instead.

## B. Data import failure

- **Failure *during* the import:** the importer is one database transaction.
  Dry run and any error roll back every write (rehearsed with an injected bad row
  and an unmapped cashier: reports, lineage, runs, map, shifts and registers are
  byte-identical afterwards). Nothing to clean up. Legacy is unchanged.
- **Failure *after* a successful commit** (wrong numbers, wrong attribution, a
  failed post-apply check, owner decides to redo): use the cleanup script —
  **REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION**:
  1. Fresh backup + `select * from public.legacy_sales_import_runs` saved.
  2. Remove the lock guard of `supabase/rollback/v4_legacy_import_cleanup.sql`
     and run it with `supabase db query --linked -f …`. It deletes only rows that
     have a lineage link (items, overrides, links, reports), then unused imported
     shifts/assignments, the historical `cafetarya`/`restoran` registers if
     unused, the cashier map and the import run. Native V4 reports are never
     touched; shifts/registers they use are kept.
  3. Re-run `post_apply_checks.sql`: expect 0 lineage rows, 0 runs.
  4. The same fingerprint can then be imported again from scratch (rehearsed).
- Imported lineage can never be overwritten: a changed legacy row is rejected as
  *source drift*, and the same fingerprint returns `alreadyImported`.
- **Legacy remains authoritative** the whole time; do not delete or rewrite any
  `daily_reports` row (and the post-apply pack check 110 verifies the table is
  still ≥ the imported source row count).

## C. Frontend cutover failure

Production Vercel currently serves `main` (the legacy static app); only
**Preview** has `VITE_*` variables. Cutover = promoting a specific V4 build (the
runbook records the exact deployment id) after the pilot.

1. Immediately re-point Production to the previous deployment: in Vercel,
   promote/redeploy the recorded legacy production deployment (`vercel ls`,
   `vercel promote <previous-deployment-url>`), or `vercel rollback`. Record both
   deployment ids at T-60m so this is a one-command action.
2. Staff go back to the legacy URLs unchanged (`/admin`, `/cashier`, `/entry`).
3. V4 database objects may stay (they do not interfere with legacy); disable V4
   access instead: set `is_active=false` for pilot accounts via the Management
   Center, or run the teardown (A) if the owner wants a clean state.
4. Do **not** change Deployment Protection or Production env vars as part of a
   rollback other than removing the V4 `VITE_*` variables the cutover added.

## D. Auth / PIN failure

| Symptom | Action |
|---|---|
| `pin-login` errors, users cannot sign in | Staff continue on the legacy app (still live). Undeploy/disable the V4 front-end (C). Check function logs (`supabase functions logs`), fix forward. |
| Wrong person has an account/role | Deactivate in the Management Center (an owner can deactivate lower ranks; deactivation bans the Auth user, deletes sessions and the hook refuses old JWTs). Owner account issues need the DB-level procedure (bootstrap path, see `PRODUCTION_IDENTITY_PLAN.md`). |
| PIN leak suspected | Owner resets the affected PIN in the Management Center (audited, old PIN invalid). Legacy PINs are a separate, pre-existing exposure. |
| Archival profile found active or with a PIN | Incident: set `is_active=false` and delete its `pin_credentials` row, then re-run `post_apply_checks.sql` 42–46. |
| Anything requiring "temporarily loosening RLS" | **Refused.** Roll back V4 exposure (C) instead. |

## E. Storage

- No destructive avatar migration before cutover: the legacy `avatars` bucket
  and its object are never modified.
- `avatars-v4` holds only objects uploaded by V4 users after provisioning; rollback
  deletes the bucket via the Storage API (A.4) after exporting anything the owner
  wants to keep. The backup manifest (`PRODUCTION_BACKUP_RUNBOOK.md`) records the
  legacy object hash for comparison.

## Rollback triggers (any one ⇒ PAUSE; two or a data-integrity one ⇒ ROLLBACK)

Defined in `PRODUCTION_PILOT_PLAN.md` (GO / PAUSE / ROLLBACK) and enforced as STOP
gates in `PRODUCTION_CUTOVER_RUNBOOK.md`.
