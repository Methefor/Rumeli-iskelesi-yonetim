-- =============================================================================
-- supabase/rollback/pending_chain_rollback.sql
-- =============================================================================
-- PREFIX-AWARE SCHEMA ROLLBACK OF THE 9 PENDING MIGRATIONS (20261006000100 .. 20261007000100), BEFORE FIRST USE.
-- It works for ANY applied prefix 1..9 of the chain (a failed `db push` leaves a successfully applied prefix because every migration file is its own
-- transaction): it detects the exact installed prefix, refuses an inconsistent one, and removes ONLY the pending-chain objects that actually exist,
-- restoring the three existing objects the chain alters (inventory_movements reason CHECK, record_inventory_waste, branches) only when the migration that altered
-- them is part of the prefix. Result: the schema equals the 25-migration production schema exactly. It does NOT touch the previously applied V4 schema,
-- any legacy object, Auth or Storage, and it is NOT v4_schema_teardown.sql (which removes ALL of V4).
--
-- SCHEMA ROLLBACK ONLY. It reads supabase_migrations.schema_migrations (to cross-check the prefix) but NEVER modifies it. Afterwards the history still lists the
-- applied versions; reconciling it (`supabase migration repair --status reverted <versions>`) is a SEPARATE, separately approved production write.
--
-- DISARMED as committed: the first statement of the transaction aborts unless the owner sets v_armed to the required token (after written approval).
-- All preconditions are checked BEFORE the first destructive statement; there is no DROP ... CASCADE (a hidden dependency makes the whole transaction fail
-- and roll back). One transaction; any failure changes nothing.
--
-- VALID ONLY BEFORE FIRST USE. Preconditions abort the script as soon as ANY existing pending table holds business data, a seeded setting was changed, any
-- waste reason other than the six seeded ones exists, any WASTE movement uses a reason code outside the original six, or a branch time zone was changed.
-- After business writes the correct rollback is a RESTORE from the verified backup, never this script.
--
-- DESTRUCTIVE: it drops the pending tables and the seeded configuration rows. Running it against production REQUIRES EXPLICIT OWNER APPROVAL BEFORE
-- EXECUTION. Verified locally for every prefix 1..9 (docs/PRODUCTION_READINESS_2026-10-07.md section 14): the schema afterwards equals the 25-migration baseline.
-- =============================================================================

begin;
set local lock_timeout = '5s';

-- -1. ARMING. As committed the script is DISARMED and aborts here, before ANY DROP/ALTER (nothing has been changed; this is the first statement of the
-- transaction). To arm it the owner changes ONLY the value of v_armed to the required token below, in a reviewed local copy, after written owner
-- approval (Gate A rollback). The token acknowledges: schema objects are dropped, seeded configuration is deleted, migration history is NOT edited.
do $$
declare
  v_armed constant text := 'DISARMED';
  v_required constant text := 'ROLLBACK-PENDING-CHAIN-9-MIGRATIONS-OWNER-APPROVED';
begin
  if v_armed is distinct from v_required then
    raise exception 'pending-chain rollback is DISARMED: no statement was executed. Arm only with explicit owner approval (set v_armed in section -1).';
  end if;
end $$;

-- 0. Prefix detection + preconditions (read-only; nothing destructive has run yet). The detected prefix is kept in a transaction-local setting.
do $$
declare
  v_marker boolean[];
  v_prefix integer := 0;
  v_k integer;
  v_t text;
  v_n bigint;
  v_versions text[] := array['20261006000100', '20261006000200', '20261006000300', '20261006000400', '20261006000500', '20261006000600', '20261006000700', '20261006000800', '20261007000100'];
  v_hist integer[] := '{}';
