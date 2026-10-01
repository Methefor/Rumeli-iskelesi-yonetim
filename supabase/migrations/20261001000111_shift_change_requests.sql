-- Cashiers/employees request a future shift change with a mandatory reason.
-- Managers decide in one audited transaction; direct client writes are denied.

create table public.shift_change_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references public.profiles (id),
  current_assignment_id uuid not null references public.shift_assignments (id),
  requested_shift_id uuid not null references public.shifts (id),
  reason text not null check (length(trim(reason)) between 5 and 500),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decision_note text check (decision_note is null or length(trim(decision_note)) between 3 and 500),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.shift_change_requests is
  'Audited employee requests to replace one future/current shift assignment with another shift in the same branch.';

create unique index shift_change_requests_one_pending_per_assignment
  on public.shift_change_requests (current_assignment_id)
  where status = 'pending';
create index shift_change_requests_requester_created
  on public.shift_change_requests (requester_user_id, created_at desc);
create index shift_change_requests_requested_shift
  on public.shift_change_requests (requested_shift_id);

create trigger set_updated_at before update on public.shift_change_requests
  for each row execute function public.set_updated_at();

alter table public.shift_change_requests enable row level security;

create policy shift_change_requests_select_scoped
on public.shift_change_requests
for select
to authenticated
using (
  requester_user_id = (select auth.uid())
  or public.current_user_is_owner_or_manager()
  or (
    public.current_user_has_permission('shift.manage')
    and public.shift_branch_id(
      (select sa.shift_id from public.shift_assignments sa where sa.id = current_assignment_id)
    ) in (select public.current_user_branch_ids())
  )
);

-- RLS deliberately has no INSERT/UPDATE/DELETE policy. The following RPCs
-- are the only write paths, so authorization and audit cannot be bypassed.
revoke all on table public.shift_change_requests from public, anon;
grant select on table public.shift_change_requests to authenticated;

create or replace function public.create_shift_change_request(
  p_current_assignment_id uuid,
  p_requested_shift_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_current record;
  v_requested record;
  v_request_id uuid;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) not between 5 and 500 then
    raise exception 'reason must be between 5 and 500 characters' using errcode = '22023';
  end if;

  select sa.id, sa.user_id, sa.status, s.id as shift_id, s.branch_id,
         s.business_date, s.status as shift_status
    into v_current
  from public.shift_assignments sa
  join public.shifts s on s.id = sa.shift_id
  where sa.id = p_current_assignment_id;

  if not found or v_current.user_id <> v_actor then
    raise exception 'not authorized for this assignment' using errcode = '42501';
  end if;
  if v_current.status = 'cancelled' or v_current.shift_status = 'cancelled' then
    raise exception 'current assignment is cancelled' using errcode = '22023';
  end if;
  if v_current.business_date < v_today then
    raise exception 'past assignments cannot be changed' using errcode = '22023';
  end if;

  select s.id, s.branch_id, s.business_date, s.status
    into v_requested
  from public.shifts s
  where s.id = p_requested_shift_id;

  if not found or v_requested.status = 'cancelled' then
    raise exception 'requested shift is not available' using errcode = '22023';
  end if;
  if v_requested.id = v_current.shift_id then
    raise exception 'requested shift must differ from current shift' using errcode = '22023';
  end if;
  if v_requested.branch_id <> v_current.branch_id then
    raise exception 'requested shift must belong to the same branch' using errcode = '22023';
  end if;
  if v_requested.business_date < v_today then
    raise exception 'past shifts cannot be requested' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.shift_assignments sa
    where sa.shift_id = p_requested_shift_id
      and sa.user_id = v_actor
      and sa.status <> 'cancelled'
  ) then
    raise exception 'requester is already assigned to the requested shift' using errcode = '23505';
  end if;

  insert into public.shift_change_requests (
    requester_user_id, current_assignment_id, requested_shift_id, reason
  ) values (
    v_actor, p_current_assignment_id, p_requested_shift_id, trim(p_reason)
  ) returning id into v_request_id;

  perform public.write_audit_log(
    'shift_change_request_created', 'shift_change_requests', v_request_id::text,
    null,
    jsonb_build_object(
      'current_assignment_id', p_current_assignment_id,
      'requested_shift_id', p_requested_shift_id,
      'status', 'pending'
    ),
    trim(p_reason)
  );

  return v_request_id;
end;
$$;

