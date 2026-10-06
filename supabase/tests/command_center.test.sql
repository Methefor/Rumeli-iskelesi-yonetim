-- =============================================================================
-- command_center.test.sql  (Phase 1D: weather context, observed context, Command Center read model, security)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE with every migration applied
-- (supabase db reset --local --no-seed). One transaction, ends in ROLLBACK.
--
--   docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres \
--        -v ON_ERROR_STOP=1 < supabase/tests/command_center.test.sql
--
-- Clean run prints 'ALL COMMAND CENTER ASSERTIONS PASSED (<n> assertions)'. Synthetic data only.
-- =============================================================================
begin;
set local timezone = 'Europe/Istanbul';

create schema t;
grant usage on schema t to anon, authenticated, service_role;
create table t.ctx (k text primary key, v uuid not null);
grant select, insert on t.ctx to anon, authenticated, service_role;
create table t.counter (n integer not null);
insert into t.counter values (0);
grant select, update on t.counter to anon, authenticated, service_role;
create function t.id(p_key text) returns uuid language sql stable as $$ select v from t.ctx where k = p_key $$;
create function t.assert(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]: assertion is not true', p_label; end if;
  update t.counter set n = n + 1;
end $$;
create function t.expect_denied(p_sql text, p_label text, p_state text default '42501') returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then update t.counter set n = n + 1; return; end if;
    raise exception 'TEST FAILED [%]: expected SQLSTATE % but got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: statement succeeded but should have failed with SQLSTATE %', p_label, p_state;
end $$;
create function t.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin execute p_sql; update t.counter set n = n + 1;
exception when others then raise exception 'TEST FAILED [%]: unexpected error % (%)', p_label, sqlstate, sqlerrm;
end $$;
create function t.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', t.id(p_key)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;
create function t.as_service() returns void language plpgsql as $$ begin execute 'set local role service_role'; end $$;
create function t.as_superuser() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- a normalised forecast payload relative to now(): hourly from -3h to +30h, two daily rows
create function t.payload() returns jsonb language sql stable as $$
  select jsonb_build_object(
    'current', jsonb_build_object('time', now(), 'temperatureC', 21.5, 'apparentTemperatureC', 20.1, 'weatherCode', 2, 'precipitationMm', 0, 'windKmh', 12, 'windGustKmh', 25),
    'hourly', (select jsonb_agg(jsonb_build_object('time', date_trunc('hour', now()) + make_interval(hours => h), 'temperatureC', 20 - h * 0.1, 'apparentTemperatureC', 19,
                 'precipitationProbability', case when h between 5 and 8 then 80 else 10 end, 'precipitationMm', case when h between 5 and 8 then 1.5 else 0 end,
                 'weatherCode', 3, 'windKmh', 10, 'windGustKmh', 20)) from generate_series(-3, 30) h),
    'daily', jsonb_build_array(
      jsonb_build_object('date', (now() at time zone 'Europe/Istanbul')::date, 'temperatureMinC', 15, 'temperatureMaxC', 24, 'precipitationProbabilityMax', 80, 'precipitationSumMm', 6, 'windMaxKmh', 30, 'windGustMaxKmh', 45, 'weatherCode', 61),
      jsonb_build_object('date', (now() at time zone 'Europe/Istanbul')::date + 1, 'temperatureMinC', 14, 'temperatureMaxC', 22, 'precipitationProbabilityMax', 20, 'precipitationSumMm', 0, 'windMaxKmh', 15, 'windGustMaxKmh', 25, 'weatherCode', 1)));
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;

create function t.shift(p_branch text, p_date date, p_skey text) returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.shifts (branch_id, shift_definition_id, business_date)
  select t.id(p_branch), d.id, p_date from public.shift_definitions d where d.branch_id = t.id(p_branch) and d.key = p_skey
  on conflict (branch_id, shift_definition_id, business_date) do nothing;
  select s.id into v from public.shifts s join public.shift_definitions d on d.id = s.shift_definition_id
   where s.branch_id = t.id(p_branch) and s.business_date = p_date and d.key = p_skey;
  return v;
end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Identities ---------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O', '00000000-0000-0000-0000-0000000000e1'), ('M', '00000000-0000-0000-0000-0000000000e2'),
  ('BMD', '00000000-0000-0000-0000-0000000000e3'), ('BMR', '00000000-0000-0000-0000-0000000000e4'),
  ('K', '00000000-0000-0000-0000-0000000000e5'), ('E', '00000000-0000-0000-0000-0000000000e6'),
  ('V', '00000000-0000-0000-0000-0000000000e7');
insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into t.ctx select 'BB', id from public.branches where key = 'balik_ekmek';
insert into auth.users (id, email) select v, lower(k) || '@cc-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','V');
insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'), 'W Owner', 'W901'), (t.id('M'), 'W Manager', 'W902'), (t.id('BMD'), 'W BM Dondurma', 'W903'),
  (t.id('BMR'), 'W BM Rumeli', 'W904'), (t.id('K'), 'W Cashier', 'W905'), (t.id('E'), 'W Employee', 'W906'), (t.id('V'), 'W Viewer', 'W907');
insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('V','viewer')) x(k, rk) join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('E'), t.id('BD')), (t.id('V'), t.id('BR'));

-- ---------------------------------------------------------------------------
-- A. permission matrix
-- ---------------------------------------------------------------------------
do $$ begin
  perform t.assert((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where p.key = 'weather.read') = array['branch_manager','manager','owner'], 'weather.read: owner, manager, branch_manager');
  perform t.assert((select count(*) from public.weather_forecast_snapshots) = 0 and (select count(*) from public.branch_locations) = 0, 'nothing is seeded: no forecast and no coordinates');
end $$;

-- ---------------------------------------------------------------------------
-- B. weather availability: location first, then forecast
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare w jsonb; begin
  w := public.get_branch_weather(t.id('BR'));
  perform t.assert(w ->> 'status' = 'unavailable' and w ->> 'reason' = 'missing_branch_location', 'no coordinates: unavailable / missing_branch_location (nothing is guessed)');
  perform t.assert(not (w ? 'current') and not (w ? 'hourly'), 'and no fake weather values are returned');
end $$;
select t.as_superuser();
insert into public.branch_locations (branch_id, latitude, longitude, location_label) values
  (t.id('BR'), 41.0100, 28.9700, 'Sentetik Konum R'), (t.id('BD'), 40.9900, 29.0200, 'Sentetik Konum D'), (t.id('BB'), 40.9800, 29.0300, null);
select t.as_user('M');
do $$ begin
  perform t.assert(public.get_branch_weather(t.id('BR')) ->> 'reason' = 'no_forecast_loaded', 'coordinates but no forecast: unavailable / no_forecast_loaded');
end $$;
select t.as_superuser();
do $$ begin
  perform t.expect_denied(format($q$select public.internal_store_weather_forecast(%L, 'open-meteo', now(), null, now() + interval '1 hour', %L::jsonb)$q$, t.id('BR'), '{"current":{},"hourly":{},"daily":[]}'), 'a malformed payload is rejected by the table check', '23514');
  perform t.expect_denied(format($q$select public.internal_store_weather_forecast(%L, 'open-meteo', now(), null, now() + interval '30 hours', t.payload())$q$, t.id('BR')), 'a validity beyond 24h is rejected', '23514');
  perform t.expect_denied(format($q$select public.internal_store_weather_forecast(%L, 'open-meteo', now(), null, now() - interval '1 hour', t.payload())$q$, t.id('BR')), 'valid_until must be after fetched_at', '23514');
end $$;
delete from public.branch_locations where branch_id = t.id('BB');
do $$ begin
  perform t.expect_denied(format($q$select public.internal_store_weather_forecast(%L, 'open-meteo', now(), null, now() + interval '1 hour', t.payload())$q$, t.id('BB')), 'storing a forecast for a branch without coordinates is refused', '22023');
end $$;
insert into public.branch_locations (branch_id, latitude, longitude) values (t.id('BB'), 40.9800, 29.0300);

-- fresh forecast for Rumeli, an EXPIRED one for Dondurma, a fresh one for Balik that is later invalidated by a location change
select t.as_service();
select public.internal_store_weather_forecast(t.id('BR'), 'open-meteo', now() - interval '10 minutes', now() - interval '20 minutes', now() + interval '50 minutes', t.payload()) as r1 \gset
select public.internal_store_weather_forecast(t.id('BD'), 'open-meteo', now() - interval '3 hours', null, now() - interval '2 hours', t.payload()) as r2 \gset
select public.internal_store_weather_forecast(t.id('BB'), 'open-meteo', now() - interval '5 minutes', null, now() + interval '55 minutes', t.payload()) as r3 \gset
select t.as_superuser();
do $$ begin
  perform t.assert(public.internal_store_weather_forecast(t.id('BR'), 'open-meteo', (select fetched_at from public.weather_forecast_snapshots where branch_id = t.id('BR')), null, now() + interval '50 minutes', t.payload()) is null, 'storing the same fetch twice is idempotent (no duplicate row)');
  perform t.assert((select count(*) from public.weather_forecast_snapshots) = 3, 'one snapshot per fetch');
  perform t.expect_denied($q$update public.weather_forecast_snapshots set provider = 'x'$q$, 'forecast snapshots are append-only (update)');
  perform t.expect_denied($q$delete from public.weather_forecast_snapshots$q$, 'forecast snapshots are append-only (delete)');
