-- =============================================================================
-- inventory_control.test.sql  (Phase 1B: waste reasons, waste report, count classification)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE with every migration applied
-- (supabase db reset --local --no-seed). One transaction, ends in ROLLBACK.
--
--   docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres \
--        -v ON_ERROR_STOP=1 < supabase/tests/inventory_control.test.sql
--
-- Clean run prints 'ALL INVENTORY CONTROL ASSERTIONS PASSED (<n> assertions)'.
-- Ledger and count rows are inserted with explicit timestamps (now() is constant inside a transaction).
-- =============================================================================
begin;
set local timezone = 'Europe/Istanbul';

create schema t;
grant usage on schema t to anon, authenticated;
create table t.ctx (k text primary key, v uuid not null);
grant select on t.ctx to anon, authenticated;
create table t.counter (n integer not null);
insert into t.counter values (0);
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
create function t.as_superuser() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
grant execute on all functions in schema t to anon, authenticated;
grant update on t.counter to anon, authenticated;
grant select on t.counter to anon, authenticated;

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
create function t.waste(p_item text, p_qty numeric, p_at timestamptz, p_shift uuid, p_cost numeric, p_reason text default 'expired') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, unit_cost_snapshot, shift_id, reason_code, occurred_at, created_by)
  values ((select branch_id from public.inventory_items where id = t.id(p_item)), t.id(p_item), 'WASTE', p_qty, -p_qty, p_cost, p_shift, p_reason, p_at, t.id('K'))
  returning id into v;
  return v;
end $$;
create function t.reverse(p_move uuid, p_at timestamptz) returns void language plpgsql as $$
begin
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, unit_cost_snapshot, shift_id, reverses_movement_id, reason, occurred_at, created_by)
  select branch_id, inventory_item_id, 'REVERSAL', quantity, quantity, unit_cost_snapshot, shift_id, id, 'test reversal', p_at, t.id('K') from public.inventory_movements where id = p_move;
end $$;
create function t.count(p_key text, p_branch text, p_shift uuid, p_date date, p_at timestamptz, p_status text default 'submitted') returns uuid language plpgsql as $$
declare v uuid;
begin
  insert into public.inventory_counts (branch_id, shift_id, business_date, status, counted_by, submitted_at, voided_at, voided_by, void_reason)
  values (t.id(p_branch), p_shift, p_date, p_status, t.id('K'), p_at,
          case when p_status = 'voided' then p_at + interval '1 minute' end, case when p_status = 'voided' then t.id('M') end,
          case when p_status = 'voided' then 'test void' end)
  returning id into v;
  insert into t.ctx values (p_key, v);
  return v;
end $$;
create function t.cline(p_count text, p_item text, p_expected numeric, p_physical numeric) returns void language plpgsql as $$
begin
  insert into public.inventory_count_items (inventory_count_id, inventory_item_id, physical_quantity, theoretical_quantity)
  values (t.id(p_count), t.id(p_item), p_physical, p_expected);
end $$;
create function t.line(p_review jsonb, p_code text) returns jsonb language sql immutable as $$
  select l from jsonb_array_elements(p_review -> 'lines') l where l ->> 'code' = p_code
$$;
grant execute on all functions in schema t to anon, authenticated;

-- Identities ---------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O', '00000000-0000-0000-0000-0000000000c1'), ('M', '00000000-0000-0000-0000-0000000000c2'),
  ('BMD', '00000000-0000-0000-0000-0000000000c3'), ('BMR', '00000000-0000-0000-0000-0000000000c4'),
  ('K', '00000000-0000-0000-0000-0000000000c5'), ('E', '00000000-0000-0000-0000-0000000000c6'),
  ('V', '00000000-0000-0000-0000-0000000000c7');
insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into t.ctx select 'BB', id from public.branches where key = 'balik_ekmek';
insert into auth.users (id, email) select v, lower(k) || '@invctl-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','V');
insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'), 'C Owner', 'C901'), (t.id('M'), 'C Manager', 'C902'), (t.id('BMD'), 'C BM Dondurma', 'C903'),
  (t.id('BMR'), 'C BM Rumeli', 'C904'), (t.id('K'), 'C Cashier', 'C905'), (t.id('E'), 'C Employee', 'C906'),
  (t.id('V'), 'C Viewer', 'C907');
insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('V','viewer')) x(k, rk) join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('E'), t.id('BD')), (t.id('V'), t.id('BR'));

-- ---------------------------------------------------------------------------
-- A. waste reasons
-- ---------------------------------------------------------------------------
do $$ begin
  perform t.assert((select count(*) from public.waste_reasons) = 6, 'six historical reasons seeded');
  perform t.assert((select array_agg(code order by code) from public.waste_reasons) = array['damaged','expired','other','quality','sample','spilled'], 'seeded codes are the historical six');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where p.key = 'inventory.waste_reason.manage' and r.key in ('owner','manager')) = 2, 'owner+manager manage reasons');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where p.key = 'inventory.waste_reason.manage' and r.key not in ('owner','manager')) = 0, 'nobody else manages reasons');
  perform t.assert((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where p.key = 'inventory.waste_report.read') = array['branch_manager','manager','owner'], 'waste report: owner, manager, branch_manager');
  perform t.assert((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where p.key = 'inventory.count_review.read') = array['branch_manager','manager','owner'], 'count review: owner, manager, branch_manager');
end $$;

-- items: I1..I7 on Rumeli (I5 in adet), D1 on Dondurma
insert into public.inventory_items (branch_id, code, name, unit) values
  (t.id('BR'), 'I1', 'Item One', 'kg'), (t.id('BR'), 'I2', 'Item Two', 'kg'), (t.id('BR'), 'I3', 'Item Three', 'kg'),
  (t.id('BR'), 'I4', 'Item Four', 'kg'), (t.id('BR'), 'I5', 'Item Five', 'adet'), (t.id('BR'), 'I6', 'Item Six', 'kg'),
  (t.id('BD'), 'D1', 'Dondurma One', 'kg');
insert into t.ctx select code, id from public.inventory_items;
insert into public.inventory_item_costs (inventory_item_id, unit_cost, effective_from, created_by) values
  (t.id('I2'), 5, '2026-01-01+03', t.id('M')), (t.id('I4'), 3, '2026-01-01+03', t.id('M')), (t.id('I6'), 2, '2026-01-01+03', t.id('M'));

select t.as_user('M');
do $$ declare v uuid; begin
  v := public.upsert_waste_reason(null, 'closed_early', 'Erken kapanış', 'Erken kapanış nedeniyle', 60, 'yeni neden ekleniyor');
  perform t.assert(exists (select 1 from public.waste_reasons where id = v and code = 'closed_early' and is_active), 'manager creates a reason');
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'closed_early', 'Dup', null, 1, 'duplicate code')$q$, 'duplicate code rejected', '23505');
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'Bad Code', 'Bad', null, 1, 'bad code format')$q$, 'bad code format rejected', '22023');
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'no_reason', 'X', null, 1, 'abc')$q$, 'short audit reason rejected', '22023');
  perform public.upsert_waste_reason(v, 'attempted_change', 'Erken kapanış 2', null, 61, 'ad güncelleniyor');
  perform t.assert((select code from public.waste_reasons where id = v) = 'closed_early', 'code is immutable on update');
  perform t.assert((select name from public.waste_reasons where id = v) = 'Erken kapanış 2', 'name updated');
  perform public.set_waste_reason_active((select id from public.waste_reasons where code = 'closed_early'), false, 'artık kullanılmıyor');
  perform t.assert(not (select is_active from public.waste_reasons where code = 'closed_early'), 'manager deactivates');
  perform public.set_waste_reason_active((select id from public.waste_reasons where code = 'closed_early'), true, 'tekrar kullanılıyor');
  perform t.expect_denied($q$update public.waste_reasons set name = 'x'$q$, 'no direct update on the catalogue');
  perform t.expect_denied($q$delete from public.waste_reasons$q$, 'no direct delete on the catalogue');
  perform t.expect_denied($q$insert into public.waste_reasons (code, name) values ('direct','Direct')$q$, 'no direct insert on the catalogue');
