-- =============================================================================
-- 009_operational_core.sql
-- =============================================================================
-- STATUS: NOT APPLIED to production. Prepared for review, applied only to
-- local staging so far — see MIGRATION_PLAN.md.
--
-- Purpose (Phase D):
--   The normalized operational core: Branch -> Employee -> Shift -> Sales.
--   Every table here is branch/category/register agnostic — no
--   branch-specific columns (no `rumeli_z1`, `balik_ekmek`, `dondurma`
--   columns anywhere), matching CORE_DATA_MODEL.md's central rule. Branch,
--   category, and register are always a normalized foreign key, never a
--   column name.
--
-- Depends on: 001 (profiles), 002 (permissions), 003 (branches), 004
--             (audit_logs), 005 (auth helpers).
-- Required by: 010_operational_rls.sql, 011_operational_rpcs.sql.
--
-- Rollback (reverse dependency order):
--   drop table if exists public.sales_report_overrides;
--   drop table if exists public.sales_report_items;
--   drop table if exists public.sales_reports;
--   drop table if exists public.shift_assignments;
--   drop table if exists public.shifts;
--   drop table if exists public.reconciliation_thresholds;
--   drop table if exists public.sales_category_branches;
--   drop table if exists public.sales_categories;
--   drop table if exists public.registers;
--   drop table if exists public.shift_definitions;
--   drop function if exists public.set_updated_at();
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Shared updated_at trigger. Every table below has an `updated_at` column;
-- rather than trusting every future RPC to remember to set it, one trigger
-- function maintains it uniformly (DRY — see coding-style.md).
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at() is
  'BEFORE UPDATE trigger: stamps updated_at = now() on every row update. Attached to every operational table below.';

-- ---------------------------------------------------------------------------
-- shift_definitions — config: named shift types per branch (e.g. sabah/
-- akşam), including the submission-cutoff rule domain/shifts.evaluateOnTime
-- already implements in the frontend. cutoff_hour/cutoff_minute/
-- cutoff_day_offset map 1:1 onto ShiftTimingRule so the server-side timing
-- check in 011's create_sales_report() and the client-side preview in
-- domain/shifts never drift apart in meaning, even though they're
-- necessarily two separate implementations (SQL vs. TypeScript).
-- ---------------------------------------------------------------------------
create table if not exists public.shift_definitions (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  key text not null,
  name text not null,
  start_hour smallint not null check (start_hour between 0 and 23),
  start_minute smallint not null default 0 check (start_minute between 0 and 59),
  end_hour smallint not null check (end_hour between 0 and 23),
  end_minute smallint not null default 0 check (end_minute between 0 and 59),
  -- Submission deadline for this shift's reports, resolved against the
  -- shift's business_date exactly as domain/shifts/evaluateOnTime.ts
  -- resolves a ShiftTimingRule (cutoff_day_offset=1 means "next calendar
  -- day", for a shift whose cutoff crosses midnight).
  cutoff_hour smallint not null check (cutoff_hour between 0 and 23),
  cutoff_minute smallint not null default 0 check (cutoff_minute between 0 and 59),
  cutoff_day_offset smallint not null default 0 check (cutoff_day_offset in (0, 1)),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (branch_id, key)
);

comment on table public.shift_definitions is
  'Named shift types per branch (e.g. sabah/akşam) with server-authoritative timing. No branch-specific columns — branch is always branch_id.';

create trigger set_updated_at before update on public.shift_definitions
  for each row execute function public.set_updated_at();

-- Seed a generic sabah/akşam pair for the two primary branches only (see
-- CORE_DATA_MODEL.md — Balık Ekmek is explicitly lower priority per the
-- brief; its shift definitions are left for a later, explicit pass rather
-- than guessed at here). Times are a reasonable starting point, not a
-- migrated legacy fact — adjustable via shift_definitions_write_scoped
-- (010) once a manager reviews them.
insert into public.shift_definitions (branch_id, key, name, start_hour, start_minute, end_hour, end_minute, cutoff_hour, cutoff_minute, cutoff_day_offset)
select b.id, v.key, v.name, v.start_hour, v.start_minute, v.end_hour, v.end_minute, v.cutoff_hour, v.cutoff_minute, v.cutoff_day_offset
from public.branches b
cross join (values
  ('morning', 'Sabah', 8, 0, 16, 0, 16, 30, 0),
  ('evening', 'Akşam', 16, 0, 23, 59, 1, 0, 1)
) as v(key, name, start_hour, start_minute, end_hour, end_minute, cutoff_hour, cutoff_minute, cutoff_day_offset)
where b.key in ('rumeli_iskelesi', 'iskele_dondurma')
on conflict (branch_id, key) do nothing;

-- ---------------------------------------------------------------------------
-- registers — physical/logical cash registers per branch (e.g. "Kasa 1",
-- "Kasa 2"). Nullable reference from sales_reports — not every branch
-- tracks register-level detail.
-- ---------------------------------------------------------------------------
create table if not exists public.registers (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id) on delete cascade,
  key text not null,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (branch_id, key)
);

