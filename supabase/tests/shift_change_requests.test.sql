-- Local/disposable database only. Exercises real authenticated role + RLS/RPC rules.
begin;
set local timezone = 'UTC';

create schema shift_test;
grant usage on schema shift_test to anon, authenticated;
create table shift_test.ctx (k text primary key, v uuid not null);
grant select on shift_test.ctx to anon, authenticated;

create function shift_test.id(p_key text) returns uuid language sql stable as $$
  select v from shift_test.ctx where k = p_key
$$;
create function shift_test.assert(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST FAILED [%]', p_label;
  end if;
end $$;
create function shift_test.expect_denied(
  p_sql text, p_label text, p_state text default '42501'
) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'TEST FAILED [%]: expected %, got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: statement unexpectedly succeeded', p_label;
end $$;
create function shift_test.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', shift_test.id(p_key)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function shift_test.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claim.role', 'anon', true);
  execute 'set local role anon';
end $$;
create function shift_test.as_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

insert into shift_test.ctx (k, v) values
  ('M',   '00000000-0000-0000-0000-0000000000b1'),
  ('BMR', '00000000-0000-0000-0000-0000000000b2'),
  ('BMD', '00000000-0000-0000-0000-0000000000b3'),
  ('K',   '00000000-0000-0000-0000-0000000000b4'),
  ('E',   '00000000-0000-0000-0000-0000000000b5');
insert into shift_test.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into shift_test.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';

insert into auth.users (id, email)
select v, lower(k) || '@shift-request-test.invalid'
from shift_test.ctx where k in ('M','BMR','BMD','K','E');
insert into public.profiles (id, full_name, employee_code) values
  (shift_test.id('M'), 'Test Manager', 'S901'),
  (shift_test.id('BMR'), 'Test Rumeli Manager', 'S902'),
  (shift_test.id('BMD'), 'Test Dondurma Manager', 'S903'),
  (shift_test.id('K'), 'Test Cashier', 'S904'),
  (shift_test.id('E'), 'Test Employee', 'S905');
insert into public.user_roles (user_id, role_id)
select shift_test.id(x.k), r.id
from (values
  ('M','manager'), ('BMR','branch_manager'), ('BMD','branch_manager'),
  ('K','cashier'), ('E','employee')
) as x(k, role_key)
join public.roles r on r.key = x.role_key;
insert into public.branch_memberships (user_id, branch_id) values
  (shift_test.id('BMR'), shift_test.id('BR')),
  (shift_test.id('BMD'), shift_test.id('BD')),
  (shift_test.id('K'), shift_test.id('BR')),
  (shift_test.id('E'), shift_test.id('BD'));

insert into public.shifts (branch_id, shift_definition_id, business_date)
select shift_test.id('BR'), id, (timezone('Europe/Istanbul', now()))::date + 90
from public.shift_definitions where branch_id = shift_test.id('BR') and key = 'morning';
insert into shift_test.ctx
select 'K_CURRENT', s.id from public.shifts s
join public.shift_definitions d on d.id = s.shift_definition_id
where s.branch_id = shift_test.id('BR')
  and s.business_date = (timezone('Europe/Istanbul', now()))::date + 90
  and d.key = 'morning';

insert into public.shifts (branch_id, shift_definition_id, business_date)
select shift_test.id('BR'), id, (timezone('Europe/Istanbul', now()))::date + 90
from public.shift_definitions where branch_id = shift_test.id('BR') and key = 'evening';
insert into shift_test.ctx
select 'K_TARGET', s.id from public.shifts s
join public.shift_definitions d on d.id = s.shift_definition_id
where s.branch_id = shift_test.id('BR')
  and s.business_date = (timezone('Europe/Istanbul', now()))::date + 90
  and d.key = 'evening';

insert into public.shifts (branch_id, shift_definition_id, business_date)
select shift_test.id('BD'), id, (timezone('Europe/Istanbul', now()))::date + 90
from public.shift_definitions where branch_id = shift_test.id('BD') and key = 'morning';
insert into shift_test.ctx
select 'E_CURRENT', s.id from public.shifts s
join public.shift_definitions d on d.id = s.shift_definition_id
where s.branch_id = shift_test.id('BD')
  and s.business_date = (timezone('Europe/Istanbul', now()))::date + 90
  and d.key = 'morning';

insert into public.shifts (branch_id, shift_definition_id, business_date)
select shift_test.id('BD'), id, (timezone('Europe/Istanbul', now()))::date + 90
from public.shift_definitions where branch_id = shift_test.id('BD') and key = 'evening';
insert into shift_test.ctx
select 'E_TARGET', s.id from public.shifts s
join public.shift_definitions d on d.id = s.shift_definition_id
where s.branch_id = shift_test.id('BD')
  and s.business_date = (timezone('Europe/Istanbul', now()))::date + 90
  and d.key = 'evening';

insert into public.shift_assignments (shift_id, user_id) values
  (shift_test.id('K_CURRENT'), shift_test.id('K')),
  (shift_test.id('E_CURRENT'), shift_test.id('E'));
insert into shift_test.ctx
select 'K_ASSIGN', id from public.shift_assignments
where shift_id = shift_test.id('K_CURRENT') and user_id = shift_test.id('K');
insert into shift_test.ctx
select 'E_ASSIGN', id from public.shift_assignments
where shift_id = shift_test.id('E_CURRENT') and user_id = shift_test.id('E');

select shift_test.as_anon();
select shift_test.expect_denied(
  $$select public.create_shift_change_request(
    shift_test.id('K_ASSIGN'), shift_test.id('K_TARGET'), 'anonymous request'
  )$$,
  'anonymous cannot create a request'
);
select shift_test.expect_denied(
  'select * from public.shift_change_requests',
  'anonymous cannot read requests'
);

