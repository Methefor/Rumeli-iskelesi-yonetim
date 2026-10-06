-- =============================================================================
-- Analytics Engine V1 (DEVELOPMENT ONLY - not applied to production)
-- =============================================================================
-- Rule: SQL calculates every metric deterministically; AI only interprets the
-- structured facts it is given and never calculates or invents a number.
--
-- Adds:
--   permissions    analytics.read | analytics.financial.read | analytics.ai.read | analytics.regenerate
--   tables         external_context_daily, daily_analytics_snapshots,
--                  weekly_analytics_snapshots, analytics_insights, analytics_reports
--   functions      analytics_compute_day (deterministic core), snapshot builders,
--                  get_/regenerate_ RPCs, upsert_external_context_daily
--   views          daily_analytics_current, weekly_analytics_current (stale detection)
--
-- Revenue rule (BUSINESS-DAY level, project rule: morning = X, evening = Z, Z already includes X):
--   FINALIZED  : an active Z exists -> finalized revenue = Z exactly (never normalized or increased by X;
--                a Z below X keeps Z and raises a z_below_x warning)
--   PROVISIONAL: only an X exists   -> finalized revenue is NULL, X is exposed as provisionalRevenue; the day / week is NOT final
--   Cancelled reports never count. Category/product lines are NOT reconciled with this rule:
--   whether Z item lines are cumulative of X is an open decision (line detail is partial/unsupported).
--
-- Time: every date is an Istanbul business_date (shifts.business_date). Weeks are
-- ISO weeks, Monday..Sunday.
--
-- Rollback (development): drop the five tables and the functions listed in
-- supabase/rollback/v4_schema_teardown.sql (kept in sync) and delete the four
-- permission rows.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Permissions
-- -----------------------------------------------------------------------------
insert into public.permissions (key, description) values
  ('analytics.read',            'View analytics volume metrics (transactions, quantities, data quality) for permitted branches.'),
  ('analytics.financial.read',  'View analytics revenue, basket, category/product revenue and gross profit.'),
  ('analytics.ai.read',         'View AI-generated analytics reports (interpretation of supplied facts only).'),
  ('analytics.regenerate',      'Regenerate analytics snapshots and maintain external context (audited).')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key like 'analytics.%'
where
  r.key in ('owner', 'manager')
  or (r.key = 'branch_manager' and p.key in ('analytics.read', 'analytics.financial.read', 'analytics.ai.read'))
on conflict do nothing;
-- cashier / employee / viewer: no analytics permission by default (denied).

-- -----------------------------------------------------------------------------
-- 2. Access helper: permission + branch scope in one check
-- -----------------------------------------------------------------------------
create or replace function public.analytics_can(p_permission_key text, p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.current_user_has_permission(p_permission_key)
    and (
      public.current_user_is_owner_or_manager()
      or p_branch_id in (select public.current_user_branch_ids())
    );
$$;
comment on function public.analytics_can(text, uuid) is
  'Caller holds the analytics permission AND is owner/manager (multi-branch) or a member of the branch (branch_manager). Boolean only.';
revoke all on function public.analytics_can(text, uuid) from public, anon;
grant execute on function public.analytics_can(text, uuid) to authenticated;

-- Technical defaults, CENTRALLY configurable. They are NOT business decisions: they are guards against
-- misleading statistics, pending owner review. The ONE place they live is public.analytics_settings
-- (one row, written only through update_analytics_settings, audited); these are the defaults used for any
-- key the row does not override. Every snapshot embeds the params it was generated with.
-- No branch-specific values exist yet.
create or replace function public.analytics_params()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_defaults constant jsonb := jsonb_build_object(
    'timezone', 'Europe/Istanbul',
    'baselineWeeks', 4,
    'minBaselineSamples', 2,
    'minCorrelationSamples', 14,
    'minGroupSamples', 3,
    'lowVolumeBaseRevenue', 500,
    'lowVolumeBaseTransactions', 10,
    'rainMmThreshold', 1.0,
    'weatherWindowDays', 84,
    'status', 'defaults_pending_owner_review');
begin
  return v_defaults || coalesce((select settings from public.analytics_settings where id = 1), '{}'::jsonb);
end;
$$;
comment on function public.analytics_params() is
  'Effective analytics thresholds = built-in defaults overridden by analytics_settings. Mirrored by app/src/domain/analytics/settings.ts.';
revoke all on function public.analytics_params() from public, anon;
grant execute on function public.analytics_params() to authenticated, service_role;

create or replace function public.analytics_origin_mixed(p_a text, p_b text)
returns boolean
language sql
immutable
as $$
  select p_a <> 'none' and p_b <> 'none' and (p_a = 'mixed' or p_b = 'mixed' or p_a <> p_b);
$$;
revoke all on function public.analytics_origin_mixed(text, text) from public, anon;
grant execute on function public.analytics_origin_mixed(text, text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Tables
-- -----------------------------------------------------------------------------
create table if not exists public.external_context_daily (
  id uuid primary key default gen_random_uuid(),
  context_date date not null,
  -- NULL = applies to every branch (one location). A branch row overrides it.
  branch_id uuid references public.branches (id),
  temperature_c numeric(5, 2) check (temperature_c is null or temperature_c between -60 and 60),
  apparent_temperature_c numeric(5, 2) check (apparent_temperature_c is null or apparent_temperature_c between -80 and 70),
  precipitation_mm numeric(7, 2) check (precipitation_mm is null or precipitation_mm >= 0),
  wind_kmh numeric(6, 2) check (wind_kmh is null or wind_kmh >= 0),
  is_weekend boolean generated always as (extract(isodow from context_date) in (6, 7)) stored,
  is_public_holiday boolean not null default false,
  holiday_name text check (holiday_name is null or length(holiday_name) <= 80),
  pay_period_tag text check (pay_period_tag is null or pay_period_tag ~ '^[a-z][a-z0-9_]{1,29}$'),
  special_event text check (special_event is null or length(special_event) <= 120),
  source text not null default 'manual' check (source ~ '^[a-z][a-z0-9_.-]{1,39}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
create unique index if not exists external_context_daily_unique
  on public.external_context_daily (context_date, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid));
comment on table public.external_context_daily is
  'Per-day external context (weather, calendar, pay period, special event). Entered manually or by a service-role loader; no external fetch exists in V1. Missing rows mean "unknown", never "normal".';
create trigger set_updated_at before update on public.external_context_daily
  for each row execute function public.set_updated_at();

create table if not exists public.daily_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  business_date date not null,
  version integer not null check (version >= 1),
  payload jsonb not null,
  payload_hash text not null,
  source_latest_at timestamptz,
  generation_kind text not null check (generation_kind in ('scheduled', 'manual')),
  reason text,
  generated_by uuid references public.profiles (id),
  generated_at timestamptz not null default now(),
  unique (branch_id, business_date, version)
);
comment on table public.daily_analytics_snapshots is
  'Immutable, versioned daily snapshots. A regeneration inserts a new version; rows are never updated or deleted. source_latest_at is the newest source row timestamp used, for stale detection.';

create table if not exists public.weekly_analytics_snapshots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  week_start date not null check (extract(isodow from week_start) = 1),
  version integer not null check (version >= 1),
  payload jsonb not null,
  payload_hash text not null,
  source_latest_at timestamptz,
  week_complete boolean not null,
  generation_kind text not null check (generation_kind in ('scheduled', 'manual')),
  reason text,
  generated_by uuid references public.profiles (id),
  generated_at timestamptz not null default now(),
  unique (branch_id, week_start, version)
);
comment on table public.weekly_analytics_snapshots is
  'Immutable, versioned weekly snapshots (Monday..Sunday, Istanbul). Never updated or deleted; a new generation is a new version.';

create table if not exists public.analytics_insights (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  scope text not null check (scope in ('daily', 'weekly')),
  business_date date,
  week_start date,
  daily_snapshot_id uuid references public.daily_analytics_snapshots (id),
  weekly_snapshot_id uuid references public.weekly_analytics_snapshots (id),
  confidence text not null check (confidence in ('fact', 'relationship', 'hypothesis')),
  code text not null check (code ~ '^[a-z][a-z0-9_]{2,59}$'),
  title text not null,
  body text,
  evidence jsonb not null default '{}'::jsonb,
  is_financial boolean not null default true,
  origin text not null default 'deterministic' check (origin in ('deterministic', 'ai')),
  created_at timestamptz not null default now(),
  constraint analytics_insights_scope_shape check (
    (scope = 'daily' and business_date is not null and daily_snapshot_id is not null and weekly_snapshot_id is null)
    or (scope = 'weekly' and week_start is not null and weekly_snapshot_id is not null and daily_snapshot_id is null)
  ),
  -- a deterministic insight can be a fact or a relationship, never a hypothesis
  constraint analytics_insights_hypothesis_ai_only check (confidence <> 'hypothesis' or origin = 'ai')
);
create index if not exists idx_analytics_insights_daily on public.analytics_insights (daily_snapshot_id);
create index if not exists idx_analytics_insights_weekly on public.analytics_insights (weekly_snapshot_id);

create table if not exists public.analytics_reports (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  week_start date not null check (extract(isodow from week_start) = 1),
  weekly_snapshot_id uuid not null references public.weekly_analytics_snapshots (id),
  version integer not null check (version >= 1),
  status text not null check (status in ('generated', 'failed', 'invalid')),
  contract_version integer not null default 1,
  input_facts jsonb not null,
  input_hash text not null,
  output jsonb,
  model text,
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]{1,59}$'),
  generated_by uuid references public.profiles (id),
  generated_at timestamptz not null default now(),
  unique (branch_id, week_start, version),
  constraint analytics_reports_status_shape check (
    (status = 'generated' and output is not null and error_code is null)
    or (status in ('failed', 'invalid') and output is null and error_code is not null)
  ),
  constraint analytics_reports_output_shape check (
    output is null or (jsonb_typeof(output -> 'claims') = 'array' and output ? 'summary')
  )
);
comment on table public.analytics_reports is
  'AI interpretation of ONE weekly snapshot. input_facts is the exact structured JSON the model received; output is stored only if it passed schema/provenance validation (status generated). Immutable and versioned. A failed/invalid generation is recorded but never blocks analytics.';

-- immutability
create or replace function public.analytics_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% rows are immutable: insert a new version instead', tg_table_name using errcode = '42501';
end;
$$;
create trigger daily_analytics_snapshots_immutable before update or delete on public.daily_analytics_snapshots
  for each row execute function public.analytics_block_mutation();
create trigger weekly_analytics_snapshots_immutable before update or delete on public.weekly_analytics_snapshots
  for each row execute function public.analytics_block_mutation();
create trigger analytics_insights_immutable before update or delete on public.analytics_insights
  for each row execute function public.analytics_block_mutation();
