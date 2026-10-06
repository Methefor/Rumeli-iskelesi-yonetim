-- =============================================================================
-- procurement.test.sql  (Phase 1C: suppliers, supply params, purchase orders, receiving, calendar, suggestions, security)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE with every migration applied
-- (supabase db reset --local --no-seed). One transaction, ends in ROLLBACK.
--
--   docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres \
--        -v ON_ERROR_STOP=1 < supabase/tests/procurement.test.sql
--
-- Clean run prints 'ALL PROCUREMENT ASSERTIONS PASSED (<n> assertions)'. Synthetic data only.
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
create function t.as_superuser() returns void language plpgsql as $$ begin execute 'reset role'; end $$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- stock helper: a plain ledger RECEIPT inserted as superuser (fixture only)
create function t.stock(p_item text, p_qty numeric) returns void language plpgsql as $$
begin
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, created_by, occurred_at)
  select branch_id, id, 'RECEIPT', p_qty, p_qty, t.id('K'), timestamptz '2026-09-01 10:00:00+03' from public.inventory_items where id = t.id(p_item);
end $$;
create function t.on_hand(p_item text) returns numeric language sql stable as $$
  select coalesce(sum(stock_delta), 0) from public.inventory_movements where inventory_item_id = t.id(p_item)
$$;
create function t.lines(p_item text, p_qty numeric) returns jsonb language sql stable as $$
  select jsonb_build_array(jsonb_build_object('inventory_item_id', t.id(p_item), 'quantity', p_qty))
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Identities ---------------------------------------------------------------
insert into t.ctx (k, v) values
  ('O', '00000000-0000-0000-0000-0000000000d1'), ('M', '00000000-0000-0000-0000-0000000000d2'),
  ('BMD', '00000000-0000-0000-0000-0000000000d3'), ('BMR', '00000000-0000-0000-0000-0000000000d4'),
  ('K', '00000000-0000-0000-0000-0000000000d5'), ('E', '00000000-0000-0000-0000-0000000000d6'),
  ('V', '00000000-0000-0000-0000-0000000000d7');
insert into t.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into t.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into auth.users (id, email) select v, lower(k) || '@proc-test.invalid' from t.ctx where k in ('O','M','BMD','BMR','K','E','V');
insert into public.profiles (id, full_name, employee_code) values
  (t.id('O'), 'P Owner', 'P901'), (t.id('M'), 'P Manager', 'P902'), (t.id('BMD'), 'P BM Dondurma', 'P903'),
  (t.id('BMR'), 'P BM Rumeli', 'P904'), (t.id('K'), 'P Cashier', 'P905'), (t.id('E'), 'P Employee', 'P906'), (t.id('V'), 'P Viewer', 'P907');
insert into public.user_roles (user_id, role_id)
select t.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BMD','branch_manager'),('BMR','branch_manager'),
  ('K','cashier'),('E','employee'),('V','viewer')) x(k, rk) join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (t.id('BMD'), t.id('BD')), (t.id('BMR'), t.id('BR')), (t.id('K'), t.id('BR')), (t.id('E'), t.id('BD')), (t.id('V'), t.id('BR'));

insert into public.inventory_items (branch_id, code, name, unit, allows_decimal) values
  (t.id('BR'), 'P1', 'Proc Item One', 'kg', true), (t.id('BR'), 'P2', 'Proc Item Two', 'adet', false),
  (t.id('BR'), 'P3', 'Proc Item Three', 'kg', true), (t.id('BR'), 'P4', 'Proc Item Four', 'kg', true),
  (t.id('BR'), 'P5', 'Proc Item Five', 'kg', true), (t.id('BR'), 'P6', 'Proc Item Six', 'kg', true),
  (t.id('BR'), 'P7', 'Proc Item Seven', 'adet', false), (t.id('BD'), 'PD1', 'Proc Dondurma One', 'kg', true);
insert into t.ctx select code, id from public.inventory_items where code in ('P1','P2','P3','P4','P5','P6','P7','PD1');

-- ---------------------------------------------------------------------------
-- A. permission matrix
-- ---------------------------------------------------------------------------
do $$ declare r text; begin
  perform t.assert((select count(*) from public.permissions where key like 'procurement.%') = 8, 'eight procurement permissions');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles ro on ro.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where ro.key in ('owner','manager') and p.key like 'procurement.%') = 16, 'owner and manager hold all eight');
  perform t.assert((select array_agg(p.key order by p.key) from public.role_permissions rp join public.roles ro on ro.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where ro.key = 'branch_manager' and p.key like 'procurement.%')
                   = array['procurement.order.create','procurement.order.read','procurement.order.receive','procurement.supplier.read'], 'branch_manager: read, create, receive, supplier read; no approve/manage');
  perform t.assert((select count(*) from public.role_permissions rp join public.roles ro on ro.id = rp.role_id join public.permissions p on p.id = rp.permission_id
                     where ro.key in ('cashier','employee','viewer') and p.key like 'procurement.%') = 0, 'cashier, employee, viewer hold none');
  perform t.assert((select count(*) from public.suppliers) = 0 and (select count(*) from public.item_supply_params) = 0 and (select count(*) from public.purchase_orders) = 0,
    'nothing is seeded: no supplier, no parameter, no order');
end $$;

-- ---------------------------------------------------------------------------
-- B. suppliers
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare v uuid; begin
  v := public.upsert_supplier(null, 'syn-co-1', 'Sentetik Firma A', 'COMPANY', 'Demo Kişi', '000', 'demo@example.invalid', 'sentetik', 'yeni tedarikçi');
  insert into t.ctx values ('SUP1', v);
  perform t.assert((select code = 'SYN-CO-1' and is_active and supplier_type = 'COMPANY' from public.suppliers where id = v), 'supplier created, code upper-cased');
  v := public.upsert_supplier(null, 'SYN-CW', 'Sentetik Merkez Depo', 'CENTRAL_WAREHOUSE', null, null, null, null, 'merkez depo');
  insert into t.ctx values ('SUP2', v);
  perform t.expect_denied($q$select public.upsert_supplier(null, 'SYN-CO-1', 'Dup', 'COMPANY', null, null, null, null, 'duplicate code')$q$, 'duplicate code rejected', '23505');
  perform t.expect_denied($q$select public.upsert_supplier(null, 'SYN-X', 'X', 'VENDOR', null, null, null, null, 'bad type here')$q$, 'unknown type rejected', '22023');
  perform t.expect_denied($q$select public.upsert_supplier(null, 'bad code', 'X', 'COMPANY', null, null, null, null, 'bad code format')$q$, 'code format rejected', '23514');
  perform t.expect_denied($q$select public.upsert_supplier(null, 'SYN-Y', 'X', 'COMPANY', null, null, null, null, 'abc')$q$, 'short reason rejected', '22023');
  perform public.upsert_supplier(t.id('SUP1'), 'IGNORED-CODE', 'Sentetik Firma A (güncel)', 'COMPANY', null, null, null, null, 'ad güncellemesi');
  perform t.assert((select code = 'SYN-CO-1' and name = 'Sentetik Firma A (güncel)' from public.suppliers where id = t.id('SUP1')), 'update keeps the immutable code');
  perform t.expect_denied($q$update public.suppliers set name = 'direct'$q$, 'no direct supplier update');
  perform t.expect_denied($q$delete from public.suppliers$q$, 'no direct supplier delete');
  v := public.upsert_supplier(null, 'SYN-OLD', 'Sentetik Pasif', 'COMPANY', null, null, null, null, 'pasif örnek');
  insert into t.ctx values ('SUP3', v);
  perform public.set_supplier_active(v, false, 'artık kullanılmıyor');
  perform t.assert(not (select is_active from public.suppliers where id = v), 'supplier deactivated');
  perform t.assert((select count(*) from public.audit_logs where entity_type = 'suppliers' and action in ('supplier_create','supplier_update','supplier_deactivate')) = 5, 'supplier create/update/deactivate are audited');
end $$;
select t.as_superuser();
do $$ begin
  perform t.expect_denied($q$update public.suppliers set code = 'NEW-CODE' where code = 'SYN-CO-1'$q$, 'the code is immutable even for a privileged writer');
  perform t.expect_denied($q$delete from public.suppliers where code = 'SYN-CO-1'$q$, 'suppliers are never deleted');
