-- =============================================================================
-- inventory_security.test.sql  (Phase E — DB-level policy / RPC assertions)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE that has migrations 001-014
-- applied (e.g. `supabase start && supabase db reset`). NEVER run against a
-- hosted project. The whole script is one transaction that ends in ROLLBACK,
-- so it leaves no rows behind; it does create fixture auth.users rows inside
-- that transaction, which requires the postgres/superuser role.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/inventory_security.test.sql
--
-- Any failed assertion raises 'TEST FAILED [label]: ...' and aborts. A clean
-- run prints 'ALL INVENTORY SECURITY ASSERTIONS PASSED' as a NOTICE.
--
-- Style: no pgTAP dependency. now() is constant inside a transaction, so time-
-- dependent behaviour is exercised with explicit (back-dated / future)
-- effective_from values rather than by waiting.
-- =============================================================================

begin;

create schema t;
grant usage on schema t to anon, authenticated;

create table t.ctx (k text primary key, v uuid not null);
grant select on t.ctx to anon, authenticated;

create function t.id(p_key text) returns uuid language sql stable as $$
  select v from t.ctx where k = p_key
$$;

create function t.assert(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST FAILED [%]: assertion is not true', p_label;
  end if;
end $$;

-- statement must fail with the given SQLSTATE (default 42501 insufficient_privilege)
create function t.expect_denied(p_sql text, p_label text, p_state text default '42501') returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'TEST FAILED [%]: expected SQLSTATE % but got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: statement succeeded but should have failed with SQLSTATE %', p_label, p_state;
end $$;

-- statement must succeed
create function t.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when others then
  raise exception 'TEST FAILED [%]: unexpected error % (%)', p_label, sqlstate, sqlerrm;
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

create function t.as_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

create function t.stock(p_item text) returns numeric language sql stable as $$
  select coalesce(sum(stock_delta), 0) from public.inventory_movements where inventory_item_id = t.id(p_item)
$$;

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser; bypasses RLS/privileges by design)
-- ---------------------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O',   '00000000-0000-0000-0000-0000000000a1'),
  ('M',   '00000000-0000-0000-0000-0000000000a2'),
  ('BMD', '00000000-0000-0000-0000-0000000000a3'),
  ('BMR', '00000000-0000-0000-0000-0000000000a4'),
  ('K',   '00000000-0000-0000-0000-0000000000a5'),
  ('E',   '00000000-0000-0000-0000-0000000000a6'),
  ('E2',  '00000000-0000-0000-0000-0000000000a7'),
  ('V',   '00000000-0000-0000-0000-0000000000a8');

insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into t.ctx select 'CAT_DONDURMA', id from public.sales_categories where key = 'dondurma';
insert into t.ctx select 'CAT_SOGUK', id from public.sales_categories where key = 'soguk_icecek';

insert into auth.users (id, email) select v, lower(k) || '@inventory-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','E2','V');

insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'),   'Test Owner',        'T901'),
  (t.id('M'),   'Test Manager',      'T902'),
  (t.id('BMD'), 'Test BM Dondurma',  'T903'),
  (t.id('BMR'), 'Test BM Rumeli',    'T904'),
  (t.id('K'),   'Test Cashier',      'T905'),
  (t.id('E'),   'Test Employee',     'T906'),
  (t.id('E2'),  'Test Employee 2',   'T907'),
  (t.id('V'),   'Test Viewer',       'T908');

insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('E2','employee'),('V','viewer')) as x(k, role_key)
join public.roles r on r.key = x.role_key;

insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('E'), t.id('BD')), (t.id('E2'), t.id('BD')),
  (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('V'), t.id('BR'));

-- shifts: Dondurma evening (open window all day) for E, Dondurma morning for a
-- privileged submitter, Rumeli evening for the cashier.
insert into public.shifts (branch_id, shift_definition_id, business_date)
select t.id('BD'), id, current_date from public.shift_definitions where branch_id = t.id('BD') and key = 'evening';
insert into t.ctx select 'S1', s.id from public.shifts s where s.branch_id = t.id('BD');

insert into public.shifts (branch_id, shift_definition_id, business_date)
select t.id('BD'), id, current_date from public.shift_definitions where branch_id = t.id('BD') and key = 'morning';
insert into t.ctx select 'S2', s.id from public.shifts s
  join public.shift_definitions d on d.id = s.shift_definition_id where s.branch_id = t.id('BD') and d.key = 'morning';

