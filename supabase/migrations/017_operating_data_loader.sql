-- =============================================================================
-- 017_operating_data_loader.sql
-- =============================================================================
-- STATUS: PREPARED; VALIDATED ON LOCAL SUPABASE ONLY (Stage 3).
-- Not applied to any hosted Supabase project. The companion CLI remains
-- deliberately local-only until a separately approved hosted-data phase.
--
-- Purpose:
--   1. `operating_data_provenance`: for every piece of business configuration
--      in the database, records WHERE it came from (confirmed / legacy_observed
--      / demo_only / unknown), whether the owner approved it, and its source.
--      This is what lets the UI say "this shift time is an unapproved legacy
--      observation" instead of presenting a seeded guess as business truth.
--   2. Registers the classification of the values seeded by migrations 003 and
--      009 WITHOUT changing them (migrations 001-016 are immutable). The 009
--      shift times, the branch/category mapping and the 2%/5% thresholds are
--      generic starting points, not confirmed business facts.
--   3. `internal_run_operating_data(...)`: the ONLY write path of the local
--      operating-data loader (operating-data/load.mjs). service_role only. It
--      verifies the named actor is an active owner, then applies one payload
--      in ONE transaction, reusing the audited inventory RPCs for items,
--      costs and opening stock. Dry-run and apply share the same code path:
--      a dry run executes it and rolls everything back, so the report is
--      exactly what an apply would do. Any rejected row aborts the whole run.
--
-- Depends on: 003, 004, 005, 009, 012, 014, 016.
-- Rollback:
--   drop function if exists public.internal_run_operating_data(text, jsonb, boolean);
--   drop function if exists public.internal_od_result(text, integer, text, text, text);
--   drop function if exists public.internal_od_provenance(text, text, text, text, text, text, text);
--   drop table if exists public.operating_data_provenance;
-- =============================================================================

create table if not exists public.operating_data_provenance (
  entity_type text not null,
  entity_key text not null,
  classification text not null
    check (classification in ('confirmed', 'legacy_observed', 'demo_only', 'unknown')),
  approval_status text not null
    check (approval_status in ('approved', 'pending', 'rejected')),
  dataset text not null check (dataset in ('real', 'test-only', 'seed')),
  source text,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  primary key (entity_type, entity_key)
);

comment on table public.operating_data_provenance is
  'Where each piece of operating configuration came from and whether the owner approved it. Written by the controlled operating-data loader (internal_run_operating_data) and by migration 017 for the pre-existing seeds. Read-only for clients.';

alter table public.operating_data_provenance enable row level security;

create policy operating_data_provenance_select on public.operating_data_provenance
  for select to authenticated
  using (public.current_user_has_permission('settings.manage'));

revoke all on public.operating_data_provenance from anon, authenticated;
grant select on public.operating_data_provenance to authenticated;

-- ---------------------------------------------------------------------------
-- Classification of what migrations 003 / 009 already seeded (values are NOT
-- changed here). Evidence: legacy entry.html / js/supabase-client.js and the
-- frozen 2026 per-branch totals in BACKLOG.md.
-- ---------------------------------------------------------------------------
insert into public.operating_data_provenance (entity_type, entity_key, classification, approval_status, dataset, source, note)
select 'branch', b.key, 'confirmed', 'approved', 'seed',
  'BACKLOG.md frozen 2026 per-branch totals; legacy admin dashboard branch names',
  'Branch names are used in the owner-approved management reference figures.'
from public.branches b
where b.key in ('rumeli_iskelesi', 'iskele_dondurma', 'balik_ekmek')
on conflict do nothing;

insert into public.operating_data_provenance (entity_type, entity_key, classification, approval_status, dataset, source, note)
select 'category', c.key, 'legacy_observed', 'pending', 'seed',
  'legacy entry.html category form (10 fields)',
  'Seen in the running legacy form; owner has not approved it for V4.'
from public.sales_categories c
on conflict do nothing;

insert into public.operating_data_provenance (entity_type, entity_key, classification, approval_status, dataset, source, note)
select 'category_branch', b.key || '/' || c.key, 'unknown', 'pending', 'seed',
  'migration 009 default mapping',
  'The legacy app has no branch-to-category mapping; this was a design guess.'
from public.sales_category_branches scb
join public.branches b on b.id = scb.branch_id
join public.sales_categories c on c.id = scb.category_id
on conflict do nothing;

