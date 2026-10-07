# Production readiness audit and deployment package — 2026-10-07 (Phase 2A)

**Audit and package preparation only. NOTHING was written to production.** Every production query below was a `SELECT` (or `supabase migration list` /
`functions list` / an anonymous `GET`) through the Management API / REST. No migration, row, Auth user, secret, Vercel setting, Edge Function, scheduler,
storage object, RLS rule or configuration was changed. Evidence only: no secrets, keys, PINs, row contents or signed URLs are in this file.

| Item | Value |
|---|---|
| Project | `iwikwbjsznjuefvuemdb` (eu-north-1) |
| Repository | `Methefor/Rumeli-iskelesi-yonetim`, branch `v4-2027`, HEAD `c3bfa133b96f2198c4282e2f04fdf4f47baae249` = `origin/v4-2027`, clean tree at audit start |
| Tooling | Supabase CLI 2.117.0; local Docker Supabase stack for reconstruction/dry-run; read-only SQL in `supabase/audit/` |
| Machine-readable evidence | `docs/baselines/production_baseline_2026-10-07.json` (**AUDIT-TIME BASELINE ONLY, NOT VALID AS THE FUTURE APPLY BASELINE**), `supabase/audit/expected_pending_chain_delta.json` (expected delta) |

## 1. Repository state

- `git rev-parse HEAD` = `origin/v4-2027` = `c3bfa13…`; working tree clean; no untracked migration file; ordering is deterministic (numbered `001…018`, then
  timestamped versions in ascending order).
- 34 migration files: 18 numbered, `20260611233031_add_kategori_devri` (legacy history mirror), `20260930231709`, `20261001000111`, `20261001204651`,
  `20261005000100/200/300`, and the **9 pending**:

| # | Pending migration |
|---|---|
| 1 | `20261006000100_analytics_engine_v1.sql` |
| 2 | `20261006000200_waste_reasons.sql` |
| 3 | `20261006000300_inventory_control_reports.sql` |
| 4 | `20261006000400_branch_location.sql` |
| 5 | `20261006000500_procurement_core.sql` |
| 6 | `20261006000600_procurement_rpcs.sql` |
| 7 | `20261006000700_weather_context.sql` |
| 8 | `20261006000800_command_center.sql` |
| 9 | `20261007000100_manager_reports.sql` |

The list is complete: `supabase migration list --linked` shows exactly these 9 with an empty remote column.

## 2. Live production state (read-only, 2026-10-07)

**Migration history (25 rows)** = `001…018`, `20260611233031`, `20260930231709`, `20261001000111`, `20261001204651`, `20261005000100`, `20261005000200`,
`20261005000300`. Classification of all 34 repo files: **25 APPLIED, 9 PENDING, 0 UNEXPECTED_PRODUCTION, 0 MISSING_FROM_REPO, 0 ORDER_CONFLICT.** There is no silent
discrepancy.

**Schema inventory** (`public`; exact, from the baseline query; "V4" = objects of the 25 migrations, "legacy" = the pre-V4 production app):

| | Total | V4 | Legacy |
|---|---:|---:|---:|
| tables | 38 | 30 | 8 (`achievements`, `admins`, `cashiers`, `daily_reports`, `daily_revenue`, `entry_history`, `shift_schedule`, `targets`) |
| views | 5 | 3 | 2 (`daily_performance`, `weekly_performance`) |
| sequences | 2 | 0 | 2 (`daily_revenue_id_seq`, `targets_id_seq`) |
| functions | 78 | 74 | 4 (`calculate_points`, `get_badge_level`, `update_cashier_badge`, `update_updated_at`) |
| public policies | 50 | 36 | 14 |
| storage policies | 6 | 4 (`avatars_v4_*`) | 2 (`avatars_upload …`) |
| triggers | 19 | 17 | 2 |
| indexes | 104 | 83 | 21 |
| SECURITY DEFINER | 68 | 68 | 0 |

No materialized views. Every public table has RLS enabled (0 without). **All 68 definer functions have a locked `search_path`; 0 are executable by PUBLIC;
all 12 `internal_*` functions are service-role only.**

**Proof that the V4 half is exactly the 25 migrations:** the 25 migrations were applied to an isolated local database and the same baseline (function body
hashes, column/constraint/trigger/index definitions, ACLs, view definitions, policy definitions) was compared with production:
`node supabase/audit/compare_baselines.mjs prod local_25 --legacy-aware` → **0 changed objects, 0 local-only objects**; the ONLY production-only objects are the
legacy ones listed above (8 tables, 2 sequences, 2 views, 4 functions, 16 policies).

| Area | Live state |
|---|---|
| Auth | `auth.users` 0, `auth.identities` 0, `auth.sessions` 0 |
| Identity tables | `profiles` 0, `user_roles` 0, `pin_credentials` 0, `branch_memberships` 0, `audit_logs` 0 |
| Operating seeds | `branches` 3, `shift_definitions` 4, `sales_categories` 10, `roles` 6, `permissions` 21, `role_permissions` 68 |
| V4 runtime tables | `shifts`, `registers`, `sales_reports`, `inventory_items`, `inventory_movements`, `legacy_sales_import_runs` all 0 |
| Storage | `avatars` (public, 1 object), `avatars-v4` (public, 2 MiB limit, jpeg/png/webp, 0 objects) |
| Extensions | `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp` |
| PostgREST role settings | `authenticator`: `lock_timeout=8s`, `statement_timeout=8s`, `session_preload_libraries=safeupdate`, `pgrst.db_pre_request=public.enforce_active_user` |
| Edge Functions | none deployed (`functions list` = `[]`) |
| Legacy rows | `daily_reports` **549**, `entry_history` **216**, `shift_schedule` 19, `cashiers` 5, `targets` 3, `achievements` 2, `admins` 1, `daily_revenue` 0, view `weekly_performance` 5 |
| Legacy anon API | `GET /rest/v1/daily_reports` with the anon key → HTTP 206, `Content-Range: 0-0/549` (works) |

**Drift note (expected, not a discrepancy):** legacy is live and kept receiving writes after the 2026-10-06 apply (`daily_reports` 547 → 549,
`entry_history` 215 → 216). Every pre-apply baseline MUST therefore be re-captured immediately before the apply (section 12).

