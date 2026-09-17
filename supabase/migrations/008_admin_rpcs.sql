-- =============================================================================
-- 008_admin_rpcs.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Audited SECURITY DEFINER RPCs for every "critical action" identified in
--   AUTH_ARCHITECTURE.md's audited-actions list and the security review
--   (2026-09-17): role assignment/revocation, branch membership
--   assignment/removal, employee activation/deactivation, PIN reset, and
--   employee_code assignment. These replace the raw table writes that used
--   to be permitted directly by 006_rls_policies.sql for privileged roles —
--   see that file's amendment note. A raw table write can only express "has
--   this permission or not"; it cannot express the role hierarchy (manager
--   may not grant owner; branch_manager may not grant owner/manager/
--   branch_manager and may only act within their own branch) or guarantee an
--   audit_logs row is written. Every function below does both, inside one
--   transaction, and none of them are reachable except through
--   `authenticated`'s EXECUTE grant — PostgREST/Supabase clients call them
--   as `supabase.rpc(...)`, never as a raw table INSERT/UPDATE/DELETE.
--
-- Depends on: 001 (profiles.employee_code), 002 (permissions), 003
--             (branches/branch_memberships), 004 (audit_logs),
--             005 (write_audit_log, current_user_* helpers).
--
-- Rollback:
--   drop function if exists public.admin_set_employee_code(uuid, text, text);
--   drop function if exists public.admin_reset_pin(uuid, text, text);
--   drop function if exists public.admin_set_employee_active(uuid, boolean, text);
--   drop function if exists public.remove_branch_membership(uuid, uuid, text);
--   drop function if exists public.assign_branch_membership(uuid, uuid, boolean, text);
--   drop function if exists public.revoke_role(uuid, text, text);
--   drop function if exists public.assign_role(uuid, text, text);
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared authorization rule for role assignment/revocation (used by both
-- assign_role and revoke_role, so the hierarchy can't drift between them):
--
--   caller has 'owner'          -> may act on any role_key.
--   caller has 'manager'        -> may act on role_key in
--                                   ('branch_manager','cashier','employee','viewer').
--                                   May NOT act on 'owner' or 'manager'.
--   caller has 'branch_manager' -> may act on role_key in
--                                   ('cashier','employee','viewer'), AND ONLY
--                                   if caller shares a branch with p_user_id.
--                                   May NOT act on 'owner','manager','branch_manager'.
--   otherwise                    -> denied.
--
-- This is deliberately inline in both functions rather than a shared helper
-- returning a boolean, because assign/revoke need slightly different error
-- messages and both are short enough that a shared helper would only add an
-- extra function call without reducing real duplication.
-- -----------------------------------------------------------------------------

create or replace function public.assign_role(
  p_user_id uuid,
  p_role_key text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_caller_keys text[];
begin
  select array_agg(k) into v_caller_keys from public.current_user_role_keys() k;

  if v_caller_keys is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if 'owner' = any (v_caller_keys) then
    -- may assign any role
    null;
  elsif 'manager' = any (v_caller_keys) then
    if p_role_key not in ('branch_manager', 'cashier', 'employee', 'viewer') then
      raise exception 'manager may not assign role %', p_role_key using errcode = '42501';
    end if;
  elsif 'branch_manager' = any (v_caller_keys) then
    if p_role_key not in ('cashier', 'employee', 'viewer') then
      raise exception 'branch_manager may not assign role %', p_role_key using errcode = '42501';
    end if;
    if not public.current_user_shares_branch_with(p_user_id) then
      raise exception 'branch_manager may only assign roles within their own branch' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then
    raise exception 'unknown role key %', p_role_key using errcode = '22023';
  end if;

  insert into public.user_roles (user_id, role_id, granted_by)
  values (p_user_id, v_role_id, auth.uid())
  on conflict (user_id, role_id) do nothing;

  perform public.write_audit_log(
    'role_change', 'user_roles', p_user_id::text,
    null, jsonb_build_object('role', p_role_key), p_reason
  );
end;
$$;

comment on function public.assign_role(uuid, text, text) is
  'Audited role grant. Enforces: manager cannot grant owner/manager; branch_manager cannot grant owner/manager/branch_manager and may only act within a shared branch. Writes audit_logs.action = role_change.';

revoke all on function public.assign_role(uuid, text, text) from public;
grant execute on function public.assign_role(uuid, text, text) to authenticated;


create or replace function public.revoke_role(
  p_user_id uuid,
  p_role_key text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
  v_caller_keys text[];
begin
  select array_agg(k) into v_caller_keys from public.current_user_role_keys() k;

  if v_caller_keys is null then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if 'owner' = any (v_caller_keys) then
    null;
  elsif 'manager' = any (v_caller_keys) then
    if p_role_key not in ('branch_manager', 'cashier', 'employee', 'viewer') then
      raise exception 'manager may not revoke role %', p_role_key using errcode = '42501';
    end if;
  elsif 'branch_manager' = any (v_caller_keys) then
    if p_role_key not in ('cashier', 'employee', 'viewer') then
      raise exception 'branch_manager may not revoke role %', p_role_key using errcode = '42501';
    end if;
    if not public.current_user_shares_branch_with(p_user_id) then
      raise exception 'branch_manager may only revoke roles within their own branch' using errcode = '42501';
    end if;
  else
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_role_id from public.roles where key = p_role_key;
  if v_role_id is null then
    raise exception 'unknown role key %', p_role_key using errcode = '22023';
  end if;

  delete from public.user_roles where user_id = p_user_id and role_id = v_role_id;

  perform public.write_audit_log(
    'role_revoke', 'user_roles', p_user_id::text,
    jsonb_build_object('role', p_role_key), null, p_reason
  );
end;
$$;

comment on function public.revoke_role(uuid, text, text) is
  'Audited role revocation. Same hierarchy rules as assign_role(). Writes audit_logs.action = role_revoke.';

revoke all on function public.revoke_role(uuid, text, text) from public;
grant execute on function public.revoke_role(uuid, text, text) to authenticated;


create or replace function public.assign_branch_membership(
  p_user_id uuid,
  p_branch_id uuid,
  p_is_primary boolean default false,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('employee.manage_branch')
      and p_branch_id in (select public.current_user_branch_ids())
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.branch_memberships (user_id, branch_id, is_primary)
  values (p_user_id, p_branch_id, p_is_primary)
  on conflict (user_id, branch_id) do update set is_primary = excluded.is_primary;

  perform public.write_audit_log(
    'branch_assignment', 'branch_memberships', p_user_id::text,
    null, jsonb_build_object('branch_id', p_branch_id, 'is_primary', p_is_primary), p_reason
  );
end;
$$;

comment on function public.assign_branch_membership(uuid, uuid, boolean, text) is
  'Audited branch membership grant. Owner/manager act org-wide; branch_manager may only add members to a branch they themselves belong to. Writes audit_logs.action = branch_assignment.';

revoke all on function public.assign_branch_membership(uuid, uuid, boolean, text) from public;
grant execute on function public.assign_branch_membership(uuid, uuid, boolean, text) to authenticated;


create or replace function public.remove_branch_membership(
  p_user_id uuid,
  p_branch_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('employee.manage_branch')
      and p_branch_id in (select public.current_user_branch_ids())
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  delete from public.branch_memberships where user_id = p_user_id and branch_id = p_branch_id;

  perform public.write_audit_log(
    'branch_assignment', 'branch_memberships', p_user_id::text,
    jsonb_build_object('branch_id', p_branch_id), null, p_reason
  );
end;
$$;

comment on function public.remove_branch_membership(uuid, uuid, text) is
  'Audited branch membership removal. Same authorization as assign_branch_membership(). Writes audit_logs.action = branch_assignment (old_values populated, new_values null).';

revoke all on function public.remove_branch_membership(uuid, uuid, text) from public;
grant execute on function public.remove_branch_membership(uuid, uuid, text) to authenticated;


create or replace function public.admin_set_employee_active(
  p_user_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous boolean;
begin
  if not (
    public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('employee.manage_branch')
      and public.current_user_shares_branch_with(p_user_id)
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select is_active into v_previous from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile % not found', p_user_id using errcode = '22023';
  end if;

  update public.profiles set is_active = p_is_active, updated_at = now() where id = p_user_id;

  perform public.write_audit_log(
    case when p_is_active then 'employee_activation' else 'employee_deactivation' end,
    'profiles', p_user_id::text,
    jsonb_build_object('is_active', v_previous), jsonb_build_object('is_active', p_is_active), p_reason
  );
end;
$$;

comment on function public.admin_set_employee_active(uuid, boolean, text) is
  'The ONLY way to change profiles.is_active — excluded from the column-level UPDATE grant in 006, so this RPC (which runs as the function owner) is the sole path. Writes audit_logs.action = employee_activation/employee_deactivation.';

revoke all on function public.admin_set_employee_active(uuid, boolean, text) from public;
grant execute on function public.admin_set_employee_active(uuid, boolean, text) to authenticated;


create or replace function public.admin_set_employee_code(
  p_user_id uuid,
  p_employee_code text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_previous text;
begin
  if not public.current_user_is_owner_or_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_employee_code !~ '^[A-Z][0-9]{2,4}$' then
    raise exception 'invalid employee_code format: %', p_employee_code using errcode = '22023';
  end if;

  select employee_code into v_previous from public.profiles where id = p_user_id;
  if not found then
    raise exception 'profile % not found', p_user_id using errcode = '22023';
  end if;

  update public.profiles set employee_code = p_employee_code, updated_at = now() where id = p_user_id;

  perform public.write_audit_log(
    'employee_code_change', 'profiles', p_user_id::text,
    jsonb_build_object('employee_code', v_previous), jsonb_build_object('employee_code', p_employee_code), p_reason
  );
end;
$$;

comment on function public.admin_set_employee_code(uuid, text, text) is
  'The ONLY way to change profiles.employee_code (the pin-login handle) — excluded from the column-level UPDATE grant in 006. Org-wide privileged only, unlike employee.manage_branch actions, because a login handle is not branch data. Writes audit_logs.action = employee_code_change.';

revoke all on function public.admin_set_employee_code(uuid, text, text) from public;
grant execute on function public.admin_set_employee_code(uuid, text, text) to authenticated;


create or replace function public.admin_reset_pin(
  p_user_id uuid,
  p_new_pin text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    public.current_user_is_owner_or_manager()
    or (
      public.current_user_has_permission('employee.manage_branch')
      and public.current_user_shares_branch_with(p_user_id)
    )
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_new_pin !~ '^[0-9]{4,6}$' then
    raise exception 'PIN must be 4-6 digits' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile % not found', p_user_id using errcode = '22023';
  end if;

  insert into public.pin_credentials (user_id, pin_hash, failed_attempts, locked_until, last_attempt_at, updated_at)
  values (p_user_id, crypt(p_new_pin, gen_salt('bf')), 0, null, null, now())
  on conflict (user_id) do update
    set pin_hash = excluded.pin_hash,
        failed_attempts = 0,
        locked_until = null,
        last_attempt_at = null,
        updated_at = now();

  -- Never log the PIN itself, hashed or otherwise, in old_values/new_values.
  perform public.write_audit_log('pin_reset', 'pin_credentials', p_user_id::text, null, null, p_reason);
end;
$$;

comment on function public.admin_reset_pin(uuid, text, text) is
  'The ONLY client-reachable way to set/reset a PIN. Validates 4-6 digit format, hashes with pgcrypto before storage, clears any existing lockout. Never logs the PIN value. Writes audit_logs.action = pin_reset.';

revoke all on function public.admin_reset_pin(uuid, text, text) from public;
grant execute on function public.admin_reset_pin(uuid, text, text) to authenticated;
