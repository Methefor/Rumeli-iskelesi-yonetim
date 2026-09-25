-- =============================================================================
-- 015_sales_backdated_policy.sql
-- =============================================================================
-- STATUS: PREPARED ONLY. Not applied to any hosted Supabase project.
--
-- Purpose:
--   Server-side backdated-entry policy for sales reports, using an explicit
--   Europe/Istanbul CALENDAR DATE (never a rolling 72-hour window, never the
--   session/browser timezone, never the same-day submission cutoff already
--   enforced in create_sales_report — this is a separate, additional rule):
--
--     - cashier / employee / branch_manager (normal operational users) may
--       create or edit a report only for a shift whose business_date is
--       today or one of the previous 3 Istanbul calendar dates.
--     - A FUTURE business_date is always denied, for every role including
--       owner/manager — there is no override for this.
--     - owner/manager may go further into the past, but ONLY through an
--       explicit, mandatory reason, audited separately
--       (action = 'sales_report_backdated_override') from the normal
--       report_edit audit row every create/edit already writes. This is not
--       a second RPC — record_inventory_adjustment-style overrides in Phase E
--       showed that a second RPC for the exact same table/shape as the
--       primary one duplicates authorization logic and is easy to let drift;
--       here the smallest safe change is one new optional parameter
--       (create_sales_report's p_backdated_reason) plus an extra audit call,
--       not a parallel RPC.
--     - branch_manager's existing 'sales.edit_all' does NOT count as
--       "privileged" for this rule — it still bypasses the same-day cutoff
--       (unchanged, pre-existing behaviour) but NOT the 3-day backdated
--       limit. Only current_user_is_owner_or_manager() does.
--
--   cancel_sales_report is deliberately NOT touched here: cancelling removes
--   data (reverses movements, flips status) rather than inserting new
--   backdated financial data, and the user's brief scoped this policy to
--   "create/edit" — see DECISIONS.md for this explicit boundary.
--
-- Depends on: 001-005, 009, 011, 012, 013, 014 (redefines two of 014's
-- functions: create_sales_report changes signature — old 8-arg version is
-- dropped first, see below — edit_sales_report keeps its signature).
--
-- Rollback:
--   drop function if exists public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb, text);
--   -- restore 014's 8-arg create_sales_report and edit_sales_report bodies verbatim.
-- =============================================================================

-- create_sales_report gains a trailing optional parameter, which is a
-- different signature from 014's 8-arg version — drop it explicitly first so
-- PostgREST never has two ambiguous overloads to resolve between.
drop function if exists public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb);

create or replace function public.create_sales_report(
  p_shift_id uuid,
  p_register_id uuid,
  p_report_type text,
  p_gross_revenue numeric,
  p_transaction_count integer,
  p_average_basket numeric,
  p_notes text,
  p_items jsonb,
  p_backdated_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift record;
  v_branch_id uuid;
  v_is_assigned boolean;
  v_is_privileged boolean;
  v_is_owner_or_manager boolean;
  v_cutoff_instant timestamptz;
  v_today date;
  v_report_id uuid;
  v_items_total numeric;
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

  v_is_owner_or_manager := public.current_user_is_owner_or_manager();
  v_is_privileged :=
    v_is_owner_or_manager
    or (public.current_user_has_permission('sales.edit_all') and v_branch_id in (select public.current_user_branch_ids()));

  if not (v_is_assigned or v_is_privileged) then
    raise exception 'not authorized: not assigned to this shift' using errcode = '42501';
  end if;

  -- Same-day submission cutoff (unchanged, pre-existing rule; privileged
  -- includes branch_manager via sales.edit_all).
  v_cutoff_instant := ((v_shift.business_date + v_shift.cutoff_day_offset)::timestamp
    + make_interval(hours => v_shift.cutoff_hour, mins => v_shift.cutoff_minute))
    at time zone 'Europe/Istanbul';

  if now() > v_cutoff_instant and not v_is_privileged then
    raise exception 'submission window has closed for this shift' using errcode = '22023';
  end if;

  -- Backdated-entry policy: separate from the cutoff above. Calendar-date
  -- based (never a rolling 72 hours), Europe/Istanbul explicit, server clock
  -- only. branch_manager is NOT privileged here even though it is for the
  -- cutoff check above.
  v_today := (now() at time zone 'Europe/Istanbul')::date;
  if v_shift.business_date > v_today then
    raise exception 'cannot submit a report for a future business date' using errcode = '22023';
  end if;
  if v_shift.business_date < v_today - 3 then
    if not v_is_owner_or_manager then
      raise exception 'submission is limited to today and the previous 3 Istanbul business days' using errcode = '22023';
    end if;
    if p_backdated_reason is null or length(trim(p_backdated_reason)) = 0 then
      raise exception 'a reason is required to submit for a business date more than 3 days in the past' using errcode = '22023';
    end if;
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

  select coalesce(sum(coalesce((e ->> 'amount')::numeric, 0)), 0) into v_items_total
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

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

  perform public.sales_report_write_items(v_report_id, v_branch_id, p_items);
  perform public.inventory_apply_sales_lines(v_report_id);

  perform public.write_audit_log(
    'report_edit', 'sales_reports', v_report_id::text,
    null,
    jsonb_build_object('report_type', p_report_type, 'gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    'created'
  );

  if v_shift.business_date < v_today - 3 then
    perform public.write_audit_log(
      'sales_report_backdated_override', 'sales_reports', v_report_id::text,
      null,
      jsonb_build_object(
        'branch_id', v_branch_id,
        'shift_id', p_shift_id,
        'business_date', v_shift.business_date,
        'days_late', (v_today - v_shift.business_date)
      ),
      p_backdated_reason
    );
  end if;

  return v_report_id;
end;
$$;

comment on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb, text) is
  'The only path to submit a sales report. Shift ownership, allowed/active shift, server-side same-day cutoff (privileged roles may bypass), duplicate prevention, server-computed reconciliation_status. Backdated policy (015, Europe/Istanbul calendar date): normal users limited to today..-3 days; a future business_date is always denied; only owner/manager may go further back, with a mandatory p_backdated_reason, audited separately (sales_report_backdated_override) — branch_manager''s sales.edit_all does not count here. Product-linked items also write SALE stock movements in the same transaction. Audited (report_edit, reason "created").';

revoke all on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb, text) from public, anon;
grant execute on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb, text) to authenticated;