create trigger analytics_reports_immutable before update or delete on public.analytics_reports
  for each row execute function public.analytics_block_mutation();

-- -----------------------------------------------------------------------------
-- 4. RLS: clients read only what their permission and branch scope allow;
--    nothing is writable by clients (writes go through the RPCs below).
-- -----------------------------------------------------------------------------
alter table public.external_context_daily enable row level security;
alter table public.daily_analytics_snapshots enable row level security;
alter table public.weekly_analytics_snapshots enable row level security;
alter table public.analytics_insights enable row level security;
alter table public.analytics_reports enable row level security;

revoke all on public.external_context_daily, public.daily_analytics_snapshots,
  public.weekly_analytics_snapshots, public.analytics_insights, public.analytics_reports
  from anon, authenticated;
grant select on public.external_context_daily, public.daily_analytics_snapshots,
  public.weekly_analytics_snapshots, public.analytics_insights, public.analytics_reports
  to authenticated;

create policy external_context_daily_select on public.external_context_daily
  for select to authenticated
  using (
    public.current_user_has_permission('analytics.read')
    and (branch_id is null or public.analytics_can('analytics.read', branch_id))
  );
-- snapshots contain revenue, so the table itself needs the financial permission;
-- analytics.read-only callers use get_daily_analytics()/get_weekly_analytics() (redacted).
create policy daily_analytics_snapshots_select on public.daily_analytics_snapshots
  for select to authenticated
  using (public.analytics_can('analytics.financial.read', branch_id));
create policy weekly_analytics_snapshots_select on public.weekly_analytics_snapshots
  for select to authenticated
  using (public.analytics_can('analytics.financial.read', branch_id));
create policy analytics_insights_select on public.analytics_insights
  for select to authenticated
  using (
    public.analytics_can(case when is_financial then 'analytics.financial.read' else 'analytics.read' end, branch_id)
  );
create policy analytics_reports_select on public.analytics_reports
  for select to authenticated
  using (public.analytics_can('analytics.ai.read', branch_id));

-- -----------------------------------------------------------------------------
-- 5. Deterministic core
-- -----------------------------------------------------------------------------
create or replace function public.analytics_metric(p_state text, p_value numeric, p_reason text default null)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object('state', p_state, 'value', p_value, 'reason', p_reason));
$$;
revoke all on function public.analytics_metric(text, numeric, text) from public, anon;
grant execute on function public.analytics_metric(text, numeric, text) to authenticated, service_role;