comment on function public.create_shift_change_request(uuid, uuid, text) is
  'Creates an own-assignment, same-branch, non-past shift change request. Reason is mandatory and the action is audited.';
revoke all on function public.create_shift_change_request(uuid, uuid, text) from public, anon;
grant execute on function public.create_shift_change_request(uuid, uuid, text) to authenticated;

create or replace function public.decide_shift_change_request(
  p_request_id uuid,
  p_decision text,
  p_decision_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_request record;
  v_branch_id uuid;
  v_new_assignment_id uuid;
  v_today date := (timezone('Europe/Istanbul', now()))::date;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'decision must be approved or rejected' using errcode = '22023';
  end if;
  if p_decision = 'rejected'
     and (p_decision_note is null or length(trim(p_decision_note)) not between 3 and 500) then
    raise exception 'a rejection note between 3 and 500 characters is required' using errcode = '22023';
  end if;
  if p_decision_note is not null and length(trim(p_decision_note)) > 500 then
    raise exception 'decision note cannot exceed 500 characters' using errcode = '22023';
  end if;
  if p_decision_note is not null
     and length(trim(p_decision_note)) > 0
     and length(trim(p_decision_note)) < 3 then
    raise exception 'decision note must be at least 3 characters' using errcode = '22023';
  end if;

  select r.*, current_sa.shift_id as current_shift_id,
         current_sa.status as current_assignment_status,
         current_s.branch_id,
         current_s.business_date as current_business_date,
         current_s.status as current_shift_status,
         requested_s.status as requested_shift_status,
         requested_s.business_date as requested_business_date,
         requested_s.branch_id as requested_branch_id
    into v_request
  from public.shift_change_requests r
  join public.shift_assignments current_sa on current_sa.id = r.current_assignment_id
  join public.shifts current_s on current_s.id = current_sa.shift_id
  join public.shifts requested_s on requested_s.id = r.requested_shift_id
  where r.id = p_request_id
  for update of r;

  if not found then
    raise exception 'shift change request not found' using errcode = '22023';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'shift change request is no longer pending' using errcode = '22023';
  end if;

  v_branch_id := v_request.branch_id;
  if not (
    public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('shift.manage')
      and v_branch_id in (select public.current_user_branch_ids())
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_decision = 'approved' then
    if v_request.current_assignment_status = 'cancelled'
       or v_request.current_shift_status = 'cancelled'
       or v_request.requested_shift_status = 'cancelled'
       or v_request.requested_branch_id <> v_branch_id then
      raise exception 'request is no longer applicable' using errcode = '22023';
    end if;
    if v_request.current_business_date < v_today
       or v_request.requested_business_date < v_today then
      raise exception 'past shift changes cannot be approved' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.shift_assignments sa
      where sa.shift_id = v_request.requested_shift_id
        and sa.user_id = v_request.requester_user_id
        and sa.status <> 'cancelled'
    ) then
      raise exception 'requester is already assigned to the requested shift' using errcode = '23505';
    end if;

    update public.shift_assignments
      set status = 'cancelled'
      where id = v_request.current_assignment_id;

    insert into public.shift_assignments (shift_id, user_id, status, assigned_by)
      values (v_request.requested_shift_id, v_request.requester_user_id, 'assigned', v_actor)
      on conflict (shift_id, user_id) do update
        set status = 'assigned', assigned_by = excluded.assigned_by,
            is_on_time = null, late_override = null, late_override_reason = null
      returning id into v_new_assignment_id;
  end if;

  update public.shift_change_requests
    set status = p_decision,
        decision_note = nullif(trim(p_decision_note), ''),
        decided_by = v_actor,
        decided_at = now()
    where id = p_request_id;

  perform public.write_audit_log(
    'shift_change_request_decided', 'shift_change_requests', p_request_id::text,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object(
      'status', p_decision,
      'current_assignment_id', v_request.current_assignment_id,
      'new_assignment_id', v_new_assignment_id,
      'requested_shift_id', v_request.requested_shift_id
    ),
    coalesce(nullif(trim(p_decision_note), ''), p_decision)
  );

  return v_new_assignment_id;
end;
$$;

comment on function public.decide_shift_change_request(uuid, text, text) is
  'Branch-scoped shift managers approve/reject a pending request. Approval atomically cancels the old assignment, creates/reactivates the requested assignment, and audits the decision.';
revoke all on function public.decide_shift_change_request(uuid, text, text) from public, anon;
grant execute on function public.decide_shift_change_request(uuid, text, text) to authenticated;
