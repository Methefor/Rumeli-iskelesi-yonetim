# Production Collision Audit — 2026-10-04

**Result: NO COLLISIONS. Production schema apply is not blocked by name collisions.**

Method: read-only `SELECT` statements against the linked production project `iwikwbjsznjuefvuemdb` (via `supabase db query --linked`, Management API) on 2026-10-04, compared with the object inventory of a fresh **local** database built from every migration in `supabase/migrations/` (25 files: 24 V4 + the history mirror). Nothing was written to production. `supabase db push --linked --dry-run --include-all` (also read-only) confirmed that exactly the 24 V4 migrations would be applied.

## Production inventory (read-only)

| Item | Production state |
|---|---|
| Remote migration history | 1 entry: `20260611233031 add_kategori_devri` (legacy `daily_reports` column). No V4 migration applied. |
| Schemas | auth, extensions, graphql, graphql_public, pgbouncer, public, realtime, storage, supabase_migrations, vault |
| Extensions | pg_stat_statements, pgcrypto, plpgsql, supabase_vault, uuid-ossp (V4 needs only pgcrypto — present) |
| `public` relations (12) | achievements, admins, cashiers, daily_performance (view), daily_reports, daily_revenue (+seq), entry_history, shift_schedule, targets (+seq), weekly_performance (view) — all legacy |
| `public` functions (4) | calculate_points, get_badge_level, update_cashier_badge, update_updated_at — legacy |
| `public` triggers (2) | cashier_badge_update, trg_updated_at |
| `public` indexes (21) | all legacy names (`*_pkey`, `idx_daily_reports_*`, `idx_entry_history_*`, `idx_revenue_*`, `idx_shift_schedule_*`, …) |
| Policies | 14 on legacy public tables (anon-open), 2 on `storage.objects` for bucket `avatars` (`avatars_upload 1oj01fe_*`) |
| Storage | bucket `avatars` (public), 1 object; **no `avatars-v4`** |
| Auth | `auth.users` = 0 rows |
| `authenticator` role settings | `session_preload_libraries=safeupdate`, `statement_timeout=8s`, `lock_timeout=8s`; **no** `pgrst.db_pre_request` |
| Edge Functions | none deployed |

## Tables and views (every one created by the migration chain)

| Object | Kind | Expected migration | Production status | Collision | Risk / required action |
|---|---|---|---|---|---|
| `profiles` | table | `001_profiles_roles.sql` | absent | no | none |
| `roles` | table | `001_profiles_roles.sql` | absent | no | none |
| `user_roles` | table | `001_profiles_roles.sql` | absent | no | none |
| `permissions` | table | `002_permissions.sql` | absent | no | none |
| `role_permissions` | table | `002_permissions.sql` | absent | no | none |
| `branch_memberships` | table | `003_branches_memberships.sql` | absent | no | none |
| `branches` | table | `003_branches_memberships.sql` | absent | no | none |
| `audit_logs` | table | `004_audit_logs.sql` | absent | no | none |
| `pin_credentials` | table | `005_auth_helpers.sql` | absent | no | none |
| `reconciliation_thresholds` | table | `009_operational_core.sql` | absent | no | none |
| `registers` | table | `009_operational_core.sql` | absent | no | none |
| `sales_categories` | table | `009_operational_core.sql` | absent | no | none |
| `sales_category_branches` | table | `009_operational_core.sql` | absent | no | none |
| `sales_report_items` | table | `009_operational_core.sql` | absent | no | none |
| `sales_report_overrides` | table | `009_operational_core.sql` | absent | no | none |
| `sales_reports` | table | `009_operational_core.sql` | absent | no | none |
| `shift_assignments` | table | `009_operational_core.sql` | absent | no | none |
| `shift_definitions` | table | `009_operational_core.sql` | absent | no | none |
| `shifts` | table | `009_operational_core.sql` | absent | no | none |
| `inventory_count_items` | table | `012_inventory_core.sql` | absent | no | none |
| `inventory_counts` | table | `012_inventory_core.sql` | absent | no | none |
| `inventory_item_costs` | table | `012_inventory_core.sql` | absent | no | none |
| `inventory_items` | table | `012_inventory_core.sql` | absent | no | none |
| `inventory_movements` | table | `012_inventory_core.sql` | absent | no | none |
| `operating_data_provenance` | table | `017_operating_data_loader.sql` | absent | no | none |
| `shift_change_requests` | table | `20261001000111_shift_change_requests.sql` | absent | no | none |
| `legacy_cashier_profile_map` | table | `20261001204651_legacy_sales_import.sql` | absent | no | none |
| `legacy_reference_totals` | table | `20261001204651_legacy_sales_import.sql` | absent | no | none |
| `legacy_sales_import_runs` | table | `20261001204651_legacy_sales_import.sql` | absent | no | none |
| `legacy_sales_report_links` | table | `20261001204651_legacy_sales_import.sql` | absent | no | none |
| `inventory_last_counts` | view | `012_inventory_core.sql` | absent | no | none |
| `inventory_stock_balances` | view | `012_inventory_core.sql` | absent | no | none |
| `sales_reports_with_origin` | view | `20261005000200_reconciliation_origin.sql` | absent | no | none |

## Functions (74 in the local result: 73 created + 1 renamed by 018)

All `public` function names created by the migrations were compared with production's 4 legacy functions: **0 name collisions, 0 name+signature collisions**. `create or replace function` therefore always *creates* on production; no existing function can be silently replaced.