-- Comparison of a current value against a baseline value. A percentage is only produced from a
-- real, final, comparable, non-trivial base:
--   not_final             the CURRENT period is provisional (X only / week in progress)
--   no_baseline           the baseline period has no data (never a fabricated 0)
--   baseline_not_final    the baseline period is provisional
--   mixed_origin          native and legacy-imported data would be compared on a metric the legacy source cannot support
--   insufficient_samples  baseline built from too few comparable days
--   zero_base             baseline is 0 -> percentage undefined
--   low_base              baseline below the low-volume threshold -> delta only, no percentage
--   ok                    delta and percentage (mixedOrigin flag when native and legacy data were mixed)
create or replace function public.analytics_compare(
  p_current numeric,
  p_baseline numeric,
  p_baseline_has_data boolean,
  p_low_base numeric,
  p_samples integer default null,
  p_min_samples integer default null,
  p_current_final boolean default true,
  p_baseline_final boolean default true,
  p_mixed boolean default false,
  p_block_mixed boolean default false
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_extra jsonb := case when p_mixed then jsonb_build_object('mixedOrigin', true) else '{}'::jsonb end;
begin
  if not coalesce(p_current_final, false) then
    return jsonb_build_object('state', 'not_final');
  end if;
  if not coalesce(p_baseline_has_data, false) then
    return jsonb_build_object('state', 'no_baseline');
  end if;
  if not coalesce(p_baseline_final, false) then
    return jsonb_build_object('state', 'baseline_not_final');
  end if;
  if p_baseline is null then
    return jsonb_build_object('state', 'no_baseline');
  end if;
  if p_block_mixed and p_mixed then
    return jsonb_build_object('state', 'mixed_origin');
  end if;
  if p_min_samples is not null and coalesce(p_samples, 0) < p_min_samples then
    return jsonb_build_object('state', 'insufficient_samples', 'samples', p_samples) || v_extra;
  end if;
  if p_current is null then
    return jsonb_build_object('state', 'no_current', 'baseline', round(p_baseline, 2)) || v_extra;
  end if;
  if p_baseline = 0 then
    return jsonb_strip_nulls(jsonb_build_object('state', 'zero_base', 'baseline', 0,
      'delta', round(p_current, 2), 'samples', p_samples)) || v_extra;
  end if;
  if p_baseline < p_low_base then
    return jsonb_strip_nulls(jsonb_build_object('state', 'low_base', 'baseline', round(p_baseline, 2),
      'delta', round(p_current - p_baseline, 2), 'samples', p_samples)) || v_extra;
  end if;
  return jsonb_strip_nulls(jsonb_build_object('state', 'ok', 'baseline', round(p_baseline, 2),
    'delta', round(p_current - p_baseline, 2),
    'pct', round((p_current - p_baseline) / p_baseline * 100, 1), 'samples', p_samples)) || v_extra;
end;
$$;
revoke all on function public.analytics_compare(numeric, numeric, boolean, numeric, integer, integer, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.analytics_compare(numeric, numeric, boolean, numeric, integer, integer, boolean, boolean, boolean, boolean) to authenticated, service_role;

-- capability / completeness entry: status complete | partial | unsupported plus reason codes
create or replace function public.analytics_cap(p_status text, p_reasons text[] default '{}')
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object('status', p_status, 'reasons', to_jsonb(coalesce(p_reasons, '{}'::text[])));
$$;
revoke all on function public.analytics_cap(text, text[]) from public, anon;
grant execute on function public.analytics_cap(text, text[]) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Day core. Revenue is computed at BUSINESS-DAY level, never per shift:
--   morning = X, evening = Z; Z is a cumulative register total that already includes X, so X and Z
--   are never two independent revenues.
--   FINALIZED  : a non-cancelled Z exists  -> revenue = Z exactly (never normalized by X; Z < X keeps Z + z_below_x warning)
--   PROVISIONAL: only an X exists          -> finalized revenue is NULL, X is exposed as provisionalRevenue; the day is NOT final
--   NO_DATA    : no active reading
-- Inherited behaviour: when several active readings of one type exist (several registers or shifts),
-- the LATEST (submitted_at, id) wins; a `multiple_active_readings` warning is emitted.
--
-- Line detail (category / product) is deliberately NOT reconciled with the revenue rule: whether Z item
-- lines are cumulative of X is an open owner decision. With one reading only its lines are shown as
-- reported (partial); with both readings the detail is `unsupported` (xz_line_semantics_unknown).
-- Legacy-imported readings never support product detail or gross profit (legacy_source_limitation).
-- -----------------------------------------------------------------------------
create or replace function public.analytics_compute_day(p_branch_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  with
  shifts_d as (
    select s.id from public.shifts s where s.branch_id = p_branch_id and s.business_date = p_date
  ),
  all_reports as (
    select r.*, (l.sales_report_id is not null) as is_legacy
    from public.sales_reports r
    join shifts_d s on s.id = r.shift_id
    left join public.legacy_sales_report_links l on l.sales_report_id = r.id
  ),
  active as (select * from all_reports where status <> 'cancelled'),
  xr as (select * from active where report_type = 'X' order by submitted_at desc, id desc limit 1),
  zr as (select * from active where report_type = 'Z' order by submitted_at desc, id desc limit 1),
  rd as (
    select (select count(*) from xr) > 0 as has_x, (select count(*) from zr) > 0 as has_z,
           (select gross_revenue from xr) as x_rev, (select gross_revenue from zr) as z_rev,
           (select transaction_count from xr) as x_tx, (select transaction_count from zr) as z_tx,
           (select count(*) from active where report_type = 'X') as x_n,
           (select count(*) from active where report_type = 'Z') as z_n
  ),
  calc as (
    select rd.*,
      case when has_z then 'finalized' when has_x then 'provisional' else 'no_data' end as fin,
      case when has_z then z_rev when has_x then x_rev else 0 end as revenue,
      case when has_z then z_tx when has_x then x_tx else null end as tx
    from rd
  ),
  org as (
    select case when count(*) = 0 then 'none'
                when bool_and(is_legacy) then 'legacy_import'
                when bool_or(is_legacy) then 'mixed' else 'native' end as o
    from (select is_legacy from xr union all select is_legacy from zr) u
  ),
  xl as (select i.* from public.sales_report_items i join xr on i.sales_report_id = xr.id),
  zl as (select i.* from public.sales_report_items i join zr on i.sales_report_id = zr.id),
  -- capability of category / product line detail (see the header comment)
  cap as (
    select
      (exists (select 1 from xl) or exists (select 1 from zl)) as any_lines,
      (exists (select 1 from xl where inventory_item_id is not null) or exists (select 1 from zl where inventory_item_id is not null)) as any_product_lines,
      (select o from org) as origin
  ),
  detail as (
    select
      c.any_lines, c.any_product_lines, c.origin, calc.has_x, calc.has_z,
      case when not c.any_lines then 'unavailable'
           when calc.has_x and calc.has_z then 'unsupported'
           else 'partial' end as cat_state,
      case when c.origin in ('legacy_import', 'mixed') then 'unsupported'
           when not c.any_product_lines then 'unavailable'
           when calc.has_x and calc.has_z then 'unsupported'
           else 'partial' end as prod_state
    from cap c cross join calc
  ),
  emit as (
    select * from xl where (select has_x and not has_z from calc)
    union all
    select * from zl where (select has_z and not has_x from calc)
  ),
  cat_agg as (
    select c.id as category_id, c.key, c.name, sum(e.amount) as revenue,
           sum(e.quantity) filter (where e.inventory_item_id is null) as quantity,
           bool_or(e.quantity is null and e.inventory_item_id is null) as quantity_missing
    from emit e join public.sales_categories c on c.id = e.category_id
    where (select cat_state from detail) = 'partial'
    group by c.id, c.key, c.name
  ),
  prod_cost as (
    select m.inventory_item_id,
           sum(m.quantity * m.unit_cost_snapshot) / nullif(sum(m.quantity), 0) as unit_cost
    from public.inventory_movements m
    join active a on a.id = m.sales_report_id
    where m.movement_type = 'SALE' and m.unit_cost_snapshot is not null
    group by m.inventory_item_id
  ),
  prod_agg as (
    select it.id as item_id, it.code, it.name, it.unit, sum(e.amount) as revenue,
           sum(e.inventory_quantity) as quantity, pc.unit_cost
    from emit e
    join public.inventory_items it on it.id = e.inventory_item_id
    left join prod_cost pc on pc.inventory_item_id = it.id
    where e.inventory_item_id is not null and (select prod_state from detail) = 'partial'
    group by it.id, it.code, it.name, it.unit, pc.unit_cost
  ),
  costed as (
    select coalesce(sum(revenue), 0) as covered_revenue,
           coalesce(sum(revenue - quantity * unit_cost), 0) as gross_profit
    from prod_agg where unit_cost is not null and quantity is not null
  ),
  src as (
    select greatest(
      (select max(updated_at) from all_reports),
      (select max(i.updated_at) from public.sales_report_items i join all_reports r on r.id = i.sales_report_id)
    ) as latest_at
  ),
  -- metric objects
  m as (
    select
      c.fin, c.revenue, c.tx, c.x_rev, c.has_x, c.has_z,
      (select o from org) as origin,
      case when c.fin = 'no_data' then 'no_reports'
           when c.tx is null then 'transaction_count_missing' else null end as tx_missing,
      case
        when c.fin = 'no_data' then public.analytics_metric('unavailable', null, 'no_reports')
        when c.tx is null then public.analytics_metric('unavailable', null, 'transaction_count_missing')
        when c.fin = 'provisional' then public.analytics_metric('partial', c.tx, 'missing_z')
        else public.analytics_metric('available', c.tx) end as tx_metric,
      case
        when c.fin = 'no_data' then public.analytics_metric('unavailable', null, 'no_reports')
        when c.fin = 'provisional' then public.analytics_metric('unavailable', null, 'missing_z')
        when c.tx is null then public.analytics_metric('unavailable', null, 'transaction_count_missing')
        when c.tx = 0 then public.analytics_metric('unavailable', null, 'zero_transactions')
        else public.analytics_metric('available', round(c.revenue / c.tx, 2)) end as basket_metric,
      case when c.fin = 'provisional' then public.analytics_metric('unavailable', null, 'missing_z')
           else public.analytics_metric('available', round(c.revenue, 2)) end as rev_metric
    from calc c
  ),
  gp as (
    select case
      when (select prod_state from detail) = 'unsupported'
        then public.analytics_metric('unsupported', null,
               case when (select origin from detail) in ('legacy_import', 'mixed') then 'legacy_source_limitation' else 'xz_line_semantics_unknown' end)
      when (select prod_state from detail) = 'unavailable' then public.analytics_metric('unavailable', null, 'missing_product_detail')
      when (select covered_revenue from costed) <= 0 then public.analytics_metric('unavailable', null, 'missing_cost')
      else public.analytics_metric('partial', round((select gross_profit from costed), 2),
             case when (select covered_revenue from costed) + 0.005 < (select revenue from calc) then 'missing_cost' else 'line_semantics_unverified' end)
      end as metric
  )
  select jsonb_build_object(
    'date', p_date,
    'hasData', (select fin from calc) <> 'no_data',
    'finalization', (select fin from calc),
    'origin', (select o from org),
    'sourceLatestAt', (select latest_at from src),
    'reports', jsonb_build_object(
      'active', (select count(*) from active),
      'cancelled', (select count(*) from all_reports where status = 'cancelled'),
      'x', (select x_n from calc), 'z', (select z_n from calc),
      'reconciliation', jsonb_build_object(
        'OK', (select count(*) from active where reconciliation_status = 'OK'),
        'WARNING', (select count(*) from active where reconciliation_status = 'WARNING'),
        'ERROR', (select count(*) from active where reconciliation_status = 'ERROR'))),
    'readings', jsonb_build_object(
      'x', jsonb_build_object('present', (select has_x from calc), 'revenue', (select x_rev from calc), 'transactions', (select x_tx from calc)),
      'z', jsonb_build_object('present', (select has_z from calc), 'revenue', (select z_rev from calc), 'transactions', (select z_tx from calc))),
    'warnings', (
      select coalesce(jsonb_agg(w), '[]'::jsonb) from (
        select jsonb_build_object('code', 'multiple_active_readings', 'type', 'X', 'count', (select x_n from calc)) as w where (select x_n from calc) > 1
        union all
        select jsonb_build_object('code', 'multiple_active_readings', 'type', 'Z', 'count', (select z_n from calc)) where (select z_n from calc) > 1
        union all
        select jsonb_build_object('code', 'z_below_x')
          where (select has_x and has_z and z_rev < x_rev from calc)
      ) q),
    'volume', jsonb_build_object(
      'transactions', (select tx_metric from m),
      'itemQuantity',
        case when (select cat_state from detail) = 'unsupported' then public.analytics_metric('unsupported', null, 'xz_line_semantics_unknown')
             when not exists (select 1 from cat_agg where quantity is not null) then public.analytics_metric('unavailable', null, 'missing_category_detail')
             else public.analytics_metric('partial', (select sum(quantity) from cat_agg),
                    case when (select has_z from calc) then 'z_line_semantics_unverified' else 'missing_z' end) end,
      'categories', coalesce((select jsonb_agg(jsonb_build_object(
          'categoryId', category_id, 'key', key, 'name', name, 'quantity', quantity,
          'quantityMissing', coalesce(quantity_missing, false)) order by key) from cat_agg), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(jsonb_build_object(
          'inventoryItemId', item_id, 'code', code, 'name', name, 'unit', unit, 'quantity', quantity) order by code) from prod_agg), '[]'::jsonb)),
    'financial', jsonb_build_object(
      'grossRevenue', (select rev_metric from m),
      'provisionalRevenue', case when (select fin from calc) = 'provisional' then round((select x_rev from calc), 2) end,
      'averageBasket', (select basket_metric from m),
      'categories', coalesce((select jsonb_agg(jsonb_build_object(
          'categoryId', category_id, 'key', key, 'name', name, 'revenue', round(revenue, 2),
          'share', case when (select revenue from calc) > 0 then round(revenue / (select revenue from calc), 4) end)
          order by key) from cat_agg), '[]'::jsonb),
      'products', coalesce((select jsonb_agg(jsonb_build_object(
          'inventoryItemId', item_id, 'code', code, 'name', name, 'unit', unit, 'quantity', quantity,
          'revenue', round(revenue, 2),
          'averageUnitPrice', case when quantity > 0 then round(revenue / quantity, 4) end,
          'unitCost', round(unit_cost, 4),
          'costState', case when unit_cost is null then 'uncosted' else 'costed' end,
          'grossProfit', case when unit_cost is not null and quantity is not null then round(revenue - quantity * unit_cost, 2) end)
          order by code) from prod_agg), '[]'::jsonb),
      'grossProfit', jsonb_build_object(
        'grossOnly', true,
        'metric', (select metric from gp),
        'coveredRevenue', round((select covered_revenue from costed), 2),
        'uncoveredRevenue', round(greatest((select revenue from calc) - (select covered_revenue from costed), 0), 2))),
    'capabilities', jsonb_build_object(
      'revenue', case (select fin from calc)
          when 'finalized' then public.analytics_cap('complete')
          when 'provisional' then public.analytics_cap('partial', array['missing_z'])
          else public.analytics_cap('partial', array['no_reports']) end,
      'transactions', case
          when (select fin from calc) = 'no_data' then public.analytics_cap('partial', array['no_reports'])
          when (select tx from calc) is null then public.analytics_cap('partial',
              array['missing_transaction_count'] || case when (select o from org) in ('legacy_import', 'mixed') then array['legacy_source_limitation'] else '{}'::text[] end)
          when (select fin from calc) = 'provisional' then public.analytics_cap('partial', array['missing_z'])
          else public.analytics_cap('complete') end,
      'averageBasket', case
          when (select fin from calc) = 'no_data' then public.analytics_cap('partial', array['no_reports'])
          when (select tx from calc) is null then public.analytics_cap('partial',
              array['missing_transaction_count'] || case when (select o from org) in ('legacy_import', 'mixed') then array['legacy_source_limitation'] else '{}'::text[] end)
          when (select tx from calc) = 0 then public.analytics_cap('partial', array['zero_transactions'])
          when (select fin from calc) = 'provisional' then public.analytics_cap('partial', array['missing_z'])
          else public.analytics_cap('complete') end,
      'categories', case (select cat_state from detail)
          when 'unavailable' then public.analytics_cap('partial', array['missing_category_detail'])
          when 'unsupported' then public.analytics_cap('unsupported', array['xz_line_semantics_unknown'])
          else public.analytics_cap('partial', array[case when (select has_z from calc) then 'z_line_semantics_unverified' else 'missing_z' end]) end,
      'products', case (select prod_state from detail)
          when 'unavailable' then public.analytics_cap('partial', array['missing_product_detail'])
          when 'unsupported' then public.analytics_cap('unsupported', array[case when (select o from org) in ('legacy_import', 'mixed') then 'legacy_source_limitation' else 'xz_line_semantics_unknown' end])
          else public.analytics_cap('partial', array[case when (select has_z from calc) then 'z_line_semantics_unverified' else 'missing_z' end]) end,
      'grossProfit', case (select metric ->> 'state' from gp)
          when 'unsupported' then public.analytics_cap('unsupported', array[(select metric ->> 'reason' from gp)])
          when 'unavailable' then public.analytics_cap('partial', array[(select metric ->> 'reason' from gp)])
          else public.analytics_cap('partial', array[(select metric ->> 'reason' from gp)]) end,
      'hourly', public.analytics_cap('unsupported', array['no_hourly_source']))
  ) into v_result;
  return v_result;
end;
$$;
comment on function public.analytics_compute_day(uuid, date) is
  'INTERNAL deterministic day metrics for one branch/business_date. Business-day X/Z rule (FINALIZED by Z, PROVISIONAL with X only), line detail only where its X/Z semantics are not unknown, origin-aware (legacy imports never support product detail or gross profit). No authorization: callable only by service_role and by the definer RPCs below.';
revoke all on function public.analytics_compute_day(uuid, date) from public, anon, authenticated;
grant execute on function public.analytics_compute_day(uuid, date) to service_role;

create or replace function public.analytics_source_latest_at(p_branch_id uuid, p_from date, p_to date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(max(r.updated_at), max(i.updated_at))
  from public.shifts s
  join public.sales_reports r on r.shift_id = s.id
  left join public.sales_report_items i on i.sales_report_id = r.id
  where s.branch_id = p_branch_id and s.business_date between p_from and p_to
    and public.analytics_can('analytics.read', p_branch_id);
$$;
revoke all on function public.analytics_source_latest_at(uuid, date, date) from public, anon;
grant execute on function public.analytics_source_latest_at(uuid, date, date) to authenticated;

create or replace function public.analytics_internal_source_latest_at(p_branch_id uuid, p_from date, p_to date)
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select greatest(max(r.updated_at), max(i.updated_at))
  from public.shifts s
  join public.sales_reports r on r.shift_id = s.id
  left join public.sales_report_items i on i.sales_report_id = r.id
  where s.branch_id = p_branch_id and s.business_date between p_from and p_to;
$$;
revoke all on function public.analytics_internal_source_latest_at(uuid, date, date) from public, anon, authenticated;
grant execute on function public.analytics_internal_source_latest_at(uuid, date, date) to service_role;

-- context row for a branch/date (branch row wins over the all-branch row)
create or replace function public.analytics_context_for(p_branch_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'state', 'present',
      'temperatureC', c.temperature_c, 'apparentTemperatureC', c.apparent_temperature_c,
      'precipitationMm', c.precipitation_mm, 'windKmh', c.wind_kmh,
      'isWeekend', c.is_weekend, 'isPublicHoliday', c.is_public_holiday, 'holidayName', c.holiday_name,
      'payPeriodTag', c.pay_period_tag, 'specialEvent', c.special_event, 'source', c.source))
    from public.external_context_daily c
    where c.context_date = p_date and (c.branch_id = p_branch_id or c.branch_id is null)
    order by (c.branch_id is not null) desc
    limit 1
  ), jsonb_build_object('state', 'missing', 'isWeekend', extract(isodow from p_date) in (6, 7)));
