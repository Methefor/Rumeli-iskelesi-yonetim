-- =============================================================================
-- 016_management_center.sql
-- =============================================================================
-- STATUS: PREPARED ONLY (Stage 2). Not applied to any hosted Supabase project.
-- Migrations 001-015 are untouched; everything below supersedes them by
-- `create or replace` / drop+create in this new file.
--
-- Purpose
--   1. Deactivated users are blocked SERVER-SIDE, centrally:
--        a. the four current_user_* helpers become inactive-aware, so every
--           policy/RPC built on them denies an inactive user;
--        b. a PostgREST pre-request hook (enforce_active_user) rejects EVERY
--           Data API/RPC call made with an inactive user's still-valid JWT,
--           including code paths that read auth.uid() directly;
--        c. admin_set_employee_active also bans the auth user and deletes
--           their sessions, so the refresh token stops working too;
--        d. the avatars-v4 write policies check activity.
--      The client-side sign-out (Stage 1) is now only an extra layer.
--   2. Management RPC hardening (replaces 008's bodies, same signatures):
--        - reason is mandatory for every critical action;
--        - nobody may modify themselves (role, active flag, code, PIN,
--          branches);
--        - rank rule: the actor's highest role must be STRICTLY above the
--          target's (owner 4 > manager 3 > branch_manager 2 > others 1), so a
--          manager cannot touch an owner or another manager, and a
--          branch_manager cannot touch a manager/owner/branch_manager — this
--          closes account-takeover via admin_reset_pin/deactivate on a
--          higher-ranked user that 008 allowed;
--        - owners are protected: no RPC changes an owner's roles, activity,
--          code or PIN (there is no in-app owner demotion path by design),
--          and a last-active-owner guard is kept as defense in depth;
--        - branch_manager stays limited to shared branches and to the
--          cashier/employee/viewer roles (unchanged scope, not widened).
--   3. internal_provision_employee(): the single transactional DB step of the
--      `employee-provision` Edge Function (service_role only).
--   4. Audited settings RPCs for shift definitions and reconciliation
--      thresholds; raw client writes to those two tables are revoked.
--
-- Depends on: 001-015.
--
-- Rollback (local only): drop the functions created here; re-run 008's
-- bodies; `alter role authenticator reset pgrst.db_pre_request;`; restore 007
-- avatar policies and the 005 helpers from their original files.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Active-user enforcement
-- ---------------------------------------------------------------------------
create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_active
  );
$$;
revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.current_user_role_keys()
returns setof text
language sql
stable
security definer
set search_path = public
as $$
  select r.key
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  join public.profiles p on p.id = ur.user_id and p.is_active
  where ur.user_id = auth.uid();
$$;

create or replace function public.current_user_has_permission(p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles pr on pr.id = ur.user_id and pr.is_active
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key = p_permission_key
  );
$$;

create or replace function public.current_user_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select bm.branch_id
  from public.branch_memberships bm
  join public.profiles p on p.id = bm.user_id and p.is_active
  where bm.user_id = auth.uid();
$$;

create or replace function public.current_user_shares_branch_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.branch_memberships mine
    join public.profiles me on me.id = mine.user_id and me.is_active
    join public.branch_memberships theirs on theirs.branch_id = mine.branch_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

-- PostgREST calls this before EVERY Data API / RPC request (configured below).
-- An inactive user's still-valid JWT therefore cannot reach any table or
-- function, including ones that read auth.uid() directly. A JWT for a user
-- with no profile row is also refused (fail closed); service_role and anon
-- carry no user id and are unaffected.
create or replace function public.enforce_active_user()
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = v_uid and is_active) then
    raise exception 'account inactive' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.enforce_active_user() from public;
grant execute on function public.enforce_active_user() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.enforce_active_user';
notify pgrst, 'reload config';

-- Avatar writes require an active user (Storage API does not go through
-- PostgREST, so the hook above does not cover it).
drop policy if exists avatars_v4_insert on storage.objects;
drop policy if exists avatars_v4_update on storage.objects;
drop policy if exists avatars_v4_delete on storage.objects;

create policy avatars_v4_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars-v4'
    and public.current_user_is_active()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  );

create policy avatars_v4_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars-v4'
    and public.current_user_is_active()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  )
  with check (
    bucket_id = 'avatars-v4'
    and public.current_user_is_active()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  );

