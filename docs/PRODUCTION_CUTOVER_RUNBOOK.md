# Production cutover runbook (prepared 2026-10-04 — NOT executed)

Supersedes `PRODUCTION_CUTOVER_RUNBOOK_2026-10-02.md`. Companion documents:
`PRODUCTION_READINESS.md` (gates), `PRODUCTION_COLLISION_AUDIT_2026-10-04.md`,
`PRODUCTION_BACKUP_RUNBOOK.md`, `PRODUCTION_ROLLBACK_RUNBOOK.md`,
`PRODUCTION_PILOT_PLAN.md`, `LEGACY_IDENTITY_MAPPING_RUNBOOK.md`,
`identity-data/PRODUCTION_IDENTITY_PLAN.md`, `LEGACY_DATA_AUDIT_2026-10-04.md`.

## How to read this document

- **This runbook is not auto-executable.** Every step marked **WRITE** changes
  production and carries the sentence *"REQUIRES EXPLICIT OWNER APPROVAL BEFORE
  EXECUTION"*. The operator stops at every **STOP gate**, shows the evidence to the
  owner, and continues only after an explicit written "go" for *that* step. An
  approval for one step never covers another; approval of the runbook itself is
  not approval of any step.
- Everything else is **READ** (SELECT/GET/`--dry-run`) and may be run freely.
- Secrets (service-role key, database password, PINs) live only in the operator
  shell/password manager; never in Git, chat, this file or shell history.
- Hosted-only behaviours were never rehearsed (hosted staging was deliberately
  skipped on 2026-09-26); the STOP gates are the substitute and must not be skipped.
- The project is `iwikwbjsznjuefvuemdb` ("Rumeli İskelesi Database"). The other
  Supabase project `tatli-imalat-dagitim` is out of scope and must never be selected.
- Time zone for all business logic: Europe/Istanbul.

## Preconditions (all must be true before T-24h starts)

1. `PRODUCTION_READINESS.md` gates A–I are PASS (or explicitly accepted by the owner).
2. The commit to deploy is merged/tagged and the same commit passed: local
   migration chain, all suites, app typecheck/lint/test/build (record the SHA).
3. Open decisions closed: bootstrap-owner method, pilot front-end deployment
   method, legacy write-freeze procedure, handling of the 492 historical flagged
   reports.

---

## T-24h

1. **READ** — final read-only audit: run the production catalog collision query
   (`docs/PRODUCTION_COLLISION_AUDIT_2026-10-04.md` method) and compare; any new
   object with a V4 name ⇒ **BLOCKED**.
2. **READ** — `supabase migration list --linked` ⇒ only `20260611233031`.
   `supabase functions list --linked` ⇒ empty.
   `supabase db push --linked --dry-run --include-all` ⇒ exactly the 23 migrations
   (001…018, `20260930231709`, `20261001000111`, `20261001204651`, `20261005000100`, `20261005000200`).
3. **READ** — `node legacy-migration/audit.mjs`; record row count and fingerprint
   (informational — the *final* value is taken at T-60m).
4. **READ** — record dashboard values that rollback needs: Auth settings (public
   signup, JWT expiry), Vercel `ls`/`env ls`, current Production deployment id.
5. Staff notice (owner): the legacy app will be frozen for reports from T-60m
   until the owner announces the end; entries must be made on paper meanwhile.
6. Rehearsal evidence is green on this commit: `legacy_import_rehearsal.test.mjs`,
   `schema_teardown.test.mjs`, guards tests, full regression.

**STOP gate T-24h:** owner reviews items 1–6. No approval ⇒ nothing is executed.

## T-60m — maintenance window

1. Owner confirms the legacy freeze is in effect (procedural: no one enters
   reports). *No technical lock is placed on legacy tables — legacy tables and
   policies are never modified.*
2. **READ** — fingerprint twice, ≥ 10 min apart (`docs/LEGACY_WRITE_FREEZE_RUNBOOK.md`):
   both runs must show the same `fingerprint` and `sourceRows`. If they differ, the freeze
   is not effective ⇒ STOP. This is the DATA APPLY gate only: SCHEMA APPLY does not need it. Record the **final fingerprint** `F` and plan `P = sourceRows + Balık + Dondurma`.