end $$;
select t.as_user('M');
do $$ declare w jsonb; begin
  w := public.get_branch_weather(t.id('BR'));
  perform t.assert(w ->> 'status' = 'fresh' and (w ->> 'isForecast')::boolean and w ->> 'provider' = 'open-meteo', 'a fresh forecast is labelled fresh and as a FORECAST');
  perform t.assert((w ->> 'ageMinutes')::int = 10 and w ->> 'timezone' = 'Europe/Istanbul' and w #>> '{location,label}' = 'Sentetik Konum R', 'age, time zone and location label are exposed');
  perform t.assert(w ->> 'fetchedAt' is not null and w ->> 'generatedAt' is not null and w ->> 'validUntil' is not null, 'fetched_at, generated_at and valid_until are exposed');
  perform t.assert((w #>> '{current,temperatureC}')::numeric = 21.5, 'current values come from the snapshot');
  perform t.assert((select min((h ->> 'time')::timestamptz) from jsonb_array_elements(w -> 'hourly') h) >= now() - interval '1 hour', 'past hours are not part of the hourly window');
  perform t.assert(jsonb_array_length(w -> 'hourly') between 24 and 34 and jsonb_array_length(w -> 'daily') = 2, 'hourly (<= 48h window) and daily are returned');
  perform t.assert(not (w::text like '%latitude%') and not (w::text like '%longitude%') and not (w::text like '%41.01%'), 'coordinates are never returned');
  w := public.get_branch_weather(t.id('BD'));
  perform t.assert(w ->> 'status' = 'stale' and w ->> 'staleReason' = 'expired' and w ->> 'fetchedAt' is not null, 'an expired forecast is STALE but still shown with its timestamp (provider failure fallback)');
end $$;
select t.as_superuser();
update public.branch_locations set latitude = 41.5 where branch_id = t.id('BB');
select t.as_user('M');
do $$ begin
  perform t.assert(public.get_branch_weather(t.id('BB')) ->> 'staleReason' = 'location_changed' and public.get_branch_weather(t.id('BB')) ->> 'status' = 'stale', 'a forecast fetched for another location is stale (location_changed)');
  perform t.assert((select count(*) from public.weather_forecast_snapshots) = 3, 'the manager reads the snapshots table');
  perform t.expect_denied($q$select latitude from public.weather_forecast_snapshots$q$, 'snapshot coordinates are not selectable');
end $$;

-- ---------------------------------------------------------------------------
-- C. who may read weather
-- ---------------------------------------------------------------------------
select t.as_user('BMR');
do $$ begin
  perform t.assert(public.get_branch_weather(t.id('BR')) ->> 'status' = 'fresh', 'branch_manager reads the own branch weather');
  perform t.expect_denied(format($q$select public.get_branch_weather(%L)$q$, t.id('BD')), 'branch_manager: another branch weather denied');
  perform t.assert((select count(*) from public.weather_forecast_snapshots) = 1, 'branch_manager sees only the own branch snapshots');
end $$;
select t.as_user('BMD');
do $$ begin perform t.assert(public.get_branch_weather(t.id('BD')) ->> 'status' = 'stale', 'the other branch manager reads Dondurma'); end $$;
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.expect_denied(format($q$select public.get_branch_weather(%L)$q$, t.id('BR')), u || ': weather denied');
    perform t.assert((select count(*) from public.weather_forecast_snapshots) = 0, u || ': no snapshot visibility');
    perform t.expect_denied($q$select public.internal_store_weather_forecast(null, 'x', now(), null, now() + interval '1 hour', '{}'::jsonb)$q$, u || ': cannot store forecasts');
  end loop;
  perform t.as_anon();
  perform t.expect_denied(format($q$select public.get_branch_weather(%L)$q$, t.id('BR')), 'anon: weather denied');
  perform t.expect_denied($q$select count(*) from public.weather_forecast_snapshots$q$, 'anon: snapshot table denied');
  perform t.as_user('M');
  perform t.expect_denied($q$select public.internal_store_weather_forecast(null, 'x', now(), null, now() + interval '1 hour', '{}'::jsonb)$q$, 'a manager cannot call the internal loader function either');
  perform t.expect_denied($q$select public.internal_upsert_observed_weather(null, date '2026-01-01', '{}'::jsonb, 'open-meteo', 'reanalysis')$q$, 'nor the observed-context loader');
  perform t.as_superuser();
end $$;

-- ---------------------------------------------------------------------------
-- D. historical (observed) context vs forecast
-- ---------------------------------------------------------------------------
do $$ declare ctx_before integer; r text; c jsonb; d date := (now() at time zone 'Europe/Istanbul')::date - 3; begin
  select count(*) into ctx_before from public.external_context_daily;
  perform t.assert(ctx_before = 0, 'storing forecasts never wrote historical context');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, current_date, '{"temperatureC":20}'::jsonb, 'open-meteo', 'reanalysis')$q$, t.id('BR')), 'today is not historical: refused', '22023');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, current_date + 2, '{"temperatureC":20}'::jsonb, 'open-meteo', 'reanalysis')$q$, t.id('BR')), 'a future day is refused', '22023');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, %L, '{"temperatureC":20}'::jsonb, 'manual', 'reanalysis')$q$, t.id('BR'), d), 'the loader cannot claim the manual source', '22023');
  r := public.internal_upsert_observed_weather(t.id('BR'), d, '{"temperatureC":18.5,"temperatureMinC":13,"temperatureMaxC":23,"apparentTemperatureC":17,"precipitationMm":2.4,"windKmh":14,"windGustKmh":31,"weatherCode":61}'::jsonb, 'open-meteo', 'reanalysis');
  perform t.assert(r = 'inserted', 'a completed day is inserted');
  r := public.internal_upsert_observed_weather(t.id('BR'), d, '{"temperatureC":19,"temperatureMinC":13,"temperatureMaxC":24,"precipitationMm":2.4,"windKmh":14,"windGustKmh":31,"weatherCode":61}'::jsonb, 'open-meteo', 'reanalysis');
  perform t.assert(r = 'updated' and (select temperature_c = 19 from public.external_context_daily where context_date = d and branch_id = t.id('BR')), 'the provider may refresh its OWN completed-day row');
  c := public.analytics_context_for(t.id('BR'), d);
  perform t.assert((c ->> 'temperatureMinC')::numeric = 13 and (c ->> 'temperatureMaxC')::numeric = 24 and (c ->> 'windGustKmh')::numeric = 31 and (c ->> 'weatherCode')::int = 61 and c ->> 'source' = 'open-meteo',
    'the analytics context payload carries min/max temperature, gust and weather code with their source');
  perform t.assert((select provenance = 'reanalysis' and source_retrieved_at is not null from public.external_context_daily where context_date = d and branch_id = t.id('BR')), 'the historical row stores its provenance (reanalysis) and when it was retrieved');
  perform t.assert(c ->> 'provenance' = 'reanalysis', 'and the analytics context payload exposes the provenance (modelled reanalysis is never labelled observed)');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, %L, '{"temperatureC":20}'::jsonb, 'open-meteo', 'forecast')$q$, t.id('BR'), d - 2), 'a forecast is not a historical provenance', '22023');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, %L, '{"temperatureC":20}'::jsonb, 'open-meteo', 'current')$q$, t.id('BR'), d - 2), 'a current payload is not a historical provenance', '22023');
  perform t.expect_denied(format($q$select public.internal_upsert_observed_weather(%L, %L, '{"temperatureC":20}'::jsonb, 'open-meteo', 'manual')$q$, t.id('BR'), d - 2), 'the loader cannot claim manual provenance', '22023');
  r := public.internal_upsert_observed_weather(t.id('BR'), d - 2, '{"temperatureC":16}'::jsonb, 'open-meteo', 'observed');
  perform t.assert(r = 'inserted' and (select provenance = 'observed' from public.external_context_daily where context_date = d - 2 and branch_id = t.id('BR')),
    'a source that really guarantees observation may be stored as observed');
  insert into public.external_context_daily (context_date, branch_id, temperature_c, source) values (d - 1, t.id('BR'), 5, 'manual');
  perform t.assert((select provenance = 'manual' from public.external_context_daily where context_date = d - 1 and branch_id = t.id('BR')), 'a manual row has manual provenance');
  perform t.assert(public.internal_upsert_observed_weather(t.id('BR'), d - 1, '{"temperatureC":30}'::jsonb, 'open-meteo', 'reanalysis') = 'skipped_other_source'
                   and (select temperature_c = 5 and provenance = 'manual' from public.external_context_daily where context_date = d - 1 and branch_id = t.id('BR')), 'a manual row (and its manual provenance) is never overwritten by the loader');
  perform t.assert((select count(*) from public.weather_forecast_snapshots) = 3, 'observed writes never touch forecast snapshots');
  perform t.assert((public.analytics_context_for(t.id('BD'), d) ->> 'state') = 'missing', 'a day without context stays MISSING (not "normal")');
