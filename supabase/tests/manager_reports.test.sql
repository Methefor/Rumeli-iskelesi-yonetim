-- =============================================================================
-- manager_reports.test.sql  (Phase 1E: the manager-report batch read model + security)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE with every migration applied
-- (supabase db reset --local --no-seed). One transaction, ends in ROLLBACK.
--
--   docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres \
--        -v ON_ERROR_STOP=1 < supabase/tests/manager_reports.test.sql
--
-- Clean run prints 'ALL MANAGER REPORT ASSERTIONS PASSED (<n> assertions)'. Synthetic data only.
-- get_manager_report_inputs only BUNDLES existing read models: these tests prove it equals them, adds no logic, writes nothing,
-- never returns a hypothesis, and enforces role / branch scope.
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
create function t.as_superuser() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
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
create function t.rep(p_branch text, p_date date, p_type text, p_rev numeric, p_tx integer, p_recon text default 'OK') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.sales_reports (branch_id, shift_id, submitted_by, report_type, gross_revenue, transaction_count, status, reconciliation_status, updated_at, submitted_at)
  values (t.id(p_branch), t.shift(p_branch, p_date, case when p_type = 'X' then 'morning' else 'evening' end), t.id('K'), p_type, p_rev, p_tx, 'submitted', p_recon,
          (p_date::text || ' ' || case when p_type = 'X' then '09:00' else '21:00' end)::timestamp at time zone 'Europe/Istanbul',
          (p_date::text || ' ' || case when p_type = 'X' then '09:00' else '21:00' end)::timestamp at time zone 'Europe/Istanbul')
  returning id into v;
  return v;
end $$;
create function t.gen(p_branch text, p_from date, p_to date) returns void language plpgsql as $$
declare d date;
begin
  for d in select generate_series(p_from, p_to, interval '1 day')::date loop
    perform public.internal_generate_daily_analytics(t.id(p_branch), d, 'scheduled');
  end loop;
end $$;
create function t.run(p_branches text[], p_scope text, p_date date) returns jsonb language sql stable as $$
  select public.get_manager_report_inputs(array(select t.id(b) from unnest(p_branches) b), p_scope, p_date)
$$;
create function t.entry(p_json jsonb, p_branch text) returns jsonb language sql immutable as $$
  select e from jsonb_array_elements(p_json) e where e ->> 'branchId' = t.id(p_branch)::text
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Identities ---------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O', '00000000-0000-0000-0000-0000000000f1'), ('M', '00000000-0000-0000-0000-0000000000f2'),
  ('BMD', '00000000-0000-0000-0000-0000000000f3'), ('BMR', '00000000-0000-0000-0000-0000000000f4'),
  ('K', '00000000-0000-0000-0000-0000000000f5'), ('E', '00000000-0000-0000-0000-0000000000f6'),
  ('V', '00000000-0000-0000-0000-0000000000f7');
insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into t.ctx select 'BB', id from public.branches where key = 'balik_ekmek';
insert into auth.users (id, email) select v, lower(k) || '@mr-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','V');
insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'), 'R Owner', 'R901'), (t.id('M'), 'R Manager', 'R902'), (t.id('BMD'), 'R BM Dondurma', 'R903'),
  (t.id('BMR'), 'R BM Rumeli', 'R904'), (t.id('K'), 'R Cashier', 'R905'), (t.id('E'), 'R Employee', 'R906'), (t.id('V'), 'R Viewer', 'R907');
insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('V','viewer')) x(k, rk) join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('E'), t.id('BD')), (t.id('V'), t.id('BR'));
insert into public.shift_definitions (branch_id, key, name, start_hour, end_hour, cutoff_hour)
values (t.id('BB'), 'evening', 'Akşam', 16, 23, 1), (t.id('BB'), 'morning', 'Sabah', 8, 16, 16) on conflict do nothing;

