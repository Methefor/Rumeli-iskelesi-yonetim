-- =============================================================================
-- backdated_entry.test.sql  (015 — DB-level backdated-entry policy assertions)
-- =============================================================================
-- RUN ONLY AGAINST A LOCAL / DISPOSABLE DATABASE that has migrations 001-015
-- applied. NEVER run against a hosted project. One transaction, ROLLBACK at
-- the end — no rows survive.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/backdated_entry.test.sql
--
-- Design note on WHY create_sales_report cases below mostly use owner/manager
-- (who bypass the pre-existing SAME-DAY cutoff), not a plain cashier: the
-- 'evening' shift_definition's cutoff is business_date + 1 day at 01:00
-- Istanbul; cutoff_day_offset can only be 0 or 1 (a table CHECK constraint),
-- so ANY shift more than ~1-2 days old already has its cutoff in the past —
-- a plain cashier is already blocked by that PRE-EXISTING rule for -2/-3/-4
-- days, before the NEW 015 calendar-window rule is even reached. That old
-- rule is untouched and still correct; it just means the interesting new
-- behaviour for CREATE is specifically: (a) a FUTURE date is now blocked for
-- EVERYONE including owner/manager (previously not blocked by the cutoff
-- check at all, since a future cutoff hasn't "passed" yet), and (b) a
-- privileged-for-cutoff-but-not-for-backdating role (branch_manager via
-- sales.edit_all) is newly blocked past 3 days by 015 specifically.
-- edit_sales_report has NO same-day cutoff at all, so it exercises the new
-- 015 rule cleanly for every role — used below (section B) for the full
-- 0/-1/-2/-3/-4 day matrix per role.
--
-- Every shift below that a test EXPECTS TO SUCCEED is unique to that one
-- test (the (shift_id, report_type) uniqueness constraint means a shift can
-- carry at most one X and one Z report, ever — reusing a "success" shift
-- across two different tests would make the second one fail for the wrong
-- reason). A shift used only for DENIED attempts is safe to share, since a
-- denied call never inserts a row.
-- =============================================================================

begin;
set local timezone = 'Europe/Istanbul';

create schema tb;
grant usage on schema tb to anon, authenticated;
create table tb.ctx (k text primary key, v uuid not null);
grant select on tb.ctx to anon, authenticated;
create function tb.id(p_key text) returns uuid language sql stable as $$
  select v from tb.ctx where k = p_key
$$;
create function tb.assert(p_cond boolean, p_label text) returns void language plpgsql as $$
begin
  if p_cond is not true then
    raise exception 'TEST FAILED [%]: assertion is not true', p_label;
  end if;
end $$;
create function tb.expect_denied(p_sql text, p_label text, p_state text default null) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if p_state is null or sqlstate = p_state then return; end if;
    raise exception 'TEST FAILED [%]: expected SQLSTATE % but got % (%)', p_label, p_state, sqlstate, sqlerrm;
  end;
  raise exception 'TEST FAILED [%]: statement succeeded but should have failed', p_label;
end $$;
create function tb.expect_ok(p_sql text, p_label text) returns void language plpgsql as $$
begin
  execute p_sql;
exception when others then
  raise exception 'TEST FAILED [%]: unexpected error % (%)', p_label, sqlstate, sqlerrm;
end $$;
create function tb.as_user(p_key text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', tb.id(p_key)::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  execute 'set local role authenticated';
end $$;
create function tb.as_superuser() returns void language plpgsql as $$
begin
  execute 'reset role';
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures: users, branches, a generous shift_definition per branch.
-- ---------------------------------------------------------------------------
insert into tb.ctx (k, v) values
  ('O',  '00000000-0000-0000-0000-0000000000b1'),
  ('M',  '00000000-0000-0000-0000-0000000000b2'),
  ('BM', '00000000-0000-0000-0000-0000000000b3'),
  ('K',  '00000000-0000-0000-0000-0000000000b4'),
  ('E',  '00000000-0000-0000-0000-0000000000b5'),
  ('E2', '00000000-0000-0000-0000-0000000000b6');

insert into tb.ctx select 'BR', id from public.branches where key = 'rumeli_iskelesi';
insert into tb.ctx select 'BD', id from public.branches where key = 'iskele_dondurma';

insert into auth.users (id, email) select v, lower(k) || '@backdated-test.invalid' from tb.ctx where k in ('O','M','BM','K','E','E2');
insert into public.profiles (id, full_name) values
  (tb.id('O'), 'BD Test Owner'), (tb.id('M'), 'BD Test Manager'), (tb.id('BM'), 'BD Test Branch Manager'),
  (tb.id('K'), 'BD Test Cashier'), (tb.id('E'), 'BD Test Employee'), (tb.id('E2'), 'BD Test Employee 2');
insert into public.user_roles (user_id, role_id)
select tb.id(x.k), r.id from (values ('O','owner'),('M','manager'),('BM','branch_manager'),('K','cashier'),('E','employee'),('E2','employee')) as x(k, role_key)
join public.roles r on r.key = x.role_key;
-- K/BM in Rumeli, E in Dondurma, E2 in Rumeli (its "own" branch, used to
-- test a cross-branch attempt into Dondurma).
insert into public.branch_memberships (user_id, branch_id) values
  (tb.id('BM'), tb.id('BR')), (tb.id('K'), tb.id('BR')), (tb.id('E'), tb.id('BD')), (tb.id('E2'), tb.id('BR'));

-- One helper to create a single shift at a given Istanbul-today offset, in a
-- given branch, and register its id under a ctx key. Each call gets its OWN
-- shift_definition (key = p_key, so it never collides with any other test's
-- definition) specifically so two shifts at the same (branch, offset) used
-- by different tests never collide on shifts' real UNIQUE
-- (branch_id, shift_definition_id, business_date) constraint — the most
-- permissive cutoff the schema allows (cutoff_day_offset is a table CHECK,
-- 0 or 1 only): business_date + 1 day at 23:59 Istanbul.
-- security definer: called at various points regardless of which role is
-- ambient at the time (tb.as_user(...) may still be active) — this always
-- writes as the function owner (superuser), bypassing RLS, same as any other
-- fixture setup in this file.
create function tb.mkshift(p_key text, p_branch_key text, p_offset integer) returns void language plpgsql security definer as $$
declare
  def uuid; sid uuid; branch uuid;
begin
  branch := tb.id(p_branch_key);
  def := gen_random_uuid();
  insert into public.shift_definitions (id, branch_id, key, name, start_hour, end_hour, cutoff_hour, cutoff_minute, cutoff_day_offset)
  values (def, branch, p_key, 'Backdated test: ' || p_key, 16, 23, 23, 59, 1);
  sid := gen_random_uuid();
  insert into public.shifts (id, branch_id, shift_definition_id, business_date)
  values (sid, branch, def, (now() at time zone 'Europe/Istanbul')::date + p_offset);
  insert into tb.ctx (k, v) values (p_key, sid);
end $$;

-- =============================================================================
-- A. create_sales_report
-- =============================================================================

-- --- manager: today / -1 / -2 / -3 all allowed; -4 denied then allowed with
--     a reason (override); future denied even with a reason (no override
--     exists for the future). Each on its own dedicated shift (see header).
select tb.mkshift('m_today', 'BR', 0);
select tb.mkshift('m_m1', 'BR', -1);
select tb.mkshift('m_m2', 'BR', -2);
select tb.mkshift('m_m3', 'BR', -3);
select tb.mkshift('m_m4', 'BR', -4);
select tb.mkshift('m_future', 'BR', 1);
select tb.as_user('M');
select tb.expect_ok($q$select public.create_sales_report(tb.id('m_today'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: today allowed');
select tb.expect_ok($q$select public.create_sales_report(tb.id('m_m1'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: -1 allowed');
select tb.expect_ok($q$select public.create_sales_report(tb.id('m_m2'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: -2 allowed');
select tb.expect_ok($q$select public.create_sales_report(tb.id('m_m3'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: -3 allowed');
select tb.expect_denied($q$select public.create_sales_report(tb.id('m_m4'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: -4 without reason denied', '22023');
select tb.expect_denied($q$select public.create_sales_report(tb.id('m_m4'), null, 'Z', 10, null, null, null, '[]'::jsonb, '   ')$q$, 'manager: -4 with a blank reason still denied', '22023');
select tb.expect_ok($q$select public.create_sales_report(tb.id('m_m4'), null, 'Z', 10, null, null, null, '[]'::jsonb, 'kağıt makbuz geç geldi')$q$, 'manager: -4 with a real reason allowed (override)');
select tb.expect_denied($q$select public.create_sales_report(tb.id('m_future'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'manager: future denied', '22023');
select tb.expect_denied($q$select public.create_sales_report(tb.id('m_future'), null, 'Z', 10, null, null, null, '[]'::jsonb, 'reason does not help')$q$, 'manager: future denied even WITH a reason (no override exists for the future)', '22023');

-- --- owner: -5 denied then allowed with a reason; future denied with a reason.
select tb.mkshift('o_m5', 'BD', -5);
select tb.mkshift('o_future', 'BD', 1);
select tb.as_user('O');
select tb.expect_denied($q$select public.create_sales_report(tb.id('o_m5'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'owner: -5 without reason denied', '22023');
select tb.expect_ok($q$select public.create_sales_report(tb.id('o_m5'), null, 'X', 10, null, null, null, '[]'::jsonb, 'yıl sonu düzeltmesi')$q$, 'owner: -5 with a real reason allowed (override)');
select tb.expect_denied($q$select public.create_sales_report(tb.id('o_future'), null, 'X', 10, null, null, null, '[]'::jsonb, 'reason does not help')$q$, 'owner: future denied even with a reason', '22023');

-- --- branch_manager: privileged for the same-day cutoff (sales.edit_all)
--     but NOT for the backdated window — the actual gap 015 closes — and
--     still branch-scoped as before.
select tb.mkshift('bm_today', 'BR', 0);
select tb.mkshift('bm_m4', 'BR', -4);
select tb.mkshift('bm_cross', 'BD', 0);
select tb.as_user('BM');
select tb.expect_ok($q$select public.create_sales_report(tb.id('bm_today'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'branch_manager: today allowed (own branch)');
select tb.expect_denied($q$select public.create_sales_report(tb.id('bm_m4'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'branch_manager: -4 denied (cutoff would have let this through; the new rule does not)', '22023');
select tb.expect_denied($q$select public.create_sales_report(tb.id('bm_m4'), null, 'X', 10, null, null, null, '[]'::jsonb, 'even with a reason branch_manager has no override')$q$, 'branch_manager: -4 denied even with a reason (no override for this role)', '22023');
select tb.expect_denied($q$select public.create_sales_report(tb.id('bm_cross'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'branch_manager: cross-branch (Dondurma) denied regardless of date', '42501');

-- --- cashier / employee: today allowed; future denied (isolated from
--     cutoff, since a future cutoff has not "passed" either); cross-branch
--     denied (pre-existing rule, still correct).
select tb.mkshift('k_today', 'BR', 0);
select tb.mkshift('k_future', 'BR', 1);
select tb.as_superuser();
insert into public.shift_assignments (shift_id, user_id) values (tb.id('k_today'), tb.id('K')), (tb.id('k_future'), tb.id('K'));
select tb.as_user('K');
select tb.expect_ok($q$select public.create_sales_report(tb.id('k_today'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'cashier: today allowed (own branch, assigned)');
select tb.expect_denied($q$select public.create_sales_report(tb.id('k_future'), null, 'X', 10, null, null, null, '[]'::jsonb)$q$, 'cashier: future denied', '22023');
select tb.expect_denied($q$select public.create_sales_report(tb.id('bm_cross'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'cashier cross-branch denied (not assigned, not privileged)', '42501');
select tb.as_user('E2');
select tb.expect_denied($q$select public.create_sales_report(tb.id('bm_cross'), null, 'Z', 10, null, null, null, '[]'::jsonb)$q$, 'employee cross-branch denied (not assigned, not privileged)', '42501');

-- --- override audit row: distinct action, actor from auth.uid(), reason
--     present. Confirms exactly the two real overrides above were flagged.
select tb.as_superuser();
select tb.assert(
  (select count(*) from public.audit_logs
   where action = 'sales_report_backdated_override' and actor_user_id = tb.id('M') and reason = 'kağıt makbuz geç geldi') = 1,
  'manager backdated override produced its own audit row, distinct from report_edit'
);
select tb.assert(
  (select count(*) from public.audit_logs
   where action = 'sales_report_backdated_override' and actor_user_id = tb.id('O') and reason = 'yıl sonu düzeltmesi') = 1,
  'owner backdated override produced its own audit row'
);
select tb.assert(
  (select count(*) from public.audit_logs where action = 'sales_report_backdated_override') = 2,
  'exactly the two real overrides were flagged, nothing else'
);

-- =============================================================================
-- B. edit_sales_report — no same-day cutoff at all, so this is the cleanest
--    isolated test of the calendar-window rule for EVERY role, across the
--    full 0/-1/-2/-3/-4 day matrix. Fresh shifts, unrelated to section A.
-- =============================================================================
select tb.mkshift('ed_bd_0', 'BD', 0);
select tb.mkshift('ed_bd_m1', 'BD', -1);
select tb.mkshift('ed_bd_m2', 'BD', -2);
select tb.mkshift('ed_bd_m3', 'BD', -3);
select tb.mkshift('ed_bd_m4', 'BD', -4);
select tb.mkshift('ed_bd_m5', 'BD', -5);
select tb.mkshift('ed_br_0', 'BR', 0);
select tb.mkshift('ed_br_m3', 'BR', -3);
select tb.mkshift('ed_br_m4', 'BR', -4);
select tb.mkshift('ed_br_m5', 'BR', -5);

select tb.as_superuser();
do $$
declare k text; rid uuid;
begin
  foreach k in array array['ed_bd_0','ed_bd_m1','ed_bd_m2','ed_bd_m3','ed_bd_m4','ed_bd_m5'] loop
    rid := gen_random_uuid();
    insert into public.sales_reports (id, branch_id, shift_id, submitted_by, report_type, gross_revenue)
    values (rid, tb.id('BD'), tb.id(k), tb.id('E'), 'X', 10);
    insert into tb.ctx (k, v) values ('r_' || k, rid);
  end loop;
  foreach k in array array['ed_br_0','ed_br_m3','ed_br_m4','ed_br_m5'] loop
    rid := gen_random_uuid();
    insert into public.sales_reports (id, branch_id, shift_id, submitted_by, report_type, gross_revenue)
    values (rid, tb.id('BR'), tb.id(k), tb.id('K'), 'X', 10);
    insert into tb.ctx (k, v) values ('r_' || k, rid);
  end loop;
end $$;

select tb.as_user('E');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_bd_0'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'employee edit: today allowed');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_bd_m1'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'employee edit: -1 allowed');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_bd_m2'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'employee edit: -2 allowed');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_bd_m3'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'employee edit: -3 allowed');
select tb.expect_denied($q$select public.edit_sales_report(tb.id('r_ed_bd_m4'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'employee edit: -4 denied even with a (non-empty) reason — reason alone is not an override for this role', '22023');

-- branch_manager: own branch (Rumeli), isolated from cross-branch — proves
-- the date-window applies even where sales.edit_all would otherwise let
-- branch_manager edit any recent in-branch report.
select tb.as_user('BM');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_br_0'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'branch_manager edit: today, own branch, allowed');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_br_m3'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'branch_manager edit: -3, own branch, allowed');
select tb.expect_denied($q$select public.edit_sales_report(tb.id('r_ed_br_m4'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'branch_manager edit: -4, own branch, denied purely by the date window (sales.edit_all does not help)', '22023');
select tb.expect_denied($q$select public.edit_sales_report(tb.id('r_ed_bd_m4'), 11, null, null, null, '[]'::jsonb, 'düzeltme')$q$, 'branch_manager edit: -4, Dondurma (cross-branch AND past-window — denied either way)');

-- manager/owner: always allowed, any age, using the edit's already-mandatory
-- p_reason (no separate override parameter needed for edit).
select tb.as_user('M');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_bd_m5'), 11, null, null, null, '[]'::jsonb, 'yıllık denetim düzeltmesi')$q$, 'manager edit: -5, any branch, allowed with the mandatory reason');
select tb.as_user('O');
select tb.expect_ok($q$select public.edit_sales_report(tb.id('r_ed_br_m5'), 11, null, null, null, '[]'::jsonb, 'yıllık denetim düzeltmesi')$q$, 'owner edit: -5, any branch, allowed with the mandatory reason');

select tb.as_superuser();
select tb.assert(
  (select count(*) from public.audit_logs
   where action = 'sales_report_backdated_override' and entity_id = tb.id('r_ed_bd_m5')::text and reason = 'yıllık denetim düzeltmesi') = 1,
  'manager edit override produced its own audit row, distinct from report_edit'
);
select tb.assert(
  (select count(*) from public.audit_logs
   where action = 'sales_report_backdated_override' and entity_id = tb.id('r_ed_br_m5')::text and reason = 'yıllık denetim düzeltmesi') = 1,
  'owner edit override produced its own audit row'
);
select tb.assert(
  (select count(*) from public.audit_logs where action = 'sales_report_backdated_override') = 4,
  'exactly 4 real overrides total (2 from create in section A, 2 from edit here) — the in-window edits produced none'
);
select tb.assert(
  (select count(*) from public.audit_logs where action = 'report_edit' and entity_id = tb.id('r_ed_bd_m5')::text) = 1,
  'the override edit ALSO produced the normal report_edit audit row, unchanged'
);

do $$ begin raise notice 'ALL BACKDATED ENTRY ASSERTIONS PASSED (create + edit)'; end $$;

rollback;
