-- Validated on local Supabase 2026-09-22. Local disposable Supabase only, after 001-014.
-- psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/timezone_regression.test.sql
-- Arithmetic regression; does NOT replace authenticated create_sales_report RPC tests.
begin;
do $$
declare
  zone text;
  sample record;
  cutoff timestamptz;
begin
  foreach zone in array array['UTC', 'Europe/Istanbul', 'America/New_York', 'Asia/Tokyo'] loop
    perform set_config('TimeZone', zone, true);
    for sample in select * from (values
      (date '2027-06-15', 0, 17, 30, timestamptz '2027-06-15 14:30:00+00'),
      (date '2027-06-15', 1, 1, 0, timestamptz '2027-06-15 22:00:00+00'),
      (date '2027-12-31', 1, 1, 0, timestamptz '2027-12-31 22:00:00+00'),
      (date '2028-02-29', 1, 1, 0, timestamptz '2028-02-29 22:00:00+00')
    ) as cases(business_date, cutoff_day_offset, cutoff_hour, cutoff_minute, expected) loop
      cutoff := ((sample.business_date + sample.cutoff_day_offset)::timestamp
        + make_interval(hours => sample.cutoff_hour, mins => sample.cutoff_minute))
        at time zone 'Europe/Istanbul';
      if cutoff is distinct from sample.expected then
        raise exception 'Wrong cutoff in zone %: % vs %', zone, cutoff, sample.expected;
      end if;
      if (sample.expected > cutoff)
         or (sample.expected - interval '1 millisecond' > cutoff)
         or not (sample.expected + interval '1 millisecond' > cutoff) then
        raise exception 'Wrong inclusive boundary in zone %', zone;
      end if;
    end loop;
  end loop;
end $$;
rollback;
