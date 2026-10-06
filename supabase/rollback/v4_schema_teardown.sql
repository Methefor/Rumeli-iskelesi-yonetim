-- =============================================================================
-- supabase/rollback/v4_schema_teardown.sql
-- =============================================================================
-- EMERGENCY / ROLLBACK ONLY. Removes every V4 object created by the migration
-- chain in supabase/migrations/ (36 tables, 5 views, 102 functions, the avatars_v4
-- storage policies and the PostgREST pre-request hook) and NOTHING ELSE.
-- Legacy objects (daily_reports, cashiers, admins, entry_history, shift_schedule,
-- targets, achievements, daily_revenue, daily_performance, weekly_performance and
-- their functions/triggers/policies) are never referenced.
--
-- DESTRUCTIVE: all V4 data (including imported reports) is deleted. It is locked
-- by default. Running it against production REQUIRES EXPLICIT OWNER APPROVAL
-- BEFORE EXECUTION; only then remove the guard block below. Verified locally by
-- supabase/tests/schema_teardown.test.mjs with decoy legacy tables that survive.
--
-- NOT done here (see docs/PRODUCTION_ROLLBACK_RUNBOOK.md): Auth users (Admin API),
-- the avatars-v4 bucket (Storage API; hosted storage blocks SQL deletes) and
-- supabase_migrations history rows (supabase migration repair).
-- =============================================================================

-- >>> LOCK GUARD (delete these lines only with explicit owner approval) >>>
do $$ begin raise exception 'V4 teardown is locked: remove the guard block only with explicit owner approval'; end $$;
-- <<< LOCK GUARD <<<

begin;

-- 0. Stop the Data API from calling a function that is about to disappear. This is
--    the FIRST step of any rollback because the hook runs on every request,
--    including the legacy app's.
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';

drop policy if exists "avatars_v4_delete" on storage.objects;
drop policy if exists "avatars_v4_insert" on storage.objects;
drop policy if exists "avatars_v4_select" on storage.objects;
drop policy if exists "avatars_v4_update" on storage.objects;

-- 1. Views, then tables (CASCADE removes their triggers, policies, indexes and FKs).
drop view if exists public.daily_analytics_current cascade;
drop view if exists public.weekly_analytics_current cascade;
drop view if exists public.inventory_last_counts cascade;
drop view if exists public.inventory_stock_balances cascade;
drop view if exists public.sales_reports_with_origin cascade;
drop table if exists public.analytics_insights cascade;
drop table if exists public.analytics_reports cascade;
drop table if exists public.analytics_settings cascade;
drop table if exists public.daily_analytics_snapshots cascade;
drop table if exists public.external_context_daily cascade;
drop table if exists public.weekly_analytics_snapshots cascade;
drop table if exists public.audit_logs cascade;
drop table if exists public.branch_memberships cascade;
drop table if exists public.branches cascade;
drop table if exists public.inventory_count_items cascade;
drop table if exists public.inventory_counts cascade;
drop table if exists public.inventory_item_costs cascade;
drop table if exists public.inventory_items cascade;
drop table if exists public.inventory_movements cascade;
drop table if exists public.legacy_cashier_profile_map cascade;
drop table if exists public.legacy_reference_totals cascade;
drop table if exists public.legacy_sales_import_runs cascade;
drop table if exists public.legacy_sales_report_links cascade;
drop table if exists public.operating_data_provenance cascade;
drop table if exists public.permissions cascade;
drop table if exists public.pin_credentials cascade;
drop table if exists public.profiles cascade;
drop table if exists public.reconciliation_thresholds cascade;
drop table if exists public.registers cascade;
drop table if exists public.role_permissions cascade;
drop table if exists public.roles cascade;
drop table if exists public.sales_categories cascade;
drop table if exists public.sales_category_branches cascade;
drop table if exists public.sales_report_items cascade;
drop table if exists public.sales_report_overrides cascade;
drop table if exists public.sales_reports cascade;
drop table if exists public.shift_assignments cascade;
drop table if exists public.shift_change_requests cascade;
drop table if exists public.shift_definitions cascade;
drop table if exists public.shifts cascade;
drop table if exists public.user_roles cascade;

