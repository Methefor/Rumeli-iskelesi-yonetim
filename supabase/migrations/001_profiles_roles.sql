-- =============================================================================
-- 001_profiles_roles.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
-- Do not run this against the production project without explicit approval.
--
-- Purpose:
--   Introduce a real identity model backed by Supabase Auth (auth.users),
--   replacing the legacy pattern of an `admins` table and a `cashiers` table
--   each holding a plaintext `pin` column with no auth.users linkage at all.
--
-- Depends on: nothing (auth.users is a built-in Supabase schema).
-- Required by: 002, 003, 004, 005, 006 (all reference profiles/roles).
--
-- Rollback:
--   drop table if exists public.user_roles;
--   drop table if exists public.roles;
--   drop table if exists public.profiles;
--   (safe — nothing else in this migration creates data outside these three
--   tables, and none of them are referenced by any existing legacy table)
--
-- Amended 2026-09-17 (security review): added profiles.employee_code as the
-- resolved login handle — see AUTH_ARCHITECTURE.md "Login handle" and
-- DECISIONS.md. Still not applied anywhere, so amending in place rather than
-- adding a new migration file is safe.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth.users identity. This is the new "who is this
-- person" record — legacy `cashiers`/`admins` rows are migrated into this
-- table in a later, separate, explicitly-approved data migration, not here.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  -- Login handle (security-review decision, 2026-09-17): short, unique,
  -- normalized code (e.g. M001, K001, D002) used to resolve pin-login
  -- requests to a profile. Deliberately NOT legacy_cashier_id (see
  -- DECISIONS.md "employee_code is the login handle, not legacy_cashier_id").
  -- Only ever written by migration-time provisioning or the
  -- admin_set_employee_code() RPC (008) — never by a raw client update, see
  -- the column-level GRANTs in 006_rls_policies.sql.
  employee_code text unique,
  -- Nullable pointer back to the legacy cashiers.id this profile was migrated
  -- from, so historical daily_reports rows (keyed on the legacy cashier_id)
  -- can still be joined to a real identity after cutover. Never used by RLS.
  legacy_cashier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_employee_code_format check (
    employee_code is null or employee_code ~ '^[A-Z][0-9]{2,4}$'
  )
);

comment on table public.profiles is
  'One row per authenticated identity (auth.users). Replaces legacy admins/cashiers tables for identity purposes.';
comment on column public.profiles.employee_code is
  'Login handle for pin-login (e.g. M001, K002, D001). Unique, normalized, privileged-write-only — see admin_set_employee_code() in 008_admin_rpcs.sql.';
comment on column public.profiles.legacy_cashier_id is
  'Traceability only, for legacy daily_reports.cashier_id joins during transition. Not used in RLS or authorization, and never used as a login handle.';

-- ---------------------------------------------------------------------------
-- roles: fixed, small set of role keys. Managed by migration, not by
-- end-user CRUD — see 006_rls_policies.sql (no client INSERT/UPDATE/DELETE).
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.roles is 'Fixed role catalog: owner, manager, branch_manager, cashier, employee, viewer.';

insert into public.roles (key, name, description) values
  ('owner',          'Owner',          'Full access across the entire organization.'),
  ('manager',        'Manager',        'Management access within the organization, not branch-restricted.'),
  ('branch_manager', 'Branch Manager', 'Management access restricted to assigned branches.'),
  ('cashier',        'Cashier',        'Operational entry (sales/shift reporting) for assigned branches.'),
  ('employee',       'Employee',       'General staff member with limited operational access.'),
  ('viewer',         'Viewer',         'Read-only access to permitted reports.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- user_roles: many-to-many, but in practice most users will have exactly
-- one role. Kept as a join table (not a single roles_id column on profiles)
-- so a future need for multiple roles per user doesn't require a schema
-- change.
-- ---------------------------------------------------------------------------
create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete restrict,
  granted_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (user_id, role_id)
);

comment on table public.user_roles is
  'Role grants. A role change here is a critical action — must be written via an audited path, see audit_logs / 005_auth_helpers.sql.';

create index if not exists idx_user_roles_user_id on public.user_roles (user_id);
create index if not exists idx_user_roles_role_id on public.user_roles (role_id);
