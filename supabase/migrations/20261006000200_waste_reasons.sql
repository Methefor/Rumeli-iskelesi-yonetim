-- =============================================================================
-- Phase 1B (1/3): configurable waste / fire reasons
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production.
--
-- Until now the WASTE reason was a fixed list enforced by a CHECK on
-- inventory_movements.reason_code and again inside record_inventory_waste. This migration makes the
-- catalogue DATA without touching the append-only ledger:
--
--   * public.waste_reasons is the catalogue (code is the stable key, name/description/sort/active are editable).
--   * The six historical codes are seeded, so every existing WASTE movement stays valid (no row is rewritten).
--   * The fixed CHECK is replaced by a foreign key inventory_movements.reason_code -> waste_reasons.code.
--     Deactivating a reason never invalidates history; codes are immutable.
--   * record_inventory_waste accepts only ACTIVE reasons.
--   * Only owner/manager (inventory.waste_reason.manage) change the catalogue, through audited RPCs.
--     The seeded names are historical defaults, NOT a decided final catalogue (open owner decision).
--
-- Rollback: supabase/rollback/v4_schema_teardown.sql (drops the table, functions and the FK with it).
-- =============================================================================

insert into public.permissions (key, description) values
  ('inventory.waste_reason.manage', 'Create, edit and (de)activate waste/fire reasons.'),
  ('inventory.waste_report.read',   'View the waste/fire report (by item, reason, employee, shift) for permitted branches.'),
  ('inventory.count_review.read',   'View closing-count variance classification and the manager count overview for permitted branches.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('inventory.waste_reason.manage', 'inventory.waste_report.read', 'inventory.count_review.read')
where r.key in ('owner', 'manager')
   or (r.key = 'branch_manager' and p.key in ('inventory.waste_report.read', 'inventory.count_review.read'))
on conflict do nothing;
-- cashier / employee / viewer: none (they keep inventory.record to ENTER waste and read active reasons).

create table if not exists public.waste_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]{1,39}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  description text check (description is null or length(description) <= 200),
  is_active boolean not null default true,
  sort_order integer not null default 100 check (sort_order between 0 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id),
  updated_by uuid references public.profiles (id)
);
comment on table public.waste_reasons is
  'Configurable waste/fire reason catalogue. code is immutable and referenced by inventory_movements.reason_code (FK), so history never breaks; reasons are deactivated, never deleted. Written only through upsert_waste_reason / set_waste_reason_active (audited).';
create trigger set_updated_at before update on public.waste_reasons
  for each row execute function public.set_updated_at();

-- historical defaults: the exact six values the fixed CHECK allowed
insert into public.waste_reasons (code, name, description, sort_order) values
  ('expired',  'Son kullanma tarihi', 'Son kullanma tarihi geçti', 10),
  ('damaged',  'Hasarlı / kırık',     'Kırılma, ezilme veya hasar', 20),
  ('spilled',  'Dökülme',             'Dökülme veya yanlış üretim', 30),
  ('quality',  'Kalite',              'Kalite standardını karşılamıyor', 40),
  ('sample',   'Numune / ikram',      'Numune veya ikram olarak verildi', 50),
  ('other',    'Diğer',               'Başka bir neden; açıklama yazın', 90)
on conflict (code) do nothing;

alter table public.waste_reasons enable row level security;
revoke all on public.waste_reasons from anon, authenticated;
grant select on public.waste_reasons to authenticated;
-- anyone who can enter or read inventory sees the ACTIVE reasons; managers also see inactive ones
create policy waste_reasons_select on public.waste_reasons
  for select to authenticated
  using (
    public.current_user_has_permission('inventory.waste_reason.manage')
    or (is_active and (public.current_user_has_permission('inventory.record') or public.current_user_has_permission('inventory.read')))
  );

-- the fixed CHECK becomes a foreign key (history stays valid: every old code is seeded above)
do $$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid = 'public.inventory_movements'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%reason_code%' and pg_get_constraintdef(oid) like '%expired%'
  loop
    execute format('alter table public.inventory_movements drop constraint %I', v_name);
  end loop;
end $$;
alter table public.inventory_movements
  add constraint inventory_movements_reason_code_fkey
  foreign key (reason_code) references public.waste_reasons (code) on update restrict on delete restrict;