insert into public.shifts (branch_id, shift_definition_id, business_date)
select t.id('BR'), id, current_date from public.shift_definitions where branch_id = t.id('BR') and key = 'evening';
insert into t.ctx select 'SR', s.id from public.shifts s where s.branch_id = t.id('BR');

insert into public.shift_assignments (shift_id, user_id) values
  (t.id('S1'), t.id('E')), (t.id('SR'), t.id('K'));

-- =============================================================================
-- A. Access without a session / branch isolation / item management
-- =============================================================================
select t.as_anon();
select t.expect_denied('select * from public.inventory_items', 'anon cannot read inventory_items');
select t.expect_denied('select public.upsert_inventory_item(null, t.id(''BD''), ''X1'', ''x'', ''kg'')', 'anon cannot call upsert (execute revoked)');

select t.as_user('E');
select t.expect_denied($q$select public.upsert_inventory_item(null, t.id('BD'), 'ITEM1', 'Employee item', 'kg')$q$, 'employee cannot create items');

select t.as_user('BMR');
select t.expect_denied($q$select public.upsert_inventory_item(null, t.id('BD'), 'ITEM1', 'x', 'kg')$q$, 'branch_manager cannot create items in an unrelated branch');

select t.as_user('M');
select t.expect_ok($q$select public.upsert_inventory_item(null, t.id('BD'), ' item1 ', 'Test Item One', 'kg', true, t.id('CAT_DONDURMA'), 'fixture')$q$, 'manager creates item (code normalized)');
select t.as_superuser();
insert into t.ctx select 'ITEM1', id from public.inventory_items where code = 'ITEM1';
select t.assert((select count(*) from t.ctx where k = 'ITEM1') = 1, 'code was normalized to upper-case');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_item_create' and actor_user_id = t.id('M')) = 1, 'item creation audited with real actor');

select t.as_user('BMD');
select t.expect_ok($q$select public.upsert_inventory_item(null, t.id('BD'), 'ITEM2', 'Test Item Two', 'adet', false, t.id('CAT_SOGUK'))$q$, 'branch_manager creates item in own branch');
select t.expect_denied($q$select public.upsert_inventory_item(null, t.id('BD'), 'ITEM1', 'dup', 'kg')$q$, 'duplicate code rejected', '23505');
select t.as_superuser();
insert into t.ctx select 'ITEM2', id from public.inventory_items where code = 'ITEM2';

-- ITEM3 exists only to prove inactive handling
select t.as_user('M');
select public.upsert_inventory_item(null, t.id('BD'), 'ITEM3', 'Inactive Item', 'kg');
select t.as_superuser();
insert into t.ctx select 'ITEM3', id from public.inventory_items where code = 'ITEM3';
select t.as_user('BMD');
select t.expect_ok($q$select public.set_inventory_item_active(t.id('ITEM3'), false, 'not sold anymore')$q$, 'branch_manager deactivates own-branch item');
select t.as_user('E');
select t.expect_denied($q$select public.set_inventory_item_active(t.id('ITEM3'), true)$q$, 'employee cannot reactivate items');

-- isolation of reads
select t.as_user('K');
do $$ begin perform t.assert((select count(*) from public.inventory_items) = 0, 'Rumeli cashier sees no Dondurma items'); end $$;
select t.as_user('BMR');
do $$ begin perform t.assert((select count(*) from public.inventory_items) = 0, 'unrelated branch_manager sees no Dondurma items'); end $$;
select t.as_user('V');
do $$ begin perform t.assert((select count(*) from public.inventory_items) = 0, 'viewer has no inventory access by default'); end $$;
select t.as_user('E');
do $$ begin perform t.assert((select count(*) from public.inventory_items) = 3, 'Dondurma employee sees own branch items'); end $$;
select t.as_user('M');
do $$ begin perform t.assert((select count(*) from public.inventory_items) = 3, 'manager sees org-wide items'); end $$;

-- =============================================================================
-- B. Cost: privileged, effective-dated, append-only, confidential
-- =============================================================================
select t.as_user('E');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), 5, null, 'x')$q$, 'employee cannot edit cost');
select t.as_user('K');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), 5, null, 'x')$q$, 'cashier cannot edit cost');
select t.as_user('BMD');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), 5, null, 'x')$q$, 'branch_manager lacks cost.manage');