comment on table public.registers is
  'Cash registers per branch. Referenced by sales_reports.register_id (nullable — branches without register-level tracking omit it).';

create trigger set_updated_at before update on public.registers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sales_categories — global, configurable category catalog (never a
-- per-branch duplicate row for the same concept). Which branches actually
-- use a category is a separate join (sales_category_branches) — "do not
-- assume every branch uses every category."
-- ---------------------------------------------------------------------------
create table if not exists public.sales_categories (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);

comment on table public.sales_categories is
  'Global category catalog (Gıda, Kahve, Dondurma, ...). Branch applicability is sales_category_branches, not a column here.';

create trigger set_updated_at before update on public.sales_categories
  for each row execute function public.set_updated_at();

-- Seed the legacy category set as configurable rows, not hardcoded columns —
-- see DECISIONS.md "sales_categories are rows, never columns".
insert into public.sales_categories (key, name) values
  ('gida',            'Gıda'),
  ('kahvalti',        'Kahvaltı'),
  ('kahve',           'Kahve'),
  ('meyve_suyu',      'Meyve Suyu'),
  ('sicak_icecek',    'Sıcak İçecek'),
  ('soguk_icecek',    'Soğuk İçecek'),
  ('salata',          'Salata'),
  ('tatli',           'Tatlı'),
  ('dondurma',        'Dondurma'),
  ('borek_corek',     'Börek & Çörek')
on conflict (key) do nothing;

create table if not exists public.sales_category_branches (
  branch_id uuid not null references public.branches (id) on delete cascade,
  category_id uuid not null references public.sales_categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (branch_id, category_id)
);

comment on table public.sales_category_branches is
  'Which categories a given branch actually reports on. Absence here means the category never appears in that branch''s sales report form.';

-- Seed a reasonable default for the two primary branches (see
-- CORE_DATA_MODEL.md "why Balık Ekmek has no seed data yet" — lower
-- priority per the brief, left for a later, explicit pass rather than
-- guessed at here).
insert into public.sales_category_branches (branch_id, category_id)
select b.id, c.id
from public.branches b
cross join public.sales_categories c
where
  (b.key = 'rumeli_iskelesi' and c.key in (
    'gida', 'kahvalti', 'kahve', 'meyve_suyu', 'sicak_icecek', 'soguk_icecek', 'salata', 'tatli', 'borek_corek'
  ))
  or (b.key = 'iskele_dondurma' and c.key in ('dondurma', 'sicak_icecek', 'soguk_icecek'))
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- reconciliation_thresholds — config-driven thresholds per branch (section
-- 6 of the Phase D brief: "Thresholds must be config-driven"). One row per
-- branch; falls back to a hardcoded default in the RPC only if a branch has
-- no row (defensive, not the primary path — every primary branch is seeded
-- below).
-- ---------------------------------------------------------------------------
create table if not exists public.reconciliation_thresholds (
  branch_id uuid primary key references public.branches (id) on delete cascade,
  warning_percentage numeric(5, 2) not null check (warning_percentage >= 0),
  error_percentage numeric(5, 2) not null check (error_percentage >= warning_percentage),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);

comment on table public.reconciliation_thresholds is
  'Per-branch reconciliation tolerance. Mirrors domain/reconciliation.ReconciliationThresholds — SQL is authoritative (011_operational_rpcs.sql), TS is for optimistic client-side preview only.';

create trigger set_updated_at before update on public.reconciliation_thresholds
  for each row execute function public.set_updated_at();

insert into public.reconciliation_thresholds (branch_id, warning_percentage, error_percentage)
select b.id, 2.00, 5.00 from public.branches b where b.key in ('rumeli_iskelesi', 'iskele_dondurma')
on conflict (branch_id) do nothing;

-- ---------------------------------------------------------------------------
-- shifts — one row per concrete shift instance (a shift_definition on a
-- specific business_date at a specific branch).
-- ---------------------------------------------------------------------------
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  shift_definition_id uuid not null references public.shift_definitions (id),
  business_date date not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'in_progress', 'submitted', 'closed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id),
  unique (branch_id, shift_definition_id, business_date)
);

comment on table public.shifts is
  'One concrete shift instance per (branch, shift_definition, business_date). status is lifecycle, not a soft-delete flag — cancelled shifts are kept for historical integrity.';

create index if not exists idx_shifts_branch_date on public.shifts (branch_id, business_date);
create index if not exists idx_shifts_definition on public.shifts (shift_definition_id);