3. **READ** — fresh backups per `PRODUCTION_BACKUP_RUNBOOK.md` (DB roles/schema/data,
   Storage manifest, Auth settings); verify hashes, local blank restore row counts,
   fingerprint cross-check.
4. **READ** — migration target guard: `supabase projects list` shows the linked
   ref equals `iwikwbjsznjuefvuemdb`; `echo` the ref only (never keys).
5. Record rollback boundary: the previous Vercel production deployment id and the
   backup folder name.

**STOP gate T-60m:** owner sees: `F`, `P`, backup PASS, ref check. Only the
**final** `F` may later be approved; the 2026-10-03 and 2026-10-04 values in the
audit docs are history, not approvals.

## SCHEMA APPLY

**WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** (approval text must
name the ref, the commit SHA and "schema apply").

```bash
cd <repo at the approved commit>
supabase db push --linked --include-all          # applies the 23 V4 migrations in order
```

`--include-all` is required because the production history already contains
`20260611233031`, which sorts after `001…018`; the repo carries a mirror file for it
so the CLI does not ask for a history rewrite. Do **not** run `migration repair`.

Verify (READ):

1. `supabase migration list --linked` — all 24 versions match local/remote.
2. Catalog query: 30 V4 tables + 3 views, 73 functions, `avatars-v4` bucket,
   four `avatars_v4_*` policies, `authenticator` has `pgrst.db_pre_request`.
3. **Legacy still works:** open the legacy cashier page and save/read nothing
   destructive — at minimum `GET /rest/v1/daily_reports?select=id&limit=1` with the
   legacy anon key returns 200 (proves the pre-request hook does not break legacy).
4. `select count(*) from public.profiles` = 0; `auth.users` = 0.

**STOP gate SCHEMA:** any failure ⇒ emergency step 0 if legacy is affected, then
`PRODUCTION_ROLLBACK_RUNBOOK.md` §A. Owner must approve before continuing.

## Owner PIN rotation (break-glass, any time after the owner exists)

**WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION.** `identity-data/rotate-owner-pin.mjs`
(procedure, approval phrase `approve-owner-pin-rotation:<ref>:<code>` and audit semantics in
`identity-data/PRODUCTION_IDENTITY_PLAN.md`). Dry run first; exactly one `owner_pin_rotated`
audit row (actor NULL, unverified operator label); `admin_reset_pin` is unchanged.

## IDENTITY PROVISION

Order matters (`identity-data/PRODUCTION_IDENTITY_PLAN.md`).

1. **WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** — bootstrap owner
   `M001` with the one-time tool (dry run first; the PIN is typed at a hidden prompt
   or piped with `--pin-stdin`, never an argument/env/file):
   ```bash
   export TARGET_SUPABASE_URL=https://iwikwbjsznjuefvuemdb.supabase.co
   export TARGET_SUPABASE_SERVICE_ROLE_KEY=<operator shell only>
   node identity-data/bootstrap-owner.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target --full-name="<owner name>"        # dry run
   OWNER_BOOTSTRAP_APPROVAL=approve-owner-bootstrap:iwikwbjsznjuefvuemdb:M001 \
   node identity-data/bootstrap-owner.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target --allow-hosted-apply --apply --full-name="<owner name>"
   ```
   It refuses if any owner exists or `M001` is taken, is atomic, and closes itself.
2. READ — owner can sign in only after Edge functions exist (next section); until
   then verify the profile/role rows by SELECT.
3. **WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** — after the Edge
   step, the owner creates `K001 K002 K003 D001 D002` in the Management Center
   (individual PINs typed once, never recorded).