Not observable read-only from here (recorded as UNKNOWN, to be captured at T-24h by the owner): Auth dashboard settings (public signup, JWT expiry, SMTP),
PITR/backup retention, Vercel environment variables and deployments, hosted secrets.

## 3. Production vs local delta

Exactly the 9 pending migrations. No unexpected difference. The pending chain adds **16 tables, 2 views, 1 sequence, 73 functions, 16 policies, 36 indexes,
17 triggers, 17 permission keys (+45 role grants), 8 seed rows** and alters **3 existing V4 objects** (section 4). It drops nothing and changes no legacy object.

## 4. Migration chain audit

Method: each migration was applied cumulatively to the reconstruction of production (25 migrations) and the baseline re-captured after every step
(`supabase/audit/production_baseline_readonly.sql`), so every number below is measured, not read from comments. All 9 steps applied with 0 errors.

| # | Migration | Created | Altered / replaced (existing) | Seeds (row writes) | Security | Legacy impact | Rollback class | Verdict |
|---|---|---|---|---|---|---|---|---|
| 1 | analytics_engine_v1 | 6 tables (`analytics_settings`, `external_context_daily`, `daily/weekly_analytics_snapshots`, `analytics_insights`, `analytics_reports`), 2 views, 28 functions (20 definer), 6 policies, 12 indexes, 5 triggers | none | 4 permission keys, +11 role grants, `analytics_settings` 1 row (technical defaults) | snapshots/insights append-only; RLS; definer locked; **hardening applied in this audit: ALL privileges of `anon` on the two views revoked** | none | reversible before use (script); conditional once snapshots exist; restore after | OK |
| 2 | waste_reasons | 1 table (`waste_reasons`), 2 functions, 1 policy | `inventory_movements` fixed reason CHECK → FK to the catalogue; `record_inventory_waste` replaced | 3 permission keys, +8 grants, **6 waste reasons** (the six codes the old CHECK allowed, so history stays valid) | RLS, audited RPCs | none | reversible before use (script restores CHECK + function); restore after new reasons are used | OK |
| 3 | inventory_control_reports | 6 functions (5 definer) | none | none | permission-gated read RPCs | none | reversible always (drop functions) | OK |
| 4 | branch_location | 1 table (`branch_locations`, empty), 3 functions, 1 policy | `branches`: + `timezone` NOT NULL default `Europe/Istanbul`, check constraint, validation trigger | 1 permission key, +3 grants; **no coordinates** | RLS; coordinates never returned to clients | none | reversible before use; restore after coordinates/time zones are set | OK |
| 5 | procurement_core | 6 tables, 1 sequence, 5 functions, 6 policies, 17 indexes, 8 triggers | none | 8 permission keys, +20 grants; **0 suppliers, 0 supply params, 0 orders** | append-only guards, RLS, separate receive permission | none | reversible before use; restore after orders/receipts | OK |
| 6 | procurement_rpcs | 18 functions (15 definer) | none | none | audited, permission + branch scoped | none | reversible before use; restore after receipts (ledger) | OK |
| 7 | weather_context | 2 tables (`weather_settings`, `weather_forecast_snapshots`), 7 functions, 2 policies | `external_context_daily` (chain-internal) + provenance columns; `analytics_context_for` replaced (chain-internal) | 1 permission key (`weather.read`), +3 grants, `weather_settings` 1 row (forecast TTL 60 min, technical default) | service-role-only writers, append-only forecasts | none | reversible before use; conditional once forecasts/context exist | OK |
| 8 | command_center | 3 functions (1 definer, 2 invoker batch read models) | none | none | permission-gated per part | none | reversible always | OK |
| 9 | manager_reports | 1 function (invoker, `get_manager_report_inputs`) | none | none | `analytics.read` entry + per-domain access flags (see section 5) | none | reversible always | OK |

**Order proof.** The chain is dependency-ordered: (a) every cumulative prefix applies cleanly (9/9 steps, 0 errors); (b) removing a predecessor breaks the
successors — without #1, #7 fails with `relation "public.external_context_daily" does not exist`; without #5, #6 fails with
`relation "public.purchase_order_lines" does not exist`; (c) dependency edges: #2→inventory core (012–014); #3→#2; #4→`branches`; #5→inventory/branches/permissions;
#6→#5; #7→#1 (+#4 coordinates); #8→#1,#3,#5,#7 read models; #9→#1,#3. Safe order = file order.