end $$;
select t.as_superuser();
do $$ begin
  perform t.assert((select count(*) from public.audit_logs where entity_type = 'waste_reasons' and action in ('waste_reason_create','waste_reason_update','waste_reason_activate','waste_reason_deactivate')) = 4,
    'create, update, deactivate and activate are audited');
end $$;

-- who may read / manage
select t.as_user('K');
do $$ begin
  perform t.assert((select count(*) from public.waste_reasons) = 7, 'cashier reads active reasons');
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'cashier_code', 'No', null, 1, 'cashier tries')$q$, 'cashier cannot create reasons');
  perform t.expect_denied($q$select public.set_waste_reason_active((select id from public.waste_reasons limit 1), false, 'cashier tries')$q$, 'cashier cannot deactivate');
end $$;
select t.as_user('BMR');
do $$ begin
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'bm_code', 'No', null, 1, 'branch manager tries')$q$, 'branch_manager cannot create reasons');
  perform t.assert((select count(*) from public.waste_reasons) = 7, 'branch_manager reads reasons');
end $$;
select t.as_anon();
do $$ begin
  perform t.assert((select count(*) from public.waste_reasons) = 0, 'anon sees no reasons') ;
exception when insufficient_privilege then perform t.assert(true, 'anon has no table privilege');
end $$;
select t.as_superuser();

-- entry uses the catalogue; deactivated reasons cannot be used, history stays valid
select t.as_user('K');
do $$ begin
  perform t.expect_ok(format($q$select public.record_inventory_waste(%L, %L::jsonb, 'expired', 'rpc entry')$q$, t.id('BR'), format('[{"inventory_item_id":"%s","quantity":1}]', t.id('I1'))), 'cashier records waste with an active reason');
  perform t.expect_denied(format($q$select public.record_inventory_waste(%L, %L::jsonb, 'unknown_code')$q$, t.id('BR'), format('[{"inventory_item_id":"%s","quantity":1}]', t.id('I1'))), 'unknown reason rejected', '22023');
end $$;
select t.as_user('M');
select public.set_waste_reason_active((select id from public.waste_reasons where code = 'sample'), false, 'numune kapatıldı');
select t.as_user('K');
do $$ begin
  perform t.expect_denied(format($q$select public.record_inventory_waste(%L, %L::jsonb, 'sample')$q$, t.id('BR'), format('[{"inventory_item_id":"%s","quantity":1}]', t.id('I1'))), 'deactivated reason rejected for new entry', '22023');
  perform t.assert((select count(*) from public.waste_reasons) = 6, 'cashier no longer sees the inactive reason');
end $$;
select t.as_superuser();
do $$ begin
  perform t.assert((select count(*) from public.inventory_movements where movement_type = 'WASTE' and reason_code = 'expired') = 1, 'the earlier WASTE movement is untouched');
  perform t.expect_denied($q$delete from public.waste_reasons where code = 'expired'$q$, 'a referenced reason cannot be deleted', '23503');
  perform t.expect_denied($q$update public.inventory_movements set reason_code = 'other'$q$, 'ledger stays append-only', '42501');
  perform t.expect_denied($q$insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, reason_code, created_by)
    values (t.id('BR'), t.id('I1'), 'WASTE', 1, -1, 'not_in_catalogue', t.id('K'))$q$, 'unknown reason code rejected by the foreign key', '23503');
end $$;
-- the test above produced a real WASTE row today: drop it so the fixtures below are exact (superuser, in the test transaction)
alter table public.inventory_movements disable trigger user;
delete from public.inventory_movements where movement_type = 'WASTE' and occurred_at >= date_trunc('day', now());
alter table public.inventory_movements enable trigger user;

-- history compatibility: a historical movement whose reason is now INACTIVE stays readable
select t.waste('I1', 1, timestamptz '2026-08-20 12:00:00+03', null, 5, 'sample') as hist \gset
do $$ begin
  perform t.assert((select count(*) from public.waste_reasons where code = 'sample' and not is_active) = 1, 'the sample reason is inactive');
  perform t.assert((select count(*) from public.inventory_movements where reason_code = 'sample') = 1, 'the historical row keeps its reason code');
  perform t.assert((select (new_values ->> 'name') is not null and (select array_agg(k order by k) from jsonb_object_keys(new_values) k) = array['code','name']
                      from public.audit_logs where action = 'waste_reason_create' limit 1), 'reason audit metadata holds only code and name');
  perform t.assert(not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'inventory_movements' and column_name like '%effective%'),
    'the ledger has no separate effective-time column (occurred_at is the insertion instant)');