-- 2. Functions (exact signatures).
drop function if exists public.admin_guard_last_owner(p_target uuid);
drop function if exists public.admin_guard_target(p_target uuid, p_reason text, p_branch_id uuid);
drop function if exists public.admin_reset_pin(p_user_id uuid, p_new_pin text, p_reason text);
drop function if exists public.admin_set_employee_active(p_user_id uuid, p_is_active boolean, p_reason text);
drop function if exists public.admin_set_employee_code(p_user_id uuid, p_employee_code text, p_reason text);
drop function if exists public.admin_set_reconciliation_thresholds(p_branch_id uuid, p_warning numeric, p_error numeric, p_reason text);
drop function if exists public.admin_update_shift_definition(p_id uuid, p_name text, p_start_hour smallint, p_start_minute smallint, p_end_hour smallint, p_end_minute smallint, p_cutoff_hour smallint, p_cutoff_minute smallint, p_cutoff_day_offset smallint, p_is_active boolean, p_reason text);
drop function if exists public.assign_branch_membership(p_user_id uuid, p_branch_id uuid, p_is_primary boolean, p_reason text);
drop function if exists public.assign_role(p_user_id uuid, p_role_key text, p_reason text);
drop function if exists public.assign_shift(p_shift_id uuid, p_user_id uuid, p_reason text);
drop function if exists public.cancel_sales_report(p_report_id uuid, p_reason text);
drop function if exists public.cancel_shift(p_shift_id uuid, p_reason text);
drop function if exists public.compute_reconciliation_status(p_expected numeric, p_actual numeric, p_branch_id uuid);
drop function if exists public.create_sales_report(p_shift_id uuid, p_register_id uuid, p_report_type text, p_gross_revenue numeric, p_transaction_count integer, p_average_basket numeric, p_notes text, p_items jsonb, p_backdated_reason text);
drop function if exists public.create_shift_change_request(p_current_assignment_id uuid, p_requested_shift_id uuid, p_reason text);
drop function if exists public.current_user_assigned_shift_ids();
drop function if exists public.current_user_branch_ids();
drop function if exists public.current_user_can_inventory(p_permission_key text, p_branch_id uuid);
drop function if exists public.current_user_has_permission(p_permission_key text);
drop function if exists public.current_user_is_active();
drop function if exists public.current_user_is_owner_or_manager();
drop function if exists public.current_user_rank();
drop function if exists public.current_user_role_keys();
drop function if exists public.current_user_shares_branch_with(p_user_id uuid);
drop function if exists public.decide_shift_change_request(p_request_id uuid, p_decision text, p_decision_note text);
drop function if exists public.edit_sales_report(p_report_id uuid, p_gross_revenue numeric, p_transaction_count integer, p_average_basket numeric, p_notes text, p_items jsonb, p_reason text);
drop function if exists public.enforce_active_user();
drop function if exists public.get_inventory_gross_profit(p_branch_id uuid, p_from timestamp with time zone, p_to timestamp with time zone);
drop function if exists public.internal_actor_rank(p_actor uuid);
drop function if exists public.internal_apply_legacy_sales(p_actor uuid, p_rows jsonb, p_cashier_map jsonb, p_source_fingerprint text, p_reason text);
drop function if exists public.internal_bootstrap_owner(p_user_id uuid, p_employee_code text, p_full_name text, p_pin text, p_reason text);
drop function if exists public.internal_od_apply(p_actor uuid, p_payload jsonb, p_dataset text);
drop function if exists public.internal_od_apply_core(p_actor uuid, p_payload jsonb, p_dataset text);
drop function if exists public.internal_od_provenance(p_type text, p_key text, p_class text, p_approval text, p_source text, p_dataset text, p_note text);
drop function if exists public.internal_od_remove_mappings(p_actor uuid, p_payload jsonb, p_dataset text);
drop function if exists public.internal_od_result(p_group text, p_row integer, p_key text, p_status text, p_message text);
drop function if exists public.internal_provision_employee(p_actor uuid, p_user_id uuid, p_employee_code text, p_full_name text, p_pin text, p_role_key text, p_branch_ids uuid[], p_reason text);
drop function if exists public.internal_rotate_owner_pin(p_employee_code text, p_pin text, p_reason text, p_executor_label text);
drop function if exists public.internal_run_legacy_sales_import(p_actor_code text, p_rows jsonb, p_cashier_map jsonb, p_source_fingerprint text, p_reason text, p_commit boolean);
drop function if exists public.internal_run_operating_data(p_actor_code text, p_payload jsonb, p_commit boolean);
drop function if exists public.inventory_apply_sales_lines(p_report_id uuid);
drop function if exists public.inventory_effective_cost(p_item_id uuid, p_at timestamp with time zone);
drop function if exists public.inventory_guard_count_update();
drop function if exists public.inventory_insert_movement(p_item_id uuid, p_movement_type text, p_quantity numeric, p_shift_id uuid, p_sales_report_id uuid, p_count_id uuid, p_reason_code text, p_reason text, p_reference text, p_reverses_movement_id uuid);
drop function if exists public.inventory_item_branch_id(p_item_id uuid);
drop function if exists public.inventory_parse_lines(p_lines jsonb, p_qty_key text);
drop function if exists public.inventory_prevent_mutation();
drop function if exists public.inventory_resolve_shift_context(p_shift_id uuid, p_branch_id uuid);
drop function if exists public.inventory_reverse_sales_lines(p_report_id uuid, p_reason text);
drop function if exists public.inventory_set_cost_internal(p_item_id uuid, p_unit_cost numeric, p_effective_from timestamp with time zone, p_reason text);
drop function if exists public.inventory_stock_quantity(p_item_id uuid);
drop function if exists public.override_reconciliation(p_report_id uuid, p_new_status text, p_reason text);
drop function if exists public.override_shift_lateness(p_assignment_id uuid, p_is_on_time boolean, p_reason text);
drop function if exists public.reassign_shift_branch(p_shift_id uuid, p_new_branch_id uuid, p_reason text);
drop function if exists public.record_inventory_adjustment(p_item_id uuid, p_direction text, p_quantity numeric, p_reason text, p_count_id uuid);
drop function if exists public.record_inventory_receipt(p_branch_id uuid, p_lines jsonb, p_reference text, p_note text);
drop function if exists public.record_inventory_waste(p_branch_id uuid, p_lines jsonb, p_reason_code text, p_note text, p_shift_id uuid);
drop function if exists public.remove_branch_membership(p_user_id uuid, p_branch_id uuid, p_reason text);
drop function if exists public.reverse_inventory_movement(p_movement_id uuid, p_reason text);
drop function if exists public.revoke_role(p_user_id uuid, p_role_key text, p_reason text);
drop function if exists public.role_rank(p_key text);
drop function if exists public.sales_report_write_items(p_report_id uuid, p_branch_id uuid, p_items jsonb);
drop function if exists public.schedule_shift(p_branch_id uuid, p_shift_definition_id uuid, p_business_date date, p_reason text);
drop function if exists public.set_inventory_item_active(p_item_id uuid, p_is_active boolean, p_reason text);
drop function if exists public.set_inventory_item_cost(p_item_id uuid, p_unit_cost numeric, p_effective_from timestamp with time zone, p_reason text);
drop function if exists public.set_updated_at();
drop function if exists public.shift_branch_id(p_shift_id uuid);
drop function if exists public.submit_inventory_count(p_branch_id uuid, p_shift_id uuid, p_items jsonb, p_note text);
drop function if exists public.update_shift_assignment_status(p_assignment_id uuid, p_new_status text, p_reason text);
drop function if exists public.upsert_inventory_item(p_item_id uuid, p_branch_id uuid, p_code text, p_name text, p_unit text, p_allows_decimal boolean, p_sales_category_id uuid, p_reason text);
drop function if exists public.user_rank(p_user_id uuid);
drop function if exists public.verify_pin(p_user_id uuid, p_pin text);
drop function if exists public.void_inventory_count(p_count_id uuid, p_reason text);
drop function if exists public.write_audit_log(p_action text, p_entity_type text, p_entity_id text, p_old_values jsonb, p_new_values jsonb, p_reason text);
drop function if exists public.analytics_block_mutation();
drop function if exists public.analytics_build_daily(p_branch_id uuid, p_date date);
drop function if exists public.analytics_build_weekly(p_branch_id uuid, p_week_start date);
drop function if exists public.analytics_can(p_permission_key text, p_branch_id uuid);
drop function if exists public.analytics_cap(p_status text, p_reasons text[]);
drop function if exists public.analytics_compare(p_current numeric, p_baseline numeric, p_baseline_has_data boolean, p_low_base numeric, p_samples integer, p_min_samples integer, p_current_final boolean, p_baseline_final boolean, p_mixed boolean, p_block_mixed boolean);
drop function if exists public.analytics_completeness(p_caps jsonb, p_has_data boolean);
drop function if exists public.analytics_compute_day(p_branch_id uuid, p_date date);
drop function if exists public.analytics_context_for(p_branch_id uuid, p_date date);
drop function if exists public.analytics_internal_source_latest_at(p_branch_id uuid, p_from date, p_to date);
drop function if exists public.analytics_metric(p_state text, p_value numeric, p_reason text);
drop function if exists public.analytics_origin_mixed(p_a text, p_b text);
drop function if exists public.analytics_params();
drop function if exists public.analytics_redact(p_payload jsonb, p_financial boolean);
drop function if exists public.analytics_source_latest_at(p_branch_id uuid, p_from date, p_to date);
drop function if exists public.analytics_weather_effect(p_branch_id uuid, p_from date, p_to date);
drop function if exists public.analytics_week_totals(p_days jsonb, p_week_complete boolean);
drop function if exists public.analytics_write_daily_insights(p_snapshot_id uuid, p_branch_id uuid, p_date date, p_payload jsonb);
drop function if exists public.analytics_write_weekly_insights(p_snapshot_id uuid, p_branch_id uuid, p_week date, p_payload jsonb);
drop function if exists public.get_daily_analytics(p_branch_id uuid, p_date date);
drop function if exists public.get_weekly_analytics(p_branch_id uuid, p_week_start date);
drop function if exists public.internal_generate_daily_analytics(p_branch_id uuid, p_date date, p_kind text, p_actor uuid, p_reason text);
drop function if exists public.internal_generate_weekly_analytics(p_branch_id uuid, p_week_start date, p_kind text, p_actor uuid, p_reason text);
drop function if exists public.internal_save_analytics_report(p_weekly_snapshot_id uuid, p_status text, p_input_facts jsonb, p_output jsonb, p_model text, p_error_code text, p_actor uuid);
drop function if exists public.regenerate_daily_analytics(p_branch_id uuid, p_date date, p_reason text);
drop function if exists public.regenerate_weekly_analytics(p_branch_id uuid, p_week_start date, p_reason text);
drop function if exists public.update_analytics_settings(p_values jsonb, p_reason text);
drop function if exists public.upsert_external_context_daily(p_context_date date, p_branch_id uuid, p_values jsonb, p_reason text);