select t.as_user('M');
select t.expect_ok($q$select public.set_inventory_item_cost(t.id('ITEM1'), 10, now() - interval '10 days', 'initial')$q$, 'manager sets initial cost (back-dated)');
select t.expect_ok($q$select public.set_inventory_item_cost(t.id('ITEM1'), 12, now() - interval '5 days', 'price rise')$q$, 'manager appends a later cost');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), 9, now() - interval '7 days', 'backfill')$q$, 'cost cannot be inserted before the latest', '22023');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), 9, now() + interval '60 days', 'typo')$q$, 'far-future cost rejected', '22023');
select t.expect_denied($q$select public.set_inventory_item_cost(t.id('ITEM1'), -1, null, 'neg')$q$, 'negative cost rejected', '22023');

select t.as_superuser();
select t.assert((select count(*) from public.audit_logs where action = 'inventory_cost_change') = 2, 'each cost change audited');
select t.assert(public.inventory_effective_cost(t.id('ITEM1'), now() - interval '7 days') = 10, 'as-of lookup: 7 days ago -> 10');
select t.assert(public.inventory_effective_cost(t.id('ITEM1'), now()) = 12, 'as-of lookup: now -> 12');
select t.assert(public.inventory_effective_cost(t.id('ITEM1'), now() - interval '20 days') is null, 'as-of lookup before first cost -> NULL (not zero)');

-- cost rows are confidential and immutable
select t.as_user('E');
do $$ begin perform t.assert((select count(*) from public.inventory_item_costs) = 0, 'employee cannot see cost rows'); end $$;
select t.as_user('BMR');
do $$ begin perform t.assert((select count(*) from public.inventory_item_costs) = 0, 'unrelated branch_manager cannot see cost rows'); end $$;
select t.as_user('BMD');
do $$ begin perform t.assert((select count(*) from public.inventory_item_costs) = 2, 'own-branch branch_manager (cost.read) sees cost rows'); end $$;
select t.as_superuser();
select t.expect_denied($q$update public.inventory_item_costs set unit_cost = 1$q$, 'cost rows cannot be updated (append-only trigger)');
select t.expect_denied($q$delete from public.inventory_item_costs$q$, 'cost rows cannot be deleted (append-only trigger)');

-- =============================================================================
-- C. Receipts and waste (server-time ledger)
-- =============================================================================
select t.as_user('E');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 10)))$q$, 'employee cannot receive stock');
select t.as_user('BMD');
select t.expect_ok($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 100)), 'DLV-1', 'first delivery')$q$, 'branch_manager receives stock');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 5, 'unit_cost', 99)))$q$, 'receipt cannot smuggle a cost without cost.manage');
select t.as_user('BMR');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 5)))$q$, 'unrelated branch_manager cannot receive into another branch');

select t.as_user('M');
select t.expect_ok($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 50, 'unit_cost', 13)), 'DLV-2')$q$, 'manager receives stock with a new unit cost');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM2'), 'quantity', 2.5)))$q$, 'fractional quantity rejected for a whole-unit item', '22023');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 1), jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 2)))$q$, 'duplicate item in one receipt rejected', '22023');
select t.expect_denied($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM3'), 'quantity', 1)))$q$, 'inactive item cannot be received', '22023');
select t.expect_ok($q$select public.record_inventory_receipt(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM2'), 'quantity', 20)))$q$, 'whole-unit receipt (no cost set yet)');

select t.as_superuser();
select t.assert(t.stock('ITEM1') = 150, 'receipts increase theoretical stock (100 + 50)');
select t.assert(t.stock('ITEM2') = 20, 'ITEM2 stock 20');
select t.assert((select count(*) from public.inventory_item_costs where inventory_item_id = t.id('ITEM1')) = 3, 'receipt with a different unit cost appended a cost row (3 total)');
select t.assert((select unit_cost_snapshot from public.inventory_movements where reference = 'DLV-2') = 13, 'receipt snapshot = cost applied (13)');
select t.assert((select unit_cost_snapshot from public.inventory_movements where reference = 'DLV-1') = 12, 'earlier receipt snapshot = 12');
select t.assert((select unit_cost_snapshot from public.inventory_movements where inventory_item_id = t.id('ITEM2') limit 1) is null, 'no cost yet -> snapshot NULL (uncosted, not zero)');
select t.assert((select occurred_at from public.inventory_movements where reference = 'DLV-1') = now(), 'occurred_at is the server clock');
select t.assert(not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace
   and (p.proname like '%inventory%' or p.proname like 'submit_inventory%')
   and array_to_string(p.proargnames, ',') ~* 'occurred|happened|timestamp'), 'no inventory RPC accepts a client-supplied movement time');

-- waste
select t.as_user('E');
select t.expect_ok($q$select public.record_inventory_waste(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 3.5)), 'expired', 'freezer failure')$q$, 'employee records waste');
select t.expect_ok($q$select public.record_inventory_waste(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 1)), 'damaged', null, t.id('S1'))$q$, 'employee records waste against their own shift');
select t.expect_denied($q$select public.record_inventory_waste(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 1)), 'nonsense')$q$, 'unknown waste reason rejected', '22023');
select t.as_user('E2');
select t.expect_denied($q$select public.record_inventory_waste(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 1)), 'other', null, t.id('S1'))$q$, 'employee cannot record against a shift they are not assigned to');
select t.as_user('K');
select t.expect_denied($q$select public.record_inventory_waste(t.id('BD'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'quantity', 1)), 'other')$q$, 'Rumeli cashier cannot record waste in Dondurma');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 145.5, 'waste decreases theoretical stock (150 - 3.5 - 1)');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_waste') = 2, 'waste audited');