begin
  -- one marker object per migration (each is created by exactly that migration)
  v_marker := array[
    to_regclass('public.analytics_settings') is not null,
    to_regclass('public.waste_reasons') is not null,
    to_regprocedure('public.get_waste_report(uuid,date,date)') is not null,
    to_regclass('public.branch_locations') is not null,
    to_regclass('public.suppliers') is not null,
    to_regprocedure('public.create_purchase_order(uuid,uuid,date,date,text,jsonb)') is not null,
    to_regclass('public.weather_settings') is not null,
    to_regprocedure('public.get_command_center_signals(uuid[])') is not null,
    to_regprocedure('public.get_manager_report_inputs(uuid[],text,date)') is not null
  ];
  for v_k in 1 .. 9 loop
    exit when not v_marker[v_k];
    v_prefix := v_k;
  end loop;
  -- the installed set must be EXACTLY a prefix: no marker beyond it
  for v_k in v_prefix + 1 .. 9 loop
    if v_marker[v_k] then
      raise exception 'rollback refused: migration % objects exist but a lower pending migration is missing; the installed set is not a prefix of the chain (restore from the verified backup)', v_k;
    end if;
  end loop;
  if v_prefix = 0 then
    raise exception 'rollback refused: no pending-chain object is installed; there is nothing to roll back';
  end if;
  -- cross-check with the migration history (read-only): exactly the versions 1..prefix of the nine must be recorded
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    for v_k in 1 .. 9 loop
      if exists (select 1 from supabase_migrations.schema_migrations where version = v_versions[v_k]) then
        v_hist := v_hist || v_k;
      end if;
    end loop;
    if v_hist is distinct from (select coalesce(array_agg(g), '{}') from generate_series(1, v_prefix) g) then
      raise exception 'rollback refused: the migration history records pending versions % but the installed schema prefix is %; inspect manually (the history is not modified by this script)', v_hist, v_prefix;
    end if;
  end if;
  perform set_config('pending_chain.prefix', v_prefix::text, true);
  raise notice 'pending-chain rollback: detected installed prefix = % of 9', v_prefix;

  -- the pending tables that exist must be EMPTY (the seed-only tables are checked for their seeded state instead)
  foreach v_t in array array[
    'analytics_insights', 'analytics_reports', 'branch_locations', 'daily_analytics_snapshots', 'external_context_daily', 'item_supply_params',
    'purchase_order_lines', 'purchase_order_receipts', 'purchase_order_status_history', 'purchase_orders', 'suppliers', 'weather_forecast_snapshots',
    'weekly_analytics_snapshots'
  ] loop
    if to_regclass('public.' || v_t) is not null then
      execute format('select count(*) from public.%I', v_t) into v_n;
      if v_n > 0 then
        raise exception 'rollback refused: public.% holds % row(s); the pending chain has been used (restore from the verified backup instead)', v_t, v_n;
      end if;
    end if;
  end loop;
  if to_regclass('public.analytics_settings') is not null then
    if (select count(*) from public.analytics_settings) <> 1 or exists (select 1 from public.analytics_settings where settings <> '{}'::jsonb) then
      raise exception 'rollback refused: analytics_settings was changed from its seeded empty state';
    end if;
  end if;
  if to_regclass('public.weather_settings') is not null then
    if (select count(*) from public.weather_settings) <> 1 or exists (select 1 from public.weather_settings where forecast_ttl_minutes <> 60) then
      raise exception 'rollback refused: weather_settings was changed from its seeded state';
    end if;
  end if;
  if to_regclass('public.waste_reasons') is not null then
    if (select count(*) from public.waste_reasons) <> 6
       or exists (select 1 from public.waste_reasons where code not in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other')) then
      raise exception 'rollback refused: the waste reason catalogue differs from the six seeded reasons';
    end if;
  end if;
  if exists (select 1 from public.inventory_movements where reason_code is not null and reason_code not in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other')) then
    raise exception 'rollback refused: inventory movements use a reason code outside the original six';
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'branches' and column_name = 'timezone') then
    if exists (select 1 from public.branches where timezone <> 'Europe/Istanbul') then
      raise exception 'rollback refused: a branch time zone was changed';
    end if;
  end if;
end $$;

-- 1. Restore the three existing objects the chain altered (only the ones the installed prefix altered), BEFORE their new dependencies are dropped
do $$
begin
  -- migration 2: inventory_movements reason CHECK became an FK to waste_reasons; record_inventory_waste was replaced
  if exists (select 1 from pg_constraint where conrelid = 'public.inventory_movements'::regclass and conname = 'inventory_movements_reason_code_fkey') then
    alter table public.inventory_movements drop constraint inventory_movements_reason_code_fkey;
    alter table public.inventory_movements add constraint inventory_movements_reason_code_check
      check (reason_code is null or reason_code = any (array['expired'::text, 'damaged'::text, 'spilled'::text, 'quality'::text, 'sample'::text, 'other'::text]));
  end if;
  if to_regclass('public.waste_reasons') is not null then
    -- the pre-chain body of record_inventory_waste (extracted from the 25-migration schema; CREATE OR REPLACE keeps its grants)
    execute $body$
CREATE OR REPLACE FUNCTION public.record_inventory_waste(p_branch_id uuid, p_lines jsonb, p_reason_code text, p_note text DEFAULT NULL::text, p_shift_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_line record;
  v_item record;
  v_count integer := 0;
  v_summary jsonb := '[]'::jsonb;
begin
  if not public.current_user_can_inventory('inventory.record', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason_code is null or p_reason_code not in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other') then
    raise exception 'a valid waste reason code is required' using errcode = '22023';
  end if;

  perform public.inventory_resolve_shift_context(p_shift_id, p_branch_id);

  for v_line in select * from public.inventory_parse_lines(p_lines, 'quantity')
  loop
    select id, branch_id into v_item from public.inventory_items where id = v_line.item_id;
    if not found or v_item.branch_id <> p_branch_id then
      raise exception 'item does not belong to this branch' using errcode = '22023';
    end if;

    perform public.inventory_insert_movement(
      v_line.item_id, 'WASTE', v_line.qty, p_shift_id, null, null, p_reason_code, p_note, null, null
    );
    v_count := v_count + 1;
    v_summary := v_summary || jsonb_build_object('inventory_item_id', v_line.item_id, 'quantity', v_line.qty);
  end loop;

  perform public.write_audit_log(
    'inventory_waste', 'inventory_movements', p_branch_id::text, null,
    jsonb_build_object('lines', v_summary, 'reason_code', p_reason_code, 'shift_id', p_shift_id), p_note
  );

  return v_count;
end;
$function$;
$body$;
  end if;
end $$;

-- 2. Views, then tables in FK order WITHOUT CASCADE (a dependency that is not listed here makes the transaction fail and roll back), then the sequence
drop view if exists public.daily_analytics_current;
drop view if exists public.weekly_analytics_current;
drop table if exists public.analytics_insights;
drop table if exists public.analytics_reports;
drop table if exists public.daily_analytics_snapshots;
drop table if exists public.weekly_analytics_snapshots;
drop table if exists public.analytics_settings;
drop table if exists public.external_context_daily;
drop table if exists public.weather_forecast_snapshots;
drop table if exists public.weather_settings;
drop table if exists public.purchase_order_receipts;
drop table if exists public.purchase_order_lines;
drop table if exists public.purchase_order_status_history;
drop table if exists public.purchase_orders;
drop table if exists public.item_supply_params;
drop table if exists public.suppliers;
drop sequence if exists public.purchase_order_seq;
drop table if exists public.waste_reasons;
drop table if exists public.branch_locations;

-- branches (migration 4): trigger, constraint, column. IF EXISTS keeps this prefix-safe.
drop trigger if exists branches_validate_timezone on public.branches;
alter table public.branches drop constraint if exists branches_timezone_nonempty;
alter table public.branches drop column if exists timezone;

-- 3. Functions of the chain (identity arguments from the verified object delta; IF EXISTS makes the list prefix-safe; no CASCADE: a leftover dependency must fail loudly)
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
drop function if exists public.branches_validate_timezone();
drop function if exists public.create_purchase_order(p_branch_id uuid, p_supplier_id uuid, p_ordered_for date, p_expected_delivery date, p_notes text, p_lines jsonb);
drop function if exists public.external_context_provenance_guard();
drop function if exists public.get_branch_count_overview(p_branch_id uuid, p_limit integer);
drop function if exists public.get_branch_operations_signals(p_branch_id uuid);
drop function if exists public.get_branch_weather(p_branch_id uuid);
drop function if exists public.get_command_center_signals(p_branch_ids uuid[]);
drop function if exists public.get_daily_analytics(p_branch_id uuid, p_date date);
drop function if exists public.get_dashboard_inputs(p_branch_ids uuid[], p_from_date date, p_to_date date, p_from_instant timestamp with time zone, p_to_instant timestamp with time zone);
drop function if exists public.get_inventory_count_review(p_count_id uuid);
drop function if exists public.get_manager_report_inputs(p_branch_ids uuid[], p_scope text, p_date date);
drop function if exists public.get_order_suggestions(p_branch_id uuid);
drop function if exists public.get_procurement_attention(p_branch_id uuid);
drop function if exists public.get_purchase_order(p_order_id uuid);
drop function if exists public.get_waste_report(p_branch_id uuid, p_from date, p_to date);
drop function if exists public.get_weekly_analytics(p_branch_id uuid, p_week_start date);
drop function if exists public.internal_generate_daily_analytics(p_branch_id uuid, p_date date, p_kind text, p_actor uuid, p_reason text);
drop function if exists public.internal_generate_weekly_analytics(p_branch_id uuid, p_week_start date, p_kind text, p_actor uuid, p_reason text);
drop function if exists public.internal_save_analytics_report(p_weekly_snapshot_id uuid, p_status text, p_input_facts jsonb, p_output jsonb, p_model text, p_error_code text, p_actor uuid);
drop function if exists public.internal_store_weather_forecast(p_branch_id uuid, p_provider text, p_fetched_at timestamp with time zone, p_generated_at timestamp with time zone, p_valid_until timestamp with time zone, p_payload jsonb);
drop function if exists public.internal_upsert_observed_weather(p_branch_id uuid, p_date date, p_values jsonb, p_source text, p_provenance text);
drop function if exists public.internal_weather_ttl_minutes();
drop function if exists public.inventory_cost_metric(p_total_qty numeric, p_costed_qty numeric, p_costed_value numeric, p_can_see boolean);
drop function if exists public.inventory_count_classified_lines(p_count_id uuid);
drop function if exists public.inventory_count_summary(p_count_id uuid, p_can_cost boolean);
drop function if exists public.list_branch_locations();
drop function if exists public.list_purchase_orders(p_branch_id uuid, p_statuses text[], p_limit integer);
drop function if exists public.procurement_calendar(p_now timestamp with time zone, p_tz text, p_allowed smallint[], p_cutoff time without time zone, p_delivery smallint[], p_lead integer);
drop function if exists public.procurement_guard_line();
drop function if exists public.procurement_guard_order();
drop function if exists public.procurement_guard_supplier();
drop function if exists public.procurement_json_num(p jsonb, p_key text);
drop function if exists public.procurement_json_weekdays(p jsonb, p_key text);
drop function if exists public.procurement_order_brief(p_order_id uuid);
drop function if exists public.procurement_order_reconciliation(p_order_id uuid);
drop function if exists public.procurement_prevent_mutation();
drop function if exists public.procurement_transition_allowed(p_from text, p_to text);
drop function if exists public.procurement_write_lines(p_order_id uuid, p_branch_id uuid, p_supplier_id uuid, p_lines jsonb);
drop function if exists public.receive_purchase_order(p_order_id uuid, p_lines jsonb, p_note text);
drop function if exists public.regenerate_daily_analytics(p_branch_id uuid, p_date date, p_reason text);
drop function if exists public.regenerate_weekly_analytics(p_branch_id uuid, p_week_start date, p_reason text);
drop function if exists public.replace_purchase_order_lines(p_order_id uuid, p_lines jsonb);
drop function if exists public.set_supplier_active(p_id uuid, p_active boolean, p_reason text);
drop function if exists public.set_waste_reason_active(p_reason_id uuid, p_active boolean, p_reason text);
drop function if exists public.transition_purchase_order(p_order_id uuid, p_to text, p_reason text);
drop function if exists public.update_analytics_settings(p_values jsonb, p_reason text);
drop function if exists public.update_branch_location(p_branch_id uuid, p_latitude numeric, p_longitude numeric, p_timezone text, p_address text, p_location_label text, p_reason text);
drop function if exists public.update_purchase_order_header(p_order_id uuid, p_ordered_for date, p_expected_delivery date, p_notes text);
drop function if exists public.update_weather_settings(p_forecast_ttl_minutes integer, p_reason text);
drop function if exists public.upsert_external_context_daily(p_context_date date, p_branch_id uuid, p_values jsonb, p_reason text);
drop function if exists public.upsert_item_supply_params(p_branch_id uuid, p_item_id uuid, p_supplier_id uuid, p_params jsonb, p_reason text);
drop function if exists public.upsert_supplier(p_id uuid, p_code text, p_name text, p_type text, p_contact text, p_phone text, p_email text, p_notes text, p_reason text);
drop function if exists public.upsert_waste_reason(p_reason_id uuid, p_code text, p_name text, p_description text, p_sort_order integer, p_reason text);
drop function if exists public.weather_prevent_mutation();

-- 4. Configuration seeds of the chain: role grants first, then the permission keys
delete from public.role_permissions where permission_id in (select id from public.permissions where key in (
  'analytics.ai.read',
  'analytics.financial.read',
  'analytics.read',
  'analytics.regenerate',
  'branch.location.read',
  'inventory.count_review.read',
  'inventory.waste_reason.manage',
  'inventory.waste_report.read',
  'procurement.order.approve',
  'procurement.order.create',
  'procurement.order.manage',
  'procurement.order.read',
  'procurement.order.receive',
  'procurement.supplier.manage',
  'procurement.supplier.read',
  'procurement.supply.manage',
  'weather.read'
));
delete from public.permissions where key in (
  'analytics.ai.read',
  'analytics.financial.read',
  'analytics.read',
  'analytics.regenerate',
  'branch.location.read',
  'inventory.count_review.read',
  'inventory.waste_reason.manage',
  'inventory.waste_report.read',
  'procurement.order.approve',
  'procurement.order.create',
  'procurement.order.manage',
  'procurement.order.read',
  'procurement.order.receive',
  'procurement.supplier.manage',
  'procurement.supplier.read',
  'procurement.supply.manage',
  'weather.read'
);

commit;
