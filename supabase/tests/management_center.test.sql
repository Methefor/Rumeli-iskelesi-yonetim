-- =============================================================================
-- management_center.test.sql (016) - real Postgres role/RPC assertions
-- =============================================================================
-- LOCAL / DISPOSABLE DB ONLY, migrations 001-016 applied. One transaction,
-- ROLLBACK at the end.
--   psql ... -v ON_ERROR_STOP=1 -f supabase/tests/management_center.test.sql
-- =============================================================================
begin;
create schema tm;
grant usage on schema tm to anon, authenticated, service_role;
create table tm.ctx (k text primary key, v uuid not null);
grant select on tm.ctx to anon, authenticated, service_role;
create function tm.id(p text) returns uuid language sql stable as $$ select v from tm.ctx where k = p $$;
create function tm.assert(c boolean, l text) returns void language plpgsql as $$
begin if c is not true then raise exception 'TEST FAILED [%]', l; end if; end $$;
create function tm.denied(p_sql text, l text, p_state text default null) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if p_state is null or sqlstate = p_state then return; end if;
    raise exception 'TEST FAILED [%]: expected % got % (%)', l, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: succeeded but must fail', l;
end $$;
create function tm.ok(p_sql text, l text) returns void language plpgsql as $$
begin execute p_sql;
exception when others then raise exception 'TEST FAILED [%]: unexpected % (%)', l, sqlstate, sqlerrm;
end $$;
create function tm.as_user(p text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', tm.id(p)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function tm.as_super() returns void language plpgsql as $$ begin execute 'reset role'; end $$;

insert into tm.ctx values
  ('O','00000000-0000-0000-0000-0000000000c1'), ('O2','00000000-0000-0000-0000-0000000000c2'),
  ('M','00000000-0000-0000-0000-0000000000c3'), ('M2','00000000-0000-0000-0000-0000000000c4'),
  ('BM','00000000-0000-0000-0000-0000000000c5'), ('BM2','00000000-0000-0000-0000-0000000000c6'),
  ('K','00000000-0000-0000-0000-0000000000c7'), ('E','00000000-0000-0000-0000-0000000000c8'),
  ('E2','00000000-0000-0000-0000-0000000000c9'), ('V','00000000-0000-0000-0000-0000000000ca'),
  ('NEW','00000000-0000-0000-0000-0000000000cb'), ('NEW2','00000000-0000-0000-0000-0000000000cc'),
  ('NEW3','00000000-0000-0000-0000-0000000000cd');
insert into tm.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into tm.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';
insert into auth.users (id, email) select v, lower(k) || '@mgmt-test.invalid' from tm.ctx where k not in ('BR','BD');
insert into public.profiles (id, full_name, employee_code) values
  (tm.id('O'),'Owner','T801'),(tm.id('O2'),'Owner 2','T802'),(tm.id('M'),'Manager','T803'),(tm.id('M2'),'Manager 2','T804'),
  (tm.id('BM'),'BM Dondurma','T805'),(tm.id('BM2'),'BM Rumeli','T806'),(tm.id('K'),'Cashier','T807'),
  (tm.id('E'),'Employee','T808'),(tm.id('E2'),'Employee Rumeli','T809'),(tm.id('V'),'Viewer','T810');
insert into public.user_roles (user_id, role_id)
select tm.id(x.k), r.id from (values ('O','owner'),('O2','owner'),('M','manager'),('M2','manager'),('BM','branch_manager'),
  ('BM2','branch_manager'),('K','cashier'),('E','employee'),('E2','employee'),('V','viewer')) x(k, rk)
join public.roles r on r.key = x.rk;
insert into public.branch_memberships (user_id, branch_id) values
  (tm.id('BM'),tm.id('BD')),(tm.id('K'),tm.id('BD')),(tm.id('E'),tm.id('BD')),
  (tm.id('BM2'),tm.id('BR')),(tm.id('E2'),tm.id('BR')),(tm.id('V'),tm.id('BR'));
insert into public.pin_credentials (user_id, pin_hash)
select id, extensions.crypt('1111', extensions.gen_salt('bf')) from public.profiles where employee_code like 'T8%';

-- A. cashier / employee / viewer are denied EVERY management action
select tm.as_user('K');
select tm.denied($q$select public.assign_role(tm.id('E'),'employee','r')$q$, 'cashier assign_role', '42501');
select tm.denied($q$select public.revoke_role(tm.id('E'),'employee','r')$q$, 'cashier revoke_role', '42501');
select tm.denied($q$select public.assign_branch_membership(tm.id('E'),tm.id('BD'),false,'r')$q$, 'cashier add branch', '42501');
select tm.denied($q$select public.remove_branch_membership(tm.id('E'),tm.id('BD'),'r')$q$, 'cashier remove branch', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('E'),false,'r')$q$, 'cashier deactivate', '42501');
select tm.denied($q$select public.admin_set_employee_code(tm.id('E'),'T999','r')$q$, 'cashier set code', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('E'),'9999','r')$q$, 'cashier reset pin', '42501');
select tm.as_user('E');
select tm.denied($q$select public.admin_reset_pin(tm.id('K'),'9999','r')$q$, 'employee reset pin', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'manager','r')$q$, 'employee self-promote', '42501');
select tm.as_user('V');
select tm.denied($q$select public.admin_set_employee_active(tm.id('E'),false,'r')$q$, 'viewer deactivate', '42501');