end $$;

-- who can read / manage suppliers
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.assert((select count(*) from public.suppliers) = 0, u || ': no supplier visibility');
    perform t.expect_denied($q$select public.upsert_supplier(null, 'NOPE-1', 'No', 'COMPANY', null, null, null, null, 'not allowed')$q$, u || ': cannot manage suppliers');
  end loop;
  perform t.as_user('BMR');
  perform t.assert((select count(*) from public.suppliers) = 3, 'branch_manager reads the catalogue');
  perform t.expect_denied($q$select public.upsert_supplier(null, 'NOPE-2', 'No', 'COMPANY', null, null, null, null, 'not allowed')$q$, 'branch_manager cannot manage suppliers');
  perform t.expect_denied(format($q$select public.set_supplier_active(%L, false, 'not allowed here')$q$, t.id('SUP1')), 'branch_manager cannot deactivate');
  perform t.as_anon();
  perform t.expect_denied($q$select count(*) from public.suppliers$q$, 'anon: no supplier table access');
  perform t.expect_denied($q$select public.upsert_supplier(null, 'NOPE-3', 'No', 'COMPANY', null, null, null, null, 'anonymous')$q$, 'anon: no supplier RPC');
  perform t.as_superuser();
end $$;

-- ---------------------------------------------------------------------------
-- C. item supply parameters
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare v uuid; begin
  v := public.upsert_item_supply_params(t.id('BR'), t.id('P1'), t.id('SUP1'),
    '{"minimum_stock":5,"target_stock":20,"safety_stock":2,"lead_time_days":1,"allowed_order_weekdays":[5,1,3,3],"order_cutoff_time":"14:00","delivery_weekdays":[2,4,6],"minimum_order_quantity":6,"order_multiple":6,"notes":"sentetik"}'::jsonb,
    'ilk tedarik ayarı');
  perform t.assert((select allowed_order_weekdays = array[1,3,5]::smallint[] and order_cutoff_time = time '14:00' and minimum_stock = 5 and order_unit is null and units_per_pack is null from public.item_supply_params where id = v),
    'params saved; weekdays normalised (sorted, distinct)');
  perform t.assert((select count(*) from public.audit_logs where action = 'supply_params_create') = 1, 'params creation audited');
  -- null-safe: a row with no business input at all
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P4'), t.id('SUP1'), '{}'::jsonb, 'yalnızca tedarikçi');
  perform t.assert((select minimum_stock is null and target_stock is null and allowed_order_weekdays is null and lead_time_days is null and order_cutoff_time is null
                      from public.item_supply_params where item_id = t.id('P4')), 'every business input stays NULL when unknown');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"minimum_stock":10,"target_stock":5}'::jsonb, 'target below minimum')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'target below minimum rejected', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"minimum_stock":-1}'::jsonb, 'negative minimum')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'negative minimum rejected', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"safety_stock":-1}'::jsonb, 'negative safety')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'negative safety rejected', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"lead_time_days":-1}'::jsonb, 'negative lead')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'negative lead time rejected', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"units_per_pack":0}'::jsonb, 'zero pack size')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'pack size must be positive', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"order_multiple":0}'::jsonb, 'zero multiple')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'order multiple must be positive', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"allowed_order_weekdays":[8]}'::jsonb, 'bad weekday')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'weekday outside 1..7 rejected', '23514');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{}'::jsonb, 'wrong branch item')$q$, t.id('BR'), t.id('PD1'), t.id('SUP1')), 'item of another branch rejected', '22023');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{}'::jsonb, 'inactive supplier')$q$, t.id('BR'), t.id('P5'), t.id('SUP3')), 'inactive supplier cannot be assigned', '22023');
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{}'::jsonb, 'abc')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'short reason rejected', '22023');
  perform t.expect_ok(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{"minimum_stock":5,"target_stock":5}'::jsonb, 'target equals minimum')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'target equal to minimum is valid');
  perform t.expect_denied($q$update public.item_supply_params set minimum_stock = 1$q$, 'no direct params update');
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P2'), t.id('SUP1'), '{"minimum_stock":10}'::jsonb, 'yalnızca minimum');
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P3'), t.id('SUP1'), '{"minimum_stock":5,"target_stock":20,"minimum_order_quantity":6,"order_multiple":6}'::jsonb, 'p3 ayarı');
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P6'), t.id('SUP2'), '{"minimum_stock":1,"target_stock":4}'::jsonb, 'p6 ayarı');
  perform public.upsert_item_supply_params(t.id('BD'), t.id('PD1'), t.id('SUP1'), '{"minimum_stock":1}'::jsonb, 'dondurma ayarı');
end $$;
select t.as_user('BMR');
do $$ begin
  perform t.expect_denied(format($q$select public.upsert_item_supply_params(%L, %L, %L, '{}'::jsonb, 'branch manager cannot configure')$q$, t.id('BR'), t.id('P5'), t.id('SUP1')), 'branch_manager cannot configure supply');
  perform t.assert((select count(*) from public.item_supply_params) = 6, 'branch_manager reads own-branch params');
  perform t.assert((select count(*) from public.item_supply_params where branch_id = t.id('BD')) = 0, 'branch_manager cannot read another branch params');
end $$;
select t.as_user('BMD');
do $$ begin
  perform t.assert((select count(*) from public.item_supply_params) = 1, 'the other branch manager sees only the own branch');
end $$;
select t.as_user('K');
do $$ begin perform t.assert((select count(*) from public.item_supply_params) = 0, 'cashier reads no supply params'); end $$;
select t.as_user('E');
do $$ begin perform t.assert((select count(*) from public.item_supply_params) = 0, 'employee reads no supply params'); end $$;
select t.as_superuser();

-- ---------------------------------------------------------------------------
-- D. purchase orders: draft, lines, lifecycle, terminal states, branch isolation
-- ---------------------------------------------------------------------------
select t.as_user('BMR');
do $$ declare v uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, 'sentetik taslak', t.lines('P1', 12));
  insert into t.ctx values ('PO1', v);
  perform t.assert((select status = 'DRAFT' and order_number like 'PO-%' and created_by = t.id('BMR') from public.purchase_orders where id = v), 'branch_manager creates a DRAFT with a human-readable number');
  perform t.assert((select ordered_quantity = 12 and order_unit is null and units_per_pack_snapshot is null from public.purchase_order_lines where purchase_order_id = v), 'a base-unit item has no pack conversion: the line is in the stock unit');
  perform t.assert((select count(*) from public.purchase_order_status_history where purchase_order_id = v and to_status = 'DRAFT') = 1, 'creation is in the status history');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P1', 5)), 'below the minimum order quantity', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P1', 7)), 'not a multiple of the order multiple', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P2', 1.5)), 'whole-unit item rejects decimals', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('PD1', 6)), 'item of another branch rejected', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP3'), t.lines('P1', 6)), 'an inactive supplier cannot receive new orders', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, '[{"inventory_item_id":"%s","quantity":6},{"inventory_item_id":"%s","quantity":6}]'::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.id('P1'), t.id('P1')), 'duplicate item rejected', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, '[{"inventory_item_id":"%s","quantity":6,"unit_cost_estimate_kurus":100}]'::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.id('P1')), 'cost estimate needs inventory.cost.manage', '42501');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, '[]'::jsonb)$q$, t.id('BD'), t.id('SUP1')), 'branch_manager cannot create in another branch');
  -- edit while DRAFT
  perform t.assert(public.replace_purchase_order_lines(v, t.lines('P1', 18)) = 1, 'DRAFT lines can be replaced');
  perform public.update_purchase_order_header(v, null, current_date + 3, 'güncel not');
  perform t.assert((select expected_delivery_date = current_date + 3 from public.purchase_orders where id = v), 'DRAFT header can be edited');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'APPROVED')$q$, v), 'DRAFT cannot jump to APPROVED', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'SUBMITTED')$q$, public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, '[]'::jsonb)), 'an empty order cannot be submitted', '22023');
  perform public.transition_purchase_order(v, 'SUBMITTED');
  perform t.assert((select status = 'SUBMITTED' and submitted_at is not null from public.purchase_orders where id = v), 'DRAFT -> SUBMITTED');
  perform t.expect_denied(format($q$select public.replace_purchase_order_lines(%L, %L::jsonb)$q$, v, t.lines('P1', 6)), 'SUBMITTED lines cannot silently change', '22023');
  perform t.expect_denied(format($q$select public.update_purchase_order_header(%L, null, null, 'x')$q$, v), 'SUBMITTED header cannot change', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'APPROVED')$q$, v), 'branch_manager has no approve permission');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'DRAFT', 'returning to draft')$q$, v), 'returning to DRAFT needs manage');
