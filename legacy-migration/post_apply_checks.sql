-- =============================================================================
-- Post-apply verification pack for the legacy sales import.
-- READ-ONLY: this file contains a single SELECT (no DML/DDL, no functions).
-- Run it in the production SQL editor (or `supabase db query --linked -f`)
-- IMMEDIATELY after a future, separately approved import, and again after the
-- pilot. Every row must read PASS (or INFO, which needs a human look).
--
-- Edit ONLY the `params` CTE below. A NULL parameter turns its check into INFO.
-- It prints employee codes and counts only: no names, PINs, UUIDs or keys.
-- =============================================================================
with params as (
  select
    null::text    as expected_fingerprint,        -- audited SHA-256 (64 hex chars)
    null::integer as expected_source_rows,        -- audit "sourceRows"
    null::integer as expected_reports,            -- dry-run createdReports (rows + Balık + Dondurma)
    null::integer as expected_rumeli_x,           -- audit "xRows"
    null::integer as expected_rumeli_z,           -- audit "zRows"
    null::integer as expected_balik,              -- audit "balikReports"
    null::integer as expected_dondurma,           -- audit "dondurmaReports"
    5::integer    as expected_legacy_cashiers,    -- five legacy identities
    null::date    as expected_first_date,         -- audit "firstDate"
    null::date    as expected_last_date           -- audit "lastDate"
),
run as (select * from public.legacy_sales_import_runs),
links as (
  select l.*, sr.branch_id, sr.report_type, sr.gross_revenue, sr.status as report_status,
         sr.reconciliation_status, sr.submitted_by, sr.submitted_at, sr.shift_id,
         b.key as bkey, sh.business_date, sd.key as shift_key
  from public.legacy_sales_report_links l
  join public.sales_reports sr on sr.id = l.sales_report_id
  join public.branches b on b.id = sr.branch_id
  join public.shifts sh on sh.id = sr.shift_id
  join public.shift_definitions sd on sd.id = sh.shift_definition_id
),
istanbul_today as (select (now() at time zone 'Europe/Istanbul')::date as d),
checks(ord, section, check_name, expected, actual, status) as (
  -- ---------------------------------------------------------------- run record
  select 10, 'run', 'exactly one immutable import run is recorded', '1', (select count(*)::text from run),
         case when (select count(*) from run) = 1 then 'PASS' else 'FAIL' end
  union all
  select 11, 'run', 'run fingerprint equals the audited fingerprint',
         coalesce((select expected_fingerprint from params), 'not provided'),
         coalesce((select left(source_fingerprint, 12) || '…' from run limit 1), 'no run'),
         case when (select expected_fingerprint from params) is null then 'INFO'
              when exists (select 1 from run where source_fingerprint = (select expected_fingerprint from params)) then 'PASS' else 'FAIL' end
  union all
  select 12, 'run', 'run source row count equals the audited source rows',
         coalesce((select expected_source_rows::text from params), 'not provided'),
         coalesce((select max(source_row_count)::text from run), 'no run'),
         case when (select expected_source_rows from params) is null then 'INFO'
              when (select max(source_row_count) from run) = (select expected_source_rows from params) then 'PASS' else 'FAIL' end
  -- ------------------------------------------------------------- report counts
  union all
  select 20, 'counts', 'sales_reports with lineage equals the dry-run plan',
         coalesce((select expected_reports::text from params), 'not provided'),
         (select count(*)::text from links),
         case when (select expected_reports from params) is null then 'INFO'
              when (select count(*) from links) = (select expected_reports from params) then 'PASS' else 'FAIL' end
  union all
  select 21, 'counts', 'lineage rows equal the run-recorded created reports',
         coalesce((select max((result ->> 'createdReports')::int)::text from run), 'no run'),
         (select count(*)::text from public.legacy_sales_report_links),
         case when (select count(*) from public.legacy_sales_report_links) = coalesce((select max((result ->> 'createdReports')::int) from run), -1) then 'PASS' else 'FAIL' end
  union all
  select 22, 'counts', 'Rumeli X reports', coalesce((select expected_rumeli_x::text from params), 'not provided'),
         (select count(*)::text from links where bkey = 'rumeli_iskelesi' and report_type = 'X'),
         case when (select expected_rumeli_x from params) is null then 'INFO'
              when (select count(*) from links where bkey = 'rumeli_iskelesi' and report_type = 'X') = (select expected_rumeli_x from params) then 'PASS' else 'FAIL' end
  union all
  select 23, 'counts', 'Rumeli Z reports', coalesce((select expected_rumeli_z::text from params), 'not provided'),
         (select count(*)::text from links where bkey = 'rumeli_iskelesi' and report_type = 'Z'),
         case when (select expected_rumeli_z from params) is null then 'INFO'
              when (select count(*) from links where bkey = 'rumeli_iskelesi' and report_type = 'Z') = (select expected_rumeli_z from params) then 'PASS' else 'FAIL' end
  union all
  select 24, 'counts', 'Balık Ekmek reports (branch kept separate)', coalesce((select expected_balik::text from params), 'not provided'),
         (select count(*)::text from links where bkey = 'balik_ekmek'),
         case when (select expected_balik from params) is null then 'INFO'
              when (select count(*) from links where bkey = 'balik_ekmek') = (select expected_balik from params) then 'PASS' else 'FAIL' end
  union all
  select 25, 'counts', 'İskele Dondurma reports (branch kept separate)', coalesce((select expected_dondurma::text from params), 'not provided'),
         (select count(*)::text from links where bkey = 'iskele_dondurma'),
         case when (select expected_dondurma from params) is null then 'INFO'
              when (select count(*) from links where bkey = 'iskele_dondurma') = (select expected_dondurma from params) then 'PASS' else 'FAIL' end
  -- ------------------------------------------------------------------- lineage
  union all
  select 30, 'lineage', 'no duplicated source lineage (legacy id + branch)', '0',
         (select count(*)::text from (select legacy_report_id, branch_key from public.legacy_sales_report_links group by 1, 2 having count(*) > 1) d),
         case when exists (select 1 from public.legacy_sales_report_links group by legacy_report_id, branch_key having count(*) > 1) then 'FAIL' else 'PASS' end
  union all
  select 31, 'lineage', 'no sales report is linked twice', '0',
         (select count(*)::text from (select sales_report_id from public.legacy_sales_report_links group by 1 having count(*) > 1) d),
         case when exists (select 1 from public.legacy_sales_report_links group by sales_report_id having count(*) > 1) then 'FAIL' else 'PASS' end
  union all
  select 32, 'lineage', 'every lineage row points at an existing report', '0',
         (select count(*)::text from public.legacy_sales_report_links l where not exists (select 1 from public.sales_reports s where s.id = l.sales_report_id)),
         case when exists (select 1 from public.legacy_sales_report_links l where not exists (select 1 from public.sales_reports s where s.id = l.sales_report_id)) then 'FAIL' else 'PASS' end
  union all
  select 33, 'lineage', 'reports by mapped legacy profiles without lineage (expect 0 right after import, before pilot use)', '0',
         (select count(*)::text from public.sales_reports s join public.legacy_cashier_profile_map m on m.profile_id = s.submitted_by
            where not exists (select 1 from public.legacy_sales_report_links l where l.sales_report_id = s.id)),
         case when exists (select 1 from public.sales_reports s join public.legacy_cashier_profile_map m on m.profile_id = s.submitted_by
                           where not exists (select 1 from public.legacy_sales_report_links l where l.sales_report_id = s.id)) then 'INFO' else 'PASS' end
  union all
  select 34, 'lineage', 'no balancing/correction rows: reports dated inside the imported range that have no lineage', '0',
         (select count(*)::text from public.sales_reports s join public.shifts sh on sh.id = s.shift_id
            where sh.business_date between (select min(business_date) from links) and (select max(business_date) from links)
              and not exists (select 1 from public.legacy_sales_report_links l where l.sales_report_id = s.id)),
         case when exists (select 1 from public.sales_reports s join public.shifts sh on sh.id = s.shift_id
            where sh.business_date between (select min(business_date) from links) and (select max(business_date) from links)
              and not exists (select 1 from public.legacy_sales_report_links l where l.sales_report_id = s.id)) then 'INFO' else 'PASS' end
  -- ------------------------------------------------------------------ identity
  union all
  select 40, 'identity', 'every legacy cashier identity is mapped to a profile', coalesce((select expected_legacy_cashiers::text from params), 'not provided'),
         (select count(*)::text from public.legacy_cashier_profile_map),
         case when (select count(*) from public.legacy_cashier_profile_map) = (select expected_legacy_cashiers from params) then 'PASS' else 'FAIL' end
  union all
  select 41, 'identity', 'every imported report author is a mapped profile (authorship preserved)', '0',
         (select count(*)::text from links l where not exists (select 1 from public.legacy_cashier_profile_map m where m.profile_id = l.submitted_by)),
         case when exists (select 1 from links l where not exists (select 1 from public.legacy_cashier_profile_map m where m.profile_id = l.submitted_by)) then 'FAIL' else 'PASS' end
  union all
  select 42, 'identity', 'archival (H###) profiles are inactive', '0 active',
         (select count(*)::text || ' active' from public.profiles p where p.employee_code like 'H%' and p.is_active),
         case when exists (select 1 from public.profiles p where p.employee_code like 'H%' and p.is_active) then 'FAIL' else 'PASS' end
  union all
  select 43, 'identity', 'archival profiles have no PIN credential (cannot log in)', '0',
         (select count(*)::text from public.profiles p join public.pin_credentials pc on pc.user_id = p.id where p.employee_code like 'H%'),
         case when exists (select 1 from public.profiles p join public.pin_credentials pc on pc.user_id = p.id where p.employee_code like 'H%') then 'FAIL' else 'PASS' end
  union all
  select 44, 'identity', 'archival profiles have no role, branch membership or shift-assignment authority beyond history', '0 roles / 0 memberships',
         (select count(*)::text from public.user_roles ur join public.profiles p on p.id = ur.user_id where p.employee_code like 'H%')
           || ' roles / ' ||
         (select count(*)::text from public.branch_memberships bm join public.profiles p on p.id = bm.user_id where p.employee_code like 'H%') || ' memberships',
         case when exists (select 1 from public.branch_memberships bm join public.profiles p on p.id = bm.user_id where p.employee_code like 'H%')
                or exists (select 1 from public.user_roles ur join public.profiles p on p.id = ur.user_id where p.employee_code like 'H%') then 'FAIL' else 'PASS' end
  union all
  select 45, 'identity', 'active mapped legacy profiles (codes only; expect K001, K002)', 'K001, K002',
         coalesce((select string_agg(p.employee_code, ', ' order by p.employee_code) from public.legacy_cashier_profile_map m
                   join public.profiles p on p.id = m.profile_id where p.is_active), 'none'),
         'INFO'
  union all
  select 46, 'identity', 'no PIN credential row was created by the import for any mapped profile that is inactive', '0',
         (select count(*)::text from public.legacy_cashier_profile_map m join public.profiles p on p.id = m.profile_id
            join public.pin_credentials pc on pc.user_id = p.id where not p.is_active),
         case when exists (select 1 from public.legacy_cashier_profile_map m join public.profiles p on p.id = m.profile_id
            join public.pin_credentials pc on pc.user_id = p.id where not p.is_active) then 'FAIL' else 'PASS' end
  -- ---------------------------------------------------------------- X/Z & status
  union all
  select 50, 'rules', 'Rumeli: X imported only from morning shifts, Z only from evening shifts', '0 mismatches',
         (select count(*)::text from links where bkey = 'rumeli_iskelesi' and not ((report_type = 'X' and shift_key = 'morning') or (report_type = 'Z' and shift_key = 'evening'))),
         case when exists (select 1 from links where bkey = 'rumeli_iskelesi' and not ((report_type = 'X' and shift_key = 'morning') or (report_type = 'Z' and shift_key = 'evening'))) then 'FAIL' else 'PASS' end
  union all
  select 51, 'rules', 'Balık Ekmek and Dondurma reports are Z on their daily shift only', '0 mismatches',
         (select count(*)::text from links where bkey in ('balik_ekmek', 'iskele_dondurma') and not (report_type = 'Z' and shift_key = 'daily')),
         case when exists (select 1 from links where bkey in ('balik_ekmek', 'iskele_dondurma') and not (report_type = 'Z' and shift_key = 'daily')) then 'FAIL' else 'PASS' end
  union all
  select 52, 'rules', 'no shift holds more than one active X or one active Z per register (no double counting)', '0',
         (select count(*)::text from (select shift_id, report_type from public.sales_reports where status <> 'cancelled' group by shift_id, report_type, register_id having count(*) > 1) d),
         case when exists (select 1 from public.sales_reports where status <> 'cancelled' group by shift_id, report_type, register_id having count(*) > 1) then 'FAIL' else 'PASS' end
  union all
  select 53, 'rules', 'all imported reports are submitted (none cancelled/edited by the import)', '0 other',
         (select count(*)::text from links where report_status <> 'submitted'),
         case when exists (select 1 from links where report_status <> 'submitted') then 'FAIL' else 'PASS' end
  union all
  select 54, 'rules', 'Balık/Dondurma reports keep ERROR reconciliation (missing category split stays visible)', '0 not ERROR',
         (select count(*)::text from links where bkey in ('balik_ekmek', 'iskele_dondurma') and reconciliation_status <> 'ERROR'),
         case when exists (select 1 from links where bkey in ('balik_ekmek', 'iskele_dondurma') and reconciliation_status <> 'ERROR') then 'FAIL' else 'PASS' end
  -- ---------------------------------------------------------- dates & coverage
  union all
  select 60, 'dates', 'no imported or V4 shift dated in the future (Istanbul)', '0',
         (select count(*)::text from public.shifts sh, istanbul_today t where sh.business_date > t.d and exists (select 1 from links l where l.shift_id = sh.id)),
         case when exists (select 1 from public.shifts sh, istanbul_today t where sh.business_date > t.d and exists (select 1 from links l where l.shift_id = sh.id)) then 'FAIL' else 'PASS' end
  union all
  select 61, 'dates', 'no imported report submitted in the future', '0',
         (select count(*)::text from links where submitted_at > now()),
         case when exists (select 1 from links where submitted_at > now()) then 'FAIL' else 'PASS' end
  union all
  select 62, 'dates', 'first imported business date', coalesce((select expected_first_date::text from params), 'not provided'),
         coalesce((select min(business_date)::text from links), 'none'),
         case when (select expected_first_date from params) is null then 'INFO'
              when (select min(business_date) from links) = (select expected_first_date from params) then 'PASS' else 'FAIL' end
  union all
  select 63, 'dates', 'last imported business date', coalesce((select expected_last_date::text from params), 'not provided'),
         coalesce((select max(business_date)::text from links), 'none'),
         case when (select expected_last_date from params) is null then 'INFO'
              when (select max(business_date) from links) = (select expected_last_date from params) then 'PASS' else 'FAIL' end
  -- ------------------------------------------------------------------ orphans
  union all
  select 70, 'orphans', 'no report item without a report', '0',
         (select count(*)::text from public.sales_report_items i where not exists (select 1 from public.sales_reports s where s.id = i.sales_report_id)),
         case when exists (select 1 from public.sales_report_items i where not exists (select 1 from public.sales_reports s where s.id = i.sales_report_id)) then 'FAIL' else 'PASS' end
  union all
  select 71, 'orphans', 'every imported report has a shift of the same branch', '0',
         (select count(*)::text from public.sales_reports s join public.shifts sh on sh.id = s.shift_id where sh.branch_id <> s.branch_id),
         case when exists (select 1 from public.sales_reports s join public.shifts sh on sh.id = s.shift_id where sh.branch_id <> s.branch_id) then 'FAIL' else 'PASS' end
  union all
  select 72, 'orphans', 'no shift assignment points at a missing shift or profile', '0',
         (select count(*)::text from public.shift_assignments a where not exists (select 1 from public.shifts s where s.id = a.shift_id)
                                                                  or not exists (select 1 from public.profiles p where p.id = a.user_id)),
         case when exists (select 1 from public.shift_assignments a where not exists (select 1 from public.shifts s where s.id = a.shift_id)
                                                                      or not exists (select 1 from public.profiles p where p.id = a.user_id)) then 'FAIL' else 'PASS' end
  -- --------------------------------------------------------- audit & references
  union all
  select 80, 'audit', 'operating-data load is audited (loader actor + reason)', '>= 1',
         (select count(*)::text from public.audit_logs where action = 'operating_data_load'),
         case when exists (select 1 from public.audit_logs where action = 'operating_data_load') then 'PASS' else 'FAIL' end
  union all
  select 81, 'audit', 'import run records an owner actor and reason', '1 run with actor+reason',
         (select count(*)::text from run where imported_by is not null and length(trim(reason)) >= 5),
         case when (select count(*) from run where imported_by is not null and length(trim(reason)) >= 5) = 1 then 'PASS' else 'FAIL' end
  union all
  select 82, 'frozen', 'frozen reference totals are present and unmodified (7 rows)', '7',
         (select count(*)::text from public.legacy_reference_totals),
         case when (select count(*) from public.legacy_reference_totals) = 7
                and (select amount from public.legacy_reference_totals where scope_key = 'organization' and period_start = '2026-08-01') = 5959133.74 then 'PASS' else 'FAIL' end
  -- Variance is DISCLOSED, never corrected: V4 Z revenue per frozen month vs reference.
  union all
  select 83 + extract(month from period_start)::int, 'frozen',
         'variance vs frozen reference, ' || to_char(period_start, 'YYYY-MM') || ' (disclosure only: June/July differ, August exact)',
         amount::text,
         coalesce((select round(sum(gross_revenue), 2)::text from links where report_type = 'Z'
                    and business_date between period_start and period_end), '0'),
         'INFO'
  from public.legacy_reference_totals
  where scope_key = 'organization' and period_start in ('2026-06-01', '2026-07-01', '2026-08-01') and period_end < '2026-09-01' and period_end - period_start < 40
  -- ------------------------------------------------------------ branch totals
  union all
  select 100 + row_number() over (order by bkey), 'totals', 'imported Z revenue (TL) and report count, ' || bkey,
         'compare with the audit/dry-run', round(sum(gross_revenue), 2)::text || ' TL / ' || count(*) || ' reports', 'INFO'
  from links where report_type = 'Z' group by bkey
  -- ------------------------------------------------------ legacy source intact
  union all
  select 110, 'legacy', 'legacy daily_reports still holds at least the imported source rows (rows are never deleted)',
         '>= ' || coalesce((select max(source_row_count)::text from run), '?'),
         case when to_regclass('public.daily_reports') is null then 'table absent (local test database)'
              else (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.daily_reports', false, true, '')))[1]::text end,
         case when to_regclass('public.daily_reports') is null then 'INFO'
              when (xpath('/row/c/text()', query_to_xml('select count(*) as c from public.daily_reports', false, true, '')))[1]::text::int
                   >= coalesce((select max(source_row_count) from run), 0) then 'PASS' else 'FAIL' end
)
select section, check_name, expected, actual, status
from checks
order by ord;
