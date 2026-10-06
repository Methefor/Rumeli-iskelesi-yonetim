-- =============================================================================
-- analytics_engine.test.sql  (Analytics Engine V1: deterministic metrics, RLS, snapshots)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE with every migration applied
-- (supabase db reset --local --no-seed). One transaction, ends in ROLLBACK.
--
--   docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres \
--        -v ON_ERROR_STOP=1 < supabase/tests/analytics_engine.test.sql
--
-- Clean run prints 'ALL ANALYTICS ENGINE ASSERTIONS PASSED'.
-- now() is constant inside a transaction, so staleness is exercised by inserting
-- source rows with an explicit later updated_at.
-- =============================================================================
begin;
set local timezone = 'Europe/Istanbul';

create schema t;
grant usage on schema t to anon, authenticated;
create table t.ctx (k text primary key, v uuid not null);
grant select on t.ctx to anon, authenticated;
create function t.id(p_key text) returns uuid language sql stable as $$ select v from t.ctx where k = p_key $$;
create function t.assert(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'TEST FAILED [%]: assertion is not true', p_label; end if;
end $$;
create function t.expect_denied(p_sql text, p_label text, p_state text default '42501') returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'TEST FAILED [%]: expected SQLSTATE % but got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: statement succeeded but should have failed with SQLSTATE %', p_label, p_state;
end $$;
create function t.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin execute p_sql;
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
create function t.as_superuser() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

-- fixtures helpers (run as superuser) ----------------------------------------
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
create function t.rep(p_branch text, p_shift uuid, p_type text, p_rev numeric, p_tx integer,
                      p_status text default 'submitted', p_updated timestamptz default null, p_submitted timestamptz default null)
returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.sales_reports (branch_id, shift_id, submitted_by, report_type, gross_revenue, transaction_count, status,
                                    reconciliation_status, updated_at, submitted_at)
  values (t.id(p_branch), p_shift, t.id('K'), p_type, p_rev, p_tx, p_status, 'OK',
          coalesce(p_updated, now()), coalesce(p_submitted, now()))
  returning id into v;
  return v;
end $$;
create function t.line(p_report uuid, p_cat text, p_amount numeric, p_qty integer default null,
                       p_item uuid default null, p_iqty numeric default null) returns void language plpgsql as $$
begin
  insert into public.sales_report_items (sales_report_id, category_id, amount, quantity, inventory_item_id, inventory_quantity)
  values (p_report, (select id from public.sales_categories where key = p_cat), p_amount, p_qty, p_item, p_iqty);
end $$;
create function t.sale_cost(p_branch text, p_item uuid, p_report uuid, p_qty numeric, p_cost numeric) returns void language plpgsql as $$
begin
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, unit_cost_snapshot, sales_report_id, created_by)
  values (t.id(p_branch), p_item, 'SALE', p_qty, -p_qty, p_cost, p_report, t.id('K'));
end $$;
create function t.daily(p_branch text, p_date date) returns jsonb language sql stable as $$
  select payload from public.daily_analytics_snapshots where branch_id = t.id(p_branch) and business_date = p_date order by version desc limit 1
$$;
create function t.weekly(p_branch text, p_week date) returns jsonb language sql stable as $$
  select payload from public.weekly_analytics_snapshots where branch_id = t.id(p_branch) and week_start = p_week order by version desc limit 1
$$;
create function t.n(p_json jsonb, p_path text[]) returns numeric language sql immutable as $$ select (p_json #>> p_path)::numeric $$;

-- ---------------------------------------------------------------------------
-- Identities
-- ---------------------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O', '00000000-0000-0000-0000-0000000000b1'), ('M', '00000000-0000-0000-0000-0000000000b2'),
  ('BMD', '00000000-0000-0000-0000-0000000000b3'), ('BMR', '00000000-0000-0000-0000-0000000000b4'),
  ('K', '00000000-0000-0000-0000-0000000000b5'), ('E', '00000000-0000-0000-0000-0000000000b6'),
  ('V', '00000000-0000-0000-0000-0000000000b7');
insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into t.ctx select 'BB', id from public.branches where key = 'balik_ekmek';
insert into auth.users (id, email) select v, lower(k) || '@analytics-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','V');
insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'), 'A Owner', 'A901'), (t.id('M'), 'A Manager', 'A902'), (t.id('BMD'), 'A BM Dondurma', 'A903'),
  (t.id('BMR'), 'A BM Rumeli', 'A904'), (t.id('K'), 'A Cashier', 'A905'), (t.id('E'), 'A Employee', 'A906'),
  (t.id('V'), 'A Viewer', 'A907');
insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('V','viewer')) x(k, rk) join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('E'), t.id('BD')), (t.id('V'), t.id('BR'));

-- a Balık shift definition (the weather fixtures use that branch, isolated from the others)
insert into public.shift_definitions (branch_id, key, name, start_hour, end_hour, cutoff_hour)
values (t.id('BB'), 'evening', 'Akşam', 16, 23, 1), (t.id('BB'), 'morning', 'Sabah', 8, 16, 16) on conflict do nothing;

-- A. permission matrix -------------------------------------------------------
do $$ begin
  perform t.assert((select count(*) from public.permissions where key like 'analytics.%') = 4, 'four analytics permissions exist');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id where r.key = 'owner' and p.key like 'analytics.%') = 4, 'owner holds all four');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id where r.key = 'manager' and p.key like 'analytics.%') = 4, 'manager holds all four');
  perform t.assert((select array_agg(p.key order by p.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id where r.key = 'branch_manager' and p.key like 'analytics.%')
    = array['analytics.ai.read','analytics.financial.read','analytics.read'], 'branch_manager: read + financial + ai, no regenerate');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id
    join public.permissions p on p.id = rp.permission_id where r.key in ('cashier','employee','viewer') and p.key like 'analytics.%') = 0,
    'cashier, employee and viewer have no analytics permission by default');
end $$;

-- ---------------------------------------------------------------------------
-- B. Fixtures. Revenue is BUSINESS-DAY level: morning = X, evening = Z, Z already includes X.
-- ---------------------------------------------------------------------------
create function t.legacy(p_report uuid, p_branch_key text) returns void language plpgsql as $$
begin
  insert into public.legacy_sales_report_links (legacy_report_id, branch_key, sales_report_id, source_hash)
  values (gen_random_uuid(), p_branch_key, p_report, 'test-hash');
end $$;

insert into public.inventory_items (branch_id, code, name, unit, sales_category_id) values
  (t.id('BR'), 'P1', 'Product One', 'kg', (select id from public.sales_categories where key = 'gida')),
  (t.id('BR'), 'P2', 'Product Two', 'adet', (select id from public.sales_categories where key = 'sicak_icecek'));
insert into t.ctx select 'P1', id from public.inventory_items where code = 'P1';
insert into t.ctx select 'P2', id from public.inventory_items where code = 'P2';
insert into public.registers (branch_id, key, name) values (t.id('BR'), 'r1', 'Register 1'), (t.id('BR'), 'r2', 'Register 2');