end $$;
select t.as_user('M');
do $$ declare v uuid := t.id('PO1'); begin
  perform public.transition_purchase_order(v, 'APPROVED');
  perform t.assert((select status = 'APPROVED' and approved_by = t.id('M') and approved_at is not null from public.purchase_orders where id = v), 'manager approves');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'SUBMITTED')$q$, v), 'APPROVED cannot go back to SUBMITTED', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'RECEIVED', 'direct receive attempt')$q$, v), 'RECEIVED is not settable directly', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'PARTIALLY_RECEIVED')$q$, v), 'PARTIALLY_RECEIVED is not settable directly', '22023');
  perform t.expect_denied(format($q$select public.replace_purchase_order_lines(%L, %L::jsonb)$q$, v, t.lines('P1', 6)), 'APPROVED quantities cannot be rewritten', '22023');
  perform public.transition_purchase_order(v, 'PREPARING');
  perform public.transition_purchase_order(v, 'IN_TRANSIT');
  perform t.assert((select status = 'IN_TRANSIT' from public.purchase_orders where id = v), 'APPROVED -> PREPARING -> IN_TRANSIT');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'PREPARING')$q$, v), 'IN_TRANSIT cannot go back to PREPARING', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'CANCELLED', 'abc')$q$, v), 'cancel needs a real reason', '22023');
  perform t.assert((select array_agg(to_status order by changed_at, id) from public.purchase_order_status_history where purchase_order_id = v) is not null
                   and (select count(*) from public.purchase_order_status_history where purchase_order_id = v) = 5, 'five history rows: DRAFT, SUBMITTED, APPROVED, PREPARING, IN_TRANSIT');
  -- cancel path and terminal state
  perform public.transition_purchase_order(v, 'CANCELLED', 'tedarikçi iptal etti');
  perform t.assert((select status = 'CANCELLED' and cancelled_at is not null from public.purchase_orders where id = v), 'IN_TRANSIT -> CANCELLED with a reason');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'DRAFT', 'reopen attempt')$q$, v), 'CANCELLED is terminal', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'SUBMITTED')$q$, v), 'CANCELLED cannot be resubmitted', '22023');
  perform t.expect_denied(format($q$update public.purchase_orders set status = 'DRAFT' where id = %L$q$, v), 'no direct status update');
  perform t.assert((select count(*) from public.audit_logs where entity_id = v::text and entity_type = 'purchase_orders') >= 6, 'every material step is audited');
  -- return-to-draft path (approver sends it back)
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P1', 6));
  insert into t.ctx values ('PO2', v);
  perform public.transition_purchase_order(v, 'SUBMITTED');
  perform public.transition_purchase_order(v, 'DRAFT', 'miktar düzeltilecek');
  perform t.assert((select status = 'DRAFT' from public.purchase_orders where id = v), 'SUBMITTED -> DRAFT (return) with a reason');
  perform public.transition_purchase_order(v, 'CANCELLED', 'vazgeçildi');
  perform t.assert((select status = 'CANCELLED' from public.purchase_orders where id = v), 'DRAFT can be cancelled');
  -- manager sets a cost estimate, missing estimate shows as unavailable
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null,
         format('[{"inventory_item_id":"%s","quantity":6,"unit_cost_estimate_kurus":4500},{"inventory_item_id":"%s","quantity":2}]', t.id('P1'), t.id('P2'))::jsonb);
  insert into t.ctx values ('PO3', v);
  perform t.assert((public.get_purchase_order(v) -> 'lines' -> 0 #>> '{unitCostEstimate,kurus}')::int = 4500, 'cost estimate visible to cost.read');
  perform t.assert((public.get_purchase_order(v) -> 'lines' -> 1 #>> '{unitCostEstimate,reason}') = 'missing_cost', 'missing estimate is unavailable, never 0');
  perform t.assert(jsonb_array_length(public.list_purchase_orders(t.id('BR'), array['DRAFT'], 10)) >= 1, 'list filters by status');
end $$;
select t.as_superuser();
do $$ begin
  perform t.expect_denied(format($q$update public.purchase_order_lines set ordered_quantity = 99 where purchase_order_id = %L$q$, t.id('PO1')), 'approved quantities are frozen even for a privileged writer');
  perform t.expect_denied(format($q$delete from public.purchase_order_lines where purchase_order_id = %L$q$, t.id('PO1')), 'lines of a non-DRAFT order cannot be deleted');
  perform t.expect_denied(format($q$update public.purchase_order_status_history set reason = 'x' where purchase_order_id = %L$q$, t.id('PO1')), 'status history is append-only');
  perform t.expect_denied(format($q$delete from public.purchase_orders where id = %L$q$, t.id('PO1')), 'purchase orders are never deleted');
  perform t.expect_denied(format($q$update public.purchase_orders set order_number = 'X' where id = %L$q$, t.id('PO3')), 'order number is immutable');
end $$;

-- branch isolation + roles
select t.as_user('BMD');
do $$ begin
  perform t.assert((select count(*) from public.purchase_orders) = 0, 'other branch manager sees no Rumeli order');
  perform t.expect_denied(format($q$select public.get_purchase_order(%L)$q$, t.id('PO3')), 'cross-branch get denied');
  perform t.expect_denied(format($q$select public.list_purchase_orders(%L)$q$, t.id('BR')), 'cross-branch list denied');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'CANCELLED', 'cross branch attempt')$q$, t.id('PO3')), 'cross-branch transition denied');
end $$;
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.assert((select count(*) from public.purchase_orders) = 0 and (select count(*) from public.purchase_order_lines) = 0, u || ': no order visibility');
    perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, '[]'::jsonb)$q$, t.id('BR'), t.id('SUP1')), u || ': cannot create orders');
    perform t.expect_denied(format($q$select public.get_purchase_order(%L)$q$, t.id('PO3')), u || ': cannot read an order');
    perform t.expect_denied(format($q$select public.get_order_suggestions(%L)$q$, t.id('BR')), u || ': no suggestions');
    perform t.expect_denied(format($q$select public.get_procurement_attention(%L)$q$, t.id('BR')), u || ': no attention list');
  end loop;
  perform t.as_user('BMR');
  perform t.assert((select count(*) from public.purchase_orders) >= 3, 'branch_manager reads own-branch orders');
  perform t.expect_denied($q$select unit_cost_estimate_kurus from public.purchase_order_lines$q$, 'the cost estimate column is not directly selectable');
  perform t.expect_denied(format($q$insert into public.purchase_orders (branch_id, supplier_id, created_by) values (%L, %L, %L)$q$, t.id('BR'), t.id('SUP1'), t.id('BMR')), 'no direct order insert');
  perform t.assert(public.get_purchase_order(t.id('PO3')) -> 'lines' -> 0 #>> '{unitCostEstimate,state}' = 'available', 'branch_manager has cost.read for the own branch');
  perform t.as_anon();
  perform t.expect_denied($q$select count(*) from public.purchase_orders$q$, 'anon: no order table access');
  perform t.expect_denied(format($q$select public.get_purchase_order(%L)$q$, t.id('PO3')), 'anon: no order read');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, '[]'::jsonb)$q$, t.id('BR'), t.id('SUP1')), 'anon: no order create');
  perform t.as_superuser();
end $$;

-- ---------------------------------------------------------------------------
-- E. receiving into the EXISTING ledger
-- ---------------------------------------------------------------------------
select t.stock('P1', 0.001);   -- not used for balances below (P1 baseline recorded next)
select t.as_user('M');
do $$ declare v uuid; l1 uuid; l2 uuid; before_p1 numeric; before_p2 numeric; res jsonb; mv uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null,
         format('[{"inventory_item_id":"%s","quantity":12},{"inventory_item_id":"%s","quantity":6}]', t.id('P1'), t.id('P2'))::jsonb);
  insert into t.ctx values ('PO4', v);
  select id into l1 from public.purchase_order_lines where purchase_order_id = v and inventory_item_id = t.id('P1');
  select id into l2 from public.purchase_order_lines where purchase_order_id = v and inventory_item_id = t.id('P2');
  insert into t.ctx values ('L1', l1), ('L2', l2);
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, v, l1), 'a DRAFT order cannot be received', '22023');
  perform public.transition_purchase_order(v, 'SUBMITTED');
  perform public.transition_purchase_order(v, 'APPROVED');
