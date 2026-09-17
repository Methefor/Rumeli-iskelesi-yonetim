-- =============================================================================
-- 005_auth_helpers.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   1. Helper functions used inside RLS policies (006) to check the current
--      user's roles/permissions/branches without RLS-recursion problems.
--   2. The PIN mechanism: a `pin_credentials` table storing only a one-way
--      hash (never a plaintext PIN, unlike legacy `cashiers.pin` /
--      `admins.pin`), plus a `verify_pin` RPC that does server-side
--      verification with rate limiting/lockout. See "Why an Edge Function"
--      at the bottom of this file and AUTH_ARCHITECTURE.md for the full
--      login-flow design — this migration only prepares the DB side.
--
-- Depends on: 001 (profiles), 002 (permissions/role_permissions),
--             003 (branch_memberships), 004 (audit_logs).
-- Required by: 006_rls_policies.sql.
--
-- Rollback:
--   drop function if exists public.verify_pin(uuid, text);
--   drop function if exists public.write_audit_log(text, text, text, jsonb, jsonb, text);
--   drop function if exists public.current_user_shares_branch_with(uuid);
--   drop function if exists public.current_user_is_owner_or_manager();
--   drop function if exists public.current_user_branch_ids();
--   drop function if exists public.current_user_has_permission(text);
--   drop function if exists public.current_user_role_keys();
--   drop table if exists public.pin_credentials;
--
-- Amended 2026-09-17 (security review): added current_user_shares_branch_with()
-- for branch-scoped authorization checks in 006 and 008. Still not applied
-- anywhere, so amending in place is safe.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper functions for RLS policies.
--
-- These are SECURITY DEFINER with a locked-down search_path — the standard
-- Supabase pattern for functions called from inside a policy's USING/WITH
-- CHECK clause. Without SECURITY DEFINER, a policy on (say) `profiles` that
-- calls a function reading `user_roles` would need `user_roles` to have its
-- own permissive-enough RLS policy for the caller, which risks accidental
-- over-exposure or recursive policy evaluation. Every function below reads
-- ONLY data about auth.uid() itself — none of them take a target-user
-- parameter, so there is no way to use them to probe another user's roles
-- or branches.
-- -----------------------------------------------------------------------------

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
  where ur.user_id = auth.uid();
$$;

comment on function public.current_user_role_keys() is
  'Role keys for the calling user only (auth.uid()). SECURITY DEFINER to avoid RLS recursion — never accepts a target user id.';

revoke all on function public.current_user_role_keys() from public;
grant execute on function public.current_user_role_keys() to authenticated;


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
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and p.key = p_permission_key
  );
$$;

comment on function public.current_user_has_permission(text) is
  'Whether the calling user holds a permission key, via any of their roles.';

revoke all on function public.current_user_has_permission(text) from public;
grant execute on function public.current_user_has_permission(text) to authenticated;


create or replace function public.current_user_branch_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select bm.branch_id
  from public.branch_memberships bm
  where bm.user_id = auth.uid();
$$;

comment on function public.current_user_branch_ids() is
  'Branch ids the calling user is a member of.';

revoke all on function public.current_user_branch_ids() from public;
grant execute on function public.current_user_branch_ids() to authenticated;


create or replace function public.current_user_is_owner_or_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.current_user_role_keys() k
    where k in ('owner', 'manager')
  );
$$;

comment on function public.current_user_is_owner_or_manager() is
  'Convenience wrapper — org-wide (non branch-restricted) management access.';

revoke all on function public.current_user_is_owner_or_manager() from public;
grant execute on function public.current_user_is_owner_or_manager() to authenticated;


-- Added 2026-09-17 (security review): the branch-scoped counterpart to
-- current_user_is_owner_or_manager(). Used by 006's profiles policies and by
-- 008's admin RPCs to check whether the caller may act on p_user_id under
-- 'employee.manage_branch' — i.e. whether caller and target share ANY
-- branch membership. Deliberately takes a target user id (unlike the other
-- helpers above): it never reveals which branch, only a boolean overlap, so
-- it cannot be used to enumerate another user's branches.
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
    join public.branch_memberships theirs on theirs.branch_id = mine.branch_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

comment on function public.current_user_shares_branch_with(uuid) is
  'Whether the calling user shares at least one branch membership with p_user_id. Returns only a boolean, never branch identities, so it cannot enumerate another user''s branches.';