create policy avatars_v4_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars-v4'
    and public.current_user_is_active()
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Rank model + management guard (internal, never client-callable)
-- ---------------------------------------------------------------------------
create or replace function public.role_rank(p_key text)
returns integer
language sql
immutable
as $$
  select case p_key
    when 'owner' then 4
    when 'manager' then 3
    when 'branch_manager' then 2
    when 'cashier' then 1
    when 'employee' then 1
    when 'viewer' then 1
    else 0
  end;
$$;

create or replace function public.user_rank(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(public.role_rank(r.key)), 0)
  from public.user_roles ur
  join public.roles r on r.id = ur.role_id
  where ur.user_id = p_user_id;
$$;

create or replace function public.current_user_rank()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select case when public.current_user_is_active() then public.user_rank(auth.uid()) else 0 end;
$$;

revoke all on function public.role_rank(text) from public, anon, authenticated;
revoke all on function public.user_rank(uuid) from public, anon, authenticated;
revoke all on function public.current_user_rank() from public, anon, authenticated;

-- One place that decides "may the caller manage THIS user at all".
create or replace function public.admin_guard_target(p_target uuid, p_reason text, p_branch_id uuid default null)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_actor_rank integer := public.current_user_rank();
  v_target_rank integer;
begin
  if v_actor_rank < 2 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_actor_rank >= 3 and not public.current_user_has_permission('employee.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for this action' using errcode = '22023';
  end if;
  if p_target = auth.uid() then
    raise exception 'you cannot modify your own account here' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_target) then
    raise exception 'profile not found' using errcode = '22023';
  end if;
  v_target_rank := public.user_rank(p_target);
  if v_actor_rank <= v_target_rank then
    raise exception 'not authorized for a user of equal or higher rank' using errcode = '42501';
  end if;
  if v_actor_rank = 2 then
    if not public.current_user_has_permission('employee.manage_branch')
       or not public.current_user_shares_branch_with(p_target) then
      raise exception 'branch_manager may only manage members of their own branch' using errcode = '42501';
    end if;
    if p_branch_id is not null and p_branch_id not in (select public.current_user_branch_ids()) then
      raise exception 'branch_manager may only act within their own branch' using errcode = '42501';
    end if;
  end if;
  return v_actor_rank;
end;
$$;
revoke all on function public.admin_guard_target(uuid, text, uuid) from public, anon, authenticated;

