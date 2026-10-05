-- =============================================================================
-- supabase/rollback/v4_legacy_import_cleanup.sql
-- =============================================================================
-- DATA-IMPORT ROLLBACK ONLY. Removes the rows created by the legacy sales import
-- (internal_run_legacy_sales_import with p_commit = true) from the V4 tables and
-- leaves the V4 SCHEMA, identities, operating data and every legacy table
-- untouched. The importer never writes legacy tables, so nothing about legacy
-- needs restoring: the legacy app stays authoritative throughout.
--
-- Removes, for reports that have a lineage link ONLY:
--   sales_report_items, sales_report_overrides, legacy_sales_report_links,
--   sales_reports, shift_assignments and shifts that no remaining report uses,
--   the cafetarya/restoran historical registers (if unused),
--   legacy_cashier_profile_map, legacy_sales_import_runs.
-- Native V4 reports (no lineage) are never touched; if any exist the script
-- refuses to delete shared shifts/registers they use.
--
-- LOCKED by default. Running it against production REQUIRES EXPLICIT OWNER
-- APPROVAL BEFORE EXECUTION; only then remove the guard block. Verified by
-- supabase/tests/legacy_import_rehearsal.test.mjs (counts return to the
-- pre-import baseline). Take a fresh backup first (PRODUCTION_BACKUP_RUNBOOK.md).
-- =============================================================================

-- >>> LOCK GUARD (delete these lines only with explicit owner approval) >>>
do $$ begin raise exception 'import cleanup is locked: remove the guard block only with explicit owner approval'; end $$;
-- <<< LOCK GUARD <<<

begin;

create temporary table _imported_reports on commit drop as
  select sales_report_id as id from public.legacy_sales_report_links;
create temporary table _imported_shifts on commit drop as
  select distinct sr.shift_id as id
  from public.sales_reports sr join _imported_reports r on r.id = sr.id;

delete from public.sales_report_overrides where sales_report_id in (select id from _imported_reports);
delete from public.sales_report_items where sales_report_id in (select id from _imported_reports);
delete from public.legacy_sales_report_links;
delete from public.sales_reports where id in (select id from _imported_reports);

-- shifts/assignments only when no remaining (native) report or movement uses the shift
delete from public.shift_assignments a
 where a.shift_id in (select id from _imported_shifts)
   and not exists (select 1 from public.sales_reports sr where sr.shift_id = a.shift_id);
delete from public.shifts s
 where s.id in (select id from _imported_shifts)
   and not exists (select 1 from public.sales_reports sr where sr.shift_id = s.id)
   and not exists (select 1 from public.shift_assignments a where a.shift_id = s.id)
   and not exists (select 1 from public.inventory_movements m where m.shift_id = s.id)
   and not exists (select 1 from public.inventory_counts c where c.shift_id = s.id);

delete from public.registers r
 where r.key in ('cafetarya', 'restoran')
   and not exists (select 1 from public.sales_reports sr where sr.register_id = r.id);

delete from public.legacy_cashier_profile_map;
delete from public.legacy_sales_import_runs;

-- Post-condition: no lineage and no import run may remain.
do $$
begin
  if exists (select 1 from public.legacy_sales_report_links)
     or exists (select 1 from public.legacy_sales_import_runs) then
    raise exception 'import cleanup incomplete';
  end if;
end $$;

commit;