insert into public.operating_data_provenance (entity_type, entity_key, classification, approval_status, dataset, source, note)
select 'shift_definition', b.key || '/' || sd.key, 'demo_only', 'pending', 'seed',
  'migration 009 generic morning/evening seed',
  'Generic starting times; they differ from the legacy observed 09:00-17:30 / 16:00-01:00.'
from public.shift_definitions sd
join public.branches b on b.id = sd.branch_id
on conflict do nothing;

insert into public.operating_data_provenance (entity_type, entity_key, classification, approval_status, dataset, source, note)
select 'threshold', b.key, 'demo_only', 'pending', 'seed',
  'migration 009 default 2%/5%',
  'No source for these tolerances exists in the legacy app or business records.'
from public.reconciliation_thresholds rt
join public.branches b on b.id = rt.branch_id
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Helpers (internal, never granted to clients)
-- ---------------------------------------------------------------------------
create or replace function public.internal_od_result(
  p_group text, p_row integer, p_key text, p_status text, p_message text default null
)
returns jsonb
language sql
immutable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'group', p_group, 'row', p_row, 'key', p_key, 'status', p_status, 'message', p_message
  ));
$$;

create or replace function public.internal_od_provenance(
  p_type text, p_key text, p_class text, p_approval text, p_source text, p_dataset text, p_note text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.operating_data_provenance
    (entity_type, entity_key, classification, approval_status, dataset, source, note, updated_at, updated_by)
  values (p_type, p_key, p_class, p_approval, p_dataset, nullif(p_source, ''), nullif(p_note, ''), now(), auth.uid())
  on conflict (entity_type, entity_key) do update
    set classification = excluded.classification,
        approval_status = excluded.approval_status,
        dataset = excluded.dataset,
        source = excluded.source,
        note = excluded.note,
        updated_at = now(),
        updated_by = auth.uid();
$$;

revoke all on function public.internal_od_result(text, integer, text, text, text) from public, anon, authenticated;
revoke all on function public.internal_od_provenance(text, text, text, text, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- internal_run_operating_data
--   p_actor_code : employee_code of an ACTIVE OWNER (the audit actor)
--   p_payload    : {dataset, branches:[...], registers:[...], ...}; every row
--                  carries row, provenance, approval_status, source
--   p_commit     : false = dry run (everything is rolled back)
-- Returns {applied, results:[{group,row,key,status,message}], counts:{...}}.
-- Statuses: created | updated | unchanged | rejected. (skipped is decided by
-- the loader before rows are sent.)
-- ---------------------------------------------------------------------------
create or replace function public.internal_run_operating_data(
  p_actor_code text,
  p_payload jsonb,
  p_commit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_dataset text := coalesce(p_payload ->> 'dataset', 'real');
  v_res jsonb := '[]'::jsonb;
  v_out jsonb;
  v_detail text;
  v_rejected integer;
begin
  select p.id into v_actor
  from public.profiles p
  where p.employee_code = upper(trim(coalesce(p_actor_code, ''))) and p.is_active;
  if v_actor is null or public.user_rank(v_actor) < 4 then
    raise exception 'operating data can only be loaded on behalf of an active owner' using errcode = '42501';
  end if;
  if v_dataset not in ('real', 'test-only') then
    raise exception 'unknown dataset' using errcode = '22023';
  end if;

  -- The audited RPCs and write_audit_log read auth.uid(); bind it to the
  -- verified owner for this transaction only.
  perform set_config('request.jwt.claim.sub', v_actor::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_actor, 'role', 'authenticated')::text, true);

  begin
    v_res := public.internal_od_apply(v_actor, p_payload, v_dataset);
    select count(*) into v_rejected from jsonb_array_elements(v_res) e where e ->> 'status' = 'rejected';
    v_out := jsonb_build_object(
      'applied', p_commit and v_rejected = 0,
      'results', v_res
    );
    if p_commit and v_rejected = 0 then
      return v_out;
    end if;
    -- dry run or any rejection: roll every write back, still return the report
    raise exception 'operating_data_rollback' using errcode = 'OD001', detail = v_out::text;
  exception
    when sqlstate 'OD001' then
      get stacked diagnostics v_detail = pg_exception_detail;
      return v_detail::jsonb;
  end;
end;
$$;

-- The row-processing body. Kept separate so each group reads linearly.
create or replace function public.internal_od_apply(p_actor uuid, p_payload jsonb, p_dataset text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_res jsonb := '[]'::jsonb;
  v_status text;
  v_msg text;
  v_key text;
  v_branch uuid;
  v_cat uuid;
  v_item record;
  v_old record;
  v_id uuid;
  v_eff timestamptz;
  v_latest timestamptz;
  v_reason text := 'operating data load (' || p_dataset || ')';
  v_prov text;
  v_appr text;
  v_src text;
begin
  -- ============================ branches ==============================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'branches', '[]')) loop
    v_key := r.v ->> 'branch_key'; v_status := 'rejected'; v_msg := null;
    begin
      select * into v_old from public.branches where key = v_key;
      if not found then
        insert into public.branches (key, name, is_active)
        values (v_key, r.v ->> 'name', coalesce((r.v ->> 'is_active')::boolean, true));
        v_status := 'created';
      elsif v_old.name is distinct from (r.v ->> 'name')
         or v_old.is_active is distinct from coalesce((r.v ->> 'is_active')::boolean, true) then
        update public.branches set name = r.v ->> 'name', is_active = coalesce((r.v ->> 'is_active')::boolean, true)
          where key = v_key;
        v_status := 'updated';
      else
        v_status := 'unchanged';
      end if;
      if v_status <> 'unchanged' then
        perform public.write_audit_log('operating_data_load', 'branches', v_key,
          case when v_status = 'updated' then jsonb_build_object('name', v_old.name, 'is_active', v_old.is_active) end,
          jsonb_build_object('name', r.v ->> 'name'), v_reason);
      end if;
      perform public.internal_od_provenance('branch', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('branches', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ========================= sales_categories =========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'sales_categories', '[]')) loop
    v_key := r.v ->> 'category_key'; v_status := 'rejected'; v_msg := null;
    begin
      select * into v_old from public.sales_categories where key = v_key;
      if not found then
        insert into public.sales_categories (key, name, is_active, created_by, updated_by)
        values (v_key, r.v ->> 'name', coalesce((r.v ->> 'is_active')::boolean, true), p_actor, p_actor);
        v_status := 'created';
      elsif v_old.name is distinct from (r.v ->> 'name')
         or v_old.is_active is distinct from coalesce((r.v ->> 'is_active')::boolean, true) then
        update public.sales_categories
          set name = r.v ->> 'name', is_active = coalesce((r.v ->> 'is_active')::boolean, true), updated_by = p_actor
          where key = v_key;
        v_status := 'updated';
      else
        v_status := 'unchanged';
      end if;
      if v_status <> 'unchanged' then
        perform public.write_audit_log('operating_data_load', 'sales_categories', v_key,
          case when v_status = 'updated' then jsonb_build_object('name', v_old.name, 'is_active', v_old.is_active) end,
          jsonb_build_object('name', r.v ->> 'name'), v_reason);
      end if;
      perform public.internal_od_provenance('category', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('sales_categories', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ============================ registers =============================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'registers', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'register_key'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_old from public.registers where branch_id = v_branch and key = r.v ->> 'register_key';
      if not found then
        insert into public.registers (branch_id, key, name, is_active, created_by, updated_by)
        values (v_branch, r.v ->> 'register_key', r.v ->> 'name', coalesce((r.v ->> 'is_active')::boolean, true), p_actor, p_actor);
        v_status := 'created';
      elsif v_old.name is distinct from (r.v ->> 'name')
         or v_old.is_active is distinct from coalesce((r.v ->> 'is_active')::boolean, true) then
        update public.registers
          set name = r.v ->> 'name', is_active = coalesce((r.v ->> 'is_active')::boolean, true), updated_by = p_actor
          where id = v_old.id;
        v_status := 'updated';
      else
        v_status := 'unchanged';
      end if;
      if v_status <> 'unchanged' then
        perform public.write_audit_log('operating_data_load', 'registers', v_key,
          case when v_status = 'updated' then jsonb_build_object('name', v_old.name, 'is_active', v_old.is_active) end,
          jsonb_build_object('name', r.v ->> 'name'), v_reason);
      end if;
      perform public.internal_od_provenance('register', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('registers', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ======================== shift_definitions =========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'shift_definitions', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'shift_key'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_old from public.shift_definitions where branch_id = v_branch and key = r.v ->> 'shift_key';
      if not found then
        insert into public.shift_definitions (
          branch_id, key, name, start_hour, start_minute, end_hour, end_minute,
          cutoff_hour, cutoff_minute, cutoff_day_offset, is_active, created_by, updated_by)
        values (v_branch, r.v ->> 'shift_key', r.v ->> 'name',
          (r.v ->> 'start_hour')::smallint, (r.v ->> 'start_minute')::smallint,
          (r.v ->> 'end_hour')::smallint, (r.v ->> 'end_minute')::smallint,
          (r.v ->> 'cutoff_hour')::smallint, (r.v ->> 'cutoff_minute')::smallint,
          (r.v ->> 'cutoff_day_offset')::smallint, coalesce((r.v ->> 'is_active')::boolean, true), p_actor, p_actor);
        v_status := 'created';
      elsif (v_old.name, v_old.start_hour, v_old.start_minute, v_old.end_hour, v_old.end_minute,
             v_old.cutoff_hour, v_old.cutoff_minute, v_old.cutoff_day_offset, v_old.is_active)
        is distinct from
            (r.v ->> 'name', (r.v ->> 'start_hour')::smallint, (r.v ->> 'start_minute')::smallint,
             (r.v ->> 'end_hour')::smallint, (r.v ->> 'end_minute')::smallint,
             (r.v ->> 'cutoff_hour')::smallint, (r.v ->> 'cutoff_minute')::smallint,
             (r.v ->> 'cutoff_day_offset')::smallint, coalesce((r.v ->> 'is_active')::boolean, true)) then
        update public.shift_definitions
          set name = r.v ->> 'name',
              start_hour = (r.v ->> 'start_hour')::smallint, start_minute = (r.v ->> 'start_minute')::smallint,
              end_hour = (r.v ->> 'end_hour')::smallint, end_minute = (r.v ->> 'end_minute')::smallint,
              cutoff_hour = (r.v ->> 'cutoff_hour')::smallint, cutoff_minute = (r.v ->> 'cutoff_minute')::smallint,
              cutoff_day_offset = (r.v ->> 'cutoff_day_offset')::smallint,
              is_active = coalesce((r.v ->> 'is_active')::boolean, true), updated_by = p_actor
          where id = v_old.id;
        v_status := 'updated';
      else
        v_status := 'unchanged';
      end if;
      if v_status <> 'unchanged' then
        perform public.write_audit_log('operating_data_load', 'shift_definitions', v_key,
          case when v_status = 'updated' then jsonb_build_object(
            'name', v_old.name, 'start', v_old.start_hour * 60 + v_old.start_minute,
            'end', v_old.end_hour * 60 + v_old.end_minute, 'cutoff_hour', v_old.cutoff_hour,
            'cutoff_minute', v_old.cutoff_minute, 'cutoff_day_offset', v_old.cutoff_day_offset) end,
          jsonb_build_object('name', r.v ->> 'name',
            'start', (r.v ->> 'start_hour')::int * 60 + (r.v ->> 'start_minute')::int,
            'end', (r.v ->> 'end_hour')::int * 60 + (r.v ->> 'end_minute')::int,
            'cutoff_hour', (r.v ->> 'cutoff_hour')::int, 'cutoff_minute', (r.v ->> 'cutoff_minute')::int,
            'cutoff_day_offset', (r.v ->> 'cutoff_day_offset')::int), v_reason);
      end if;
      perform public.internal_od_provenance('shift_definition', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('shift_definitions', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ======================== category_branches =========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'category_branches', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'category_key'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select id into v_cat from public.sales_categories where key = r.v ->> 'category_key';
      if v_cat is null then raise exception 'unknown category %', r.v ->> 'category_key'; end if;
      if exists (select 1 from public.sales_category_branches where branch_id = v_branch and category_id = v_cat) then
        v_status := 'unchanged';
      else
        insert into public.sales_category_branches (branch_id, category_id) values (v_branch, v_cat);
        v_status := 'created';
        perform public.write_audit_log('operating_data_load', 'sales_category_branches', v_key, null,
          jsonb_build_object('branch', r.v ->> 'branch_key', 'category', r.v ->> 'category_key'), v_reason);
      end if;
      perform public.internal_od_provenance('category_branch', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('category_branches', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ========================= inventory_items ==========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'inventory_items', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'item_code'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_item from public.inventory_items where branch_id = v_branch and code = r.v ->> 'item_code';
      if not found then
        v_id := public.upsert_inventory_item(null, v_branch, r.v ->> 'item_code', r.v ->> 'name', r.v ->> 'unit',
          coalesce((r.v ->> 'allows_decimal')::boolean, true), null, v_reason);
        if not coalesce((r.v ->> 'is_active')::boolean, true) then
          perform public.set_inventory_item_active(v_id, false, v_reason);
        end if;
        v_status := 'created';
      else
        if (v_item.name, v_item.unit, v_item.allows_decimal)
           is distinct from (r.v ->> 'name', r.v ->> 'unit', coalesce((r.v ->> 'allows_decimal')::boolean, true)) then
          perform public.upsert_inventory_item(v_item.id, v_branch, r.v ->> 'item_code', r.v ->> 'name', r.v ->> 'unit',
            coalesce((r.v ->> 'allows_decimal')::boolean, true), v_item.sales_category_id, v_reason);
          v_status := 'updated';
        else
          v_status := 'unchanged';
        end if;
        if v_item.is_active is distinct from coalesce((r.v ->> 'is_active')::boolean, true) then
          perform public.set_inventory_item_active(v_item.id, coalesce((r.v ->> 'is_active')::boolean, true), v_reason);
          v_status := 'updated';
        end if;
      end if;
      perform public.internal_od_provenance('inventory_item', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('inventory_items', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ======================== product_categories ========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'product_categories', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'item_code'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_item from public.inventory_items where branch_id = v_branch and code = r.v ->> 'item_code';
      if not found then raise exception 'item % does not exist in branch %', r.v ->> 'item_code', r.v ->> 'branch_key'; end if;
      select id into v_cat from public.sales_categories where key = r.v ->> 'category_key';
      if v_cat is null then raise exception 'unknown category %', r.v ->> 'category_key'; end if;
      if not exists (select 1 from public.sales_category_branches where branch_id = v_branch and category_id = v_cat) then
        raise exception 'category % is not enabled for branch %', r.v ->> 'category_key', r.v ->> 'branch_key';
      end if;
      if v_item.sales_category_id = v_cat then
        v_status := 'unchanged';
      else
        perform public.upsert_inventory_item(v_item.id, v_branch, v_item.code, v_item.name, v_item.unit,
          v_item.allows_decimal, v_cat, v_reason);
        v_status := case when v_item.sales_category_id is null then 'created' else 'updated' end;
      end if;
      perform public.internal_od_provenance('product_category', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('product_categories', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ========================== item_costs ==============================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'item_costs', '[]')) order by (value ->> 'effective_from') loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'item_code') || '@' || (r.v ->> 'effective_from');
    v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_item from public.inventory_items where branch_id = v_branch and code = r.v ->> 'item_code';
      if not found then raise exception 'item % does not exist in branch %', r.v ->> 'item_code', r.v ->> 'branch_key'; end if;
      v_eff := ((r.v ->> 'effective_from') || ' 00:00:00 Europe/Istanbul')::timestamptz;
      if exists (select 1 from public.inventory_item_costs
                 where inventory_item_id = v_item.id and effective_from = v_eff
                   and unit_cost = (r.v ->> 'unit_cost')::numeric) then
        v_status := 'unchanged';
      elsif exists (select 1 from public.inventory_item_costs where inventory_item_id = v_item.id and effective_from = v_eff) then
        raise exception 'a different cost already exists for this item on %: cost history is append-only', r.v ->> 'effective_from';
      else
        select max(effective_from) into v_latest from public.inventory_item_costs where inventory_item_id = v_item.id;
        if v_latest is not null and v_eff < v_latest then
          raise exception 'effective_from % is earlier than the latest recorded cost (history cannot be back-filled)', r.v ->> 'effective_from';
        end if;
        perform public.set_inventory_item_cost(v_item.id, (r.v ->> 'unit_cost')::numeric, v_eff, v_reason);
        v_status := 'created';
      end if;
      perform public.internal_od_provenance('item_cost', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('item_costs', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ========================== opening_stock ===========================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'opening_stock', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'item_code'); v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select * into v_item from public.inventory_items where branch_id = v_branch and code = r.v ->> 'item_code';
      if not found then raise exception 'item % does not exist in branch %', r.v ->> 'item_code', r.v ->> 'branch_key'; end if;
      select * into v_old from public.inventory_movements
        where inventory_item_id = v_item.id and movement_type = 'RECEIPT' and reference like 'OPENING-STOCK%'
        order by occurred_at limit 1;
      if found then
        if v_old.quantity = (r.v ->> 'quantity')::numeric then
          v_status := 'unchanged';
        else
          raise exception 'opening stock was already loaded with quantity % (the ledger is append-only)', v_old.quantity;
        end if;
      else
        if exists (select 1 from public.inventory_movements where inventory_item_id = v_item.id) then
          raise exception 'opening stock cannot be added after the item already has stock movements';
        end if;
        perform public.record_inventory_receipt(v_branch,
          jsonb_build_array(jsonb_build_object('inventory_item_id', v_item.id, 'quantity', (r.v ->> 'quantity')::numeric)),
          'OPENING-STOCK ' || (r.v ->> 'as_of_date'), v_reason);
        v_status := 'created';
      end if;
      perform public.internal_od_provenance('opening_stock', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('opening_stock', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ====================== reconciliation_thresholds ===================
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'reconciliation_thresholds', '[]')) loop
    v_key := r.v ->> 'branch_key'; v_status := 'rejected'; v_msg := null;
    begin
      select id into v_branch from public.branches where key = v_key;
      if v_branch is null then raise exception 'unknown branch %', v_key; end if;
      if (r.v ->> 'warning_percentage')::numeric >= (r.v ->> 'error_percentage')::numeric then
        raise exception 'warning threshold must be lower than the error threshold';
      end if;
      select * into v_old from public.reconciliation_thresholds where branch_id = v_branch;
      if not found then
        insert into public.reconciliation_thresholds (branch_id, warning_percentage, error_percentage, updated_by)
        values (v_branch, (r.v ->> 'warning_percentage')::numeric, (r.v ->> 'error_percentage')::numeric, p_actor);
        v_status := 'created';
      elsif v_old.warning_percentage = (r.v ->> 'warning_percentage')::numeric
        and v_old.error_percentage = (r.v ->> 'error_percentage')::numeric then
        v_status := 'unchanged';
      else
        update public.reconciliation_thresholds
          set warning_percentage = (r.v ->> 'warning_percentage')::numeric,
              error_percentage = (r.v ->> 'error_percentage')::numeric, updated_by = p_actor
          where branch_id = v_branch;
        v_status := 'updated';
      end if;
      if v_status <> 'unchanged' then
        perform public.write_audit_log('operating_data_load', 'reconciliation_thresholds', v_key,
          case when v_status = 'updated' then jsonb_build_object(
            'warning_percentage', v_old.warning_percentage, 'error_percentage', v_old.error_percentage) end,
          jsonb_build_object('warning_percentage', (r.v ->> 'warning_percentage')::numeric,
            'error_percentage', (r.v ->> 'error_percentage')::numeric), v_reason);
      end if;
      perform public.internal_od_provenance('threshold', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, null);
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('reconciliation_thresholds', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  -- ========================== waste_reasons ===========================
  -- The waste reason list is a CHECK constraint on inventory_movements
  -- (012), so a code outside it cannot be used. Only provenance and the
  -- label are recorded here; no table stores the list.
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'waste_reasons', '[]')) loop
    v_key := r.v ->> 'reason_code'; v_status := 'rejected'; v_msg := null;
    begin
      if v_key not in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other') then
        raise exception 'waste reason % is not supported by the schema (a migration would be needed)', v_key;
      end if;
      v_status := case when exists (select 1 from public.operating_data_provenance
                                    where entity_type = 'waste_reason' and entity_key = v_key
                                      and note is not distinct from (r.v ->> 'name')) then 'unchanged' else 'created' end;
      perform public.internal_od_provenance('waste_reason', v_key, r.v ->> 'provenance', r.v ->> 'approval_status', r.v ->> 'source', p_dataset, r.v ->> 'name');
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('waste_reasons', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;

  return v_res;
end;
$$;

revoke all on function public.internal_od_apply(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.internal_run_operating_data(text, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.internal_run_operating_data(text, jsonb, boolean) to service_role;

comment on function public.internal_run_operating_data(text, jsonb, boolean) is
  'Prepared operating-data loader entry point. Currently called only by the local-only CLI; service_role only. Verifies an active owner actor, applies the payload in one transaction, rolls back on dry run or any rejected row, and returns a per-row created/updated/unchanged/rejected report.';
