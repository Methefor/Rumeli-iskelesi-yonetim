-- =============================================================================
-- Bootstrap of the FIRST owner (one-time, service-role only)
-- =============================================================================
-- The normal provisioning path (employee-provision) needs an authorized caller,
-- so the first owner cannot be created through it. This function is the
-- server-side atomic step of identity-data/bootstrap-owner.mjs. It is NOT a
-- public RPC: execute is revoked from public/anon/authenticated and granted to
-- service_role only, and it refuses to do anything once ANY owner role exists,
-- so even a leaked service key cannot mint a second owner through it.
--
-- One transaction: profile + owner role + PIN hash + audit row, or nothing.
-- The PIN arrives only as the argument of this call, is hashed with bcrypt
-- inside the database and is never stored, returned or logged by this function.
-- The audit actor/subject is the newly created owner (self-bootstrap).
-- =============================================================================
create or replace function public.internal_bootstrap_owner(
  p_user_id uuid,
  p_employee_code text,
  p_full_name text,
  p_pin text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_employee_code, '')));
  v_role uuid;
begin
  if exists (
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id where r.key = 'owner'
  ) then
    raise exception 'an owner already exists: bootstrap is closed' using errcode = '42501';
  end if;
  if v_code !~ '^[A-Z][0-9]{2,4}$' or p_pin !~ '^[0-9]{4,6}$'
     or p_full_name is null or length(trim(p_full_name)) = 0 or length(p_full_name) > 100
     or p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'invalid bootstrap data' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id)
     or exists (select 1 from public.profiles where id = p_user_id or employee_code = v_code) then
    raise exception 'bootstrap identity conflict' using errcode = '23505';
  end if;
  select id into v_role from public.roles where key = 'owner';
  if v_role is null then
    raise exception 'owner role is not defined' using errcode = '22023';
  end if;

  insert into public.profiles (id, full_name, employee_code, is_active)
  values (p_user_id, trim(p_full_name), v_code, true);
  insert into public.pin_credentials (user_id, pin_hash)
  values (p_user_id, extensions.crypt(p_pin, extensions.gen_salt('bf')));
  insert into public.user_roles (user_id, role_id, granted_by) values (p_user_id, v_role, p_user_id);
  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, reason)
  values (p_user_id, 'owner_bootstrap', 'profiles', p_user_id::text, null,
          jsonb_build_object('employee_code', v_code, 'role', 'owner'), trim(p_reason));
end;
$$;

revoke all on function public.internal_bootstrap_owner(uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.internal_bootstrap_owner(uuid, text, text, text, text) to service_role;

comment on function public.internal_bootstrap_owner(uuid, text, text, text, text) is
  'One-time, service-role-only creation of the first owner. Refuses once any owner role exists. Atomic.';
