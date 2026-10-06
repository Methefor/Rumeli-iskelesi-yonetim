# Production schema apply evidence — 2026-10-06

Evidence only: no secrets, PINs, keys, signed URLs or dump contents. Backup files stay outside the repository.

| Item | Value |
|---|---|
| Project ref | `iwikwbjsznjuefvuemdb` |
| Repo | branch `v4-2027`, HEAD `53006d897f028830bb636a380a6054b6c3dc23a1` (equal to `origin/v4-2027`, clean tree) at apply time |
| Tool | Supabase CLI 2.117.0 |
| Production writes | **schema migrations only** (`supabase db push --linked --include-all`, run by the owner in their own terminal) |

## Owner approval scope

Approved: the production schema apply of exactly the 24 V4 migrations, conditional on (1) a fresh T-60 backup,
(2) a final `db push --linked --dry-run --include-all` proposing exactly those 24, no migration repair and no
history mirror, (3) only then the live apply.

NOT included: legacy data import, Auth provisioning, owner bootstrap, PIN provisioning, operating-data apply,
Edge Function deploy, Vercel changes, pilot/cutover, legacy write freeze, migration repair, any other production write.

Because the assistant's auto-mode blocks production deploy commands, responsibilities were split: the assistant
performed the pre-flight, the T-60 backup, the read-only checks and the dry-run, and the owner ran the live push
manually. The assistant then verified read-only.

## T-60 backup (taken immediately before the apply)

Directory (off-repo, not committed): `C:\projects\Rumeli-iskelesi-yonetim-backups\20261006-030842-T60-schema-apply`.
Taken about 2026-10-06T00:08-00:10Z (03:08 local).

| File | Bytes | SHA-256 |
|---|---:|---|
| `roles.sql` | 297 | `25873cec56a2cc6514e204f420231777f85c03da818caa7090cdcdfa89776ecd` |
| `schema.sql` | 22 210 | `51223df392ac3c52c137fa8e600e95d3865344ff13abbdab9825b46342bb86f2` |
| `data.sql` | 220 813 | `ba25364f2a1156a134d0a5f18b6ad64442150c5929a5eed72029b97985a0fa01` |

- `data.sql` differs from the earlier 02:38 backup only by pg_dump's random restrict-token comment lines; the data is identical.
- Dump row counts equal production at backup time (below). Storage: 1 object in production, 1 downloaded,
  535 312 bytes, SHA-256 `80a8d0ecc5cb8600aaea722c4f93f13695c1252d25c402ded6a86ef00d7651e7`.
- Auth at backup time: 0 users, 0 identities, 0 sessions.
- One `roles.sql` run was cut short by the operator shell and left an empty file; it was discarded and re-run, the final file is the one hashed above.

## Pre-apply state and final dry-run

Legacy tables, views and functions present; no V4 object; `pgrst.db_pre_request` not set; migration history held
only `20260611233031`. The final `db push --linked --dry-run --include-all` proposed exactly the 24 migrations
below, did not propose `20260611233031_add_kategori_devri`, and proposed no repair.

## Applied migrations (24 V4)

1. `001_profiles_roles`
2. `002_permissions`
3. `003_branches_memberships`
4. `004_audit_logs`
5. `005_auth_helpers`
6. `006_rls_policies`
7. `007_storage_policies`
8. `008_admin_rpcs`
9. `009_operational_core`
10. `010_operational_rls`
11. `011_operational_rpcs`
12. `012_inventory_core`
13. `013_inventory_rls`
14. `014_inventory_rpcs`
15. `015_sales_backdated_policy`
16. `016_management_center`
17. `017_operating_data_loader`
18. `018_operating_data_mapping_removals`
19. `20260930231709_cashier_receipt_access`
20. `20261001000111_shift_change_requests`
21. `20261001204651_legacy_sales_import`
22. `20261005000100_bootstrap_owner`
23. `20261005000200_reconciliation_origin`
24. `20261005000300_final_hardening`

Pre-existing and not re-applied: `20260611233031 add_kategori_devri` (history mirror, no-op).

Owner-reported result: `migration list` shows all 24 remote plus the pre-existing one; a subsequent dry-run and a
second live push both returned "Remote database is up to date" and made no additional changes.

## Post-apply verification (read-only; assistant)