4. **WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** — archival profiles:
   ```bash
   TARGET_SUPABASE_URL=https://iwikwbjsznjuefvuemdb.supabase.co \
   node identity-data/provision-archival.mjs --target-ref=iwikwbjsznjuefvuemdb --count=3 --allow-hosted-target     # dry run
   ```
   Then, only after approval:
   `LEGACY_ARCHIVAL_OWNER_APPROVAL=approve-archival:iwikwbjsznjuefvuemdb:3 node identity-data/provision-archival.mjs --target-ref=iwikwbjsznjuefvuemdb --count=3 --allow-hosted-target --allow-hosted-apply --apply`
   (service-role key from the operator shell in `TARGET_SUPABASE_SERVICE_ROLE_KEY`).
5. READ — run the identity verification query and `post_apply_checks.sql`
   rows 40–46 once the import exists.

**STOP gate IDENTITY:** exactly 6 active + 3 inactive profiles; no PIN on `H###`.

## EDGE FUNCTIONS

**WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION**

```bash
supabase functions deploy pin-login          --project-ref iwikwbjsznjuefvuemdb
supabase functions deploy employee-provision --project-ref iwikwbjsznjuefvuemdb
```

No custom secrets are needed: both read only the platform-provided `SUPABASE_URL`,
`SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` (service role stays server-side).
Keep public signup disabled in the dashboard (**WRITE if it is currently on** —
owner approval; record the previous value).

Verify (READ/low-risk): `supabase functions list --linked` shows both; sign in as
`M001` through the V4 app *Preview pointed at production is NOT used* — use the
dedicated pilot deployment or a local app with the production **anon** URL/key
supplied via the operator shell; wrong PIN returns the one generic message.

**STOP gate EDGE:** login works for `M001`, fails generically for a wrong PIN, no
PIN/token/key in function logs.

## OPERATING DATA

**WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION**

The local loader (`operating-data/load.mjs`) stays localhost-only. Production uses
`operating-data/run-production.mjs` (same validator, same audited database function,
dry run by default; refuses wrong project/key, any unapproved/pending/demo/unknown
row, and a dataset whose SHA-256 differs from the reviewed one). Two invocations:

```bash
node operating-data/run-production.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target \
     --actor-code=M001 --dataset-sha256=<hash printed by the reviewed dry run>          # prints proposed changes + planDigest
OPERATING_DATA_APPROVAL=approve-operating-data:iwikwbjsznjuefvuemdb:<first 12 of hash> \
node operating-data/run-production.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target \
     --allow-hosted-apply --actor-code=M001 --dataset-sha256=<hash> --apply --ack-plan=<planDigest>
```

The plan is re-derived at apply and must equal `planDigest`. Verify afterwards:
branches 3, Rumeli/Balık/Dondurma registers and shifts as in `operating-data/real/`,
thresholds 2/5 ×3, a second dry run reports 0 created / 0 updated. Order: this step runs
**before** the legacy import (the importer needs the shift definitions and registers).

## DATA IMPORT

1. **READ** — dry run (no write; hosted dry run still needs every guard):
   ```bash
   export TARGET_SUPABASE_URL=https://iwikwbjsznjuefvuemdb.supabase.co
   export TARGET_SUPABASE_SERVICE_ROLE_KEY=<operator shell only>
   node legacy-migration/run.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target \
        --actor=M001 --cashier-map=legacy-migration/private/cashier-map.json \
        --expect-fingerprint=<F>
   ```
   Expect `mode: dry-run`, `createdReports = P`, branch split, zero rows written.
2. Show the owner: `F`, `P`, split, the per-person counts (rehearsal prediction),
   backup evidence, identity map shape. **STOP gate DRY-RUN.**
3. **WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** — live apply. The
   approval must contain the exact `F` and `P`:
   ```bash
   LEGACY_IMPORT_OWNER_APPROVAL=approve:iwikwbjsznjuefvuemdb:<first 12 chars of F> \
   node legacy-migration/run.mjs --target-ref=iwikwbjsznjuefvuemdb --allow-hosted-target \
        --allow-hosted-apply --actor=M001 --cashier-map=legacy-migration/private/cashier-map.json \
        --expect-fingerprint=<F> --apply --ack-dry-run=<P>
   ```
   One transaction; any error rolls everything back.