-- edit_sales_report keeps its exact signature (p_reason is already
-- mandatory for every edit, so the backdated override's "mandatory reason"
-- requirement is already satisfied structurally); only the body changes.
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
  v_is_owner_or_manager boolean;
  v_today date;
  v_items_total numeric;
  v_reconciliation_status text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to edit a sales report' using errcode = '22023';
  end if;

  select r.*, s.business_date into v_report
  from public.sales_reports r
  join public.shifts s on s.id = r.shift_id
  where r.id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;
  if v_report.status = 'cancelled' then
    raise exception 'cannot edit a cancelled report' using errcode = '22023';
  end if;

  v_is_owner_or_manager := public.current_user_is_owner_or_manager();
  v_is_privileged :=
    v_is_owner_or_manager
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()));

  if not (
    v_is_privileged
    or (v_report.submitted_by = auth.uid() and public.current_user_has_permission('sales.edit_own'))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Backdated-entry policy (see create_sales_report, 015): editing a report
  -- whose business_date is more than 3 Istanbul calendar days old is
  -- owner/manager only, even for a branch_manager who otherwise holds
  -- sales.edit_all (that permission still lets them edit recent reports
  -- org-wide-in-branch; it does not extend to old ones).
  v_today := (now() at time zone 'Europe/Istanbul')::date;
  if v_report.business_date < v_today - 3 and not v_is_owner_or_manager then
    raise exception 'editing is limited to reports from today and the previous 3 Istanbul business days' using errcode = '22023';
  end if;

  select coalesce(sum(coalesce((e ->> 'amount')::numeric, 0)), 0) into v_items_total
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

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

  -- Previous stock effect is REVERSED (history kept), then the edited lines
  -- are written and applied afresh with the cost that applies now.
  perform public.inventory_reverse_sales_lines(p_report_id, p_reason);

  delete from public.sales_report_items where sales_report_id = p_report_id;
  perform public.sales_report_write_items(p_report_id, v_report.branch_id, p_items);
  perform public.inventory_apply_sales_lines(p_report_id);

  perform public.write_audit_log(
    'report_edit', 'sales_reports', p_report_id::text,
    jsonb_build_object('gross_revenue', v_report.gross_revenue, 'reconciliation_status', v_report.reconciliation_status),
    jsonb_build_object('gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    p_reason
  );

  if v_report.business_date < v_today - 3 then
    perform public.write_audit_log(
      'sales_report_backdated_override', 'sales_reports', p_report_id::text,
      null,
      jsonb_build_object(
        'branch_id', v_report.branch_id,
        'business_date', v_report.business_date,
        'days_late', (v_today - v_report.business_date)
      ),
      p_reason
    );
  end if;
end;
$$;

comment on function public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text) is
  'Edits a sales report (reason mandatory). sales.edit_own + ownership, or sales.edit_all. Backdated policy (015): editing a report more than 3 Istanbul calendar days old is owner/manager only (audited separately: sales_report_backdated_override), regardless of sales.edit_all. Recomputes reconciliation_status; previous SALE movements are reversed (never rewritten) and the edited product lines are applied afresh. Audited (report_edit).';
