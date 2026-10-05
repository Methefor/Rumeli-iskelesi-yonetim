-- =============================================================================
-- Report origin for the reconciliation queue (historical imports vs native V4)
-- =============================================================================
-- The legacy import preserves every historical reconciliation finding (484 ERROR /
-- 8 WARNING on the 2026-10-04 snapshot) exactly as computed; nothing is turned into
-- OK. They must not flood the ACTIVE operational queue, so the app needs to tell an
-- imported report from a native one. The truth already exists: a report with a
-- legacy_sales_report_links row IS an import. This migration only exposes that fact
-- read-only, scoped by the caller's own report visibility; it adds no column, no
-- duplicate truth, and changes no stored status or audit row.
-- =============================================================================

-- Authenticated users may see only the link's report id and branch key, and only for
-- reports they can already read (the policy joins sales_reports under the caller's RLS).
grant select (sales_report_id, branch_key) on public.legacy_sales_report_links to authenticated;

create policy legacy_sales_report_links_visible_reports
  on public.legacy_sales_report_links for select to authenticated
  using (exists (select 1 from public.sales_reports sr where sr.id = sales_report_id));

create view public.sales_reports_with_origin
with (security_invoker = true) as
select
  sr.id,
  sr.shift_id,
  sr.branch_id,
  sr.report_type,
  sr.gross_revenue,
  sr.status,
  sr.reconciliation_status,
  sr.submitted_at,
  sr.notes,
  case when l.sales_report_id is null then 'native' else 'legacy_import' end as origin
from public.sales_reports sr
left join public.legacy_sales_report_links l on l.sales_report_id = sr.id;

revoke all on public.sales_reports_with_origin from public, anon;
grant select on public.sales_reports_with_origin to authenticated;

comment on view public.sales_reports_with_origin is
  'Read-only origin of each visible sales report: legacy_import when a lineage link exists, otherwise native. Stored reconciliation_status is passed through unchanged.';