-- ---------------------------------------------------------------------------
-- Catalogue management (audited)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_waste_reason(
  p_reason_id uuid,
  p_code text,
  p_name text,
  p_description text,
  p_sort_order integer,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_id uuid;
  v_code text := lower(trim(coalesce(p_code, '')));
begin
  if not public.current_user_has_permission('inventory.waste_reason.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'a name is required' using errcode = '22023';
  end if;

  if p_reason_id is null then
    if v_code !~ '^[a-z][a-z0-9_]{1,39}$' then
      raise exception 'code must be lower-case letters, digits and underscores (2-40, starting with a letter)' using errcode = '22023';
    end if;
    insert into public.waste_reasons (code, name, description, sort_order, created_by, updated_by)
    values (v_code, trim(p_name), nullif(trim(p_description), ''), coalesce(p_sort_order, 100), auth.uid(), auth.uid())
    returning id into v_id;
    perform public.write_audit_log('waste_reason_create', 'waste_reasons', v_id::text, null,
      jsonb_build_object('code', v_code, 'name', trim(p_name)), trim(p_reason));
  else
    select * into v_old from public.waste_reasons where id = p_reason_id for update;
    if not found then
      raise exception 'waste reason not found' using errcode = '22023';
    end if;
    -- the code is immutable: movements reference it
    update public.waste_reasons
       set name = trim(p_name), description = nullif(trim(p_description), ''),
           sort_order = coalesce(p_sort_order, v_old.sort_order), updated_by = auth.uid()
     where id = p_reason_id;
    v_id := p_reason_id;
    perform public.write_audit_log('waste_reason_update', 'waste_reasons', v_id::text,
      jsonb_build_object('name', v_old.name, 'description', v_old.description, 'sort_order', v_old.sort_order),
      jsonb_build_object('name', trim(p_name), 'description', nullif(trim(p_description), ''), 'sort_order', coalesce(p_sort_order, v_old.sort_order)),
      trim(p_reason));
  end if;
  return v_id;
end;
$$;
comment on function public.upsert_waste_reason(uuid, text, text, text, integer, text) is
  'Creates (p_reason_id null) or edits a waste reason. inventory.waste_reason.manage (owner/manager); the code of an existing reason cannot change; mandatory reason; audited.';
revoke all on function public.upsert_waste_reason(uuid, text, text, text, integer, text) from public, anon;
grant execute on function public.upsert_waste_reason(uuid, text, text, text, integer, text) to authenticated;

create or replace function public.set_waste_reason_active(p_reason_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  if not public.current_user_has_permission('inventory.waste_reason.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  select * into v_old from public.waste_reasons where id = p_reason_id for update;
  if not found then
    raise exception 'waste reason not found' using errcode = '22023';
  end if;
  update public.waste_reasons set is_active = p_active, updated_by = auth.uid() where id = p_reason_id;
  perform public.write_audit_log(case when p_active then 'waste_reason_activate' else 'waste_reason_deactivate' end,
    'waste_reasons', p_reason_id::text, jsonb_build_object('is_active', v_old.is_active), jsonb_build_object('is_active', p_active), trim(p_reason));
end;
$$;
comment on function public.set_waste_reason_active(uuid, boolean, text) is
  'Activates/deactivates a waste reason (never deletes: history keeps referencing it). inventory.waste_reason.manage; mandatory reason; audited.';
revoke all on function public.set_waste_reason_active(uuid, boolean, text) from public, anon;
grant execute on function public.set_waste_reason_active(uuid, boolean, text) to authenticated;

-- ---------------------------------------------------------------------------
-- record_inventory_waste: same behaviour, but the reason must be an ACTIVE catalogue entry
-- (replaces the fixed list; signature unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.record_inventory_waste(
  p_branch_id uuid,
  p_lines jsonb,
  p_reason_code text,
  p_note text default null,
  p_shift_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_item record;
  v_count integer := 0;
  v_summary jsonb := '[]'::jsonb;
begin
  if not public.current_user_can_inventory('inventory.record', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason_code is null or not exists (select 1 from public.waste_reasons where code = p_reason_code and is_active) then
    raise exception 'a valid, active waste reason code is required' using errcode = '22023';
  end if;

  perform public.inventory_resolve_shift_context(p_shift_id, p_branch_id);

  for v_line in select * from public.inventory_parse_lines(p_lines, 'quantity')
  loop
    select id, branch_id into v_item from public.inventory_items where id = v_line.item_id;
    if not found or v_item.branch_id <> p_branch_id then
      raise exception 'item does not belong to this branch' using errcode = '22023';
    end if;

    perform public.inventory_insert_movement(
      v_line.item_id, 'WASTE', v_line.qty, p_shift_id, null, null, p_reason_code, p_note, null, null
    );
    v_count := v_count + 1;
    v_summary := v_summary || jsonb_build_object('inventory_item_id', v_line.item_id, 'quantity', v_line.qty);
  end loop;

  perform public.write_audit_log(
    'inventory_waste', 'inventory_movements', p_branch_id::text, null,
    jsonb_build_object('lines', v_summary, 'reason_code', p_reason_code, 'shift_id', p_shift_id), p_note
  );

  return v_count;
end;
$$;
revoke all on function public.record_inventory_waste(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function public.record_inventory_waste(uuid, jsonb, text, text, uuid) to authenticated;