-- =============================================================================
-- D. No raw critical writes, anywhere
-- =============================================================================
select t.as_user('E');
select t.expect_denied($q$insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, created_by) values (t.id('BD'), t.id('ITEM1'), 'RECEIPT', 1, 1, t.id('E'))$q$, 'raw movement INSERT denied');
select t.expect_denied($q$update public.inventory_movements set quantity = 1$q$, 'raw movement UPDATE denied');
select t.expect_denied($q$delete from public.inventory_movements$q$, 'raw movement DELETE denied');
select t.expect_denied($q$update public.inventory_items set name = 'renamed', is_active = false$q$, 'raw item UPDATE denied');
select t.expect_denied($q$insert into public.inventory_item_costs (inventory_item_id, unit_cost, created_by) values (t.id('ITEM1'), 0.01, t.id('E'))$q$, 'raw cost INSERT denied');
select t.expect_denied($q$insert into public.inventory_counts (branch_id, business_date, counted_by) values (t.id('BD'), current_date, t.id('E'))$q$, 'raw count INSERT denied');
select t.expect_denied($q$update public.inventory_counts set status = 'voided'$q$, 'raw count lifecycle change denied');
select t.expect_denied($q$insert into public.sales_report_items (sales_report_id, category_id, amount, inventory_item_id, inventory_quantity) values (gen_random_uuid(), t.id('CAT_DONDURMA'), 1, t.id('ITEM1'), 1)$q$, 'raw product-linked sales line INSERT denied');
select t.as_user('M');
select t.expect_denied($q$insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, created_by) values (t.id('BD'), t.id('ITEM1'), 'RECEIPT', 1, 1, t.id('M'))$q$, 'even a manager has no raw movement INSERT');
select t.expect_denied($q$select * from public.inventory_movements$q$, 'select * on movements is denied (cost column not granted)');
select t.expect_denied($q$select unit_cost_snapshot from public.inventory_movements$q$, 'unit_cost_snapshot is not readable by any client role');
select t.as_user('E');
select t.expect_denied($q$select public.inventory_insert_movement(t.id('ITEM1'), 'RECEIPT', 1)$q$, 'internal ledger writer is not client-callable');
select t.expect_denied($q$select public.inventory_effective_cost(t.id('ITEM1'), now())$q$, 'internal cost lookup is not client-callable');
select t.as_superuser();
select t.expect_denied($q$update public.inventory_movements set quantity = 1$q$, 'ledger UPDATE blocked even for superuser (append-only trigger)');
select t.expect_denied($q$delete from public.inventory_movements$q$, 'ledger DELETE blocked even for superuser (append-only trigger)');
select t.assert(not has_function_privilege('anon', 'public.set_inventory_item_cost(uuid,numeric,timestamptz,text)', 'execute'), 'anon has no execute on cost RPC');
select t.assert(not has_function_privilege('authenticated', 'public.inventory_insert_movement(uuid,text,numeric,uuid,uuid,uuid,text,text,text,uuid)', 'execute'), 'authenticated has no execute on internal writer');
select t.assert(has_function_privilege('authenticated', 'public.record_inventory_waste(uuid,jsonb,text,text,uuid)', 'execute'), 'authenticated may execute public RPCs (authorization is inside)');