do $$
declare x uuid; z uuid; mx uuid;
begin
  -- 2026-09-30 (Wed), BOTH readings: morning X 1000/20, evening Z 2200/44 (cumulative), plus a CANCELLED Z 9999.
  -- X and Z are NOT two independent revenues: finalized day revenue = Z exactly = 2200, never 3200.
  x := t.rep('BR', t.shift('BR', date '2026-09-30', 'morning'), 'X', 1000, 20);
  perform t.line(x, 'gida', 600, 12); perform t.line(x, 'kahve', 400, 8);
  z := t.rep('BR', t.shift('BR', date '2026-09-30', 'evening'), 'Z', 2200, 44);
  perform t.line(z, 'gida', 1500, 30); perform t.line(z, 'kahve', 500, 10);
  perform t.line(z, 'gida', 200, null, t.id('P1'), 4);
  perform t.sale_cost('BR', t.id('P1'), z, 4, 20);
  mx := t.rep('BR', t.shift('BR', date '2026-09-30', 'morning'), 'Z', 9999, 99, 'cancelled');
  perform t.line(mx, 'gida', 9999, 99);

  -- 2026-09-29 (Tue), Z ONLY (finalized): lines gida 600/12, kahve 250/5 and product P1 150 x 3 (costed 20)
  -- submitted 22:30 UTC = 01:30 Istanbul on 09-30: must still belong to business date 09-29
  z := t.rep('BR', t.shift('BR', date '2026-09-29', 'evening'), 'Z', 1000, 20, 'submitted', null, timestamptz '2026-09-29 22:30+00');
  perform t.line(z, 'gida', 600, 12); perform t.line(z, 'kahve', 250, 5); perform t.line(z, 'gida', 150, null, t.id('P1'), 3);
  perform t.sale_cost('BR', t.id('P1'), z, 3, 20);

  -- same weekday (Wed) history: 09-23 1600/32, 09-16 1500/30, 09-09 1700/34 (all Z only);
  -- 09-02 has an X ONLY (provisional): it must never be a baseline sample
  perform t.rep('BR', t.shift('BR', date '2026-09-23', 'evening'), 'Z', 1600, 32);
  perform t.rep('BR', t.shift('BR', date '2026-09-16', 'evening'), 'Z', 1500, 30);
  perform t.rep('BR', t.shift('BR', date '2026-09-09', 'evening'), 'Z', 1700, 34);
  perform t.rep('BR', t.shift('BR', date '2026-09-02', 'morning'), 'X', 300, 6);

  -- X ONLY days: 09-17 (Thu) with lines, plus 09-24 (Thu) finalized by a Z so its previous week is the provisional 09-17
  x := t.rep('BR', t.shift('BR', date '2026-09-17', 'morning'), 'X', 600, 12);
  perform t.line(x, 'gida', 400, 8); perform t.line(x, 'kahve', 200, 4);
  perform t.rep('BR', t.shift('BR', date '2026-09-24', 'evening'), 'Z', 800, 16);

  -- week boundary: Sunday 09-27 belongs to the week of 09-21, Monday 09-28 to the week of 09-28
  perform t.rep('BR', t.shift('BR', date '2026-09-27', 'evening'), 'Z', 300, 6);
  perform t.rep('BR', t.shift('BR', date '2026-09-28', 'evening'), 'Z', 700, 14);
  -- only a cancelled report on 09-26
  perform t.rep('BR', t.shift('BR', date '2026-09-26', 'evening'), 'X', 123, 3, 'cancelled');
  -- Z without a transaction count (09-11)
  perform t.rep('BR', t.shift('BR', date '2026-09-11', 'evening'), 'Z', 800, null);
  -- inherited multi-register behaviour: two ACTIVE X readings on 09-08, no Z. The LATEST wins (700), they are never summed.
  perform t.rep('BR', t.shift('BR', date '2026-09-08', 'morning'), 'X', 500, 10, 'submitted', null, timestamptz '2026-09-08 10:00+00');
  insert into public.sales_reports (branch_id, shift_id, register_id, submitted_by, report_type, gross_revenue, transaction_count, status, reconciliation_status, submitted_at)
  values (t.id('BR'), t.shift('BR', date '2026-09-08', 'morning'), (select id from public.registers where key = 'r1'), t.id('K'), 'X', 700, 14, 'submitted', 'OK', timestamptz '2026-09-08 12:00+00'),
         (t.id('BR'), t.shift('BR', date '2026-09-08', 'morning'), (select id from public.registers where key = 'r2'), t.id('K'), 'X', 400, 8, 'submitted', 'OK', timestamptz '2026-09-08 09:00+00');
end $$;

-- Dondurma
do $$
declare z uuid;
begin
  perform t.rep('BD', t.shift('BD', date '2026-09-30', 'evening'), 'Z', 0, 0);                 -- zero transactions
  perform t.rep('BD', t.shift('BD', date '2026-09-28', 'evening'), 'Z', 900, 30);              -- low base next
  perform t.rep('BD', t.shift('BD', date '2026-09-21', 'evening'), 'Z', 100, 4);
  perform t.rep('BD', t.shift('BD', date '2026-09-27', 'evening'), 'Z', 300, 5);               -- zero base next
  perform t.rep('BD', t.shift('BD', date '2026-09-20', 'evening'), 'Z', 0, 0);
  insert into public.inventory_items (branch_id, code, name, unit, sales_category_id)
    values (t.id('BD'), 'D1', 'Dondurma One', 'kg', (select id from public.sales_categories where key = 'dondurma'));
  insert into t.ctx select 'D1', id from public.inventory_items where code = 'D1';
  z := t.rep('BD', t.shift('BD', date '2026-09-26', 'evening'), 'Z', 200, 5);                  -- fully costed, Z lines only
  perform t.line(z, 'dondurma', 200, null, t.id('D1'), 4);
  perform t.sale_cost('BD', t.id('D1'), z, 4, 30);
  -- legacy-imported days: 09-12 with a transaction count (mixed-origin comparison), 09-05 without one (+ product line)
  z := t.rep('BD', t.shift('BD', date '2026-09-12', 'evening'), 'Z', 5000, 100); perform t.legacy(z, 'iskele_dondurma');
  z := t.rep('BD', t.shift('BD', date '2026-09-05', 'evening'), 'Z', 4000, null);
  perform t.line(z, 'dondurma', 4000, null, t.id('D1'), 20); perform t.legacy(z, 'iskele_dondurma');
  perform t.rep('BD', t.shift('BD', date '2026-09-19', 'evening'), 'Z', 800, 16);              -- native, previous week is the legacy 09-12
end $$;

-- Balık: 28 finalized days with context for the weather relationship
do $$
declare d date; i integer := 0; temp numeric;
begin
  for d in select generate_series(date '2026-08-10', date '2026-09-06', interval '1 day')::date loop
    temp := 15 + (i % 10);
    perform t.rep('BB', t.shift('BB', d, 'evening'), 'Z', 1000 + 30 * temp, 20);
    insert into public.external_context_daily (context_date, branch_id, temperature_c, precipitation_mm)
      values (d, t.id('BB'), temp, case when i % 4 = 0 then 3 else 0 end);
    i := i + 1;
  end loop;
