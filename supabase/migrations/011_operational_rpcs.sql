-- =============================================================================
-- 011_operational_rpcs.sql
-- =============================================================================
-- STATUS: NOT APPLIED to production. Prepared for review, applied only to
-- local staging so far — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Audited SECURITY DEFINER RPCs for every critical operational action
--   (section 9 of the Phase D brief): shift assignment changes, late/
--   on-time override, sales report edit, sales report delete/cancel,
--   reconciliation override, branch reassignment affecting active shifts.
--   Same rule as 008_admin_rpcs.sql: a permission-gated raw table write
--   cannot express these actions' authorization shape (branch scoping,
--   ownership, timing) or guarantee an audit_logs row — these functions do
--   both, in one transaction, and 010 grants no direct client write on any
--   of the tables they touch.
--
-- Depends on: 001-005 (helpers, write_audit_log), 009 (tables).
--
-- Rollback:
--   drop function if exists public.override_reconciliation(uuid, text, text);
--   drop function if exists public.cancel_sales_report(uuid, text);
--   drop function if exists public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text);
--   drop function if exists public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb);
--   drop function if exists public.override_shift_lateness(uuid, boolean, text);
--   drop function if exists public.update_shift_assignment_status(uuid, text, text);
--   drop function if exists public.assign_shift(uuid, uuid, text);
--   drop function if exists public.reassign_shift_branch(uuid, uuid, text);
--   drop function if exists public.cancel_shift(uuid, text);
--   drop function if exists public.schedule_shift(uuid, uuid, date, text);
--   drop function if exists public.compute_reconciliation_status(numeric, numeric, uuid);
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Pure(ish) helper: mirrors domain/reconciliation/reconcile.ts exactly (same
-- three-tier threshold comparison). SQL is authoritative for what gets
-- stored in sales_reports.reconciliation_status; the TypeScript function is
-- for optimistic client-side preview only — see 009's comment on
-- reconciliation_thresholds and DECISIONS.md for why both must exist.
-- -----------------------------------------------------------------------------
create or replace function public.compute_reconciliation_status(
  p_expected numeric,
  p_actual numeric,
  p_branch_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_warning numeric;
  v_error numeric;
  v_diff_pct numeric;
begin
  select warning_percentage, error_percentage into v_warning, v_error
  from public.reconciliation_thresholds where branch_id = p_branch_id;

  if not found then
    v_warning := 2.00;
    v_error := 5.00;
  end if;

  if p_expected = 0 then
    return case when p_actual <> 0 then 'ERROR' else 'OK' end;
  end if;

  v_diff_pct := abs((p_actual - p_expected) / p_expected) * 100;

  return case
    when v_diff_pct >= v_error then 'ERROR'
    when v_diff_pct >= v_warning then 'WARNING'
    else 'OK'
  end;
end;
$$;

comment on function public.compute_reconciliation_status(numeric, numeric, uuid) is
  'Mirrors domain/reconciliation/reconcile.ts. Authoritative status computation used by create_sales_report/edit_sales_report.';

revoke all on function public.compute_reconciliation_status(numeric, numeric, uuid) from public;
grant execute on function public.compute_reconciliation_status(numeric, numeric, uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Shared branch-authorization shape used by every function below:
-- owner/manager act org-wide; branch_manager acts only within a branch they
-- are a member of, via shift.manage. Inlined per-function (not a shared
-- helper) because each function's exact permission key differs slightly (a
-- shared helper taking a permission key as a parameter would just move the
-- same three-line check behind an indirection with no real duplication
-- removed — see coding-style.md on premature abstraction).
-- -----------------------------------------------------------------------------

create or replace function public.schedule_shift(
  p_branch_id uuid,
  p_shift_definition_id uuid,
  p_business_date date,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift_id uuid;
begin
  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and p_branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.shifts
    where branch_id = p_branch_id and shift_definition_id = p_shift_definition_id and business_date = p_business_date
  ) then
    raise exception 'a shift already exists for this branch/definition/date' using errcode = '23505';
  end if;

  insert into public.shifts (branch_id, shift_definition_id, business_date, created_by, updated_by)
  values (p_branch_id, p_shift_definition_id, p_business_date, auth.uid(), auth.uid())
  returning id into v_shift_id;

  perform public.write_audit_log(
    'shift_status_change', 'shifts', v_shift_id::text,
    null, jsonb_build_object('status', 'scheduled', 'business_date', p_business_date), p_reason
  );

  return v_shift_id;
end;
$$;

comment on function public.schedule_shift(uuid, uuid, date, text) is
  'Creates a shift instance. Owner/manager org-wide; branch_manager only within a shared branch. Writes audit_logs.action = shift_status_change.';

revoke all on function public.schedule_shift(uuid, uuid, date, text) from public;
grant execute on function public.schedule_shift(uuid, uuid, date, text) to authenticated;


create or replace function public.cancel_shift(p_shift_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_previous_status text;
begin
  select branch_id, status into v_branch_id, v_previous_status from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;

  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and v_branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.shifts set status = 'cancelled', updated_by = auth.uid() where id = p_shift_id;

  perform public.write_audit_log(
    'shift_status_change', 'shifts', p_shift_id::text,
    jsonb_build_object('status', v_previous_status), jsonb_build_object('status', 'cancelled'), p_reason
  );
end;
$$;

comment on function public.cancel_shift(uuid, text) is
  'Cancels a shift (status lifecycle, never a DELETE). Writes audit_logs.action = shift_status_change.';

revoke all on function public.cancel_shift(uuid, text) from public;
grant execute on function public.cancel_shift(uuid, text) to authenticated;


create or replace function public.reassign_shift_branch(
  p_shift_id uuid,
  p_new_branch_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_branch_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to reassign a shift''s branch' using errcode = '22023';
  end if;

  select branch_id into v_old_branch_id from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;

  -- Branch reassignment is org-wide-only: a branch_manager reassigning a
  -- shift OUT of their own branch would need authority over the
  -- destination branch too, which their own membership doesn't establish.
  if not public.current_user_is_owner_or_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.shifts set branch_id = p_new_branch_id, updated_by = auth.uid() where id = p_shift_id;

  perform public.write_audit_log(
    'branch_reassignment', 'shifts', p_shift_id::text,
    jsonb_build_object('branch_id', v_old_branch_id), jsonb_build_object('branch_id', p_new_branch_id), p_reason
  );
end;
$$;

comment on function public.reassign_shift_branch(uuid, uuid, text) is
  'Reassigns an existing shift to a different branch. Org-wide only, reason mandatory. Writes audit_logs.action = branch_reassignment.';

revoke all on function public.reassign_shift_branch(uuid, uuid, text) from public;
grant execute on function public.reassign_shift_branch(uuid, uuid, text) to authenticated;


create or replace function public.assign_shift(
  p_shift_id uuid,
  p_user_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_assignment_id uuid;
begin
  select branch_id into v_branch_id from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;

  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and v_branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.shift_assignments (shift_id, user_id, assigned_by)
  values (p_shift_id, p_user_id, auth.uid())
  on conflict (shift_id, user_id) do update set status = 'assigned', updated_at = now()
  returning id into v_assignment_id;

  perform public.write_audit_log(
    'shift_assignment_change', 'shift_assignments', v_assignment_id::text,
    null, jsonb_build_object('shift_id', p_shift_id, 'user_id', p_user_id, 'status', 'assigned'), p_reason
  );

  return v_assignment_id;
end;
$$;

comment on function public.assign_shift(uuid, uuid, text) is
  'Assigns an employee to a shift. Owner/manager org-wide; branch_manager only within a shared branch. Writes audit_logs.action = shift_assignment_change.';

revoke all on function public.assign_shift(uuid, uuid, text) from public;
grant execute on function public.assign_shift(uuid, uuid, text) to authenticated;


create or replace function public.update_shift_assignment_status(
  p_assignment_id uuid,
  p_new_status text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
  v_user_id uuid;
  v_previous_status text;
begin
  if p_new_status not in ('assigned', 'confirmed', 'cancelled') then
    raise exception 'invalid status %', p_new_status using errcode = '22023';
  end if;

  select s.branch_id, sa.user_id, sa.status
    into v_branch_id, v_user_id, v_previous_status
  from public.shift_assignments sa
  join public.shifts s on s.id = sa.shift_id
  where sa.id = p_assignment_id;

  if not found then
    raise exception 'shift assignment % not found', p_assignment_id using errcode = '22023';
  end if;

  -- The assigned employee may confirm their own assignment; only a
  -- privileged, branch-scoped caller may cancel someone else's.
  if not (
    (v_user_id = auth.uid() and p_new_status = 'confirmed')
    or public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and v_branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.shift_assignments set status = p_new_status where id = p_assignment_id;

  perform public.write_audit_log(
    'shift_assignment_change', 'shift_assignments', p_assignment_id::text,
    jsonb_build_object('status', v_previous_status), jsonb_build_object('status', p_new_status), p_reason
  );
end;
$$;

comment on function public.update_shift_assignment_status(uuid, text, text) is
  'Transitions a shift_assignments row (assigned/confirmed/cancelled). The assignee may self-confirm; cancellation is privileged/branch-scoped. Writes audit_logs.action = shift_assignment_change.';

revoke all on function public.update_shift_assignment_status(uuid, text, text) from public;
grant execute on function public.update_shift_assignment_status(uuid, text, text) to authenticated;


create or replace function public.override_shift_lateness(
  p_assignment_id uuid,
  p_is_on_time boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch_id uuid;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to override lateness' using errcode = '22023';
  end if;

  select s.branch_id into v_branch_id
  from public.shift_assignments sa
  join public.shifts s on s.id = sa.shift_id
  where sa.id = p_assignment_id;

  if not found then
    raise exception 'shift assignment % not found', p_assignment_id using errcode = '22023';
  end if;

  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and v_branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.shift_assignments
    set late_override = p_is_on_time, late_override_reason = p_reason
    where id = p_assignment_id;

  perform public.write_audit_log(
    'late_on_time_override', 'shift_assignments', p_assignment_id::text,
    null, jsonb_build_object('late_override', p_is_on_time), p_reason
  );
end;
$$;

comment on function public.override_shift_lateness(uuid, boolean, text) is
  'The ONLY way to set shift_assignments.late_override — excluded from any client column grant. Reason mandatory. Writes audit_logs.action = late_on_time_override.';

revoke all on function public.override_shift_lateness(uuid, boolean, text) from public;
grant execute on function public.override_shift_lateness(uuid, boolean, text) to authenticated;


-- -----------------------------------------------------------------------------
-- create_sales_report — the central write path. Enforces, server-side:
--   - shift ownership (submitter is assigned to the shift, or acts with
--     branch/org-wide privilege),
--   - allowed branch (p_branch_id must match the shift's own branch_id —
--     never trust a client-supplied branch on its own),
--   - allowed shift (must exist, must not be cancelled),
--   - server-side submission timing (evaluated against shift_definitions'
--     cutoff, not the browser clock — mirrors domain/shifts.evaluateOnTime;
--     a privileged caller may submit outside the window, an ordinary
--     cashier/employee may not),
--   - duplicate prevention (explicit check for a clear error, backed by
--     009's partial unique indexes as the authoritative guarantee).
-- p_items is a jsonb array of {category_id, amount, quantity?}.
-- -----------------------------------------------------------------------------
create or replace function public.create_sales_report(
  p_shift_id uuid,
  p_register_id uuid,
  p_report_type text,
  p_gross_revenue numeric,
  p_transaction_count integer,
  p_average_basket numeric,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift record;
  v_def record;
  v_branch_id uuid;
  v_is_assigned boolean;
  v_is_privileged boolean;
  v_cutoff_instant timestamptz;
  v_report_id uuid;
  v_items_total numeric;
  v_item jsonb;
  v_reconciliation_status text;
begin
  if p_report_type not in ('X', 'Z') then
    raise exception 'invalid report_type %', p_report_type using errcode = '22023';
  end if;

  select s.*, sd.cutoff_hour, sd.cutoff_minute, sd.cutoff_day_offset
    into v_shift
  from public.shifts s
  join public.shift_definitions sd on sd.id = s.shift_definition_id
  where s.id = p_shift_id;

  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'cannot submit a report for a cancelled shift' using errcode = '22023';
  end if;

  v_branch_id := v_shift.branch_id;

  select exists (
    select 1 from public.shift_assignments where shift_id = p_shift_id and user_id = auth.uid()
  ) into v_is_assigned;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_branch_id in (select public.current_user_branch_ids()));

  if not (v_is_assigned or v_is_privileged) then
    raise exception 'not authorized: not assigned to this shift' using errcode = '42501';
  end if;

  -- Server-side submission timing — resolved exactly like
  -- domain/shifts.evaluateOnTime resolves a ShiftTimingRule: the cutoff is
  -- anchored to the shift's OWN business_date, offset forward a day when
  -- cutoff_day_offset = 1 (a cutoff past midnight).
  v_cutoff_instant := (v_shift.business_date + (v_shift.cutoff_day_offset || ' days')::interval)::date
    + make_interval(hours => v_shift.cutoff_hour, mins => v_shift.cutoff_minute);

  if now() > v_cutoff_instant and not v_is_privileged then
    raise exception 'submission window has closed for this shift' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.sales_reports
    where shift_id = p_shift_id
      and report_type = p_report_type
      and status <> 'cancelled'
      and (
        (p_register_id is null and register_id is null)
        or (p_register_id is not null and register_id = p_register_id)
      )
  ) then
    raise exception 'a % report already exists for this shift/register', p_report_type using errcode = '23505';
  end if;

  v_items_total := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_items_total := v_items_total + coalesce((v_item ->> 'amount')::numeric, 0);
  end loop;

  v_reconciliation_status := public.compute_reconciliation_status(p_gross_revenue, v_items_total, v_branch_id);

  insert into public.sales_reports (
    branch_id, shift_id, register_id, submitted_by, report_type,
    gross_revenue, transaction_count, average_basket, notes, reconciliation_status
  )
  values (
    v_branch_id, p_shift_id, p_register_id, auth.uid(), p_report_type,
    p_gross_revenue, p_transaction_count, p_average_basket, p_notes, v_reconciliation_status
  )
  returning id into v_report_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.sales_report_items (sales_report_id, category_id, amount, quantity)
    values (
      v_report_id,
      (v_item ->> 'category_id')::uuid,
      (v_item ->> 'amount')::numeric,
      nullif(v_item ->> 'quantity', '')::integer
    );
  end loop;

  perform public.write_audit_log(
    'report_edit', 'sales_reports', v_report_id::text,
    null,
    jsonb_build_object('report_type', p_report_type, 'gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    'created'
  );

  return v_report_id;
end;
$$;

comment on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb) is
  'The only path to submit a sales report. Enforces shift ownership, allowed/active shift, server-side timing (privileged roles may bypass), and duplicate prevention. Computes reconciliation_status server-side. Writes audit_logs.action = report_edit (reason "created").';

revoke all on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb) from public;
grant execute on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb) to authenticated;


create or replace function public.edit_sales_report(
  p_report_id uuid,
  p_gross_revenue numeric,
  p_transaction_count integer,
  p_average_basket numeric,
  p_notes text,
  p_items jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_is_privileged boolean;
  v_items_total numeric;
  v_item jsonb;
  v_reconciliation_status text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to edit a sales report' using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;
  if v_report.status = 'cancelled' then
    raise exception 'cannot edit a cancelled report' using errcode = '22023';
  end if;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()));

  if not (
    v_is_privileged
    or (v_report.submitted_by = auth.uid() and public.current_user_has_permission('sales.edit_own'))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_items_total := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_items_total := v_items_total + coalesce((v_item ->> 'amount')::numeric, 0);
  end loop;

  v_reconciliation_status := public.compute_reconciliation_status(p_gross_revenue, v_items_total, v_report.branch_id);

  update public.sales_reports
    set gross_revenue = p_gross_revenue,
        transaction_count = p_transaction_count,
        average_basket = p_average_basket,
        notes = p_notes,
        reconciliation_status = v_reconciliation_status,
        status = 'edited',
        edited_at = now()
    where id = p_report_id;

  delete from public.sales_report_items where sales_report_id = p_report_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into public.sales_report_items (sales_report_id, category_id, amount, quantity)
    values (
      p_report_id,
      (v_item ->> 'category_id')::uuid,
      (v_item ->> 'amount')::numeric,
      nullif(v_item ->> 'quantity', '')::integer
    );
  end loop;

  perform public.write_audit_log(
    'report_edit', 'sales_reports', p_report_id::text,
    jsonb_build_object('gross_revenue', v_report.gross_revenue, 'reconciliation_status', v_report.reconciliation_status),
    jsonb_build_object('gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    p_reason
  );
end;
$$;

comment on function public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text) is
  'Edits a sales report (reason mandatory). sales.edit_own + ownership, or sales.edit_all (org-wide/branch-scoped). Recomputes reconciliation_status. Writes audit_logs.action = report_edit.';

revoke all on function public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text) from public;
grant execute on function public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text) to authenticated;


create or replace function public.cancel_sales_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_is_privileged boolean;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to cancel a sales report' using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()));

  if not (
    v_is_privileged
    or (v_report.submitted_by = auth.uid() and public.current_user_has_permission('sales.edit_own'))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.sales_reports set status = 'cancelled' where id = p_report_id;

  perform public.write_audit_log(
    'report_delete', 'sales_reports', p_report_id::text,
    jsonb_build_object('status', v_report.status), jsonb_build_object('status', 'cancelled'), p_reason
  );
end;
$$;

comment on function public.cancel_sales_report(uuid, text) is
  'Cancels a sales report (status lifecycle, never a raw DELETE — history is preserved). Writes audit_logs.action = report_delete.';

revoke all on function public.cancel_sales_report(uuid, text) from public;
grant execute on function public.cancel_sales_report(uuid, text) to authenticated;


create or replace function public.override_reconciliation(
  p_report_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to override a reconciliation status' using errcode = '22023';
  end if;
  if p_new_status not in ('OK', 'WARNING', 'ERROR') then
    raise exception 'invalid status %', p_new_status using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;

  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.sales_report_overrides (sales_report_id, previous_status, new_status, reason, overridden_by)
  values (p_report_id, v_report.reconciliation_status, p_new_status, p_reason, auth.uid());

  update public.sales_reports set reconciliation_status = p_new_status where id = p_report_id;

  perform public.write_audit_log(
    'reconciliation_override', 'sales_reports', p_report_id::text,
    jsonb_build_object('reconciliation_status', v_report.reconciliation_status),
    jsonb_build_object('reconciliation_status', p_new_status),
    p_reason
  );
end;
$$;

comment on function public.override_reconciliation(uuid, text, text) is
  'Manager override of a report''s reconciliation_status. Reason mandatory; writes a sales_report_overrides row (full history, never overwritten) AND audit_logs.action = reconciliation_override.';

revoke all on function public.override_reconciliation(uuid, text, text) from public;
grant execute on function public.override_reconciliation(uuid, text, text) to authenticated;