end $$;
select t.as_user('BMR');
do $$ declare v uuid := t.id('PO4'); l1 uuid := t.id('L1'); l2 uuid := t.id('L2'); b1 numeric; b2 numeric; res jsonb; mv uuid; begin
  b1 := t.on_hand('P1'); b2 := t.on_hand('P2');
  res := public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":5}]', l1)::jsonb, 'ilk irsaliye');
  perform t.assert(res ->> 'status' = 'PARTIALLY_RECEIVED', 'a partial receipt moves the order to PARTIALLY_RECEIVED');
  perform t.assert(t.on_hand('P1') = b1 + 5, 'stock grows through the existing ledger (+5)');
  select inventory_movement_id into mv from public.purchase_order_receipts where purchase_order_line_id = l1;
  perform t.assert((select movement_type = 'RECEIPT' and quantity = 5 and stock_delta = 5 and reference = (select order_number from public.purchase_orders where id = v)
                      from public.inventory_movements where id = mv), 'the link points at a plain RECEIPT movement referenced by the order number');
  insert into t.ctx values ('MV1', mv);
  perform t.assert((select received_quantity = 5 from public.purchase_order_lines where id = l1), 'received_quantity updated');
  perform t.assert((public.get_purchase_order(v) -> 'lines' -> 0 ->> 'openQuantity')::numeric in (7, 6) and jsonb_array_length(public.get_purchase_order(v) -> 'receipts') = 1, 'ordered vs received vs open and the receipt link are exposed');
  perform t.assert((select quantity = base_quantity and base_quantity = 5 from public.purchase_order_receipts where purchase_order_line_id = l1 order by received_at limit 1), 'a base-unit line: order quantity equals ledger quantity (factor 1)');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":8}]'::jsonb)$q$, v, l1), 'cannot receive more than is still open', '22023');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1,"unit_cost":9}]'::jsonb)$q$, v, l1), 'unit cost needs inventory.cost.manage', '42501');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1},{"line_id":"%s","quantity":1}]'::jsonb)$q$, v, l1, l1), 'a line cannot repeat in one receipt', '22023');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":0}]'::jsonb)$q$, v, l1), 'zero quantity rejected', '22023');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PO3'), l1), 'a line of another order is rejected (also denied by status)', '22023');
  res := public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":7}]', l1)::jsonb);
  perform t.assert(res ->> 'status' = 'PARTIALLY_RECEIVED', 'line 1 complete but line 2 open: still PARTIALLY_RECEIVED');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, v, l1), 'the same quantity cannot be received twice', '22023');
  res := public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":6}]', l2)::jsonb);
  perform t.assert(res ->> 'status' = 'RECEIVED' and (select status = 'RECEIVED' and received_at is not null from public.purchase_orders where id = v), 'the last open quantity closes the order as RECEIVED');
  perform t.assert(t.on_hand('P1') = b1 + 12 and t.on_hand('P2') = b2 + 6, 'ledger balances equal the received quantities exactly');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, v, l1), 'a RECEIVED order cannot receive again', '22023');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'CANCELLED', 'too late to cancel')$q$, v), 'RECEIVED is terminal', '22023');
  perform t.assert((select count(*) from public.purchase_order_receipts where purchase_order_id = v) = 3, 'three receipt links (5 + 7, 6)');
  perform t.assert((select count(*) from public.inventory_movements where reference = (select order_number from public.purchase_orders where id = v) and movement_type = 'RECEIPT') = 3, 'exactly three RECEIPT movements exist for the order');
  perform t.assert((select count(*) from public.audit_logs where action = 'purchase_order_receive' and entity_id = v::text) = 3, 'each receipt is audited with its movements');
end $$;
select t.as_superuser();
do $$ begin perform t.assert((select unit_cost_snapshot is null from public.inventory_movements where id = t.id('MV1')), 'no cost supplied: the snapshot stays NULL (missing cost, not 0)'); end $$;
select t.as_user('M');
do $$ declare v uuid; l uuid; mv uuid; begin
  -- a receipt with a supplied cost (owner/manager only) sets the cost like record_inventory_receipt
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P1', 6));
  insert into t.ctx values ('PO5', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  perform public.transition_purchase_order(v, 'SUBMITTED');
  perform public.transition_purchase_order(v, 'APPROVED');
  perform public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":4,"unit_cost":3.5}]', l)::jsonb);
  select inventory_movement_id into mv from public.purchase_order_receipts where purchase_order_line_id = l;
  insert into t.ctx values ('MV2', mv);
  -- close short: 2 of 6 still open
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'RECEIVED')$q$, v), 'closing short needs a reason', '22023');
  perform public.transition_purchase_order(v, 'RECEIVED', 'tedarikçi eksik gönderdi');
  perform t.assert((select status = 'RECEIVED' from public.purchase_orders where id = v) and (select received_quantity = 4 from public.purchase_order_lines where id = l), 'PARTIALLY_RECEIVED -> RECEIVED closes short with the reason, received quantity unchanged');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'CANCELLED', 'received already')$q$, v), 'a partially received order can never be cancelled', '22023');
end $$;
select t.as_superuser();
do $$ begin
  perform t.assert((select unit_cost_snapshot = 3.5 from public.inventory_movements where id = t.id('MV2')), 'a supplied cost becomes the ledger snapshot');
  perform t.assert((select count(*) from public.inventory_item_costs where inventory_item_id = t.id('P1') and unit_cost = 3.5) = 1, 'and the item cost history gets the new cost');
end $$;
select t.as_user('BMR');
do $$ declare v uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P1', 6));
  insert into t.ctx values ('PO6', v);
  perform public.transition_purchase_order(v, 'SUBMITTED');
  perform t.expect_denied(format($q$select public.transition_purchase_order(%L, 'CANCELLED', 'branch manager cancels submitted')$q$, v), 'cancelling a SUBMITTED order needs manage');
end $$;
do $$ declare u text; begin
  foreach u in array array['K','E','V'] loop
    perform t.as_user(u);
    perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PO4'), t.id('L1')), u || ': cannot receive a purchase order');
  end loop;
  perform t.as_user('BMD');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PO4'), t.id('L1')), 'cross-branch receive denied');
  perform t.as_anon();
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PO4'), t.id('L1')), 'anon: no receive');
  perform t.as_superuser();
end $$;
do $$ begin
  perform t.expect_denied(format($q$update public.purchase_order_receipts set quantity = 1 where purchase_order_id = %L$q$, t.id('PO4')), 'receipt links are append-only');
  perform t.expect_denied(format($q$update public.purchase_order_lines set received_quantity = 0 where purchase_order_id = %L$q$, t.id('PO4')), 'received_quantity can never decrease');
  perform t.expect_denied(format($q$update public.inventory_movements set quantity = 1 where reference = (select order_number from public.purchase_orders where id = %L)$q$, t.id('PO4')), 'the ledger itself stays append-only');
end $$;