end $$;
select t.as_user('K');
do $$ begin
  perform t.assert((select count(*) from public.inventory_movements where reason_code = 'sample') = 1, 'cashier still reads the historical movement with the inactive reason');
  perform t.assert((select count(*) from public.waste_reasons where code = 'sample') = 0, 'while the inactive reason itself is hidden from entry users');
end $$;
select t.as_user('M');
do $$ declare r jsonb; begin
  r := public.get_waste_report(t.id('BR'), date '2026-08-01', date '2026-08-31');
  perform t.assert((select x ->> 'name' from jsonb_array_elements(r -> 'byReason') x where x ->> 'reasonCode' = 'sample') = 'Numune / ikram', 'manager report names the inactive reason');
end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- B. fixtures: waste + counts on Rumeli, business date 2026-09-26, evening shift
-- ---------------------------------------------------------------------------
insert into t.ctx values ('S1', t.shift('BR', date '2026-09-26', 'evening'));
do $$ declare rev uuid; begin
  perform t.count('C1', 'BR', t.id('S1'), date '2026-09-26', timestamptz '2026-09-26 22:00:00+03');
  perform t.cline('C1', 'I1', 10, 10);   -- balanced
  perform t.cline('C1', 'I2', 10, 8);    -- shortage 2, late waste 2  -> explained
  perform t.cline('C1', 'I3', 10, 7);    -- shortage 3, late waste 1  -> partial
  perform t.cline('C1', 'I4', 10, 6);    -- shortage 4, only waste BEFORE the count -> unexplained
  perform t.cline('C1', 'I5', 5, 7);     -- surplus 2
  perform t.cline('C1', 'I6', 10, 9);    -- shortage 1, late waste reversed -> unexplained
  perform t.waste('I4', 4, timestamptz '2026-09-26 21:00:00+03', t.id('S1'), 3);
  perform t.waste('I2', 2, timestamptz '2026-09-26 23:00:00+03', t.id('S1'), 5);
  perform t.waste('I3', 1, timestamptz '2026-09-26 23:10:00+03', t.id('S1'), null, 'damaged');
  rev := t.waste('I6', 1, timestamptz '2026-09-26 23:20:00+03', t.id('S1'), 2, 'spilled');
  perform t.reverse(rev, timestamptz '2026-09-26 23:30:00+03');
  -- a voided count in between must NOT bound the window
  perform t.count('C2', 'BR', t.id('S1'), date '2026-09-26', timestamptz '2026-09-26 22:30:00+03', 'voided');
  perform t.cline('C2', 'I3', 10, 7);
  -- a later submitted count next morning bounds the window; waste after it must not explain C1
  perform t.count('C3', 'BR', null, date '2026-09-27', timestamptz '2026-09-27 09:00:00+03');
  perform t.cline('C3', 'I2', 8, 8);
  perform t.waste('I2', 1, timestamptz '2026-09-27 10:00:00+03', null, 5);
  -- an older waste, outside the one-day window
  perform t.waste('I2', 1, timestamptz '2026-09-10 12:00:00+03', null, 5);
  -- other branch: waste + count that must never leak
  perform t.waste('D1', 3, timestamptz '2026-09-26 12:00:00+03', null, 4);
  perform t.count('CD', 'BD', null, current_date, now());
  perform t.cline('CD', 'D1', 5, 4);
  -- Balik: only a voided count today
  perform t.count('CB', 'BB', null, current_date, now(), 'voided');
  -- timing cases, no shift on the count, business date 2026-08-15, count at 18:00
  perform t.count('C4', 'BR', null, date '2026-08-15', timestamptz '2026-08-15 18:00:00+03');
  perform t.cline('C4', 'I1', 10, 8);    -- waste at EXACTLY the count instant: ordering unknown -> not a candidate
  perform t.cline('C4', 'I2', 10, 8);    -- same-date waste recorded after the count, shift unknown -> timing_uncertain
  perform t.cline('C4', 'I3', 10, 8);    -- same-date waste recorded BEFORE the count -> already in expected, unexplained
  perform t.cline('C4', 'I4', 10, 8);    -- candidate waste 5 > shortage 2 -> potential capped at 2
  perform t.waste('I1', 2, timestamptz '2026-08-15 18:00:00+03', null, 5);
  perform t.waste('I2', 2, timestamptz '2026-08-15 19:00:00+03', null, 5);
  perform t.waste('I3', 2, timestamptz '2026-08-15 17:00:00+03', null, 5);
  perform t.waste('I4', 5, timestamptz '2026-08-15 19:30:00+03', null, null);