-- =============================================================================
-- E. Privileged adjustment / reversal
-- =============================================================================
select t.as_user('E');
select t.expect_denied($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 1, 'x')$q$, 'employee cannot privileged-adjust');
select t.as_user('K');
select t.expect_denied($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 1, 'x')$q$, 'cashier cannot privileged-adjust');
select t.as_user('BMR');
select t.expect_denied($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 1, 'x')$q$, 'unrelated branch_manager cannot adjust another branch');
select t.as_user('BMD');
select t.expect_denied($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 1, '   ')$q$, 'adjustment needs a reason', '22023');
select t.expect_denied($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'SIDEWAYS', 1, 'r')$q$, 'adjustment direction validated', '22023');
select t.expect_ok($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 1.5, 'breakage found on shelf')$q$, 'branch_manager adjusts own branch (OUT)');
select t.expect_ok($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'IN', 0.5, 'found extra tub')$q$, 'branch_manager adjusts own branch (IN)');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 144.5, 'adjustments applied (145.5 - 1.5 + 0.5)');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_adjustment') = 2, 'privileged adjustments audited');

-- reverse the employee's first waste movement
select t.as_superuser();
insert into t.ctx select 'WASTE1', id from public.inventory_movements
  where movement_type = 'WASTE' and quantity = 3.5 and inventory_item_id = t.id('ITEM1');
select t.as_user('E');
select t.expect_denied($q$select public.reverse_inventory_movement(t.id('WASTE1'), 'oops')$q$, 'employee cannot reverse movements');
select t.as_user('M');
select t.expect_denied($q$select public.reverse_inventory_movement(t.id('WASTE1'), '')$q$, 'reversal needs a reason', '22023');
select t.expect_ok($q$select public.reverse_inventory_movement(t.id('WASTE1'), 'entered on the wrong item')$q$, 'manager reverses a movement');
select t.expect_denied($q$select public.reverse_inventory_movement(t.id('WASTE1'), 'again')$q$, 'a movement can be reversed only once', '23505');
select t.as_superuser();
insert into t.ctx select 'REV1', id from public.inventory_movements where reverses_movement_id = t.id('WASTE1');
select t.as_user('M');
select t.expect_denied($q$select public.reverse_inventory_movement(t.id('REV1'), 'undo the undo')$q$, 'a reversal cannot be reversed', '22023');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 148, 'reversal restores stock (144.5 + 3.5)');
select t.assert((select count(*) from public.inventory_movements where inventory_item_id = t.id('ITEM1') and id = t.id('WASTE1')) = 1, 'the original movement still exists (history preserved)');
select t.assert((select unit_cost_snapshot from public.inventory_movements where id = t.id('REV1')) = (select unit_cost_snapshot from public.inventory_movements where id = t.id('WASTE1')), 'reversal copies the original cost snapshot');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_movement_reversal') = 1, 'reversal audited');

-- =============================================================================
-- F. Physical count never touches the ledger
-- =============================================================================
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 148, 'pre-count theoretical stock is 148');
select t.as_user('K');
select t.expect_denied($q$select public.submit_inventory_count(t.id('BD'), null, jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'physical_quantity', 1)))$q$, 'Rumeli cashier cannot submit a Dondurma count');
select t.as_user('V');
select t.expect_denied($q$select public.submit_inventory_count(t.id('BD'), null, jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'physical_quantity', 1)))$q$, 'viewer cannot submit a count');
select t.as_user('E2');
select t.expect_denied($q$select public.submit_inventory_count(t.id('BD'), t.id('S1'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'physical_quantity', 1)))$q$, 'employee cannot count against an unassigned shift');
select t.as_user('E');
select t.expect_denied($q$select public.submit_inventory_count(t.id('BD'), null, jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'physical_quantity', -1)))$q$, 'negative physical quantity rejected', '22023');
select t.expect_denied($q$select public.submit_inventory_count(t.id('BD'), null, jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM3'), 'physical_quantity', 1)))$q$, 'inactive item cannot be counted', '22023');
select t.expect_ok($q$select public.submit_inventory_count(t.id('BD'), t.id('S1'), jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'physical_quantity', 140), jsonb_build_object('inventory_item_id', t.id('ITEM2'), 'physical_quantity', 20)), 'closing count')$q$, 'assigned employee submits a closing count');
select t.as_superuser();
insert into t.ctx select 'COUNT1', id from public.inventory_counts;
select t.assert(t.stock('ITEM1') = 148, 'submitting a count did NOT change theoretical stock');
select t.assert((select count(*) from public.inventory_movements where inventory_count_id is not null) = 0, 'submitting a count wrote no ledger movement');
select t.assert((select theoretical_quantity from public.inventory_count_items where inventory_item_id = t.id('ITEM1')) = 148, 'count snapshots the theoretical quantity server-side');
select t.assert((select variance_quantity from public.inventory_count_items where inventory_item_id = t.id('ITEM1')) = -8, 'variance = physical - theoretical (140 - 148)');
select t.assert((select variance_quantity from public.inventory_count_items where inventory_item_id = t.id('ITEM2')) = 0, 'a matching count has zero variance');
select t.assert((select business_date from public.inventory_counts where id = t.id('COUNT1')) = current_date, 'count business date comes from the shift');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_count_submit') = 1, 'count submission audited');
select t.expect_denied($q$update public.inventory_count_items set physical_quantity = 148$q$, 'submitted count lines are immutable');
select t.expect_denied($q$delete from public.inventory_counts$q$, 'counts are never deleted');
select t.expect_denied($q$update public.inventory_counts set note = 'edited'$q$, 'counts cannot be edited (only voided)');