-- Fixtures: week 2026-09-14 (Mon) .. 2026-09-20 (Sun) of the Rumeli branch, and the previous week -------------------------------
--   Mon 14 Z 1000/20 | Tue 15 Z 1100/22 | Wed 16 X only 600/12 | Thu 17 X 1500/30 + Z 1200/24 (Z below X)
--   Fri 18 Z 1300/26 with a reconciliation WARNING | Sat 19 Z 1800/36 | Sun 20 no snapshot generated (missing day)
do $$ declare r uuid; d date; begin
  perform t.rep('BR', date '2026-09-14', 'Z', 1000, 20);
  perform t.rep('BR', date '2026-09-15', 'Z', 1100, 22);
  perform t.rep('BR', date '2026-09-16', 'X', 600, 12);
  perform t.rep('BR', date '2026-09-17', 'X', 1500, 30);
  perform t.rep('BR', date '2026-09-17', 'Z', 1200, 24);
  perform t.rep('BR', date '2026-09-18', 'Z', 1300, 26, 'WARNING');
  perform t.rep('BR', date '2026-09-19', 'Z', 1800, 36);
  for d in select generate_series(date '2026-09-07', date '2026-09-13', interval '1 day')::date loop
    perform t.rep('BR', d, 'Z', 900, 18);
  end loop;
  perform t.rep('BD', date '2026-09-15', 'Z', 400, 8);
end $$;
-- historical weather context with provenance (reanalysis = modelled history, never observed)
insert into public.external_context_daily (context_date, branch_id, temperature_c, temperature_min_c, temperature_max_c, precipitation_mm, source, provenance)
values (date '2026-09-14', t.id('BR'), 18.25, 14, 22, 0, 'open-meteo', 'reanalysis'), (date '2026-09-15', t.id('BR'), 17.5, 13, 21, 2.4, 'open-meteo', 'reanalysis');
select t.gen('BR', date '2026-09-07', date '2026-09-19');
select t.gen('BD', date '2026-09-15', date '2026-09-15');
select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-14', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-07', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BD'), date '2026-09-14', 'scheduled');
-- an AI hypothesis and a financial fact on the daily snapshot of 2026-09-15: a report must never return the hypothesis
insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, origin, is_financial)
select t.id('BR'), 'daily', date '2026-09-15', s.id, 'hypothesis', 'ai_guess_test', 'Olası bir açıklama (hipotez)', 'ai', false
  from public.daily_analytics_snapshots s where s.branch_id = t.id('BR') and s.business_date = date '2026-09-15' order by s.version desc limit 1;

-- ---------------------------------------------------------------------------
-- A. function shape and grants
-- ---------------------------------------------------------------------------
do $$ declare p record; begin
  select * into p from pg_proc where proname = 'get_manager_report_inputs' and pronamespace = 'public'::regnamespace;
  perform t.assert(p.provolatile = 's', 'the report read model is STABLE (it can not write)');
  perform t.assert(p.prosecdef is false, 'it runs as the caller (SECURITY INVOKER): RLS and every inner permission check apply');
  perform t.assert(coalesce(p.proconfig::text, '') like '%search_path=public%', 'search_path is locked');
  perform t.assert(not has_function_privilege('anon', 'public.get_manager_report_inputs(uuid[],text,date)', 'execute'), 'anon can not execute');
  perform t.assert(not has_function_privilege('public', 'public.get_manager_report_inputs(uuid[],text,date)', 'execute'), 'PUBLIC can not execute');
  perform t.assert(has_function_privilege('authenticated', 'public.get_manager_report_inputs(uuid[],text,date)', 'execute'), 'authenticated may execute (then permission-checked)');
  perform t.assert((select count(*) from pg_class where relname in ('manager_report_snapshots', 'manager_reports')) = 0, 'no report table exists in V1 (reports are reproducible from immutable snapshots)');
end $$;

-- ---------------------------------------------------------------------------
-- B. argument validation and role matrix
-- ---------------------------------------------------------------------------
select t.as_user('O');
do $$ begin
  perform t.expect_denied($q$select public.get_manager_report_inputs(null, 'daily', date '2026-09-15')$q$, 'null branch list is invalid', '22023');
  perform t.expect_denied($q$select public.get_manager_report_inputs(array(select gen_random_uuid() from generate_series(1, 21)), 'daily', date '2026-09-15')$q$, 'more than 20 branches is invalid', '22023');
  perform t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'monthly', date '2026-09-15')$q$, t.id('BR')), 'unknown scope is invalid', '22023');
  perform t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'weekly', date '2026-09-15')$q$, t.id('BR')), 'a weekly report starts on a Monday', '22023');
  perform t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'daily', null)$q$, t.id('BR')), 'a date is required', '22023');
end $$;
select t.as_user('K');
select t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'daily', date '2026-09-15')$q$, t.id('BR')), 'cashier is denied', '42501');
select t.as_user('E');
select t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'daily', date '2026-09-15')$q$, t.id('BD')), 'employee is denied', '42501');
select t.as_user('V');
select t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'weekly', date '2026-09-14')$q$, t.id('BR')), 'viewer is denied', '42501');
select t.as_anon();
select t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'daily', date '2026-09-15')$q$, t.id('BR')), 'anon is denied', '42501');