-- B. self-modification and escalation
select tm.as_user('M');
select tm.denied($q$select public.assign_role(tm.id('M'),'owner','r')$q$, 'manager self-promote to owner', '42501');
select tm.denied($q$select public.assign_role(tm.id('M'),'branch_manager','r')$q$, 'manager cannot edit own roles at all', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('M'),false,'r')$q$, 'manager self-deactivate', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('M'),'9999','r')$q$, 'manager self PIN reset via admin RPC', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'owner','r')$q$, 'manager cannot grant owner', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'manager','r')$q$, 'manager cannot grant manager', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'branch_manager','')$q$, 'reason mandatory (blank)', '22023');
select tm.denied($q$select public.assign_role(tm.id('E'),'branch_manager',null)$q$, 'reason mandatory (null)', '22023');
-- protected higher/equal rank targets
select tm.denied($q$select public.admin_reset_pin(tm.id('O'),'9999','takeover')$q$, 'manager cannot reset an owner PIN', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('O'),false,'x')$q$, 'manager cannot deactivate an owner', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('M2'),'9999','x')$q$, 'manager cannot touch another manager', '42501');
select tm.denied($q$select public.revoke_role(tm.id('O'),'owner','x')$q$, 'manager cannot revoke owner', '42501');
select tm.denied($q$select public.admin_set_employee_code(tm.id('M2'),'T998','x')$q$, 'manager cannot change another manager code', '42501');
select tm.as_user('O');
select tm.denied($q$select public.admin_reset_pin(tm.id('O2'),'9999','x')$q$, 'owner cannot reset another owner PIN (owners protected)', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('O2'),false,'x')$q$, 'owner cannot deactivate another owner', '42501');
select tm.denied($q$select public.revoke_role(tm.id('O2'),'owner','x')$q$, 'owner cannot demote another owner', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('O'),false,'x')$q$, 'owner cannot deactivate self', '42501');
select tm.denied($q$select public.revoke_role(tm.id('O'),'owner','x')$q$, 'owner cannot revoke own owner role', '42501');

