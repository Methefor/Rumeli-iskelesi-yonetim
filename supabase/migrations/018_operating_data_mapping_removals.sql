-- =============================================================================
-- 018_operating_data_mapping_removals.sql
-- =============================================================================
-- STATUS: PREPARED; VALIDATED ON LOCAL SUPABASE ONLY (Stage 3).
-- Not applied to any hosted Supabase project.
--
-- Purpose: let the transactional operating-data loader (017) REMOVE an
-- obsolete branch/category mapping. Omitting a row from category_branches.csv
-- cannot do this because migration 009 already seeds mappings. Migration 017
-- is not rewritten; instead its row-processing body is renamed to
-- internal_od_apply_core and wrapped by a new internal_od_apply that runs the
-- core and then the removals, inside the SAME transaction started by
-- internal_run_operating_data (dry run and any rejected row still roll back
-- everything, removals included).
--
-- Only the service_role-only entry point internal_run_operating_data can reach
-- these functions; no client role gets execute or a raw delete grant.
--
-- Result vocabulary is unchanged: a real removal is reported as `updated` with
-- the message 'mapping removed'; an already-absent mapping is `unchanged`.
--
-- Depends on: 003, 009, 012, 017.
-- Rollback:
--   drop function if exists public.internal_od_apply(uuid, jsonb, text);
--   alter function public.internal_od_apply_core(uuid, jsonb, text) rename to internal_od_apply;
--   drop function if exists public.internal_od_remove_mappings(uuid, jsonb, text);
-- =============================================================================

alter function public.internal_od_apply(uuid, jsonb, text) rename to internal_od_apply_core;

create or replace function public.internal_od_remove_mappings(p_actor uuid, p_payload jsonb, p_dataset text)
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
  v_refs integer;
begin
  for r in select value as v from jsonb_array_elements(coalesce(p_payload -> 'category_branch_removals', '[]')) loop
    v_key := (r.v ->> 'branch_key') || '/' || (r.v ->> 'category_key');
    v_status := 'rejected'; v_msg := null;
    begin
      if coalesce(trim(r.v ->> 'reason'), '') = '' then
        raise exception 'a removal needs a reason';
      end if;
      select id into v_branch from public.branches where key = r.v ->> 'branch_key';
      if v_branch is null then raise exception 'unknown branch %', r.v ->> 'branch_key'; end if;
      select id into v_cat from public.sales_categories where key = r.v ->> 'category_key';
      if v_cat is null then raise exception 'unknown category %', r.v ->> 'category_key'; end if;

      if exists (select 1 from public.sales_category_branches where branch_id = v_branch and category_id = v_cat) then
        select count(*) into v_refs from public.inventory_items
          where branch_id = v_branch and sales_category_id = v_cat;
        if v_refs > 0 then
          raise exception 'cannot remove %: % inventory item(s) in this branch still use the category', v_key, v_refs;
        end if;
        delete from public.sales_category_branches where branch_id = v_branch and category_id = v_cat;
        v_status := 'updated'; v_msg := 'mapping removed';
        perform public.write_audit_log('operating_data_mapping_removal', 'sales_category_branches', v_key,
          jsonb_build_object('branch', r.v ->> 'branch_key', 'category', r.v ->> 'category_key'), null,
          r.v ->> 'reason');
      else
        v_status := 'unchanged'; v_msg := 'mapping already absent';
      end if;

      -- the removed mapping is no longer configuration: drop its old provenance,
      -- keep an explicit removal record
      delete from public.operating_data_provenance where entity_type = 'category_branch' and entity_key = v_key;
      perform public.internal_od_provenance('category_branch_removal', v_key, r.v ->> 'provenance',
        r.v ->> 'approval_status', r.v ->> 'source', p_dataset, r.v ->> 'reason');
    exception when others then
      v_status := 'rejected'; v_msg := sqlerrm;
    end;
    v_res := v_res || public.internal_od_result('category_branch_removals', (r.v ->> 'row')::int, v_key, v_status, v_msg);
  end loop;
  return v_res;
end;
$$;

create or replace function public.internal_od_apply(p_actor uuid, p_payload jsonb, p_dataset text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.internal_od_apply_core(p_actor, p_payload, p_dataset)
      || public.internal_od_remove_mappings(p_actor, p_payload, p_dataset);
end;
$$;

revoke all on function public.internal_od_remove_mappings(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.internal_od_apply(uuid, jsonb, text) from public, anon, authenticated;
revoke all on function public.internal_od_apply_core(uuid, jsonb, text) from public, anon, authenticated;

-- Migration 017's provenance upsert refreshed updated_at even when every
-- business value was identical. That made a reported `unchanged` re-apply
-- mutate database state. Keep the original API, but update only when source
-- data actually changed so the loader is state-idempotent too.
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
        updated_by = auth.uid()
  where (operating_data_provenance.classification,
         operating_data_provenance.approval_status,
         operating_data_provenance.dataset,
         operating_data_provenance.source,
         operating_data_provenance.note)
    is distinct from
        (excluded.classification,
         excluded.approval_status,
         excluded.dataset,
         excluded.source,
         excluded.note);
$$;

revoke all on function public.internal_od_provenance(text, text, text, text, text, text, text)
  from public, anon, authenticated;

comment on function public.internal_od_remove_mappings(uuid, jsonb, text) is
  'INTERNAL. Removes obsolete branch/category mappings for the operating-data loader; rejects when items still use the category. Audited; runs inside the loader transaction.';

-- Branch/category mappings now change only through the audited loader. Policy
-- sales_category_branches_write_privileged (010) let owner/manager INSERT/DELETE
-- raw rows with no audit trail; the app only ever reads this table (016 did the
-- same for shift_definitions and reconciliation_thresholds).
revoke insert, update, delete, truncate on public.sales_category_branches from anon, authenticated;