revoke all on function public.current_user_shares_branch_with(uuid) from public;
grant execute on function public.current_user_shares_branch_with(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Audit log writer. SECURITY DEFINER so it can insert into audit_logs, which
-- deliberately has NO insert policy for authenticated/anon (006) — writes
-- only happen through this function or other SECURITY DEFINER RPCs that call
-- it, so every audit row is attributable to a known, deliberate action path.
-- -----------------------------------------------------------------------------

create or replace function public.write_audit_log(
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_old_values jsonb default null,
  p_new_values jsonb default null,
  p_reason text default null
)
returns uuid
language sql
security definer
set search_path = public
as $$
  insert into public.audit_logs (
    actor_user_id, action, entity_type, entity_id, old_values, new_values, reason
  )
  values (
    auth.uid(), p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_reason
  )
  returning id;
$$;

comment on function public.write_audit_log(text, text, text, jsonb, jsonb, text) is
  'Only path by which a row is ever inserted into audit_logs. actor_user_id is always auth.uid(), never a caller-supplied value.';

revoke all on function public.write_audit_log(text, text, text, jsonb, jsonb, text) from public;
grant execute on function public.write_audit_log(text, text, text, jsonb, jsonb, text) to authenticated;


-- -----------------------------------------------------------------------------
-- PIN credentials + verification.
--
-- pin_hash uses pgcrypto's blowfish-based crypt()/gen_salt('bf'), the same
-- primitive Postgres itself recommends for password hashing. The hash is
-- NEVER selected by any client-facing policy (see 006 — RLS is enabled with
-- zero policies on this table, so it is unreachable via PostgREST for both
-- anon and authenticated roles; only SECURITY DEFINER functions can touch
-- it).
--
-- Local staging smoke test finding (2026-09-17): on both Supabase-local and
-- (per Supabase's own project bootstrap convention) hosted Supabase
-- projects, pgcrypto is installed into the `extensions` schema, not
-- `public`. A SECURITY DEFINER function that pins `set search_path = public`
-- (the hardening pattern used throughout this file) therefore CANNOT resolve
-- an unqualified `crypt()`/`gen_salt()` call — verify_pin() failed this way
-- on every call until schema-qualified below. Never rely on search_path for
-- extension functions inside a SECURITY DEFINER body; always schema-qualify.
-- -----------------------------------------------------------------------------

create table if not exists public.pin_credentials (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  last_attempt_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.pin_credentials is
  'One-way PIN hash per user. RLS enabled with NO policies (006) — reachable only via SECURITY DEFINER RPCs, never directly by anon/authenticated.';

alter table public.pin_credentials enable row level security;
-- (no policies added here on purpose — see 006_rls_policies.sql for the
-- explicit "deny all" statement and rationale)

-- Lockout policy constants (documented here since there is no settings table
-- yet — see BACKLOG.md to move these into configurable settings in Phase D):
--   MAX_FAILED_ATTEMPTS = 5
--   LOCKOUT_DURATION    = 15 minutes

create or replace function public.verify_pin(p_user_id uuid, p_pin text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_record public.pin_credentials%rowtype;
  v_ok boolean;
begin
  select * into v_record from public.pin_credentials where user_id = p_user_id for update;

  if not found then
    return false;
  end if;

  if v_record.locked_until is not null and v_record.locked_until > now() then
    return false;
  end if;

  v_ok := (v_record.pin_hash = extensions.crypt(p_pin, v_record.pin_hash));

  if v_ok then
    update public.pin_credentials
      set failed_attempts = 0, locked_until = null, last_attempt_at = now(), updated_at = now()
      where user_id = p_user_id;
  else
    update public.pin_credentials
      set failed_attempts = failed_attempts + 1,
          last_attempt_at = now(),
          updated_at = now(),
          locked_until = case
            when failed_attempts + 1 >= 5 then now() + interval '15 minutes'
            else locked_until
          end
      where user_id = p_user_id;

    if v_record.failed_attempts + 1 >= 5 then
      perform public.write_audit_log(
        'pin_lockout', 'pin_credentials', p_user_id::text,
        null, jsonb_build_object('failed_attempts', v_record.failed_attempts + 1), null
      );
    end if;
  end if;

  return v_ok;
end;
$$;

comment on function public.verify_pin(uuid, text) is
  'Server-side PIN verification with lockout. Callable ONLY by service_role (see grants below) — the browser never calls this directly; it goes through the pin-login Edge Function. Never returns or logs the hash or the submitted PIN.';

-- Deliberately NOT granted to anon/authenticated — see "Why an Edge Function" below.
revoke all on function public.verify_pin(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_pin(uuid, text) to service_role;

-- =============================================================================
-- Why an Edge Function is needed for login (not just this RPC)
-- =============================================================================
-- verify_pin() answers "is this the right PIN for this user", but a Postgres
-- function cannot mint a real Supabase Auth session (access_token +
-- refresh_token) — session issuance is GoTrue's job, not Postgres's, and
-- there is no supported way to fabricate a GoTrue-valid JWT from inside a
-- SQL/plpgsql function.
--
-- Chosen design (documented in full in AUTH_ARCHITECTURE.md):
--   1. Browser calls a public Edge Function `pin-login` with
--      { employee_code, pin } — no Supabase client credentials involved yet.
--   2. The Edge Function (server-side only, holds the service_role key —
--      NEVER shipped to the browser) resolves employee_code -> user_id,
--      calls public.verify_pin(user_id, pin) using its service_role
--      connection.
--   3. On success, the Edge Function calls supabase.auth.signInWithPassword
--      using a per-profile, randomly generated, rotate-able password that
--      is stored only in a service-role-only table (not in this migration —
--      see AUTH_ARCHITECTURE.md "service_credentials" design note) and never
--      exposed to the browser or to verify_pin's caller.
--   4. The resulting { access_token, refresh_token } are returned to the
--      browser over HTTPS, which calls supabase.auth.setSession() with them.
--
-- This keeps PIN verification and password material entirely server-side,
-- uses only public, supported Supabase Auth APIs (signInWithPassword), and
-- requires no custom JWT signing. See AUTH_ARCHITECTURE.md for alternatives
-- considered (custom JWT signing, phone OTP) and why this was preferred.
-- =============================================================================