-- C. branch_manager: shared-branch and sub-role limits only
select tm.as_user('BM');
select tm.ok($q$select public.admin_reset_pin(tm.id('K'),'2222','forgot')$q$, 'BM resets PIN of own-branch cashier');
select tm.ok($q$select public.assign_role(tm.id('E'),'cashier','promoted')$q$, 'BM assigns cashier to own-branch employee');
select tm.denied($q$select public.assign_role(tm.id('E'),'branch_manager','x')$q$, 'BM cannot grant branch_manager', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'manager','x')$q$, 'BM cannot grant manager', '42501');
select tm.denied($q$select public.assign_role(tm.id('E'),'owner','x')$q$, 'BM cannot grant owner', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('E2'),'2222','x')$q$, 'BM cannot reset PIN across branches', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('E2'),false,'x')$q$, 'BM cannot deactivate across branches', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('M'),'2222','x')$q$, 'BM cannot reset a manager PIN', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('O'),'2222','x')$q$, 'BM cannot reset an owner PIN', '42501');
select tm.denied($q$select public.admin_set_employee_active(tm.id('BM2'),false,'x')$q$, 'BM cannot deactivate another branch_manager', '42501');
select tm.denied($q$select public.admin_set_employee_code(tm.id('K'),'T997','x')$q$, 'BM cannot change employee codes (org-wide only)', '42501');
select tm.ok($q$select public.assign_branch_membership(tm.id('K'),tm.id('BD'),false,'shift cover')$q$, 'BM adds own-branch member (idempotent)');
select tm.denied($q$select public.assign_branch_membership(tm.id('K'),tm.id('BR'),false,'x')$q$, 'BM cannot add a member to a branch they do not belong to', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('BM'),'2222','x')$q$, 'BM cannot reset own PIN via admin RPC', '42501');

-- D. manager / owner may do their allowed work, all audited
select tm.as_user('M');
select tm.ok($q$select public.assign_role(tm.id('E'),'branch_manager','coverage')$q$, 'manager grants branch_manager');
select tm.ok($q$select public.revoke_role(tm.id('E'),'branch_manager','coverage over')$q$, 'manager revokes branch_manager');
select tm.ok($q$select public.assign_branch_membership(tm.id('E'),tm.id('BR'),false,'moves')$q$, 'manager adds branch');
select tm.ok($q$select public.remove_branch_membership(tm.id('E'),tm.id('BR'),'moved back')$q$, 'manager removes branch');
select tm.ok($q$select public.admin_set_employee_code(tm.id('E'),'t811','renumber')$q$, 'manager changes code (normalized to upper case)');
select tm.denied($q$select public.admin_set_employee_code(tm.id('E'),'T803','dup')$q$, 'duplicate employee_code rejected', '23505');
select tm.denied($q$select public.admin_reset_pin(tm.id('E'),'12','x')$q$, 'PIN format enforced', '22023');
select tm.ok($q$select public.admin_reset_pin(tm.id('E'),'3333','forgot')$q$, 'manager resets a PIN');
select tm.as_user('O');
select tm.ok($q$select public.assign_role(tm.id('E2'),'manager','trusted')$q$, 'owner grants manager');
select tm.denied($q$select public.assign_role(tm.id('V'),'owner','handover')$q$, 'owner cannot grant an equal owner role', '42501');
select tm.as_super();
select tm.assert((select crypt_ok from (select p.pin_hash = extensions.crypt('3333', p.pin_hash) as crypt_ok from public.pin_credentials p where user_id = tm.id('E')) s), 'new PIN verifies');
select tm.assert((select not (p.pin_hash = extensions.crypt('1111', p.pin_hash)) from public.pin_credentials p where user_id = tm.id('E')), 'OLD PIN no longer valid after reset');
select tm.assert((select failed_attempts = 0 and locked_until is null from public.pin_credentials where user_id = tm.id('K')), 'reset clears lockout state');
select tm.assert((select count(*) from public.audit_logs where action = 'pin_reset' and actor_user_id = tm.id('M') and reason = 'forgot' and entity_id = tm.id('E')::text and created_at is not null) = 1, 'pin_reset audited: actor, reason, time (no PIN stored)');
select tm.assert((select not exists (select 1 from public.audit_logs where new_values::text like '%3333%' or old_values::text like '%3333%' or reason like '%3333%')), 'no PIN value appears anywhere in audit_logs');
select tm.assert((select (old_values -> 'roles') @> '["employee"]'::jsonb and not ((old_values -> 'roles') @> '["branch_manager"]'::jsonb) and (new_values -> 'roles') @> '["branch_manager"]'::jsonb and new_values ->> 'granted' = 'branch_manager' from public.audit_logs where action = 'role_change' and reason = 'coverage'), 'role_change audit has before/after');
select tm.assert((select old_values ->> 'employee_code' = 'T808' and new_values ->> 'employee_code' = 'T811' from public.audit_logs where action = 'employee_code_change'), 'employee_code_change audit has before/after');