end $$;
-- Z is the final revenue: X=6000/Z=9600, X=9600/Z=6000 (z_below_x), X only, Z only (Balik, week of 09-07) + a later week
do $$
begin
  perform t.rep('BB', t.shift('BB', date '2026-09-10', 'morning'), 'X', 6000, 60); perform t.rep('BB', t.shift('BB', date '2026-09-10', 'evening'), 'Z', 9600, 96);
  perform t.rep('BB', t.shift('BB', date '2026-09-11', 'morning'), 'X', 9600, 96); perform t.rep('BB', t.shift('BB', date '2026-09-11', 'evening'), 'Z', 6000, 60);
  perform t.rep('BB', t.shift('BB', date '2026-09-12', 'morning'), 'X', 9600, 96);
  perform t.rep('BB', t.shift('BB', date '2026-09-13', 'evening'), 'Z', 9600, 96);
  perform t.rep('BB', t.shift('BB', date '2026-09-15', 'evening'), 'Z', 1000, 10);
end $$;
insert into public.external_context_daily (context_date, branch_id, temperature_c, precipitation_mm)
select d, t.id('BD'), 20, 0 from (values (date '2026-09-21'), (date '2026-09-27'), (date '2026-09-28'), (date '2026-09-26'), (date '2026-09-20')) v(d);

