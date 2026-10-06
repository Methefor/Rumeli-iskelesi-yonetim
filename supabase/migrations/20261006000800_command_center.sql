-- =============================================================================
-- Phase 1D (2/2): Command Center read model (one call per branch)
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production.
--
-- Two BATCH read models keep the initial load at a constant number of requests (2) regardless of the number of branches:
--   get_dashboard_inputs(branch_ids, period)  the RAW facts the TypeScript dashboard model consumes, for all branches at once
--   get_command_center_signals(branch_ids)    get_branch_operations_signals for all branches at once
-- Both run as the CALLER (security invoker / existing guarded functions), so visibility is exactly what the per-table queries had.
--
-- DESIGN DECISION: the Command Center is a COMPOSITION, not a second calculation engine. Revenue/finalization and the dashboard
-- aggregation live in the TypeScript domain (domain/dashboard) and stay there: duplicating them in SQL would create a second revenue
-- engine. This function only bundles the EXISTING read models of one branch so the app needs one call instead of five:
--   counts       get_branch_count_overview       (inventory control)
--   waste        get_waste_report (today)        (inventory control)
--   procurement  get_procurement_attention       (procurement)
--   weather      get_branch_weather              (weather context)
--   analytics    latest daily + weekly snapshot insights (Analytics Engine V1: read only, NOTHING is recomputed; the weekly one carries
--                the evidence-gated weather relationship)
-- Each part is guarded by its own permission and degrades to {state:'unavailable', reason:'no_permission'} instead of failing the whole
-- call, so a role sees exactly the parts it may see and branch scope is enforced by every underlying function.
-- The attention feed (severity, ordering, routes) is derived deterministically in the app from these payloads and the dashboard model.
-- =============================================================================

create or replace function public.get_branch_operations_signals(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_today date;
  v_snap record;
  v_week record;
  v_fin boolean;
  v_loc boolean;
begin
  select timezone into v_tz from public.branches where id = p_branch_id;
  if not found
     or not (public.current_user_can_inventory('inventory.count_review.read', p_branch_id)
          or public.current_user_can_inventory('inventory.waste_report.read', p_branch_id)
          or public.current_user_can_inventory('procurement.order.read', p_branch_id)
          or public.current_user_can_inventory('weather.read', p_branch_id)
          or public.analytics_can('analytics.read', p_branch_id)) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_today := (now() at time zone coalesce(v_tz, 'Europe/Istanbul'))::date;
  v_loc := exists (select 1 from public.branch_locations where branch_id = p_branch_id and latitude is not null and longitude is not null);

  if public.analytics_can('analytics.read', p_branch_id) then
    v_fin := public.analytics_can('analytics.financial.read', p_branch_id);
    select c.id, c.business_date, c.version, c.generated_at, s.payload -> 'completeness' ->> 'overall' as overall
      into v_snap
    from public.daily_analytics_current c join public.daily_analytics_snapshots s on s.id = c.id
    where c.branch_id = p_branch_id order by c.business_date desc limit 1;
    select c.id, c.week_start, c.version, c.generated_at, c.week_complete into v_week
    from public.weekly_analytics_current c where c.branch_id = p_branch_id order by c.week_start desc limit 1;
  end if;

  return jsonb_build_object(
    'branchId', p_branch_id, 'businessDate', v_today, 'timezone', coalesce(v_tz, 'Europe/Istanbul'),
    'location', jsonb_build_object('state', case when v_loc then 'set' else 'missing' end),
    'counts', case when public.current_user_can_inventory('inventory.count_review.read', p_branch_id)
                   then jsonb_build_object('state', 'available', 'data', public.get_branch_count_overview(p_branch_id, 3))
                   else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end,
    'waste', case when public.current_user_can_inventory('inventory.waste_report.read', p_branch_id)
                  then jsonb_build_object('state', 'available', 'data', public.get_waste_report(p_branch_id, v_today, v_today))
                  else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end,
    'procurement', case when public.current_user_can_inventory('procurement.order.read', p_branch_id)
                        then jsonb_build_object('state', 'available', 'data', public.get_procurement_attention(p_branch_id))
                        else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end,
    'weather', case when public.current_user_can_inventory('weather.read', p_branch_id)
                    then jsonb_build_object('state', 'available', 'data', public.get_branch_weather(p_branch_id))
                    else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end,
    'analytics', case
        when not public.analytics_can('analytics.read', p_branch_id) then jsonb_build_object('state', 'unavailable', 'reason', 'no_permission')
        when v_snap.id is null and v_week.id is null then jsonb_build_object('state', 'unavailable', 'reason', 'no_snapshot')
        else jsonb_build_object('state', 'available', 'data', jsonb_build_object(
          'daily', case when v_snap.id is null then null else jsonb_build_object(
            'businessDate', v_snap.business_date, 'version', v_snap.version, 'generatedAt', v_snap.generated_at, 'completeness', v_snap.overall,
            'insights', coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title, 'confidence', i.confidence, 'isFinancial', i.is_financial, 'origin', i.origin)
                                         order by i.created_at)
                                    from public.analytics_insights i
                                   where i.daily_snapshot_id = v_snap.id and (not i.is_financial or v_fin)), '[]'::jsonb)) end,
          'weekly', case when v_week.id is null then null else jsonb_build_object(
            'weekStart', v_week.week_start, 'version', v_week.version, 'generatedAt', v_week.generated_at, 'weekComplete', v_week.week_complete,
            'insights', coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title, 'confidence', i.confidence, 'isFinancial', i.is_financial, 'origin', i.origin)
                                         order by i.created_at)
                                    from public.analytics_insights i
                                   where i.weekly_snapshot_id = v_week.id and (not i.is_financial or v_fin)), '[]'::jsonb)) end)) end);
