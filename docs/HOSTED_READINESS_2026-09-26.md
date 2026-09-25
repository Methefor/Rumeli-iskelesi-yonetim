# Hosted readiness and authorization package — Stage 0

> **Superseded strategy note (2026-09-26):** The owner subsequently approved
> the local-first and controlled direct-cutover strategy in
> `docs/HOSTED_EXECUTION_ROADMAP.md`. The technical findings in this report
> remain useful, but its requirement to identify or create a separate staging
> project is no longer the active next step. Production remains untouched and
> requires the later explicit gates in the revised roadmap.

Date: 2026-09-26. Result: **BLOCKED / INPUT REQUIRED** (staging identity
unknown — see §5, §13). Nothing remote was contacted, linked, applied or
deployed while writing this. No credential, token, key or password appears in
this file; the only identifiers recorded are non-secret project refs.

## 1. Scope and authorization

Stage 0 of `docs/HOSTED_EXECUTION_ROADMAP.md` only. Permitted: read the repo,
check CLI/Docker versions, read official Supabase docs, write this document.
Not done, not authorized: creating/deleting/pausing any project, `supabase
link`, `db push`, remote SQL/reset/seed, function deploy, secrets, Auth users,
Storage buckets/objects, any connection to a production endpoint, commit,
push, Stage 1. `main` and the stash `laptop-old-phase-c-before-sync` were not
touched.

## 2. Repository baseline

- Branch `v4-2027`, HEAD `24770ca1e84540ef8e552891022ce9a6fe314b26`, remote
  `origin` = `Methefor/Rumeli-iskelesi-yonetim` (fetch/push).
- Working tree: only `docs/HOSTED_EXECUTION_ROADMAP.md` untracked (expected,
  preserved) plus this file.
- Stashes present: `stash@{0}` `laptop-old-phase-c-before-sync` (untouched),
  `stash@{1}` WIP on main (untouched).
- Application secrets in Git: none found. `app/.env.local` exists but is
  gitignored (`git check-ignore` confirms). Service-role key references:
  0 in `app/src`, `app/.env.example`, `app/vite.config.ts`, and 0 in the built
  `app/dist` bundle. The service-role key appears only in
  `supabase/functions/pin-login/index.ts` via `Deno.env.get`, i.e. the Edge
  runtime, never a `VITE_*` variable — **confirmed it must never enter the
  browser or frontend env.**

## 3. Local validation baseline (from `LOCAL_VALIDATION_2026-09-24.md`)

Fresh local reset 001–015 PASS; Auth/PostgREST 137/137; Storage 48/48;
`pin-login` HTTP 45/45; timezone RPC 32/32; backdated timezone matrix 24/24;
app 175 tests + typecheck + lint + build PASS. Local only — hosted/staging
**NOT DONE**, production **UNTOUCHED**.

## 4. CLI and Docker status

| Item | State |
|---|---|
| Supabase CLI | 2.117.0 installed (npx cache binary, not on PATH); **2.118.0 available** |
| Docker | 29.8.0; Docker Desktop installed; local Supabase containers currently **stopped** (data backed up per prior report) |
| CLI login | **Not logged in** — `supabase projects list` returns "Access token not provided"; `SUPABASE_ACCESS_TOKEN` not set |
| Linked project | **None** (`supabase/.temp` has no project-ref file) |

Only user step needed (do not paste the token anywhere): run `supabase login`
interactively in your own terminal (browser flow), or export
`SUPABASE_ACCESS_TOKEN` in your own shell session. Then Stage 0 can be
re-run read-only to list projects.

Note (repo vs. docs): current docs list `supabase db advisors`; CLI 2.117.0's
`db` help shows only lint/start/query-style commands (no `advisors`). Either
upgrade to ≥2.118.0 (verify it exists) or run advisors from the dashboard.
Recommend upgrading the CLI before Stage 1 and re-checking `--help`.

## 5. Environment identity