-- explicit, audited adjustment is the ONLY thing that reconciles the ledger
select t.as_user('BMD');
select t.expect_ok($q$select public.record_inventory_adjustment(t.id('ITEM1'), 'OUT', 8, 'closing count variance', t.id('COUNT1'))$q$, 'variance resolved by an explicit linked adjustment');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 140, 'ledger now agrees with the count only because of the audited adjustment');
select t.assert((select variance_quantity from public.inventory_count_items where inventory_item_id = t.id('ITEM1')) = -8, 'the recorded variance is unchanged (history intact)');

-- counts: visibility + void
select t.as_user('E');
do $$ begin perform t.assert((select count(*) from public.inventory_counts) = 1, 'employee sees own-branch counts'); end $$;
select t.expect_denied($q$select public.void_inventory_count(t.id('COUNT1'), 'x')$q$, 'employee cannot void a count');
select t.as_user('BMR');
do $$ begin perform t.assert((select count(*) from public.inventory_counts) = 0, 'unrelated branch_manager cannot see the count'); end $$;
select t.as_user('BMD');
select t.expect_denied($q$select public.void_inventory_count(t.id('COUNT1'), '')$q$, 'voiding needs a reason', '22023');
select t.expect_ok($q$select public.void_inventory_count(t.id('COUNT1'), 'counted the wrong freezer')$q$, 'branch_manager voids a mistaken count');
select t.expect_denied($q$select public.void_inventory_count(t.id('COUNT1'), 'again')$q$, 'a voided count cannot be voided again', '22023');
select t.as_superuser();
select t.assert((select status from public.inventory_counts where id = t.id('COUNT1')) = 'voided', 'count is voided, not deleted');
select t.assert((select count(*) from public.inventory_last_counts) = 0, 'voided counts are excluded from inventory_last_counts');
select t.assert((select count(*) from public.audit_logs where action = 'inventory_count_void') = 1, 'void audited');

-- =============================================================================
-- G. Sales -> inventory (revenue and quantity are separate facts)
-- =============================================================================
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 140, 'stock before sales = 140');

-- 1) product-linked X report by the assigned employee
select t.as_user('E');
select t.expect_ok($q$select public.create_sales_report(t.id('S1'), null, 'X', 250, 5, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'inventory_quantity', 5, 'amount', 250)))$q$, 'employee submits a product-linked report');
select t.as_superuser();
insert into t.ctx select 'R1', id from public.sales_reports where report_type = 'X' and shift_id = t.id('S1');
select t.assert(t.stock('ITEM1') = 135, 'a product-linked sale decreases theoretical stock (140 - 5)');
select t.assert((select count(*) from public.inventory_movements where sales_report_id = t.id('R1') and movement_type = 'SALE' and quantity = 5) = 1, 'exactly one SALE movement, linked to the report');
select t.assert((select unit_cost_snapshot from public.inventory_movements where sales_report_id = t.id('R1')) = 13, 'SALE snapshots the applicable effective cost (13)');
select t.assert((select category_id from public.sales_report_items where sales_report_id = t.id('R1')) = t.id('CAT_DONDURMA'), 'product line reconciles under the item''s sales category');
select t.assert((select reconciliation_status from public.sales_reports where id = t.id('R1')) = 'OK', 'product line revenue reconciles with the report total');

-- 2) legacy category-level report: valid, and creates NO stock movement
select t.as_user('E');
select t.expect_ok($q$select public.create_sales_report(t.id('S1'), null, 'Z', 100, null, null, null,
   jsonb_build_array(jsonb_build_object('category_id', t.id('CAT_SOGUK'), 'amount', 100)))$q$, 'category-level (legacy-shape) report still works');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 135 and t.stock('ITEM2') = 20, 'a category-only report has no stock effect (revenue never implies quantity)');

