-- =============================================================================
-- Phase 1B (2/3): waste/fire report and closing-count variance classification
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production. READ-ONLY functions: nothing here writes the ledger.
--
-- Both reports are deterministic SQL over the EXISTING append-only ledger (inventory_movements) and the
-- existing counts (inventory_counts / inventory_count_items). No second fire or counting store exists.
--
-- COST STATES (never confuse 0 with "unknown"): every cost figure is a metric
--   {state, value, knownCostKurus, costedQuantity, totalQuantity, reason}
--   available    every counted quantity has a unit_cost_snapshot -> exact value (0 only when really 0)
--   partial      some quantity has no snapshot -> the value/knownCostKurus cover only the costed part (reason missing_cost)
--   unavailable  no quantity has a snapshot (missing_cost) or the caller lacks inventory.cost.read (no_permission):
--                no value, knownCostKurus is NULL. Missing cost is never estimated.
--
-- WASTE REPORT RULES
--   * period = Istanbul calendar dates [p_from, p_to] (WASTE movements by occurred_at)
--   * a WASTE movement that has been reversed (REVERSAL row) is excluded and counted in reversedEntries
--
-- COUNT VARIANCE CLASSIFICATION AND THE TIMESTAMP LIMITATION
--   variance = physical - expected; expected is the server-side theoretical stock SNAPSHOT taken when the count was
--   submitted. That snapshot ALREADY deducts every waste recorded before the count, so earlier waste can never
--   "explain" a shortage (it is not a candidate at all).
--
--   The ledger has ONE time for a movement: occurred_at, the SERVER clock at insertion (no RPC accepts a client
--   timestamp; created_at is the same instant). It does NOT distinguish "when the waste physically happened" from
--   "when it was entered". A waste entered after the count may have happened before it (belongs to the counted state
--   but was entered late) or after it (belongs to a later state). Without an effective event time that cannot be
--   decided, and this migration does not fabricate the precision.
--
--   Therefore a shortage is NEVER labelled explained_by_waste here. For a shortage:
--     timing_uncertain  waste for the same item was RECORDED after the count, inside its window (the count's
--                       submitted_at up to the next submitted count of that item; same shift, or same Istanbul business
--                       date when the shift is unknown; not reversed). Its quantity is a CANDIDATE only
--                       (candidate_waste, potential_explained = least(shortage, candidate)); nothing is confirmed.
--     unexplained       no such candidate waste exists.
--   balanced / surplus lines are 'not_applicable'. confirmed explained quantity is always 0; unexplained quantity is the
--   whole shortage. A future effective-time column on waste entries is the way to allow explained_by_waste.
--   Other limits: no tolerance (exact quantities), precision is shift OR business date, voided counts are listed but
--   excluded from totals and never end a window.
-- =============================================================================

-- cost metric helper: total/costed quantity and the costed value
create or replace function public.inventory_cost_metric(p_total_qty numeric, p_costed_qty numeric, p_costed_value numeric, p_can_see boolean)
returns jsonb
language sql
immutable
as $$
  select case
    when not p_can_see then jsonb_build_object('state', 'unavailable', 'reason', 'no_permission')
    when coalesce(p_total_qty, 0) = 0 then
      jsonb_build_object('state', 'available', 'value', 0, 'knownCostKurus', 0, 'costedQuantity', 0, 'totalQuantity', 0)
    when coalesce(p_costed_qty, 0) = 0 then
      jsonb_build_object('state', 'unavailable', 'reason', 'missing_cost', 'knownCostKurus', null, 'costedQuantity', 0, 'totalQuantity', p_total_qty)
    when p_costed_qty < p_total_qty then
      jsonb_build_object('state', 'partial', 'value', round(p_costed_value, 2), 'reason', 'missing_cost',
        'knownCostKurus', round(p_costed_value * 100)::bigint, 'costedQuantity', p_costed_qty, 'totalQuantity', p_total_qty)
    else
      jsonb_build_object('state', 'available', 'value', round(p_costed_value, 2),
        'knownCostKurus', round(p_costed_value * 100)::bigint, 'costedQuantity', p_costed_qty, 'totalQuantity', p_total_qty)
  end;