-- ---------------------------------------------------------------------------
-- F. order calendar (pure function, branch time zone)
-- ---------------------------------------------------------------------------
do $$ declare c jsonb; begin
  -- 2026-10-05 is a Monday; allowed Mon/Wed/Fri, cutoff 14:00, lead 1, delivery Tue/Thu/Sat
  c := public.procurement_calendar(timestamptz '2026-10-05 10:00:00+03', 'Europe/Istanbul', array[1,3,5]::smallint[], time '14:00', array[2,4,6]::smallint[], 1);
  perform t.assert((c ->> 'canOrderToday')::boolean and not (c ->> 'cutoffPassed')::boolean and c ->> 'nextOrderDate' = '2026-10-05', 'Monday 10:00: can order, cutoff not passed, next order day today');
  perform t.assert(c #>> '{expectedDelivery,state}' = 'estimated' and c #>> '{expectedDelivery,date}' = '2026-10-06', 'delivery is an ESTIMATE: Tuesday (lead 1 day, delivery weekdays Tue/Thu/Sat)');
  c := public.procurement_calendar(timestamptz '2026-10-05 15:00:00+03', 'Europe/Istanbul', array[1,3,5]::smallint[], time '14:00', array[2,4,6]::smallint[], 1);
  perform t.assert(not (c ->> 'canOrderToday')::boolean and (c ->> 'cutoffPassed')::boolean and c ->> 'nextOrderDate' = '2026-10-07', 'Monday 15:00: cutoff passed, next order day Wednesday');
  perform t.assert(c #>> '{expectedDelivery,date}' = '2026-10-08', 'order on Wednesday + 1 day = Thursday delivery');
  c := public.procurement_calendar(timestamptz '2026-10-06 10:00:00+03', 'Europe/Istanbul', array[1,3,5]::smallint[], time '14:00', null, null);
  perform t.assert(not (c ->> 'canOrderToday')::boolean and c -> 'cutoffPassed' = 'null'::jsonb and c ->> 'nextOrderDate' = '2026-10-07', 'Tuesday: not an order day, cutoff is not applicable');
  perform t.assert(c #>> '{expectedDelivery,state}' = 'unknown' and c #>> '{expectedDelivery,date}' is null, 'no lead time and no delivery weekdays: delivery is unknown, not invented');
  c := public.procurement_calendar(timestamptz '2026-10-04 12:00:00+03', 'Europe/Istanbul', array[1,3,5]::smallint[], null, null, 2);
  perform t.assert(c ->> 'nextOrderDate' = '2026-10-05' and c #>> '{expectedDelivery,date}' = '2026-10-07' and c #>> '{expectedDelivery,state}' = 'estimated', 'Sunday: next Monday; lead only = estimated order date + lead');
  c := public.procurement_calendar(timestamptz '2026-10-05 22:30:00+00', 'Europe/Istanbul', array[1]::smallint[], null, null, null);
  perform t.assert(c ->> 'today' = '2026-10-06' and not (c ->> 'canOrderToday')::boolean, 'timezone: 22:30 UTC is already Tuesday in Istanbul');
  c := public.procurement_calendar(timestamptz '2026-10-05 22:30:00+00', 'UTC', array[1]::smallint[], null, null, null);
  perform t.assert(c ->> 'today' = '2026-10-05' and (c ->> 'canOrderToday')::boolean, 'the same instant in UTC is still Monday: the branch time zone decides');
  c := public.procurement_calendar(timestamptz '2026-10-05 23:59:00+03', 'Europe/Istanbul', array[1]::smallint[], time '23:59', null, null);
  perform t.assert((c ->> 'cutoffPassed')::boolean, 'the cutoff minute itself counts as passed');
  c := public.procurement_calendar(timestamptz '2026-10-05 23:00:00+03', 'Europe/Istanbul', array[1]::smallint[], null, null, null);
  perform t.assert((c ->> 'canOrderToday')::boolean and c -> 'cutoffPassed' = 'null'::jsonb, 'no cutoff configured: orderable all day');
  c := public.procurement_calendar(timestamptz '2026-10-05 10:00:00+03', 'Europe/Istanbul', null, time '14:00', null, null);
  perform t.assert(not (c ->> 'configured')::boolean and c -> 'canOrderToday' = 'null'::jsonb and c -> 'nextOrderDate' = 'null'::jsonb, 'unconfigured weekdays: nothing is invented');
end $$;

-- ---------------------------------------------------------------------------
-- G. order suggestions (deterministic primitives)
-- ---------------------------------------------------------------------------
select t.stock('P3', 3);
select t.stock('P2', 2);
select t.as_user('M');
do $$ declare s jsonb; e jsonb; v uuid; begin
  s := public.get_order_suggestions(t.id('BR'));
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P3';
  perform t.assert((e ->> 'onHand')::numeric = 3 and (e ->> 'pendingOrderQuantity')::numeric = 0 and (e ->> 'effectiveStock')::numeric = 3, 'on hand comes from the ledger, nothing pending');
  perform t.assert(e ->> 'status' = 'configured' and (e ->> 'reorderNeeded')::boolean and (e ->> 'suggestedQuantity')::numeric = 18, 'target 20 - 3 = 17, rounded up to the order multiple 6 = 18');
  -- a DRAFT never counts as pending; a SUBMITTED order does
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P3', 6));
  insert into t.ctx values ('PO7', v);
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P3';
  perform t.assert((e ->> 'pendingOrderQuantity')::numeric = 0, 'a DRAFT order is not pending');
  perform public.transition_purchase_order(v, 'SUBMITTED');
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P3';
  perform t.assert((e ->> 'pendingOrderQuantity')::numeric = 6 and (e ->> 'effectiveStock')::numeric = 9 and (e ->> 'suggestedQuantity')::numeric = 12 and (e ->> 'hasOpenOrder')::boolean,
    'a SUBMITTED order is pending: effective 9, 20 - 9 = 11 rounded up to 12');
  perform public.transition_purchase_order(v, 'CANCELLED', 'öneri testi iptal');
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P3';
  perform t.assert((e ->> 'pendingOrderQuantity')::numeric = 0, 'a cancelled order is not pending');
  -- minimum only: partially configured, reorder flag but no quantity
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P2';
  perform t.assert(e ->> 'status' = 'partially_configured' and (e ->> 'reorderNeeded')::boolean and e -> 'suggestedQuantity' = 'null'::jsonb, 'minimum only: reorder needed, no invented quantity');
  -- no thresholds at all: unavailable
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P4';
  perform t.assert(e ->> 'status' = 'unavailable' and e -> 'reorderNeeded' = 'null'::jsonb and e -> 'suggestedQuantity' = 'null'::jsonb, 'no thresholds: unavailable, nothing invented');
  -- target reached: suggestion absent, never 0 or negative
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P1';
  perform t.assert((e ->> 'onHand')::numeric > 0, 'P1 has stock from the receiving tests');
  perform t.assert(not exists (select 1 from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where (x ->> 'suggestedQuantity') is not null and (x ->> 'suggestedQuantity')::numeric <= 0), 'a suggested quantity is never zero or negative');
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P6';
  perform t.assert(e ->> 'supplierCode' = 'SYN-CW' and (e ->> 'suggestedQuantity')::numeric = 4, 'central-warehouse supplier item: 4 - 0 = 4 (no multiple configured)');
  perform t.assert(e #>> '{calendar,configured}' = 'false', 'item without order weekdays has an unconfigured calendar');
  select x into e from jsonb_array_elements(s) x where x ->> 'code' = 'P1';
  perform t.assert(e #>> '{calendar,configured}' = 'true', 'configured weekdays produce a calendar');
  perform t.assert(not exists (select 1 from jsonb_array_elements(s) x where x ->> 'code' = 'PD1'), 'another branch item never appears');
end $$;
select t.as_user('BMR');
do $$ begin
  perform t.assert(jsonb_array_length(public.get_order_suggestions(t.id('BR'))) = 6, 'branch_manager reads own-branch suggestions');
  perform t.expect_denied(format($q$select public.get_order_suggestions(%L)$q$, t.id('BD')), 'cross-branch suggestions denied');
end $$;

-- ---------------------------------------------------------------------------
-- H. Command Center read model
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare v uuid; a jsonb; l uuid; today date := (now() at time zone 'Europe/Istanbul')::date; begin
  -- due today (approved)
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, today, null, t.lines('P5', 5));
  insert into t.ctx values ('PO8', v);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
  -- overdue (in transit)
  v := public.create_purchase_order(t.id('BR'), t.id('SUP2'), null, today - 2, null, t.lines('P6', 3));
  insert into t.ctx values ('PO9', v);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED'); perform public.transition_purchase_order(v, 'IN_TRANSIT');
  -- awaiting approval
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, today + 4, null, t.lines('P4', 2));
  insert into t.ctx values ('PO10', v);
  perform public.transition_purchase_order(v, 'SUBMITTED');
  -- partially received, expected in the future
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, today + 2, null, t.lines('P1', 12));
  insert into t.ctx values ('PO11', v);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  perform public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":3}]', l)::jsonb);
  a := public.get_procurement_attention(t.id('BR'));
  perform t.assert(a ->> 'today' = today::text, 'attention uses the branch-local date');
  perform t.assert(exists (select 1 from jsonb_array_elements(a -> 'dueToday') x where x ->> 'orderNumber' = (select order_number from public.purchase_orders where id = t.id('PO8'))), 'due today lists the order expected today');
  perform t.assert(exists (select 1 from jsonb_array_elements(a -> 'overdueDelivery') x where x ->> 'orderNumber' = (select order_number from public.purchase_orders where id = t.id('PO9'))), 'overdue lists the late in-transit order');
  perform t.assert(not exists (select 1 from jsonb_array_elements(a -> 'overdueDelivery') x where x ->> 'orderNumber' = (select order_number from public.purchase_orders where id = t.id('PO8'))), 'an order due today is not overdue');
  perform t.assert(exists (select 1 from jsonb_array_elements(a -> 'awaitingApproval') x where x ->> 'orderNumber' = (select order_number from public.purchase_orders where id = t.id('PO10'))), 'awaiting approval lists SUBMITTED orders');
  perform t.assert(jsonb_array_length(a -> 'partiallyReceived') = 1 and (a -> 'partiallyReceived' -> 0 ->> 'lineCount')::int = 1 and (a -> 'partiallyReceived' -> 0 ->> 'receivedLineCount')::int = 0, 'partially received shows progress in lines (quantities of different units are never added)');
  perform t.assert((a -> 'nextDeliveries' -> 0 ->> 'expectedDeliveryDate') <= (a -> 'nextDeliveries' -> 1 ->> 'expectedDeliveryDate'), 'next deliveries are ordered by expected date');
  perform t.assert(not exists (select 1 from jsonb_array_elements(a -> 'nextDeliveries') x where x ->> 'status' in ('SUBMITTED','DRAFT','RECEIVED','CANCELLED')), 'next deliveries only list open approved orders');
  perform t.assert(exists (select 1 from jsonb_array_elements(a -> 'lowStockNoOpenOrder') x where x ->> 'code' = 'P3'), 'low stock with no open order lists P3');
  perform t.assert(not exists (select 1 from jsonb_array_elements(a -> 'lowStockNoOpenOrder') x where x ->> 'code' = 'P5'), 'an item with an open order is not listed as unordered');
end $$;

-- ---------------------------------------------------------------------------
-- J. UNIT CONTRACT: order unit vs base (stock) unit, snapshots, dimensional suggestions
-- ---------------------------------------------------------------------------
select t.as_superuser();
select t.stock('P7', 6);
select t.as_user('M');
do $$ declare e jsonb; begin
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P7'), t.id('SUP1'),
    '{"order_unit":"koli","units_per_pack":12,"minimum_stock":12,"target_stock":48,"minimum_order_quantity":0.1}'::jsonb, 'koli ayarı');
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P7';
  perform t.assert((e ->> 'onHand')::numeric = 6 and (e ->> 'effectiveStock')::numeric = 6 and e ->> 'conversionStatus' = 'pack' and e ->> 'orderUnit' = 'koli', 'stock figures are base units (6 pieces), the order unit is koli (12 pieces)');
  perform t.assert((e ->> 'suggestedQuantity')::numeric = 4 and (e ->> 'suggestedBaseQuantity')::numeric = 48, 'need 48-6 = 42 pieces = 3.5 koli, rounded UP to 4 koli (= 48 pieces); never 42 koli, never 3.5');
end $$;
do $$ declare v uuid; l uuid; e jsonb; b0 numeric; res jsonb; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P7', 2));
  insert into t.ctx values ('PA', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  insert into t.ctx values ('LA', l);
  perform t.assert((select order_unit = 'koli' and units_per_pack_snapshot = 12 and ordered_quantity = 2 from public.purchase_order_lines where id = l), 'the line stores 2 koli with the pack snapshot 12');
  perform t.assert((public.get_purchase_order(v) -> 'lines' -> 0 ->> 'orderedBaseQuantity')::numeric = 24, 'the order shows 2 koli = 24 pieces');
  perform public.transition_purchase_order(v, 'SUBMITTED');
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P7';
  perform t.assert((e ->> 'pendingOrderQuantity')::numeric = 24 and (e ->> 'effectiveStock')::numeric = 30, 'pending inbound is converted to BASE units (24 pieces), then added to on hand: 6 + 24 = 30');
  perform t.assert((e ->> 'suggestedQuantity')::numeric = 2 and (e ->> 'suggestedBaseQuantity')::numeric = 24, 'need 48-30 = 18 pieces = 1.5 koli -> 2 koli (24 pieces)');
  perform public.transition_purchase_order(v, 'APPROVED');
  -- the pack configuration changes AFTER the order exists: the order keeps its snapshot
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P7'), t.id('SUP1'),
    '{"order_unit":"koli","units_per_pack":10,"minimum_stock":12,"target_stock":48,"minimum_order_quantity":0.1}'::jsonb, 'koli 10 adet oldu');
  perform t.assert((select units_per_pack_snapshot = 12 from public.purchase_order_lines where id = l), 'a later pack-size change never rewrites the order line snapshot');
  select x into e from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P7';
  perform t.assert((e ->> 'pendingOrderQuantity')::numeric = 24, 'pending inbound still uses the frozen factor (24 pieces, not 20)');
  perform t.assert((e ->> 'suggestedQuantity')::numeric = 2 and (e ->> 'suggestedBaseQuantity')::numeric = 20, 'new suggestions use the NEW pack size: 18 pieces / 10 = 1.8 -> 2 koli = 20 pieces');
end $$;
select t.as_user('BMR');
do $$ declare v uuid := t.id('PA'); l uuid := t.id('LA'); b0 numeric; res jsonb; mv uuid; begin
  b0 := t.on_hand('P7');
  res := public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":1}]', l)::jsonb);
  perform t.assert(res ->> 'status' = 'PARTIALLY_RECEIVED' and t.on_hand('P7') = b0 + 12, 'receiving 1 koli adds 12 pieces (the snapshot, not the new 10)');
  perform t.assert((select received_quantity = 1 from public.purchase_order_lines where id = l)
                   and (public.get_purchase_order(v) -> 'lines' -> 0 ->> 'receivedBaseQuantity')::numeric = 12
                   and (public.get_purchase_order(v) -> 'lines' -> 0 ->> 'openBaseQuantity')::numeric = 12, 'received 1 koli (12 pieces), open 1 koli (12 pieces)');
  perform t.assert((select quantity = 1 and base_quantity = 12 from public.purchase_order_receipts where purchase_order_line_id = l), 'the receipt link records 1 order unit and 12 base units');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1.5}]'::jsonb)$q$, v, l), 'more than the open order quantity (in koli) is rejected', '22023');
  res := public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":1}]', l)::jsonb);
  perform t.assert(res ->> 'status' = 'RECEIVED' and t.on_hand('P7') = b0 + 24, 'the full order of 2 koli adds exactly 24 pieces to the ledger, not 2');
  perform t.assert((select quantity = 12 and stock_delta = 12 and movement_type = 'RECEIPT' from public.inventory_movements where id = (select inventory_movement_id from public.purchase_order_receipts where purchase_order_line_id = l order by received_at limit 1)),
    'the ledger RECEIPT is in base units');