end;
$$;
comment on function public.get_branch_operations_signals(uuid) is
  'Command Center read model of ONE branch: bundles the existing inventory-control, procurement, weather and latest-analytics-snapshot read models (each guarded by its own permission, degrading to unavailable/no_permission) plus whether branch coordinates exist. Composition only: no revenue logic, no analytics recomputation, no provider call.';
revoke all on function public.get_branch_operations_signals(uuid) from public, anon;
grant execute on function public.get_branch_operations_signals(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Batch input retrieval for the TypeScript dashboard model (NO revenue logic here: raw facts only)
-- ---------------------------------------------------------------------------
create or replace function public.get_dashboard_inputs(
  p_branch_ids uuid[], p_from_date date, p_to_date date, p_from_instant timestamptz, p_to_instant timestamptz
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_b uuid;
  v_items jsonb;
  v_tracked boolean;
  v_gp jsonb;
begin
  if p_branch_ids is null or cardinality(p_branch_ids) > 20 or p_to_date < p_from_date or p_to_date - p_from_date > 400 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  foreach v_b in array p_branch_ids loop
    -- a branch the caller may not see yields NO entry (the client treats a missing branch as unavailable), never an empty "all clear"
    if not (public.current_user_is_owner_or_manager() or v_b in (select public.current_user_branch_ids())) then continue; end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'branch_id', i.branch_id, 'code', i.code, 'name', i.name, 'unit', i.unit,
             'allows_decimal', i.allows_decimal, 'sales_category_id', i.sales_category_id, 'is_active', i.is_active) order by i.name), '[]'::jsonb)
      into v_items from public.inventory_items i where i.branch_id = v_b;
    v_tracked := jsonb_array_length(v_items) > 0;
    v_gp := null;
    if v_tracked then
      begin
        v_gp := public.get_inventory_gross_profit(v_b, p_from_instant, p_to_instant);
      exception when others then v_gp := null;   -- same degradation as the per-branch client call (no cost permission etc.)
      end;
    end if;
    v_out := v_out || jsonb_build_object(
      'branchId', v_b,
      'shifts', coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'businessDate', s.business_date, 'status', s.status))
                            from public.shifts s where s.branch_id = v_b and s.business_date between p_from_date and p_to_date), '[]'::jsonb),
      'reports', coalesce((select jsonb_agg(jsonb_build_object('shiftId', r.shift_id, 'businessDate', s.business_date, 'submittedAt', r.submitted_at, 'reportType', r.report_type,
                                   'grossRevenue', r.gross_revenue, 'status', r.status, 'reconciliationStatus', r.reconciliation_status, 'origin', r.origin))
                            from public.sales_reports_with_origin r join public.shifts s on s.id = r.shift_id
                           where r.branch_id = v_b and s.branch_id = v_b and s.business_date between p_from_date and p_to_date), '[]'::jsonb),
      'openReconciliationCount', (select count(*) from public.sales_reports_with_origin r
                                   where r.branch_id = v_b and r.status <> 'cancelled' and r.reconciliation_status in ('WARNING', 'ERROR') and r.origin = 'native'),
      'items', v_items,
      'balances', case when v_tracked then coalesce((select jsonb_agg(jsonb_build_object('inventory_item_id', b.inventory_item_id, 'branch_id', b.branch_id,
                                  'theoretical_quantity', b.theoretical_quantity, 'last_movement_at', b.last_movement_at))
                                  from public.inventory_stock_balances b where b.branch_id = v_b), '[]'::jsonb) else '[]'::jsonb end,
      'lastCounts', case when v_tracked then coalesce((select jsonb_agg(jsonb_build_object('inventory_item_id', c.inventory_item_id, 'inventory_count_id', c.inventory_count_id,
                                  'counted_at', c.counted_at, 'physical_quantity', c.physical_quantity, 'theoretical_quantity', c.theoretical_quantity, 'variance_quantity', c.variance_quantity))
                                  from public.inventory_last_counts c
                                 where c.inventory_item_id in (select i.id from public.inventory_items i where i.branch_id = v_b)), '[]'::jsonb) else '[]'::jsonb end,
      'wasteEntryCount', case when v_tracked then (select count(*) from public.inventory_movements m
                                  where m.branch_id = v_b and m.movement_type = 'WASTE' and m.occurred_at >= p_from_instant and m.occurred_at < p_to_instant) else 0 end,
      'countsSubmitted', case when v_tracked then (select count(*) from public.inventory_counts c
                                  where c.branch_id = v_b and c.status = 'submitted' and c.business_date between p_from_date and p_to_date) else 0 end,
      'grossProfit', v_gp);
  end loop;
  return v_out;