| Migration | Functions created | Collision |
|---|---|---|
| `005_auth_helpers.sql` | 7: `current_user_branch_ids`, `current_user_has_permission`, `current_user_is_owner_or_manager`, `current_user_role_keys`, `current_user_shares_branch_with`, `verify_pin`, `write_audit_log` | none |
| `008_admin_rpcs.sql` | 7: `admin_reset_pin`, `admin_set_employee_active`, `admin_set_employee_code`, `assign_branch_membership`, `assign_role`, `remove_branch_membership`, `revoke_role` | none |
| `009_operational_core.sql` | 1: `set_updated_at` | none |
| `010_operational_rls.sql` | 2: `current_user_assigned_shift_ids`, `shift_branch_id` | none |
| `011_operational_rpcs.sql` | 11: `assign_shift`, `cancel_sales_report`, `cancel_shift`, `compute_reconciliation_status`, `create_sales_report`, `edit_sales_report`, `override_reconciliation`, `override_shift_lateness`, `reassign_shift_branch`, `schedule_shift`, `update_shift_assignment_status` | none |
| `012_inventory_core.sql` | 2: `inventory_guard_count_update`, `inventory_prevent_mutation` | none |
| `013_inventory_rls.sql` | 2: `current_user_can_inventory`, `inventory_item_branch_id` | none |
| `014_inventory_rpcs.sql` | 19: `get_inventory_gross_profit`, `inventory_apply_sales_lines`, `inventory_effective_cost`, `inventory_insert_movement`, `inventory_parse_lines`, `inventory_resolve_shift_context`, `inventory_reverse_sales_lines`, `inventory_set_cost_internal`, `inventory_stock_quantity`, `record_inventory_adjustment`, `record_inventory_receipt`, `record_inventory_waste`, `reverse_inventory_movement`, `sales_report_write_items`, `set_inventory_item_active`, `set_inventory_item_cost`, `submit_inventory_count`, `upsert_inventory_item`, `void_inventory_count` | none |
| `016_management_center.sql` | 11: `admin_guard_last_owner`, `admin_guard_target`, `admin_set_reconciliation_thresholds`, `admin_update_shift_definition`, `current_user_is_active`, `current_user_rank`, `enforce_active_user`, `internal_actor_rank`, `internal_provision_employee`, `role_rank`, `user_rank` | none |
| `017_operating_data_loader.sql` | 4: `internal_od_apply`, `internal_od_provenance`, `internal_od_result`, `internal_run_operating_data` | none |
| `018_operating_data_mapping_removals.sql` | 1: `internal_od_remove_mappings` | none |
| `20261001000111_shift_change_requests.sql` | 2: `create_shift_change_request`, `decide_shift_change_request` | none |
| `20261001204651_legacy_sales_import.sql` | 2: `internal_apply_legacy_sales`, `internal_run_legacy_sales_import` | none |
| `20261005000100_bootstrap_owner.sql` | 1: `internal_bootstrap_owner` | none |
| `20261005000300_final_hardening.sql` | 1: `internal_rotate_owner_pin` (+ `create or replace` of `internal_run_legacy_sales_import`, `override_reconciliation`) | none |

## Indexes, triggers, policies

| Class | V4 objects | Production objects | Name collisions |
|---|---:|---:|---:|
| `public` indexes | 83 | 21 | 0 |
| `public` triggers | 17 | 2 | 0 |
| policies (public + storage) | 40 | 16 | 0 |

V4 storage policies are `avatars_v4_select/insert/update/delete` on `storage.objects`; production's two `avatars_upload 1oj01fe_*` policies govern only the legacy `avatars` bucket and do not overlap by name.

## Storage, Auth and platform configuration

| Object | Expected migration | Production status | Collision | Risk | Required action |
|---|---|---|---|---|---|
| bucket `avatars-v4` | `007_storage_policies.sql` | absent | no | none | created by migration 007; legacy bucket `avatars` is never touched |
| `authenticator` `pgrst.db_pre_request` | `016_management_center.sql` | unset | no | **Medium (platform, not name)**: the hook runs on EVERY Data API request including the LEGACY app. A missing/broken hook function would break the legacy app. | Verify `public.enforce_active_user` exists immediately after 016 (cutover step) and keep the emergency reset (`alter role authenticator reset pgrst.db_pre_request; notify pgrst, 'reload config';`) as rollback step 0. Anonymous legacy calls have `auth.uid()` NULL and pass the hook (rehearsed locally). |
| Edge Functions `pin-login`, `employee-provision` | — | none deployed | no | none | deploy only at the approved Edge step |
| Auth hooks / custom claims | — | none used by V4 (login mints sessions through `generateLink`/`verifyOtp`) | no | none | confirm public signup is disabled in the dashboard before provisioning (manual gate) |
| `supabase_migrations` history | local `20260611233031_add_kategori_devri.sql` mirror | remote has this version | no (intentional match) | **High if ignored**: without the mirror file `db push` aborts with `LegacyDbPushMissingLocalError`; the only alternative is rewriting production history (`migration repair`). | The mirror file added in this phase makes history agree; push needs `--include-all` because it sorts before the V4 timestamps. |

## Not verifiable without a write

These hosted-only behaviours cannot be proven read-only and are covered by STOP gates in the cutover runbook (hosted staging was deliberately deferred on 2026-09-26): `alter role authenticator set …` permission for the migration role; creating policies on `storage.objects` and inserting into `storage.buckets` from a migration; GoTrue admin `ban_duration`; Edge Function secrets; `statement_timeout` during large migrations.

## Verdict

Zero object-name collisions across tables, views, functions, triggers, indexes, policies and storage buckets. **Production migration is NOT blocked by collisions.** It remains blocked by the other open gates in `PRODUCTION_READINESS.md`.
