-- =============================================================================
-- Legacy sales import: lineage, frozen references and transactional importer
-- =============================================================================
-- PREPARED ONLY. This migration never reads or mutates a hosted database by
-- itself. The service-role-only RPC accepts an explicit snapshot, validates it,
-- and either rolls the complete import back (dry run) or commits it atomically.
-- Existing legacy tables are never updated or deleted.
--
-- Depends on 001-018 and the timestamped cashier/shift migrations.
-- =============================================================================

create table public.legacy_cashier_profile_map (
  legacy_cashier_id uuid primary key,
  profile_id uuid not null unique references public.profiles(id),
  mapped_at timestamptz not null default now(),
  mapped_by uuid not null references public.profiles(id),
  reason text not null check (length(trim(reason)) >= 5)
);

create table public.legacy_sales_import_runs (
  id uuid primary key default gen_random_uuid(),
  source_fingerprint text not null unique,
  source_row_count integer not null check (source_row_count >= 0),
  result jsonb not null,
  imported_by uuid not null references public.profiles(id),
  imported_at timestamptz not null default now(),
  reason text not null check (length(trim(reason)) >= 5)
);

create table public.legacy_sales_report_links (
  legacy_report_id uuid not null,
  branch_key text not null check (branch_key in ('rumeli_iskelesi', 'iskele_dondurma', 'balik_ekmek')),
  sales_report_id uuid not null unique references public.sales_reports(id) on delete restrict,
  source_hash text not null,
  imported_at timestamptz not null default now(),
  primary key (legacy_report_id, branch_key)
);

create table public.legacy_reference_totals (
  period_start date not null,
  period_end date not null,
  scope_key text not null,
  amount numeric(14,2) not null check (amount >= 0),
  source text not null,
  primary key (period_start, period_end, scope_key)
);

comment on table public.legacy_reference_totals is
  'Frozen, previously presented management totals. They are comparison evidence, not row-level corrections.';

insert into public.legacy_reference_totals(period_start, period_end, scope_key, amount, source) values
  ('2026-06-01','2026-06-30','organization',5056781.50,'Frozen 2026 management presentation'),
  ('2026-07-01','2026-07-31','organization',5026842.50,'Frozen 2026 management presentation'),
  ('2026-08-01','2026-08-31','organization',5959133.74,'Frozen 2026 management presentation'),
  ('2026-06-01','2026-08-31','organization',16042757.74,'Frozen 2026 management presentation'),
  ('2026-06-01','2026-08-31','rumeli_iskelesi',13383339.24,'Frozen 2026 management presentation'),
  ('2026-06-01','2026-08-31','balik_ekmek',762181.50,'Frozen 2026 management presentation'),
  ('2026-06-01','2026-08-31','iskele_dondurma',1897237.00,'Frozen 2026 management presentation')
on conflict do nothing;

alter table public.legacy_cashier_profile_map enable row level security;
alter table public.legacy_sales_import_runs enable row level security;
alter table public.legacy_sales_report_links enable row level security;
alter table public.legacy_reference_totals enable row level security;

revoke all on public.legacy_cashier_profile_map from public, anon, authenticated;
revoke all on public.legacy_sales_import_runs from public, anon, authenticated;
revoke all on public.legacy_sales_report_links from public, anon, authenticated;
revoke all on public.legacy_reference_totals from public, anon, authenticated;
grant select on public.legacy_reference_totals to authenticated;

create policy legacy_reference_totals_manager_read
  on public.legacy_reference_totals for select to authenticated
  using (public.current_user_is_owner_or_manager());

