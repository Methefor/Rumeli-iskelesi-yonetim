# Production schema-apply runbook — pending chain (prepared 2026-10-07, NOT executed)

Scope: apply EXACTLY the 9 pending migrations `20261006000100 … 20261007000100` to production project `iwikwbjsznjuefvuemdb`.
**Schema only.** No Auth, owner bootstrap, PIN, Edge Function, Vercel, scheduler, loader, import, storage or configuration change is part of this runbook;
each of those is a separate gate (`PRODUCTION_READINESS_2026-10-07.md` section 21). Companion documents: `PRODUCTION_BACKUP_RUNBOOK.md`,
`PRODUCTION_ROLLBACK_RUNBOOK.md`, `PRODUCTION_CUTOVER_RUNBOOK.md` (SCHEMA APPLY section; this runbook supersedes it for the pending chain).

Execution rule: the assistant performs PRECHECK, BACKUP, BASELINE, FINAL DRY-RUN and the read-only verification; the **owner runs the live push** in their own terminal
(`supabase db push --linked --include-all`), after the written approval below. Nothing here may be run without that approval. STOP after verification.

## Gate A scope (exact)

Gate A includes ONLY: a fresh backup; a fresh baseline; the final collision check / dry-run; explicit owner approval; the nine schema migrations; read-only verification.
Gate A does NOT include: Auth bootstrap, Edge Functions, PIN creation, legacy import, Vercel deployment, the weather loader/scheduler, or any business configuration
(coordinates, suppliers, thresholds changes, branch settings). Each of those is a separate gate (readiness section 21).

**Baseline rule:** `docs/baselines/production_baseline_2026-10-07.json` is an AUDIT-TIME BASELINE ONLY and is NOT valid for this apply (legacy production keeps receiving writes).
A fresh **T-60** backup + baseline (section 2/3) and an immediate pre-write **T-0** baseline (re-captured right before step 6) are mandatory; no older baseline satisfies Gate A. `verify_post_apply.mjs` refuses the audit-time file.

**Analytics threshold decision (required in the approval record):** the nine analytics thresholds (readiness section 8a) are business/risk policy; the owner either accepts the repository defaults as provisional or supplies values before the apply.

## 0. Approval record (fill before starting)

- Gate A approved by: ______ on ______ for exactly these versions: `20261006000100, …0200, …0300, …0400, …0500, …0600, …0700, …0800, 20261007000100`.
- Analytics thresholds (section 8a): accepted as provisional defaults / values supplied: ______
- Maintenance window: ______ (legacy keeps running; no legacy write freeze is needed for this schema-only apply).

## 1. PRECHECK (read-only)

```bash
git status --short                      # clean; HEAD == origin/v4-2027 == the reviewed commit
git rev-parse HEAD origin/v4-2027
ls supabase/migrations | tail -9        # the 9 pending files, nothing else new
supabase migration list --linked        # remote column empty for exactly those 9; 25 applied; nothing unexpected
supabase functions list --project-ref iwikwbjsznjuefvuemdb      # still []
```

STOP if: a dirty tree, a different HEAD, any remote migration not in the repo, any pending file not in the list of 9.

## 2. BACKUP (read-only against production) — `PRODUCTION_BACKUP_RUNBOOK.md` section 1–3

Take roles/schema/data dumps, migration list, functions list, the baseline JSON and the storage object inventory into
`C:/projects/Rumeli-iskelesi-yonetim-backups/<yyyyMMdd-HHmmss>-T60-pending-chain-apply/`, hash every file (SHA-256), and **validate**: row counts of the dump = baseline,
`schema.sql` restores into a scratch local database with the same object counts, the storage object is downloaded and hashed. Record dashboard Auth settings and PITR/retention
(owner). STOP if any validation fails.

## 3. BASELINE (read-only; T-60 here, and again at T-0 immediately before step 6)

```bash
supabase db query --linked -f supabase/audit/production_baseline_readonly.sql --output-format json > "$OUT/baseline_pre.json"
curl -s -o /dev/null -D - -H "apikey: <anon key>" -H "Prefer: count=exact" -H "Range: 0-0" "<project url>/rest/v1/daily_reports?select=id" | grep -iE "^HTTP|content-range"   # legacy smoke: 206 and the live count
```

Record the legacy counts (`daily_reports`, `entry_history`, …) from the baseline: they are the "must not shrink" reference.

## 4. FINAL DRY-RUN (read-only; proves nothing is written)

```bash
# a. local: 25 migrations -> baseline local_25.json ; 25 + 9 -> local_full.json
node supabase/audit/verify_post_apply.mjs local_25.json local_full.json                 # passed=62 failed=0
# b. live collisions
supabase db query --linked -f supabase/audit/pending_chain_collision_check_readonly.sql   # every *_present empty, except the 21 existing permission keys
# c. live == local reconstruction of the 25
node supabase/audit/compare_baselines.mjs "$OUT/baseline_pre.json" local_25.json --legacy-aware    # 0 changed, 0 local-only; only legacy objects are production-only
# d. the CLI plan
supabase db push --linked --dry-run --include-all          # EXACTLY the 9 versions; not 20260611233031; no repair; no history mirror
# e. no production write happened
supabase db query --linked -f supabase/audit/production_baseline_readonly.sql --output-format json > "$OUT/baseline_after_dryrun.json"
node supabase/audit/compare_baselines.mjs "$OUT/baseline_pre.json" "$OUT/baseline_after_dryrun.json"   # empty diff (legacy counts may have grown by normal legacy use: inspect)
```

