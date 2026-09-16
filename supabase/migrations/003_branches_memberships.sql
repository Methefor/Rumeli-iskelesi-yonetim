-- =============================================================================
-- 003_branches_memberships.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Normalize branches (Rumeli İskelesi, İskele Dondurma, Balık Ekmek) as
--   rows instead of the legacy pattern of encoding branch into column names
--   (rumeli_z1, iki_kasa, balik_ekmek, dondurma). Branch membership scopes
--   branch_manager/cashier/employee access in RLS.
--
-- Depends on: 001_profiles_roles.sql (public.profiles).
-- Required by: 005_auth_helpers.sql (auth_branch_ids), 006_rls_policies.sql,
--              and the Phase D operational schema (shifts, sales_reports, ...).
--
-- Rollback:
--   drop table if exists public.branch_memberships;
--   drop table if exists public.branches;
-- =============================================================================

create table if not exists public.branches (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.branches is
  'Normalized branch catalog. Phase D operational tables (shifts, sales_reports, inventory_items, ...) reference branches.id.';

insert into public.branches (key, name) values
  ('rumeli_iskelesi', 'Rumeli İskelesi'),
  ('iskele_dondurma', 'İskele Dondurma'),
  ('balik_ekmek',     'Balık Ekmek')
on conflict (key) do nothing;

create table if not exists public.branch_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, branch_id)
);

comment on table public.branch_memberships is
  'Which branch(es) a user is assigned to. branch_manager/cashier/employee access is scoped through this table in RLS.';

create index if not exists idx_branch_memberships_user_id on public.branch_memberships (user_id);
create index if not exists idx_branch_memberships_branch_id on public.branch_memberships (branch_id);