end $$;
select t.as_user('M');
do $$ declare v uuid; l uuid; begin
  -- the NEW order uses the NEW pack size; a whole-unit item rejects a fractional base quantity
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P7', 3));
  insert into t.ctx values ('PB', v);
  perform t.assert((select units_per_pack_snapshot = 10 from public.purchase_order_lines where purchase_order_id = v), 'a new order snapshots the new pack size 10');
  perform t.expect_denied(format($q$select public.replace_purchase_order_lines(%L, %L::jsonb)$q$, v, t.lines('P7', 0.25)), '0.25 koli x 10 = 2.5 pieces of a whole-unit item is rejected', '22023');
  perform t.expect_ok(format($q$select public.replace_purchase_order_lines(%L, %L::jsonb)$q$, v, t.lines('P7', 0.5)), '0.5 koli x 10 = 5 whole pieces is valid');
  perform public.replace_purchase_order_lines(v, t.lines('P7', 3));
  -- a half-known conversion is never guessed
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P7'), t.id('SUP1'), '{"order_unit":"koli","minimum_stock":12,"target_stock":48}'::jsonb, 'paket miktarı eksik');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P7', 1)), 'order unit without units per pack: ordering refused, not guessed', '22023');
  perform t.assert((select x ->> 'conversionStatus' = 'missing' and x -> 'suggestedQuantity' = 'null'::jsonb and x -> 'suggestedBaseQuantity' = 'null'::jsonb
                      from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P7'), 'and no suggestion is produced for a half-known conversion');
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P7'), t.id('SUP1'), '{"order_unit":"koli","units_per_pack":10,"minimum_stock":12,"target_stock":48}'::jsonb, 'paket miktarı geri');
  -- order multiple and minimum order quantity are ORDER-unit rules
  perform public.upsert_item_supply_params(t.id('BR'), t.id('P7'), t.id('SUP1'), '{"order_unit":"koli","units_per_pack":10,"minimum_stock":12,"target_stock":48,"minimum_order_quantity":3,"order_multiple":4}'::jsonb, 'koli katı');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P7', 2)), 'minimum order quantity is in koli (2 < 3)', '22023');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P7', 6)), 'order multiple is in koli (6 is not a multiple of 4)', '22023');
  perform t.expect_ok(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP1'), t.lines('P7', 8)), '8 koli (multiple of 4) is accepted');
  perform t.assert((select (x ->> 'suggestedQuantity')::numeric = 4 and (x ->> 'suggestedBaseQuantity')::numeric = 40
                      from jsonb_array_elements(public.get_order_suggestions(t.id('BR'))) x where x ->> 'code' = 'P7'), 'on hand 30, need 18 pieces = 1.8 koli, raised to the minimum 3 koli, rounded up to the multiple 4 koli = 40 pieces');
end $$;
select t.as_superuser();
do $$ declare po uuid := t.id('PB'); begin
  perform t.expect_denied(format($q$insert into public.purchase_order_lines (purchase_order_id, inventory_item_id, ordered_quantity, order_unit) values (%L, %L, 1, 'koli')$q$, po, t.id('P2')), 'the database refuses a line with an order unit but no conversion', '23514');
end $$;

-- ---------------------------------------------------------------------------
-- K. receiving: atomicity, direct mutation, fulfillment reconciliation, reversal
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare v uuid; l1 uuid; l2 uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null,
         format('[{"inventory_item_id":"%s","quantity":12},{"inventory_item_id":"%s","quantity":6}]', t.id('P1'), t.id('P2'))::jsonb);
  insert into t.ctx values ('PK', v);
  select id into l1 from public.purchase_order_lines where purchase_order_id = v and inventory_item_id = t.id('P1');
  select id into l2 from public.purchase_order_lines where purchase_order_id = v and inventory_item_id = t.id('P2');
  insert into t.ctx values ('LK1', l1), ('LK2', l2);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