create or replace function public.internal_apply_legacy_sales(
  p_actor uuid,
  p_rows jsonb,
  p_cashier_map jsonb,
  p_source_fingerprint text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  m record;
  c record;
  v_profile uuid;
  v_branch uuid;
  v_definition uuid;
  v_shift uuid;
  v_register uuid;
  v_report uuid;
  v_type text;
  v_gross numeric;
  v_items numeric;
  v_status text;
  v_source_hash text;
  v_existing record;
  v_created integer := 0;
  v_unchanged integer := 0;
  v_rumeli integer := 0;
  v_dondurma integer := 0;
  v_balik integer := 0;
  v_category jsonb;
  v_category_key text;
  v_category_amount numeric;
  v_category_id uuid;
  v_branch_key text;
  v_branch_amount numeric;
  v_submitted_at timestamptz;
begin
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'legacy rows must be a non-empty array' using errcode = '22023';
  end if;
  if jsonb_typeof(p_cashier_map) <> 'object' then
    raise exception 'cashier map must be an object' using errcode = '22023';
  end if;
  if p_source_fingerprint is null or length(trim(p_source_fingerprint)) < 16 then
    raise exception 'source fingerprint is required' using errcode = '22023';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'an import reason is required' using errcode = '22023';
  end if;

  -- Resolve and persist the explicit legacy-id -> V4 profile mapping. PINs
  -- and legacy names are intentionally not accepted by this function.
  for m in select key as legacy_id, value #>> '{}' as employee_code from jsonb_each(p_cashier_map) loop
    select id into v_profile from public.profiles
      where employee_code = upper(trim(m.employee_code));
    if v_profile is null then
      raise exception 'employee code % in cashier map does not exist', m.employee_code using errcode = '22023';
    end if;
    select * into v_existing from public.legacy_cashier_profile_map
      where legacy_cashier_id = m.legacy_id::uuid;
    if found and v_existing.profile_id <> v_profile then
      raise exception 'legacy cashier % is already mapped to a different profile', m.legacy_id using errcode = '22023';
    end if;
    insert into public.legacy_cashier_profile_map(legacy_cashier_id, profile_id, mapped_by, reason)
    values (m.legacy_id::uuid, v_profile, p_actor, p_reason)
    on conflict (legacy_cashier_id) do nothing;
  end loop;

  -- Preserve historical register identities instead of guessing that the old
  -- Cafeterya/Restoran labels are identical to today's Ana/2. Kasa devices.
  select id into v_branch from public.branches where key = 'rumeli_iskelesi';
  insert into public.registers(branch_id,key,name,is_active,created_by,updated_by) values
    (v_branch,'cafetarya','Cafeterya (Tarihsel)',false,p_actor,p_actor),
    (v_branch,'restoran','Restoran (Tarihsel)',false,p_actor,p_actor)
  on conflict (branch_id,key) do nothing;

  for r in select value as v from jsonb_array_elements(p_rows) loop
    if (r.v ->> 'id') is null or (r.v ->> 'date') is null or (r.v ->> 'cashier_id') is null then
      raise exception 'legacy row is missing id/date/cashier_id' using errcode = '22023';
    end if;
    if coalesce(r.v ->> 'shift','') not in ('sabah','aksam') then
      raise exception 'unsupported legacy shift %', r.v ->> 'shift' using errcode = '22023';
    end if;
    if coalesce(r.v ->> 'kasa','') not in ('ana_kasa','iki_kasa','cafetarya','restoran') then
      raise exception 'unsupported legacy register %', r.v ->> 'kasa' using errcode = '22023';
    end if;
    select profile_id into v_profile from public.legacy_cashier_profile_map
      where legacy_cashier_id = (r.v ->> 'cashier_id')::uuid;
    if v_profile is null then
      raise exception 'legacy cashier % is not mapped', r.v ->> 'cashier_id' using errcode = '22023';
    end if;

    v_submitted_at := coalesce(nullif(r.v ->> 'entry_time','')::timestamptz,
      nullif(r.v ->> 'created_at','')::timestamptz,
      ((r.v ->> 'date')::date::timestamp + interval '23 hours') at time zone 'Europe/Istanbul');
    v_type := case r.v ->> 'shift' when 'sabah' then 'X' else 'Z' end;
    v_source_hash := md5(r.v::text);

    -- Rumeli record: one report per original register row. Branch revenue is
    -- recomputed from its two source fields; total_revenue is deliberately not
    -- trusted because 55 live rows disagree with their branch components.
    v_branch_key := 'rumeli_iskelesi';
    v_gross := coalesce((r.v ->> 'rumeli_z1')::numeric,0) + coalesce((r.v ->> 'rumeli_z2')::numeric,0);
    select * into v_existing from public.legacy_sales_report_links
      where legacy_report_id=(r.v ->> 'id')::uuid and branch_key=v_branch_key;
    if found then
      if v_existing.source_hash <> v_source_hash then
        raise exception 'source drift for legacy report % / %', r.v ->> 'id', v_branch_key using errcode = '22023';
      end if;
      v_unchanged := v_unchanged + 1;
    else
      select id into strict v_branch from public.branches where key=v_branch_key;
      select id into strict v_definition from public.shift_definitions
        where branch_id=v_branch and key=case r.v ->> 'shift' when 'sabah' then 'morning' else 'evening' end;
      insert into public.shifts(branch_id,shift_definition_id,business_date,status,created_by,updated_by)
      values(v_branch,v_definition,(r.v ->> 'date')::date,'closed',p_actor,p_actor)
      on conflict(branch_id,shift_definition_id,business_date) do nothing;
      select id into strict v_shift from public.shifts
        where branch_id=v_branch and shift_definition_id=v_definition and business_date=(r.v ->> 'date')::date;
      select id into strict v_register from public.registers where branch_id=v_branch and key=r.v ->> 'kasa';
      insert into public.shift_assignments(shift_id,user_id,status,is_on_time,assigned_by,created_at,updated_at)
      values(v_shift,v_profile,'confirmed',(r.v ->> 'is_on_time')::boolean,p_actor,v_submitted_at,v_submitted_at)
      on conflict(shift_id,user_id) do nothing;

      v_category := jsonb_build_object(
        'gida',coalesce((r.v ->> 'gida')::numeric,0),
        'kahvalti',coalesce((r.v ->> 'kahvalti')::numeric,0),
        'kahve',coalesce((r.v ->> 'kahve')::numeric,0),
        'meyve_suyu',coalesce((r.v ->> 'meyvesuyu')::numeric,0),
        'sicak_icecek',coalesce((r.v ->> 'sicak_icecek')::numeric,0),
        'soguk_icecek',coalesce((r.v ->> 'soguk_icecek')::numeric,0),
        'salata',coalesce((r.v ->> 'salata')::numeric,0),
        'tatli',coalesce((r.v ->> 'tatli')::numeric,0),
        'dondurma',coalesce((r.v ->> 'dondurma_kategori')::numeric,0),
        'borek_corek',coalesce((r.v ->> 'borek_corek')::numeric,0));
      select coalesce(sum((value #>> '{}')::numeric),0) into v_items from jsonb_each(v_category);
      v_status := public.compute_reconciliation_status(v_gross,v_items,v_branch);
      insert into public.sales_reports(branch_id,shift_id,register_id,submitted_by,report_type,gross_revenue,notes,status,reconciliation_status,created_at,submitted_at,updated_at)
      values(v_branch,v_shift,v_register,v_profile,v_type,v_gross,nullif(r.v ->> 'notlar',''),'submitted',v_status,
        coalesce(nullif(r.v ->> 'created_at','')::timestamptz,v_submitted_at),v_submitted_at,v_submitted_at)
      returning id into v_report;
      for c in select key, value from jsonb_each(v_category) loop
        v_category_key := c.key; v_category_amount := (c.value #>> '{}')::numeric;
        if v_category_amount > 0 then
          select id into strict v_category_id from public.sales_categories where key=v_category_key;
          insert into public.sales_report_items(sales_report_id,category_id,amount,created_at,updated_at)
          values(v_report,v_category_id,v_category_amount,v_submitted_at,v_submitted_at);
        end if;
      end loop;
      insert into public.legacy_sales_report_links values((r.v ->> 'id')::uuid,v_branch_key,v_report,v_source_hash,now());
      v_created := v_created + 1; v_rumeli := v_rumeli + 1;
    end if;

    -- Branch columns only exist in the legacy evening/Z report and contain no
    -- trustworthy category split. Import gross revenue, leave items empty and
    -- retain ERROR reconciliation so the missing breakdown stays visible.
    if v_type = 'Z' then
      foreach v_branch_key in array array['iskele_dondurma','balik_ekmek'] loop
        v_branch_amount := case v_branch_key
          when 'iskele_dondurma' then coalesce((r.v ->> 'dondurma')::numeric,0)
          else coalesce((r.v ->> 'balik_ekmek')::numeric,0) end;
        if v_branch_amount > 0 then
          select * into v_existing from public.legacy_sales_report_links
            where legacy_report_id=(r.v ->> 'id')::uuid and branch_key=v_branch_key;
          if found then
            if v_existing.source_hash <> v_source_hash then
              raise exception 'source drift for legacy report % / %', r.v ->> 'id', v_branch_key using errcode = '22023';
            end if;
            v_unchanged := v_unchanged + 1;
          else
            select id into strict v_branch from public.branches where key=v_branch_key;
            select id into strict v_definition from public.shift_definitions where branch_id=v_branch and key='daily';
            insert into public.shifts(branch_id,shift_definition_id,business_date,status,created_by,updated_by)
            values(v_branch,v_definition,(r.v ->> 'date')::date,'closed',p_actor,p_actor)
            on conflict(branch_id,shift_definition_id,business_date) do nothing;
            select id into strict v_shift from public.shifts
              where branch_id=v_branch and shift_definition_id=v_definition and business_date=(r.v ->> 'date')::date;
            select id into strict v_register from public.registers where branch_id=v_branch and key='s900';
            insert into public.shift_assignments(shift_id,user_id,status,is_on_time,assigned_by,created_at,updated_at)
            values(v_shift,v_profile,'confirmed',(r.v ->> 'is_on_time')::boolean,p_actor,v_submitted_at,v_submitted_at)
            on conflict(shift_id,user_id) do nothing;
            insert into public.sales_reports(branch_id,shift_id,register_id,submitted_by,report_type,gross_revenue,notes,status,reconciliation_status,created_at,submitted_at,updated_at)
            values(v_branch,v_shift,v_register,v_profile,'Z',v_branch_amount,
              'Legacy aktarım: kategori kırılımı kaynak veride bulunmuyor.','submitted','ERROR',
              coalesce(nullif(r.v ->> 'created_at','')::timestamptz,v_submitted_at),v_submitted_at,v_submitted_at)
            returning id into v_report;
            insert into public.legacy_sales_report_links values((r.v ->> 'id')::uuid,v_branch_key,v_report,v_source_hash,now());
            v_created := v_created + 1;
            if v_branch_key='iskele_dondurma' then v_dondurma:=v_dondurma+1; else v_balik:=v_balik+1; end if;
          end if;
        end if;
      end loop;
    end if;
  end loop;

  return jsonb_build_object(
    'sourceRows',jsonb_array_length(p_rows),'createdReports',v_created,'unchangedReports',v_unchanged,
    'rumeliReports',v_rumeli,'dondurmaReports',v_dondurma,'balikReports',v_balik,
    'sourceFingerprint',p_source_fingerprint);
end;
$$;

create or replace function public.internal_run_legacy_sales_import(
  p_actor_code text,
  p_rows jsonb,
  p_cashier_map jsonb,
  p_source_fingerprint text,
  p_reason text,
  p_commit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_result jsonb;
  v_detail text;
begin
  select id into v_actor from public.profiles
    where employee_code=upper(trim(p_actor_code)) and is_active;
  if v_actor is null or public.user_rank(v_actor) < 4 then
    raise exception 'an active owner actor is required' using errcode='42501';
  end if;
  if exists(select 1 from public.legacy_sales_import_runs where source_fingerprint=p_source_fingerprint) then
    return jsonb_build_object('applied',false,'alreadyImported',true,'sourceFingerprint',p_source_fingerprint);
  end if;
  begin
    v_result := public.internal_apply_legacy_sales(v_actor,p_rows,p_cashier_map,p_source_fingerprint,p_reason);
    if p_commit then
      insert into public.legacy_sales_import_runs(source_fingerprint,source_row_count,result,imported_by,reason)
      values(p_source_fingerprint,jsonb_array_length(p_rows),v_result,v_actor,p_reason);
      return jsonb_build_object('applied',true,'alreadyImported',false,'result',v_result);
    end if;
    raise exception 'legacy_import_rollback' using errcode='LI001',detail=jsonb_build_object('applied',false,'alreadyImported',false,'result',v_result)::text;
  exception when sqlstate 'LI001' then
    get stacked diagnostics v_detail=pg_exception_detail;
    return v_detail::jsonb;
  end;
end;
$$;

revoke all on function public.internal_apply_legacy_sales(uuid,jsonb,jsonb,text,text) from public, anon, authenticated;
revoke all on function public.internal_run_legacy_sales_import(text,jsonb,jsonb,text,text,boolean) from public, anon, authenticated;
grant execute on function public.internal_run_legacy_sales_import(text,jsonb,jsonb,text,text,boolean) to service_role;

comment on function public.internal_run_legacy_sales_import(text,jsonb,jsonb,text,text,boolean) is
  'Service-role-only, transactional and idempotent legacy sales importer. Dry run rolls back all writes.';