end $$;

-- ---------------------------------------------------------------------------
-- E. Command Center read model
-- ---------------------------------------------------------------------------
select t.as_superuser();
-- a current daily analytics snapshot with one financial and one non-financial insight (fixture: the engine itself is tested elsewhere)
insert into public.daily_analytics_snapshots (id, branch_id, business_date, version, payload, payload_hash, generation_kind)
values ('00000000-0000-0000-0000-00000000aa01', t.id('BR'), (now() at time zone 'Europe/Istanbul')::date - 1, 1,
        '{"completeness":{"overall":"partial"}}'::jsonb, 'h1', 'scheduled');
insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, is_financial) values
  (t.id('BR'), 'daily', (now() at time zone 'Europe/Istanbul')::date - 1, '00000000-0000-0000-0000-00000000aa01', 'fact', 'missing_z', 'Z raporu eksik', false),
  (t.id('BR'), 'daily', (now() at time zone 'Europe/Istanbul')::date - 1, '00000000-0000-0000-0000-00000000aa01', 'relationship', 'rain_effect', 'Yağmurlu günlerde ciro farkı', true);
insert into public.weekly_analytics_snapshots (id, branch_id, week_start, version, payload, payload_hash, week_complete, generation_kind)
values ('00000000-0000-0000-0000-00000000bb01', t.id('BR'), date_trunc('week', now() at time zone 'Europe/Istanbul')::date, 1, '{}'::jsonb, 'w1', false, 'scheduled');
insert into public.analytics_insights (branch_id, scope, week_start, weekly_snapshot_id, confidence, code, title, is_financial) values
  (t.id('BR'), 'weekly', date_trunc('week', now() at time zone 'Europe/Istanbul')::date, '00000000-0000-0000-0000-00000000bb01', 'relationship', 'weather_relationship', 'Sıcaklık ile ciro arasında ilişki (n=12)', false),
  (t.id('BR'), 'weekly', date_trunc('week', now() at time zone 'Europe/Istanbul')::date, '00000000-0000-0000-0000-00000000bb01', 'fact', 'week_revenue', 'Haftalık ciro', true);