STOP if any expectation fails (see failure conditions in the readiness document, section 13).

## 5. OWNER APPROVAL

The owner reviews: the dry-run output, the backup validation, the expected post-apply counts (readiness section 12) and gives the written go for Gate A. No approval = STOP.

## 6. APPLY (owner, own terminal)

```bash
supabase db push --linked --include-all
supabase migration list --linked        # 34 rows; the 9 now applied
```

If a file fails see **6a. FAILURE OF MIGRATION N** below: STOP immediately. Do NOT run `migration repair`.
Rollback is two distinct, separately approved things: **SCHEMA ROLLBACK** (`supabase/rollback/pending_chain_rollback.sql`, DISARMED as committed; the owner arms it only after written approval; it does not touch migration history) and
**MIGRATION HISTORY REPAIR** (`supabase migration repair --status reverted <the nine versions>`, a separate production write, only after the schema rollback is verified). Or restore from the verified backup (history then already consistent).

## 6a. FAILURE OF MIGRATION N (mid-chain failure is a real failure state)

Transaction model (measured with the same CLI): each migration file executes together with its history insert as one implicit transaction. If migration N fails, that file leaves **nothing** (no partial objects, no seed rows, no history row),
the push **stops**, and production holds the successfully applied **prefix 1..N-1** in both the schema and the history. Migrations after N were not attempted.

Immediately: **STOP.** Do NOT:
- continue to the next migration or re-run `db push`;
- run Auth bootstrap, deploy the app or any Edge Function, start a loader or scheduler;
- improvise SQL or hand-edit anything;
- assume the full-chain rollback is valid.

Then, read-only:
1. `supabase migration list --linked` and the history rows >= `20261006000100`: the recorded pending versions are the applied prefix (they must be exactly `20261006000100 ...` in order, none missing).
2. Capture a new baseline (`production_baseline_readonly.sql`) and compare with the T-0 baseline using `compare_baselines.mjs`: the differences must be exactly the objects of migrations 1..N-1. Run the live collision/state check if in doubt.
3. Determine the exact prefix N-1 (0 means nothing was applied: nothing to roll back; fix the cause and re-run readiness).

Then choose only a **tested** recovery path, each needing explicit owner approval:
- **Schema rollback:** `supabase/rollback/pending_chain_rollback.sql` is prefix-aware and tested for every prefix 1..9 (readiness section 14). It is DISARMED as committed; the owner arms a reviewed copy. It detects the prefix itself, checks the migration history agrees, checks all data/seed preconditions before any destructive statement and refuses otherwise (then restore from the verified T-60 backup). It does not modify the migration history.
- **Restore** from the verified T-60 backup (no history repair needed afterwards: the restored history is consistent).

After a schema rollback: re-capture a baseline and verify equality with the T-0 baseline (`compare_baselines.mjs`: 0 differences apart from the history rows).
**Migration-history repair is a separate approval:** `supabase migration repair --status reverted <the first N-1 versions, in order>` (for example prefix 3: `20261006000100 20261006000200 20261006000300`), then `migration list` must show 25 applied.
Re-run the whole readiness (PRECHECK, fresh T-60 backup, fresh baseline, dry-run) and obtain a new Gate A approval before retrying. The cause of the failure must be understood and fixed in the repository first (a changed file needs a new review; an already applied file must never be edited).

## 7. POST-APPLY READ-ONLY VERIFICATION

```bash
supabase db query --linked -f supabase/audit/production_baseline_readonly.sql --output-format json > "$OUT/baseline_post.json"
node supabase/audit/verify_post_apply.mjs "$OUT/baseline_pre.json" "$OUT/baseline_post.json"      # failed=0
```

Must hold (all asserted by the verifier): exactly the 9 migrations added; tables 54, views 7, sequences 3, functions 151, definer 118, policies 66, storage policies 6, triggers 36, indexes 140;
permissions 38, role_permissions 113; seeds `analytics_settings` 1 / `weather_settings` 1 / `waste_reasons` 6; **Auth 0/0/0 unchanged**; no V4 runtime row (orders, movements, reports, users) created; legacy objects
unchanged and legacy rows not reduced; storage and `authenticator` settings identical; definer hygiene clean.
Manual: legacy anon `GET daily_reports` still HTTP 206; the legacy PWA still served; **no Vercel deployment, no Edge Function, no scheduler was created.**

## 8. STOP

Write the evidence (hashes, counts, verifier output; no secrets) into `docs/PRODUCTION_SCHEMA_APPLY_EVIDENCE_<date>.md`. Auth bootstrap, Edge Functions, PINs, pilot, import, cutover and the weather loader remain NOT approved
and NOT performed.
