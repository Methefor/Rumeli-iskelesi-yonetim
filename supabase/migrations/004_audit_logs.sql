-- =============================================================================
-- 004_audit_logs.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Append-only audit trail. The legacy app has no audit logging at all —
--   role changes, PIN resets, report edits/deletes, and score/badge
--   overrides currently leave no trace of who did what or why.
--
-- Depends on: auth.users only (kept independent of profiles/roles/branches
--   so it can be created early and used by every later migration).
-- Required by: 005_auth_helpers.sql (write_audit_log helper),
--              006_rls_policies.sql (read policy).
--
-- Rollback:
--   drop table if exists public.audit_logs;
-- =============================================================================

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users (id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  reason text,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. No UPDATE/DELETE policy is ever granted (see 006) — rows are immutable once written.';
comment on column public.audit_logs.action is
  'Machine-readable action key, e.g. pin_reset, role_change, branch_assignment, report_edit, report_delete, score_override, badge_override, employee_activation, employee_deactivation, late_override.';
comment on column public.audit_logs.entity_id is
  'Text, not uuid, so it can reference either a new-schema uuid or a legacy bigint/uuid id during the transition period.';

create index if not exists idx_audit_logs_actor on public.audit_logs (actor_user_id);
create index if not exists idx_audit_logs_entity on public.audit_logs (entity_type, entity_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs (created_at desc);

-- Critical actions requiring an audit_logs row (enforced by convention in
-- the RPCs that perform them — see 005_auth_helpers.sql and
-- AUTH_ARCHITECTURE.md "Audited actions" — not by a DB trigger/constraint,
-- since the action set will keep growing as Phase D/H land):
--   pin_reset, role_change, branch_assignment, late_on_time_override,
--   score_override, badge_override, report_edit, report_delete,
--   employee_activation, employee_deactivation.