$$;
revoke all on function public.inventory_cost_metric(numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.inventory_cost_metric(numeric, numeric, numeric, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Waste / fire report
-- ---------------------------------------------------------------------------
create or replace function public.get_waste_report(p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
  v_cost boolean;
  v_result jsonb;
begin
  if not public.current_user_can_inventory('inventory.waste_report.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then
    raise exception 'a valid period of at most 367 days is required' using errcode = '22023';
  end if;
  v_cost := public.current_user_can_inventory('inventory.cost.read', p_branch_id);
  v_start := (p_from::timestamp at time zone 'Europe/Istanbul');
  v_end := ((p_to + 1)::timestamp at time zone 'Europe/Istanbul');

  with moves as (
    select m.* from public.inventory_movements m
    where m.branch_id = p_branch_id and m.movement_type = 'WASTE'
      and m.occurred_at >= v_start and m.occurred_at < v_end
  ),
  w as (
    select m.* from moves m
    where not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
  ),
  wc as (
    select w.*, i.code as item_code, i.name as item_name, i.unit,
           (w.unit_cost_snapshot is not null) as costed
    from w join public.inventory_items i on i.id = w.inventory_item_id
  )
  select jsonb_build_object(
    'branchId', p_branch_id, 'from', p_from, 'to', p_to, 'timezone', 'Europe/Istanbul',
    'entries', (select count(*) from wc),
    'reversedEntries', (select count(*) from moves m where exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)),
    'cost', public.inventory_cost_metric((select coalesce(sum(quantity), 0) from wc), (select coalesce(sum(quantity) filter (where costed), 0) from wc),
              (select coalesce(sum(quantity * unit_cost_snapshot) filter (where costed), 0) from wc), v_cost),
    'costCoverage', jsonb_build_object(
        'state', case when not v_cost then 'unavailable'
                      when (select count(*) from wc) = 0 or (select count(*) filter (where costed) from wc) = (select count(*) from wc) then 'available'
                      when (select count(*) filter (where costed) from wc) = 0 then 'unavailable' else 'partial' end,
        'costedEntries', (select count(*) filter (where costed) from wc), 'entries', (select count(*) from wc)),
    'quantityByUnit', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', q) order by unit)
                                from (select unit, sum(quantity) as q from wc group by unit) t), '[]'::jsonb),
    'byItem', coalesce((select jsonb_agg(jsonb_build_object('inventoryItemId', inventory_item_id, 'code', item_code, 'name', item_name, 'unit', unit,
                'entries', n, 'quantity', q,
                'cost', public.inventory_cost_metric(q, cq, cv, v_cost)) order by item_code)
              from (select inventory_item_id, item_code, item_name, unit, count(*) n, sum(quantity) q,
                           coalesce(sum(quantity) filter (where costed), 0) cq, coalesce(sum(quantity * unit_cost_snapshot) filter (where costed), 0) cv
                    from wc group by 1, 2, 3, 4) t), '[]'::jsonb),
    'byReason', coalesce((select jsonb_agg(jsonb_build_object('reasonCode', reason_code, 'name', coalesce(rn, reason_code), 'entries', n,
                'quantityByUnit', qu, 'cost', public.inventory_cost_metric(q, cq, cv, v_cost)) order by n desc, reason_code)
              from (select wc.reason_code, max(r.name) rn, count(*) n, sum(wc.quantity) q,
                           coalesce(sum(wc.quantity) filter (where wc.costed), 0) cq, coalesce(sum(wc.quantity * wc.unit_cost_snapshot) filter (where wc.costed), 0) cv,
                           (select jsonb_agg(jsonb_build_object('unit', u, 'quantity', s) order by u) from (select w2.unit u, sum(w2.quantity) s from wc w2 where w2.reason_code = wc.reason_code group by w2.unit) z) qu
                    from wc left join public.waste_reasons r on r.code = wc.reason_code group by wc.reason_code) t), '[]'::jsonb),
    'byEmployee', coalesce((select jsonb_agg(jsonb_build_object('userId', created_by, 'name', coalesce(pn, 'Bilinmiyor'), 'employeeCode', pc, 'entries', n,
                'cost', public.inventory_cost_metric(q, cq, cv, v_cost)) order by n desc, pn)
              from (select wc.created_by, max(p.full_name) pn, max(p.employee_code) pc, count(*) n, sum(wc.quantity) q,
                           coalesce(sum(wc.quantity) filter (where wc.costed), 0) cq, coalesce(sum(wc.quantity * wc.unit_cost_snapshot) filter (where wc.costed), 0) cv
                    from wc left join public.profiles p on p.id = wc.created_by group by wc.created_by) t), '[]'::jsonb),
    'byShift', coalesce((select jsonb_agg(jsonb_build_object('shiftId', shift_id, 'label', label, 'businessDate', bd, 'entries', n,
                'cost', public.inventory_cost_metric(q, cq, cv, v_cost)) order by bd nulls last, label)
              from (select wc.shift_id, coalesce(sd.name, 'Vardiya belirtilmedi') label, s.business_date bd, count(*) n, sum(wc.quantity) q,
                           coalesce(sum(wc.quantity) filter (where wc.costed), 0) cq, coalesce(sum(wc.quantity * wc.unit_cost_snapshot) filter (where wc.costed), 0) cv
                    from wc left join public.shifts s on s.id = wc.shift_id left join public.shift_definitions sd on sd.id = s.shift_definition_id
                    group by wc.shift_id, sd.name, s.business_date) t), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
comment on function public.get_waste_report(uuid, date, date) is
  'Waste/fire report over the append-only ledger: by item, reason, employee and shift, with cost states (available/partial/unavailable, knownCostKurus, coverage; never a silent 0). inventory.waste_report.read + branch scope; cost needs inventory.cost.read. Reversed entries are excluded and counted.';
revoke all on function public.get_waste_report(uuid, date, date) from public, anon;
grant execute on function public.get_waste_report(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- Closing count: line classification (internal) + summary + review + manager overview
-- ---------------------------------------------------------------------------
create or replace function public.inventory_count_classified_lines(p_count_id uuid)
returns table (
  inventory_item_id uuid, code text, name text, unit text,
  expected numeric, physical numeric, variance numeric, classification text,
  candidate_waste numeric, potential_explained numeric, unexplained numeric, explanation text, unit_cost numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with c as (select * from public.inventory_counts where id = p_count_id),
  l as (
    select ci.*, i.code as icode, i.name as iname, i.unit as iunit
    from public.inventory_count_items ci join public.inventory_items i on i.id = ci.inventory_item_id
    where ci.inventory_count_id = p_count_id
  ),
  nxt as (
    select l.inventory_item_id,
           (select min(c2.submitted_at) from public.inventory_counts c2
              join public.inventory_count_items ci2 on ci2.inventory_count_id = c2.id
             where c2.branch_id = c.branch_id and ci2.inventory_item_id = l.inventory_item_id
               and c2.status = 'submitted' and c2.submitted_at > c.submitted_at) as next_at
    from l cross join c
  ),
  w as (
    -- waste RECORDED after the count (occurred_at is the server insertion time) inside the window: candidates only
    select l.inventory_item_id,
           coalesce((
             select sum(m.quantity) from public.inventory_movements m
              where m.inventory_item_id = l.inventory_item_id and m.movement_type = 'WASTE'
                and m.occurred_at > c.submitted_at
                and m.occurred_at < coalesce((select next_at from nxt where nxt.inventory_item_id = l.inventory_item_id), 'infinity'::timestamptz)
                and not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
                and (
                  (c.shift_id is not null and m.shift_id = c.shift_id)
                  or ((c.shift_id is null or m.shift_id is null) and (m.occurred_at at time zone 'Europe/Istanbul')::date = c.business_date)
                )
           ), 0) as cand
    from l cross join c
  )
  select l.inventory_item_id, l.icode, l.iname, l.iunit,
         l.theoretical_quantity, l.physical_quantity, l.variance_quantity,
         case when l.variance_quantity < 0 then 'shortage' when l.variance_quantity > 0 then 'surplus' else 'balanced' end,
         w.cand,
         case when l.variance_quantity < 0 then least(-l.variance_quantity, w.cand) else 0 end,
         case when l.variance_quantity < 0 then -l.variance_quantity else 0 end,
         case when l.variance_quantity >= 0 then 'not_applicable'
              when w.cand > 0 then 'timing_uncertain'
              else 'unexplained' end,
         public.inventory_effective_cost(l.inventory_item_id, (select submitted_at from c))
  from l join w on w.inventory_item_id = l.inventory_item_id;
$$;
revoke all on function public.inventory_count_classified_lines(uuid) from public, anon, authenticated;
grant execute on function public.inventory_count_classified_lines(uuid) to service_role;

create or replace function public.inventory_count_summary(p_count_id uuid, p_can_cost boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'lines', count(*),
    'balancedLines', count(*) filter (where classification = 'balanced'),
    'shortageLines', count(*) filter (where classification = 'shortage'),
    'surplusLines', count(*) filter (where classification = 'surplus'),
    'timingUncertainLines', count(*) filter (where explanation = 'timing_uncertain'),
    'unexplainedLines', count(*) filter (where explanation = 'unexplained'),
    'unexplainedQuantityByUnit', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', q) order by unit)
        from (select unit, sum(unexplained) q from public.inventory_count_classified_lines(p_count_id) where explanation = 'unexplained' group by unit) t), '[]'::jsonb),
    'timingUncertainQuantityByUnit', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', q) order by unit)
        from (select unit, sum(unexplained) q from public.inventory_count_classified_lines(p_count_id) where explanation = 'timing_uncertain' group by unit) t), '[]'::jsonb),
    'shortageQuantityByUnit', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', q) order by unit)
        from (select unit, sum(-variance) q from public.inventory_count_classified_lines(p_count_id) where classification = 'shortage' group by unit) t), '[]'::jsonb),
    'surplusQuantityByUnit', coalesce((select jsonb_agg(jsonb_build_object('unit', unit, 'quantity', q) order by unit)
        from (select unit, sum(variance) q from public.inventory_count_classified_lines(p_count_id) where classification = 'surplus' group by unit) t), '[]'::jsonb),
    'varianceValue', public.inventory_cost_metric(
        coalesce(sum(abs(variance)) filter (where variance <> 0), 0),
        coalesce(sum(abs(variance)) filter (where variance <> 0 and unit_cost is not null), 0),
        coalesce(sum(variance * unit_cost) filter (where variance <> 0 and unit_cost is not null), 0), p_can_cost))
  from public.inventory_count_classified_lines(p_count_id);