end $$;
select t.as_superuser();
select count(*) as mv_before from public.inventory_movements \gset
select t.as_user('BMR');
do $$ declare v uuid := t.id('PK'); begin
  -- line 1 is valid, line 2 exceeds the open quantity: the WHOLE call must roll back
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":5},{"line_id":"%s","quantity":100}]'::jsonb)$q$, v, t.id('LK1'), t.id('LK2')), 'a failing second line fails the whole receipt', '22023');
  perform t.assert((select count(*) from public.purchase_order_receipts where purchase_order_id = v) = 0, 'no partial receipt-link rows after the failure');
  perform t.assert((select sum(received_quantity) from public.purchase_order_lines where purchase_order_id = v) = 0, 'no half-updated received_quantity');
  perform t.assert((select status = 'APPROVED' from public.purchase_orders where id = v), 'the order status did not move');
  perform t.assert((select count(*) from public.inventory_movements where reference = (select order_number from public.purchase_orders where id = v)) = 0, 'no orphan ledger movement');
end $$;
select t.as_superuser();
do $$ begin
  perform t.expect_denied(format($q$update public.purchase_order_lines set received_quantity = 1 where id = %L$q$, t.id('LK1')), 'even a privileged writer cannot change received_quantity outside receive_purchase_order');
end $$;
select t.as_user('M');
do $$ begin
  perform t.expect_denied(format($q$update public.purchase_order_lines set received_quantity = 99 where id = %L$q$, t.id('LK1')), 'clients cannot mutate received_quantity directly');
  perform t.assert(public.receive_purchase_order(t.id('PK'), format('[{"line_id":"%s","quantity":12},{"line_id":"%s","quantity":6}]', t.id('LK1'), t.id('LK2'))::jsonb) ->> 'status' = 'RECEIVED', 'a valid multi-line receipt succeeds as one unit');
  perform t.assert((public.get_purchase_order(t.id('PK')) #>> '{reconciliation,state}') = 'ok', 'reconciliation is ok: received_quantity = receipt links = ledger');
end $$;
-- a RECEIPT movement is later reversed through the ledger (superuser fixture of reverse_inventory_movement)
select t.as_superuser();
do $$ declare mv uuid; begin
  select inventory_movement_id into mv from public.purchase_order_receipts where purchase_order_line_id = t.id('LK1');
  insert into public.inventory_movements (branch_id, inventory_item_id, movement_type, quantity, stock_delta, unit_cost_snapshot, reverses_movement_id, reason, created_by)
  select branch_id, inventory_item_id, 'REVERSAL', quantity, -stock_delta, unit_cost_snapshot, id, 'test reversal of a received delivery', t.id('M') from public.inventory_movements where id = mv;
end $$;
select t.as_user('M');
do $$ declare o jsonb; a jsonb; begin
  o := public.get_purchase_order(t.id('PK'));
  perform t.assert(o #>> '{reconciliation,state}' = 'warning' and o #> '{reconciliation,reasons}' ? 'receipt_reversed', 'a reversed receipt is a visible reconciliation warning');
  perform t.assert((o #>> '{reconciliation,reversedBaseQuantity}')::numeric = 12 and (o #>> '{reconciliation,netReceivedBaseQuantity}')::numeric = 6, 'reversed 12 pieces, net received 6 (line 2 only)');
  perform t.assert((select (x ->> 'reversed')::boolean from jsonb_array_elements(o -> 'receipts') x where x ->> 'lineId' = t.id('LK1')::text), 'the receipt itself is flagged reversed');
  perform t.assert(o ->> 'status' = 'RECEIVED' and (o -> 'lines' -> 0 ->> 'receivedQuantity')::numeric in (12, 6), 'the order is NOT silently reopened and received_quantity keeps what was recorded');
  a := public.get_procurement_attention(t.id('BR'));
  perform t.assert(exists (select 1 from jsonb_array_elements(a -> 'reconciliationWarnings') x where x ->> 'orderNumber' = o ->> 'orderNumber' and x -> 'reasons' ? 'receipt_reversed'), 'the attention read model lists the warning');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PK'), t.id('LK1')), 'a RECEIVED order still cannot receive the reversed quantity again', '22023');
end $$;

-- ---------------------------------------------------------------------------
-- L. supplier / item deactivation, receive-permission architecture, self-approval
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ declare v uuid; l uuid; v2 uuid; begin
  perform public.upsert_supplier(null, 'SYN-LATE', 'Sentetik Geç Pasif', 'COMPANY', null, null, null, null, 'sonradan pasif olacak');
  insert into t.ctx select 'SUP4', id from public.suppliers where code = 'SYN-LATE';
  v := public.create_purchase_order(t.id('BR'), t.id('SUP4'), null, null, null, t.lines('P5', 2));
  insert into t.ctx values ('PL', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  insert into t.ctx values ('LL', l);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
  v2 := public.create_purchase_order(t.id('BR'), t.id('SUP4'), null, null, null, t.lines('P5', 1));
  insert into t.ctx values ('PL2', v2);
  perform public.set_supplier_active(t.id('SUP4'), false, 'tedarikçi artık pasif');
  perform t.assert(not (select is_active from public.suppliers where id = t.id('SUP4')), 'the supplier is now inactive');
  perform t.expect_denied(format($q$select public.create_purchase_order(%L, %L, null, null, null, %L::jsonb)$q$, t.id('BR'), t.id('SUP4'), t.lines('P5', 1)), 'no NEW order for an inactive supplier', '22023');
  perform t.assert((public.get_purchase_order(v) ->> 'status') = 'APPROVED', 'the open historical order stays readable');
  perform public.transition_purchase_order(v2, 'SUBMITTED');
  perform t.assert((select status = 'SUBMITTED' from public.purchase_orders where id = v2), 'an existing draft of a now-inactive supplier can still move on (history is not stranded)');
  perform t.assert(public.receive_purchase_order(v, format('[{"line_id":"%s","quantity":2}]', l)::jsonb) ->> 'status' = 'RECEIVED', 'an approved order of a supplier that became inactive can still be received');
  perform public.transition_purchase_order(v2, 'CANCELLED', 'tedarikçi pasif olduğu için');
  perform t.assert((public.get_purchase_order(v2) ->> 'status') = 'CANCELLED' and (public.get_purchase_order(v) ->> 'status') = 'RECEIVED', 'received and cancelled history stays readable');
end $$;
select t.as_superuser();
do $$ declare v uuid; l uuid; begin
  -- inactive ITEM: explicit behaviour, no silent stranding
  select t.id('PL') into v;
  update public.inventory_items set is_active = true where id = t.id('P5');
end $$;
select t.as_user('M');
do $$ declare v uuid; l uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P6', 1));
  insert into t.ctx values ('PI', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  insert into t.ctx values ('LI', l);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
end $$;
select t.as_superuser();
update public.inventory_items set is_active = false where id = (select t.id('P6'));
select t.as_user('BMR');
do $$ begin
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PI'), t.id('LI')), 'an inactive item cannot be received: explicit refusal (reactivate, or cancel/close)', '22023');
end $$;
select t.as_user('M');
do $$ begin
  perform public.transition_purchase_order(t.id('PI'), 'CANCELLED', 'ürün pasif, sipariş iptal');
  perform t.assert((select status = 'CANCELLED' from public.purchase_orders where id = t.id('PI')), 'an order of an inactive item can be cancelled with a reason');
end $$;
select t.as_superuser();
update public.inventory_items set is_active = true where id = (select t.id('P6'));

-- receive permissions: generic inventory receipt (inventory.receive) is separate from receiving against a purchase order
do $$ begin
  perform t.assert((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id where p.key = 'inventory.receive')
                   = array['branch_manager','cashier','employee','manager','owner'], 'generic inventory.receive: owner, manager, branch_manager, cashier, employee (existing decision, unchanged)');
  perform t.assert((select array_agg(r.key order by r.key) from public.role_permissions rp join public.roles r on r.id = rp.role_id join public.permissions p on p.id = rp.permission_id where p.key = 'procurement.order.receive')
                   = array['branch_manager','manager','owner'], 'PO receiving (procurement.order.receive): owner, manager, branch_manager only (option A)');
end $$;
select t.as_user('K');
do $$ begin
  perform t.expect_ok(format($q$select public.record_inventory_receipt(%L, '[{"inventory_item_id":"%s","quantity":1}]'::jsonb, 'generic receipt', null)$q$, t.id('BR'), t.id('P4')), 'a cashier still records a generic own-branch receipt');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PA'), t.id('LA')), 'but cannot receive against a purchase order by default');
end $$;
select t.as_user('E');
do $$ begin
  perform t.expect_ok(format($q$select public.record_inventory_receipt(%L, '[{"inventory_item_id":"%s","quantity":1}]'::jsonb, 'generic receipt', null)$q$, t.id('BD'), t.id('PD1')), 'an employee still records a generic own-branch receipt');
end $$;
-- the policy is configurable by permission (option B is a role_permissions grant, not a code change)
select t.as_superuser();
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r, public.permissions p where r.key = 'cashier' and p.key = 'procurement.order.receive';
select t.as_user('M');
do $$ declare v uuid; l uuid; begin
  v := public.create_purchase_order(t.id('BR'), t.id('SUP1'), null, null, null, t.lines('P4', 2));
  insert into t.ctx values ('PC', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  insert into t.ctx values ('LC', l);
  perform public.transition_purchase_order(v, 'SUBMITTED'); perform public.transition_purchase_order(v, 'APPROVED');
end $$;
select t.as_user('BMD');
do $$ declare v uuid; l uuid; begin
  v := public.create_purchase_order(t.id('BD'), t.id('SUP1'), null, null, null, t.lines('PD1', 2));
  insert into t.ctx values ('PD', v);
  select id into l from public.purchase_order_lines where purchase_order_id = v;
  insert into t.ctx values ('LD', l);
end $$;
select t.as_user('M');
do $$ begin
  perform public.transition_purchase_order(t.id('PD'), 'SUBMITTED'); perform public.transition_purchase_order(t.id('PD'), 'APPROVED');
end $$;
select t.as_user('K');
do $$ begin
  perform t.assert(public.receive_purchase_order(t.id('PC'), format('[{"line_id":"%s","quantity":1}]', t.id('LC'))::jsonb) ->> 'status' = 'PARTIALLY_RECEIVED', 'with the permission granted, a cashier receives an own-branch order (audited)');
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PD'), t.id('LD')), 'branch scope still applies: another branch order is denied', '42501');
  perform t.expect_denied(format($q$select public.get_purchase_order(%L)$q$, t.id('PC')), 'the cashier still cannot read orders (option B would also need a minimal read model)');
end $$;
select t.as_superuser();
delete from public.role_permissions where role_id = (select id from public.roles where key = 'cashier') and permission_id = (select id from public.permissions where key = 'procurement.order.receive');
select t.as_user('K');
do $$ begin
  perform t.expect_denied(format($q$select public.receive_purchase_order(%L, '[{"line_id":"%s","quantity":1}]'::jsonb)$q$, t.id('PC'), t.id('LC')), 'revoking the permission closes it again');
end $$;
-- self-approval is an OPEN BUSINESS DECISION, not a security property: today a creator holding the approve permission may approve their own order
select t.as_superuser();
do $$ begin
  perform t.assert((select count(*) from public.purchase_orders where created_by = approved_by and created_by = t.id('M')) >= 1, 'documented: owner/manager may currently approve an order they created themselves (open decision)');
end $$;

-- ---------------------------------------------------------------------------
-- I. security: internal helpers, service_role, grants
-- ---------------------------------------------------------------------------
select t.as_user('M');
do $$ begin
  perform t.expect_denied(format($q$select public.procurement_write_lines(%L, %L, %L, '[]'::jsonb)$q$, t.id('PO1'), t.id('BR'), t.id('SUP1')), 'internal line writer is not executable by users');
  perform t.expect_denied(format($q$select public.procurement_order_brief(%L)$q$, t.id('PO1')), 'internal order brief is not executable by users');
  perform t.assert(public.procurement_transition_allowed('DRAFT', 'SUBMITTED') and not public.procurement_transition_allowed('RECEIVED', 'DRAFT') and not public.procurement_transition_allowed('CANCELLED', 'DRAFT'), 'the state machine has no way out of RECEIVED or CANCELLED');
end $$;
select t.as_superuser();
select t.id('PO1') as po1 \gset
select t.id('BR') as br \gset
select t.id('SUP1') as sup1 \gset
set local role service_role;
select public.procurement_order_brief(:'po1'::uuid) is not null as ok \gset service_
reset role;
do $$ begin perform t.assert(true, 'service_role may execute the internal helpers'); end $$;
do $$ begin
  perform t.assert(not exists (select 1 from information_schema.routine_privileges where routine_schema = 'public' and grantee = 'PUBLIC' and privilege_type = 'EXECUTE'
                                and routine_name in ('upsert_supplier','set_supplier_active','upsert_item_supply_params','create_purchase_order','replace_purchase_order_lines',
                                  'update_purchase_order_header','transition_purchase_order','receive_purchase_order','get_purchase_order','list_purchase_orders',
                                  'get_order_suggestions','get_procurement_attention','procurement_write_lines','procurement_order_brief')), 'no procurement function is executable by PUBLIC');
  perform t.assert(not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('upsert_supplier','create_purchase_order','receive_purchase_order','transition_purchase_order')
                                and (p.prosecdef is not true or p.proconfig is null or not (p.proconfig::text like '%search_path=public%'))), 'security definer functions have a locked search_path');
end $$;

do $$ declare n integer; begin
  select c.n into n from t.counter c;
  raise notice 'ALL PROCUREMENT ASSERTIONS PASSED (% assertions)', n;
end $$;
rollback;