-- E. deactivation: server-side block for an already-issued identity
select tm.as_user('M');
select tm.ok($q$select public.admin_set_employee_active(tm.id('K'),false,'left the company')$q$, 'manager deactivates cashier');
select tm.as_super();
select tm.assert((select banned_until is not null from auth.users where id = tm.id('K')), 'auth user banned so refresh/login stop too');
select tm.assert((select is_active = false from public.profiles where id = tm.id('K')), 'profile inactive');
select tm.assert((select old_values ->> 'is_active' = 'true' and new_values ->> 'is_active' = 'false' from public.audit_logs where action = 'employee_deactivation' and entity_id = tm.id('K')::text), 'deactivation audited with before/after');
select tm.as_user('K');
select tm.assert(public.current_user_is_active() = false, 'inactive: is_active helper false');
select tm.assert(not public.current_user_has_permission('inventory.read'), 'inactive: no permissions');
select tm.assert((select count(*) from public.current_user_role_keys()) = 0, 'inactive: no roles');
select tm.assert((select count(*) from public.current_user_branch_ids()) = 0, 'inactive: no branches');
select tm.assert((select count(*) from public.inventory_items) = 0 and (select count(*) from public.shifts) = 0, 'inactive: policies deny table reads');
select tm.denied($q$select public.enforce_active_user()$q$, 'pre-request hook rejects an inactive user', '42501');
select tm.denied($q$select public.admin_reset_pin(tm.id('E'),'4444','x')$q$, 'inactive user cannot act even if they had a role', '42501');
select tm.as_user('BM');
select tm.assert((select count(*) from public.profiles where id = tm.id('K') and is_active) = 0, 'sanity: profile flag visible as inactive');
select tm.as_user('M');
select tm.ok($q$select public.admin_set_employee_active(tm.id('K'),true,'returned')$q$, 'manager reactivates');
select tm.as_super();
select tm.assert((select banned_until is null from auth.users where id = tm.id('K')), 'reactivation lifts the ban');
-- an inactive OWNER/manager gets nothing either
update public.profiles set is_active = false where id = tm.id('M2');
select tm.as_user('M2');
select tm.assert(not public.current_user_is_owner_or_manager(), 'inactive manager is not org-wide any more');
select tm.denied($q$select public.enforce_active_user()$q$, 'hook rejects an inactive manager', '42501');
select tm.as_super();
update public.profiles set is_active = true where id = tm.id('M2');

-- F. last active owner
select tm.as_super();
update public.profiles set is_active = false where id in (tm.id('O2'), tm.id('V'));
select tm.denied($q$select public.admin_guard_last_owner(tm.id('O'))$q$, 'last active owner guard fires', '42501');
update public.profiles set is_active = true where id in (tm.id('O2'), tm.id('V'));
select tm.ok($q$select public.admin_guard_last_owner(tm.id('O'))$q$, 'guard passes while another active owner exists');