$$;
revoke all on function public.inventory_count_summary(uuid, boolean) from public, anon, authenticated;
grant execute on function public.inventory_count_summary(uuid, boolean) to service_role;

create or replace function public.get_inventory_count_review(p_count_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count record;
  v_cost boolean;
begin
  select c.*, p.full_name as counter_name, p.employee_code as counter_code, sd.name as shift_name
    into v_count
  from public.inventory_counts c
  left join public.profiles p on p.id = c.counted_by
  left join public.shifts s on s.id = c.shift_id
  left join public.shift_definitions sd on sd.id = s.shift_definition_id
  where c.id = p_count_id;
  if not found or not public.current_user_can_inventory('inventory.count_review.read', v_count.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_cost := public.current_user_can_inventory('inventory.cost.read', v_count.branch_id);

  return jsonb_build_object(
    'count', jsonb_build_object('id', v_count.id, 'branchId', v_count.branch_id, 'shiftId', v_count.shift_id, 'shiftName', v_count.shift_name,
      'businessDate', v_count.business_date, 'status', v_count.status, 'submittedAt', v_count.submitted_at,
      'submittedBy', jsonb_build_object('userId', v_count.counted_by, 'name', v_count.counter_name, 'employeeCode', v_count.counter_code),
      'note', v_count.note, 'voidedAt', v_count.voided_at, 'voidReason', v_count.void_reason),
    'summary', public.inventory_count_summary(p_count_id, v_cost),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'inventoryItemId', inventory_item_id, 'code', code, 'name', name, 'unit', unit,
        'expectedQuantity', expected, 'physicalQuantity', physical, 'varianceQuantity', variance,
        'classification', classification,
        'explanation', jsonb_build_object('status', explanation, 'candidateWasteQuantity', candidate_waste,
                                          'potentialExplainedQuantity', potential_explained, 'confirmedExplainedQuantity', 0,
                                          'unexplainedQuantity', unexplained),
        'varianceValue', case when not v_cost then jsonb_build_object('state', 'unavailable', 'reason', 'no_permission')
                              when variance = 0 then jsonb_build_object('state', 'available', 'value', 0)
                              when unit_cost is null then jsonb_build_object('state', 'unavailable', 'reason', 'missing_cost')
                              else jsonb_build_object('state', 'available', 'value', round(variance * unit_cost, 2)) end
      ) order by code) from public.inventory_count_classified_lines(p_count_id)), '[]'::jsonb),
    'method', jsonb_build_object(
      'expected', 'server-side theoretical stock snapshot taken when the count was submitted (already net of waste recorded before it)',
      'explanation', 'a shortage is never confirmed as explained: the ledger records only the insertion time of a waste entry, not when the waste happened. Waste recorded after the count inside its window (same shift, or same business date when the shift is unknown) is a timing_uncertain candidate; otherwise the shortage is unexplained',
      'tolerance', 'none: exact quantities',
      'precision', 'shift or business date, never finer'));
