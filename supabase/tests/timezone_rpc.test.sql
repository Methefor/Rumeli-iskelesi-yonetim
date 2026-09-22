-- LOCAL ONLY: actual create_sales_report role/RPC regression, rolled back.
-- Run after migrations 001-014 using postgres with ON_ERROR_STOP=1.
begin;
create schema tztest;
grant usage on schema tztest to authenticated;
create table tztest.cases(zone text, shift_id uuid, user_id uuid, privileged boolean, allowed boolean);
grant select on tztest.cases to authenticated;
do $$
declare
  cashier uuid := gen_random_uuid();
  manager uuid := gen_random_uuid();
  branch uuid;
  def uuid;
  shift uuid;
  zone text;
  privileged boolean;
  allowed boolean;
  day_offset integer;
  cutoff timestamp;
begin
  select id into strict branch from public.branches where key='rumeli_iskelesi';
  insert into auth.users(id,email) values(cashier,'tz-cashier@local.invalid'),(manager,'tz-manager@local.invalid');
  insert into public.profiles(id,full_name) values(cashier,'Timezone Cashier'),(manager,'Timezone Manager');
  insert into public.user_roles(user_id,role_id) select cashier,id from public.roles where key='cashier';
  insert into public.user_roles(user_id,role_id) select manager,id from public.roles where key='manager';
  insert into public.branch_memberships(user_id,branch_id) values(cashier,branch);
  foreach zone in array array['UTC','Europe/Istanbul','America/New_York','Asia/Tokyo'] loop
    foreach privileged in array array[false,true] loop
      foreach allowed in array array[false,true] loop
        for day_offset in 0..1 loop
          cutoff := date_trunc('minute', now() at time zone 'Europe/Istanbul')
                    + case when allowed then interval '2 minutes' else interval '-2 minutes' end;
          def := gen_random_uuid(); shift := gen_random_uuid();
          insert into public.shift_definitions(id,branch_id,key,name,start_hour,end_hour,cutoff_hour,cutoff_minute,cutoff_day_offset)
          values(def,branch,def::text,'Timezone regression',8,16,extract(hour from cutoff)::integer,extract(minute from cutoff)::integer,day_offset);
          insert into public.shifts(id,branch_id,shift_definition_id,business_date)
          values(shift,branch,def,cutoff::date-day_offset);
          insert into public.shift_assignments(shift_id,user_id) values(shift,cashier);
          insert into tztest.cases values(zone,shift,case when privileged then manager else cashier end,privileged,allowed);
        end loop;
      end loop;
    end loop;
  end loop;
end $$;
do $$
declare c record; result uuid; denied boolean; total integer := 0;
begin
  for c in select * from tztest.cases loop
    perform set_config('TimeZone',c.zone,true);
    perform set_config('request.jwt.claim.sub',c.user_id::text,true);
    perform set_config('request.jwt.claim.role','authenticated',true);
    execute 'set local role authenticated';
    denied := false;
    begin
      result := public.create_sales_report(c.shift_id,null,'Z',0,0,0,'timezone regression','[]'::jsonb);
    exception when sqlstate '22023' then
      if sqlerrm <> 'submission window has closed for this shift' then raise; end if;
      denied := true;
    end;
    execute 'reset role';
    if denied = (c.allowed or c.privileged) then
      raise exception 'Wrong RPC cutoff: zone %, privileged %, allowed %, denied %',c.zone,c.privileged,c.allowed,denied;
    end if;
    total := total+1;
  end loop;
  raise notice 'ALL % TIMEZONE RPC CASES PASSED',total;
end $$;
rollback;
