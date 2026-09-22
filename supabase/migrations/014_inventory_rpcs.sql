-- =============================================================================
-- 014_inventory_rpcs.sql
-- =============================================================================
-- STATUS: PREPARED ONLY (Phase E). Not applied to any hosted Supabase project.
--
-- Purpose:
--   The ONLY mutation path for inventory data (013 grants no client write),
--   plus the sales-report <-> inventory integration.
--
--   Public RPC surface (kept deliberately small):
--     upsert_inventory_item          create/update an item
--     set_inventory_item_active      activate/deactivate an item
--     set_inventory_item_cost        append a new effective-dated unit cost
--     record_inventory_receipt       incoming stock (optionally with a cost)
--     record_inventory_waste         waste/fire
--     record_inventory_adjustment    privileged ledger adjustment (IN/OUT)
--     reverse_inventory_movement     privileged reversal of one movement
--     submit_inventory_count         physical closing count (never touches ledger)
--     void_inventory_count           privileged void of a mistaken count
--     get_inventory_gross_profit     cost-gated gross-profit lines (read)
--   Replaced (same signatures) from 011, now inventory-aware:
--     create_sales_report / edit_sales_report / cancel_sales_report
--
--   Every SECURITY DEFINER function here: fixed search_path; authorizes the
--   caller INSIDE the body via current_user_can_inventory (permission +
--   branch scope); never takes an actor id (write_audit_log uses auth.uid());
--   revokes EXECUTE from PUBLIC and anon; grants only `authenticated` for the
--   public RPCs and NOTHING for internal helpers (callable only by other
--   definer functions). Server clock only: no RPC accepts a timestamp for
--   when a movement "happened".
--
-- Depends on: 001-005, 009, 011 (replaces three functions), 012, 013.
--
-- Rollback (public RPCs; restore 011's sales functions from that file):
--   drop function if exists public.get_inventory_gross_profit(uuid, timestamptz, timestamptz);
--   drop function if exists public.void_inventory_count(uuid, text);
--   drop function if exists public.submit_inventory_count(uuid, uuid, jsonb, text);
--   drop function if exists public.reverse_inventory_movement(uuid, text);
--   drop function if exists public.record_inventory_adjustment(uuid, text, numeric, text, uuid);
--   drop function if exists public.record_inventory_waste(uuid, jsonb, text, text, uuid);
--   drop function if exists public.record_inventory_receipt(uuid, jsonb, text, text);
--   drop function if exists public.set_inventory_item_cost(uuid, numeric, timestamptz, text);
--   drop function if exists public.set_inventory_item_active(uuid, boolean, text);
--   drop function if exists public.upsert_inventory_item(uuid, uuid, text, text, text, boolean, uuid, text);
--   drop function if exists public.inventory_reverse_sales_lines(uuid, text);
--   drop function if exists public.inventory_apply_sales_lines(uuid);
--   drop function if exists public.sales_report_write_items(uuid, uuid, jsonb);
--   drop function if exists public.inventory_resolve_shift_context(uuid, uuid);
--   drop function if exists public.inventory_insert_movement(uuid, text, numeric, uuid, uuid, uuid, text, text, text, uuid);
--   drop function if exists public.inventory_set_cost_internal(uuid, numeric, timestamptz, text);
--   drop function if exists public.inventory_parse_lines(jsonb, text);
--   drop function if exists public.inventory_stock_quantity(uuid);
--   drop function if exists public.inventory_effective_cost(uuid, timestamptz);
--   then re-run the create-or-replace statements for create/edit/cancel_sales_report from 011.
-- =============================================================================

-- ===========================================================================
-- Internal helpers (no client execute privilege at all)
-- ===========================================================================

create or replace function public.inventory_effective_cost(p_item_id uuid, p_at timestamptz default now())
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select c.unit_cost
  from public.inventory_item_costs c
  where c.inventory_item_id = p_item_id and c.effective_from <= p_at
  order by c.effective_from desc
  limit 1;
$$;

comment on function public.inventory_effective_cost(uuid, timestamptz) is
  'INTERNAL. The unit cost in effect for an item at a point in time (latest effective_from <= p_at), or NULL if none was ever set. Not client-callable: it would leak cost.';

revoke all on function public.inventory_effective_cost(uuid, timestamptz) from public, anon, authenticated;


create or replace function public.inventory_stock_quantity(p_item_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(stock_delta), 0) from public.inventory_movements where inventory_item_id = p_item_id;
$$;

comment on function public.inventory_stock_quantity(uuid) is
  'INTERNAL. Theoretical stock for an item = sum of ledger stock_delta.';

revoke all on function public.inventory_stock_quantity(uuid) from public, anon, authenticated;


-- Validates and unpacks a jsonb array of {inventory_item_id, <qty key>, unit_cost?}.
create or replace function public.inventory_parse_lines(p_lines jsonb, p_qty_key text)
returns table (item_id uuid, qty numeric, unit_cost numeric)
language plpgsql
stable
set search_path = public
as $$
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line is required' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'too many lines (max 200)' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(p_lines) e where nullif(e ->> 'inventory_item_id', '') is null) then
    raise exception 'every line needs an inventory_item_id' using errcode = '22023';
  end if;
  if (select count(*) <> count(distinct e ->> 'inventory_item_id') from jsonb_array_elements(p_lines) e) then
    raise exception 'an item may appear only once per submission' using errcode = '22023';
  end if;

  return query
    select (e ->> 'inventory_item_id')::uuid,
           (e ->> p_qty_key)::numeric,
           nullif(e ->> 'unit_cost', '')::numeric
    from jsonb_array_elements(p_lines) e;
end;
$$;

comment on function public.inventory_parse_lines(jsonb, text) is
  'INTERNAL. Validates the shape of a lines payload (non-empty, <=200, item id present, no duplicate items) and unpacks it.';

revoke all on function public.inventory_parse_lines(jsonb, text) from public, anon, authenticated;


-- Appends a cost row. Append-only + monotonic: the new effective_from must be
-- strictly later than the latest existing one, so history is never rewritten
-- or back-filled. A typo'd far-future date would block later cost changes
-- forever (rows cannot be deleted), so it is capped at 30 days ahead.
create or replace function public.inventory_set_cost_internal(
  p_item_id uuid,
  p_unit_cost numeric,
  p_effective_from timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_latest timestamptz;
  v_id uuid;
begin
  if p_unit_cost is null or p_unit_cost < 0 or p_unit_cost >= 1000000000 then
    raise exception 'unit cost must be between 0 and 999999999.9999' using errcode = '22023';
  end if;
  if p_unit_cost <> round(p_unit_cost, 4) then
    raise exception 'unit cost supports at most 4 decimal places' using errcode = '22023';
  end if;
  if p_effective_from > now() + interval '30 days' then
    raise exception 'effective_from cannot be more than 30 days in the future' using errcode = '22023';
  end if;

  select max(effective_from) into v_latest from public.inventory_item_costs where inventory_item_id = p_item_id;
  if v_latest is not null and p_effective_from <= v_latest then
    raise exception 'effective_from must be later than the latest existing cost (%): cost history is append-only', v_latest
      using errcode = '22023';
  end if;

  insert into public.inventory_item_costs (inventory_item_id, unit_cost, effective_from, reason, created_by)
  values (p_item_id, p_unit_cost, p_effective_from, nullif(trim(p_reason), ''), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.inventory_set_cost_internal(uuid, numeric, timestamptz, text) is
  'INTERNAL. Appends an effective-dated cost row (monotonic, append-only). Callers authorize first (set_inventory_item_cost, record_inventory_receipt).';

revoke all on function public.inventory_set_cost_internal(uuid, numeric, timestamptz, text) from public, anon, authenticated;


-- THE single place a ledger row is written. Computes stock_delta from the
-- movement type (never client-supplied), snapshots the effective cost, and
-- for a REVERSAL copies quantity/cost/context from the original with the
-- opposite sign.
create or replace function public.inventory_insert_movement(
  p_item_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_shift_id uuid default null,
  p_sales_report_id uuid default null,
  p_count_id uuid default null,
  p_reason_code text default null,
  p_reason text default null,
  p_reference text default null,
  p_reverses_movement_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_orig record;
  v_qty numeric := p_quantity;
  v_delta numeric;
  v_snapshot numeric;
  v_shift uuid := p_shift_id;
  v_report uuid := p_sales_report_id;
  v_count uuid := p_count_id;
  v_id uuid;
begin
  select id, branch_id, is_active, allows_decimal into v_item
  from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item % not found', p_item_id using errcode = '22023';
  end if;

  if p_movement_type = 'REVERSAL' then
    select * into v_orig from public.inventory_movements where id = p_reverses_movement_id;
    if not found or v_orig.inventory_item_id <> p_item_id then
      raise exception 'movement to reverse not found for this item' using errcode = '22023';
    end if;
    if v_orig.movement_type = 'REVERSAL' then
      raise exception 'a reversal cannot itself be reversed' using errcode = '22023';
    end if;
    v_qty := v_orig.quantity;
    v_delta := -v_orig.stock_delta;
    v_snapshot := v_orig.unit_cost_snapshot;
    v_shift := v_orig.shift_id;
    v_report := v_orig.sales_report_id;
    v_count := v_orig.inventory_count_id;
  else
    if not v_item.is_active then
      raise exception 'inventory item is inactive' using errcode = '22023';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'quantity must be greater than zero' using errcode = '22023';
    end if;
    if v_qty <> round(v_qty, 3) then
      raise exception 'quantity supports at most 3 decimal places' using errcode = '22023';
    end if;
    if not v_item.allows_decimal and v_qty <> trunc(v_qty) then
      raise exception 'this item is counted in whole units' using errcode = '22023';
    end if;
    v_delta := case when p_movement_type in ('RECEIPT', 'ADJUSTMENT_IN') then v_qty else -v_qty end;
    v_snapshot := public.inventory_effective_cost(p_item_id, now());
  end if;

  insert into public.inventory_movements (
    branch_id, inventory_item_id, movement_type, quantity, stock_delta, unit_cost_snapshot,
    shift_id, sales_report_id, inventory_count_id, reverses_movement_id,
    reason_code, reason, reference, created_by
  )
  values (
    v_item.branch_id, p_item_id, p_movement_type, v_qty, v_delta, v_snapshot,
    v_shift, v_report, v_count, p_reverses_movement_id,
    p_reason_code, nullif(trim(p_reason), ''), nullif(trim(p_reference), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.inventory_insert_movement(uuid, text, numeric, uuid, uuid, uuid, text, text, text, uuid) is
  'INTERNAL. The only ledger writer. stock_delta and unit_cost_snapshot are computed here; occurred_at is the column default now() (server clock). Callers authorize before calling.';

revoke all on function public.inventory_insert_movement(uuid, text, numeric, uuid, uuid, uuid, text, text, text, uuid) from public, anon, authenticated;


-- Validates an optional shift for a branch-scoped inventory action and returns
-- the business date to attribute it to. An ordinary caller must be assigned
-- to the shift; an owner/manager or branch_manager with inventory.adjust in that branch may act on any
-- of its shifts. No shift -> today's date in Istanbul.
create or replace function public.inventory_resolve_shift_context(p_shift_id uuid, p_branch_id uuid)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift record;
begin
  if p_shift_id is null then
    return (now() at time zone 'Europe/Istanbul')::date;
  end if;

  select branch_id, status, business_date into v_shift from public.shifts where id = p_shift_id;
  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;
  if v_shift.branch_id <> p_branch_id then
    raise exception 'shift belongs to a different branch' using errcode = '22023';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'cannot record inventory against a cancelled shift' using errcode = '22023';
  end if;

  if not (
    exists (
      select 1 from public.shift_assignments
      where shift_id = p_shift_id and user_id = auth.uid() and status <> 'cancelled'
    )
    or (public.current_user_can_inventory('inventory.adjust', p_branch_id)
        and (public.current_user_is_owner_or_manager()
             or 'branch_manager' in (select public.current_user_role_keys())))
  ) then
    raise exception 'not authorized: not assigned to this shift' using errcode = '42501';
  end if;

  return v_shift.business_date;
end;
$$;

comment on function public.inventory_resolve_shift_context(uuid, uuid) is
  'INTERNAL. Validates an optional shift for waste/count and returns its business_date (Istanbul today when no shift).';

revoke all on function public.inventory_resolve_shift_context(uuid, uuid) from public, anon, authenticated;


-- ===========================================================================
-- Item management
-- ===========================================================================

create or replace function public.upsert_inventory_item(
  p_item_id uuid,
  p_branch_id uuid,
  p_code text,
  p_name text,
  p_unit text,
  p_allows_decimal boolean default true,
  p_sales_category_id uuid default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_branch uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
  v_name text := trim(coalesce(p_name, ''));
  v_unit text := trim(coalesce(p_unit, ''));
  v_id uuid;
begin
  if p_item_id is null then
    v_branch := p_branch_id;
  else
    select * into v_old from public.inventory_items where id = p_item_id;
    if not found then
      raise exception 'inventory item % not found', p_item_id using errcode = '22023';
    end if;
    v_branch := v_old.branch_id;
    if p_branch_id is not null and p_branch_id <> v_branch then
      raise exception 'an item cannot change branch' using errcode = '22023';
    end if;
  end if;

  if v_branch is null then
    raise exception 'branch is required' using errcode = '22023';
  end if;
  if not public.current_user_can_inventory('inventory.item.manage', v_branch) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if v_code !~ '^[A-Z0-9][A-Z0-9._-]{0,31}$' then
    raise exception 'invalid item code' using errcode = '22023';
  end if;
  if length(v_name) = 0 then
    raise exception 'item name is required' using errcode = '22023';
  end if;
  if length(v_unit) = 0 or length(v_unit) > 16 then
    raise exception 'item unit is required (max 16 characters)' using errcode = '22023';
  end if;
  if p_sales_category_id is not null and not exists (
    select 1 from public.sales_category_branches
    where branch_id = v_branch and category_id = p_sales_category_id
  ) then
    raise exception 'that sales category is not enabled for this branch' using errcode = '22023';
  end if;

  if p_item_id is null then
    insert into public.inventory_items (branch_id, code, name, unit, allows_decimal, sales_category_id, created_by, updated_by)
    values (v_branch, v_code, v_name, v_unit, coalesce(p_allows_decimal, true), p_sales_category_id, auth.uid(), auth.uid())
    returning id into v_id;

    perform public.write_audit_log(
      'inventory_item_create', 'inventory_items', v_id::text, null,
      jsonb_build_object('branch_id', v_branch, 'code', v_code, 'name', v_name, 'unit', v_unit), p_reason
    );
  else
    v_id := p_item_id;
    if (v_old.unit is distinct from v_unit
        or v_old.allows_decimal is distinct from coalesce(p_allows_decimal, v_old.allows_decimal))
       and exists (select 1 from public.inventory_movements where inventory_item_id = p_item_id) then
      raise exception 'unit and decimal setting cannot change once the item has stock movements' using errcode = '22023';
    end if;

    update public.inventory_items
      set code = v_code,
          name = v_name,
          unit = v_unit,
          allows_decimal = coalesce(p_allows_decimal, allows_decimal),
          sales_category_id = p_sales_category_id,
          updated_by = auth.uid()
      where id = p_item_id;

    perform public.write_audit_log(
      'inventory_item_update', 'inventory_items', v_id::text,
      jsonb_build_object('code', v_old.code, 'name', v_old.name, 'unit', v_old.unit, 'sales_category_id', v_old.sales_category_id),
      jsonb_build_object('code', v_code, 'name', v_name, 'unit', v_unit, 'sales_category_id', p_sales_category_id),
      p_reason
    );
  end if;

  return v_id;
exception
  when unique_violation then
    raise exception 'an item with code % already exists in this branch', v_code using errcode = '23505';
end;
$$;

comment on function public.upsert_inventory_item(uuid, uuid, text, text, text, boolean, uuid, text) is
  'Create (p_item_id null) or update an inventory item. inventory.item.manage + branch scope. Unit/decimal are frozen once movements exist. Audited: inventory_item_create / inventory_item_update.';

revoke all on function public.upsert_inventory_item(uuid, uuid, text, text, text, boolean, uuid, text) from public, anon;
grant execute on function public.upsert_inventory_item(uuid, uuid, text, text, text, boolean, uuid, text) to authenticated;


create or replace function public.set_inventory_item_active(
  p_item_id uuid,
  p_is_active boolean,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
begin
  select id, branch_id, is_active into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item % not found', p_item_id using errcode = '22023';
  end if;
  if not public.current_user_can_inventory('inventory.item.manage', v_item.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_is_active is null then
    raise exception 'is_active is required' using errcode = '22023';
  end if;

  update public.inventory_items set is_active = p_is_active, updated_by = auth.uid() where id = p_item_id;

  perform public.write_audit_log(
    'inventory_item_active_change', 'inventory_items', p_item_id::text,
    jsonb_build_object('is_active', v_item.is_active), jsonb_build_object('is_active', p_is_active), p_reason
  );
end;
$$;

comment on function public.set_inventory_item_active(uuid, boolean, text) is
  'Activate/deactivate an item (never deleted). inventory.item.manage + branch scope. Audited: inventory_item_active_change.';

revoke all on function public.set_inventory_item_active(uuid, boolean, text) from public, anon;
grant execute on function public.set_inventory_item_active(uuid, boolean, text) to authenticated;


-- ===========================================================================
-- Cost (effective-dated, append-only, privileged, audited)
-- ===========================================================================

create or replace function public.set_inventory_item_cost(
  p_item_id uuid,
  p_unit_cost numeric,
  p_effective_from timestamptz default null,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_previous numeric;
  v_cost_id uuid;
  v_effective timestamptz := coalesce(p_effective_from, now());
begin
  select id, branch_id into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item % not found', p_item_id using errcode = '22023';
  end if;
  if not public.current_user_can_inventory('inventory.cost.manage', v_item.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_previous := public.inventory_effective_cost(p_item_id, now());
  v_cost_id := public.inventory_set_cost_internal(p_item_id, p_unit_cost, v_effective, p_reason);

  perform public.write_audit_log(
    'inventory_cost_change', 'inventory_item_costs', v_cost_id::text,
    jsonb_build_object('inventory_item_id', p_item_id, 'unit_cost', v_previous),
    jsonb_build_object('inventory_item_id', p_item_id, 'unit_cost', p_unit_cost, 'effective_from', v_effective),
    p_reason
  );

  return v_cost_id;
end;
$$;

comment on function public.set_inventory_item_cost(uuid, numeric, timestamptz, text) is
  'Appends a new effective-dated unit cost (never edits history). inventory.cost.manage + branch scope. effective_from must be later than the latest existing cost. Audited: inventory_cost_change.';

revoke all on function public.set_inventory_item_cost(uuid, numeric, timestamptz, text) from public, anon;
grant execute on function public.set_inventory_item_cost(uuid, numeric, timestamptz, text) to authenticated;


-- ===========================================================================
-- Stock movements
-- ===========================================================================

-- Incoming stock. Lines: [{inventory_item_id, quantity, unit_cost?}]. A line
-- unit_cost is honoured ONLY for a caller who also holds inventory.cost.manage
-- (it appends a new effective cost at "now" when it differs from the current
-- one); it never lets a receiver quietly set cost.
create or replace function public.record_inventory_receipt(
  p_branch_id uuid,
  p_lines jsonb,
  p_reference text default null,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_item record;
  v_current numeric;
  v_count integer := 0;
  v_has_cost boolean;
  v_summary jsonb := '[]'::jsonb;
begin
  if not public.current_user_can_inventory('inventory.receive', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(bool_or(unit_cost is not null), false) into v_has_cost
  from public.inventory_parse_lines(p_lines, 'quantity');
  if v_has_cost and not public.current_user_can_inventory('inventory.cost.manage', p_branch_id) then
    raise exception 'not authorized to set unit cost' using errcode = '42501';
  end if;

  for v_line in select * from public.inventory_parse_lines(p_lines, 'quantity')
  loop
    select id, branch_id into v_item from public.inventory_items where id = v_line.item_id;
    if not found or v_item.branch_id <> p_branch_id then
      raise exception 'item does not belong to this branch' using errcode = '22023';
    end if;

    if v_line.unit_cost is not null then
      v_current := public.inventory_effective_cost(v_line.item_id, now());
      if v_current is distinct from v_line.unit_cost then
        perform public.inventory_set_cost_internal(
          v_line.item_id, v_line.unit_cost, now(), coalesce(nullif(trim(p_reference), ''), 'receipt')
        );
      end if;
    end if;

    perform public.inventory_insert_movement(
      v_line.item_id, 'RECEIPT', v_line.qty, null, null, null, null, p_note, p_reference, null
    );
    v_count := v_count + 1;
    v_summary := v_summary || jsonb_build_object('inventory_item_id', v_line.item_id, 'quantity', v_line.qty);
  end loop;

  perform public.write_audit_log(
    'inventory_receipt', 'inventory_movements', p_branch_id::text, null,
    jsonb_build_object('lines', v_summary, 'reference', p_reference, 'cost_supplied', v_has_cost), p_note
  );

  return v_count;
end;
$$;

comment on function public.record_inventory_receipt(uuid, jsonb, text, text) is
  'Records incoming stock (RECEIPT movements) at server time. inventory.receive + branch scope; a line unit_cost additionally requires inventory.cost.manage. Audited: inventory_receipt.';

revoke all on function public.record_inventory_receipt(uuid, jsonb, text, text) from public, anon;
grant execute on function public.record_inventory_receipt(uuid, jsonb, text, text) to authenticated;


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
  if p_reason_code is null or p_reason_code not in ('expired', 'damaged', 'spilled', 'quality', 'sample', 'other') then
    raise exception 'a valid waste reason code is required' using errcode = '22023';
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

comment on function public.record_inventory_waste(uuid, jsonb, text, text, uuid) is
  'Records waste/fire (WASTE movements). inventory.record + branch scope; an optional shift must belong to the branch and (for non-privileged callers) be one the caller is assigned to. Audited: inventory_waste.';

revoke all on function public.record_inventory_waste(uuid, jsonb, text, text, uuid) from public, anon;
grant execute on function public.record_inventory_waste(uuid, jsonb, text, text, uuid) to authenticated;


-- Privileged ledger adjustment. The ONLY way to make the theoretical stock
-- agree with a count variance — explicit, reasoned, audited.
create or replace function public.record_inventory_adjustment(
  p_item_id uuid,
  p_direction text,
  p_quantity numeric,
  p_reason text,
  p_count_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_count record;
  v_type text;
  v_id uuid;
  v_before numeric;
begin
  select id, branch_id into v_item from public.inventory_items where id = p_item_id for update;
  if not found then
    raise exception 'inventory item % not found', p_item_id using errcode = '22023';
  end if;
  if not public.current_user_can_inventory('inventory.adjust', v_item.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required for an inventory adjustment' using errcode = '22023';
  end if;

  v_type := case upper(coalesce(p_direction, ''))
    when 'IN' then 'ADJUSTMENT_IN'
    when 'OUT' then 'ADJUSTMENT_OUT'
    else null
  end;
  if v_type is null then
    raise exception 'direction must be IN or OUT' using errcode = '22023';
  end if;

  if p_count_id is not null then
    select branch_id, status into v_count from public.inventory_counts where id = p_count_id;
    if not found or v_count.branch_id <> v_item.branch_id or v_count.status <> 'submitted' then
      raise exception 'the referenced count is not a submitted count of this branch' using errcode = '22023';
    end if;
  end if;

  v_before := public.inventory_stock_quantity(p_item_id);
  v_id := public.inventory_insert_movement(p_item_id, v_type, p_quantity, null, null, p_count_id, null, p_reason, null, null);

  perform public.write_audit_log(
    'inventory_adjustment', 'inventory_movements', v_id::text,
    jsonb_build_object('branch_id', v_item.branch_id, 'inventory_item_id', p_item_id, 'theoretical_quantity', v_before),
    jsonb_build_object('inventory_item_id', p_item_id, 'movement_type', v_type, 'quantity', p_quantity, 'inventory_count_id', p_count_id, 'branch_id', v_item.branch_id, 'theoretical_quantity', public.inventory_stock_quantity(p_item_id)),
    p_reason
  );

  return v_id;
end;
$$;

comment on function public.record_inventory_adjustment(uuid, text, numeric, text, uuid) is
  'Privileged ledger adjustment (ADJUSTMENT_IN/OUT). inventory.adjust + branch scope; reason mandatory. Audited: inventory_adjustment.';

revoke all on function public.record_inventory_adjustment(uuid, text, numeric, text, uuid) from public, anon;
grant execute on function public.record_inventory_adjustment(uuid, text, numeric, text, uuid) to authenticated;


-- Corrects one non-sale movement by appending its opposite. Sale-linked
-- movements are corrected ONLY through the sales report (edit/cancel), so the
-- report and the ledger can never disagree.
create or replace function public.reverse_inventory_movement(
  p_movement_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move record;
  v_id uuid;
  v_before numeric;
begin
  select * into v_move from public.inventory_movements where id = p_movement_id;
  if not found then
    raise exception 'movement % not found', p_movement_id using errcode = '22023';
  end if;
  -- Movement reversal is owner/manager only: inventory.adjust alone (held by
  -- branch_manager, for in-branch stock adjustments) is NOT enough here.
  -- branch_manager can adjust but cannot reverse or void-count's stock effect
  -- away; only owner/manager corrects a wrongly-recorded movement this way.
  if not (
    public.current_user_can_inventory('inventory.adjust', v_move.branch_id)
    and public.current_user_is_owner_or_manager()
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to reverse a movement' using errcode = '22023';
  end if;
  if v_move.movement_type = 'REVERSAL' then
    raise exception 'a reversal cannot itself be reversed' using errcode = '22023';
  end if;
  if v_move.sales_report_id is not null then
    raise exception 'sale-linked movements are corrected by editing or cancelling the sales report' using errcode = '22023';
  end if;

  perform 1 from public.inventory_items where id = v_move.inventory_item_id for update;
  v_before := public.inventory_stock_quantity(v_move.inventory_item_id);
  v_id := public.inventory_insert_movement(
    v_move.inventory_item_id, 'REVERSAL', null, null, null, null, null, p_reason, null, p_movement_id
  );

  perform public.write_audit_log(
    'inventory_movement_reversal', 'inventory_movements', v_id::text,
    jsonb_build_object('branch_id', v_move.branch_id, 'inventory_item_id', v_move.inventory_item_id, 'theoretical_quantity', v_before, 'reversed_movement_id', p_movement_id, 'movement_type', v_move.movement_type, 'quantity', v_move.quantity),
    jsonb_build_object('branch_id', v_move.branch_id, 'inventory_item_id', v_move.inventory_item_id, 'theoretical_quantity', public.inventory_stock_quantity(v_move.inventory_item_id), 'reverses_movement_id', p_movement_id, 'reversal_id', v_id), p_reason
  );

  return v_id;
exception
  when unique_violation then
    raise exception 'this movement has already been reversed' using errcode = '23505';
end;
$$;

comment on function public.reverse_inventory_movement(uuid, text) is
  'Appends a REVERSAL of one non-sale movement (same cost snapshot, opposite delta). inventory.adjust + branch scope; reason mandatory. Audited: inventory_movement_reversal.';

revoke all on function public.reverse_inventory_movement(uuid, text) from public, anon;
grant execute on function public.reverse_inventory_movement(uuid, text) to authenticated;


-- ===========================================================================
-- Physical count (never touches the ledger)
-- ===========================================================================

create or replace function public.submit_inventory_count(
  p_branch_id uuid,
  p_shift_id uuid,
  p_items jsonb,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_item record;
  v_date date;
  v_count_id uuid;
  v_theoretical numeric;
  v_with_variance integer := 0;
  v_lines integer := 0;
begin
  if not public.current_user_can_inventory('inventory.count', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_date := public.inventory_resolve_shift_context(p_shift_id, p_branch_id);

  insert into public.inventory_counts (branch_id, shift_id, business_date, note, counted_by)
  values (p_branch_id, p_shift_id, v_date, nullif(trim(p_note), ''), auth.uid())
  returning id into v_count_id;

  for v_line in select * from public.inventory_parse_lines(p_items, 'physical_quantity')
  loop
    select id, branch_id, is_active, allows_decimal into v_item from public.inventory_items where id = v_line.item_id;
    if not found or v_item.branch_id <> p_branch_id then
      raise exception 'item does not belong to this branch' using errcode = '22023';
    end if;
    if not v_item.is_active then
      raise exception 'cannot count an inactive item' using errcode = '22023';
    end if;
    if v_line.qty is null or v_line.qty < 0 then
      raise exception 'physical quantity cannot be negative' using errcode = '22023';
    end if;
    if v_line.qty <> round(v_line.qty, 3) then
      raise exception 'quantity supports at most 3 decimal places' using errcode = '22023';
    end if;
    if not v_item.allows_decimal and v_line.qty <> trunc(v_line.qty) then
      raise exception 'this item is counted in whole units' using errcode = '22023';
    end if;

    v_theoretical := public.inventory_stock_quantity(v_line.item_id);

    insert into public.inventory_count_items (inventory_count_id, inventory_item_id, physical_quantity, theoretical_quantity)
    values (v_count_id, v_line.item_id, v_line.qty, v_theoretical);

    v_lines := v_lines + 1;
    if v_line.qty <> v_theoretical then
      v_with_variance := v_with_variance + 1;
    end if;
  end loop;

  perform public.write_audit_log(
    'inventory_count_submit', 'inventory_counts', v_count_id::text, null,
    jsonb_build_object('branch_id', p_branch_id, 'shift_id', p_shift_id, 'lines', v_lines, 'lines_with_variance', v_with_variance),
    p_note
  );

  return v_count_id;
end;
$$;

comment on function public.submit_inventory_count(uuid, uuid, jsonb, text) is
  'Submits a physical count. inventory.count + branch scope. Snapshots each item''s theoretical stock server-side; NEVER writes to the ledger (variance is recorded, not "fixed"). Audited: inventory_count_submit.';

revoke all on function public.submit_inventory_count(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.submit_inventory_count(uuid, uuid, jsonb, text) to authenticated;


create or replace function public.void_inventory_count(
  p_count_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count record;
begin
  select id, branch_id, status into v_count from public.inventory_counts where id = p_count_id for update;
  if not found then
    raise exception 'inventory count % not found', p_count_id using errcode = '22023';
  end if;
  if not public.current_user_can_inventory('inventory.adjust', v_count.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to void a count' using errcode = '22023';
  end if;
  if v_count.status <> 'submitted' then
    raise exception 'only a submitted count can be voided' using errcode = '22023';
  end if;

  update public.inventory_counts
    set status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
    where id = p_count_id;

  perform public.write_audit_log(
    'inventory_count_void', 'inventory_counts', p_count_id::text,
    jsonb_build_object('branch_id', v_count.branch_id, 'status', 'submitted'),
    jsonb_build_object('branch_id', v_count.branch_id, 'status', 'voided'), p_reason
  );
end;
$$;

comment on function public.void_inventory_count(uuid, text) is
  'Voids a submitted count (kept for history, excluded from inventory_last_counts). inventory.adjust + branch scope; reason mandatory. Audited: inventory_count_void.';

revoke all on function public.void_inventory_count(uuid, text) from public, anon;
grant execute on function public.void_inventory_count(uuid, text) to authenticated;


-- ===========================================================================
-- Gross profit (cost-gated read)
-- ===========================================================================
-- GROSS PROFIT ONLY: product revenue minus cost of goods sold. It excludes
-- payroll, rent, utilities and every other overhead, so it must never be
-- presented as net profit.
--
-- Returns jsonb { lines: [...], unmapped_category_revenue: number }.
--   sold_quantity   net of reversals (an edited/cancelled report nets out)
--   product_revenue live product-linked sales_report_items.amount
--   cogs            sum(quantity * unit_cost_snapshot) over COSTED quantity
--   costed/uncosted quantity split, so the client can label partial coverage
--   unmapped_category_revenue: revenue on category-level lines in categories
--     that inventory items are tracked under — revenue that is NOT linked to
--     a product, so gross profit for that category is not derivable.
-- Both revenue and quantity are attributed by the sales report's
-- submitted_at, so an edit made later never shifts a sale between periods.
create or replace function public.get_inventory_gross_profit(
  p_branch_id uuid,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_lines jsonb;
  v_unmapped numeric;
begin
  if not public.current_user_can_inventory('inventory.cost.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from then
    raise exception 'a valid period is required' using errcode = '22023';
  end if;

  with sale_moves as (
    select m.inventory_item_id,
           (-m.stock_delta) as qty,
           m.unit_cost_snapshot as snap
    from public.inventory_movements m
    join public.sales_reports r on r.id = m.sales_report_id
    left join public.inventory_movements o on o.id = m.reverses_movement_id
    where m.branch_id = p_branch_id
      and (m.movement_type = 'SALE' or (m.movement_type = 'REVERSAL' and o.movement_type = 'SALE'))
      and r.submitted_at >= p_from and r.submitted_at < p_to
  ),
  cost_agg as (
    select inventory_item_id,
           sum(qty) as sold_qty,
           coalesce(sum(case when snap is not null then qty * snap end), 0) as cogs,
           coalesce(sum(case when snap is not null then qty else 0 end), 0) as costed_qty,
           coalesce(sum(case when snap is null then qty else 0 end), 0) as uncosted_qty
    from sale_moves
    group by inventory_item_id
  ),
  rev_agg as (
    select sri.inventory_item_id, sum(sri.amount) as revenue
    from public.sales_report_items sri
    join public.sales_reports r on r.id = sri.sales_report_id
    where r.branch_id = p_branch_id
      and r.status <> 'cancelled'
      and sri.inventory_item_id is not null
      and r.submitted_at >= p_from and r.submitted_at < p_to
    group by sri.inventory_item_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'inventory_item_id', i.id,
           'code', i.code,
           'name', i.name,
           'unit', i.unit,
           'sold_quantity', coalesce(c.sold_qty, 0),
           'product_revenue', coalesce(rv.revenue, 0),
           'cogs', coalesce(c.cogs, 0),
           'costed_quantity', coalesce(c.costed_qty, 0),
           'uncosted_quantity', coalesce(c.uncosted_qty, 0)
         ) order by i.name), '[]'::jsonb)
  into v_lines
  from public.inventory_items i
  left join cost_agg c on c.inventory_item_id = i.id
  left join rev_agg rv on rv.inventory_item_id = i.id
  where i.branch_id = p_branch_id
    and (c.inventory_item_id is not null or rv.inventory_item_id is not null);

  select coalesce(sum(sri.amount), 0) into v_unmapped
  from public.sales_report_items sri
  join public.sales_reports r on r.id = sri.sales_report_id
  where r.branch_id = p_branch_id
    and r.status <> 'cancelled'
    and sri.inventory_item_id is null
    and r.submitted_at >= p_from and r.submitted_at < p_to
    and sri.category_id in (
      select sales_category_id from public.inventory_items
      where branch_id = p_branch_id and sales_category_id is not null
    );

  return jsonb_build_object('lines', v_lines, 'unmapped_category_revenue', v_unmapped);
end;
$$;

comment on function public.get_inventory_gross_profit(uuid, timestamptz, timestamptz) is
  'Cost-gated (inventory.cost.read + branch scope) gross-profit inputs per item for a period. GROSS profit only — not net. Reports uncosted quantity and unmapped category revenue so callers can label partial/unavailable results instead of fabricating a number.';

revoke all on function public.get_inventory_gross_profit(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.get_inventory_gross_profit(uuid, timestamptz, timestamptz) to authenticated;


-- ===========================================================================
-- Sales report <-> inventory integration
-- ===========================================================================
-- Revenue and quantity are separate facts. A product-linked line
-- ({inventory_item_id, inventory_quantity, amount}) writes a SALE movement in
-- the SAME transaction as the report. Editing a report reverses its previous
-- SALE movements (REVERSAL rows, same cost snapshot) and writes fresh ones;
-- cancelling reverses them. History is never rewritten.

-- Inserts the item rows of a report, enforcing product-line rules. Category-
-- level lines behave exactly as in 011 (revenue only).
create or replace function public.sales_report_write_items(
  p_report_id uuid,
  p_branch_id uuid,
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_inv record;
  v_inv_id uuid;
  v_qty numeric;
  v_amount numeric;
begin
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_amount := coalesce((v_item ->> 'amount')::numeric, 0);
    v_inv_id := nullif(v_item ->> 'inventory_item_id', '')::uuid;

    if v_inv_id is null then
      insert into public.sales_report_items (sales_report_id, category_id, amount, quantity)
      values (
        p_report_id,
        (v_item ->> 'category_id')::uuid,
        v_amount,
        nullif(v_item ->> 'quantity', '')::integer
      );
    else
      select id, branch_id, is_active, allows_decimal, sales_category_id into v_inv
      from public.inventory_items where id = v_inv_id;

      if not found or v_inv.branch_id <> p_branch_id then
        raise exception 'inventory item does not belong to this branch' using errcode = '22023';
      end if;
      if not v_inv.is_active then
        raise exception 'inventory item is inactive' using errcode = '22023';
      end if;
      if v_inv.sales_category_id is null then
        raise exception 'inventory item has no sales category, so it cannot be sold on a report' using errcode = '22023';
      end if;

      v_qty := (v_item ->> 'inventory_quantity')::numeric;
      if v_qty is null or v_qty <= 0 then
        raise exception 'a product line needs a sold quantity greater than zero' using errcode = '22023';
      end if;
      if not v_inv.allows_decimal and v_qty <> trunc(v_qty) then
        raise exception 'this item is sold in whole units' using errcode = '22023';
      end if;

      insert into public.sales_report_items (sales_report_id, category_id, amount, inventory_item_id, inventory_quantity)
      values (p_report_id, v_inv.sales_category_id, v_amount, v_inv_id, v_qty);
    end if;
  end loop;

  -- Within one report a category is either category-level OR product-level,
  -- never both (their revenues would double count under one category).
  if exists (
    select 1
    from public.sales_report_items a
    join public.sales_report_items b
      on b.sales_report_id = a.sales_report_id
     and b.category_id = a.category_id
     and b.inventory_item_id is not null
    where a.sales_report_id = p_report_id and a.inventory_item_id is null
  ) then
    raise exception 'a category cannot have both a category-level line and product lines in one report' using errcode = '22023';
  end if;
end;
$$;

comment on function public.sales_report_write_items(uuid, uuid, jsonb) is
  'INTERNAL. Writes a report''s item rows; validates product-linked lines (same branch, active, has a sales category, quantity > 0, whole units where required) and forbids mixing category-level and product lines in one category.';

revoke all on function public.sales_report_write_items(uuid, uuid, jsonb) from public, anon, authenticated;


create or replace function public.inventory_apply_sales_lines(p_report_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift uuid;
  v_line record;
  v_count integer := 0;
begin
  select shift_id into v_shift from public.sales_reports where id = p_report_id;

  for v_line in
    select inventory_item_id, inventory_quantity
    from public.sales_report_items
    where sales_report_id = p_report_id and inventory_item_id is not null
  loop
    perform public.inventory_insert_movement(
      v_line.inventory_item_id, 'SALE', v_line.inventory_quantity, v_shift, p_report_id, null, null, null, null, null
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.inventory_apply_sales_lines(uuid) is
  'INTERNAL. Writes one SALE movement per product-linked line of a report, snapshotting the effective cost.';

revoke all on function public.inventory_apply_sales_lines(uuid) from public, anon, authenticated;


create or replace function public.inventory_reverse_sales_lines(p_report_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_move record;
  v_count integer := 0;
begin
  for v_move in
    select m.id, m.inventory_item_id
    from public.inventory_movements m
    where m.sales_report_id = p_report_id
      and m.movement_type = 'SALE'
      and not exists (select 1 from public.inventory_movements r where r.reverses_movement_id = m.id)
  loop
    perform public.inventory_insert_movement(
      v_move.inventory_item_id, 'REVERSAL', null, null, null, null, null, p_reason, null, v_move.id
    );
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

comment on function public.inventory_reverse_sales_lines(uuid, text) is
  'INTERNAL. Appends a REVERSAL for every not-yet-reversed SALE movement of a report (edit/cancel path).';

revoke all on function public.inventory_reverse_sales_lines(uuid, text) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- create_sales_report — replaces 011's version (same signature/grants).
-- Behaviour is identical for category-level reports; product-linked lines are
-- additionally validated, stored, and turned into SALE movements atomically.
-- ---------------------------------------------------------------------------
create or replace function public.create_sales_report(
  p_shift_id uuid,
  p_register_id uuid,
  p_report_type text,
  p_gross_revenue numeric,
  p_transaction_count integer,
  p_average_basket numeric,
  p_notes text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift record;
  v_branch_id uuid;
  v_is_assigned boolean;
  v_is_privileged boolean;
  v_cutoff_instant timestamptz;
  v_report_id uuid;
  v_items_total numeric;
  v_reconciliation_status text;
begin
  if p_report_type not in ('X', 'Z') then
    raise exception 'invalid report_type %', p_report_type using errcode = '22023';
  end if;

  select s.*, sd.cutoff_hour, sd.cutoff_minute, sd.cutoff_day_offset
    into v_shift
  from public.shifts s
  join public.shift_definitions sd on sd.id = s.shift_definition_id
  where s.id = p_shift_id;

  if not found then
    raise exception 'shift % not found', p_shift_id using errcode = '22023';
  end if;
  if v_shift.status = 'cancelled' then
    raise exception 'cannot submit a report for a cancelled shift' using errcode = '22023';
  end if;

  v_branch_id := v_shift.branch_id;

  select exists (
    select 1 from public.shift_assignments where shift_id = p_shift_id and user_id = auth.uid()
  ) into v_is_assigned;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_branch_id in (select public.current_user_branch_ids()));

  if not (v_is_assigned or v_is_privileged) then
    raise exception 'not authorized: not assigned to this shift' using errcode = '42501';
  end if;

  v_cutoff_instant := ((v_shift.business_date + v_shift.cutoff_day_offset)::timestamp
    + make_interval(hours => v_shift.cutoff_hour, mins => v_shift.cutoff_minute))
    at time zone 'Europe/Istanbul';

  if now() > v_cutoff_instant and not v_is_privileged then
    raise exception 'submission window has closed for this shift' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.sales_reports
    where shift_id = p_shift_id
      and report_type = p_report_type
      and status <> 'cancelled'
      and (
        (p_register_id is null and register_id is null)
        or (p_register_id is not null and register_id = p_register_id)
      )
  ) then
    raise exception 'a % report already exists for this shift/register', p_report_type using errcode = '23505';
  end if;

  select coalesce(sum(coalesce((e ->> 'amount')::numeric, 0)), 0) into v_items_total
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

  v_reconciliation_status := public.compute_reconciliation_status(p_gross_revenue, v_items_total, v_branch_id);

  insert into public.sales_reports (
    branch_id, shift_id, register_id, submitted_by, report_type,
    gross_revenue, transaction_count, average_basket, notes, reconciliation_status
  )
  values (
    v_branch_id, p_shift_id, p_register_id, auth.uid(), p_report_type,
    p_gross_revenue, p_transaction_count, p_average_basket, p_notes, v_reconciliation_status
  )
  returning id into v_report_id;

  perform public.sales_report_write_items(v_report_id, v_branch_id, p_items);
  perform public.inventory_apply_sales_lines(v_report_id);

  perform public.write_audit_log(
    'report_edit', 'sales_reports', v_report_id::text,
    null,
    jsonb_build_object('report_type', p_report_type, 'gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    'created'
  );

  return v_report_id;
end;
$$;

comment on function public.create_sales_report(uuid, uuid, text, numeric, integer, numeric, text, jsonb) is
  'The only path to submit a sales report. Shift ownership, allowed/active shift, server-side timing (privileged roles may bypass), duplicate prevention, server-computed reconciliation_status. Product-linked items (inventory_item_id + inventory_quantity) also write SALE stock movements in the same transaction. Audited (report_edit, reason "created").';


create or replace function public.edit_sales_report(
  p_report_id uuid,
  p_gross_revenue numeric,
  p_transaction_count integer,
  p_average_basket numeric,
  p_notes text,
  p_items jsonb,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_is_privileged boolean;
  v_items_total numeric;
  v_reconciliation_status text;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to edit a sales report' using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;
  if v_report.status = 'cancelled' then
    raise exception 'cannot edit a cancelled report' using errcode = '22023';
  end if;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()));

  if not (
    v_is_privileged
    or (v_report.submitted_by = auth.uid() and public.current_user_has_permission('sales.edit_own'))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select coalesce(sum(coalesce((e ->> 'amount')::numeric, 0)), 0) into v_items_total
  from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e;

  v_reconciliation_status := public.compute_reconciliation_status(p_gross_revenue, v_items_total, v_report.branch_id);

  update public.sales_reports
    set gross_revenue = p_gross_revenue,
        transaction_count = p_transaction_count,
        average_basket = p_average_basket,
        notes = p_notes,
        reconciliation_status = v_reconciliation_status,
        status = 'edited',
        edited_at = now()
    where id = p_report_id;

  -- Previous stock effect is REVERSED (history kept), then the edited lines
  -- are written and applied afresh with the cost that applies now.
  perform public.inventory_reverse_sales_lines(p_report_id, p_reason);

  delete from public.sales_report_items where sales_report_id = p_report_id;
  perform public.sales_report_write_items(p_report_id, v_report.branch_id, p_items);
  perform public.inventory_apply_sales_lines(p_report_id);

  perform public.write_audit_log(
    'report_edit', 'sales_reports', p_report_id::text,
    jsonb_build_object('gross_revenue', v_report.gross_revenue, 'reconciliation_status', v_report.reconciliation_status),
    jsonb_build_object('gross_revenue', p_gross_revenue, 'reconciliation_status', v_reconciliation_status),
    p_reason
  );
end;
$$;

comment on function public.edit_sales_report(uuid, numeric, integer, numeric, text, jsonb, text) is
  'Edits a sales report (reason mandatory). sales.edit_own + ownership, or sales.edit_all. Recomputes reconciliation_status; previous SALE movements are reversed (never rewritten) and the edited product lines are applied afresh. Audited (report_edit).';


create or replace function public.cancel_sales_report(p_report_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
  v_is_privileged boolean;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to cancel a sales report' using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;

  v_is_privileged :=
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()));

  if not (
    v_is_privileged
    or (v_report.submitted_by = auth.uid() and public.current_user_has_permission('sales.edit_own'))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.sales_reports set status = 'cancelled' where id = p_report_id;

  perform public.inventory_reverse_sales_lines(p_report_id, p_reason);

  perform public.write_audit_log(
    'report_delete', 'sales_reports', p_report_id::text,
    jsonb_build_object('status', v_report.status), jsonb_build_object('status', 'cancelled'), p_reason
  );
end;
$$;

comment on function public.cancel_sales_report(uuid, text) is
  'Cancels a sales report (status lifecycle, never a raw DELETE). Its SALE movements are reversed, not deleted. Audited (report_delete).';

-- Internal audit writer: only trusted SECURITY DEFINER RPCs may append audit rows.
revoke all on function public.write_audit_log(text, text, text, jsonb, jsonb, text) from public, anon, authenticated;