select shift_test.as_user('K');
select shift_test.expect_denied(
  $$select public.create_shift_change_request(
    shift_test.id('K_ASSIGN'), shift_test.id('K_TARGET'), 'x'
  )$$,
  'reason is mandatory and length checked',
  '22023'
);
select shift_test.expect_denied(
  $$select public.create_shift_change_request(
    shift_test.id('K_ASSIGN'), shift_test.id('E_TARGET'), 'wrong branch request'
  )$$,
  'cashier cannot request a shift in another branch',
  '22023'
);
select public.create_shift_change_request(
  shift_test.id('K_ASSIGN'), shift_test.id('K_TARGET'), 'Aile randevum nedeniyle değişiklik istiyorum.'
);
select shift_test.as_superuser();
insert into shift_test.ctx
select 'K_REQUEST', id from public.shift_change_requests
where requester_user_id = shift_test.id('K') and status = 'pending';

select shift_test.as_user('K');
select shift_test.assert(
  (select count(*) from public.shift_change_requests where id = shift_test.id('K_REQUEST')) = 1,
  'cashier reads own request'
);
select shift_test.expect_denied(
  $$insert into public.shift_change_requests (
    requester_user_id, current_assignment_id, requested_shift_id, reason
  ) values (
    shift_test.id('K'), shift_test.id('K_ASSIGN'), shift_test.id('K_TARGET'), 'direct insert'
  )$$,
  'direct insert is denied'
);
select shift_test.expect_denied(
  $$select public.create_shift_change_request(
    shift_test.id('K_ASSIGN'), shift_test.id('K_TARGET'), 'duplicate pending request'
  )$$,
  'only one pending request per assignment',
  '23505'
);
select shift_test.expect_denied(
  $$select public.decide_shift_change_request(
    shift_test.id('K_REQUEST'), 'approved', null
  )$$,
  'cashier cannot decide a request'
);

select shift_test.as_user('BMD');
select shift_test.assert(
  (select count(*) from public.shift_change_requests where id = shift_test.id('K_REQUEST')) = 0,
  'unrelated branch manager cannot read request'
);
select shift_test.expect_denied(
  $$select public.decide_shift_change_request(
    shift_test.id('K_REQUEST'), 'approved', null
  )$$,
  'unrelated branch manager cannot approve request'
);

select shift_test.as_user('BMR');
select shift_test.assert(
  (select count(*) from public.shift_change_requests where id = shift_test.id('K_REQUEST')) = 1,
  'own-branch manager sees pending request'
);
select public.decide_shift_change_request(
  shift_test.id('K_REQUEST'), 'approved', 'Vardiya dengesi uygun.'
);
select shift_test.as_superuser();
select shift_test.assert(
  (select status from public.shift_assignments where id = shift_test.id('K_ASSIGN')) = 'cancelled',
  'approval cancels the old assignment'
);
select shift_test.assert(
  (select count(*) from public.shift_assignments
   where shift_id = shift_test.id('K_TARGET')
     and user_id = shift_test.id('K')
     and status = 'assigned') = 1,
  'approval creates the requested assignment'
);
select shift_test.assert(
  (select status from public.shift_change_requests where id = shift_test.id('K_REQUEST')) = 'approved',
  'request status becomes approved'
);

select shift_test.as_user('E');
select public.create_shift_change_request(
  shift_test.id('E_ASSIGN'), shift_test.id('E_TARGET'), 'Çocuğumun okul toplantısı bulunuyor.'
);
select shift_test.as_superuser();
insert into shift_test.ctx
select 'E_REQUEST', id from public.shift_change_requests
where requester_user_id = shift_test.id('E') and status = 'pending';
update public.shifts
set business_date = (timezone('Europe/Istanbul', now()))::date - 1
where id in (shift_test.id('E_CURRENT'), shift_test.id('E_TARGET'));

select shift_test.as_user('M');
select shift_test.expect_denied(
  $$select public.decide_shift_change_request(
    shift_test.id('E_REQUEST'), 'approved', 'Geç onay denemesi.'
  )$$,
  'a request cannot be approved after its shifts become past',
  '22023'
);
select shift_test.expect_denied(
  $$select public.decide_shift_change_request(
    shift_test.id('E_REQUEST'), 'rejected', ''
  )$$,
  'rejection note is mandatory',
  '22023'
);
select public.decide_shift_change_request(
  shift_test.id('E_REQUEST'), 'rejected', 'O gün personel sayısı yetersiz.'
);
select shift_test.as_superuser();
select shift_test.assert(
  (select status from public.shift_assignments where id = shift_test.id('E_ASSIGN')) <> 'cancelled',
  'rejection keeps current assignment'
);
select shift_test.assert(
  (select decision_note from public.shift_change_requests where id = shift_test.id('E_REQUEST')) =
    'O gün personel sayısı yetersiz.',
  'rejection note is preserved'
);
select shift_test.assert(
  (select count(*) from public.audit_logs
   where action = 'shift_change_request_created'
     and entity_id in (shift_test.id('K_REQUEST')::text, shift_test.id('E_REQUEST')::text)) = 2,
  'both requests are audited'
);
select shift_test.assert(
  (select count(*) from public.audit_logs
   where action = 'shift_change_request_decided'
     and entity_id in (shift_test.id('K_REQUEST')::text, shift_test.id('E_REQUEST')::text)) = 2,
  'both decisions are audited'
);

do $$ begin raise notice 'ALL SHIFT CHANGE REQUEST ASSERTIONS PASSED'; end $$;
rollback;