end;
$$;
comment on function public.get_inventory_count_review(uuid) is
  'Manager review of one count: expected vs physical vs variance per item, balanced/shortage/surplus, waste timing status (timing_uncertain / unexplained, never a confirmed explanation), totals and the method/limitations. inventory.count_review.read + branch scope; variance value needs inventory.cost.read.';
revoke all on function public.get_inventory_count_review(uuid) from public, anon;
grant execute on function public.get_inventory_count_review(uuid) to authenticated;

create or replace function public.get_branch_count_overview(p_branch_id uuid, p_limit integer default 10)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_cost boolean;
  v_latest uuid;
  v_recent jsonb;
begin
  if not public.current_user_can_inventory('inventory.count_review.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_cost := public.current_user_can_inventory('inventory.cost.read', p_branch_id);
  select id into v_latest from public.inventory_counts
   where branch_id = p_branch_id and status = 'submitted' order by submitted_at desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'businessDate', c.business_date, 'status', c.status, 'submittedAt', c.submitted_at, 'shiftId', c.shift_id,
      'submittedBy', p.full_name, 'employeeCode', p.employee_code, 'voidReason', c.void_reason,
      'summary', case when c.status = 'submitted' then public.inventory_count_summary(c.id, v_cost) end
    ) order by c.submitted_at desc), '[]'::jsonb)
    into v_recent
  from (select * from public.inventory_counts where branch_id = p_branch_id order by submitted_at desc limit greatest(1, least(coalesce(p_limit, 10), 50))) c
  left join public.profiles p on p.id = c.counted_by;

  return jsonb_build_object(
    'branchId', p_branch_id, 'today', v_today,
    'todayStatus', case when exists (select 1 from public.inventory_counts where branch_id = p_branch_id and business_date = v_today and status = 'submitted') then 'submitted'
                        when exists (select 1 from public.inventory_counts where branch_id = p_branch_id and business_date = v_today and status = 'voided') then 'voided_only'
                        else 'missing' end,
    'latestCountId', v_latest,
    'latestSummary', case when v_latest is null then null else public.inventory_count_summary(v_latest, v_cost) end,
    'recent', v_recent);
end;
$$;
comment on function public.get_branch_count_overview(uuid, integer) is
  'Manager overview: whether today''s closing count exists (submitted / voided_only / missing), the latest count summary and the recent counts (voided ones listed, excluded from the latest summary). inventory.count_review.read + branch scope.';
revoke all on function public.get_branch_count_overview(uuid, integer) from public, anon;
grant execute on function public.get_branch_count_overview(uuid, integer) to authenticated;