**Transaction and lock behaviour.** The CLI executes each file as one multi-statement execution (a failing file rolls back as a unit; no file contains
`BEGIN/COMMIT`, `CREATE INDEX CONCURRENTLY`, `VACUUM`, `ALTER SYSTEM`, `ALTER ROLE`, `ALTER DEFAULT PRIVILEGES`, `NOTIFY`, `TRUNCATE` or a table/function/policy `DROP`; the single drop of an existing object is the replacement of the `inventory_movements` reason CHECK constraint in #2).
The only statements on EXISTING tables are the three in the table: `inventory_movements` (0 rows in production), `branches` (3 rows; a constant default column) and
`record_inventory_waste` (function). Brief ACCESS EXCLUSIVE locks on those two tables; none of them is read by the legacy app. All other DDL targets new, empty
tables. No migration backfills or assumes populated data; none is long-running (the whole chain applies in seconds locally). No migration assumes more than "the 25
migrations are applied".

**Collision check against live production** (`supabase/audit/pending_chain_collision_check_readonly.sql`, one `SELECT` generated from the exact object delta):
55 relation/index names, 73 function names, 16 policy names, 1 sequence, 38 permission keys checked → **0 relation/index/function/policy/sequence collisions**;
`branches.timezone` absent; the only permission keys present are the 21 existing ones (the 17 new keys are absent). **Collision status: none.**

## 5. Security audit

Inputs: the resulting schema (local, full chain) and the SQL role suites, all green on a fresh reset: `analytics_engine`, `inventory_control` (165),
`procurement` (256) + concurrency (15), `command_center` (131), `manager_reports` (62), `inventory_security`, `management_center`, plus the teardown test.

- **Hygiene of the resulting schema** (baseline `hygiene`): 118 SECURITY DEFINER functions (68 + 50), **0 without a locked `search_path`, 0 executable by PUBLIC**,
  `internal_*` service-role only (21 new helper functions are service-role only: analytics builders/writers, forecast/observed-weather writers, procurement line
  writer, …). 23 new SECURITY INVOKER functions (batch read models, pure helpers, trigger functions): permission/RLS behaviour is that of the caller.
- **anon execute.** The pending chain adds 9 anon-executable functions: 8 trigger functions and the pure helper `procurement_transition_allowed(text,text)`.
  None is SECURITY DEFINER, none reads data (a trigger function cannot be called directly). This is the same default-privilege pattern as the 27 already
  anon-executable V4 helpers in production. Documented, not a defect.
- **RLS.** 0 tables without RLS after the chain; 16 new policies, all permission + branch-scope based. **Finding fixed in the repo (not production):** the two analytics
  views inherited Supabase's default `ALL` privileges for `anon`. They are `security_invoker` and were proven harmless locally (anon `SELECT` → `permission denied for
  table daily_analytics_snapshots`; `UPDATE` → `cannot update view`), but the privilege was removed to match every other V4 view
  (`revoke all … from public, anon, authenticated` before the `authenticated` grant, in `20261006000100`). The migration is unapplied, so editing it is safe.
- **Manager report permission intersection.** `analytics.read` is the entry permission only; per branch the read model returns access flags (`financial`,
  `reports`, `stock`, `weather`) from the same helpers the domains use, and waste/counts/procurement/forecast keep their own part permissions. A caller holding only
  `analytics.read` gets all flags false (tested). branch_manager sees only their own branch; another branch is `{error: unavailable}` with no data.
- **Roles tested (SQL):** owner, manager, branch_manager (own/other branch), cashier, employee, viewer, anon, service_role — see the suites above.
- **Anonymous probe in production (inconclusive by design):** `GET /rest/v1/profiles` and `/sales_reports` as anon → HTTP 200 `[]`. Those tables are empty, so
  this proves nothing about RLS; the SQL role suites are the evidence.
- **auth.uid assumptions / pre-bootstrap behaviour.** With Auth empty, every permission helper resolves to "no permission": no new function is callable with
  effect before the owner exists; service-role-only helpers are not callable by clients.

## 6. Legacy coexistence

- **No legacy object is touched**: legacy tables, views, functions, triggers, policies and the `avatars` bucket appear in the production baseline and are
  byte-identical after the reconstruction comparison; the pending delta changes **0 legacy objects** (the verifier fails on any legacy definition change).
- No pending migration alters roles, default privileges, `search_path` at database level, the PostgREST `db_pre_request` hook (`enforce_active_user` is unchanged),
  grants on legacy tables, storage or extensions. No renamed/removed columns. No conflicting function names/signatures (collision check).
- **Shared behaviour changes — flagged:** (1) `inventory_movements` reason validation moves from a fixed CHECK to an FK onto the (seeded) catalogue; (2)
  `branches` gains `timezone` + a validation trigger on writes to `branches` (V4 table, never written by legacy); (3) `permissions`/`role_permissions` gain rows (V4 tables).
  None is used by the legacy application, which only reads/writes its eight legacy tables and the `avatars` bucket.
- Legacy anon read works today (549 rows); the pending chain cannot affect it. **Binding rule satisfied: no pending migration silently breaks legacy before cutover.**
  The post-apply plan still re-checks it (section 18).

## 7. Auth / identity readiness

Current: Auth empty (0/0/0), `profiles`/`user_roles`/`pin_credentials`/`branch_memberships` 0, no `owner_bootstrap` or PIN audit rows, `internal_bootstrap_owner` and
`internal_rotate_owner_pin` exist and are service-role only. No Edge Function is deployed.

Minimum safe sequence — each item is a separate, independently approved operation (the schema apply creates NO user, profile, role assignment or PIN):

1. **SCHEMA APPLY** (Gate A) — only objects; Auth/identity tables stay empty.
2. **AUTH BOOTSTRAP / OWNER ACCOUNT** (Gate B) — fresh backup, then `identity-data/` owner bootstrap through the service-role function; creates the one owner Auth user + profile + role.
3. **EDGE FUNCTIONS** (Gate B/C) — `pin-login` and the management functions + hosted secrets (needed for any cashier login).
4. **PIN CREDENTIALS / tiny user set** (Gate C) — through the approved private manifest, never in Git.
5. **LEGACY IMPORT** (Gate D) — only after the freeze/fingerprint gate (section 19).

Application login depends on: Auth user (GoTrue), `profiles`, `user_roles`, `branch_memberships`, `pin_credentials`, the deployed `pin-login` function and the pilot frontend
environment — none of which exists today and none of which the schema apply provides.

## 8. Data / seeds

| Write | Class | Production effect |
|---|---|---|
| tables, views, functions, policies, indexes, triggers, sequence | schema-only | none on data |
| 17 permission keys + 45 role grants | configuration seed (technical, role matrix) | additive; consistent with the owner-approved role model |
| `analytics_settings` (1 row, `settings = {}`) | row is empty; the effective thresholds are repository defaults that are **business/risk policy** (section 8a) | explicit Gate A owner decision; snapshots carry `defaults_pending_owner_review` |
| `weather_settings` (1 row, TTL 60 min) | technical default (freshness) | not a business threshold; review at Gate F (section 8a) |
| `waste_reasons` (6 rows) | configuration seed derived from the former fixed CHECK | the same six codes the system already accepted; no new business meaning |
| `branch_locations`, `suppliers`, `item_supply_params`, `purchase_orders`, snapshots, forecasts, context rows, movements | none (0 rows) | **no coordinates, suppliers, supply parameters, thresholds or orders are invented**; real coordinates remain an owner-controlled configuration step |
| RPC/loader writes (analytics regeneration, forecast store, procurement, …) | runtime | none are executed by the apply; the weather loader is local-only |

## 8a. Seeded settings: exact values and owner review (extracted from the pending migrations)

`20261006000100` inserts exactly one row, `analytics_settings (id) values (1)`: `settings = '{}'` (empty). So **no analytics value is stored in the database by the apply**; the effective values are the built-in defaults of
`public.analytics_params()` (same migration), overridable only through the audited `update_analytics_settings` (values range-checked). `20261006000700` inserts `weather_settings (singleton) values (true)`, taking the column default.
The earlier wording "technical default" was too generous: every analytics threshold below changes what the manager reports show or how a comparison is classified, so each is a **business / risk policy** and is an explicit Gate A decision.

**analytics_settings / analytics_params() defaults**

| SETTING | VALUE | TYPE | PURPOSE | TECHNICAL DEFAULT OR BUSINESS/RISK POLICY? | IMPACT IF CHANGED | OWNER APPROVAL REQUIRED? |
|---|---|---|---|---|---|---|
| `timezone` | `Europe/Istanbul` | text (not overridable) | calendar-day boundaries for every analytics date | technical, fixed project rule | none (not in the allowed override list) | no (project rule) |
| `baselineWeeks` | 4 | integer | how many previous same-weekday finalized days form the "normal" baseline | **business policy** (defines "normal") | changes every baseline average, comparison and its classification | **yes** |
| `minBaselineSamples` | 2 (allowed 1-4) | integer | minimum baseline days before a comparison is shown | **business/risk policy** (evidence threshold) | fewer samples show comparisons on thinner evidence; more suppress them (management attention) | **yes** |
| `lowVolumeBaseRevenue` | 500 (>= 0) | numeric, revenue units of the daily gross revenue | below this base, a percentage change is flagged as low-base instead of a plain change | **business/risk policy** (classification of a change) | moves which revenue changes are flagged / suppressed | **yes** |
| `lowVolumeBaseTransactions` | 10 (>= 0) | numeric, count | same, for transaction counts | **business/risk policy** | same | **yes** |
| `minCorrelationSamples` | 14 (5-365) | integer | minimum days with weather context before a weather/revenue relationship is reported | **business/risk policy** (evidence threshold for an insight) | lower values surface weaker relationships to managers | **yes** |
| `minGroupSamples` | 3 (2-30) | integer | minimum rainy and dry days each before a rain effect is stated | **business/risk policy** (evidence threshold) | same | **yes** |
| `rainMmThreshold` | 1.0 mm (0-50) | numeric | precipitation at or above this counts as a rainy day | **business interpretation** (what "rain" means for sales) | changes the rainy/dry split and the stated rain effect | **yes** |
| `weatherWindowDays` | 84 (14-365) | integer | window of days used for weekly weather/revenue context | **business/statistical policy** | changes which days feed the weather insight | **yes** |
| `status` | `defaults_pending_owner_review` | text | marker embedded in every snapshot | metadata | none on numbers | no |

No value changes any alert or severity by itself (no notification exists), but each drives what is shown to management, so none is "technical". Nothing is invented: the values are the repository defaults, reviewed here, not changed.
After the apply nothing can change them until Gate B (changing them needs an authenticated owner; no Auth user exists). **Gate A decision: accept these defaults as provisional (snapshots carry `defaults_pending_owner_review`) or supply different values before apply (that edits the still-unapplied migration defaults and re-runs the regression).**

**weather_settings**

| SETTING | VALUE | TYPE | PURPOSE | TECHNICAL DEFAULT OR BUSINESS/RISK POLICY? | IMPACT IF CHANGED | OWNER APPROVAL REQUIRED? |
|---|---|---|---|---|---|---|
| `singleton` | `true` | boolean PK | enforces a single row | technical | none | no |
| `forecast_ttl_minutes` | 60 (5-1440) | integer | how long a fetched forecast counts as fresh (`valid_until = fetched_at + TTL`); stale forecasts are labelled stale | technical default (data freshness, not a risk threshold), but it controls provider call volume at the loader gate | shorter = more provider calls and fewer stale labels; longer = staler data shown as fresh | not for the apply; review at Gate F (with the provider/budget decision); changed only via audited `update_weather_settings` |

## 9. Storage

Unchanged by the pending chain: no migration contains a `storage.*` statement; the storage policy count stays 6 and the post-apply verifier requires buckets and
object counts to be identical (`avatars` 1 object, `avatars-v4` 0 objects). Pending chain does not touch the legacy `avatars` bucket or its two policies.

## 10. Backup plan (immediately before the apply)

Existing procedure: `docs/PRODUCTION_BACKUP_RUNBOOK.md`. The 2026-10-06 backup predates this apply and is **not** reusable. T-60 / immediately before:

```bash
STAMP=$(date +%Y%m%d-%H%M%S); OUT="C:/projects/Rumeli-iskelesi-yonetim-backups/${STAMP}-T60-pending-chain-apply"; mkdir -p "$OUT"
supabase db dump --linked --role-only             -f "$OUT/roles.sql"
supabase db dump --linked                         -f "$OUT/schema.sql"
supabase db dump --linked --data-only --use-copy  -f "$OUT/data.sql"
supabase migration list --linked                  > "$OUT/migration_list.txt"
supabase functions list --project-ref iwikwbjsznjuefvuemdb > "$OUT/functions_list.txt"
supabase db query --linked -f supabase/audit/production_baseline_readonly.sql --output-format json > "$OUT/baseline_pre.json"
supabase db query --linked "select bucket_id, name, metadata->>'size' size, metadata->>'mimetype' mime, created_at from storage.objects order by 1,2" --output-format json > "$OUT/storage_objects.json"
sha256sum "$OUT"/*      > "$OUT/SHA256SUMS.txt"
```

Validation (all required, otherwise STOP): files non-empty and hashed; `data.sql` row counts equal `baseline_pre.json` `row_counts` (legacy 549/216/19/5/3/2/1 or the live values); `schema.sql` restores into a scratch local database
(`psql … < schema.sql`) and the restored object counts equal the baseline counts (38 tables / 5 views / 78 functions); storage object downloaded and SHA-256 recorded (1 object);
Auth counts 0/0/0 recorded; dashboard Auth settings and PITR/retention recorded by the owner (screenshot/values, not in any dump). A backup is not valid until the restore
validation passed.

## 11. Pre-write baseline

`supabase/audit/production_baseline_readonly.sql` is the machine-readable baseline (one `SELECT`, one JSON document: migrations, counts, every relation with column/constraint/trigger/index/view/ACL
hashes, every function with body hash, definer/search_path/grants, every policy with a definition hash, anon privileges, storage buckets/objects, Auth counts, extensions,
`authenticator` settings, row counts of legacy and key V4 tables). The live 2026-10-07 capture is `docs/baselines/production_baseline_2026-10-07.json`, labelled **AUDIT-TIME BASELINE ONLY - NOT VALID AS THE FUTURE APPLY BASELINE** (legacy production keeps receiving writes; `verify_post_apply.mjs` refuses it as an input). Gate A requires a fresh **T-60** backup/baseline and an immediate pre-write **T-0** baseline; no old baseline may satisfy Gate A. Legacy smoke at T-0: anon `GET daily_reports` (expect HTTP 206 and the live count) and the legacy PWA still served (read-only).

## 12. Expected post-apply state (derived from the repo chain + the live baseline, not from stale counts)

| Metric | Production now | Delta | Expected after apply |
|---|---:|---:|---:|
| public tables | 38 | +16 | **54** (46 V4 + 8 legacy) |
| public views | 5 | +2 | **7** (5 V4 + 2 legacy) |
| sequences | 2 | +1 | **3** |
| relations (tables+views) | 43 | +18 | **61** (51 V4 + 10 legacy) |
| functions | 78 | +73 | **151** (147 V4 + 4 legacy) |
| SECURITY DEFINER functions | 68 | +50 | **118** |
| public policies | 50 | +16 | **66** |
| storage policies | 6 | 0 | **6** |
| triggers | 19 | +17 | **36** |
| indexes | 104 | +36 | **140** |
| permissions / role_permissions | 21 / 68 | +17 / +45 | **38 / 113** |
| seed rows | — | `analytics_settings` +1, `weather_settings` +1, `waste_reasons` +6 | 1 / 1 / 6 |
| migration history | 25 | +9 | **34** |
| tables without RLS | 0 | 0 | **0** |

Columns altered: `branches` + `timezone`. Constraints: `inventory_movements` reason CHECK → FK. Functions replaced: `record_inventory_waste`. Auth, storage, extensions and the
`authenticator` settings: unchanged. Exact object lists: `supabase/audit/expected_pending_chain_delta.json`; the check is `supabase/audit/verify_post_apply.mjs`
(62 checks; negative controls — extra migration, Auth user, stock movement, dropped function, definer without `search_path`, storage object, changed function body — all fail as intended).

## 13. Final dry-run plan (no production write)

1. **Local reconstruction + chain (already done, repeat before apply):** apply the 25 migrations locally, baseline → `local_25.json`; apply the 9 → `local_full.json`;
   `node supabase/audit/verify_post_apply.mjs local_25.json local_full.json` → `passed=62 failed=0`.
2. **Live collision check:** `supabase db query --linked -f supabase/audit/pending_chain_collision_check_readonly.sql` → all `*_present` arrays empty except the 21 existing permission keys.
3. **Live equals reconstruction:** `node supabase/audit/compare_baselines.mjs baseline_pre.json local_25.json --legacy-aware` → 0 changed, 0 local-only objects.
4. **CLI dry-run (NOT run in Phase 2A: it is a push command and this phase is strictly read-only; run it as step 4 of the apply runbook):** `supabase db push --linked --dry-run --include-all` must list EXACTLY the 9 pending versions, NOT `20260611233031`, and propose no repair. (`--dry-run` only prints the plan:
   prior evidence 2026-10-06 — history unchanged afterwards.)
5. **Proof that no production write happened:** capture a baseline before and after steps 2–4 and run `compare_baselines.mjs` → empty diff, history still 25 rows.

Failure conditions (any ⇒ STOP, no apply): a non-empty `*_present` list beyond the 21 keys; a changed/local-only object in step 3; the dry-run proposing any other version, a repair or a history mirror; a legacy count
that moved in a way the owner did not expect; a failed backup validation.

## 14. Rollback strategy

`supabase/rollback/v4_schema_teardown.sql` is **not** a production rollback for this apply: it removes ALL V4 objects (46 tables, 5 views, 147 functions) including the base schema applied on
2026-10-06, and all V4 data, and is locked. It is the "remove V4 entirely" tool of the golden rule, usable only while no V4 runtime data and no user exists.

New for this package: `supabase/rollback/pending_chain_rollback.sql` — **prefix-aware SCHEMA ROLLBACK** of the nine pending migrations, before first use. It is not MIGRATION HISTORY REPAIR (below).

**Why prefix-aware (apply transaction model).** The CLI runs each migration file as one batch: its statements plus the history insert are sent together and execute in one implicit transaction, and the push stops at the first failing file.
Measured locally with the same CLI (`db push --local --include-all` with files 1 and 2 followed by a deliberately broken file that creates a table, inserts a seed row and then divides by zero): the broken file left **no** partial table, **no** partial seed row and **no** history row; files 1 and 2 remained applied with their history rows (27 rows).
So a failure of migration N leaves exactly the successfully applied prefix 1..N-1 in the schema and in the history. A full-chain rollback is **not** valid for that state; the script therefore detects the prefix itself. (Local evidence for the same code path; production itself was not exercised. A client or network drop mid-file is rolled back by the server like any failed transaction.)

**What the script does (all in one transaction, in this order):**
1. `begin; set local lock_timeout = '5s';` then **arming**: the committed file is `v_armed := 'DISARMED'` and aborts here, before any DROP/ALTER, unless the owner sets the required token `ROLLBACK-PENDING-CHAIN-9-MIGRATIONS-OWNER-APPROVED` (after written approval, in a reviewed copy).
2. **Prefix detection and preconditions, all read-only and before any destructive statement:** one marker object per migration (`analytics_settings`, `waste_reasons`, `get_waste_report`, `branch_locations`, `suppliers`, `create_purchase_order`, `weather_settings`, `get_command_center_signals`, `get_manager_report_inputs`);
   the installed set must be exactly a prefix (a marker beyond a gap refuses); prefix 0 refuses ("nothing to roll back"); the migration history (read only) must record exactly versions 1..prefix of the nine, otherwise refuse; every existing pending data table must be empty; `analytics_settings` must still be the seeded empty `{}`, `weather_settings` TTL 60, the waste catalogue the six seeded reasons, no movement reason outside the original six, no branch time zone changed.
3. Restore the three existing objects the prefix altered, and only those (`inventory_movements` CHECK + `record_inventory_waste` only when migration 2 is present; `branches` timezone trigger/constraint/column only when migration 4 is present), then drop views, tables in explicit FK order, the sequence, the chain's functions (`IF EXISTS`), and the 17 permission keys with their grants.
4. **No `DROP ... CASCADE` anywhere**: a dependency that is not listed makes the transaction fail and roll back (tested with a hidden dependent view). The 25-migration schema, legacy objects, Auth, Storage and the migration history are never touched.

**Recovery matrix: every prefix N = 1..9** (each: fresh reset of the 25-migration schema + migrations 1..N applied, then the DISARMED file run (changes nothing), then an armed test copy, compared with the original 25-migration baseline; migration history is allowed to stay ahead):

| N | Applied versions | Rollback result | History rows after rollback | Repair versions required (ordered) |
|---|---|---|---|---|
| 1 | 1..1 (analytics_engine_v1) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 26 (25 + 1) | `20261006000100` |
| 2 | 1..2 (waste_reasons) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 27 (25 + 2) | `20261006000100 20261006000200` |
| 3 | 1..3 (inventory_control_reports) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 28 (25 + 3) | `20261006000100 20261006000200 20261006000300` |
| 4 | 1..4 (branch_location) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 29 (25 + 4) | `20261006000100 20261006000200 20261006000300 20261006000400` |
| 5 | 1..5 (procurement_core) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 30 (25 + 5) | `20261006000100 20261006000200 20261006000300 20261006000400 20261006000500` |
| 6 | 1..6 (procurement_rpcs) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 31 (25 + 6) | `20261006000100 20261006000200 20261006000300 20261006000400 20261006000500 20261006000600` |
| 7 | 1..7 (weather_context) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 32 (25 + 7) | `20261006000100 20261006000200 20261006000300 20261006000400 20261006000500 20261006000600 20261006000700` |
| 8 | 1..8 (command_center) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 33 (25 + 8) | `20261006000100 20261006000200 20261006000300 20261006000400 20261006000500 20261006000600 20261006000700 20261006000800` |
| 9 | 1..9 (manager_reports) | PASS: 0 relation / function / policy differences, 0 count deltas, 0 seed / row-count differences, hygiene identical, legacy unchanged | 34 (25 + 9) | `20261006000100 20261006000200 20261006000300 20261006000400 20261006000500 20261006000600 20261006000700 20261006000800 20261007000100` |

For prefix N the history repair list is exactly the first N versions above; a full-chain repair list is only valid for N = 9. No repair is executed by this package.

**Refusal / safety scenarios (all verified, state unchanged afterwards):** disarmed file; wrong token; prefix 0; one `suppliers` row (used chain); changed `analytics_settings`; changed weather TTL; deleted waste reason; changed branch time zone; a gap in the prefix (migration 3 function missing while 4+ exist); history missing version 3 while the schema is at prefix 9; a hidden dependent view (no cascade, so the drop fails and rolls back); without `ON_ERROR_STOP` a failed statement still leaves nothing applied (the trailing `commit` of an aborted transaction rolls back). The unmodified armed script on an intact full chain commits and equals the 25-migration baseline.

**Schema rollback vs migration history repair.**
- The script **reads** `supabase_migrations.schema_migrations` to cross-check the prefix and never modifies it.
- After a schema rollback the history still lists the applied versions (rows after rollback in the matrix), so `db push` would treat them as applied and never reapply them, and `migration list` would hide the drift.
- Reconciliation is a **separate production write needing its own explicit owner approval, NOT implemented or run in this phase:** after the schema rollback is verified (baseline = the 25-migration baseline, `compare_baselines.mjs` shows 0 differences apart from the history rows), the owner runs `supabase migration repair --status reverted` with exactly the ordered list for the proven prefix N (matrix above),
  then `supabase migration list --linked` must show 25 applied and the rest pending, and `db push --dry-run` must list exactly those versions again. If the database is instead restored from the verified backup, the restored history (25 rows) is already consistent and no repair is needed.
- The two operations are never combined in one step and neither is part of Gate A's apply.

| Phase | Path | Notes |
|---|---|---|
| A. before app traffic (nothing written to the new tables) | `pending_chain_rollback.sql` (owner approval) or restore | all new objects can be safely dropped before first use; the three altered objects are restored by the script |
| B. after app traffic, no business data written | conditionally reversible: the script's preconditions decide; snapshot/forecast/context rows are derived data | any precondition failure ⇒ restore from backup |
| C. after business writes (orders/receipts, count/waste with new reasons, coordinates, snapshots used in decisions) | **restore from the verified backup; do not use ad-hoc destructive downgrade** | ledger is append-only and linked to receipts; dropping tables would destroy history |

Per-migration policy (no migration may be called removable "at any time"): **before first use** (no app traffic, all new tables empty) any function-only migration (#3, #8, #9) is structurally removable after dependency validation (nothing later in the chain calls its functions; the whole-chain script does it in dependency order).
**After pilot / app traffic** a function may be called by a deployed client (RPC): before dropping anything the owner must check active application dependency (deployed frontend and Edge Functions referencing it), its grants, and downstream functions that call it; a deployed RPC must not disappear while clients use it.
**After business writes** only the guarded rollback rules above (preconditions decide, otherwise restore from the verified backup) apply. #1, #2, #4, #5/#6, #7 additionally own tables, so once those hold data they are irreversible without a restore.
Emergency step 0 of `PRODUCTION_ROLLBACK_RUNBOOK.md` (detach the `db_pre_request` hook) is unaffected: the chain does not touch the hook.

## 14a. Evidence: edit of the unapplied analytics migration

`20261006000100_analytics_engine_v1.sql` was edited by this audit (+3 lines: `revoke all on public.daily_analytics_current, public.weekly_analytics_current from public, anon, authenticated;` before the `authenticated` grant).
- **Never applied to production:** the live `supabase migration list --linked` (re-run read-only after the edit) shows `20261006000100` with an empty remote column; production history has 25 rows and none of the nine pending versions.
- Git: one commit introduced the file (`e8af37d`); the working-tree diff is exactly the 3 added lines; no other migration file changed.
- **No checksum / history conflict:** there is no production history row for this version, so nothing to mismatch; the CLI stores no per-file checksum of unapplied files.
- All downstream migrations and every test suite pass on a fresh reset with the edited file (section 24 / final report totals).
- **This edit is safe ONLY because the migration is still pending.** Once applied to production, a migration file must never be edited (a new migration is required).

## 14b. Apply strategy recommendation (owner decides)

Dependency graph (verified by applying every prefix and by negative tests): 1 analytics is the root (`external_context_daily`, `analytics_*`); 7 weather depends on 1 (removing 1 breaks 7); 2 waste_reasons and 4 branch_location are independent additions to existing V4 tables;
3 inventory_control_reports is functions over existing tables; 5 procurement_core is independent tables; 6 procurement_rpcs depends on 5 (removing 5 breaks 6); 8 command_center and 9 manager_reports are read functions over the earlier objects.

| | Option A: all nine in one controlled schema apply | Option B: split apply |
|---|---|---|
| Boundary | none | after #4 (`1-4` analytics, waste, inventory control, branch location; then `5-9` procurement, weather, command center, reports): every prefix applies cleanly, and #5/#6 form a self-contained block |
| Dependency graph | satisfied by order | satisfied at the boundary |
| Rollback complexity | one prefix-aware script, tested for the full chain and for every prefix 1..9; one history repair list per proven prefix | the same script and tests; no extra rollback path, but a deliberate stop point is a state to manage |
| Verification | `verify_post_apply.mjs` is built for exactly the 9-migration delta (62 checks) | needs a prefix expected-delta file and a second approval round; not built or tested |
| Downtime / lock exposure | none for legacy: additive objects, only brief locks on `branches`, `inventory_movements`, `permissions`; one window | two windows, the same locks twice |
| Partial-state risk | each file is its own transaction (measured), so a failure leaves exactly a prefix 1..N-1 in schema and history; every prefix has a tested recovery path (matrix in section 14) | the intended intermediate state is a prefix like any failure state; it must additionally be verified with a prefix-specific expected delta that does not exist yet |
| Operational simplicity | one approval, one runbook | two approvals, two baselines |

**Recommendation: Option A, conditional on what is now proven.** Option A stays the recommendation only because every possible applied prefix 1..9 has a **tested** recovery path: stop, determine the exact prefix read-only, run the prefix-aware armed schema rollback (owner approval), verify equality with the 25-migration baseline, then a separately approved history repair for exactly that prefix (section 14). "A failure leaves a valid prefix" alone is not a recovery; the matrix is.
The chain is purely additive and legacy-neutral and was proven to apply cleanly as a whole and per prefix; the verifier covers the whole-chain delta; a split adds approval rounds and a prefix expected-delta that does not exist. If the owner still prefers a split, the safe boundary is after #4 and the verifier would need a prefix variant first.

## 15. Hosted component separation

| Component | Required for schema apply? | Required for pilot? | Required for full cutover? | Owner decision? |
|---|---|---|---|---|
| Schema apply (9 migrations) | — | yes | yes | **Gate A** |
| Auth bootstrap / owner | no | yes | yes | Gate B |
| PIN credentials / users | no | yes (tiny cohort) | yes | Gate C |
| Edge Functions (`pin-login`, management) | no | yes | yes | Gate B/C |
| Vercel deployment / pilot frontend | no | yes (restricted) | yes | Gate E |
| PWA (existing legacy PWA) | no | untouched | replaced at cutover | Gate E |
| Weather loader hosting + scheduler | **no** | no (forecast optional) | optional | Gate F |
| Real branch coordinates | no | no | needed for weather | owner data |
| AI provider | **no** | no | no (deterministic reports) | not decided |
| Notifications / delivery / report time | no | no | no | not decided |
| Legacy import | no | optional (pilot may use fresh data) | yes | Gate D |
| Legacy write freeze | no | no | yes | Gate D/E |

No hidden coupling: the pending schema works with Auth empty, no Edge Function, no loader and no AI.

## 16. Weather readiness (schema side)

Safe to apply without the loader: no migration calls a provider; no render path or RPC fetches anything (the loader is a local-only Node script that refuses non-local targets);
no scheduler/cron/`pg_net` object is created; a branch without coordinates yields `unavailable / missing_branch_location` (nothing guessed; `branch_locations` ships empty); forecast
snapshots (append-only) and historical `external_context_daily` (with provenance, Open-Meteo archive = reanalysis, never observed) stay separate and a forecast never becomes history;
`weather_settings` TTL 60 min is a technical default (5–1440, audited change). Real coordinates stay an owner-controlled step.

## 17. Procurement readiness

Verified by the 256-assertion suite + 15-assertion concurrency suite and by the post-apply row counts (all 0): no suppliers/supply params/orders seeded; inactive suppliers refuse new orders;
`procurement.order.receive` is a separate permission (default owner/manager/branch_manager; generic `inventory.receive` unchanged); the owner decision "self-approval allowed" is recorded; a reversed receipt never
reopens an order (reconciliation warning); receiving writes ordinary append-only ledger RECEIPT movements under row lock (no stock duplication); **the schema apply creates no order and no stock movement.**

## 18. Manager report readiness

No AI provider, key or function and no report persistence table are required; `get_manager_report_inputs` is read-only (STABLE, invoker) and enforces the permission intersection (section 5); a historical report never
substitutes today's live state; the exact / partial / live reproducibility semantics are computed from evidence origin and need no production write.

## 19. Legacy import gate

Not part of Phase 2A. Rule (unchanged): freeze → identical audits → fingerprint F → exact dry-run → owner approval of F → import. **The pending schema apply can occur before the import:** the importer
(`20261001204651_legacy_sales_import`) is already in production; the pending chain adds objects and touches no table the importer reads or writes (`sales_reports`, `shifts`, `legacy_*`);
the legacy source is read-only for the importer. The apply does not change the source fingerprint (legacy tables are untouched). It must still happen BEFORE the freeze/fingerprint window, not inside it.

## 20. Pilot plan (not executed; no dates or users chosen)

Base: `docs/PRODUCTION_PILOT_PLAN.md`. Shape: schema apply (Gate A) → owner bootstrap (Gate B) → Edge Functions → tiny controlled cohort from `identity-data/approved_staff.csv`, one branch, one role set →
read-heavy first (dashboard, reports, inventory views), then limited writes (reports, counts) → legacy kept authoritative and available → compare V4 output against legacy for the same business days.
- **Entry criteria:** Gate A+B approved and evidenced; fresh verified backup; post-apply verification PASS; legacy smoke PASS; the pilot frontend restricted per `PRODUCTION_PILOT_FRONTEND.md`.
- **Success criteria:** V4 finalized revenue equals legacy Z for every compared day (X never added), reconciliation outcomes match, no cross-branch visibility for the pilot role, no unexpected audit/error rows.
- **Stop conditions / rollback triggers:** any data-integrity discrepancy, any cross-branch leak, any legacy regression, login failure for the cohort, any unexplained write — PAUSE; two or one integrity trigger — ROLLBACK (`PRODUCTION_ROLLBACK_RUNBOOK.md`).
- **Observation period:** to be set by the owner (not chosen here).

## 21. Owner approval gates (each independently approvable)

| Gate | Operation | Evidence required first |
|---|---|---|
| **A** | production schema apply of the 9 migrations ONLY: fresh T-60 backup, fresh baseline, final collision check/dry-run, explicit owner approval (incl. the analytics threshold decision), the nine schema migrations, read-only verification. NOT Auth bootstrap, Edge Functions, PIN creation, legacy import, Vercel deployment, loader/scheduler or business configuration | this audit, fresh T-60 backup + T-0 baseline (no old baseline qualifies), dry-run (section 13), owner approval of the exact version list |
| **B** | Auth / owner bootstrap + Edge Function deploy | post-A verification, backup, approved owner identity |
| **C** | pilot writes (PIN cohort, limited write paths) | B evidenced, pilot plan accepted |
| **D** | legacy import | freeze, identical audits, fingerprint F, exact dry-run, owner approval of F |
| **E** | frontend cutover | pilot success, import verified, rollback rehearsed |
| **F** | weather loader / scheduler enablement | real coordinates, hosting decision |
| **G** | legacy retirement | stable V4 period, final legacy export |

## 22. Production apply runbook (prepared, not executed)

`docs/PRODUCTION_APPLY_RUNBOOK.md`.

## 23. Post-apply verification plan

Capture `baseline_post.json` with the same read-only query, then:
`node supabase/audit/verify_post_apply.mjs baseline_pre.json baseline_post.json` must print `failed=0`. It proves: exactly the 9 migrations added and none removed; every count delta equals the expected delta; exactly the expected objects added and none dropped; only the 3
expected existing objects changed and no legacy object changed; legacy row counts did not shrink; Auth 0/0/0 and unchanged; storage, extensions and `authenticator` settings identical; the 8 expected seed rows exist and no other V4 row count moved (no user, order, stock movement, report); definer
hygiene clean; the only new anon-executable functions are the 9 expected helpers. Plus manual: legacy anon `GET daily_reports` still HTTP 206; legacy PWA still served; **no app deployment occurred**.

## 24. Tests (this phase)

Documentation/readiness tooling and one migration hardening (view privileges) changed, so the full local regression was run on a fresh reset: see the final report (exact totals).

## 25. Open owner decisions

1. Approve Gate A (the apply) and the T-60 maintenance window, or hold. 2. **Gate A:** accept the nine analytics thresholds of section 8a as provisional business/risk defaults (or supply values first); forecast TTL 60 is a technical default (review at Gate F). 3. Apply strategy (section 14b recommends Option A, one controlled apply of all nine; owner decides). 4. Auth dashboard settings (signup off, JWT expiry, SMTP) — record at T-24h.
5. Real branch coordinates (needed only for weather). 6. AI provider/budget, delivery channel/time (not needed for the apply). 7. Retention of forecast snapshots. 8. Observation period and cohort for the pilot.

## 26. Blockers

**None for READY WITH OWNER DECISIONS.** The apply itself needs only the owner's Gate A approval and a fresh verified backup. One hardening finding (anon privileges on two analytics views) was fixed in the unapplied migration.

## 27. Risks

- Legacy keeps changing: baselines must be recaptured at T-0 (counts drift, e.g. 547 → 549).
- The migration edit (view privileges) makes `20261006000100` differ from the version previously reviewed; production never saw the old version, so no history mismatch exists.
- `pending_chain_rollback.sql` is only valid before first use; after business writes the only rollback is the restore.
- Hosted behaviours not observable read-only (Auth dashboard settings, PITR, Vercel env) remain UNKNOWN until recorded.
- Anonymous REST probes of empty V4 tables are inconclusive; RLS evidence is the SQL role suites.
- PostgREST schema-cache reload after DDL is automatic on Supabase (observed on 2026-10-06 without incident).

## 28. Files added / changed by this phase

`supabase/audit/{production_baseline_readonly.sql, compare_baselines.mjs, pending_chain_collision_check_readonly.sql, verify_post_apply.mjs, expected_pending_chain_delta.json}`,
`supabase/rollback/pending_chain_rollback.sql`, `docs/baselines/production_baseline_2026-10-07.json`, `docs/PRODUCTION_READINESS_2026-10-07.md`,
`docs/PRODUCTION_APPLY_RUNBOOK.md`, `supabase/migrations/20261006000100_analytics_engine_v1.sql` (view privilege hardening), `CURRENT_STATE.md`, `BACKLOG.md`.

## Verdict

**READY WITH OWNER DECISIONS.** Production is unchanged and healthy; the pending chain is complete, ordered, collision-free, additive, legacy-neutral and verified by exact baselines; backup, dry-run, apply, verification and rollback are prepared. Nothing proceeds without Gate A.