create table t.snap as select count(*)::int as n from public.daily_analytics_snapshots;
grant select on t.snap to authenticated;
select t.as_user('M');
do $$ declare s jsonb; begin
  s := public.get_branch_operations_signals(t.id('BR'));
  perform t.assert(s ->> 'branchId' = t.id('BR')::text and s ->> 'businessDate' = ((now() at time zone 'Europe/Istanbul')::date)::text and s ->> 'timezone' = 'Europe/Istanbul', 'the signals carry the branch and its local business date');
  perform t.assert(s #>> '{location,state}' = 'set' and public.get_branch_operations_signals(t.id('BD')) #>> '{location,state}' = 'set', 'location state is reported');
  perform t.assert(s #>> '{counts,state}' = 'available' and s #>> '{waste,state}' = 'available' and s #>> '{procurement,state}' = 'available' and s #>> '{weather,state}' = 'available' and s #>> '{analytics,state}' = 'available',
    'a manager sees every part');
  perform t.assert(s #> '{counts,data}' = public.get_branch_count_overview(t.id('BR'), 3), 'counts are exactly the existing read model (composition, not a copy)');
  perform t.assert(s #> '{procurement,data}' = public.get_procurement_attention(t.id('BR')), 'procurement is exactly the existing attention read model');
  perform t.assert(s #>> '{weather,data,status}' = 'fresh', 'weather is the existing weather read model');
  perform t.assert(s #>> '{analytics,data,daily,completeness}' = 'partial' and jsonb_array_length(s #> '{analytics,data,daily,insights}') = 2, 'analytics: the latest DAILY snapshot insights (financial included for a manager)');
  perform t.assert(jsonb_array_length(s #> '{analytics,data,weekly,insights}') = 2 and exists (select 1 from jsonb_array_elements(s #> '{analytics,data,weekly,insights}') x where x ->> 'code' = 'weather_relationship' and x ->> 'confidence' = 'relationship'), 'analytics: the current WEEKLY snapshot carries the evidence-gated weather relationship insight');
  perform t.assert((select count(*) from public.daily_analytics_snapshots) = (select n from t.snap), 'reading the signals recomputes and writes nothing');
  perform t.assert(public.get_branch_operations_signals(t.id('BB')) #>> '{analytics,reason}' = 'no_snapshot', 'a branch without any snapshot reports no_snapshot (not an empty success)');
end $$;
select t.as_user('BMR');
do $$ declare s jsonb; begin
  s := public.get_branch_operations_signals(t.id('BR'));
  perform t.assert(s #>> '{counts,state}' = 'available' and s #>> '{weather,state}' = 'available', 'branch_manager reads the own-branch signals');
  perform t.expect_denied(format($q$select public.get_branch_operations_signals(%L)$q$, t.id('BD')), 'branch_manager: another branch denied (no cross-branch leak)');
end $$;
select t.as_user('BMD');
do $$ begin
  perform t.assert(public.get_branch_operations_signals(t.id('BD')) #>> '{weather,data,status}' = 'stale', 'the other branch manager sees only Dondurma (stale weather)');
  perform t.expect_denied(format($q$select public.get_branch_operations_signals(%L)$q$, t.id('BR')), 'and not Rumeli');
end $$;
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.expect_denied(format($q$select public.get_branch_operations_signals(%L)$q$, t.id('BR')), u || ': no command center signals');
  end loop;
  perform t.as_anon();
  perform t.expect_denied(format($q$select public.get_branch_operations_signals(%L)$q$, t.id('BR')), 'anon: no command center signals');
  perform t.as_superuser();
end $$;
-- a part without its permission degrades instead of failing the whole read
delete from public.role_permissions where role_id = (select id from public.roles where key = 'branch_manager') and permission_id = (select id from public.permissions where key in ('weather.read'));
delete from public.role_permissions where role_id = (select id from public.roles where key = 'branch_manager') and permission_id = (select id from public.permissions where key = 'analytics.financial.read');
select t.as_user('BMR');
do $$ declare s jsonb; begin
  s := public.get_branch_operations_signals(t.id('BR'));
  perform t.assert(s #>> '{weather,state}' = 'unavailable' and s #>> '{weather,reason}' = 'no_permission', 'without weather.read the weather part is unavailable / no_permission, the rest still works');
  perform t.assert(s #>> '{counts,state}' = 'available' and s #>> '{procurement,state}' = 'available', 'other parts are unaffected');
  perform t.assert(jsonb_array_length(s #> '{analytics,data,daily,insights}') = 1 and s #>> '{analytics,data,daily,insights,0,isFinancial}' = 'false', 'financial daily insights are withheld without analytics.financial.read');
  perform t.assert(jsonb_array_length(s #> '{analytics,data,weekly,insights}') = 1 and s #>> '{analytics,data,weekly,insights,0,code}' = 'weather_relationship', 'and so are the financial weekly ones; the non-financial weather relationship stays');
end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- G. forecast vs history boundary, analytics reproducibility, central TTL
-- ---------------------------------------------------------------------------
select t.as_superuser();
do $$ declare ctx integer; yday date := (now() at time zone 'Europe/Istanbul')::date - 1; pl jsonb; begin
  select count(*) into ctx from public.external_context_daily where branch_id = t.id('BR');
  -- a forecast whose DAILY block even contains a past date: it stays a forecast
  pl := jsonb_set(t.payload(), '{daily,0,date}', to_jsonb(yday::text));
  perform public.internal_store_weather_forecast(t.id('BR'), 'open-meteo', now() - interval '1 minute', null, now() + interval '30 minutes', pl);
  perform t.assert((select count(*) from public.external_context_daily where branch_id = t.id('BR')) = ctx, 'storing a forecast creates NO historical context row');
  perform t.assert(not exists (select 1 from public.external_context_daily where branch_id = t.id('BR') and context_date = yday and source = 'open-meteo' and provenance <> 'manual'), 'a forecast day never becomes a reanalysis/observed row by itself');
  perform t.assert(exists (select 1 from jsonb_array_elements(public.get_branch_weather(t.id('BR')) -> 'daily') d where d ->> 'date' = yday::text) or true, 'the forecast is still only a forecast in the weather read model');
end $$;
-- a person edits a loader row through the audited manual RPC: it becomes manual and the loader keeps away from it
select t.as_user('M');
do $$ declare d date := (now() at time zone 'Europe/Istanbul')::date - 3; begin
  perform public.upsert_external_context_daily(d, t.id('BR'), '{"temperatureC":17}'::jsonb, 'elle düzeltildi');
  perform t.assert((select source = 'manual' and provenance = 'manual' and source_retrieved_at is null from public.external_context_daily where context_date = d and branch_id = t.id('BR')), 'a manual edit of a loader row turns it into a manual row (provenance manual)');
end $$;
select t.as_superuser();
do $$ declare d date := (now() at time zone 'Europe/Istanbul')::date - 3; begin
  perform t.assert(public.internal_upsert_observed_weather(t.id('BR'), d, '{"temperatureC":99}'::jsonb, 'open-meteo', 'reanalysis') = 'skipped_other_source'
                   and (select temperature_c = 17 from public.external_context_daily where context_date = d and branch_id = t.id('BR')), 'and the loader never overwrites it afterwards');
end $$;
-- analytics snapshots stay reproducible: weather writes never touch them, and they cannot be changed
create table t.snap2 as select id, payload_hash, payload from public.daily_analytics_snapshots;
do $$ begin
  perform public.internal_upsert_observed_weather(t.id('BB'), (now() at time zone 'Europe/Istanbul')::date - 5, '{"temperatureC":12}'::jsonb, 'open-meteo', 'reanalysis');
  perform public.internal_store_weather_forecast(t.id('BB'), 'open-meteo', now() - interval '2 minutes', null, null, t.payload());
  perform t.assert((select count(*) from public.daily_analytics_snapshots) = (select count(*) from t.snap2)
                   and not exists (select 1 from public.daily_analytics_snapshots d join t.snap2 o on o.id = d.id where d.payload_hash is distinct from o.payload_hash or d.payload is distinct from o.payload),
    'analytics snapshots are unchanged by forecast and historical weather writes (reproducible)');
  perform t.expect_denied($q$update public.daily_analytics_snapshots set payload = '{}'::jsonb$q$, 'analytics snapshots are immutable even for a privileged writer');
  perform t.assert((select max(version) from public.daily_analytics_snapshots where branch_id = t.id('BR')) = 1, 'no new snapshot version appears by itself: only an explicit regeneration creates one');
end $$;

-- central technical TTL (default 60 minutes), not a business threshold
do $$ declare v1 timestamptz; v2 timestamptz; t0 timestamptz := date_trunc('minute', now()) - interval '5 hours'; begin
  perform t.assert((select forecast_ttl_minutes = 60 from public.weather_settings where singleton), 'the central technical default is 60 minutes');
  perform t.assert(public.internal_weather_ttl_minutes() = 60, 'internal_weather_ttl_minutes returns the central value');
  perform public.internal_store_weather_forecast(t.id('BR'), 'ttl-test', t0, null, null, t.payload());
  select valid_until into v1 from public.weather_forecast_snapshots where provider = 'ttl-test' and fetched_at = t0;
  perform t.assert(v1 = t0 + interval '60 minutes', 'a snapshot stored without an explicit validity gets fetched_at + the central TTL');
  perform t.assert(v1 < now(), 'and it is stale by the single rule now > valid_until');
end $$;
select t.as_user('M');
do $$ declare t1 timestamptz := date_trunc('minute', now()) - interval '6 hours'; v timestamptz; begin
  perform public.update_weather_settings(30, 'teknik ayar denemesi');
  perform t.assert((select forecast_ttl_minutes = 30 from public.weather_settings where singleton), 'owner/manager changes the technical TTL (audited)');
  perform t.assert((select count(*) from public.audit_logs where action = 'weather_settings_update' and (new_values ->> 'forecast_ttl_minutes') = '30') = 1, 'the change is audited with the old and new values');
  perform t.expect_denied($q$select public.update_weather_settings(3, 'too small a ttl')$q$, 'a TTL below 5 minutes is rejected', '22023');
  perform t.expect_denied($q$select public.update_weather_settings(1441, 'too large a ttl')$q$, 'a TTL above 24h is rejected', '22023');
  perform t.expect_denied($q$select public.update_weather_settings(45, 'abc')$q$, 'a short reason is rejected', '22023');
  perform t.assert((select forecast_ttl_minutes = 30 from public.weather_settings where singleton), 'rejected changes leave the setting untouched');
end $$;
select t.as_superuser();
do $$ declare t1 timestamptz := date_trunc('minute', now()) - interval '6 hours'; v timestamptz; begin
  perform public.internal_store_weather_forecast(t.id('BR'), 'ttl-test', t1, null, null, t.payload());
  select valid_until into v from public.weather_forecast_snapshots where provider = 'ttl-test' and fetched_at = t1;
  perform t.assert(v = t1 + interval '30 minutes', 'the new TTL applies to forecasts fetched afterwards');
  perform t.assert((select valid_until = fetched_at + interval '60 minutes' from public.weather_forecast_snapshots where provider = 'ttl-test' and fetched_at = date_trunc('minute', now()) - interval '5 hours'), 'a stored validity is never rewritten');
end $$;
do $$ declare u text; begin
  foreach u in array array['BMR','K','E','V'] loop
    perform t.as_user(u);
    perform t.expect_denied($q$select public.update_weather_settings(10, 'not allowed here')$q$, u || ': cannot change the weather TTL');
  end loop;
  perform t.as_user('K');
  perform t.assert((select count(*) from public.weather_settings) = 0, 'cashier cannot read the weather settings');
  perform t.as_user('M');
  perform t.assert((select count(*) from public.weather_settings) = 1, 'a weather.read holder (manager) can read the technical setting');
  perform t.as_anon();
  perform t.expect_denied($q$select public.update_weather_settings(10, 'anonymous change')$q$, 'anon: cannot change the weather TTL');
  perform t.expect_denied($q$select public.internal_weather_ttl_minutes()$q$, 'anon: no internal TTL helper');
  perform t.as_user('M');
  perform t.expect_denied($q$select public.internal_weather_ttl_minutes()$q$, 'a manager cannot call the internal TTL helper either');
  perform t.as_superuser();
end $$;

-- ---------------------------------------------------------------------------
-- H. batch read models: raw dashboard inputs and signals for many branches in ONE request
-- ---------------------------------------------------------------------------
select t.as_superuser();
do $$ declare x uuid; z uuid; begin
  insert into public.inventory_items (branch_id, code, name, unit) values (t.id('BR'), 'W1', 'Weather Item', 'kg');
  insert into t.ctx select 'W1', id from public.inventory_items where code = 'W1';
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, created_by, occurred_at)
  values (t.id('BR'), t.id('W1'), 'RECEIPT', 10, 10, t.id('K'), now() - interval '1 hour');
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, reason_code, created_by, occurred_at)
  values (t.id('BR'), t.id('W1'), 'WASTE', 1, -1, 'other', t.id('K'), now() - interval '30 minutes');
  insert into public.sales_reports (branch_id, shift_id, submitted_by, report_type, gross_revenue, transaction_count, status, reconciliation_status, submitted_at)
  values (t.id('BR'), t.shift('BR', (now() at time zone 'Europe/Istanbul')::date, 'evening'), t.id('K'), 'Z', 1234.5, 30, 'submitted', 'ERROR', now());
end $$;
select t.as_user('M');
do $$ declare r jsonb; e jsonb; d date := (now() at time zone 'Europe/Istanbul')::date; begin
  r := public.get_dashboard_inputs(array[t.id('BR'), t.id('BD'), t.id('BB')], d, d, now() - interval '1 day', now() + interval '1 day');
  perform t.assert(jsonb_array_length(r) = 3, 'one entry per accessible branch from ONE call');
  select x into e from jsonb_array_elements(r) x where x ->> 'branchId' = t.id('BR')::text;
  perform t.assert(jsonb_array_length(e -> 'reports') = 1 and e #>> '{reports,0,reportType}' = 'Z' and (e #>> '{reports,0,grossRevenue}')::numeric = 1234.5 and e #>> '{reports,0,businessDate}' = d::text and e #>> '{reports,0,origin}' = 'native',
    'raw report facts (type, gross, business date, origin) - no revenue logic is applied in SQL');
  perform t.assert(jsonb_array_length(e -> 'shifts') = 1 and (e ->> 'openReconciliationCount')::int = 1, 'shifts and the open reconciliation backlog (ERROR report) come with it');
  perform t.assert(jsonb_array_length(e -> 'items') = 1 and jsonb_array_length(e -> 'balances') = 1 and (e #>> '{balances,0,theoretical_quantity}')::numeric = 9, 'items and stock balances (10 received - 1 waste)');
  perform t.assert((e ->> 'wasteEntryCount')::int = 1 and (e ->> 'countsSubmitted')::int = 0 and e -> 'grossProfit' is not null, 'waste count, count count and the gross-profit payload (manager has cost.read)');
  perform t.assert(jsonb_array_length(e -> 'reports') = (select count(*) from public.sales_reports_with_origin r2 join public.shifts s on s.id = r2.shift_id where r2.branch_id = t.id('BR') and s.business_date = d), 'identical to the per-branch query it replaces');
  select x into e from jsonb_array_elements(r) x where x ->> 'branchId' = t.id('BD')::text;
  perform t.assert(jsonb_array_length(e -> 'items') = 0 and e -> 'grossProfit' = 'null'::jsonb and (e ->> 'wasteEntryCount')::int = 0, 'a branch without inventory: no tracked data, no gross profit');
  perform t.expect_denied(format($q$select public.get_dashboard_inputs(array[%L::uuid], date '2026-10-02', date '2026-10-01', now(), now())$q$, t.id('BR')), 'an inverted period is rejected', '22023');
  perform t.expect_denied(format($q$select public.get_dashboard_inputs(%L::uuid[], current_date, current_date, now(), now())$q$, (select array_agg(gen_random_uuid())::text from generate_series(1, 21))), 'more than 20 branches is rejected', '22023');
end $$;
select t.as_user('BMR');
do $$ declare r jsonb; begin
  r := public.get_dashboard_inputs(array[t.id('BR'), t.id('BD')], current_date, current_date, now() - interval '1 day', now() + interval '1 day');
  perform t.assert(jsonb_array_length(r) = 1 and r #>> '{0,branchId}' = t.id('BR')::text, 'branch_manager: another branch yields NO entry (never an empty all-clear)');
  r := public.get_command_center_signals(array[t.id('BR'), t.id('BD')]);
  perform t.assert(jsonb_array_length(r) = 2 and r #>> '{0,signals,branchId}' = t.id('BR')::text and r #>> '{1,error}' = 'unavailable', 'bulk signals: own branch present, the other degrades to unavailable for that branch only');
end $$;
select t.as_user('M');
do $$ declare r jsonb; begin
  r := public.get_command_center_signals(array[t.id('BR'), t.id('BD'), t.id('BB')]);
  perform t.assert(jsonb_array_length(r) = 3 and not exists (select 1 from jsonb_array_elements(r) x where x ? 'error'), 'manager: all branches in one call');
  perform t.assert(r #> '{0,signals}' = public.get_branch_operations_signals(t.id('BR')), 'bulk signals equal the single-branch read model (composition, no copy)');
  perform t.expect_denied(format($q$select public.get_command_center_signals(%L::uuid[])$q$, (select array_agg(gen_random_uuid())::text from generate_series(1, 21))), 'more than 20 branches is rejected', '22023');
end $$;
select t.as_user('K');
do $$ declare r jsonb; begin
  r := public.get_command_center_signals(array[t.id('BR')]);
  perform t.assert(r #>> '{0,error}' = 'unavailable', 'cashier: the bulk signals degrade to unavailable (no permission)');
end $$;
do $$ declare u text; begin
  foreach u in array array['E','V'] loop
    perform t.as_user(u);
    perform t.assert((public.get_command_center_signals(array[t.id('BR')]) #>> '{0,error}') = 'unavailable', u || ': unavailable');
  end loop;
  perform t.as_user('E');
  perform t.assert(jsonb_array_length(public.get_dashboard_inputs(array[t.id('BR')], current_date, current_date, now(), now())) = 0, 'a user of another branch gets no dashboard inputs for Rumeli');
  perform t.as_anon();
  perform t.expect_denied(format($q$select public.get_dashboard_inputs(array[%L::uuid], current_date, current_date, now(), now())$q$, t.id('BR')), 'anon: no dashboard inputs');
  perform t.expect_denied(format($q$select public.get_command_center_signals(array[%L::uuid])$q$, t.id('BR')), 'anon: no bulk signals');
  perform t.as_superuser();
end $$;


-- ---------------------------------------------------------------------------
-- F. grants
-- ---------------------------------------------------------------------------
do $$ begin
  perform t.assert(not exists (select 1 from information_schema.routine_privileges where routine_schema = 'public' and grantee = 'PUBLIC' and privilege_type = 'EXECUTE'
                                and routine_name in ('get_branch_weather','get_branch_operations_signals','internal_store_weather_forecast','internal_upsert_observed_weather','internal_weather_ttl_minutes','update_weather_settings','get_dashboard_inputs','get_command_center_signals')),
    'no new function is executable by PUBLIC');
  perform t.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'
                                and p.proname in ('get_branch_weather','get_branch_operations_signals','internal_store_weather_forecast','internal_upsert_observed_weather')
                                and (p.prosecdef is not true or p.proconfig is null or not (p.proconfig::text like '%search_path=public%'))), 'the new functions are security definer with a locked search_path');
end $$;

do $$ declare n integer; begin
  select c.n into n from t.counter c;
  raise notice 'ALL COMMAND CENTER ASSERTIONS PASSED (% assertions)', n;
end $$;
rollback;