-- ---------------------------------------------------------------------------
-- C. Daily deterministic metrics
-- ---------------------------------------------------------------------------
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-30', 'scheduled');
do $$
declare p jsonb := t.daily('BR', date '2026-09-30');
begin
  perform t.assert(p ->> 'finalization' = 'finalized', 'a day with a Z reading is FINALIZED');
  perform t.assert(t.n(p, '{financial,grossRevenue,value}') = 2200 and p #>> '{financial,grossRevenue,state}' = 'available',
    'finalized revenue is Z exactly (2200): never normalized or summed with X (not 3200)');
  perform t.assert(p #>> '{financial,provisionalRevenue}' is null, 'a finalized day exposes no provisional revenue');
  perform t.assert(t.n(p, '{volume,transactions,value}') = 44 and p #>> '{volume,transactions,state}' = 'available', 'transactions use the same business-day rule (20 + 24)');
  perform t.assert(t.n(p, '{financial,averageBasket,value}') = 50 and p #>> '{financial,averageBasket,state}' = 'available', 'average basket is derived: revenue / transactions');
  perform t.assert(t.n(p, '{reports,cancelled}') = 1 and t.n(p, '{reports,active}') = 2, 'cancelled reports are counted separately and never feed metrics');
  perform t.assert(p #>> '{readings,x,present}' = 'true' and t.n(p, '{readings,x,revenue}') = 1000 and t.n(p, '{readings,z,revenue}') = 2200, 'both readings are exposed separately');
  -- line semantics are UNKNOWN: no category / product values and no gross profit are inferred
  perform t.assert(p #>> '{completeness,metrics,categories,status}' = 'unsupported' and p #>> '{completeness,metrics,products,status}' = 'unsupported'
    and p #>> '{completeness,metrics,categories,reasons,0}' = 'xz_line_semantics_unknown', 'with both X and Z lines, category/product detail is UNSUPPORTED (xz_line_semantics_unknown)');
  perform t.assert(jsonb_array_length(p #> '{financial,categories}') = 0 and jsonb_array_length(p #> '{financial,products}') = 0
    and jsonb_array_length(p #> '{volume,categories}') = 0 and jsonb_array_length(p #> '{volume,products}') = 0, 'no category/product values are emitted when the semantics are unknown');
  perform t.assert(p #>> '{volume,itemQuantity,state}' = 'unsupported', 'item quantity is unsupported too');
  perform t.assert(p #>> '{financial,grossProfit,metric,state}' = 'unsupported' and p #>> '{financial,grossProfit,grossOnly}' = 'true', 'gross profit is unsupported while the line semantics are unknown, and labelled gross-only');
  perform t.assert(p #>> '{completeness,metrics,revenue,status}' = 'complete' and p #>> '{completeness,overall}' = 'complete',
    'finalized total revenue is COMPLETE while product detail is unsupported');
  perform t.assert(p #>> '{completeness,metrics,hourly,status}' = 'unsupported' and p #>> '{completeness,metrics,hourly,reasons,0}' = 'no_hourly_source', 'hourly is unsupported');
  perform t.assert(p #>> '{completeness,metrics,context,status}' = 'partial' and p #> '{completeness,reasons}' ? 'missing_context' and p #>> '{context,state}' = 'missing',
    'missing weather is reported as missing_context, never as a normal day');
  perform t.assert(p #>> '{peakHour,state}' = 'unsupported', 'peak hour is explicitly unsupported by the source');
  perform t.assert(p ->> 'origin' = 'native', 'native origin');
end $$;

select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-29', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-17', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-24', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-26', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-11', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BR'), date '2026-09-08', 'scheduled');
do $$
declare p jsonb;
begin
  -- Z lines only: shown as reported, partial, never "complete"
  p := t.daily('BR', date '2026-09-29');
  perform t.assert(p ->> 'finalization' = 'finalized' and t.n(p, '{financial,grossRevenue,value}') = 1000, 'business_date, not the submission instant, decides the day (submitted 01:30 Istanbul next day); Z only is finalized');
  perform t.assert(p #>> '{completeness,metrics,categories,status}' = 'partial' and p #>> '{completeness,metrics,categories,reasons,0}' = 'z_line_semantics_unverified',
    'Z lines only: category detail is partial (z_line_semantics_unverified), not complete');
  perform t.assert((select (c ->> 'revenue')::numeric from jsonb_array_elements(p #> '{financial,categories}') c where c ->> 'key' = 'gida') = 750
    and (select (c ->> 'revenue')::numeric from jsonb_array_elements(p #> '{financial,categories}') c where c ->> 'key' = 'kahve') = 250, 'Z-only lines are reported as written (gida 600 + P1 150, kahve 250)');
  perform t.assert((select (c ->> 'quantity')::numeric from jsonb_array_elements(p #> '{volume,categories}') c where c ->> 'key' = 'gida') = 12, 'category quantity excludes product-linked lines');
  perform t.assert((select (c ->> 'revenue')::numeric from jsonb_array_elements(p #> '{financial,products}') c where c ->> 'code' = 'P1') = 150
    and (select (c ->> 'averageUnitPrice')::numeric from jsonb_array_elements(p #> '{financial,products}') c where c ->> 'code' = 'P1') = 50, 'product P1: revenue 150, quantity 3, unit price 50');
  perform t.assert(p #>> '{financial,grossProfit,metric,state}' = 'partial' and t.n(p, '{financial,grossProfit,metric,value}') = 90
    and p #>> '{financial,grossProfit,metric,reason}' = 'missing_cost', 'partial gross profit counts only the costed product (150 - 3*20) and says cost coverage is missing');
  perform t.assert(t.n(p, '{financial,grossProfit,coveredRevenue}') = 150 and t.n(p, '{financial,grossProfit,uncoveredRevenue}') = 850, 'gross profit coverage is explicit');

  -- X only: PROVISIONAL, X exposed separately, never silently finalized
  p := t.daily('BR', date '2026-09-17');
  perform t.assert(p ->> 'finalization' = 'provisional' and p #>> '{completeness,overall}' = 'partial', 'a day with only X is PROVISIONAL, not final');
  perform t.assert(p #>> '{financial,grossRevenue,state}' = 'unavailable' and p #>> '{financial,grossRevenue,reason}' = 'missing_z' and p #>> '{financial,grossRevenue,value}' is null
    and t.n(p, '{financial,provisionalRevenue}') = 600, 'X-only: NO finalized revenue (missing_z); the X reading is exposed only as provisionalRevenue');
  perform t.assert(p #>> '{financial,averageBasket,state}' = 'unavailable' and p #>> '{financial,averageBasket,reason}' = 'missing_z', 'X-only: no basket from a provisional reading');
  perform t.assert(p #>> '{completeness,metrics,revenue,status}' = 'partial' and p #> '{completeness,metrics,revenue,reasons}' ? 'missing_z', 'completeness explains missing_z');
  perform t.assert(p #>> '{volume,transactions,state}' = 'partial' and t.n(p, '{volume,transactions,value}') = 12, 'X-only transactions are partial');
  perform t.assert(p #>> '{completeness,metrics,categories,status}' = 'partial' and p #>> '{completeness,metrics,categories,reasons,0}' = 'missing_z'
    and jsonb_array_length(p #> '{financial,categories}') = 2, 'X lines only: provisional category detail (missing_z)');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'not_final', 'a provisional day gets no percentage comparison');

  -- Z after a provisional previous week
  p := t.daily('BR', date '2026-09-24');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'baseline_not_final', 'a provisional (X-only) baseline day is never compared against');

  p := t.daily('BR', date '2026-09-26');
  perform t.assert(not (p ->> 'hasData')::boolean and p ->> 'finalization' = 'no_data' and t.n(p, '{reports,cancelled}') = 1, 'a day with only cancelled reports has no data');
  perform t.assert(p #>> '{financial,averageBasket,state}' = 'unavailable', 'no reports: basket unavailable');

  p := t.daily('BR', date '2026-09-11');
  perform t.assert(p #>> '{volume,transactions,state}' = 'unavailable' and p #>> '{volume,transactions,reason}' = 'transaction_count_missing', 'missing transaction count: unavailable');
  perform t.assert(p #> '{completeness,reasons}' ? 'missing_transaction_count' and t.n(p, '{financial,grossRevenue,value}') = 800, 'missing_transaction_count is reported; revenue still counts');

  -- inherited multi-register behaviour (regression: a future change must be deliberate)
  p := t.daily('BR', date '2026-09-08');
  perform t.assert(t.n(p, '{financial,provisionalRevenue}') = 700 and t.n(p, '{readings,x,revenue}') = 700, 'INHERITED: with several active X readings the LATEST wins (700), they are never summed');
  perform t.assert(exists (select 1 from jsonb_array_elements(p -> 'warnings') w where w ->> 'code' = 'multiple_active_readings' and w ->> 'type' = 'X' and (w ->> 'count')::integer = 3),
    'INHERITED behaviour is surfaced as a multiple_active_readings warning');
end $$;

-- comparisons ----------------------------------------------------------------
do $$
declare p jsonb := t.daily('BR', date '2026-09-30');
begin
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousDay,state}' = 'ok' and t.n(p, '{financialComparisons,grossRevenue,previousDay,pct}') = 120.0, 'previous-day revenue change +120.0%');
  perform t.assert(t.n(p, '{financialComparisons,grossRevenue,previousWeekSameWeekday,pct}') = 37.5, 'previous-week same-weekday revenue change +37.5%');
  perform t.assert(t.n(p, '{baselineSamples,sameWeekdayFinalizedDays}') = 3, '4-week baseline uses only FINALIZED same-weekday days (the X-only 09-02 is excluded)');
  perform t.assert(t.n(p, '{financialComparisons,grossRevenue,baseline4SameWeekday,baseline}') = 1600 and t.n(p, '{financialComparisons,grossRevenue,baseline4SameWeekday,pct}') = 37.5, '4-week baseline = mean of the finalized days (1600), +37.5%');
  perform t.assert(t.n(p, '{volumeComparisons,transactions,previousWeekSameWeekday,pct}') = 37.5 and t.n(p, '{volumeComparisons,transactions,baseline4SameWeekday,baseline}') = 32, 'transaction comparisons mirror revenue');
  perform t.assert(t.n(p, '{financialComparisons,averageBasket,previousWeekSameWeekday,pct}') = 0.0, 'basket change 50 -> 50 = 0.0%');
end $$;

select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-30', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-28', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-27', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-26', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-19', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-12', 'scheduled');
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-05', 'scheduled');
do $$
declare p jsonb;
begin
  p := t.daily('BD', date '2026-09-30');
  perform t.assert(t.n(p, '{volume,transactions,value}') = 0 and p #>> '{volume,transactions,state}' = 'available', 'zero transactions is a real zero');
  perform t.assert(p #>> '{financial,averageBasket,state}' = 'unavailable' and p #>> '{financial,averageBasket,reason}' = 'zero_transactions', 'zero transactions: average basket unavailable, no division by zero');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousDay,state}' = 'no_baseline', 'missing comparison day is no_baseline, not a fabricated 0');
  p := t.daily('BD', date '2026-09-28');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'low_base'
    and p #> '{financialComparisons,grossRevenue,previousWeekSameWeekday,pct}' is null
    and t.n(p, '{financialComparisons,grossRevenue,previousWeekSameWeekday,delta}') = 800, 'low-volume base (100 TL): delta shown, no percentage');
  perform t.assert(p #>> '{volumeComparisons,transactions,previousWeekSameWeekday,state}' = 'low_base', 'low-volume transaction base (4) gives no percentage');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,baseline4SameWeekday,state}' = 'insufficient_samples', 'baseline from fewer than 2 comparable weeks is insufficient');
  p := t.daily('BD', date '2026-09-27');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'zero_base', 'zero baseline: percentage undefined');
  p := t.daily('BD', date '2026-09-26');
  perform t.assert(p #>> '{financial,grossProfit,metric,state}' = 'partial' and t.n(p, '{financial,grossProfit,metric,value}') = 80
    and p #>> '{financial,grossProfit,metric,reason}' = 'line_semantics_unverified', 'fully costed Z-only day: gross profit is still PARTIAL (line semantics unverified), never complete');

  -- legacy origin capability
  p := t.daily('BD', date '2026-09-05');
  perform t.assert(p ->> 'origin' = 'legacy_import' and p #>> '{completeness,metrics,revenue,status}' = 'complete' and t.n(p, '{financial,grossRevenue,value}') = 4000,
    'legacy: total historical revenue is supported');
  perform t.assert(p #>> '{completeness,metrics,products,status}' = 'unsupported' and p #>> '{completeness,metrics,products,reasons,0}' = 'legacy_source_limitation'
    and jsonb_array_length(p #> '{financial,products}') = 0, 'legacy: product metrics are unsupported (legacy_source_limitation)');
  perform t.assert(p #>> '{financial,grossProfit,metric,state}' = 'unsupported' and p #>> '{financial,grossProfit,metric,reason}' = 'legacy_source_limitation', 'legacy: gross profit is unsupported');
  perform t.assert(p #>> '{completeness,metrics,transactions,status}' = 'partial' and p #> '{completeness,metrics,transactions,reasons}' ? 'missing_transaction_count'
    and p #> '{completeness,metrics,transactions,reasons}' ? 'legacy_source_limitation', 'legacy: transactions only where the data exists; the limitation is named');
  perform t.assert(p #>> '{completeness,metrics,hourly,status}' = 'unsupported', 'legacy: hourly is unsupported');
  -- mixed native + legacy
  p := t.daily('BD', date '2026-09-19');
  perform t.assert(p #>> '{volumeComparisons,transactions,previousWeekSameWeekday,state}' = 'mixed_origin'
    and p #> '{volumeComparisons,transactions,previousWeekSameWeekday,pct}' is null, 'native vs legacy transaction comparison is refused (mixed_origin): no false precision');
  perform t.assert(p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'ok' and t.n(p, '{financialComparisons,grossRevenue,previousWeekSameWeekday,pct}') = -84.0
    and (p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,mixedOrigin}')::boolean, 'revenue is comparable across origins but flagged mixedOrigin');
  perform t.assert(p #>> '{financialComparisons,averageBasket,previousWeekSameWeekday,state}' = 'mixed_origin', 'basket comparison across origins is refused');
end $$;

-- insights ---------------------------------------------------------------------
do $$
begin
  perform t.assert(exists (select 1 from public.analytics_insights where code = 'revenue_vs_previous_week_same_weekday' and confidence = 'fact'
    and business_date = date '2026-09-30'), 'deterministic daily insight is a fact');
  perform t.assert(exists (select 1 from public.analytics_insights where code = 'gross_profit_partial_coverage' and business_date = date '2026-09-29'), 'missing cost is surfaced as an insight');
  perform t.assert(exists (select 1 from public.analytics_insights where code = 'revenue_provisional' and business_date = date '2026-09-17'), 'a provisional day is surfaced as an insight');
  perform t.assert(not exists (select 1 from public.analytics_insights where confidence = 'hypothesis'), 'the deterministic engine never emits a hypothesis');
end $$;
select t.expect_denied($q$insert into public.analytics_insights (branch_id, scope, business_date, daily_snapshot_id, confidence, code, title, origin)
  select branch_id, 'daily', business_date, id, 'hypothesis', 'weather_caused_it', 'x', 'deterministic' from public.daily_analytics_snapshots limit 1$q$,
  'a deterministic insight cannot be a hypothesis', '23514');

-- ---------------------------------------------------------------------------
-- D. Weekly metrics, week boundary, finalization, weather
-- ---------------------------------------------------------------------------
select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-28', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-21', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-14', 'scheduled');
do $$
declare w jsonb := t.weekly('BR', date '2026-09-28'); w1 jsonb := t.weekly('BR', date '2026-09-21'); w0 jsonb := t.weekly('BR', date '2026-09-14');
begin
  perform t.assert(t.n(w, '{financial,grossRevenue,value}') = 3900 and t.n(w, '{volume,transactions,value}') = 78 and w ->> 'finalization' = 'finalized', 'week 09-28..10-04: Monday 09-28 is inside, Sunday 09-27 is outside (700 + 1000 + 2200); all days finalized');
  perform t.assert(t.n(w1, '{financial,grossRevenue,value}') = 2700, 'week 09-21..09-27 holds Sunday 09-27 (1600 + 800 + 300)');
  perform t.assert(w ->> 'weekEnd' = '2026-10-04' and (w ->> 'weekComplete')::boolean and w #>> '{completeness,metrics,revenue,status}' = 'complete', 'week boundaries Monday..Sunday and completeness');
  perform t.assert(t.n(w, '{financialComparisons,grossRevenue,pct}') = 44.4 and t.n(w, '{volumeComparisons,transactions,pct}') = 44.4, 'weekly revenue / transaction change vs previous week');
  perform t.assert(t.n(w, '{financial,averageBasket,value}') = 50 and t.n(w, '{financialComparisons,averageBasket,pct}') = 0.0, 'weekly average basket and its change');
  perform t.assert(jsonb_array_length(w -> 'days') = 7, 'seven day rows');
  perform t.assert(w #>> '{weatherEffect,state}' = 'no_context' and w #> '{completeness,reasons}' ? 'missing_context', 'week without any context rows: weather effect is no_context (missing_context)');
  -- an X-only day can never make a week complete
  perform t.assert(w0 ->> 'finalization' = 'provisional' and t.n(w0, '{provisionalDays}') = 1 and t.n(w0, '{finalizedDays}') = 1, 'week 09-14: the X-only day makes the week provisional');
  perform t.assert(w0 #>> '{financial,grossRevenue,state}' = 'partial' and w0 #>> '{financial,grossRevenue,reason}' = 'missing_z' and t.n(w0, '{financial,provisionalRevenue}') = 600
    and t.n(w0, '{financial,grossRevenue,value}') = 1500, 'provisional week revenue sums FINALIZED Z values only (1500); the X part (600) is exposed separately');
  perform t.assert(w0 #>> '{completeness,metrics,revenue,status}' = 'partial' and w0 #> '{completeness,reasons}' ? 'missing_z' and w0 #>> '{completeness,overall}' = 'partial', 'weekly completeness explains missing_z');
  perform t.assert(w0 #>> '{financialComparisons,grossRevenue,state}' = 'not_final', 'a provisional week gets no percentage comparison');
  perform t.assert(w #>> '{completeness,metrics,products,status}' in ('unsupported', 'partial') and w #> '{completeness,metrics,products,reasons}' is not null, 'weekly product capability is explicit');
  perform t.assert(exists (select 1 from public.analytics_insights where weekly_snapshot_id = (select id from public.weekly_analytics_snapshots where branch_id = t.id('BR') and week_start = date '2026-09-14') and code = 'weekly_provisional_days'), 'a provisional week is surfaced as an insight');
  perform t.assert(exists (select 1 from public.analytics_insights where weekly_snapshot_id = (select id from public.weekly_analytics_snapshots where branch_id = t.id('BR') and week_start = date '2026-09-28') and code = 'weekly_revenue_change'), 'weekly fact insight written');
end $$;
select t.expect_denied($q$select public.internal_generate_weekly_analytics(t.id('BR'), date '2026-09-29', 'scheduled')$q$, 'week_start must be a Monday', '22023');
select t.expect_denied($q$select public.internal_generate_daily_analytics(t.id('BR'), current_date + 3, 'scheduled')$q$, 'future business date is refused', '22023');

select public.internal_generate_weekly_analytics(t.id('BB'), date '2026-08-31', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BD'), date '2026-09-28', 'scheduled');
do $$
declare wb jsonb := t.weekly('BB', date '2026-08-31'); wd jsonb := t.weekly('BD', date '2026-09-28');
begin
  perform t.assert(wb #>> '{weatherEffect,state}' = 'ok' and t.n(wb, '{weatherEffect,sample}') = 28, 'sufficient sample (28 finalized days with data and context): relationship reported');
  perform t.assert(t.n(wb, '{weatherEffect,temperatureCorrelation,r}') > 0.9, 'temperature vs weekday-adjusted revenue correlation computed (r > 0.9 on the fixture)');
  perform t.assert(wb #>> '{weatherEffect,confidence}' = 'relationship' and wb #>> '{weatherEffect,caveat}' like '%does not show that weather caused%', 'weather output is labelled a relationship with a no-causation caveat');
  perform t.assert(t.n(wb, '{weatherEffect,rainEffect,rainyDays}') = 7 and t.n(wb, '{weatherEffect,rainEffect,dryDays}') = 21, 'rain / dry day groups');
  perform t.assert(exists (select 1 from public.analytics_insights where code = 'weather_relationship' and confidence = 'relationship'), 'weather insight is stored as a relationship, never a fact');
  perform t.assert(wd #>> '{weatherEffect,state}' = 'insufficient_sample' and t.n(wd, '{weatherEffect,required}') = 14, 'only a handful of context days: insufficient correlation sample, no coefficient');
  perform t.assert(wd #> '{weatherEffect,temperatureCorrelation}' is null and wd #> '{completeness,reasons}' ? 'insufficient_sample', 'no correlation is emitted below the minimum sample');
end $$;

-- Z is final revenue: regression cases
select public.internal_generate_daily_analytics(t.id('BB'), d::date, 'scheduled') from generate_series(date '2026-09-10', date '2026-09-13', interval '1 day') d;
select public.internal_generate_weekly_analytics(t.id('BB'), date '2026-09-07', 'scheduled');
select public.internal_generate_weekly_analytics(t.id('BB'), date '2026-09-14', 'scheduled');
do $$
declare p jsonb; w jsonb := t.weekly('BB', date '2026-09-07'); wn jsonb := t.weekly('BB', date '2026-09-14');
begin
  p := t.daily('BB', date '2026-09-10');
  perform t.assert(p ->> 'finalization' = 'finalized' and t.n(p, '{financial,grossRevenue,value}') = 9600 and t.n(p, '{volume,transactions,value}') = 96 and jsonb_array_length(p -> 'warnings') = 0,
    'X=6000, Z=9600 => finalized revenue 9600 (Z exactly), no warning');
  p := t.daily('BB', date '2026-09-11');
  perform t.assert(p ->> 'finalization' = 'finalized' and t.n(p, '{financial,grossRevenue,value}') = 6000 and t.n(p, '{volume,transactions,value}') = 60
    and exists (select 1 from jsonb_array_elements(p -> 'warnings') x where x ->> 'code' = 'z_below_x') and p -> 'warnings' ->> 0 not like '%6000%',
    'X=9600, Z=6000 => finalized revenue 6000 (not 9600, no max(X, Z)) + z_below_x warning');
  p := t.daily('BB', date '2026-09-12');
  perform t.assert(p ->> 'finalization' = 'provisional' and p #>> '{financial,grossRevenue,state}' = 'unavailable' and p #>> '{financial,grossRevenue,value}' is null
    and t.n(p, '{financial,provisionalRevenue}') = 9600 and p #>> '{completeness,metrics,revenue,status}' = 'partial' and p #> '{completeness,metrics,revenue,reasons}' ? 'missing_z',
    'X only => no finalized revenue, provisional 9600, completeness partial / missing_z');
  p := t.daily('BB', date '2026-09-13');
  perform t.assert(p ->> 'finalization' = 'finalized' and t.n(p, '{financial,grossRevenue,value}') = 9600 and (p #>> '{readings,x,present}')::boolean = false, 'Z only => finalized revenue = Z');
  perform t.assert(t.n(w, '{financial,grossRevenue,value}') = 25200 and w #>> '{financial,grossRevenue,state}' = 'partial' and t.n(w, '{financial,provisionalRevenue}') = 9600
    and t.n(w, '{finalizedDays}') = 3 and t.n(w, '{provisionalDays}') = 1, 'weekly aggregate uses finalized Z values only (9600 + 6000 + 9600); the provisional day is excluded and exposed separately');
  perform t.assert(wn #>> '{financialComparisons,grossRevenue,state}' = 'baseline_not_final', 'a previous week with a provisional day is never a comparison baseline');
end $$;

-- ---------------------------------------------------------------------------
-- E. Role isolation and redaction
-- ---------------------------------------------------------------------------
select t.as_anon();
select t.expect_denied($q$select * from public.daily_analytics_snapshots$q$, 'anon cannot read snapshots');
select t.expect_denied($q$select public.get_daily_analytics(t.id('BR'), date '2026-09-30')$q$, 'anon cannot call get_daily_analytics');

select t.as_user('K');
select t.expect_denied($q$select public.get_daily_analytics(t.id('BR'), date '2026-09-30')$q$, 'cashier denied (daily)');
select t.expect_denied($q$select public.get_weekly_analytics(t.id('BR'), date '2026-09-28')$q$, 'cashier denied (weekly)');
select t.expect_denied($q$select public.regenerate_daily_analytics(t.id('BR'), date '2026-09-30', 'cashier attempt')$q$, 'cashier cannot regenerate');
do $$ begin
  perform t.assert((select count(*) from public.daily_analytics_snapshots) = 0 and (select count(*) from public.weekly_analytics_snapshots) = 0
    and (select count(*) from public.analytics_insights) = 0 and (select count(*) from public.analytics_reports) = 0
    and (select count(*) from public.external_context_daily) = 0, 'cashier sees no analytics rows in any table');
end $$;
select t.as_user('E');
select t.expect_denied($q$select public.get_daily_analytics(t.id('BD'), date '2026-09-30')$q$, 'employee denied');
do $$ begin perform t.assert((select count(*) from public.daily_analytics_snapshots) = 0, 'employee sees no snapshots'); end $$;

select t.as_user('BMR');
select t.expect_ok($q$select public.get_daily_analytics(t.id('BR'), date '2026-09-30')$q$, 'branch_manager reads own branch');
select t.expect_denied($q$select public.get_daily_analytics(t.id('BD'), date '2026-09-30')$q$, 'branch_manager denied for another branch');
select t.expect_denied($q$select public.regenerate_daily_analytics(t.id('BR'), date '2026-09-30', 'branch manager attempt')$q$, 'branch_manager lacks analytics.regenerate');
select t.expect_denied($q$select public.upsert_external_context_daily(date '2026-09-30', t.id('BR'), '{"temperatureC": 20}'::jsonb, 'branch manager attempt')$q$, 'branch_manager cannot edit context');
do $$ begin
  perform t.assert((select count(distinct branch_id) from public.daily_analytics_snapshots) = 1
    and (select branch_id from public.daily_analytics_snapshots limit 1) = t.id('BR'), 'branch_manager sees only own-branch snapshots (RLS)');
  perform t.assert((select count(*) from public.analytics_insights where branch_id <> t.id('BR')) = 0, 'branch_manager sees only own-branch insights');
  perform t.assert((select count(*) from public.external_context_daily where branch_id = t.id('BB')) = 0, 'branch_manager does not see another branch context');
end $$;

select t.as_user('BMD');
do $$ begin perform t.assert((select count(distinct branch_id) from public.daily_analytics_snapshots) = 1
  and (select branch_id from public.daily_analytics_snapshots limit 1) = t.id('BD'), 'the other branch_manager sees only Dondurma'); end $$;

select t.as_user('M');
do $$ begin perform t.assert((select count(distinct branch_id) from public.daily_analytics_snapshots) = 3, 'manager sees every branch (multi-branch)'); end $$;
select t.as_user('O');
do $$ begin perform t.assert((select count(distinct branch_id) from public.weekly_analytics_snapshots) = 3, 'owner sees every branch'); end $$;

-- redaction: analytics.read without analytics.financial.read
select t.as_superuser();
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p where r.key = 'viewer' and p.key = 'analytics.read';
select t.as_user('V');
do $$
declare r jsonb := public.get_daily_analytics(t.id('BR'), date '2026-09-30');
begin
  perform t.assert(r -> 'payload' -> 'financial' is null and r -> 'payload' -> 'financialComparisons' is null and r #> '{payload,completeness}' is not null and (r #>> '{payload,redacted}')::boolean, 'analytics.read without financial: revenue payload is redacted');
  perform t.assert(t.n(r -> 'payload', '{volume,transactions,value}') = 44, 'volume metrics stay visible');
  perform t.assert((select count(*) from public.daily_analytics_snapshots) = 0, 'snapshot table needs analytics.financial.read');
  perform t.assert((select count(*) from public.analytics_insights where is_financial) = 0 and (select count(*) from public.analytics_insights where not is_financial) >= 0, 'financial insights hidden without the financial permission');
end $$;
select t.expect_denied($q$select public.get_weekly_analytics(t.id('BD'), date '2026-09-28')$q$, 'viewer scoped to its own branch', '42501');
select t.as_superuser();
delete from public.role_permissions rp using public.roles r, public.permissions p
 where rp.role_id = r.id and rp.permission_id = p.id and r.key = 'viewer' and p.key = 'analytics.read';

-- ---------------------------------------------------------------------------
-- F. Snapshots: immutability, versioning, stale detection, audited regeneration
-- ---------------------------------------------------------------------------
select t.expect_denied($q$update public.daily_analytics_snapshots set payload = '{}'$q$, 'snapshots cannot be updated');
select t.expect_denied($q$delete from public.weekly_analytics_snapshots$q$, 'weekly snapshots cannot be deleted');
select t.expect_denied($q$update public.analytics_insights set title = 'x'$q$, 'insights are immutable');

select t.as_user('M');
select t.expect_denied($q$select public.regenerate_daily_analytics(t.id('BR'), date '2026-09-30', '  ')$q$, 'a reason is mandatory', '22023');
do $$
declare r jsonb; v1 integer; ev integer;
begin
  select version into v1 from public.daily_analytics_snapshots where branch_id = t.id('BR') and business_date = date '2026-09-30' order by version desc limit 1;
  perform t.assert(public.get_daily_analytics(t.id('BR'), date '2026-09-30') ->> 'state' = 'current', 'a fresh snapshot is current');
  r := public.regenerate_daily_analytics(t.id('BR'), date '2026-09-30', 'manual check without source change');
  perform t.assert((r ->> 'unchanged')::boolean and (r ->> 'version')::integer = v1, 'regeneration without source change creates no new version');
  perform t.assert((select count(*) from public.audit_logs where action = 'analytics_snapshot_regenerated' and actor_user_id = t.id('M')) = 1, 'manual regeneration is audited with the real actor even when unchanged');
end $$;
select t.as_superuser();
-- a late edit: a NEWER Z arrives (later submitted_at and updated_at); the latest active Z wins at business-day level
do $$
begin
  perform t.rep('BR', t.shift('BR', date '2026-09-30', 'morning'), 'Z', 2400, 48, 'submitted', now() + interval '1 hour', now() + interval '1 hour');
end $$;
select t.as_user('M');
do $$
declare r jsonb; v1 integer; before_payload jsonb;
begin
  select version, payload into v1, before_payload from public.daily_analytics_snapshots where branch_id = t.id('BR') and business_date = date '2026-09-30' order by version desc limit 1;
  perform t.assert(public.get_daily_analytics(t.id('BR'), date '2026-09-30') ->> 'state' = 'stale', 'newer source data makes the snapshot stale (source_latest_at)');
  r := public.regenerate_daily_analytics(t.id('BR'), date '2026-09-30', 'late report arrived');
  perform t.assert(not (r ->> 'unchanged')::boolean and (r ->> 'version')::integer = v1 + 1, 'regeneration after a source change inserts version + 1');
  perform t.assert(public.get_daily_analytics(t.id('BR'), date '2026-09-30') ->> 'state' = 'current', 'the new version is current again');
  perform t.assert((select payload from public.daily_analytics_snapshots where branch_id = t.id('BR') and business_date = date '2026-09-30' and version = v1) = before_payload, 'the previous version is untouched');
  perform t.assert(exists (select 1 from jsonb_array_elements(public.get_daily_analytics(t.id('BR'), date '2026-09-30') #> '{payload,warnings}') w where w ->> 'code' = 'multiple_active_readings' and w ->> 'type' = 'Z'), 'two active Z readings are flagged (inherited latest-wins)');
  perform t.assert(t.n(public.get_daily_analytics(t.id('BR'), date '2026-09-30') -> 'payload', '{financial,grossRevenue,value}') = 2400, 'the new version reflects the latest Z exactly (2400)');
end $$;
do $$
declare r jsonb;
begin
  r := public.regenerate_weekly_analytics(t.id('BR'), date '2026-09-28', 'weekly refresh after the late report');
  perform t.assert((r ->> 'version')::integer = 2, 'weekly regeneration inserts a new immutable version');
  perform t.assert(public.get_weekly_analytics(t.id('BR'), date '2026-09-28') ->> 'state' = 'current', 'weekly snapshot current after regeneration');
  perform t.assert(t.n(public.get_weekly_analytics(t.id('BR'), date '2026-09-28') -> 'payload', '{financial,grossRevenue,value}') = 4100, 'weekly total includes the late Z (700 + 1000 + 2400)');
  perform t.assert((select count(*) from public.weekly_analytics_snapshots where branch_id = t.id('BR') and week_start = date '2026-09-28') = 2, 'both weekly versions are kept');
end $$;
-- context maintenance
select t.expect_ok($q$select public.upsert_external_context_daily(date '2026-09-30', null, '{"temperatureC": 24, "precipitationMm": 0, "windKmh": 12, "isPublicHoliday": false, "payPeriodTag": "payday_week"}'::jsonb, 'weather import check')$q$, 'manager upserts org-wide context');
select t.expect_denied($q$select public.upsert_external_context_daily(date '2026-09-30', null, '{"temperatureC": 99}'::jsonb, 'impossible temperature')$q$, 'out-of-range temperature rejected', '23514');
select t.as_superuser();
do $$
begin
  perform t.assert((select count(*) from public.audit_logs where action = 'analytics_context_upserted') = 1, 'context changes are audited');
  perform t.assert(t.n(public.analytics_context_for(t.id('BR'), date '2026-09-30'), '{temperatureC}') = 24, 'context lookup falls back to the all-branch row');
end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- G. AI report persistence
-- ---------------------------------------------------------------------------
do $$
declare s uuid; r1 uuid;
begin
  select id into s from public.weekly_analytics_snapshots where branch_id = t.id('BR') and week_start = date '2026-09-28' order by version desc limit 1;
  r1 := public.internal_save_analytics_report(s, 'generated', '{"facts": 1}'::jsonb,
    '{"summary": "ok", "claims": []}'::jsonb, 'model-x', null);
  perform public.internal_save_analytics_report(s, 'failed', '{"facts": 1}'::jsonb, null, 'model-x', 'ai_unavailable');
  perform t.assert((select count(*) from public.analytics_reports where branch_id = t.id('BR')) = 2, 'a failed generation is recorded but does not touch analytics');
  perform t.assert((select max(version) from public.analytics_reports where branch_id = t.id('BR')) = 2, 'reports are versioned');
end $$;
select t.expect_denied($q$select public.internal_save_analytics_report((select id from public.weekly_analytics_snapshots limit 1), 'generated', '{}'::jsonb, null, 'm', null)$q$,
  'a generated report must carry validated output', '23514');
select t.expect_denied($q$update public.analytics_reports set model = 'x'$q$, 'reports are immutable');
select t.as_user('BMR');
do $$ begin perform t.assert((select count(*) from public.analytics_reports) = 2, 'branch_manager reads own-branch AI reports (analytics.ai.read)'); end $$;
select t.expect_denied($q$select public.internal_save_analytics_report((select id from public.weekly_analytics_snapshots limit 1), 'failed', '{}'::jsonb, null, 'm', 'x')$q$, 'clients cannot persist AI reports');
select t.as_user('K');
do $$ begin perform t.assert((select count(*) from public.analytics_reports) = 0, 'cashier sees no AI reports'); end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- G2. Central analytics settings (technical defaults, one place, audited)
-- ---------------------------------------------------------------------------
do $$
declare p jsonb := public.analytics_params();
begin
  perform t.assert(p ->> 'lowVolumeBaseRevenue' = '500' and p ->> 'lowVolumeBaseTransactions' = '10' and p ->> 'minBaselineSamples' = '2'
    and p ->> 'minCorrelationSamples' = '14' and p ->> 'minGroupSamples' = '3' and p ->> 'rainMmThreshold' = '1.0' and p ->> 'weatherWindowDays' = '84',
    'default thresholds: 500 TL, 10 transactions, 2 samples, 14 days, 3 per group, 1.0 mm, 84 days');
  perform t.assert(p ->> 'status' = 'defaults_pending_owner_review', 'defaults are labelled pending owner review');
  perform t.assert((select count(*) from public.analytics_settings) = 1 and (select settings from public.analytics_settings) = '{}'::jsonb, 'one empty settings row (no branch-specific values)');
  perform t.assert(t.daily('BD', date '2026-09-28') #>> '{params,lowVolumeBaseRevenue}' = '500', 'every snapshot embeds the params it was generated with');
end $$;
select t.as_user('BMR');
select t.expect_denied($q$select public.update_analytics_settings('{"lowVolumeBaseRevenue": 50}'::jsonb, 'branch manager attempt')$q$, 'branch_manager cannot change settings');
select t.as_user('K');
select t.expect_denied($q$select public.update_analytics_settings('{"lowVolumeBaseRevenue": 50}'::jsonb, 'cashier attempt')$q$, 'cashier cannot change settings');
do $$ begin perform t.assert((select count(*) from public.analytics_settings) = 0, 'cashier cannot read settings'); end $$;
select t.as_user('M');
select t.expect_denied($q$select public.update_analytics_settings('{"lowVolumeBaseRevenue": 50}'::jsonb, '  ')$q$, 'a reason is mandatory', '22023');
select t.expect_denied($q$select public.update_analytics_settings('{"branchSpecific": 1}'::jsonb, 'unknown key')$q$, 'unknown keys are rejected', '22023');
select t.expect_denied($q$select public.update_analytics_settings('{"minBaselineSamples": 9}'::jsonb, 'out of range')$q$, 'out-of-range values are rejected', '22023');
select t.expect_denied($q$select public.update_analytics_settings('{"rainMmThreshold": "wet"}'::jsonb, 'wrong type')$q$, 'non-numeric values are rejected', '22023');
select t.expect_ok($q$select public.update_analytics_settings('{"lowVolumeBaseRevenue": 50}'::jsonb, 'owner reviewed the low-volume guard')$q$, 'manager updates a threshold');
do $$ begin
  perform t.assert(public.analytics_params() ->> 'lowVolumeBaseRevenue' = '50' and public.analytics_params() ->> 'status' = 'owner_configured' and public.analytics_params() ->> 'minGroupSamples' = '3',
    'the override is central: one value changes, the others keep their defaults, status becomes owner_configured');
end $$;
select t.as_superuser();
do $$ begin
  perform t.assert((select count(*) from public.audit_logs where action = 'analytics_settings_updated' and actor_user_id = t.id('M')) = 1, 'settings changes are audited');
end $$;
select public.internal_generate_daily_analytics(t.id('BD'), date '2026-09-28', 'scheduled');
do $$
declare p jsonb := t.daily('BD', date '2026-09-28');
begin
  perform t.assert(p #>> '{params,lowVolumeBaseRevenue}' = '50' and p #>> '{financialComparisons,grossRevenue,previousWeekSameWeekday,state}' = 'ok'
    and t.n(p, '{financialComparisons,grossRevenue,previousWeekSameWeekday,pct}') = 800.0, 'a regenerated snapshot uses the central setting (100 TL base is no longer low) and records it');
end $$;

-- ---------------------------------------------------------------------------
-- H. Exposure: internal functions are service_role only
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'analytics_compute_day(uuid,date)', 'analytics_build_daily(uuid,date)', 'analytics_build_weekly(uuid,date)',
    'internal_generate_daily_analytics(uuid,date,text,uuid,text)', 'internal_generate_weekly_analytics(uuid,date,text,uuid,text)',
    'internal_save_analytics_report(uuid,text,jsonb,jsonb,text,text,uuid)', 'analytics_weather_effect(uuid,date,date)',
    'analytics_internal_source_latest_at(uuid,date,date)', 'analytics_week_totals(jsonb,boolean)', 'analytics_completeness(jsonb,boolean)', 'analytics_context_for(uuid,date)'] loop
    perform t.assert(not has_function_privilege('anon', 'public.' || f, 'execute') and not has_function_privilege('authenticated', 'public.' || f, 'execute')
      and has_function_privilege('service_role', 'public.' || f, 'execute'), f || ' is service_role only');
  end loop;
  perform t.assert((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like 'analytics%' and p.prosecdef
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')) = 0, 'every analytics SECURITY DEFINER function locks its search_path');
  perform t.assert(not has_function_privilege('anon', 'public.regenerate_daily_analytics(uuid,date,text)', 'execute'), 'anon cannot execute the regenerate RPC');
end $$;

do $$ begin raise notice 'ALL ANALYTICS ENGINE ASSERTIONS PASSED'; end $$;
rollback;