-- 3. Post-condition: no V4 object may remain in public.
do $$
declare v_left text;
begin
  select string_agg(c.relname, ', ') into v_left
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m','p')
    and c.relname in ('analytics_insights', 'analytics_reports', 'analytics_settings', 'daily_analytics_current', 'daily_analytics_snapshots', 'external_context_daily', 'weekly_analytics_current', 'weekly_analytics_snapshots', 'audit_logs', 'branch_memberships', 'branches', 'inventory_count_items', 'inventory_counts', 'inventory_item_costs', 'inventory_items', 'inventory_movements', 'legacy_cashier_profile_map', 'legacy_reference_totals', 'legacy_sales_import_runs', 'legacy_sales_report_links', 'operating_data_provenance', 'permissions', 'pin_credentials', 'profiles', 'reconciliation_thresholds', 'registers', 'role_permissions', 'roles', 'sales_categories', 'sales_category_branches', 'sales_report_items', 'sales_report_overrides', 'sales_reports', 'shift_assignments', 'shift_change_requests', 'shift_definitions', 'shifts', 'user_roles', 'inventory_last_counts', 'inventory_stock_balances', 'sales_reports_with_origin');
  if v_left is not null then raise exception 'teardown incomplete: %', v_left; end if;
end $$;

commit;
notify pgrst, 'reload schema';
