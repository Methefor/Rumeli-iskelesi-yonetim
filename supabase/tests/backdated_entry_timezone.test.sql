-- LOCAL ONLY: proves the 015 backdated-window ALLOW/DENY decision is
-- invariant to the session's TimeZone setting — same instant, same Istanbul
-- calendar date, same decision, whatever the connection's TimeZone is set
-- to. Uses edit_sales_report (no same-day-cutoff interference — see
-- backdated_entry.test.sql's header note) so every case below isolates the
-- calendar-window rule itself. One transaction, rolled back.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/backdated_entry_timezone.test.sql
begin;
create schema tbtz;
grant usage on schema tbtz to authenticated;
create table tbtz.cases (
  zone text, report_id uuid, user_id uuid, owner_or_manager boolean,
  day_offset integer, expect_allowed boolean
);
grant select on tbtz.cases to authenticated;

do $$
declare
  employee uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  branch uuid;
  def uuid;
  shift uuid;
  report uuid;
  zone text;
  is_owner_or_manager boolean;
  off integer;
begin
  select id into strict branch from public.branches where key = 'iskele_dondurma';
  insert into auth.users (id, email) values
    (employee, 'tbtz-employee@local.invalid'), (manager, 'tbtz-manager@local.invalid');
  insert into public.profiles (id, full_name) values
    (employee, 'TZ Backdated Employee'), (manager, 'TZ Backdated Manager');
  insert into public.user_roles (user_id, role_id) select employee, id from public.roles where key = 'employee';
  insert into public.user_roles (user_id, role_id) select manager, id from public.roles where key = 'manager';
  insert into public.branch_memberships (user_id, branch_id) values (employee, branch);

  foreach zone in array array['UTC', 'Europe/Istanbul', 'America/New_York', 'Asia/Tokyo'] loop
    foreach is_owner_or_manager in array array[false, true] loop
      -- -3 (allowed for everyone) and -4 (denied for a normal role, allowed
      -- with a reason for owner/manager) are the two boundary cases that
      -- matter; 0 is included as an always-trivially-allowed control.
      foreach off in array array[0, -3, -4] loop
        def := gen_random_uuid();
        shift := gen_random_uuid();
        report := gen_random_uuid();
        insert into public.shift_definitions (id, branch_id, key, name, start_hour, end_hour, cutoff_hour, cutoff_minute, cutoff_day_offset)
        values (def, branch, def::text, 'tz backdated', 16, 23, 23, 59, 1);
        -- business_date is always computed from Europe/Istanbul explicitly,
        -- regardless of the loop's zone — that is exactly the property under
        -- test: the SAME business_date must produce the SAME decision no
        -- matter the session TimeZone.
        insert into public.shifts (id, branch_id, shift_definition_id, business_date)
        values (shift, branch, def, (now() at time zone 'Europe/Istanbul')::date + off);
        insert into public.sales_reports (id, branch_id, shift_id, submitted_by, report_type, gross_revenue)
        values (report, branch, shift, employee, 'X', 10);
        insert into tbtz.cases values (
          zone, report, case when is_owner_or_manager then manager else employee end,
          is_owner_or_manager, off,
          off >= -3 or is_owner_or_manager
        );
      end loop;
    end loop;
  end loop;
end $$;

do $$
declare c record; denied boolean; total integer := 0;
begin
  for c in select * from tbtz.cases loop
    perform set_config('TimeZone', c.zone, true);
    perform set_config('request.jwt.claim.sub', c.user_id::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    execute 'set local role authenticated';
    denied := false;
    begin
      -- owner/manager beyond -3 days needs a reason to succeed; give one
      -- unconditionally (it is otherwise ignored/harmless) so the ONLY
      -- variable under test is the date-window decision itself, not the
      -- reason-required branch (already covered in backdated_entry.test.sql).
      perform public.edit_sales_report(c.report_id, 11, null, null, null, '[]'::jsonb, 'tz regression override');
    exception when sqlstate '22023' then
      if sqlerrm !~ 'today and the previous 3 Istanbul business days' then raise; end if;
      denied := true;
    end;
    execute 'reset role';
    if denied = c.expect_allowed then
      raise exception 'Wrong backdated-window decision: zone %, owner_or_manager %, day_offset %, expected allowed %, got denied %',
        c.zone, c.owner_or_manager, c.day_offset, c.expect_allowed, denied;
    end if;
    total := total + 1;
  end loop;
  raise notice 'ALL % BACKDATED-WINDOW TIMEZONE CASES PASSED (UTC / Europe/Istanbul / America/New_York / Asia/Tokyo, all consistent)', total;
end $$;
rollback;