-- G. raw writes cannot bypass the RPCs (even for owner)
select tm.as_user('O');
select tm.denied($q$update public.profiles set is_active = false where id = tm.id('E')$q$, 'raw is_active update denied');
select tm.denied($q$update public.profiles set employee_code = 'T000' where id = tm.id('E')$q$, 'raw employee_code update denied');
select tm.denied($q$insert into public.user_roles (user_id, role_id) select tm.id('E'), id from public.roles where key = 'owner'$q$, 'raw role insert denied');
select tm.ok($q$delete from public.user_roles where user_id = tm.id('M')$q$, 'raw role delete is a silent no-op under RLS (no DELETE policy)');
select tm.as_super();
select tm.assert((select count(*) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = tm.id('M') and r.key = 'manager') = 1, 'raw role delete removed nothing');
select tm.as_user('O');
select tm.denied($q$insert into public.branch_memberships (user_id, branch_id) values (tm.id('E'), tm.id('BR'))$q$, 'raw membership insert denied');
select tm.assert((select count(*) from public.pin_credentials) = 0, 'pin_credentials exposes zero rows even to an owner');
select tm.denied($q$update public.shift_definitions set cutoff_hour = 0$q$, 'raw shift_definitions update denied');
select tm.denied($q$update public.reconciliation_thresholds set warning_percentage = 99$q$, 'raw thresholds update denied');
select tm.denied($q$select public.internal_provision_employee(tm.id('O'), tm.id('NEW'), 'T820', 'X', '1234', 'employee', '{}', 'r')$q$, 'internal provisioning not callable by clients', '42501');
select tm.denied($q$select public.internal_actor_rank(tm.id('O'))$q$, 'internal_actor_rank not callable by clients', '42501');
select tm.denied($q$select public.user_rank(tm.id('O'))$q$, 'user_rank not callable by clients', '42501');

-- H. audited settings
select tm.as_super();
insert into tm.ctx select 'SD', id from public.shift_definitions where branch_id = tm.id('BD') and key = 'morning';
insert into tm.ctx select 'SDR', id from public.shift_definitions where branch_id = tm.id('BR') and key = 'morning';
select tm.as_user('M');
select tm.ok($q$select public.admin_update_shift_definition(tm.id('SD'),'Sabah 2',8::smallint,0::smallint,16::smallint,0::smallint,17::smallint,0::smallint,0::smallint,true,'new cutoff')$q$, 'manager updates a shift definition');
select tm.ok($q$select public.admin_set_reconciliation_thresholds(tm.id('BD'),3,6,'seasonal')$q$, 'manager updates thresholds');
select tm.denied($q$select public.admin_set_reconciliation_thresholds(tm.id('BD'),7,6,'bad')$q$, 'warning > error rejected', '22023');
select tm.denied($q$select public.admin_set_reconciliation_thresholds(tm.id('BD'),3,6,'')$q$, 'settings reason mandatory', '22023');
select tm.as_user('BM');
select tm.ok($q$select public.admin_update_shift_definition(tm.id('SD'),'Sabah 3',8::smallint,0::smallint,16::smallint,0::smallint,17::smallint,0::smallint,0::smallint,true,'own branch')$q$, 'BM edits own-branch shift definition');
select tm.denied($q$select public.admin_update_shift_definition(tm.id('SDR'),'x',8::smallint,0::smallint,16::smallint,0::smallint,17::smallint,0::smallint,0::smallint,true,'other branch')$q$, 'BM cannot edit another branch', '42501');
select tm.denied($q$select public.admin_set_reconciliation_thresholds(tm.id('BD'),1,2,'x')$q$, 'BM cannot change thresholds', '42501');
select tm.as_user('E');
select tm.denied($q$select public.admin_update_shift_definition(tm.id('SD'),'x',8::smallint,0::smallint,16::smallint,0::smallint,17::smallint,0::smallint,0::smallint,true,'x')$q$, 'employee cannot edit shift definitions', '42501');
select tm.as_super();
select tm.assert((select old_values ->> 'name' = 'Sabah' and new_values ->> 'name' = 'Sabah 2' and reason = 'new cutoff' and actor_user_id = tm.id('M') from public.audit_logs where action = 'shift_definition_change' and reason = 'new cutoff'), 'shift definition audit: before/after/reason/actor');
select tm.assert((select (old_values ->> 'warning_percentage')::numeric = 2 and (new_values ->> 'warning_percentage')::numeric = 3 from public.audit_logs where action = 'reconciliation_threshold_change'), 'threshold audit before/after');