| Role | Name | Project ref | Region | Evidence |
|---|---|---|---|---|
| **Production / legacy live** | (unnamed here) | `iwikwbjsznjuefvuemdb` | not recorded | Hard-coded in the live legacy app (`js/supabase-client.js`, `index.html`); `WORKLOG.md` audit of live data; the V4 `app/.env.local` (gitignored) also points at it |
| **Staging** | **UNKNOWN** | **UNKNOWN** | — | No staging project referenced anywhere in repo/docs; CLI not logged in so account listing impossible |

Findings:
- **Blocker B1:** no staging project identified. Not guessed. Per docs, the
  staging project should be *new* — "a project already modified to reflect
  production's schema can't be used because the CLI would reapply these
  changes."
- **Risk R1:** the developer's local `app/.env.local` points the non-demo V4
  app at the *production* ref. Running V4 dev/build without
  `VITE_DEMO_MODE` today would talk to production Auth/PostgREST (read-only
  in practice since 001–015 aren't applied there, but still wrong). Repoint
  to staging before Stage 2; do not change it in this stage.
- Project ref and anon URL are public identifiers, safe to document. The anon
  key and everything else stay out of Git.

## 6. Staging versus production proof

Cannot be completed yet. Required proof, once staging exists and the CLI is
logged in (all read-only account metadata):

1. `supabase projects list -o json` → record name, ref, region, org for the
   staging candidate and production.
2. Assert `STAGING_REF != iwikwbjsznjuefvuemdb` and that the name/region are
   the ones the owner confirms in writing.
3. Assert the staging DB is empty (§9) — production is not (live 2026 data).
4. Target guard (§11) refuses any command whose ref equals the production ref.

## 7. Migration 001–015 dependency review (static)

Order is strict; each file depends on earlier ones. All migrations are
applied by `supabase db push`, tracked in `supabase_migrations`, so an
already-applied file is skipped, but **many statements are not idempotent
if run outside that tracking** (see column "Rerun").

| # | Creates / changes | RLS / grants / Auth / Storage | Rerun risk |
|---|---|---|---|
| 001 | `pgcrypto` ext, `profiles`(→`auth.users` FK, cascade), `roles`, `user_roles`; seeds roles | RLS in 006; needs `auth.users` | tables `if not exists`; seed inserts guarded |
| 002 | `permissions`, `role_permissions`; seeds permissions + role mapping | — | `if not exists`/`on conflict` |
| 003 | `branches`, `branch_memberships`; seeds `rumeli_iskelesi`, `iskele_dondurma` (+key set) | — | guarded |
| 004 | `audit_logs` (`actor_user_id`→`auth.users`, **no ON DELETE**) | append-only by policy (no UPDATE/DELETE) | `if not exists` |
| 005 | `pin_credentials`, helper fns (`current_user_*`, `write_audit_log`), `verify_pin` (SECURITY DEFINER, `service_role` only) | RLS on, zero policies; uses `extensions.crypt` | `create or replace` |
| 006 | 12 RLS policies on identity tables; column-level `profiles` UPDATE grant | Data API scoping | **`create policy` not idempotent** — name clash on rerun |
| 007 | bucket `avatars-v4` (public read, 2 MiB, jpeg/png/webp), 4 `storage.objects` policies | Storage; insert policy carries `employee.manage` override (2026-09-24 fix) | bucket `on conflict do nothing`; **policy names clash if bucket/policies pre-exist** |
| 008 | 7 admin RPCs (`assign_role`, `revoke_role`, branch membership, `admin_reset_pin`, `admin_set_employee_active/code`) | audited definer RPCs | `create or replace` |
| 009 | 10 operational tables (`shifts`, `shift_assignments`, `sales_reports`, `sales_report_items`, `sales_report_overrides`, config tables); `set_updated_at`; seeds shift defs/categories/thresholds | — | `if not exists` |
| 010 | 15 RLS policies, `shift_branch_id`, `current_user_assigned_shift_ids` | Data API scoping | policies not idempotent |
| 011 | 11 RPCs (`create/edit/cancel_sales_report`, shift RPCs, `compute_reconciliation_status`) | definer, authenticated only | `create or replace` |
| 012 | inventory tables (5), views (2), append-only triggers, 8 permissions, `sales_report_items` alter | — | `if not exists`; alter/indexes partly guarded |
| 013 | `current_user_can_inventory`, 6 RLS policies, column grant (hides `unit_cost_snapshot`), **drops+recreates `audit_logs_select_privileged`** | Data API scoping | drop policy w/o `if exists` → fails if 006 policy absent |
| 014 | ~22 inventory/sales fns; revokes `write_audit_log` EXECUTE from `authenticated` | definer RPCs | `create or replace` |
| 015 | drops 8-arg `create_sales_report`, creates 9-arg; redefines `edit_sales_report` | re-grants execute to `authenticated` | drop `if exists` |

Dependencies outside SQL: **Auth** (`auth.users` FK; `auth.uid()`); **Storage
service** (bucket + `storage.objects`); **Edge Function** `pin-login`
(reads `profiles.employee_code`, calls `verify_pin`, uses Auth admin
`generateLink` + `verifyOtp`); no `seed.sql` exists (seed disabled in effect
for push).

**Collision analysis (repo only).** Legacy production objects known from
legacy code: tables `daily_reports`, `cashiers`, `shift_schedule`,
`entry_history`, `targets`, `admins`; bucket `avatars`. V4 creates none of
these names, so no known collision. **Unknown**: whether production has
extra tables/policies (`profiles`, `roles`, `branches`, `shifts`,
`audit_logs`… are common names). Production is not the Stage 1 target, so
this only gates Stage 5 (cutover). Read-only production metadata queries to
request later (each needs its own approval): list `pg_tables` in `public`;
`pg_policies`; `storage.buckets`; `supabase_migrations` history;
`pg_proc` names in `public`; installed extensions; whether RLS is enabled
per table. Not run now.

**Pre-apply staging checklist (Stage 1):** empty `public` schema; no
`supabase_migrations` rows; no bucket `avatars-v4`; no functions named in
001–015; `pgcrypto` state; Data API exposed schemas; email signup setting.

**Data API / grants:** hosted projects grant default privileges on new
`public` objects to `anon`/`authenticated`/`service_role`; the design relies
on RLS + explicit `revoke/grant` in 006/010/013/014/015, not on grants alone.
Stage 1 must verify (a) RLS is on for every table (advisor), (b)
`pin_credentials` unreachable, (c) `unit_cost_snapshot` column not
selectable, (d) `anon` has EXECUTE on no V4 function. Whether new hosted
projects still auto-expose `public` to the Data API by default was **not
verified** in the docs consulted — check the project's API settings.

## 8. Auth, Edge Function and Storage requirements

**`pin-login` env names** (values never shown): `SUPABASE_URL`,
`SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`. Docs confirm all three are
provided automatically to hosted Edge Functions (plus newer
`SUPABASE_PUBLISHABLE_KEYS`/`SUPABASE_SECRET_KEYS`), so **no custom secret
is required** and "Stage 1 secrets" = verify only names via `supabase
secrets list`, set nothing. `verify_jwt` is not overridden in
`config.toml` (default on): the browser calls with the anon key as bearer,
which is what the local tests did.

**Auth settings to set/verify on staging** (local `config.toml` is not
pushed automatically): disable public **signup** (local has
`enable_signup = true`; V4 users are provisioned, never self-registered —
docs: turning "Allow new users to sign up" off restricts to existing users);
email confirmation behavior compatible with admin-created confirmed users;
`jwt_expiry` 3600, refresh-token rotation on, reuse interval 10 (as local);
no anonymous sign-ins; built-in SMTP is rate-limited — `generateLink` sends
no mail (verified locally with Mailpit; must be **re-verified on hosted**,
where an SMTP send would be real). Fixture emails use `.invalid`; confirm
hosted Auth accepts them or use a controlled disposable domain.

**Rate limiting / lockout:** only per-account lockout exists (5 failures →
15 min lock, one audit row). No per-IP/global limit and no CAPTCHA:
anyone who knows an `employee_code` can lock that account (DoS) and can
enumerate nothing (responses identical). Accepted as a documented risk;
consider platform/WAF rate limiting before cutover.

**Storage:** `avatars-v4` public read; writes own-path or `employee.manage`.
Docs: uploads need INSERT; upsert needs INSERT+SELECT+UPDATE; public buckets
bypass RLS on read; database backups do **not** contain Storage objects, only
metadata. `storage.buckets` has RLS with zero policies by default (metadata
endpoint 404s — harmless).

**Key boundaries:** `anon` = public read of avatars + pin-login call;
`authenticated` = RLS-scoped RPC/Data API; `service_role` = only inside the
Edge Function runtime and, for Stage 1 test setup, an operator's local shell
env var used to create disposable users — never in Git, never in `VITE_*`,
never printed.

**Why staging test users must be fake and disposable:** hosted logs, Auth
emails and backups persist; real staff PINs/PII must never leave production.
Use `P0xx`-style codes, throwaway random PINs, `.invalid` emails. Deleting
Auth users **will fail** once they have written audit rows
(`audit_logs.actor_user_id` and ~19 `created_by`-style FKs to
`auth.users`/`profiles` have no `ON DELETE` action), so cleanup = wipe the
staging project (§9/§10), not per-user deletes.

## 9. Backup and restore plan (Stage 1 pre-work; nothing run now)

1. **Prove staging is disposable/empty** (read-only, after guard passes):
   `select count(*)` from `pg_tables where schemaname='public'` = 0;
   `supabase_migrations.schema_migrations` empty/absent; `storage.buckets`
   has no `avatars-v4`; `auth.users` count noted (expected 0).
2. **Record pre-state:** save `supabase migration list --linked` output,
   `supabase db dump --linked -f pre_schema.sql` (schema) and
   `--data-only` to a local **gitignored** folder outside the repo; note the
   Dashboard backup list (Free plan: none; Pro: 7 daily; PITR add-on) — the
   restore point is the dump, since a fresh free project may have no backup.
   `db dump` needs Docker and the DB password via `SUPABASE_DB_PASSWORD` env,
   never on the command line.
3. **Restore methods, in order of preference:** (a) staging is empty →
   restoring = recreate to empty (drop `public` objects / remote reset,
   staging only, with approval) and re-apply; (b) dump restore via `psql`
   into the staging DB; (c) dashboard backup/PITR if the plan has it
   (project is inaccessible during restore).
4. Storage objects are not in DB backups → the only objects are disposable
   test avatars, recreated by tests; nothing to preserve.
5. Secrets/keys are not backed up in Git; operator keeps them in a password
   manager.

## 10. Rollback rehearsal plan

- **Where:** staging only, after Stage 1 tests pass and the pre-state dump
  exists. Never on production. If any doubt about the target, rehearse on a
  second scratch project or the local stack instead.
- **How:** (1) confirm dump + guard; (2) with explicit approval run the
  approved reset of staging **only** (`db reset --linked` is a remote reset —
  needs its own approval line); (3) re-apply 001–015; (4) re-run the smoke
  subset; (5) record durations. The migration files' rollback comments are
  reverse `drop` lists, not tested scripts — treat "reset + re-apply" as the
  real rollback and state so in the report.
- **Stop conditions during `db push`:** any error, any object-exists error,
  any migration-list mismatch, target guard failure → stop; do not retry
  blindly and do not edit already-applied files. Each migration runs in a
  transaction, so a failing file leaves earlier ones applied; recover by
  resetting staging (§9.3a), fixing the file locally, re-running local
  validation, then re-pushing.
- **Edge Function rollback:** redeploy the previous git revision of
  `supabase/functions/pin-login` with the same command, or
  `supabase functions delete pin-login --project-ref <STAGING_PROJECT_REF>`
  (staging only) — the function is stateless; DB state is unaffected.
- **Test data cleanup:** wipe/reset staging (per §8 FK finding); remove
  Storage test objects via the tests' own delete steps or the reset;
  rotate/discard any temporary DB password/token afterwards.

## 11. Stage 1 command sheet (NOT EXECUTED — placeholders only)

Every mutating step is preceded by the guard. Shell: Git Bash.
`PROD_REF=iwikwbjsznjuefvuemdb`. Never echo tokens/keys/passwords.

```bash
# 0. Target guard — run before EVERY mutation block
export STAGING_REF="<STAGING_PROJECT_REF>"
guard() {
  [ -n "$STAGING_REF" ] && [ "$STAGING_REF" != "iwikwbjsznjuefvuemdb" ] || { echo "ABORT: bad ref"; return 1; }
  [ "$(cat supabase/.temp/project-ref 2>/dev/null)" = "$STAGING_REF" ] || { echo "ABORT: linked ref != STAGING_REF"; return 1; }
  supabase projects list -o json | jq -e --arg r "$STAGING_REF" '.[]|select(.id==$r)|.name' >/dev/null || return 1
}

# 1. Identity re-verification (read-only)
supabase --version && supabase projects list          # confirm name/region match written approval

# 2. Safe link — staging only (guard the ref first, by eye + script)
[ "$STAGING_REF" != "iwikwbjsznjuefvuemdb" ] && supabase link --project-ref "$STAGING_REF"

# 3. Pre-state (read-only) — guard, then:
guard && supabase migration list --linked
guard && supabase db dump --linked -f "$HOME/rumeli-staging-backups/pre_schema.sql"
guard && supabase db dump --linked --data-only -f "$HOME/rumeli-staging-backups/pre_data.sql"

# 4. Empty/disposable check (read-only): expect 0 public tables, no avatars-v4, no migration rows

# 5. Dry run, then apply 001-015 (mutation)
guard && supabase db push --dry-run                   # must list exactly 001..015, in order
guard && supabase db push                             # STOP on first error
guard && supabase migration list --linked             # local == remote, 15 rows

# 6. pin-login only (mutation)
guard && supabase functions deploy pin-login --project-ref "$STAGING_REF"
guard && supabase secrets list --project-ref "$STAGING_REF"   # names only; expect defaults, set nothing

# 7. Dashboard/config: disable signup; confirm Auth settings (§8); confirm avatars-v4 exists

# 8. Advisors + logs
guard && supabase db advisors --linked                # only if CLI >= version that has it; else Dashboard
#    Dashboard: Security + Performance advisors; Edge Function logs for pin-login

# 9. Test identities: created by a staging-safe script using the operator's
#    own env var for the service key (never committed), fake codes P0xx,
#    random PINs, .invalid emails.

# 10. Tests — see warning below; run only the staging-adapted suites:
#     Auth/PostgREST/RLS, inventory, Storage, pin-login, Istanbul cutoff,
#     backdated-entry (create+edit, 4 session time zones via SET LOCAL in RPC-level
#     tests are DB-side; over PostgREST use fixture business dates instead).

# 11. Rollback rehearsal (§10) — only with its own approval line

# 12. Final state
guard && supabase migration list --linked && echo "compare with repo; confirm production untouched"
```

**WARNING — do not run the existing local tests against hosted staging as-is.**
`local_inventory_api.mjs`, `storage_policy.test.mjs`, `pin_login.test.mjs`
hard-refuse anything but `127.0.0.1:54321` (good), read keys from
`supabase status`, and use `docker exec` into the local DB container for
fixture SQL; the `.test.sql` suites assume a superuser session
(`set local role`, direct `auth.users` inserts, `reset role`) and end in
`ROLLBACK`. None of that exists on hosted Supabase. Stage 1's first job is
to review/adapt them (Management-API/`db query` fixtures, no `docker exec`,
explicit cleanup, ref guard inside each script, fixtures leave audit rows
that block user deletion) — before any test touches staging.

## 12. Official documentation checked

Checked on 2026-09-26 (fetched successfully):
- https://supabase.com/docs/guides/deployment/managing-environments — link,
  `db push`, `db push --dry-run`; warns staging must be a fresh project.
- https://supabase.com/docs/guides/functions/deploy — per-function deploy,
  `--project-ref`, `verify_jwt` in `config.toml`.
- https://supabase.com/docs/guides/functions/secrets — default env vars
  (`SUPABASE_URL`, `_ANON_KEY`, `_SERVICE_ROLE_KEY`, new
  publishable/secret keys), `supabase secrets set/list`.
- https://supabase.com/docs/guides/platform/backups — Pro 7 / Team 14 /
  Enterprise 30 daily backups, PITR add-on, Storage objects excluded, `db
  dump` for logical backups.
- https://supabase.com/docs/guides/database/database-advisors — advisors in
  Dashboard, `supabase db advisors`, MCP, Management API.
- https://supabase.com/docs/guides/storage/security/access-control —
  upload = INSERT; upsert = INSERT+SELECT+UPDATE; public buckets bypass RLS
  on read.
- https://supabase.com/docs/guides/auth/general-configuration — disabling
  new-user signups (page did not cover Admin `createUser`/`generateLink`;
  behavior for those relies on the local run, to be re-verified on hosted).

Repo vs. docs differences: (1) `db advisors` documented but absent in
installed CLI 2.117.0; (2) function code uses legacy key env names — still
provided, newer names exist; (3) `db push` docs describe a fresh staging
project — matches plan; (4) Auth config is a Dashboard/`config push` matter,
not applied by `db push`. Not verifiable from these pages: hosted default
Data API exposure for new projects; hosted `.invalid` email acceptance.

## 13. Blockers and unresolved inputs

- **B1 (blocking): staging project not identified** — need name, ref,
  region of a *new, empty* staging project (or approval to have one
  created — a separate, explicit authorization; creating projects was
  forbidden this stage).
- **B2 (blocking): CLI not logged in** — operator must `supabase login`
  (or set `SUPABASE_ACCESS_TOKEN` in own shell) to enable read-only project
  listing and later link.
- B3: plan tier of staging (determines backup/PITR availability).
- B4: upgrade CLI to ≥2.118.0 and confirm `db advisors`.
- B5: staging-safe test-suite adaptation (Stage 1 task #1).
- B6: written owner confirmation of the staging ref/name/region.
- Later (Stage 5): approved read-only production metadata queries (§7).

## 14. Gate 0 checklist

- [ ] Staging identity known — **NOT MET** (B1)
- [ ] Proven different from production — **NOT MET** (needs B1, B2)
- [x] Production ref identified from repo evidence (`iwikwbjsznjuefvuemdb`)
- [x] Backup/restore plan written and ready for review (§9)
- [x] Rollback rehearsal plan written (§10)
- [x] Stage 1 command sheet drafted, unexecuted (§11)
- [x] 001–015 dependency review done (§7)
- [x] Official docs/CLI version checked (§12, §4)
- [x] No migration, deploy, link, remote SQL, commit or push performed
- [ ] Owner authorizes Stage 1 — **NOT GIVEN**

**Gate 0: BLOCKED / INPUT REQUIRED.**

## 15. Exact approval required for Stage 1

Not requestable yet. Once B1/B2 are resolved and Stage 0 is re-run, the
approval text must name: the staging project name and ref (confirmed
different from `iwikwbjsznjuefvuemdb`), permission to `supabase link` to
it, `db dump`, `db push` of 001–015, `functions deploy pin-login`, Auth
setting changes (signup off), creation of fake Auth users and test
Storage objects on staging only, the rollback rehearsal (including any
staging-only remote reset), and an explicit statement that production,
`main`, the old stash and any commit/push remain out of scope.