create trigger set_updated_at before update on public.shifts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- shift_assignments — who is assigned to a shift. late_override/
-- late_override_reason are excluded from any future client column grant
-- (010) — the only path to set them is override_shift_lateness() (011).
-- ---------------------------------------------------------------------------
create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id uuid not null references public.shifts (id) on delete cascade,
  user_id uuid not null references public.profiles (id),
  status text not null default 'assigned'
    check (status in ('assigned', 'confirmed', 'cancelled')),
  is_on_time boolean,
  late_override boolean,
  late_override_reason text,
  assigned_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, user_id)
);

comment on table public.shift_assignments is
  'Employee assignment to a concrete shift. is_on_time is computed by the submission RPC (mirrors domain/shifts.evaluateOnTime); late_override/late_override_reason are set ONLY via override_shift_lateness() (011), never a raw client write.';

create index if not exists idx_shift_assignments_user on public.shift_assignments (user_id);
create index if not exists idx_shift_assignments_shift on public.shift_assignments (shift_id);

create trigger set_updated_at before update on public.shift_assignments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sales_reports — generic report model. report_type carries the X/Z
-- semantics (domain/revenue.calculateDailyRevenue is the shared
-- implementation both the frontend preview and 011's server-side
-- computation follow). status is a lifecycle flag (never a raw DELETE —
-- see cancel_sales_report in 011); reconciliation_status is computed
-- server-side, never client-supplied.
-- ---------------------------------------------------------------------------
create table if not exists public.sales_reports (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  shift_id uuid not null references public.shifts (id),
  register_id uuid references public.registers (id),
  submitted_by uuid not null references public.profiles (id),
  report_type text not null check (report_type in ('X', 'Z')),
  gross_revenue numeric(12, 2) not null check (gross_revenue >= 0),
  transaction_count integer check (transaction_count is null or transaction_count >= 0),
  average_basket numeric(12, 2) check (average_basket is null or average_basket >= 0),
  notes text,
  status text not null default 'submitted'
    check (status in ('submitted', 'edited', 'cancelled')),
  reconciliation_status text not null default 'OK'
    check (reconciliation_status in ('OK', 'WARNING', 'ERROR')),
  created_at timestamptz not null default now(),
  submitted_at timestamptz not null default now(),
  edited_at timestamptz,
  updated_at timestamptz not null default now()
);

comment on table public.sales_reports is
  'Generic X/Z sales report, branch/category agnostic. Never hardcode Rumeli/Dondurma/Balık into a column — branch_id is the only branch reference.';
comment on column public.sales_reports.reconciliation_status is
  'Computed server-side by create_sales_report()/recompute paths in 011 — never accepted from the client directly.';

-- Duplicate-prevention (section 1 + 7): at most one X and one Z per shift,
-- optionally scoped to a register when the branch tracks registers.
create unique index if not exists sales_reports_unique_no_register
  on public.sales_reports (shift_id, report_type)
  where register_id is null and status <> 'cancelled';

create unique index if not exists sales_reports_unique_with_register
  on public.sales_reports (shift_id, register_id, report_type)
  where register_id is not null and status <> 'cancelled';

create index if not exists idx_sales_reports_branch_submitted on public.sales_reports (branch_id, submitted_at);
create index if not exists idx_sales_reports_shift on public.sales_reports (shift_id);
create index if not exists idx_sales_reports_submitted_by on public.sales_reports (submitted_by);

create trigger set_updated_at before update on public.sales_reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sales_report_items — category breakdown child rows.
-- ---------------------------------------------------------------------------
create table if not exists public.sales_report_items (
  id uuid primary key default gen_random_uuid(),
  sales_report_id uuid not null references public.sales_reports (id) on delete cascade,
  category_id uuid not null references public.sales_categories (id),
  amount numeric(12, 2) not null check (amount >= 0),
  quantity integer check (quantity is null or quantity >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sales_report_id, category_id)
);

comment on table public.sales_report_items is
  'Category breakdown for a sales report. Always written atomically with the parent report via create_sales_report()/edit_sales_report() (011) — never edited standalone.';

create index if not exists idx_sales_report_items_report on public.sales_report_items (sales_report_id);
create index if not exists idx_sales_report_items_category on public.sales_report_items (category_id);

create trigger set_updated_at before update on public.sales_report_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- sales_report_overrides — normalized audit trail for reconciliation
-- overrides (one row per override event, not a mutable column on
-- sales_reports, so history is never lost to a later override).
-- ---------------------------------------------------------------------------
create table if not exists public.sales_report_overrides (
  id uuid primary key default gen_random_uuid(),
  sales_report_id uuid not null references public.sales_reports (id) on delete cascade,
  previous_status text not null,
  new_status text not null,
  reason text not null,
  overridden_by uuid not null references public.profiles (id),
  overridden_at timestamptz not null default now()
);

comment on table public.sales_report_overrides is
  'Append-only. One row per manager override of a report''s reconciliation_status — reason/actor/timestamp always required, enforced by override_reconciliation() (011), never a raw client insert.';

create index if not exists idx_sales_report_overrides_report on public.sales_report_overrides (sales_report_id);