create or replace function public.admin_guard_last_owner(p_target uuid)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.user_rank(p_target) = 4 and (
    select count(distinct ur.user_id)
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id and r.key = 'owner'
    join public.profiles p on p.id = ur.user_id and p.is_active
  ) <= 1 then
    raise exception 'the last active owner cannot be removed or deactivated' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.admin_guard_last_owner(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Hardened management RPCs (same signatures/grants as 008)
-- ---------------------------------------------------------------------------
create or replace function public.assign_role(p_user_id uuid, p_role_key text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_rank integer;
  v_before jsonb;
begin
  v_rank := public.admin_guard_target(p_user_id, p_reason);
  if v_rank = 4 then
    null;
  elsif v_rank = 3 then
    if p_role_key not in ('branch_manager', 'cashier', 'employee', 'viewer') then
      raise exception 'manager may not assign role %', p_role_key using errcode = '42501';
    end if;
  else
    if p_role_key not in ('cashier', 'employee', 'viewer') then
      raise exception 'branch_manager may not assign role %', p_role_key using errcode = '42501';
    end if;
  end if;
  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then
    raise exception 'unknown role key %', p_role_key using errcode = '22023';
  end if;
  if v_rank <= public.role_rank(p_role_key) then
    raise exception 'not authorized to grant an equal or higher role' using errcode = '42501';
  end if;
  select coalesce(jsonb_agg(r.key order by r.key), '[]'::jsonb) into v_before
  from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user_id;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (p_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;

  perform public.write_audit_log(
    'role_change', 'user_roles', p_user_id::text,
    jsonb_build_object('roles', v_before),
    jsonb_build_object('roles', (select coalesce(jsonb_agg(r.key order by r.key), '[]'::jsonb)
      from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user_id),
      'granted', p_role_key),
    p_reason
  );
end;
$$;

create or replace function public.revoke_role(p_user_id uuid, p_role_key text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_rank integer;
  v_before jsonb;
begin
  v_rank := public.admin_guard_target(p_user_id, p_reason);
  if v_rank = 3 and p_role_key not in ('branch_manager', 'cashier', 'employee', 'viewer') then
    raise exception 'manager may not revoke role %', p_role_key using errcode = '42501';
  elsif v_rank = 2 and p_role_key not in ('cashier', 'employee', 'viewer') then
    raise exception 'branch_manager may not revoke role %', p_role_key using errcode = '42501';
  end if;
  if p_role_key = 'owner' then
    perform public.admin_guard_last_owner(p_user_id);
  end if;
  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then
    raise exception 'unknown role key %', p_role_key using errcode = '22023';
  end if;
  select coalesce(jsonb_agg(r.key order by r.key), '[]'::jsonb) into v_before
  from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user_id;

  delete from public.user_roles where user_id = p_user_id and role_id = v_role_id;

  perform public.write_audit_log(
    'role_revoke', 'user_roles', p_user_id::text,
    jsonb_build_object('roles', v_before, 'revoked', p_role_key),
    jsonb_build_object('roles', (select coalesce(jsonb_agg(r.key order by r.key), '[]'::jsonb)
      from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_user_id)),
    p_reason
  );
end;
$$;

create or replace function public.assign_branch_membership(
  p_user_id uuid, p_branch_id uuid, p_is_primary boolean default false, p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard_target(p_user_id, p_reason, p_branch_id);
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'unknown branch' using errcode = '22023';
  end if;
  insert into public.branch_memberships (user_id, branch_id, is_primary)
  values (p_user_id, p_branch_id, coalesce(p_is_primary, false))
  on conflict (user_id, branch_id) do update set is_primary = excluded.is_primary;
  perform public.write_audit_log(
    'branch_assignment', 'branch_memberships', p_user_id::text,
    null, jsonb_build_object('branch_id', p_branch_id, 'is_primary', coalesce(p_is_primary, false)), p_reason
  );
end;
$$;

create or replace function public.remove_branch_membership(p_user_id uuid, p_branch_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard_target(p_user_id, p_reason, p_branch_id);
  delete from public.branch_memberships where user_id = p_user_id and branch_id = p_branch_id;
  perform public.write_audit_log(
    'branch_assignment', 'branch_memberships', p_user_id::text,
    jsonb_build_object('branch_id', p_branch_id), null, p_reason
  );
end;
$$;

create or replace function public.admin_set_employee_active(p_user_id uuid, p_is_active boolean, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  perform public.admin_guard_target(p_user_id, p_reason);
  select is_active into v_previous from public.profiles where id = p_user_id;
  if not p_is_active then
    perform public.admin_guard_last_owner(p_user_id);
  end if;
  update public.profiles set is_active = p_is_active, updated_at = now() where id = p_user_id;

  -- Also stop the identity provider from issuing/refreshing sessions: ban and
  -- drop existing sessions (their refresh tokens go with them). The Data API
  -- already refuses the old JWT via enforce_active_user().
  update auth.users
    set banned_until = case when p_is_active then null else 'infinity'::timestamptz end
    where id = p_user_id;
  if not p_is_active then
    delete from auth.sessions where user_id = p_user_id;
  end if;

  perform public.write_audit_log(
    case when p_is_active then 'employee_activation' else 'employee_deactivation' end,
    'profiles', p_user_id::text,
    jsonb_build_object('is_active', v_previous), jsonb_build_object('is_active', p_is_active), p_reason
  );
end;
$$;

create or replace function public.admin_set_employee_code(p_user_id uuid, p_employee_code text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
  v_code text := upper(trim(p_employee_code));
begin
  if public.current_user_rank() < 3 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  perform public.admin_guard_target(p_user_id, p_reason);
  if v_code !~ '^[A-Z][0-9]{2,4}$' then
    raise exception 'invalid employee_code format' using errcode = '22023';
  end if;
  select employee_code into v_previous from public.profiles where id = p_user_id;
  update public.profiles set employee_code = v_code, updated_at = now() where id = p_user_id;
  perform public.write_audit_log(
    'employee_code_change', 'profiles', p_user_id::text,
    jsonb_build_object('employee_code', v_previous), jsonb_build_object('employee_code', v_code), p_reason
  );
end;
$$;

create or replace function public.admin_reset_pin(p_user_id uuid, p_new_pin text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.admin_guard_target(p_user_id, p_reason);
  if p_new_pin is null or p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits' using errcode = '22023';
  end if;
  insert into public.pin_credentials (user_id, pin_hash, failed_attempts, locked_until, last_attempt_at, updated_at)
  values (p_user_id, extensions.crypt(p_new_pin, extensions.gen_salt('bf')), 0, null, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null,
        last_attempt_at = null, updated_at = now();
  perform public.write_audit_log('pin_reset', 'pin_credentials', p_user_id::text, null, null, p_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Employee provisioning (called ONLY by the employee-provision Edge
--    Function with a service_role key; the actor id is the caller's
--    JWT-verified identity resolved by that function, never browser input).
-- ---------------------------------------------------------------------------
create or replace function public.internal_provision_employee(
  p_actor uuid,
  p_user_id uuid,
  p_employee_code text,
  p_full_name text,
  p_pin text,
  p_role_key text,
  p_branch_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_rank integer;
  v_role_id uuid;
  v_branch uuid;
  v_code text := upper(trim(p_employee_code));
  v_branches uuid[] := coalesce(p_branch_ids, '{}');
begin
  if not exists (select 1 from public.profiles where id = p_actor and is_active) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select coalesce(max(public.role_rank(r.key)), 0) into v_actor_rank
  from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p_actor;
  if v_actor_rank < 2 then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_actor_rank >= 3 and not exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_actor and p.key = 'employee.manage'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  elsif v_actor_rank = 2 and not exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = p_actor and p.key = 'employee.manage_branch'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for this action' using errcode = '22023';
  end if;
  if v_code !~ '^[A-Z][0-9]{2,4}$' or p_pin !~ '^[0-9]{4,6}$'
     or p_full_name is null or length(trim(p_full_name)) = 0 or length(p_full_name) > 100 then
    raise exception 'invalid employee data' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id)
     or exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'invalid employee data' using errcode = '22023';
  end if;

  if v_actor_rank = 4 then
    null;
  elsif v_actor_rank = 3 then
    if p_role_key not in ('branch_manager', 'cashier', 'employee', 'viewer') then
      raise exception 'manager may not create role %', p_role_key using errcode = '42501';
    end if;
  else
    if p_role_key not in ('cashier', 'employee', 'viewer') then
      raise exception 'branch_manager may not create role %', p_role_key using errcode = '42501';
    end if;
  end if;
  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then
    raise exception 'unknown role' using errcode = '22023';
  end if;
  if v_actor_rank <= public.role_rank(p_role_key) then
    raise exception 'not authorized to create an equal or higher role' using errcode = '42501';
  end if;

  if p_role_key not in ('owner', 'manager') and cardinality(v_branches) = 0 then
    raise exception 'at least one branch is required' using errcode = '22023';
  end if;
  foreach v_branch in array v_branches loop
    if not exists (select 1 from public.branches where id = v_branch) then
      raise exception 'unknown branch' using errcode = '22023';
    end if;
    if v_actor_rank = 2 and not exists (
      select 1 from public.branch_memberships where user_id = p_actor and branch_id = v_branch
    ) then
      raise exception 'branch_manager may only add members to their own branch' using errcode = '42501';
    end if;
  end loop;

  insert into public.profiles (id, full_name, employee_code, is_active)
  values (p_user_id, trim(p_full_name), v_code, true);
  insert into public.pin_credentials (user_id, pin_hash)
  values (p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  insert into public.user_roles (user_id, role_id, granted_by) values (p_user_id, v_role_id, p_actor);
  insert into public.branch_memberships (user_id, branch_id, is_primary)
  select p_user_id, b, (row_number() over () = 1) from unnest(v_branches) as b;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, reason)
  values (
    p_actor, 'employee_create', 'profiles', p_user_id::text, null,
    jsonb_build_object('employee_code', v_code, 'role', p_role_key, 'branch_ids', to_jsonb(v_branches)),
    trim(p_reason)
  );
end;
$$;
revoke all on function public.internal_provision_employee(uuid, uuid, text, text, text, text, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.internal_provision_employee(uuid, uuid, text, text, text, text, uuid[], text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. Audited settings RPCs (raw client writes to these tables are revoked)
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_shift_definition(
  p_id uuid,
  p_name text,
  p_start_hour smallint, p_start_minute smallint,
  p_end_hour smallint, p_end_minute smallint,
  p_cutoff_hour smallint, p_cutoff_minute smallint, p_cutoff_day_offset smallint,
  p_is_active boolean,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.shift_definitions%rowtype;
begin
  select * into v_old from public.shift_definitions where id = p_id;
  if not found then
    raise exception 'shift definition not found' using errcode = '22023';
  end if;
  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('shift.manage') and v_old.branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for this action' using errcode = '22023';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'invalid shift definition' using errcode = '22023';
  end if;
  update public.shift_definitions
    set name = trim(p_name), start_hour = p_start_hour, start_minute = p_start_minute,
        end_hour = p_end_hour, end_minute = p_end_minute, cutoff_hour = p_cutoff_hour,
        cutoff_minute = p_cutoff_minute, cutoff_day_offset = p_cutoff_day_offset,
        is_active = coalesce(p_is_active, v_old.is_active), updated_by = auth.uid()
    where id = p_id;
  perform public.write_audit_log(
    'shift_definition_change', 'shift_definitions', p_id::text,
    jsonb_build_object('branch_id', v_old.branch_id, 'name', v_old.name, 'start', v_old.start_hour * 60 + v_old.start_minute,
      'end', v_old.end_hour * 60 + v_old.end_minute, 'cutoff_hour', v_old.cutoff_hour, 'cutoff_minute', v_old.cutoff_minute,
      'cutoff_day_offset', v_old.cutoff_day_offset, 'is_active', v_old.is_active),
    jsonb_build_object('branch_id', v_old.branch_id, 'name', trim(p_name), 'start', p_start_hour * 60 + p_start_minute,
      'end', p_end_hour * 60 + p_end_minute, 'cutoff_hour', p_cutoff_hour, 'cutoff_minute', p_cutoff_minute,
      'cutoff_day_offset', p_cutoff_day_offset, 'is_active', coalesce(p_is_active, v_old.is_active)),
    p_reason
  );
end;
$$;

create or replace function public.admin_set_reconciliation_thresholds(
  p_branch_id uuid, p_warning numeric, p_error numeric, p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.reconciliation_thresholds%rowtype;
begin
  if not public.current_user_has_permission('settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for this action' using errcode = '22023';
  end if;
  if p_warning is null or p_error is null or p_warning < 0 or p_error < p_warning or p_error > 100 then
    raise exception 'invalid thresholds' using errcode = '22023';
  end if;
  select * into v_old from public.reconciliation_thresholds where branch_id = p_branch_id;
  if not found then
    raise exception 'thresholds not found for branch' using errcode = '22023';
  end if;
  update public.reconciliation_thresholds
    set warning_percentage = p_warning, error_percentage = p_error, updated_by = auth.uid()
    where branch_id = p_branch_id;
  perform public.write_audit_log(
    'reconciliation_threshold_change', 'reconciliation_thresholds', p_branch_id::text,
    jsonb_build_object('warning_percentage', v_old.warning_percentage, 'error_percentage', v_old.error_percentage),
    jsonb_build_object('warning_percentage', p_warning, 'error_percentage', p_error),
    p_reason
  );
end;
$$;

revoke all on function public.admin_update_shift_definition(uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, smallint, boolean, text) from public, anon;
grant execute on function public.admin_update_shift_definition(uuid, text, smallint, smallint, smallint, smallint, smallint, smallint, smallint, boolean, text) to authenticated;
revoke all on function public.admin_set_reconciliation_thresholds(uuid, numeric, numeric, text) from public, anon;
grant execute on function public.admin_set_reconciliation_thresholds(uuid, numeric, numeric, text) to authenticated;

revoke insert, update, delete, truncate on public.shift_definitions from anon, authenticated;
revoke insert, update, delete, truncate on public.reconciliation_thresholds from anon, authenticated;

-- Cheap pre-check for the Edge Function so an unauthorized caller never
-- causes an auth user to be created (and then cleaned up).
create or replace function public.internal_actor_rank(p_actor uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  with actor as (
    select public.user_rank(p_actor) as rank
    where exists (select 1 from public.profiles where id = p_actor and is_active)
  )
  select coalesce((
    select case
      when rank >= 3 and exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = p_actor and p.key = 'employee.manage'
      ) then rank
      when rank = 2 and exists (
        select 1
        from public.user_roles ur
        join public.role_permissions rp on rp.role_id = ur.role_id
        join public.permissions p on p.id = rp.permission_id
        where ur.user_id = p_actor and p.key = 'employee.manage_branch'
      ) then rank
      else 0
    end
    from actor
  ), 0);
$$;
revoke all on function public.internal_actor_rank(uuid) from public, anon, authenticated;
grant execute on function public.internal_actor_rank(uuid) to service_role;