end $$;

-- ---------------------------------------------------------------------------
-- C. waste report
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare r jsonb; begin
  r := public.get_waste_report(t.id('BR'), date '2026-09-26', date '2026-09-26');
  perform t.assert((r ->> 'entries')::int = 3, 'day report: three live entries (reversed one excluded)');
  perform t.assert((r ->> 'reversedEntries')::int = 1, 'day report: one reversed entry counted separately');
  perform t.assert(r #>> '{cost,state}' = 'partial' and (r #>> '{cost,value}')::numeric = 22.00 and r #>> '{cost,reason}' = 'missing_cost', 'cost partial: 2*5 + 4*3 = 22, missing cost named');
  perform t.assert((r #>> '{costCoverage,costedEntries}')::int = 2 and (r #>> '{costCoverage,entries}')::int = 3 and r #>> '{costCoverage,state}' = 'partial', 'cost coverage 2 of 3, state partial');
  perform t.assert((r #>> '{cost,knownCostKurus}')::bigint = 2200 and (r #>> '{cost,costedQuantity}')::numeric = 6 and (r #>> '{cost,totalQuantity}')::numeric = 7, 'known cost 2200 kurus on 6 of 7 units (missing cost is not estimated)');
  perform t.assert((select x #>> '{cost,knownCostKurus}' is null and (x #>> '{cost,costedQuantity}')::numeric = 0 from jsonb_array_elements(r -> 'byItem') x where x ->> 'code' = 'I3'), 'nothing costed: knownCostKurus is null, not 0');
  perform t.assert((select (x #>> '{cost,knownCostKurus}')::bigint = 1000 from jsonb_array_elements(r -> 'byItem') x where x ->> 'code' = 'I2'), 'fully costed item: 1000 kurus');
  perform t.assert((select (x ->> 'cost') is not null and x #>> '{cost,state}' = 'unavailable' and x #>> '{cost,reason}' = 'missing_cost'
                      from jsonb_array_elements(r -> 'byItem') x where x ->> 'code' = 'I3'), 'item without any snapshot: unavailable, never 0');
  perform t.assert((select x #>> '{cost,state}' = 'available' and (x #>> '{cost,value}')::numeric = 10.00 from jsonb_array_elements(r -> 'byItem') x where x ->> 'code' = 'I2'), 'costed item: exact value');
  perform t.assert(jsonb_array_length(r -> 'byItem') = 3, 'by item: I2, I3, I4');
  perform t.assert((select (x ->> 'entries')::int from jsonb_array_elements(r -> 'byReason') x where x ->> 'reasonCode' = 'expired') = 2, 'by reason: expired x2');
  perform t.assert((select x ->> 'name' from jsonb_array_elements(r -> 'byReason') x where x ->> 'reasonCode' = 'damaged') = 'Hasarlı / kırık', 'by reason carries the catalogue name');
  perform t.assert((select (x ->> 'entries')::int from jsonb_array_elements(r -> 'byEmployee') x where x ->> 'employeeCode' = 'C905') = 3, 'by employee: cashier x3');
  perform t.assert((select (x ->> 'entries')::int from jsonb_array_elements(r -> 'byShift') x where x ->> 'shiftId' = t.id('S1')::text) = 3, 'by shift: evening x3');
  perform t.assert((select count(*) from jsonb_array_elements(r -> 'quantityByUnit')) = 1, 'quantity by unit: kg only');

  r := public.get_waste_report(t.id('BR'), date '2026-09-20', date '2026-09-27');
  perform t.assert((r ->> 'entries')::int = 4, 'week report includes the next-day waste');
  r := public.get_waste_report(t.id('BR'), date '2026-09-01', date '2026-09-30');
  perform t.assert((r ->> 'entries')::int = 5, 'month report includes the older waste');
  r := public.get_waste_report(t.id('BR'), date '2026-09-26', date '2026-09-26');
  perform t.assert(public.inventory_cost_metric(7, 7, 21, true) ->> 'state' = 'available', 'fully costed is available');
  perform t.assert(public.inventory_cost_metric(0, 0, 0, true) -> 'value' = '0'::jsonb and (public.inventory_cost_metric(0, 0, 0, true) ->> 'knownCostKurus')::int = 0, 'nothing wasted is a real zero');
  perform t.assert((public.inventory_cost_metric(7, 7, 21, true) ->> 'knownCostKurus')::int = 2100, 'fully costed: known cost in kurus');
  perform t.assert(public.inventory_cost_metric(7, 0, 0, true) -> 'knownCostKurus' = 'null'::jsonb, 'unavailable: knownCostKurus is null');
  perform t.assert(public.inventory_cost_metric(7, 0, 0, true) ->> 'state' = 'unavailable', 'nothing costed is unavailable, not 0');
  perform t.assert(public.inventory_cost_metric(7, 7, 21, false) ->> 'reason' = 'no_permission', 'no cost permission is no_permission');
  perform t.expect_denied($q$select public.get_waste_report(t.id('BR'), date '2026-09-27', date '2026-09-26')$q$, 'inverted period rejected', '22023');
  perform t.expect_denied($q$select public.get_waste_report(t.id('BR'), date '2025-01-01', date '2026-09-26')$q$, 'overlong period rejected', '22023');
  r := public.get_waste_report(t.id('BD'), date '2026-09-26', date '2026-09-26');
  perform t.assert((r ->> 'entries')::int = 1, 'manager reads another branch separately');
end $$;
select t.as_user('BMR');
do $$ declare r jsonb; begin
  r := public.get_waste_report(t.id('BR'), date '2026-09-26', date '2026-09-26');
  perform t.assert((r ->> 'entries')::int = 3, 'branch_manager reads own branch');
  perform t.assert(r #>> '{cost,state}' = 'partial', 'branch_manager has cost.read for the own branch');
  perform t.expect_denied(format($q$select public.get_waste_report(%L, date '2026-09-26', date '2026-09-26')$q$, t.id('BD')), 'branch_manager denied on another branch');
end $$;
select t.as_user('BMD');
do $$ begin
  perform t.assert((public.get_waste_report(t.id('BD'), date '2026-09-26', date '2026-09-26') ->> 'entries')::int = 1, 'the other branch manager sees only its own waste');
  perform t.expect_denied(format($q$select public.get_waste_report(%L, date '2026-09-26', date '2026-09-26')$q$, t.id('BR')), 'and not Rumeli');
end $$;

-- ---------------------------------------------------------------------------
-- D. closing count classification (waste timing is never confirmed: see the migration header)
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare r jsonb; l jsonb; begin
  r := public.get_inventory_count_review(t.id('C1'));
  l := t.line(r, 'I1');
  perform t.assert(l ->> 'classification' = 'balanced' and l #>> '{explanation,status}' = 'not_applicable', 'balanced line');
  l := t.line(r, 'I2');
  perform t.assert(l ->> 'classification' = 'shortage' and (l ->> 'varianceQuantity')::numeric = -2 and l #>> '{explanation,status}' = 'timing_uncertain',
    'waste recorded AFTER the count never explains the shortage (timing_uncertain)');
  perform t.assert((l #>> '{explanation,candidateWasteQuantity}')::numeric = 2 and (l #>> '{explanation,potentialExplainedQuantity}')::numeric = 2
    and (l #>> '{explanation,confirmedExplainedQuantity}')::numeric = 0 and (l #>> '{explanation,unexplainedQuantity}')::numeric = 2, 'candidate is reported, nothing is confirmed, the whole shortage stays unexplained');
  perform t.assert((l #>> '{varianceValue,value}')::numeric = -10.00, 'variance value uses the cost effective at the count');
  l := t.line(r, 'I3');
  perform t.assert(l #>> '{explanation,status}' = 'timing_uncertain' and (l #>> '{explanation,potentialExplainedQuantity}')::numeric = 1 and (l #>> '{explanation,unexplainedQuantity}')::numeric = 3,
    'partial candidate: only the corresponding quantity (1 of 3) is even a candidate');
  perform t.assert(l #>> '{varianceValue,state}' = 'unavailable' and l #>> '{varianceValue,reason}' = 'missing_cost', 'item without cost: variance value unavailable');
  l := t.line(r, 'I4');
  perform t.assert(l #>> '{explanation,status}' = 'unexplained' and (l #>> '{explanation,candidateWasteQuantity}')::numeric = 0,
    'waste recorded BEFORE the count is already in the expected stock and is not used again');
  l := t.line(r, 'I5');
  perform t.assert(l ->> 'classification' = 'surplus' and (l ->> 'varianceQuantity')::numeric = 2 and l #>> '{explanation,status}' = 'not_applicable', 'surplus');
  l := t.line(r, 'I6');
  perform t.assert(l #>> '{explanation,status}' = 'unexplained', 'a reversed waste is not even a candidate');
  perform t.assert((r #>> '{summary,lines}')::int = 6 and (r #>> '{summary,balancedLines}')::int = 1 and (r #>> '{summary,shortageLines}')::int = 4 and (r #>> '{summary,surplusLines}')::int = 1, 'summary line counts');
  perform t.assert((r #>> '{summary,timingUncertainLines}')::int = 2 and (r #>> '{summary,unexplainedLines}')::int = 2, 'summary timing counts');
  perform t.assert((r #>> '{summary,unexplainedQuantityByUnit,0,quantity}')::numeric = 5 and (r #>> '{summary,timingUncertainQuantityByUnit,0,quantity}')::numeric = 5, 'unexplained kg = 4 + 1, timing-uncertain kg = 2 + 3');
  perform t.assert(not (r::text like '%explained_by_waste%'), 'no line is ever labelled explained_by_waste');
  perform t.assert((select (x ->> 'quantity')::numeric from jsonb_array_elements(r #> '{summary,surplusQuantityByUnit}') x where x ->> 'unit' = 'adet') = 2, 'surplus by unit');
  perform t.assert(r #>> '{summary,varianceValue,state}' = 'partial' and (r #>> '{summary,varianceValue,value}')::numeric = -24.00, 'total variance value is partial (-10 -12 -2 +missing)');
  perform t.assert(r #>> '{count,status}' = 'submitted' and r #>> '{count,submittedBy,employeeCode}' = 'C905' and r #>> '{count,shiftName}' is not null, 'who/when/shift present');
  perform t.assert(r #>> '{method,tolerance}' like 'none%' and r #>> '{method,precision}' like 'shift or business date%' and r #>> '{method,explanation}' like '%never confirmed%', 'the limitations travel with the payload');

  r := public.get_inventory_count_review(t.id('C4'));
  perform t.assert(t.line(r, 'I1') #>> '{explanation,status}' = 'unexplained', 'waste at exactly the count instant: ordering unknown, not a candidate');
  perform t.assert(t.line(r, 'I2') #>> '{explanation,status}' = 'timing_uncertain', 'same business date, shift unknown: not fully explained merely because the dates match');
  perform t.assert(t.line(r, 'I3') #>> '{explanation,status}' = 'unexplained', 'same-date waste recorded before the count is not used');
  perform t.assert((t.line(r, 'I4') #>> '{explanation,potentialExplainedQuantity}')::numeric = 2 and (t.line(r, 'I4') #>> '{explanation,candidateWasteQuantity}')::numeric = 5
    and (t.line(r, 'I4') #>> '{explanation,confirmedExplainedQuantity}')::numeric = 0, 'candidate larger than the shortage is capped, still not confirmed');
  perform t.assert(not (r::text like '%explained_by_waste%'), 'C4: nothing is confirmed explained');

  r := public.get_inventory_count_review(t.id('C2'));
  perform t.assert(r #>> '{count,status}' = 'voided' and r #>> '{count,voidReason}' = 'test void', 'voided count is reviewable and labelled');

  r := public.get_inventory_count_review(t.id('C3'));
  perform t.assert(t.line(r, 'I2') ->> 'classification' = 'balanced', 'later count is balanced');
end $$;
select t.as_superuser();
do $$ begin
  perform t.assert((select candidate_waste from public.inventory_count_classified_lines(t.id('C1')) where code = 'I2') = 2, 'next-day waste (after the next count, other date) is not a candidate for the earlier count');
  perform t.assert((select count(*) from public.inventory_count_items where inventory_count_id = t.id('C1')) = 6, 'classification does not alter the count rows');
end $$;

-- overview
select t.as_user('M');
do $$ declare r jsonb; begin
  r := public.get_branch_count_overview(t.id('BR'));
  perform t.assert(r ->> 'todayStatus' = 'missing', 'Rumeli: no count today -> missing');
  perform t.assert((r ->> 'latestCountId')::uuid = t.id('C3'), 'latest submitted count (voided never latest)');
  perform t.assert(jsonb_array_length(r -> 'recent') = 4, 'recent lists voided counts too');
  r := public.get_branch_count_overview(t.id('BD'));
  perform t.assert(r ->> 'todayStatus' = 'submitted' and (r #>> '{latestSummary,shortageLines}')::int = 1, 'Dondurma: submitted today, one shortage line');
  r := public.get_branch_count_overview(t.id('BB'));
  perform t.assert(r ->> 'todayStatus' = 'voided_only' and r -> 'latestCountId' = 'null'::jsonb and r -> 'latestSummary' = 'null'::jsonb, 'Balik: only a voided count today');
end $$;
select t.as_user('BMR');
do $$ begin
  perform t.assert((public.get_branch_count_overview(t.id('BR')) ->> 'todayStatus') = 'missing', 'branch_manager overview, own branch');
  perform t.assert(public.get_inventory_count_review(t.id('C1')) #>> '{summary,lines}' = '6', 'branch_manager reviews own count');
  perform t.expect_denied(format($q$select public.get_branch_count_overview(%L)$q$, t.id('BD')), 'branch_manager overview: other branch denied');
  perform t.expect_denied(format($q$select public.get_inventory_count_review(%L)$q$, t.id('CD')), 'branch_manager review: other branch count denied');
end $$;

-- ---------------------------------------------------------------------------
-- E. security matrix (cashier, employee, viewer, anon, service_role)
-- ---------------------------------------------------------------------------
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.expect_denied(format($q$select public.get_waste_report(%L, date '2026-09-26', date '2026-09-26')$q$, t.id('BR')), u || ': waste report denied');
    perform t.expect_denied(format($q$select public.get_inventory_count_review(%L)$q$, t.id('C1')), u || ': count review denied');
    perform t.expect_denied(format($q$select public.get_branch_count_overview(%L)$q$, t.id('BR')), u || ': count overview denied');
    perform t.expect_denied($q$select public.inventory_count_classified_lines(null)$q$, u || ': internal classifier not executable');
  end loop;
  perform t.as_anon();
  perform t.expect_denied(format($q$select public.get_waste_report(%L, date '2026-09-26', date '2026-09-26')$q$, t.id('BR')), 'anon: waste report denied');
  perform t.expect_denied(format($q$select public.get_inventory_count_review(%L)$q$, t.id('C1')), 'anon: count review denied');
  perform t.expect_denied(format($q$select public.get_branch_count_overview(%L)$q$, t.id('BR')), 'anon: count overview denied');
  perform t.expect_denied($q$select public.upsert_waste_reason(null, 'anon_code', 'No', null, 1, 'anonymous')$q$, 'anon: reason management denied');
  perform t.as_superuser();
end $$;
grant usage on schema t to service_role;
grant select on t.ctx to service_role;
select t.id('C1') as c1 \gset
set local role service_role;
select count(*) as n from public.inventory_count_classified_lines(:'c1'::uuid) \gset service_
reset role;
do $$ begin perform t.assert(true, 'service_role ran the internal classifier'); end $$;

do $$ declare n integer; begin
  select c.n into n from t.counter c;
  raise notice 'ALL INVENTORY CONTROL ASSERTIONS PASSED (% assertions)', n;
end $$;
rollback;
