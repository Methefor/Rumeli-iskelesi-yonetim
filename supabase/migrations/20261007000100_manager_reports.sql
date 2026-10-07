-- =============================================================================
-- Phase 1E: daily + weekly MANAGER NARRATIVE foundation (read model only).
--
-- The narrative system is NOT a second analytics engine. The Fact Pack is built in the TypeScript domain
-- (app/src/domain/managerReport) from EXISTING deterministic read models:
--   * the canonical dashboard X/Z model        (get_dashboard_inputs, unchanged)
--   * the Command Center signals               (get_command_center_signals, unchanged)
--   * the immutable analytics snapshots        (get_daily_analytics / get_weekly_analytics, unchanged)
--   * inventory-control waste / count overview (get_waste_report / get_branch_count_overview, unchanged)
-- This migration adds ONE function that merely BUNDLES the per-branch pieces those read models do not already carry for a
-- report (the snapshot of the chosen date or week, the 7 daily snapshot projections of a week, the waste of the period and the
-- recent closing counts) so that a report costs a constant number of requests whatever the number of branches.
--
-- NO table is added: a report is reproducible from the immutable, versioned analytics snapshots plus the deterministic read
-- models, and every Fact Pack records the snapshot ids/versions it used. A stored narrative table is only justified once a
-- generator (AI provider) that produces non-reproducible text exists; see MANAGER_REPORT_MODEL.md.
--
-- Nothing is computed here: no revenue, no finalization, no comparison, no severity. Hypotheses are never returned.
-- analytics.read is the ENTRY permission only: the entry also carries the caller's per-domain access (financial, reports, stock, weather) and
-- every part keeps its own permission, so the report can never expose data the caller could not read through that domain's own screens.
-- =============================================================================