end;
$$;
comment on function public.get_dashboard_inputs(uuid[], date, date, timestamptz, timestamptz) is
  'BATCH retrieval of the RAW inputs of the TypeScript dashboard model (shifts, reports with origin, open reconciliation count, items, balances, last counts, waste/count counts, gross-profit payload) for up to 20 branches in ONE request. Runs as the caller (RLS), skips branches the caller cannot see, contains NO revenue/finalization logic (domain/dashboard stays the only X/Z engine).';
revoke all on function public.get_dashboard_inputs(uuid[], date, date, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_dashboard_inputs(uuid[], date, date, timestamptz, timestamptz) to authenticated;

create or replace function public.get_command_center_signals(p_branch_ids uuid[])
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_b uuid;
begin
  if p_branch_ids is null or cardinality(p_branch_ids) > 20 then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  foreach v_b in array p_branch_ids loop
    begin
      v_out := v_out || jsonb_build_object('branchId', v_b, 'signals', public.get_branch_operations_signals(v_b));
    exception when others then
      -- a branch the caller may not read degrades to "unavailable" for that branch only
      v_out := v_out || jsonb_build_object('branchId', v_b, 'error', 'unavailable');
    end;
  end loop;
  return v_out;
end;
$$;
comment on function public.get_command_center_signals(uuid[]) is
  'BATCH get_branch_operations_signals for up to 20 branches in one request; a branch the caller cannot read is reported as {error: unavailable} for that branch only.';
revoke all on function public.get_command_center_signals(uuid[]) from public, anon;
grant execute on function public.get_command_center_signals(uuid[]) to authenticated;