-- I. provisioning (service_role only)
select tm.as_super();
set local role service_role;
select tm.ok($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW'), 't820', ' Yeni Kişi ', '4321', 'cashier', array[tm.id('BD')], 'new hire')$q$, 'manager provisions a cashier');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW2'), 'T821', 'X', '4321', 'manager', '{}', 'r')$q$, 'manager cannot provision a manager', '42501');
select tm.denied($q$select public.internal_provision_employee(tm.id('BM'), tm.id('NEW2'), 'T821', 'X', '4321', 'cashier', array[tm.id('BR')], 'r')$q$, 'BM cannot provision into another branch', '42501');
select tm.denied($q$select public.internal_provision_employee(tm.id('BM'), tm.id('NEW2'), 'T821', 'X', '4321', 'branch_manager', array[tm.id('BD')], 'r')$q$, 'BM cannot provision a branch_manager', '42501');
select tm.denied($q$select public.internal_provision_employee(tm.id('E'), tm.id('NEW2'), 'T821', 'X', '4321', 'employee', array[tm.id('BD')], 'r')$q$, 'employee actor cannot provision', '42501');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW2'), 'T820', 'X', '4321', 'employee', array[tm.id('BD')], 'r')$q$, 'duplicate code -> 23505', '23505');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW2'), 'T821', 'X', '12', 'employee', array[tm.id('BD')], 'r')$q$, 'bad PIN rejected', '22023');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW2'), 'T821', 'X', '4321', 'employee', '{}', 'r')$q$, 'branch required for non org-wide roles', '22023');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW2'), 'T821', 'X', '4321', 'employee', array[tm.id('BD')], '  ')$q$, 'reason required', '22023');
select tm.denied($q$select public.internal_provision_employee(tm.id('M'), tm.id('NEW'), 'T822', 'X', '4321', 'employee', array[tm.id('BD')], 'r')$q$, 'existing profile id rejected', '22023');
select tm.denied($q$select public.internal_provision_employee(tm.id('O'), tm.id('NEW2'), 'T824', 'Yeni Sahip', '4321', 'owner', '{}', 'hire')$q$, 'owner cannot provision another owner', '42501');
select tm.ok($q$select public.internal_provision_employee(tm.id('O'), tm.id('NEW3'), 'T823', 'Yeni Yönetici', '4321', 'manager', '{}', 'hire')$q$, 'owner provisions a manager without branches');
reset role;
select tm.assert((select employee_code = 'T820' and full_name = 'Yeni Kişi' and is_active from public.profiles where id = tm.id('NEW')), 'profile created, code normalized, name trimmed');
select tm.assert((select count(*) from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = tm.id('NEW') and r.key = 'cashier' and ur.granted_by = tm.id('M')) = 1, 'role granted by the verified actor');
select tm.assert((select count(*) from public.branch_memberships where user_id = tm.id('NEW') and branch_id = tm.id('BD') and is_primary) = 1, 'branch membership created');
select tm.assert((select p.pin_hash = extensions.crypt('4321', p.pin_hash) from public.pin_credentials p where user_id = tm.id('NEW')), 'PIN stored hashed and verifies');
select tm.assert((select count(*) from public.audit_logs where action = 'employee_create' and actor_user_id = tm.id('M') and entity_id = tm.id('NEW')::text and reason = 'new hire') = 1, 'employee_create audited with actor + reason');
select tm.assert((select not exists (select 1 from public.audit_logs where new_values::text like '%4321%')), 'provisioning audit never contains the PIN');
select tm.assert((select count(*) from public.profiles where id = tm.id('NEW2')) = 0, 'failed provisioning attempts left no profile behind (atomic)');

do $$ begin raise notice 'ALL MANAGEMENT CENTER ASSERTIONS PASSED'; end $$;
rollback;