$$;
revoke all on function public.analytics_context_for(uuid, date) from public, anon, authenticated;
grant execute on function public.analytics_context_for(uuid, date) to service_role;

-- -----------------------------------------------------------------------------
-- 6. Daily snapshot payload (comparisons + context + completeness)
-- -----------------------------------------------------------------------------
-- distinct reason codes of a capability map (+ the context capability)
create or replace function public.analytics_completeness(p_caps jsonb, p_has_data boolean)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'overall', case when not p_has_data then 'no_data'
                    when p_caps #>> '{revenue,status}' = 'complete' and p_caps #>> '{transactions,status}' = 'complete' then 'complete'
                    else 'partial' end,
    'reasons', coalesce((select jsonb_agg(r order by r) from (
        select distinct r from jsonb_each(p_caps) e, jsonb_array_elements_text(e.value -> 'reasons') r) q), '[]'::jsonb),
    'metrics', p_caps);
$$;
revoke all on function public.analytics_completeness(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.analytics_completeness(jsonb, boolean) to service_role;

create or replace function public.analytics_build_daily(p_branch_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_params jsonb := public.analytics_params();
  v_cur jsonb := public.analytics_compute_day(p_branch_id, p_date);
  v_prev jsonb := public.analytics_compute_day(p_branch_id, p_date - 1);
  v_pw jsonb := public.analytics_compute_day(p_branch_id, p_date - 7);
  v_ctx jsonb := public.analytics_context_for(p_branch_id, p_date);
  v_lowrev numeric := (v_params ->> 'lowVolumeBaseRevenue')::numeric;
  v_lowtx numeric := (v_params ->> 'lowVolumeBaseTransactions')::numeric;
  v_minsamples integer := (v_params ->> 'minBaselineSamples')::integer;
  v_origin text := v_cur ->> 'origin';
  v_final boolean := v_cur ->> 'finalization' = 'finalized';
  v_k integer;
  v_d jsonb;
  v_n integer := 0; v_rev_sum numeric := 0; v_rev_mixed boolean := false;
  v_tx_n integer := 0; v_tx_sum numeric := 0; v_tx_mixed boolean := false;
  v_b_n integer := 0; v_b_sum numeric := 0; v_b_mixed boolean := false;
  v_cur_rev numeric := (v_cur #>> '{financial,grossRevenue,value}')::numeric;
  v_cur_tx numeric := case when v_cur #>> '{volume,transactions,state}' = 'available' then (v_cur #>> '{volume,transactions,value}')::numeric end;
  v_cur_basket numeric := case when v_cur #>> '{financial,averageBasket,state}' = 'available' then (v_cur #>> '{financial,averageBasket,value}')::numeric end;
  v_caps jsonb;
begin
  -- baseline: only FINALIZED same-weekday days with data (a provisional X-only day is never a baseline)
  for v_k in 1 .. (v_params ->> 'baselineWeeks')::integer loop
    v_d := public.analytics_compute_day(p_branch_id, p_date - 7 * v_k);
    if v_d ->> 'finalization' = 'finalized' then
      v_n := v_n + 1;
      v_rev_sum := v_rev_sum + (v_d #>> '{financial,grossRevenue,value}')::numeric;
      v_rev_mixed := v_rev_mixed or public.analytics_origin_mixed(v_origin, v_d ->> 'origin');
      if v_d #>> '{volume,transactions,state}' = 'available' then
        v_tx_sum := v_tx_sum + (v_d #>> '{volume,transactions,value}')::numeric; v_tx_n := v_tx_n + 1;
        v_tx_mixed := v_tx_mixed or public.analytics_origin_mixed(v_origin, v_d ->> 'origin');
      end if;
      if v_d #>> '{financial,averageBasket,state}' = 'available' then
        v_b_sum := v_b_sum + (v_d #>> '{financial,averageBasket,value}')::numeric; v_b_n := v_b_n + 1;
        v_b_mixed := v_b_mixed or public.analytics_origin_mixed(v_origin, v_d ->> 'origin');
      end if;
    end if;
  end loop;

  v_caps := (v_cur -> 'capabilities') || jsonb_build_object('context',
    case when v_ctx ->> 'state' = 'present' then public.analytics_cap('complete') else public.analytics_cap('partial', array['missing_context']) end);

  return jsonb_build_object(
    'schemaVersion', 2,
    'scope', 'daily',
    'branchId', p_branch_id,
    'businessDate', p_date,
    'isoWeekday', extract(isodow from p_date),
    'timezone', 'Europe/Istanbul',
    'params', v_params,
    'finalization', v_cur -> 'finalization',
    'origin', v_cur -> 'origin',
    'sourceLatestAt', v_cur -> 'sourceLatestAt',
    'hasData', v_cur -> 'hasData',
    'reports', v_cur -> 'reports',
    'readings', v_cur -> 'readings',
    'warnings', v_cur -> 'warnings',
    'volume', v_cur -> 'volume',
    'financial', v_cur -> 'financial',
    'context', v_ctx,
    'completeness', public.analytics_completeness(v_caps, (v_cur ->> 'hasData')::boolean),
    'volumeComparisons', jsonb_build_object(
      'transactions', jsonb_build_object(
        'previousDay', public.analytics_compare(v_cur_tx,
          case when v_prev #>> '{volume,transactions,state}' = 'available' then (v_prev #>> '{volume,transactions,value}')::numeric end,
          v_prev #>> '{volume,transactions,state}' = 'available', v_lowtx, null, null, v_final,
          v_prev ->> 'finalization' = 'finalized', public.analytics_origin_mixed(v_origin, v_prev ->> 'origin'), true),
        'previousWeekSameWeekday', public.analytics_compare(v_cur_tx,
          case when v_pw #>> '{volume,transactions,state}' = 'available' then (v_pw #>> '{volume,transactions,value}')::numeric end,
          v_pw #>> '{volume,transactions,state}' = 'available', v_lowtx, null, null, v_final,
          v_pw ->> 'finalization' = 'finalized', public.analytics_origin_mixed(v_origin, v_pw ->> 'origin'), true),
        'baseline4SameWeekday', public.analytics_compare(v_cur_tx, case when v_tx_n > 0 then v_tx_sum / v_tx_n end,
          v_tx_n > 0, v_lowtx, v_tx_n, v_minsamples, v_final, true, v_tx_mixed, true))),
    'financialComparisons', jsonb_build_object(
      'grossRevenue', jsonb_build_object(
        'previousDay', public.analytics_compare(v_cur_rev, (v_prev #>> '{financial,grossRevenue,value}')::numeric,
          (v_prev ->> 'hasData')::boolean, v_lowrev, null, null, v_final, v_prev ->> 'finalization' = 'finalized',
          public.analytics_origin_mixed(v_origin, v_prev ->> 'origin'), false),
        'previousWeekSameWeekday', public.analytics_compare(v_cur_rev, (v_pw #>> '{financial,grossRevenue,value}')::numeric,
          (v_pw ->> 'hasData')::boolean, v_lowrev, null, null, v_final, v_pw ->> 'finalization' = 'finalized',
          public.analytics_origin_mixed(v_origin, v_pw ->> 'origin'), false),
        'baseline4SameWeekday', public.analytics_compare(v_cur_rev, case when v_n > 0 then v_rev_sum / v_n end,
          v_n > 0, v_lowrev, v_n, v_minsamples, v_final, true, v_rev_mixed, false)),
      'averageBasket', jsonb_build_object(
        'previousDay', public.analytics_compare(v_cur_basket,
          case when v_prev #>> '{financial,averageBasket,state}' = 'available' then (v_prev #>> '{financial,averageBasket,value}')::numeric end,
          v_prev #>> '{financial,averageBasket,state}' = 'available', 0, null, null, v_final,
          v_prev ->> 'finalization' = 'finalized', public.analytics_origin_mixed(v_origin, v_prev ->> 'origin'), true),
        'previousWeekSameWeekday', public.analytics_compare(v_cur_basket,
          case when v_pw #>> '{financial,averageBasket,state}' = 'available' then (v_pw #>> '{financial,averageBasket,value}')::numeric end,
          v_pw #>> '{financial,averageBasket,state}' = 'available', 0, null, null, v_final,
          v_pw ->> 'finalization' = 'finalized', public.analytics_origin_mixed(v_origin, v_pw ->> 'origin'), true),
        'baseline4SameWeekday', public.analytics_compare(v_cur_basket, case when v_b_n > 0 then v_b_sum / v_b_n end,
          v_b_n > 0, 0, v_b_n, v_minsamples, v_final, true, v_b_mixed, true))),
    'baselineSamples', jsonb_build_object('sameWeekdayFinalizedDays', v_n, 'of', (v_params ->> 'baselineWeeks')::integer),
    'peakHour', jsonb_build_object('state', 'unsupported',
      'reason', 'sales reports are shift-level readings; no per-transaction or hourly timestamps exist in the source')
  );
end;
$$;
revoke all on function public.analytics_build_daily(uuid, date) from public, anon, authenticated;
grant execute on function public.analytics_build_daily(uuid, date) to service_role;

-- -----------------------------------------------------------------------------
-- 7. Weather / context relationship (weekday-adjusted, never causal; FINALIZED days only)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_weather_effect(p_branch_id uuid, p_from date, p_to date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_params jsonb := public.analytics_params();
  v_min integer := (v_params ->> 'minCorrelationSamples')::integer;
  v_min_group integer := (v_params ->> 'minGroupSamples')::integer;
  v_rain numeric := (v_params ->> 'rainMmThreshold')::numeric;
  v_with_ctx integer;
  v_n integer;
  v_corr numeric;
  v_rainy integer; v_dry integer;
  v_rainy_mean numeric; v_dry_mean numeric;
begin
  with ctx as (
    select d::date as dt, extract(isodow from d)::integer as dow, c.temperature_c as temp, c.precipitation_mm as precip
    from generate_series(p_from, p_to, interval '1 day') d
    join lateral (
      select * from public.external_context_daily x
      where x.context_date = d::date and (x.branch_id = p_branch_id or x.branch_id is null)
      order by (x.branch_id is not null) desc limit 1
    ) c on true
  ),
  comp as (select ctx.*, public.analytics_compute_day(p_branch_id, ctx.dt) as j from ctx),
  rev as (
    select dt, dow, temp, precip, (j #>> '{financial,grossRevenue,value}')::numeric as rev
    from comp where j ->> 'finalization' = 'finalized'
  ),
  idx as (select dt, temp, precip, rev / nullif(avg(rev) over (partition by dow), 0) as i from rev)
  select (select count(*) from rev),
         count(*) filter (where i is not null and temp is not null),
         corr(i, temp) filter (where i is not null and temp is not null),
         count(*) filter (where i is not null and precip is not null and precip >= v_rain),
         count(*) filter (where i is not null and precip is not null and precip < v_rain),
         avg(i) filter (where i is not null and precip is not null and precip >= v_rain),
         avg(i) filter (where i is not null and precip is not null and precip < v_rain)
    into v_with_ctx, v_n, v_corr, v_rainy, v_dry, v_rainy_mean, v_dry_mean
  from idx;

  if v_with_ctx = 0 then
    return jsonb_build_object('state', 'no_context', 'confidence', 'relationship', 'sample', 0);
  end if;
  if v_n < v_min then
    return jsonb_build_object('state', 'insufficient_sample', 'confidence', 'relationship',
      'sample', v_n, 'required', v_min, 'withContext', v_with_ctx);
  end if;

  return jsonb_strip_nulls(jsonb_build_object(
    'state', 'ok', 'confidence', 'relationship',
    'sample', v_n, 'required', v_min, 'withContext', v_with_ctx,
    'method', 'revenue index = day revenue / mean revenue of the same ISO weekday in the window (finalized days only)',
    'temperatureCorrelation', jsonb_build_object('r', round(v_corr, 3), 'n', v_n),
    'rainEffect', case when v_rainy >= v_min_group and v_dry >= v_min_group then jsonb_build_object(
        'rainyDays', v_rainy, 'dryDays', v_dry,
        'rainyIndex', round(v_rainy_mean, 3), 'dryIndex', round(v_dry_mean, 3),
        'differencePct', round((v_rainy_mean - v_dry_mean) / nullif(v_dry_mean, 0) * 100, 1))
      else jsonb_build_object('state', 'insufficient_group_sample', 'rainyDays', v_rainy, 'dryDays', v_dry, 'required', v_min_group) end,
    'caveat', 'Association between weather and weekday-adjusted revenue; it does not show that weather caused the difference.'));
end;
$$;
revoke all on function public.analytics_weather_effect(uuid, date, date) from public, anon, authenticated;
grant execute on function public.analytics_weather_effect(uuid, date, date) to service_role;

-- -----------------------------------------------------------------------------
-- 8. Weekly snapshot payload
-- -----------------------------------------------------------------------------
-- Aggregates seven day documents. A week is FINAL only when it has ended and none of its days with data
-- is provisional (X only): an X-only day can never make a week complete.
create or replace function public.analytics_week_totals(p_days jsonb, p_week_complete boolean)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_d jsonb;
  v_rows jsonb := '[]'::jsonb;
  v_with_data integer := 0; v_final_days integer := 0; v_prov_days integer := 0;
  v_rev numeric := 0; v_prov_rev numeric := 0;
  v_tx numeric := 0; v_tx_avail integer := 0; v_tx_partial integer := 0; v_tx_missing integer := 0;
  v_cov_rev numeric := 0; v_cov_tx numeric := 0; v_basket_days integer := 0;
  v_items numeric := 0; v_items_n integer := 0;
  v_gp numeric := 0; v_gp_cov numeric := 0; v_gp_partial integer := 0; v_gp_unsupported integer := 0;
  v_cat_partial integer := 0; v_cat_unsupported integer := 0;
  v_prod_partial integer := 0; v_prod_unsupported integer := 0;
  v_has_native boolean := false; v_has_legacy boolean := false;
  v_cats jsonb; v_prods jsonb;
  v_origin text;
  v_final boolean;
  v_tx_reasons text[] := '{}'; v_cat_reasons text[] := '{}'; v_prod_reasons text[] := '{}'; v_gp_reasons text[] := '{}';
  v_caps jsonb;
  v_tx_state text; v_basket_state text;
begin
  for v_d in select * from jsonb_array_elements(p_days) loop
    if (v_d ->> 'hasData')::boolean then
      v_with_data := v_with_data + 1;
      if v_d ->> 'finalization' = 'finalized' then v_final_days := v_final_days + 1; else v_prov_days := v_prov_days + 1; end if;
      v_rev := v_rev + coalesce((v_d #>> '{financial,grossRevenue,value}')::numeric, 0);
      v_prov_rev := v_prov_rev + coalesce((v_d #>> '{financial,provisionalRevenue}')::numeric, 0);
      if v_d ->> 'origin' in ('native', 'mixed') then v_has_native := true; end if;
      if v_d ->> 'origin' in ('legacy_import', 'mixed') then v_has_legacy := true; end if;
      case v_d #>> '{volume,transactions,state}'
        when 'available' then v_tx_avail := v_tx_avail + 1; v_tx := v_tx + (v_d #>> '{volume,transactions,value}')::numeric;
        when 'partial' then v_tx_partial := v_tx_partial + 1; v_tx := v_tx + (v_d #>> '{volume,transactions,value}')::numeric;
        else v_tx_missing := v_tx_missing + 1;
      end case;
      if (v_d #>> '{financial,averageBasket,value}') is not null and (v_d #>> '{volume,transactions,value}') is not null then
        v_basket_days := v_basket_days + 1;
        v_cov_rev := v_cov_rev + coalesce((v_d #>> '{financial,grossRevenue,value}')::numeric, 0);
        v_cov_tx := v_cov_tx + (v_d #>> '{volume,transactions,value}')::numeric;
      end if;
      if (v_d #>> '{volume,itemQuantity,value}') is not null then
        v_items := v_items + (v_d #>> '{volume,itemQuantity,value}')::numeric; v_items_n := v_items_n + 1;
      end if;
      case v_d #>> '{capabilities,categories,status}'
        when 'partial' then
          if v_d #>> '{financial,categories,0}' is not null then v_cat_partial := v_cat_partial + 1; end if;
        when 'unsupported' then v_cat_unsupported := v_cat_unsupported + 1;
        else null;
      end case;
      if v_d #>> '{capabilities,products,status}' = 'unsupported' then v_prod_unsupported := v_prod_unsupported + 1;
      elsif v_d #>> '{financial,products,0}' is not null then v_prod_partial := v_prod_partial + 1; end if;
      case v_d #>> '{financial,grossProfit,metric,state}'
        when 'partial' then v_gp_partial := v_gp_partial + 1; v_gp := v_gp + coalesce((v_d #>> '{financial,grossProfit,metric,value}')::numeric, 0);
        when 'unsupported' then v_gp_unsupported := v_gp_unsupported + 1;
        else null;
      end case;
      v_gp_cov := v_gp_cov + coalesce((v_d #>> '{financial,grossProfit,coveredRevenue}')::numeric, 0);
      v_cat_reasons := v_cat_reasons || coalesce(array(select jsonb_array_elements_text(v_d #> '{capabilities,categories,reasons}')), '{}');
      v_prod_reasons := v_prod_reasons || coalesce(array(select jsonb_array_elements_text(v_d #> '{capabilities,products,reasons}')), '{}');
      v_gp_reasons := v_gp_reasons || coalesce(array(select jsonb_array_elements_text(v_d #> '{capabilities,grossProfit,reasons}')), '{}');
      v_tx_reasons := v_tx_reasons || coalesce(array(select jsonb_array_elements_text(v_d #> '{capabilities,transactions,reasons}')), '{}');
    end if;
    v_rows := v_rows || jsonb_build_array(jsonb_build_object(
      'date', v_d -> 'date', 'hasData', v_d -> 'hasData', 'finalization', v_d -> 'finalization', 'origin', v_d -> 'origin',
      'grossRevenue', v_d #> '{financial,grossRevenue,value}',
      'provisionalRevenue', v_d #> '{financial,provisionalRevenue}',
      'transactions', v_d #> '{volume,transactions,value}',
      'averageBasket', v_d #> '{financial,averageBasket,value}'));
  end loop;

  v_origin := case when v_with_data = 0 then 'none' when v_has_native and v_has_legacy then 'mixed'
                   when v_has_legacy then 'legacy_import' else 'native' end;
  v_final := p_week_complete and v_with_data > 0 and v_prov_days = 0;

  select coalesce(jsonb_agg(jsonb_build_object('categoryId', cid, 'key', ckey, 'name', cname, 'revenue', round(rev, 2),
           'share', case when v_rev > 0 then round(rev / v_rev, 4) end) order by ckey), '[]'::jsonb) into v_cats
  from (
    select c ->> 'categoryId' as cid, c ->> 'key' as ckey, c ->> 'name' as cname, sum((c ->> 'revenue')::numeric) as rev
    from jsonb_array_elements(p_days) d, jsonb_array_elements(d -> 'financial' -> 'categories') c group by 1, 2, 3) t;
  select coalesce(jsonb_agg(jsonb_build_object('inventoryItemId', iid, 'code', icode, 'name', iname, 'unit', iunit,
           'quantity', qty, 'revenue', round(rev, 2), 'grossProfit', gp, 'costedDays', costed_days, 'days', n_days)
           order by rev desc, icode), '[]'::jsonb) into v_prods
  from (
    select p ->> 'inventoryItemId' as iid, p ->> 'code' as icode, p ->> 'name' as iname, p ->> 'unit' as iunit,
           sum((p ->> 'quantity')::numeric) as qty, sum((p ->> 'revenue')::numeric) as rev, sum((p ->> 'grossProfit')::numeric) as gp,
           count(*) filter (where p ->> 'costState' = 'costed') as costed_days, count(*) as n_days
    from jsonb_array_elements(p_days) d, jsonb_array_elements(d -> 'financial' -> 'products') p group by 1, 2, 3, 4) t;

  v_tx_state := case when v_with_data = 0 then 'unavailable'
                     when v_tx_avail + v_tx_partial = 0 then 'unavailable'
                     when v_tx_missing > 0 or v_tx_partial > 0 or not v_final then 'partial'
                     else 'available' end;
  v_basket_state := case when v_basket_days = 0 then 'unavailable'
                         when v_basket_days < v_with_data or v_prov_days > 0 or not v_final then 'partial'
                         else 'available' end;

  v_caps := jsonb_build_object(
    'revenue', case when v_final then public.analytics_cap('complete')
      else public.analytics_cap('partial', array_remove(array[
        case when v_with_data = 0 then 'no_reports' end,
        case when v_prov_days > 0 then 'missing_z' end,
        case when not p_week_complete then 'week_in_progress' end], null)) end,
    'transactions', case when v_tx_state = 'available' then public.analytics_cap('complete')
      else public.analytics_cap('partial', array_remove(array[
        case when v_with_data = 0 then 'no_reports' end,
        case when v_prov_days > 0 then 'missing_z' end,
        case when v_tx_missing > 0 or (v_with_data > 0 and v_tx_avail + v_tx_partial = 0) then 'missing_transaction_count' end,
        case when v_origin in ('legacy_import', 'mixed') and v_tx_missing > 0 then 'legacy_source_limitation' end,
        case when not p_week_complete then 'week_in_progress' end], null)) end,
    'averageBasket', case when v_basket_state = 'available' then public.analytics_cap('complete')
      else public.analytics_cap('partial', array_remove(array[
        case when v_with_data = 0 then 'no_reports' end,
        case when v_prov_days > 0 then 'missing_z' end,
        case when v_basket_days < v_with_data then 'missing_transaction_count' end,
        case when v_origin in ('legacy_import', 'mixed') and v_basket_days < v_with_data then 'legacy_source_limitation' end,
        case when not p_week_complete then 'week_in_progress' end], null)) end,
    'categories', case when v_cat_partial > 0 then public.analytics_cap('partial', (select coalesce(array_agg(distinct r), '{}') from unnest(v_cat_reasons) r))
                       when v_cat_unsupported > 0 then public.analytics_cap('unsupported', (select coalesce(array_agg(distinct r), '{}') from unnest(v_cat_reasons) r))
                       else public.analytics_cap('partial', array['missing_category_detail']) end,
    'products', case when v_prod_partial > 0 then public.analytics_cap('partial', (select coalesce(array_agg(distinct r), '{}') from unnest(v_prod_reasons) r))
                     when v_prod_unsupported > 0 then public.analytics_cap('unsupported', (select coalesce(array_agg(distinct r), '{}') from unnest(v_prod_reasons) r))
                     else public.analytics_cap('partial', array['missing_product_detail']) end,
    'grossProfit', case when v_gp_partial > 0 then public.analytics_cap('partial', (select coalesce(array_agg(distinct r), '{}') from unnest(v_gp_reasons) r))
                        when v_gp_unsupported > 0 then public.analytics_cap('unsupported', (select coalesce(array_agg(distinct r), '{}') from unnest(v_gp_reasons) r))
                        else public.analytics_cap('partial', array['missing_cost']) end,
    'hourly', public.analytics_cap('unsupported', array['no_hourly_source']));

  return jsonb_build_object(
    'daysWithData', v_with_data, 'finalizedDays', v_final_days, 'provisionalDays', v_prov_days,
    'origin', v_origin, 'final', v_final,
    'volume', jsonb_build_object(
      'transactions', case v_tx_state
          when 'unavailable' then public.analytics_metric('unavailable', null, case when v_with_data = 0 then 'no_reports' else 'transaction_count_missing' end)
          when 'partial' then public.analytics_metric('partial', v_tx,
              case when v_prov_days > 0 then 'missing_z' when v_tx_missing > 0 then 'missing_transaction_count' else 'week_in_progress' end)
          else public.analytics_metric('available', v_tx) end,
      'itemQuantity', case when v_items_n = 0 then public.analytics_metric('unavailable', null, 'missing_category_detail')
                           else public.analytics_metric('partial', v_items, 'z_line_semantics_unverified') end),
    'financial', jsonb_build_object(
      'grossRevenue', case when v_final then public.analytics_metric('available', round(v_rev, 2))
                           when v_with_data = 0 then public.analytics_metric('available', 0)
                           else public.analytics_metric('partial', round(v_rev, 2), case when v_prov_days > 0 then 'missing_z' else 'week_in_progress' end) end,
      'provisionalRevenue', case when v_prov_days > 0 then round(v_prov_rev, 2) end,
      'averageBasket', case v_basket_state
          when 'unavailable' then public.analytics_metric('unavailable', null, 'transaction_count_missing')
          when 'partial' then public.analytics_metric('partial', round(v_cov_rev / nullif(v_cov_tx, 0), 2),
              case when v_prov_days > 0 then 'missing_z' else 'missing_transaction_count' end)
          else public.analytics_metric('available', round(v_cov_rev / nullif(v_cov_tx, 0), 2)) end,
      'categories', v_cats, 'products', v_prods,
      'grossProfit', jsonb_build_object('grossOnly', true,
        'metric', case when v_gp_partial > 0 then public.analytics_metric('partial', round(v_gp, 2), 'line_semantics_unverified')
                       when v_gp_unsupported > 0 and v_gp_partial = 0 then public.analytics_metric('unsupported', null, 'xz_line_semantics_unknown')
                       else public.analytics_metric('unavailable', null, 'missing_cost') end,
        'coveredRevenue', round(v_gp_cov, 2), 'uncoveredRevenue', round(greatest(v_rev - v_gp_cov, 0), 2))),
    'days', v_rows,
    'capabilities', v_caps,
    'txAvailableValue', case when v_tx_state = 'available' then v_tx end,
    'basketAvailableValue', case when v_basket_state = 'available' then round(v_cov_rev / nullif(v_cov_tx, 0), 2) end
  );
end;
$$;
revoke all on function public.analytics_week_totals(jsonb, boolean) from public, anon, authenticated;
grant execute on function public.analytics_week_totals(jsonb, boolean) to service_role;

create or replace function public.analytics_build_weekly(p_branch_id uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_params jsonb := public.analytics_params();
  v_lowrev numeric := (v_params ->> 'lowVolumeBaseRevenue')::numeric;
  v_lowtx numeric := (v_params ->> 'lowVolumeBaseTransactions')::numeric;
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_complete boolean := (p_week_start + 6) < v_today;
  v_days jsonb := '[]'::jsonb;
  v_prev_days jsonb := '[]'::jsonb;
  v_i integer;
  w jsonb;
  pw jsonb;
  v_wx jsonb;
  v_caps jsonb;
  v_cur_final boolean;
  v_prev_final boolean;
  v_mixed boolean;
begin
  for v_i in 0 .. 6 loop
    v_days := v_days || jsonb_build_array(public.analytics_compute_day(p_branch_id, p_week_start + v_i));
    v_prev_days := v_prev_days || jsonb_build_array(public.analytics_compute_day(p_branch_id, p_week_start - 7 + v_i));
  end loop;
  w := public.analytics_week_totals(v_days, v_complete);
  pw := public.analytics_week_totals(v_prev_days, true);
  v_cur_final := (w ->> 'final')::boolean;
  v_prev_final := (pw ->> 'provisionalDays')::integer = 0;
  v_mixed := public.analytics_origin_mixed(w ->> 'origin', pw ->> 'origin');
  v_wx := public.analytics_weather_effect(p_branch_id,
      least(p_week_start + 6, v_today) - ((v_params ->> 'weatherWindowDays')::integer - 1), least(p_week_start + 6, v_today));
  v_caps := (w -> 'capabilities') || jsonb_build_object('context',
    case v_wx ->> 'state' when 'ok' then public.analytics_cap('complete')
      when 'insufficient_sample' then public.analytics_cap('partial', array['insufficient_sample'])
      else public.analytics_cap('partial', array['missing_context']) end);

  return jsonb_build_object(
    'schemaVersion', 2,
    'scope', 'weekly',
    'branchId', p_branch_id,
    'weekStart', p_week_start,
    'weekEnd', p_week_start + 6,
    'weekComplete', v_complete,
    'finalization', case when v_cur_final then 'finalized' else 'provisional' end,
    'origin', w -> 'origin',
    'timezone', 'Europe/Istanbul',
    'params', v_params,
    'sourceLatestAt', public.analytics_internal_source_latest_at(p_branch_id, p_week_start, p_week_start + 6),
    'daysWithData', w -> 'daysWithData',
    'finalizedDays', w -> 'finalizedDays',
    'provisionalDays', w -> 'provisionalDays',
    'volume', w -> 'volume',
    'financial', w -> 'financial',
    'days', w -> 'days',
    'completeness', public.analytics_completeness(v_caps, (w ->> 'daysWithData')::integer > 0),
    'previousWeek', jsonb_build_object('weekStart', p_week_start - 7, 'daysWithData', pw -> 'daysWithData',
      'provisionalDays', pw -> 'provisionalDays', 'origin', pw -> 'origin'),
    'volumeComparisons', jsonb_build_object(
      'transactions', public.analytics_compare((w ->> 'txAvailableValue')::numeric, (pw ->> 'txAvailableValue')::numeric,
        (pw ->> 'txAvailableValue') is not null, v_lowtx, null, null, v_cur_final, v_prev_final, v_mixed, true)),
    'financialComparisons', jsonb_build_object(
      'grossRevenue', public.analytics_compare((w #>> '{financial,grossRevenue,value}')::numeric,
        (pw #>> '{financial,grossRevenue,value}')::numeric, (pw ->> 'daysWithData')::integer > 0, v_lowrev, null, null,
        v_cur_final, v_prev_final, v_mixed, false),
      'averageBasket', public.analytics_compare((w ->> 'basketAvailableValue')::numeric, (pw ->> 'basketAvailableValue')::numeric,
        (pw ->> 'basketAvailableValue') is not null, 0, null, null, v_cur_final, v_prev_final, v_mixed, true)),
    'weatherEffect', v_wx,
    'peakHour', jsonb_build_object('state', 'unsupported',
      'reason', 'sales reports are shift-level readings; no per-transaction or hourly timestamps exist in the source')
  );
end;
$$;
revoke all on function public.analytics_build_weekly(uuid, date) from public, anon, authenticated;
grant execute on function public.analytics_build_weekly(uuid, date) to service_role;

-- -----------------------------------------------------------------------------
-- 9. Redaction (analytics.read without analytics.financial.read)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_redact(p_payload jsonb, p_financial boolean)
returns jsonb
language sql
immutable
as $$
  select case when p_financial then p_payload
         else (p_payload - 'financial' - 'financialComparisons' - 'days' - 'weatherEffect' - 'readings')
              || jsonb_build_object('redacted', true) end;
$$;
revoke all on function public.analytics_redact(jsonb, boolean) from public, anon;
grant execute on function public.analytics_redact(jsonb, boolean) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 10. Snapshot writers (internal core + audited RPCs)
-- -----------------------------------------------------------------------------
create or replace function public.analytics_write_daily_insights(p_snapshot_id uuid, p_branch_id uuid, p_date date, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cmp jsonb := p_payload #> '{financialComparisons,grossRevenue,previousWeekSameWeekday}';
  v_base jsonb := p_payload #> '{financialComparisons,grossRevenue,baseline4SameWeekday}';
begin
  if v_cmp ->> 'state' = 'ok' then
    insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'daily', p_date, p_snapshot_id, 'fact', 'revenue_vs_previous_week_same_weekday',
      'Ciro, geçen haftanın aynı gününe göre %' || (v_cmp ->> 'pct') || ' ' || case when (v_cmp ->> 'delta')::numeric >= 0 then 'yüksek' else 'düşük' end,
      jsonb_build_object('metric', 'financialComparisons.grossRevenue.previousWeekSameWeekday', 'comparison', v_cmp), true);
  end if;
  if p_payload ->> 'finalization' = 'provisional' then
    insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'daily', p_date, p_snapshot_id, 'fact', 'revenue_provisional',
      'Günün cirosu geçici: Z raporu yok, yalnızca X okuması var',
      jsonb_build_object('metric', 'finalization', 'provisionalRevenue', p_payload #> '{financial,provisionalRevenue}'), true);
  end if;
  if v_base ->> 'state' = 'ok' then
    insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'daily', p_date, p_snapshot_id, 'fact', 'revenue_vs_baseline4',
      'Ciro, son ' || (v_base ->> 'samples') || ' haftanın aynı gün ortalamasına göre %' || (v_base ->> 'pct') || ' ' || case when (v_base ->> 'delta')::numeric >= 0 then 'yüksek' else 'düşük' end,
      jsonb_build_object('metric', 'financialComparisons.grossRevenue.baseline4SameWeekday', 'comparison', v_base), true);
  end if;
  if p_payload #>> '{financial,grossProfit,metric,state}' = 'partial' and p_payload #>> '{financial,grossProfit,metric,reason}' = 'missing_cost' then
    insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'daily', p_date, p_snapshot_id, 'fact', 'gross_profit_partial_coverage',
      'Brüt kâr kısmi: cirosunun bir bölümü için maliyet/ürün eşlemesi yok',
      jsonb_build_object('metric', 'financial.grossProfit', 'grossProfit', p_payload #> '{financial,grossProfit}'), true);
  end if;
end;
$$;
revoke all on function public.analytics_write_daily_insights(uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.analytics_write_daily_insights(uuid, uuid, date, jsonb) to service_role;

create or replace function public.analytics_write_weekly_insights(p_snapshot_id uuid, p_branch_id uuid, p_week date, p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rev jsonb := p_payload #> '{financialComparisons,grossRevenue}';
  v_tx jsonb := p_payload #> '{volumeComparisons,transactions}';
  v_wx jsonb := p_payload -> 'weatherEffect';
  v_best record;
begin
  if v_rev ->> 'state' = 'ok' then
    insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'weekly', p_week, p_snapshot_id, 'fact', 'weekly_revenue_change',
      'Haftalık ciro, önceki haftaya göre %' || (v_rev ->> 'pct') || ' ' || case when (v_rev ->> 'delta')::numeric >= 0 then 'yüksek' else 'düşük' end,
      jsonb_build_object('metric', 'financialComparisons.grossRevenue', 'comparison', v_rev), true);
  end if;
  if v_tx ->> 'state' = 'ok' then
    insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'weekly', p_week, p_snapshot_id, 'fact', 'weekly_transactions_change',
      'Haftalık işlem sayısı, önceki haftaya göre %' || (v_tx ->> 'pct') || ' ' || case when (v_tx ->> 'delta')::numeric >= 0 then 'yüksek' else 'düşük' end,
      jsonb_build_object('metric', 'volumeComparisons.transactions', 'comparison', v_tx), false);
  end if;
  select d ->> 'date' as dt, (d ->> 'grossRevenue')::numeric as rev into v_best
  from jsonb_array_elements(p_payload -> 'days') d
  where (d ->> 'hasData')::boolean and d ->> 'finalization' = 'finalized'
  order by (d ->> 'grossRevenue')::numeric desc, d ->> 'date' limit 1;
  if v_best.dt is not null then
    insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'weekly', p_week, p_snapshot_id, 'fact', 'weekly_best_day',
      'Haftanın en yüksek ciro günü: ' || v_best.dt,
      jsonb_build_object('metric', 'days', 'date', v_best.dt, 'grossRevenue', v_best.rev), true);
  end if;
  if (p_payload ->> 'provisionalDays')::integer > 0 then
    insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'weekly', p_week, p_snapshot_id, 'fact', 'weekly_provisional_days',
      (p_payload ->> 'provisionalDays') || ' günün Z raporu yok; hafta kesinleşmedi',
      jsonb_build_object('metric', 'provisionalDays', 'provisionalDays', p_payload -> 'provisionalDays'), false);
  end if;
  if v_wx ->> 'state' = 'ok' then
    insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, evidence, is_financial)
    values (p_branch_id, 'weekly', p_week, p_snapshot_id, 'relationship', 'weather_relationship',
      'Sıcaklık ile hafta günü-düzeltilmiş ciro arasında ilişki (r=' || (v_wx #>> '{temperatureCorrelation,r}') || ', n=' || (v_wx ->> 'sample') || ')',
      jsonb_build_object('metric', 'weatherEffect', 'weatherEffect', v_wx), true);
  end if;
end;
$$;
revoke all on function public.analytics_write_weekly_insights(uuid, uuid, date, jsonb) from public, anon, authenticated;
grant execute on function public.analytics_write_weekly_insights(uuid, uuid, date, jsonb) to service_role;

-- Core writer. Idempotent: an identical payload (same hash) does not create a new version.
create or replace function public.internal_generate_daily_analytics(
  p_branch_id uuid, p_date date, p_kind text, p_actor uuid default null, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_hash text;
  v_latest record;
  v_id uuid;
  v_version integer;
begin
  if p_date > (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'analytics cannot be generated for a future business date' using errcode = '22023';
  end if;
  v_payload := public.analytics_build_daily(p_branch_id, p_date);
  v_hash := md5(v_payload::text);
  select id, version, payload_hash into v_latest
  from public.daily_analytics_snapshots
  where branch_id = p_branch_id and business_date = p_date
  order by version desc limit 1;
  if found and v_latest.payload_hash = v_hash then
    return jsonb_build_object('snapshotId', v_latest.id, 'version', v_latest.version, 'unchanged', true);
  end if;
  v_version := coalesce(v_latest.version, 0) + 1;
  insert into public.daily_analytics_snapshots
    (branch_id, business_date, version, payload, payload_hash, source_latest_at, generation_kind, reason, generated_by)
  values (p_branch_id, p_date, v_version, v_payload, v_hash,
          nullif(v_payload ->> 'sourceLatestAt', '')::timestamptz, p_kind, p_reason, p_actor)
  returning id into v_id;
  perform public.analytics_write_daily_insights(v_id, p_branch_id, p_date, v_payload);
  return jsonb_build_object('snapshotId', v_id, 'version', v_version, 'unchanged', false);
end;
$$;
revoke all on function public.internal_generate_daily_analytics(uuid, date, text, uuid, text) from public, anon, authenticated;
grant execute on function public.internal_generate_daily_analytics(uuid, date, text, uuid, text) to service_role;

create or replace function public.internal_generate_weekly_analytics(
  p_branch_id uuid, p_week_start date, p_kind text, p_actor uuid default null, p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_hash text;
  v_latest record;
  v_id uuid;
  v_version integer;
begin
  if extract(isodow from p_week_start) <> 1 then
    raise exception 'week_start must be a Monday' using errcode = '22023';
  end if;
  if p_week_start > (now() at time zone 'Europe/Istanbul')::date then
    raise exception 'analytics cannot be generated for a future week' using errcode = '22023';
  end if;
  v_payload := public.analytics_build_weekly(p_branch_id, p_week_start);
  v_hash := md5(v_payload::text);
  select id, version, payload_hash into v_latest
  from public.weekly_analytics_snapshots
  where branch_id = p_branch_id and week_start = p_week_start
  order by version desc limit 1;
  if found and v_latest.payload_hash = v_hash then
    return jsonb_build_object('snapshotId', v_latest.id, 'version', v_latest.version, 'unchanged', true);
  end if;
  v_version := coalesce(v_latest.version, 0) + 1;
  insert into public.weekly_analytics_snapshots
    (branch_id, week_start, version, payload, payload_hash, source_latest_at, week_complete, generation_kind, reason, generated_by)
  values (p_branch_id, p_week_start, v_version, v_payload, v_hash,
          nullif(v_payload ->> 'sourceLatestAt', '')::timestamptz, (v_payload ->> 'weekComplete')::boolean, p_kind, p_reason, p_actor)
  returning id into v_id;
  perform public.analytics_write_weekly_insights(v_id, p_branch_id, p_week_start, v_payload);
  return jsonb_build_object('snapshotId', v_id, 'version', v_version, 'unchanged', false);
end;
$$;
revoke all on function public.internal_generate_weekly_analytics(uuid, date, text, uuid, text) from public, anon, authenticated;
grant execute on function public.internal_generate_weekly_analytics(uuid, date, text, uuid, text) to service_role;

-- Manual, audited regeneration (analytics.regenerate + branch scope + mandatory reason).
create or replace function public.regenerate_daily_analytics(p_branch_id uuid, p_date date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not public.analytics_can('analytics.regenerate', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  v_res := public.internal_generate_daily_analytics(p_branch_id, p_date, 'manual', auth.uid(), trim(p_reason));
  perform public.write_audit_log('analytics_snapshot_regenerated', 'daily_analytics_snapshots', v_res ->> 'snapshotId', null,
    jsonb_build_object('branchId', p_branch_id, 'businessDate', p_date, 'version', v_res -> 'version', 'unchanged', v_res -> 'unchanged'), trim(p_reason));
  return v_res;
end;
$$;
revoke all on function public.regenerate_daily_analytics(uuid, date, text) from public, anon;
grant execute on function public.regenerate_daily_analytics(uuid, date, text) to authenticated;

create or replace function public.regenerate_weekly_analytics(p_branch_id uuid, p_week_start date, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_res jsonb;
begin
  if not public.analytics_can('analytics.regenerate', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  v_res := public.internal_generate_weekly_analytics(p_branch_id, p_week_start, 'manual', auth.uid(), trim(p_reason));
  perform public.write_audit_log('analytics_snapshot_regenerated', 'weekly_analytics_snapshots', v_res ->> 'snapshotId', null,
    jsonb_build_object('branchId', p_branch_id, 'weekStart', p_week_start, 'version', v_res -> 'version', 'unchanged', v_res -> 'unchanged'), trim(p_reason));
  return v_res;
end;
$$;
revoke all on function public.regenerate_weekly_analytics(uuid, date, text) from public, anon;
grant execute on function public.regenerate_weekly_analytics(uuid, date, text) to authenticated;

-- -----------------------------------------------------------------------------
-- 11. Read RPCs (redaction + stale detection) and current views
-- -----------------------------------------------------------------------------
create or replace function public.get_daily_analytics(p_branch_id uuid, p_date date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_live timestamptz;
  v_fin boolean;
begin
  if not public.analytics_can('analytics.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_fin := public.analytics_can('analytics.financial.read', p_branch_id);
  select * into v_row from public.daily_analytics_snapshots
   where branch_id = p_branch_id and business_date = p_date order by version desc limit 1;
  v_live := public.analytics_internal_source_latest_at(p_branch_id, p_date, p_date);
  if not found then
    return jsonb_build_object('state', 'missing', 'businessDate', p_date);
  end if;
  return jsonb_build_object(
    'state', case when v_live is distinct from v_row.source_latest_at and v_live > coalesce(v_row.source_latest_at, '-infinity'::timestamptz) then 'stale' else 'current' end,
    'snapshotId', v_row.id, 'version', v_row.version, 'generatedAt', v_row.generated_at,
    'generationKind', v_row.generation_kind, 'sourceLatestAt', v_row.source_latest_at,
    'payload', public.analytics_redact(v_row.payload, v_fin));
end;
$$;
revoke all on function public.get_daily_analytics(uuid, date) from public, anon;
grant execute on function public.get_daily_analytics(uuid, date) to authenticated;

create or replace function public.get_weekly_analytics(p_branch_id uuid, p_week_start date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row record;
  v_live timestamptz;
  v_fin boolean;
begin
  if not public.analytics_can('analytics.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_fin := public.analytics_can('analytics.financial.read', p_branch_id);
  select * into v_row from public.weekly_analytics_snapshots
   where branch_id = p_branch_id and week_start = p_week_start order by version desc limit 1;
  if not found then
    return jsonb_build_object('state', 'missing', 'weekStart', p_week_start);
  end if;
  v_live := public.analytics_internal_source_latest_at(p_branch_id, p_week_start, p_week_start + 6);
  return jsonb_build_object(
    'state', case when v_live > coalesce(v_row.source_latest_at, '-infinity'::timestamptz) then 'stale' else 'current' end,
    'snapshotId', v_row.id, 'version', v_row.version, 'generatedAt', v_row.generated_at,
    'weekComplete', v_row.week_complete, 'generationKind', v_row.generation_kind,
    'sourceLatestAt', v_row.source_latest_at,
    'payload', public.analytics_redact(v_row.payload, v_fin));
end;
$$;
revoke all on function public.get_weekly_analytics(uuid, date) from public, anon;
grant execute on function public.get_weekly_analytics(uuid, date) to authenticated;

create or replace view public.daily_analytics_current with (security_invoker = true) as
select distinct on (branch_id, business_date)
  id, branch_id, business_date, version, source_latest_at, generation_kind, generated_at
from public.daily_analytics_snapshots
order by branch_id, business_date, version desc;
create or replace view public.weekly_analytics_current with (security_invoker = true) as
select distinct on (branch_id, week_start)
  id, branch_id, week_start, version, source_latest_at, week_complete, generation_kind, generated_at
from public.weekly_analytics_snapshots
order by branch_id, week_start, version desc;
grant select on public.daily_analytics_current, public.weekly_analytics_current to authenticated;

-- -----------------------------------------------------------------------------
-- 12. External context maintenance (audited) and AI report persistence (service role)
-- -----------------------------------------------------------------------------
create or replace function public.upsert_external_context_daily(
  p_context_date date,
  p_branch_id uuid,
  p_values jsonb,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_old jsonb;
begin
  if p_branch_id is null then
    if not (public.current_user_is_owner_or_manager() and public.current_user_has_permission('analytics.regenerate')) then
      raise exception 'not authorized' using errcode = '42501';
    end if;
  elsif not public.analytics_can('analytics.regenerate', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_context_date > (now() at time zone 'Europe/Istanbul')::date + 7 then
    raise exception 'context date too far in the future' using errcode = '22023';
  end if;
  select id, to_jsonb(c) - 'id' - 'created_at' - 'updated_at' into v_id, v_old
  from public.external_context_daily c
  where context_date = p_context_date and coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_branch_id, '00000000-0000-0000-0000-000000000000'::uuid);
  if v_id is null then
    insert into public.external_context_daily (context_date, branch_id, temperature_c, apparent_temperature_c, precipitation_mm,
      wind_kmh, is_public_holiday, holiday_name, pay_period_tag, special_event, source, updated_by)
    values (p_context_date, p_branch_id,
      (p_values ->> 'temperatureC')::numeric, (p_values ->> 'apparentTemperatureC')::numeric,
      (p_values ->> 'precipitationMm')::numeric, (p_values ->> 'windKmh')::numeric,
      coalesce((p_values ->> 'isPublicHoliday')::boolean, false), p_values ->> 'holidayName',
      p_values ->> 'payPeriodTag', p_values ->> 'specialEvent', coalesce(p_values ->> 'source', 'manual'), auth.uid())
    returning id into v_id;
  else
    update public.external_context_daily set
      temperature_c = (p_values ->> 'temperatureC')::numeric,
      apparent_temperature_c = (p_values ->> 'apparentTemperatureC')::numeric,
      precipitation_mm = (p_values ->> 'precipitationMm')::numeric,
      wind_kmh = (p_values ->> 'windKmh')::numeric,
      is_public_holiday = coalesce((p_values ->> 'isPublicHoliday')::boolean, false),
      holiday_name = p_values ->> 'holidayName',
      pay_period_tag = p_values ->> 'payPeriodTag',
      special_event = p_values ->> 'specialEvent',
      source = coalesce(p_values ->> 'source', 'manual'),
      updated_by = auth.uid()
    where id = v_id;
  end if;
  perform public.write_audit_log('analytics_context_upserted', 'external_context_daily', v_id::text, v_old, p_values, trim(p_reason));
  return v_id;
end;
$$;
revoke all on function public.upsert_external_context_daily(date, uuid, jsonb, text) from public, anon;
grant execute on function public.upsert_external_context_daily(date, uuid, jsonb, text) to authenticated;

-- Stores an AI generation attempt. The caller (an Edge Function, later) validates the
-- output against the contract first; this function only persists and versions it.
create or replace function public.internal_save_analytics_report(
  p_weekly_snapshot_id uuid, p_status text, p_input_facts jsonb, p_output jsonb,
  p_model text, p_error_code text, p_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_snap record;
  v_version integer;
  v_id uuid;
begin
  select * into v_snap from public.weekly_analytics_snapshots where id = p_weekly_snapshot_id;
  if not found then
    raise exception 'weekly snapshot not found' using errcode = '22023';
  end if;
  select coalesce(max(version), 0) + 1 into v_version
  from public.analytics_reports where branch_id = v_snap.branch_id and week_start = v_snap.week_start;
  insert into public.analytics_reports (branch_id, week_start, weekly_snapshot_id, version, status, input_facts, input_hash,
    output, model, error_code, generated_by)
  values (v_snap.branch_id, v_snap.week_start, v_snap.id, v_version, p_status, p_input_facts, md5(p_input_facts::text),
    p_output, p_model, p_error_code, p_actor)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.internal_save_analytics_report(uuid, text, jsonb, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.internal_save_analytics_report(uuid, text, jsonb, jsonb, text, text, uuid) to service_role;

-- -----------------------------------------------------------------------------
-- 13. Central analytics settings (one row; thresholds are technical defaults, not business decisions)
-- -----------------------------------------------------------------------------
create table if not exists public.analytics_settings (
  id integer primary key default 1 check (id = 1),
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
comment on table public.analytics_settings is
  'The single place analytics thresholds can be overridden (no branch-specific values). Empty = built-in defaults of analytics_params(). Written only by update_analytics_settings() (audited).';
insert into public.analytics_settings (id) values (1) on conflict do nothing;
alter table public.analytics_settings enable row level security;
revoke all on public.analytics_settings from anon, authenticated;
grant select on public.analytics_settings to authenticated;
create policy analytics_settings_select on public.analytics_settings
  for select to authenticated using (public.current_user_has_permission('analytics.read'));

create or replace function public.update_analytics_settings(p_values jsonb, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
  v_val numeric;
  v_old jsonb;
  v_new jsonb;
  v_allowed constant text[] := array['lowVolumeBaseRevenue', 'lowVolumeBaseTransactions', 'minBaselineSamples',
    'minCorrelationSamples', 'minGroupSamples', 'rainMmThreshold', 'weatherWindowDays'];
begin
  if not (public.current_user_is_owner_or_manager() and public.current_user_has_permission('analytics.regenerate')) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' or p_values = '{}'::jsonb then
    raise exception 'settings must be a non-empty object' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown analytics setting %', v_key using errcode = '22023';
    end if;
    if jsonb_typeof(p_values -> v_key) <> 'number' then
      raise exception 'setting % must be a number', v_key using errcode = '22023';
    end if;
    v_val := (p_values ->> v_key)::numeric;
    if (v_key in ('lowVolumeBaseRevenue', 'lowVolumeBaseTransactions') and v_val < 0)
       or (v_key = 'minBaselineSamples' and (v_val < 1 or v_val > 4 or v_val <> trunc(v_val)))
       or (v_key = 'minCorrelationSamples' and (v_val < 5 or v_val > 365 or v_val <> trunc(v_val)))
       or (v_key = 'minGroupSamples' and (v_val < 2 or v_val > 30 or v_val <> trunc(v_val)))
       or (v_key = 'rainMmThreshold' and (v_val < 0 or v_val > 50))
       or (v_key = 'weatherWindowDays' and (v_val < 14 or v_val > 365 or v_val <> trunc(v_val))) then
      raise exception 'setting % is out of range', v_key using errcode = '22023';
    end if;
  end loop;
  select settings into v_old from public.analytics_settings where id = 1;
  v_new := coalesce(v_old, '{}'::jsonb) || p_values || jsonb_build_object('status', 'owner_configured');
  update public.analytics_settings set settings = v_new, updated_by = auth.uid(), updated_at = now() where id = 1;
  perform public.write_audit_log('analytics_settings_updated', 'analytics_settings', '1', v_old, v_new, trim(p_reason));
  return public.analytics_params();
end;
$$;
revoke all on function public.update_analytics_settings(jsonb, text) from public, anon;
grant execute on function public.update_analytics_settings(jsonb, text) to authenticated;