-- 3) validation rules
select t.as_user('M');
select t.expect_denied($q$select public.create_sales_report(t.id('S2'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('category_id', t.id('CAT_DONDURMA'), 'amount', 10),
                     jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'inventory_quantity', 1, 'amount', 20)))$q$, 'a category cannot mix category-level and product lines', '22023');
select t.expect_denied($q$select public.create_sales_report(t.id('S2'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'amount', 30)))$q$, 'a product line needs an explicit quantity', '22023');
select t.expect_denied($q$select public.create_sales_report(t.id('S2'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM2'), 'inventory_quantity', 1.5, 'amount', 30)))$q$, 'whole-unit item cannot be sold fractionally', '22023');
select t.expect_denied($q$select public.create_sales_report(t.id('S2'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM3'), 'inventory_quantity', 1, 'amount', 30)))$q$, 'an inactive item cannot be sold', '22023');
select t.as_user('K');
select t.expect_denied($q$select public.create_sales_report(t.id('SR'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'inventory_quantity', 1, 'amount', 30)))$q$, 'cross-branch: a Rumeli report cannot consume Dondurma stock', '22023');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 135, 'rejected reports left the ledger untouched (transactional)');

-- 4) an uncosted sale (ITEM2 has no cost)
select t.as_user('M');
select t.expect_ok($q$select public.create_sales_report(t.id('S2'), null, 'X', 30, null, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM2'), 'inventory_quantity', 3, 'amount', 30)))$q$, 'manager submits a report for an uncosted item');
select t.as_superuser();
select t.assert(t.stock('ITEM2') = 17, 'ITEM2 stock 20 - 3');
select t.assert((select unit_cost_snapshot from public.inventory_movements where movement_type = 'SALE' and inventory_item_id = t.id('ITEM2')) is null, 'uncosted sale keeps a NULL snapshot');

-- 5) cost changes after a sale do not touch historical snapshots
select t.as_user('M');
select t.expect_ok($q$select public.set_inventory_item_cost(t.id('ITEM1'), 20, now() + interval '1 hour', 'planned rise')$q$, 'a future-dated cost is accepted');
select t.as_superuser();
select t.assert((select unit_cost_snapshot from public.inventory_movements where sales_report_id = t.id('R1')) = 13, 'historical SALE snapshot is unchanged by a later cost row');
select t.assert(public.inventory_effective_cost(t.id('ITEM1'), now()) = 13, 'the future cost is not effective yet');
select t.assert(public.inventory_effective_cost(t.id('ITEM1'), now() + interval '2 hours') = 20, 'the future cost applies from its effective_from');

-- 6) gross profit inputs are cost-gated and honest about coverage
select t.as_user('M');
do $$
declare v jsonb; l jsonb;
begin
  v := public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day');
  select x into l from jsonb_array_elements(v -> 'lines') x where x ->> 'code' = 'ITEM1';
  perform t.assert((l ->> 'sold_quantity')::numeric = 5, 'GP: sold quantity 5');
  perform t.assert((l ->> 'product_revenue')::numeric = 250, 'GP: product revenue 250');
  perform t.assert((l ->> 'cogs')::numeric = 65, 'GP: COGS = 5 x 13 = 65 (snapshot cost)');
  perform t.assert((l ->> 'uncosted_quantity')::numeric = 0, 'GP: fully costed');
  select x into l from jsonb_array_elements(v -> 'lines') x where x ->> 'code' = 'ITEM2';
  perform t.assert((l ->> 'uncosted_quantity')::numeric = 3 and (l ->> 'costed_quantity')::numeric = 0, 'GP: uncosted item is reported as uncosted, not zero-cost');
  perform t.assert((v ->> 'unmapped_category_revenue')::numeric = 100, 'GP: category-level revenue in a tracked category is reported as unmapped (100 soguk)');
end $$;
select t.as_user('BMD');
select t.expect_ok($q$select public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day')$q$, 'branch_manager (cost.read) reads own-branch gross profit');
select t.as_user('BMR');
select t.expect_denied($q$select public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day')$q$, 'unrelated branch_manager cannot read another branch''s gross profit');
select t.as_user('E');
select t.expect_denied($q$select public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day')$q$, 'employee cannot read gross profit / cost');
select t.as_user('K');
select t.expect_denied($q$select public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day')$q$, 'cashier cannot read gross profit / cost');

-- 7) edit -> reversal + fresh sale; history is never rewritten
select t.as_user('E');
select t.expect_denied($q$select public.edit_sales_report(t.id('R1'), 200, 4, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'inventory_quantity', 4, 'amount', 200)), '')$q$, 'editing a report needs a reason', '22023');
select t.expect_ok($q$select public.edit_sales_report(t.id('R1'), 200, 4, null, null,
   jsonb_build_array(jsonb_build_object('inventory_item_id', t.id('ITEM1'), 'inventory_quantity', 4, 'amount', 200)), 'miscounted tubs')$q$, 'owner of the report edits it');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 136, 'edit nets to the new quantity (140 - 4)');
select t.assert((select count(*) from public.inventory_movements where sales_report_id = t.id('R1')) = 3, 'ledger keeps SALE + REVERSAL + new SALE (3 rows, nothing rewritten)');
select t.assert((select count(*) from public.inventory_movements where sales_report_id = t.id('R1') and movement_type = 'REVERSAL') = 1, 'one REVERSAL for the superseded sale');
select t.assert((select count(*) from public.audit_logs where action = 'report_edit' and reason = 'miscounted tubs') = 1, 'edit audited with the reason');

select t.as_user('M');
select t.expect_denied($q$select public.reverse_inventory_movement((select id from public.inventory_movements where sales_report_id = t.id('R1') and movement_type = 'SALE' limit 1), 'direct')$q$, 'sale-linked movements cannot be reversed directly', '22023');

-- 8) cancel -> reversal; the report and the ledger stay consistent
select t.as_user('E');
select t.expect_ok($q$select public.cancel_sales_report(t.id('R1'), 'entered twice')$q$, 'employee cancels own report');
select t.as_superuser();
select t.assert(t.stock('ITEM1') = 140, 'cancel restores stock (net zero for the report)');
select t.assert((select count(*) from public.inventory_movements where sales_report_id = t.id('R1')) = 4, 'cancelled report keeps all 4 movement rows (SALE, REVERSAL, SALE, REVERSAL)');
select t.assert((select status from public.sales_reports where id = t.id('R1')) = 'cancelled', 'report is cancelled, not deleted');
select t.assert((select count(*) from public.audit_logs where action = 'report_delete') = 1, 'cancellation audited');
select t.as_user('M');
do $$
declare v jsonb; l jsonb;
begin
  v := public.get_inventory_gross_profit(t.id('BD'), now() - interval '1 day', now() + interval '1 day');
  select x into l from jsonb_array_elements(v -> 'lines') x where x ->> 'code' = 'ITEM1';
  perform t.assert(l is null or ((l ->> 'sold_quantity')::numeric = 0 and (l ->> 'product_revenue')::numeric = 0 and (l ->> 'cogs')::numeric = 0),
    'GP after cancellation: sold/revenue/COGS all net to zero (history preserved, totals correct)');
end $$;

-- =============================================================================
-- H. Cross-branch isolation of movements + audit completeness
-- =============================================================================
select t.as_user('K');
do $$ begin perform t.assert((select count(*) from public.inventory_movements where inventory_item_id is not null and branch_id = t.id('BD')) = 0, 'Rumeli cashier sees no Dondurma movements'); end $$;
select t.as_user('BMR');
do $$ begin perform t.assert((select count(*) from public.inventory_stock_balances) = 0, 'unrelated branch_manager sees no Dondurma balances'); end $$;
select t.as_user('E');
do $$ begin
  perform t.assert((select theoretical_quantity from public.inventory_stock_balances where inventory_item_id = t.id('ITEM1')) = 140, 'employee reads own-branch balances (140)');
  perform t.assert((select count(*) from public.inventory_movements where branch_id = t.id('BD')) > 0, 'employee reads own-branch movements (without cost column)');
end $$;

select t.as_superuser();
select t.assert((select count(*) from public.audit_logs where actor_user_id is null and action like 'inventory_%') = 0, 'every inventory audit row has an actor');
select t.assert((select count(distinct action) from public.audit_logs where action in (
  'inventory_item_create','inventory_item_active_change','inventory_cost_change','inventory_receipt','inventory_waste',
  'inventory_adjustment','inventory_movement_reversal','inventory_count_submit','inventory_count_void')) = 9,
  'every privileged inventory action produced an audit row');

do $$ begin raise notice 'ALL INVENTORY SECURITY ASSERTIONS PASSED'; end $$;

rollback;