4. **READ** — `legacy-migration/post_apply_checks.sql` with the `params` CTE filled
   from the audit (every row PASS or reviewed INFO; 0 FAIL). Also the authorship
   query of `LEGACY_IDENTITY_MAPPING_RUNBOOK.md`.
5. **READ** — second apply attempt (dry-run form) returns `alreadyImported`.
6. **READ** — exactly ONE import-level audit row exists:
   `select count(*) from audit_logs where action = 'legacy_sales_import_applied'` = 1; its
   `new_values` carry the fingerprint, source row count, created reports, per-branch counts,
   lineage count, run id, timestamps and a mapping digest (no PINs, keys or private UUIDs).
   A dry run, a failed apply and a repeat run write none. The actor is the owner named for the
   run; the service role executed it (`executedVia`, `actorSemantics` in the row).
7. Imported historical findings stay ERROR/WARNING by design: `override_reconciliation` refuses any
   report with legacy lineage (22023), so the normal override workflow cannot rewrite history; they
   remain readable through the historical filter.

**STOP gate IMPORT:** any FAIL ⇒ `PRODUCTION_ROLLBACK_RUNBOOK.md` §B (cleanup) and
re-plan; legacy is untouched either way.

## PILOT

Per `PRODUCTION_PILOT_PLAN.md` (owner + 1 Rumeli cashier + 1 Dondurma cashier,
≥ 3 business days, legacy in parallel). The legacy freeze ends when the owner
announces it: legacy entries made after the import fingerprint must later be
imported as a **delta** (same command with the new fingerprint and acknowledged
plan; unchanged rows are skipped by hash, new rows are created, an edited
historical legacy row is rejected as source drift and needs review).

Pilot front-end: selected approach in `docs/PRODUCTION_PILOT_FRONTEND.md` — a
separate CLI-deployed `rumeli-v4-pilot` project, bundle built with `npm run build:pilot`
(fail-closed environment guard), own URL, no stored variables, legacy Production alias
and the synthetic Preview untouched. Creating/deploying it is a Vercel WRITE —
**REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION** (execution status OPEN).

**STOP gate PILOT:** GO / PAUSE / ROLLBACK per the pilot plan.

## FRONTEND

**WRITE — REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION**, and only after a
written pilot GO:

1. Final legacy freeze + delta import (previous section) + post-apply checks.
2. Record the current Production deployment id (rollback target).
3. Activate V4 for all staff (promote the approved build / set Production
   variables as approved). Do not touch Deployment Protection.
4. Smoke test as owner and the two pilot cashiers within 10 minutes.
5. Announce; the legacy URLs remain reachable as fallback for the agreed period.

## ROLLBACK (exact triggers)

| Trigger | Command / reference |
|---|---|
| Legacy Data API errors after schema apply | emergency step 0 (`alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`) |
| Schema apply failed / abandoned | §A teardown: `supabase/rollback/v4_schema_teardown.sql` (unlock only with approval) |
| Import wrong / post-apply FAIL | §B `supabase/rollback/v4_legacy_import_cleanup.sql` (unlock only with approval) |
| Front-end failure | `vercel rollback` / promote the recorded previous deployment |
| Auth/PIN failure | staff return to legacy; deactivate pilot accounts; never loosen RLS |

All rollback steps are WRITES and **REQUIRE EXPLICIT OWNER APPROVAL BEFORE
EXECUTION**, except emergency step 0 where the owner has pre-authorised the
operator in writing at T-24h.

## Evidence log (fill during execution; hashes and counts only)

| Step | Time | Operator | Result | Evidence (hash/count) | Owner approval ref |
|---|---|---|---|---|---|
| T-24h audit | | | | | |
| final fingerprint F / plan P | | | | | |
| backups | | | | | |
| schema apply | | | | | |
| identity | | | | | |
| edge functions | | | | | |
| operating data | | | | | |
| import dry run | | | | | |
| import apply | | | | | |
| post-apply checks | | | | | |
| pilot | | | | | |
| frontend | | | | | |