create or replace function public.get_manager_report_inputs(p_branch_ids uuid[], p_scope text, p_date date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_out jsonb := '[]'::jsonb;
  v_b uuid;
  v_entry jsonb;
  v_env jsonb;
  v_snap uuid;
  v_fin boolean;
  v_days jsonb;
  v_d date;
  v_denv jsonb;
  v_from date;
  v_to date;
begin
  if p_branch_ids is null or cardinality(p_branch_ids) > 20 or p_scope is null or p_scope not in ('daily', 'weekly') or p_date is null then
    raise exception 'invalid arguments' using errcode = '22023';
  end if;
  if p_scope = 'weekly' and extract(isodow from p_date) <> 1 then
    raise exception 'a weekly report starts on a Monday' using errcode = '22023';
  end if;
  -- cashier / employee / viewer hold no analytics permission: the whole call is denied (anon has no execute grant)
  if not public.current_user_has_permission('analytics.read') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_from := p_date;
  v_to := case when p_scope = 'weekly' then p_date + 6 else p_date end;

  foreach v_b in array p_branch_ids loop
    begin
      -- every inner function enforces permission + branch scope again (owner/manager: all branches; branch_manager: own branch only)
      if not public.analytics_can('analytics.read', v_b) then
        raise exception 'not authorized' using errcode = '42501';
      end if;
      v_fin := public.analytics_can('analytics.financial.read', v_b);

      if p_scope = 'daily' then
        v_env := public.get_daily_analytics(v_b, p_date);
        v_entry := jsonb_build_object('daily', jsonb_build_object('envelope', v_env));
      else
        v_env := public.get_weekly_analytics(v_b, p_date);
        v_days := '[]'::jsonb;
        for v_d in select generate_series(p_date, p_date + 6, interval '1 day')::date loop
          v_denv := public.get_daily_analytics(v_b, v_d);
          v_days := v_days || case
            when v_denv ->> 'state' = 'missing' then jsonb_build_object('date', v_d, 'state', 'missing')
            else jsonb_build_object(
              'date', v_d, 'state', 'present', 'snapshotVersion', (v_denv ->> 'version')::integer,
              'finalization', v_denv #>> '{payload,finalization}',
              'origin', v_denv #>> '{payload,origin}',
              'reconciliation', v_denv #> '{payload,reports,reconciliation}',
              'zBelowX', exists (select 1 from jsonb_array_elements(coalesce(v_denv #> '{payload,warnings}', '[]'::jsonb)) w where w ->> 'code' = 'z_below_x'),
              'multipleReadings', exists (select 1 from jsonb_array_elements(coalesce(v_denv #> '{payload,warnings}', '[]'::jsonb)) w where w ->> 'code' = 'multiple_active_readings'),
              'context', jsonb_build_object(
                'state', v_denv #>> '{payload,context,state}',
                'provenance', v_denv #> '{payload,context,provenance}',
                'temperatureC', v_denv #> '{payload,context,temperatureC}',
                'temperatureMinC', v_denv #> '{payload,context,temperatureMinC}',
                'temperatureMaxC', v_denv #> '{payload,context,temperatureMaxC}',
                'precipitationMm', v_denv #> '{payload,context,precipitationMm}')) end;
        end loop;
        v_entry := jsonb_build_object('weekly', jsonb_build_object('envelope', v_env), 'days', v_days);
      end if;

      -- insights of the snapshot: facts and relationships only (a hypothesis never enters a report); financial ones need the financial permission
      v_snap := nullif(v_env ->> 'snapshotId', '')::uuid;
      v_entry := jsonb_set(v_entry, (case when p_scope = 'daily' then '{daily,insights}' else '{weekly,insights}' end)::text[],
        coalesce((select jsonb_agg(jsonb_build_object('code', i.code, 'title', i.title, 'confidence', i.confidence, 'isFinancial', i.is_financial, 'origin', i.origin) order by i.created_at)
                    from public.analytics_insights i
                   where v_snap is not null
                     and (i.daily_snapshot_id = v_snap or i.weekly_snapshot_id = v_snap)
                     and i.confidence <> 'hypothesis'
                     and (not i.is_financial or v_fin)), '[]'::jsonb));

      -- DOMAIN PERMISSION INTERSECTION. analytics.read is only the entry permission of the feature: it never exposes another domain.
      -- The caller's access to each underlying domain (permission + branch scope, evaluated by the same helpers the domain itself uses)
      -- travels with the entry, and the report builder withholds every fact of a domain the caller may not read (explicit no_permission,
      -- never an empty all-clear). waste / counts / procurement / weather-forecast carry their own per-part permission state.
      v_entry := v_entry || jsonb_build_object(
        'access', jsonb_build_object(
          'financial', v_fin,
          'reports', public.current_user_can_inventory('reports.read', v_b),
          'stock', public.current_user_can_inventory('inventory.read', v_b),
          'weather', public.current_user_can_inventory('weather.read', v_b)));

      v_entry := v_entry || jsonb_build_object(
        'waste', case when public.current_user_can_inventory('inventory.waste_report.read', v_b)
                      then jsonb_build_object('state', 'available', 'data', public.get_waste_report(v_b, v_from, v_to))
                      else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end,
        'counts', case when public.current_user_can_inventory('inventory.count_review.read', v_b)
                       then jsonb_build_object('state', 'available', 'data', public.get_branch_count_overview(v_b, 30))
                       else jsonb_build_object('state', 'unavailable', 'reason', 'no_permission') end);

      v_out := v_out || jsonb_build_object('branchId', v_b, 'input', v_entry);
    exception when others then
      -- a branch the caller may not read degrades to "unavailable" for that branch only (never an empty all-clear)
      v_out := v_out || jsonb_build_object('branchId', v_b, 'error', 'unavailable');
    end;
  end loop;
  return v_out;
end;
$$;
comment on function public.get_manager_report_inputs(uuid[], text, date) is
  'BATCH read model of the manager report for up to 20 branches in ONE request: the analytics snapshot envelope of the date (daily) or week (weekly), the 7 daily snapshot projections of the week (finalization, origin, reconciliation counts, Z<X flags, historical weather context with provenance), the facts/relationships insights of the snapshot (never hypotheses), the waste report of the period and the recent closing counts. Composition only: no revenue, finalization, comparison or severity logic. Runs as the caller; a branch the caller cannot read is {error: unavailable}; callers without analytics.read are denied.';
revoke all on function public.get_manager_report_inputs(uuid[], text, date) from public, anon;
grant execute on function public.get_manager_report_inputs(uuid[], text, date) to authenticated;