-- ---------------------------------------------------------------------------
-- C. daily scope equals the existing read models (no logic of its own)
-- ---------------------------------------------------------------------------
select t.as_user('O');
do $$ declare r jsonb; e jsonb; begin
  r := t.run(array['BR', 'BD'], 'daily', date '2026-09-15');
  perform t.assert(jsonb_array_length(r) = 2, 'one entry per requested branch from ONE call (constant request count)');
  e := t.entry(r, 'BR');
  perform t.assert(e #> '{input,daily,envelope}' = public.get_daily_analytics(t.id('BR'), date '2026-09-15'), 'the daily envelope IS get_daily_analytics (identical jsonb)');
  perform t.assert(e #>> '{input,daily,envelope,state}' = 'current' and e #>> '{input,daily,envelope,payload,finalization}' = 'finalized', 'a finalized day is carried as the engine computed it');
  perform t.assert((e #>> '{input,daily,envelope,payload,financial,grossRevenue,value}')::numeric = 1100, 'finalized revenue is Z exactly');
  perform t.assert(e #>> '{input,waste,state}' = 'available' and (e #>> '{input,waste,data,entries}')::int = 0, 'waste is the existing waste report of the date (0 entries is a real 0)');
  perform t.assert(e #>> '{input,counts,state}' = 'available' and jsonb_array_length(e #> '{input,counts,data,recent}') = 0, 'closing counts are the existing overview');
  perform t.assert(t.entry(r, 'BD') #>> '{input,daily,envelope,state}' = 'current', 'the second branch is in the same answer');
  r := t.run(array['BR'], 'daily', date '2026-09-20');
  perform t.assert(t.entry(r, 'BR') #>> '{input,daily,envelope,state}' = 'missing', 'a date without a snapshot is reported missing, not invented');
  r := t.run(array['BR'], 'daily', date '2026-09-16');
  perform t.assert(t.entry(r, 'BR') #>> '{input,daily,envelope,payload,finalization}' = 'provisional', 'an X-only day stays provisional');
  perform t.assert(t.entry(r, 'BR') #>> '{input,daily,envelope,payload,financial,provisionalRevenue}' = '600.00' or (t.entry(r, 'BR') #>> '{input,daily,envelope,payload,financial,provisionalRevenue}')::numeric = 600, 'the X reading is exposed as provisional, never as revenue');
end $$;

-- hypotheses never reach a report
do $$ declare r jsonb; begin
  r := t.run(array['BR'], 'daily', date '2026-09-15');
  perform t.assert(not exists (select 1 from jsonb_array_elements(t.entry(r, 'BR') #> '{input,daily,insights}') i where i ->> 'confidence' = 'hypothesis'), 'a hypothesis insight is never returned');
  perform t.assert(exists (select 1 from public.analytics_insights where code = 'ai_guess_test' and confidence = 'hypothesis'), '(the hypothesis exists in the table: it is filtered, not absent)');
end $$;

-- ---------------------------------------------------------------------------
-- D. weekly scope: week envelope, 7 daily projections, Z<X, reconciliation, historical weather with provenance
-- ---------------------------------------------------------------------------
do $$ declare r jsonb; e jsonb; d jsonb; begin
  r := t.run(array['BR'], 'weekly', date '2026-09-14');
  e := t.entry(r, 'BR');
  perform t.assert(e #> '{input,weekly,envelope}' = public.get_weekly_analytics(t.id('BR'), date '2026-09-14'), 'the weekly envelope IS get_weekly_analytics (identical jsonb)');
  perform t.assert((e #>> '{input,weekly,envelope,weekComplete}')::boolean is true, 'a past week is complete');
  perform t.assert(jsonb_array_length(e #> '{input,days}') = 7, 'seven day projections Monday..Sunday');
  perform t.assert((select array_agg(x ->> 'date' order by x ->> 'date') from jsonb_array_elements(e #> '{input,days}') x)
                   = array['2026-09-14','2026-09-15','2026-09-16','2026-09-17','2026-09-18','2026-09-19','2026-09-20'], 'the days are the Monday..Sunday business dates');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-16');
  perform t.assert(d ->> 'finalization' = 'provisional', 'Wed: X only -> provisional (missing Z)');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-17');
  perform t.assert((d ->> 'zBelowX')::boolean is true, 'Thu: Z below X is flagged');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-18');
  perform t.assert((d #>> '{reconciliation,WARNING}')::int >= 1, 'Fri: the reconciliation warning count of the day is carried');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-14');
  perform t.assert(d #>> '{context,state}' = 'present' and d #>> '{context,provenance}' = 'reanalysis' and (d #>> '{context,temperatureC}')::numeric = 18.25,
    'historical weather keeps its provenance: reanalysis (modelled), never observed');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-20');
  perform t.assert(d ->> 'state' = 'missing', 'Sun: no stored daily snapshot -> missing (not an empty day)');
  d := (select x from jsonb_array_elements(e #> '{input,days}') x where x ->> 'date' = '2026-09-16');
  perform t.assert(d #>> '{context,state}' = 'missing', 'a day without a context row has missing context, not zeros');
  perform t.assert(e #>> '{input,waste,data,from}' = '2026-09-14' and e #>> '{input,waste,data,to}' = '2026-09-20', 'the waste report covers the whole week');
  perform t.assert(not (e #> '{input,days}')::text like '%"financial"%', 'the day projections carry no financial values');
end $$;

-- ---------------------------------------------------------------------------
-- E. role and branch scope: no cross-branch leak
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare r jsonb; begin
  r := t.run(array['BR', 'BD', 'BB'], 'daily', date '2026-09-15');
  perform t.assert(jsonb_array_length(r) = 3 and not exists (select 1 from jsonb_array_elements(r) x where x ? 'error'), 'manager reads every branch in one call');
  perform t.assert(not exists (select 1 from jsonb_array_elements(r) x where x #> '{input,access}' <> jsonb_build_object('financial', true, 'reports', true, 'stock', true, 'weather', true)),
    'manager: every domain access flag is true (financial, reports, stock, weather) for every branch');
end $$;
select t.as_user('O');
do $$ declare r jsonb; begin
  r := t.run(array['BR', 'BD', 'BB'], 'weekly', date '2026-09-14');
  perform t.assert(not exists (select 1 from jsonb_array_elements(r) x where x #> '{input,access}' <> jsonb_build_object('financial', true, 'reports', true, 'stock', true, 'weather', true)),
    'owner: every domain access flag is true for every branch');
end $$;
select t.as_user('M');
select t.as_user('BMD');
do $$ declare r jsonb; begin
  r := t.run(array['BR', 'BD'], 'daily', date '2026-09-15');
  perform t.assert(t.entry(r, 'BD') ? 'input' and not (t.entry(r, 'BD') ? 'error'), 'branch_manager reads its own branch');
  perform t.assert(t.entry(r, 'BR') ? 'error' and not (t.entry(r, 'BR') ? 'input'), 'branch_manager gets NO data for another branch (unavailable, not an empty all-clear)');
  perform t.assert(t.entry(r, 'BR')::text not like '%1100%' and t.entry(r, 'BR')::text not like '%finalization%', 'and nothing of the other branch leaks into the entry');
  r := t.run(array['BR'], 'weekly', date '2026-09-14');
  perform t.assert(t.entry(r, 'BR') ? 'error' and not (t.entry(r, 'BR') ? 'input'), 'the same holds for the weekly scope');
end $$;
select t.as_user('BMR');
do $$ declare r jsonb; begin
  r := t.run(array['BR', 'BD'], 'weekly', date '2026-09-14');
  perform t.assert(t.entry(r, 'BR') ? 'input' and t.entry(r, 'BD') ? 'error', 'the other branch manager sees only the Rumeli branch');
  perform t.assert(jsonb_array_length(t.entry(r, 'BR') #> '{input,days}') = 7, 'and its full week');
end $$;

-- ---------------------------------------------------------------------------
-- F. read-only and reproducible: nothing is written, same input -> same output
-- ---------------------------------------------------------------------------
select t.as_superuser();
create table t.before as select (select count(*) from public.daily_analytics_snapshots) d, (select count(*) from public.weekly_analytics_snapshots) w,
                                (select count(*) from public.analytics_insights) i, (select count(*) from public.audit_logs) a;
select t.as_user('O');
do $$ declare a jsonb; b jsonb; begin
  a := t.run(array['BR', 'BD'], 'weekly', date '2026-09-14');
  b := t.run(array['BR', 'BD'], 'weekly', date '2026-09-14');
  perform t.assert(a = b, 'two reads of the same week are identical (a past week is reproducible from its immutable snapshot versions)');
end $$;
select t.as_superuser();
do $$ declare b record; begin
  select * into b from t.before;
  perform t.assert((select count(*) from public.daily_analytics_snapshots) = b.d and (select count(*) from public.weekly_analytics_snapshots) = b.w
                   and (select count(*) from public.analytics_insights) = b.i and (select count(*) from public.audit_logs) = b.a,
    'reading a report writes nothing: no snapshot, no insight, no audit row (no analytics rebuild per render)');
end $$;

-- ---------------------------------------------------------------------------
-- G. without the financial permission the report is redacted and financial insights are withheld
-- ---------------------------------------------------------------------------
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.key = 'branch_manager' and p.key = 'analytics.financial.read';
select t.as_user('BMR');
do $$ declare r jsonb; e jsonb; begin
  r := t.run(array['BR'], 'daily', date '2026-09-15');
  e := t.entry(r, 'BR');
  perform t.assert((e #>> '{input,daily,envelope,payload,redacted}')::boolean is true and not (e #> '{input,daily,envelope,payload}' ? 'financial'), 'without analytics.financial.read the payload is redacted (no revenue)');
  r := t.run(array['BR'], 'weekly', date '2026-09-14');
  perform t.assert((t.entry(r, 'BR') #>> '{input,weekly,envelope,payload,redacted}')::boolean is true, 'and so is the weekly payload');
end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- H. DOMAIN PERMISSION INTERSECTION: analytics.read is only the entry permission. Each domain is checked by its own permission.
--    (financial was already removed from branch_manager in G; the other domains are removed one by one here)
-- ---------------------------------------------------------------------------
select t.as_user('BMR');
do $$ declare e jsonb; begin
  e := t.entry(t.run(array['BR'], 'daily', date '2026-09-15'), 'BR');
  perform t.assert((e #>> '{input,access,financial}')::boolean is false and (e #>> '{input,access,reports}')::boolean is true
                   and (e #>> '{input,access,stock}')::boolean is true and (e #>> '{input,access,weather}')::boolean is true,
    'without analytics.financial.read ONLY the financial flag is false (the other domains keep their own permission)');
  perform t.assert(e #>> '{input,waste,state}' = 'available' and e #>> '{input,counts,state}' = 'available', 'waste and counts stay available through their OWN permissions');
end $$;
select t.as_superuser();
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.key = 'branch_manager'
   and p.key in ('inventory.waste_report.read', 'inventory.count_review.read');
select t.as_user('BMR');
do $$ declare e jsonb; begin
  e := t.entry(t.run(array['BR'], 'weekly', date '2026-09-14'), 'BR');
  perform t.assert(e #>> '{input,waste,state}' = 'unavailable' and e #>> '{input,waste,reason}' = 'no_permission', 'without inventory.waste_report.read the waste part is unavailable / no_permission (not 0 entries)');
  perform t.assert(e #>> '{input,counts,state}' = 'unavailable' and e #>> '{input,counts,reason}' = 'no_permission', 'without inventory.count_review.read the counts part is unavailable / no_permission');
  perform t.assert(e #>> '{input,weekly,envelope,state}' = 'current', 'while the analytics snapshot itself is still readable');
end $$;
select t.as_superuser();
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.key = 'branch_manager' and p.key in ('inventory.read', 'reports.read', 'weather.read');
select t.as_user('BMR');
do $$ declare e jsonb; begin
  e := t.entry(t.run(array['BR'], 'daily', date '2026-09-15'), 'BR');
  perform t.assert((e #> '{input,access}') = jsonb_build_object('financial', false, 'reports', false, 'stock', false, 'weather', false),
    'a role holding ONLY analytics.read has no financial, reports, stock or weather access in the report (no privilege escalation)');
  perform t.assert(not (e #> '{input}' ? 'procurement') and not (e #> '{input}' ? 'weather') and not (e #> '{input}' ? 'attention'),
    'and the read model never carries procurement, weather or attention: those come only through their own guarded read models');
  perform t.assert(e #>> '{input,daily,envelope,state}' = 'current', 'analytics.read still opens the analytics snapshot (its own domain)');
end $$;
select t.as_superuser();
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.key = 'branch_manager' and p.key = 'analytics.read';
select t.as_user('BMR');
select t.expect_denied(format($q$select public.get_manager_report_inputs(array[%L::uuid], 'daily', date '2026-09-15')$q$, t.id('BR')), 'without analytics.read (the entry permission) the report is denied even with other domain permissions', '42501');
select t.as_superuser();

select 'ALL MANAGER REPORT ASSERTIONS PASSED (' || (select n from t.counter) || ' assertions)' as result;
rollback;
