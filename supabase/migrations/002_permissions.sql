-- =============================================================================
-- 002_permissions.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Fine-grained permission catalog + role->permission mapping, so
--   authorization checks (both RLS and frontend UI visibility) are driven by
--   data, not by hardcoded role-name comparisons scattered through the app.
--
-- Depends on: 001_profiles_roles.sql (public.roles).
-- Required by: 005_auth_helpers.sql (auth_has_permission), 006_rls_policies.sql.
--
-- Rollback:
--   drop table if exists public.role_permissions;
--   drop table if exists public.permissions;
--
-- Amended 2026-09-17 (security review): added employee.manage_branch and
-- corrected the branch_manager grant set — see DECISIONS.md. Still not
-- applied anywhere, so amending in place is safe.
-- =============================================================================

create table if not exists public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text,
  created_at timestamptz not null default now()
);

comment on table public.permissions is 'Fixed permission catalog. Managed by migration, not end-user CRUD.';

insert into public.permissions (key, description) values
  ('employee.read',        'View employee records (org-wide).'),
  ('employee.manage',      'Create/edit/deactivate employees, assign branch/role, reset PIN — org-wide.'),
  ('employee.manage_branch', 'Same as employee.manage, but only for employees who share a branch membership with the caller (see current_user_shares_branch_with() in 005_auth_helpers.sql). Grants no visibility or write access outside the caller''s own branch(es).'),
  ('branch.manage',        'Create/edit branches, assign branch memberships.'),
  ('sales.create',        'Submit a sales/shift report.'),
  ('sales.edit_own',      'Edit a sales/shift report the user submitted themselves.'),
  ('sales.edit_all',      'Edit any sales/shift report regardless of submitter.'),
  ('shift.manage',        'Manage shift schedule/timing rules.'),
  ('performance.manage',  'Manage scoring rules, override scores.'),
  ('badge.manage',        'Manage badge definitions, award/revoke manual badges.'),
  ('reports.read',        'View analytics/reconciliation reports.'),
  ('reports.export',      'Export reports (CSV/PDF/etc).'),
  ('settings.manage',     'Manage org-wide configuration (categories, thresholds, etc).')
on conflict (key) do nothing;

create table if not exists public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

comment on table public.role_permissions is 'Role -> permission grants. Seeded below; adjust via migration, not runtime UI, in this phase.';

-- Seed a reasonable default mapping. This is a starting point for review,
-- not a final decision — see AUTH_ARCHITECTURE.md "Open question" section.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where
  (r.key = 'owner') -- owner: everything
  or (r.key = 'manager' and p.key in (
    'employee.read', 'employee.manage', 'branch.manage',
    'sales.create', 'sales.edit_own', 'sales.edit_all',
    'shift.manage', 'performance.manage', 'badge.manage',
    'reports.read', 'reports.export', 'settings.manage'
  ))
  or (r.key = 'branch_manager' and p.key in (
    -- Security review (2026-09-17): branch_manager previously held the
    -- org-wide 'employee.manage' grant, which — combined with RLS policies
    -- keyed only on the permission, not on branch overlap — let a branch
    -- manager for Branch X manage employees in Branch Y. Replaced with the
    -- branch-scoped 'employee.manage_branch'; see DECISIONS.md.
    'employee.manage_branch',
    'sales.create', 'sales.edit_own', 'sales.edit_all',
    'shift.manage', 'reports.read', 'reports.export'
  ))
  or (r.key = 'cashier' and p.key in (
    'sales.create', 'sales.edit_own'
  ))
  or (r.key = 'employee' and p.key in (
    'sales.create', 'sales.edit_own'
  ))
  or (r.key = 'viewer' and p.key in (
    'reports.read'
  ))
on conflict do nothing;