| Check | Result |
|---|---|
| Migration history | 25 rows = 24 V4 + `20260611233031`; nothing unexpected. **PASS** |
| Legacy objects | all 8 tables, both views (`daily_performance`, `weekly_performance`), 4 functions, 2 triggers, 14 policies present; `kategori_devri` present. **PASS** |
| V4 footprint | public tables 38, views 5, functions 78 = 30 / 3 / 74 V4 plus 8 / 2 / 4 legacy, as reviewed. **PASS** |
| SECURITY DEFINER hygiene | 68 definer functions: 0 without a locked `search_path`, 0 executable by PUBLIC. **PASS** |
| Auth | `auth.users` 0, `auth.identities` 0, `auth.sessions` 0; schema apply created no users. **PASS** |
| Owner / PIN | `profiles` 0, `user_roles` 0 (no owner), `pin_credentials` 0; no `owner_bootstrap` / `owner_pin_rotated` audit rows; functions exist, never executed. **PASS** |
| Legacy import | `legacy_sales_import_runs` 0, `legacy_sales_report_links` 0, `legacy_cashier_profile_map` 0, `sales_reports` 0, shifts 0, registers 0; no `legacy_sales_import_applied` audit event. **PASS** |
| Operating data | infrastructure only: 3 branches, 4 shift definitions, 10 categories, 12 category-branch links, 2 thresholds, 6 roles, 21 permissions, 31 provenance rows; 0 operating-data audit events (runner never executed). **PASS** |
| Storage | `avatars` bucket (public) and its single 535 312-byte object intact, with its two legacy policies; `avatars-v4` created (public, 2 MiB, jpeg/png/webp) with its 4 `avatars_v4_*` policies, as the migration intends. **PASS** |
| PostgREST hook | authenticator setting is `pgrst.db_pre_request=public.enforce_active_user` (existing `safeupdate` and 8 s timeouts intact). **PASS** |
| Legacy anon API | the legacy anonymous read of `daily_reports` through the API succeeds (547 rows, X 268 / Z 279); no API-wide failure. **PASS** |
| `internal_*` exposure | all 12 `internal_*` functions (including `internal_bootstrap_owner` and `internal_rotate_owner_pin`) are executable by service_role only, not by anon, authenticated or PUBLIC. **PASS** |

### Legacy row counts (production now = T-60 backup)

| Table | Rows |
|---|---:|
| `daily_reports` | 547 |
| `entry_history` | 215 |
| `shift_schedule` | 19 |
| `cashiers` | 5 |
| `targets` | 3 |
| `achievements` | 2 |
| `admins` | 1 |
| `daily_revenue` | 0 |
| view `weekly_performance` | 5 |
| view `daily_performance` | 0 (1 at the earlier check; a time-dependent view over identical underlying data, not schema damage) |

No legacy write happened between the T-60 backup and the verification.

## Verdict

**SCHEMA APPLY = COMPLETE.** DATA APPLY = NOT READY. PILOT/CUTOVER = NOT READY.
The legacy application was not affected: side-by-side operation is intact.

## Not performed (all still unapproved)

Legacy data import, Auth provisioning, owner bootstrap, PIN provisioning, operating-data apply, Edge Function deploy,
Vercel changes, pilot/cutover, legacy write freeze, migration repair.

## Remaining gates

1. Owner bootstrap and identity provisioning (`identity-data/`, separate owner approval; fresh backup first).
2. Edge Function deploy (`pin-login` and the management functions; hosted secrets).
3. Operating-data apply through the guarded runner (dry run, review, apply).
4. Legacy write freeze, a stable final fingerprint, approved private identity mapping, then the legacy import (dry run, owner-approved fingerprint, apply, post-apply SQL pack).
5. Restricted pilot frontend creation, pilot execution with real mobile/device QA, then cutover with explicit owner approval.
6. Not captured in any backup so far: dashboard Auth configuration and PITR/retention (record at T-24h).

## Hosted behaviour observed in production

Hosted behaviour was successfully observed on the production project during the schema apply and the immediate
post-apply verification:

- `pgrst.db_pre_request` was applied and legacy anonymous API access remained functional.
- V4 Storage policies were created successfully without modifying the legacy `avatars` bucket or its policies.
- The PostgREST configuration reload completed without an observed service-wide failure.

These behaviours are now production-observed rather than staging-unrehearsed. Longer-running operational behaviour
remains subject to normal production monitoring. Hosted Edge Function behaviour and GoTrue ban/session behaviour
are still untested.
