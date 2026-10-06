-- =============================================================================
-- Phase 1C (2/2): procurement RPCs - suppliers, supply params, order lifecycle, receiving, suggestions, calendar
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production.
-- Every function is SECURITY DEFINER with search_path = public, revoked from PUBLIC/anon and granted explicitly.
-- Every material action writes write_audit_log (actor = auth.uid(), entity, branch, from/to state, reason).
-- Deterministic math only: no AI/ML, no sales/weather input (extension points are documented in PROCUREMENT_MODEL.md).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- small parsing helpers (internal)
-- ---------------------------------------------------------------------------
create or replace function public.procurement_json_num(p jsonb, p_key text)
returns numeric
language sql
immutable
as $$ select nullif(trim(p ->> p_key), '')::numeric $$;

create or replace function public.procurement_json_weekdays(p jsonb, p_key text)
returns smallint[]
language sql
immutable
as $$
  select case when p -> p_key is null or jsonb_typeof(p -> p_key) <> 'array' or jsonb_array_length(p -> p_key) = 0 then null
              else (select array_agg(distinct v::smallint order by v::smallint) from jsonb_array_elements_text(p -> p_key) v) end
$$;
revoke all on function public.procurement_json_num(jsonb, text) from public, anon;
revoke all on function public.procurement_json_weekdays(jsonb, text) from public, anon;
grant execute on function public.procurement_json_num(jsonb, text) to authenticated, service_role;
grant execute on function public.procurement_json_weekdays(jsonb, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
create or replace function public.upsert_supplier(
  p_id uuid, p_code text, p_name text, p_type text, p_contact text, p_phone text, p_email text, p_notes text, p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_id uuid;
  v_code text := upper(trim(coalesce(p_code, '')));
begin
  if not public.current_user_has_permission('procurement.supplier.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_type not in ('COMPANY', 'CENTRAL_WAREHOUSE') then
    raise exception 'supplier type must be COMPANY or CENTRAL_WAREHOUSE' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.suppliers (code, name, supplier_type, contact_name, phone, email, notes, created_by, updated_by)
    values (v_code, trim(p_name), p_type, nullif(trim(p_contact), ''), nullif(trim(p_phone), ''), nullif(trim(p_email), ''), nullif(trim(p_notes), ''), auth.uid(), auth.uid())
    returning id into v_id;
    perform public.write_audit_log('supplier_create', 'suppliers', v_id::text, null,
      jsonb_build_object('code', v_code, 'name', trim(p_name), 'supplier_type', p_type), trim(p_reason));
  else
    select * into v_old from public.suppliers where id = p_id for update;
    if not found then raise exception 'supplier not found' using errcode = '22023'; end if;
    update public.suppliers
       set name = trim(p_name), supplier_type = p_type, contact_name = nullif(trim(p_contact), ''), phone = nullif(trim(p_phone), ''),
           email = nullif(trim(p_email), ''), notes = nullif(trim(p_notes), ''), updated_by = auth.uid()
     where id = p_id;
    v_id := p_id;
    perform public.write_audit_log('supplier_update', 'suppliers', v_id::text,
      jsonb_build_object('name', v_old.name, 'supplier_type', v_old.supplier_type),
      jsonb_build_object('name', trim(p_name), 'supplier_type', p_type), trim(p_reason));
  end if;
  return v_id;
end;
$$;
comment on function public.upsert_supplier(uuid, text, text, text, text, text, text, text, text) is
  'Creates (p_id null) or edits a supplier. procurement.supplier.manage; code immutable (ignored on update); mandatory reason; audited. Nothing is seeded.';

create or replace function public.set_supplier_active(p_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
begin
  if not public.current_user_has_permission('procurement.supplier.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  select * into v_old from public.suppliers where id = p_id for update;
  if not found then raise exception 'supplier not found' using errcode = '22023'; end if;
  update public.suppliers set is_active = p_active, updated_by = auth.uid() where id = p_id;
  perform public.write_audit_log(case when p_active then 'supplier_reactivate' else 'supplier_deactivate' end, 'suppliers', p_id::text,
    jsonb_build_object('is_active', v_old.is_active), jsonb_build_object('is_active', p_active), trim(p_reason));
end;
$$;

-- ---------------------------------------------------------------------------
-- Item supply parameters (full replace of the optional business inputs; missing key = NULL = not configured)
-- ---------------------------------------------------------------------------
create or replace function public.upsert_item_supply_params(p_branch_id uuid, p_item_id uuid, p_supplier_id uuid, p_params jsonb, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_supplier record;
  v_old record;
  v_id uuid;
  v_cutoff time := nullif(trim(coalesce(p_params ->> 'order_cutoff_time', '')), '')::time;
  v_active boolean := coalesce((p_params ->> 'is_active')::boolean, true);
begin
  if not public.current_user_can_inventory('procurement.supply.manage', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  select id, branch_id into v_item from public.inventory_items where id = p_item_id;
  if not found or v_item.branch_id <> p_branch_id then
    raise exception 'item does not belong to this branch' using errcode = '22023';
  end if;
  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found then raise exception 'supplier not found' using errcode = '22023'; end if;
  select * into v_old from public.item_supply_params where branch_id = p_branch_id and item_id = p_item_id for update;
  if not v_supplier.is_active and (not found or v_old.supplier_id is distinct from p_supplier_id) then
    raise exception 'an inactive supplier cannot be assigned' using errcode = '22023';
  end if;

  insert into public.item_supply_params (
    branch_id, item_id, supplier_id, order_unit, units_per_pack, minimum_stock, target_stock, safety_stock, lead_time_days,
    allowed_order_weekdays, order_cutoff_time, delivery_weekdays, minimum_order_quantity, order_multiple, is_active, notes, created_by, updated_by)
  values (
    p_branch_id, p_item_id, p_supplier_id, nullif(trim(p_params ->> 'order_unit'), ''),
    public.procurement_json_num(p_params, 'units_per_pack'), public.procurement_json_num(p_params, 'minimum_stock'),
    public.procurement_json_num(p_params, 'target_stock'), public.procurement_json_num(p_params, 'safety_stock'),
    public.procurement_json_num(p_params, 'lead_time_days')::integer, public.procurement_json_weekdays(p_params, 'allowed_order_weekdays'),
    v_cutoff, public.procurement_json_weekdays(p_params, 'delivery_weekdays'),
    public.procurement_json_num(p_params, 'minimum_order_quantity'), public.procurement_json_num(p_params, 'order_multiple'),
    v_active, nullif(trim(p_params ->> 'notes'), ''), auth.uid(), auth.uid())
  on conflict (branch_id, item_id) do update set
    supplier_id = excluded.supplier_id, order_unit = excluded.order_unit, units_per_pack = excluded.units_per_pack,
    minimum_stock = excluded.minimum_stock, target_stock = excluded.target_stock, safety_stock = excluded.safety_stock,
    lead_time_days = excluded.lead_time_days, allowed_order_weekdays = excluded.allowed_order_weekdays,
    order_cutoff_time = excluded.order_cutoff_time, delivery_weekdays = excluded.delivery_weekdays,
    minimum_order_quantity = excluded.minimum_order_quantity, order_multiple = excluded.order_multiple,
    is_active = excluded.is_active, notes = excluded.notes, updated_by = excluded.updated_by
  returning id into v_id;

  perform public.write_audit_log(case when v_old.id is null then 'supply_params_create' else 'supply_params_update' end,
    'item_supply_params', v_id::text,
    case when v_old.id is null then null else jsonb_build_object('supplier_id', v_old.supplier_id, 'minimum_stock', v_old.minimum_stock, 'target_stock', v_old.target_stock) end,
    jsonb_build_object('branch_id', p_branch_id, 'item_id', p_item_id, 'supplier_id', p_supplier_id,
      'minimum_stock', public.procurement_json_num(p_params, 'minimum_stock'), 'target_stock', public.procurement_json_num(p_params, 'target_stock')),
    trim(p_reason));
  return v_id;
end;
$$;
comment on function public.upsert_item_supply_params(uuid, uuid, uuid, jsonb, text) is
  'Sets the supplier and ordering rules of a branch item (keys of p_params: order_unit, units_per_pack, minimum_stock, target_stock, safety_stock, lead_time_days, allowed_order_weekdays, order_cutoff_time, delivery_weekdays, minimum_order_quantity, order_multiple, is_active, notes). procurement.supply.manage + branch scope; validated by table constraints; inactive suppliers cannot be newly assigned; audited.';

-- ---------------------------------------------------------------------------
-- Draft orders
-- ---------------------------------------------------------------------------
create or replace function public.procurement_write_lines(p_order_id uuid, p_branch_id uuid, p_supplier_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_el jsonb;
  v_item record;
  v_params record;
  v_qty numeric;
  v_base numeric;
  v_unit text;
  v_pack numeric;
  v_est numeric;
  v_n integer := 0;
  v_seen uuid[] := '{}';
  v_can_cost boolean := public.current_user_can_inventory('inventory.cost.manage', p_branch_id);
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'lines must be a json array' using errcode = '22023';
  end if;
  delete from public.purchase_order_lines where purchase_order_id = p_order_id;
  for v_el in select * from jsonb_array_elements(p_lines)
  loop
    select id, branch_id, is_active, allows_decimal into v_item from public.inventory_items where id = (v_el ->> 'inventory_item_id')::uuid;
    if not found or v_item.branch_id <> p_branch_id then
      raise exception 'item does not belong to this branch' using errcode = '22023';
    end if;
    if not v_item.is_active then raise exception 'inventory item is inactive' using errcode = '22023'; end if;
    if v_item.id = any(v_seen) then raise exception 'an item can appear only once per order' using errcode = '22023'; end if;
    v_seen := v_seen || v_item.id;
    -- the quantity is in the ORDER unit (the base unit when the item has no pack conversion)
    v_qty := (v_el ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 3) then
      raise exception 'quantity must be greater than zero (at most 3 decimals)' using errcode = '22023';
    end if;
    v_unit := null;
    v_pack := null;
    select * into v_params from public.item_supply_params
     where branch_id = p_branch_id and item_id = v_item.id and supplier_id = p_supplier_id and is_active;
    if found then
      if (v_params.order_unit is null) <> (v_params.units_per_pack is null) then
        raise exception 'the pack conversion of this item is incomplete: order unit and units per pack must be set together' using errcode = '22023';
      end if;
      v_unit := v_params.order_unit;
      v_pack := v_params.units_per_pack;
      if v_params.minimum_order_quantity is not null and v_qty < v_params.minimum_order_quantity then
        raise exception 'quantity is below the minimum order quantity' using errcode = '22023';
      end if;
      if v_params.order_multiple is not null and mod(v_qty, v_params.order_multiple) <> 0 then
        raise exception 'quantity is not a multiple of the order multiple' using errcode = '22023';
      end if;
    end if;
    v_base := v_qty * coalesce(v_pack, 1);
    if v_base <> round(v_base, 3) then
      raise exception 'the quantity converts to more than 3 decimals of the stock unit' using errcode = '22023';
    end if;
    if not v_item.allows_decimal and v_base <> trunc(v_base) then
      raise exception 'this item is stocked in whole units; the order quantity converts to a fraction' using errcode = '22023';
    end if;
    v_est := nullif(trim(v_el ->> 'unit_cost_estimate_kurus'), '')::numeric;
    if v_est is not null and not v_can_cost then
      raise exception 'not authorized to set a cost estimate' using errcode = '42501';
    end if;
    insert into public.purchase_order_lines (purchase_order_id, inventory_item_id, ordered_quantity, order_unit, units_per_pack_snapshot, unit_cost_estimate_kurus, notes)
    values (p_order_id, v_item.id, v_qty, v_unit, v_pack, v_est::bigint, nullif(trim(v_el ->> 'notes'), ''));
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.procurement_write_lines(uuid, uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.procurement_write_lines(uuid, uuid, uuid, jsonb) to service_role;

create or replace function public.create_purchase_order(
  p_branch_id uuid, p_supplier_id uuid, p_ordered_for date, p_expected_delivery date, p_notes text, p_lines jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_supplier record;
  v_id uuid;
  v_n integer;
begin
  if not public.current_user_can_inventory('procurement.order.create', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select * into v_supplier from public.suppliers where id = p_supplier_id;
  if not found or not v_supplier.is_active then
    raise exception 'an active supplier is required' using errcode = '22023';
  end if;
  insert into public.purchase_orders (branch_id, supplier_id, ordered_for_date, expected_delivery_date, notes, created_by)
  values (p_branch_id, p_supplier_id, p_ordered_for, p_expected_delivery, nullif(trim(p_notes), ''), auth.uid())
  returning id into v_id;
  v_n := public.procurement_write_lines(v_id, p_branch_id, p_supplier_id, coalesce(p_lines, '[]'::jsonb));
  insert into public.purchase_order_status_history (purchase_order_id, from_status, to_status, changed_by, reason)
  values (v_id, null, 'DRAFT', auth.uid(), 'created');
  perform public.write_audit_log('purchase_order_create', 'purchase_orders', v_id::text, null,
    jsonb_build_object('branch_id', p_branch_id, 'supplier_id', p_supplier_id, 'lines', v_n), null);
  return v_id;
end;
$$;
comment on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb) is
  'Creates a DRAFT purchase order with lines [{inventory_item_id, quantity, unit_cost_estimate_kurus?, notes?}] in item stock units. procurement.order.create + branch scope; active supplier; minimum order quantity / multiple enforced where configured; audited.';

create or replace function public.replace_purchase_order_lines(p_order_id uuid, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_n integer;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or not public.current_user_can_inventory('procurement.order.create', v_order.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status <> 'DRAFT' then
    raise exception 'only a DRAFT order can be edited' using errcode = '22023';
  end if;
  v_n := public.procurement_write_lines(p_order_id, v_order.branch_id, v_order.supplier_id, p_lines);
  perform public.write_audit_log('purchase_order_lines_replace', 'purchase_orders', p_order_id::text, null,
    jsonb_build_object('branch_id', v_order.branch_id, 'lines', v_n), null);
  return v_n;
end;
$$;

create or replace function public.update_purchase_order_header(p_order_id uuid, p_ordered_for date, p_expected_delivery date, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or not public.current_user_can_inventory('procurement.order.create', v_order.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status <> 'DRAFT' then
    raise exception 'only a DRAFT order can be edited' using errcode = '22023';
  end if;
  update public.purchase_orders set ordered_for_date = p_ordered_for, expected_delivery_date = p_expected_delivery, notes = nullif(trim(p_notes), '')
   where id = p_order_id;
  perform public.write_audit_log('purchase_order_header_update', 'purchase_orders', p_order_id::text, null,
    jsonb_build_object('branch_id', v_order.branch_id, 'ordered_for_date', p_ordered_for, 'expected_delivery_date', p_expected_delivery), null);
end;
$$;

-- ---------------------------------------------------------------------------
-- Status transitions (everything except receiving)
-- ---------------------------------------------------------------------------
create or replace function public.transition_purchase_order(p_order_id uuid, p_to text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_perm text;
  v_needs_reason boolean;
begin
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_to not in ('DRAFT', 'SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'CANCELLED', 'RECEIVED') then
    raise exception 'this status cannot be set directly (receiving goes through receive_purchase_order)' using errcode = '22023';
  end if;
  if p_to = 'RECEIVED' and v_order.status <> 'PARTIALLY_RECEIVED' then
    raise exception 'an order is closed short only from PARTIALLY_RECEIVED; otherwise receive it' using errcode = '22023';
  end if;
  if not public.procurement_transition_allowed(v_order.status, p_to) then
    raise exception 'transition % -> % is not allowed', v_order.status, p_to using errcode = '22023';
  end if;
  v_perm := case
    when p_to = 'SUBMITTED' then 'procurement.order.create'
    when p_to = 'CANCELLED' and v_order.status = 'DRAFT' then 'procurement.order.create'
    when p_to = 'APPROVED' then 'procurement.order.approve'
    else 'procurement.order.manage' end;
  if not public.current_user_can_inventory(v_perm, v_order.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_needs_reason := p_to in ('CANCELLED', 'DRAFT', 'RECEIVED');
  if v_needs_reason and (p_reason is null or length(trim(p_reason)) < 5) then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_to = 'SUBMITTED' and not exists (select 1 from public.purchase_order_lines where purchase_order_id = p_order_id) then
    raise exception 'an order needs at least one line before it is submitted' using errcode = '22023';
  end if;
  if p_to = 'CANCELLED' and exists (select 1 from public.purchase_order_lines where purchase_order_id = p_order_id and received_quantity > 0) then
    raise exception 'an order with received quantity cannot be cancelled' using errcode = '22023';
  end if;

  update public.purchase_orders set
    status = p_to,
    submitted_at = case when p_to = 'SUBMITTED' then now() else submitted_at end,
    approved_at = case when p_to = 'APPROVED' then now() else approved_at end,
    approved_by = case when p_to = 'APPROVED' then auth.uid() else approved_by end,
    cancelled_at = case when p_to = 'CANCELLED' then now() else cancelled_at end,
    received_at = case when p_to = 'RECEIVED' then now() else received_at end
  where id = p_order_id;
  insert into public.purchase_order_status_history (purchase_order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, p_to, auth.uid(), nullif(trim(p_reason), ''));
  perform public.write_audit_log('purchase_order_' || lower(case when p_to = 'RECEIVED' then 'closed_short' else p_to end), 'purchase_orders', p_order_id::text,
    jsonb_build_object('status', v_order.status), jsonb_build_object('status', p_to, 'branch_id', v_order.branch_id, 'order_number', v_order.order_number),
    nullif(trim(p_reason), ''));
end;
$$;
comment on function public.transition_purchase_order(uuid, text, text) is
  'Explicit state machine: DRAFT->SUBMITTED (create), SUBMITTED->APPROVED (approve), APPROVED->PREPARING/IN_TRANSIT, any open->CANCELLED, SUBMITTED->DRAFT, PARTIALLY_RECEIVED->RECEIVED (close short) need manage + a reason where destructive. RECEIVED/CANCELLED are final. Always audited and written to purchase_order_status_history.';

-- ---------------------------------------------------------------------------
-- Receiving: creates RECEIPT movements through the EXISTING ledger writer
-- ---------------------------------------------------------------------------
create or replace function public.receive_purchase_order(p_order_id uuid, p_lines jsonb, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_el jsonb;
  v_line record;
  v_item record;
  v_qty numeric;
  v_base numeric;
  v_cost numeric;
  v_current numeric;
  v_move uuid;
  v_seen uuid[] := '{}';
  v_movements jsonb := '[]'::jsonb;
  v_new_status text;
  v_open integer;
  v_has_cost boolean;
begin
  -- 1. serialise every receiver of this order on the header row, then re-read everything under that lock
  select * into v_order from public.purchase_orders where id = p_order_id for update;
  if not found or not public.current_user_can_inventory('procurement.order.receive', v_order.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status not in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED') then
    raise exception 'order status % cannot be received', v_order.status using errcode = '22023';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'at least one line is required' using errcode = '22023';
  end if;
  select coalesce(bool_or(nullif(trim(e ->> 'unit_cost'), '') is not null), false) into v_has_cost from jsonb_array_elements(p_lines) e;
  if v_has_cost and not public.current_user_can_inventory('inventory.cost.manage', v_order.branch_id) then
    raise exception 'not authorized to set unit cost' using errcode = '42501';
  end if;
  -- only this function may change received_quantity (checked by the line guard trigger; transaction-local flag)
  perform set_config('procurement.receiving', 'on', true);

  -- 2. everything below is one transaction: any failing line rolls back movements, receipt links and received_quantity together
  for v_el in select * from jsonb_array_elements(p_lines)
  loop
    select * into v_line from public.purchase_order_lines
     where id = (v_el ->> 'line_id')::uuid and purchase_order_id = p_order_id for update;
    if not found then raise exception 'line does not belong to this order' using errcode = '22023'; end if;
    if v_line.id = any(v_seen) then raise exception 'a line can appear only once per receipt' using errcode = '22023'; end if;
    v_seen := v_seen || v_line.id;
    -- the receive quantity is in the ORDER unit of the line
    v_qty := (v_el ->> 'quantity')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty <> round(v_qty, 3) then
      raise exception 'quantity must be greater than zero (at most 3 decimals)' using errcode = '22023';
    end if;
    if v_qty > v_line.ordered_quantity - v_line.received_quantity then
      raise exception 'quantity exceeds what is still open on the line' using errcode = '22023';
    end if;
    if (v_line.order_unit is null) <> (v_line.units_per_pack_snapshot is null) then
      raise exception 'the pack conversion of this line is unknown; receipt refused' using errcode = '22023';
    end if;
    -- deterministic, snapshot-based conversion to the canonical BASE unit
    v_base := v_qty * coalesce(v_line.units_per_pack_snapshot, 1);
    if v_base <> round(v_base, 3) then
      raise exception 'the quantity converts to more than 3 decimals of the stock unit' using errcode = '22023';
    end if;
    select id, is_active, allows_decimal into v_item from public.inventory_items where id = v_line.inventory_item_id;
    if not v_item.is_active then
      raise exception 'the item is inactive: reactivate it to receive, or close/cancel the order' using errcode = '22023';
    end if;
    if not v_item.allows_decimal and v_base <> trunc(v_base) then
      raise exception 'this item is stocked in whole units; the received quantity converts to a fraction' using errcode = '22023';
    end if;
    v_cost := nullif(trim(v_el ->> 'unit_cost'), '')::numeric;   -- per BASE unit, like record_inventory_receipt
    if v_cost is not null then
      v_current := public.inventory_effective_cost(v_line.inventory_item_id, now());
      if v_current is distinct from v_cost then
        perform public.inventory_set_cost_internal(v_line.inventory_item_id, v_cost, now(), v_order.order_number);
      end if;
    end if;
    -- the EXISTING ledger writer: a plain RECEIPT movement in BASE units, referenced by the order number
    v_move := public.inventory_insert_movement(v_line.inventory_item_id, 'RECEIPT', v_base, null, null, null, null, p_note, v_order.order_number, null);
    insert into public.purchase_order_receipts (purchase_order_id, purchase_order_line_id, inventory_movement_id, quantity, base_quantity, received_by, note)
    values (p_order_id, v_line.id, v_move, v_qty, v_base, auth.uid(), nullif(trim(p_note), ''));
    update public.purchase_order_lines set received_quantity = received_quantity + v_qty where id = v_line.id;
    v_movements := v_movements || jsonb_build_object('line_id', v_line.id, 'movement_id', v_move, 'quantity', v_qty, 'base_quantity', v_base);
  end loop;

  select count(*) into v_open from public.purchase_order_lines where purchase_order_id = p_order_id and received_quantity < ordered_quantity;
  v_new_status := case when v_open = 0 then 'RECEIVED' else 'PARTIALLY_RECEIVED' end;
  update public.purchase_orders set status = v_new_status, received_at = case when v_new_status = 'RECEIVED' then now() else received_at end
   where id = p_order_id;
  insert into public.purchase_order_status_history (purchase_order_id, from_status, to_status, changed_by, reason)
  values (p_order_id, v_order.status, v_new_status, auth.uid(), coalesce(nullif(trim(p_note), ''), 'received'));
  perform public.write_audit_log('purchase_order_receive', 'purchase_orders', p_order_id::text,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', v_new_status, 'branch_id', v_order.branch_id, 'order_number', v_order.order_number, 'movements', v_movements, 'cost_supplied', v_has_cost),
    nullif(trim(p_note), ''));
  perform set_config('procurement.receiving', 'off', true);
  return jsonb_build_object('status', v_new_status, 'movements', v_movements);
end;
$$;
comment on function public.receive_purchase_order(uuid, jsonb, text) is
  'Receives [{line_id, quantity (ORDER unit), unit_cost? (per BASE unit)}] into stock: the order header row is locked first (concurrent receivers serialise and re-read the open quantity), each quantity is converted with the line pack snapshot to BASE units and written through the existing ledger writer as a RECEIPT, linked in purchase_order_receipts, and received_quantity grows (never above ordered, so a quantity cannot be received twice). One transaction: a failing line rolls everything back. Partial receipts move the order to PARTIALLY_RECEIVED, the last open quantity to RECEIVED. procurement.order.receive + branch scope; unit_cost additionally needs inventory.cost.manage (same rule as record_inventory_receipt).';

-- ---------------------------------------------------------------------------
-- Reads
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- Fulfillment reconciliation: received_quantity vs receipt links vs the ledger (internal)
-- ---------------------------------------------------------------------------
create or replace function public.procurement_order_reconciliation(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with l as (
    select pl.id,
           pl.received_quantity * coalesce(pl.units_per_pack_snapshot, 1) as received_base,
           coalesce((select sum(r.base_quantity) from public.purchase_order_receipts r where r.purchase_order_line_id = pl.id), 0) as link_base,
           coalesce((select sum(r.base_quantity) from public.purchase_order_receipts r
                      where r.purchase_order_line_id = pl.id
                        and exists (select 1 from public.inventory_movements m where m.reverses_movement_id = r.inventory_movement_id)), 0) as reversed_base
    from public.purchase_order_lines pl where pl.purchase_order_id = p_order_id
  )
  select jsonb_build_object(
    'state', case when exists (select 1 from l where reversed_base > 0 or link_base <> received_base) then 'warning' else 'ok' end,
    'reasons', coalesce((select jsonb_agg(distinct z.reason) from (
                  select 'receipt_reversed' as reason from l where reversed_base > 0
                  union all select 'link_mismatch' from l where link_base <> received_base) z), '[]'::jsonb),
    'reversedBaseQuantity', coalesce((select sum(reversed_base) from l), 0),
    'netReceivedBaseQuantity', coalesce((select sum(link_base - reversed_base) from l), 0));
$$;
comment on function public.procurement_order_reconciliation(uuid) is
  'INTERNAL. Reconciles purchase_order_lines.received_quantity (x pack snapshot) with purchase_order_receipts and with later REVERSAL movements of the linked RECEIPTs. A reversed receipt does NOT silently reopen the order: it is reported as state warning / reason receipt_reversed (received_quantity stays what was recorded).';
revoke all on function public.procurement_order_reconciliation(uuid) from public, anon, authenticated;
grant execute on function public.procurement_order_reconciliation(uuid) to service_role;

create or replace function public.get_purchase_order(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_order record;
  v_cost boolean;
begin
  select po.*, s.code as supplier_code, s.name as supplier_name, s.supplier_type, b.name as branch_name
    into v_order
  from public.purchase_orders po
  join public.suppliers s on s.id = po.supplier_id
  join public.branches b on b.id = po.branch_id
  where po.id = p_order_id;
  if not found or not public.current_user_can_inventory('procurement.order.read', v_order.branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  v_cost := public.current_user_can_inventory('inventory.cost.read', v_order.branch_id);
  return jsonb_build_object(
    'id', v_order.id, 'orderNumber', v_order.order_number, 'branchId', v_order.branch_id, 'branchName', v_order.branch_name,
    'status', v_order.status, 'orderedForDate', v_order.ordered_for_date, 'expectedDeliveryDate', v_order.expected_delivery_date,
    'submittedAt', v_order.submitted_at, 'approvedAt', v_order.approved_at, 'receivedAt', v_order.received_at, 'cancelledAt', v_order.cancelled_at,
    'createdAt', v_order.created_at, 'notes', v_order.notes,
    'supplier', jsonb_build_object('id', v_order.supplier_id, 'code', v_order.supplier_code, 'name', v_order.supplier_name, 'type', v_order.supplier_type),
    'reconciliation', public.procurement_order_reconciliation(p_order_id),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'id', l.id, 'inventoryItemId', l.inventory_item_id, 'code', i.code, 'name', i.name, 'unit', i.unit,
        -- ORDER unit (orderUnit; the base unit when orderUnit is null)
        'orderedQuantity', l.ordered_quantity, 'receivedQuantity', l.received_quantity, 'openQuantity', l.ordered_quantity - l.received_quantity,
        -- BASE (stock) unit = what the ledger sees
        'orderedBaseQuantity', l.ordered_quantity * coalesce(l.units_per_pack_snapshot, 1),
        'receivedBaseQuantity', l.received_quantity * coalesce(l.units_per_pack_snapshot, 1),
        'openBaseQuantity', (l.ordered_quantity - l.received_quantity) * coalesce(l.units_per_pack_snapshot, 1),
        'orderUnit', l.order_unit, 'unitsPerPack', l.units_per_pack_snapshot, 'notes', l.notes,
        'unitCostEstimate', case when not v_cost then jsonb_build_object('state', 'unavailable', 'reason', 'no_permission')
                                 when l.unit_cost_estimate_kurus is null then jsonb_build_object('state', 'unavailable', 'reason', 'missing_cost')
                                 else jsonb_build_object('state', 'available', 'kurus', l.unit_cost_estimate_kurus) end
      ) order by i.code) from public.purchase_order_lines l join public.inventory_items i on i.id = l.inventory_item_id where l.purchase_order_id = p_order_id), '[]'::jsonb),
    'history', coalesce((select jsonb_agg(jsonb_build_object('fromStatus', h.from_status, 'toStatus', h.to_status, 'changedBy', p.full_name, 'reason', h.reason, 'changedAt', h.changed_at) order by h.changed_at, h.id)
                           from public.purchase_order_status_history h left join public.profiles p on p.id = h.changed_by where h.purchase_order_id = p_order_id), '[]'::jsonb),
    'receipts', coalesce((select jsonb_agg(jsonb_build_object('lineId', r.purchase_order_line_id, 'movementId', r.inventory_movement_id, 'quantity', r.quantity, 'baseQuantity', r.base_quantity,
                              'reversed', exists (select 1 from public.inventory_movements m where m.reverses_movement_id = r.inventory_movement_id),
                              'receivedBy', p.full_name, 'receivedAt', r.received_at) order by r.received_at, r.id)
                           from public.purchase_order_receipts r left join public.profiles p on p.id = r.received_by where r.purchase_order_id = p_order_id), '[]'::jsonb));
end;
$$;
comment on function public.get_purchase_order(uuid) is
  'One purchase order with lines (ordered vs received), status history and the linked RECEIPT movements. procurement.order.read + branch scope; cost estimates need inventory.cost.read (missing cost = unavailable, never 0).';

create or replace function public.list_purchase_orders(p_branch_id uuid, p_statuses text[] default null, p_limit integer default 50)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.current_user_can_inventory('procurement.order.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  -- progress is counted in LINES: quantities of different items/units are never added together
  return coalesce((
    select jsonb_agg(x order by x ->> 'createdAt' desc) from (
      select jsonb_build_object(
        'id', po.id, 'orderNumber', po.order_number, 'status', po.status, 'supplierCode', s.code, 'supplierName', s.name,
        'orderedForDate', po.ordered_for_date, 'expectedDeliveryDate', po.expected_delivery_date, 'createdAt', po.created_at,
        'lineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id),
        'receivedLineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id and l.received_quantity >= l.ordered_quantity),
        'partialLineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id and l.received_quantity > 0 and l.received_quantity < l.ordered_quantity)) as x
      from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id
      where po.branch_id = p_branch_id and (p_statuses is null or po.status = any(p_statuses))
      order by po.created_at desc limit greatest(1, least(coalesce(p_limit, 50), 200))
    ) t), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Order calendar (pure, timezone-aware, no table access)
-- ---------------------------------------------------------------------------
create or replace function public.procurement_calendar(
  p_now timestamptz, p_tz text, p_allowed smallint[], p_cutoff time, p_delivery smallint[], p_lead integer
)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_local timestamp := p_now at time zone coalesce(p_tz, 'Europe/Istanbul');
  v_today date := v_local::date;
  v_time time := v_local::time;
  v_on_day boolean;
  v_passed boolean;
  v_can boolean;
  v_next date;
  v_earliest date;
  v_delivery date;
  v_i integer;
begin
  if p_allowed is null then
    return jsonb_build_object('configured', false, 'today', v_today, 'canOrderToday', null, 'cutoffPassed', null, 'nextOrderDate', null,
      'expectedDelivery', jsonb_build_object('state', 'unknown', 'date', null));
  end if;
  v_on_day := extract(isodow from v_today)::int = any(p_allowed);
  v_passed := case when v_on_day and p_cutoff is not null then v_time >= p_cutoff else null end;
  v_can := v_on_day and coalesce(not v_passed, true);
  for v_i in (case when v_can then 0 else 1 end)..(case when v_can then 0 else 1 end) + 13 loop
    if extract(isodow from v_today + v_i)::int = any(p_allowed) then v_next := v_today + v_i; exit; end if;
  end loop;
  if v_next is not null and (p_delivery is not null or p_lead is not null) then
    v_earliest := v_next + coalesce(p_lead, 0);
    if p_delivery is null then
      v_delivery := v_earliest;
    else
      for v_i in 0..13 loop
        if extract(isodow from v_earliest + v_i)::int = any(p_delivery) then v_delivery := v_earliest + v_i; exit; end if;
      end loop;
    end if;
  end if;
  return jsonb_build_object('configured', true, 'today', v_today, 'canOrderToday', v_can, 'cutoffPassed', v_passed, 'nextOrderDate', v_next,
    'expectedDelivery', jsonb_build_object('state', case when v_delivery is null then 'unknown' else 'estimated' end, 'date', v_delivery));
end;
$$;
comment on function public.procurement_calendar(timestamptz, text, smallint[], time, smallint[], integer) is
  'Order calendar in the branch time zone (never UTC): canOrderToday, cutoffPassed (only on an order day), nextOrderDate and an ESTIMATED delivery date (state estimated|unknown, never exact). Unconfigured weekdays = configured:false, no invented default.';
revoke all on function public.procurement_calendar(timestamptz, text, smallint[], time, smallint[], integer) from public, anon;
grant execute on function public.procurement_calendar(timestamptz, text, smallint[], time, smallint[], integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Order suggestions (deterministic primitives only)
-- ---------------------------------------------------------------------------
create or replace function public.get_order_suggestions(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
begin
  if not public.current_user_can_inventory('procurement.order.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select timezone into v_tz from public.branches where id = p_branch_id;
  return coalesce((
    select jsonb_agg(x order by x ->> 'code') from (
      select jsonb_build_object(
        'inventoryItemId', i.id, 'code', i.code, 'name', i.name, 'unit', i.unit,
        'supplierId', sp.supplier_id, 'supplierCode', s.code, 'supplierName', s.name,
        -- every stock figure below is in the BASE (stock) unit
        'onHand', t.on_hand, 'pendingOrderQuantity', t.pending, 'effectiveStock', t.on_hand + t.pending,
        'minimumStock', sp.minimum_stock, 'targetStock', sp.target_stock, 'safetyStock', sp.safety_stock,
        'orderUnit', sp.order_unit, 'unitsPerPack', sp.units_per_pack, 'conversionStatus', u.conv,
        'status', case when sp.target_stock is not null then 'configured'
                       when sp.minimum_stock is not null or sp.safety_stock is not null then 'partially_configured'
                       else 'unavailable' end,
        'reorderNeeded', case when sp.minimum_stock is not null then (t.on_hand + t.pending) < sp.minimum_stock
                              when sp.target_stock is not null then (t.on_hand + t.pending) < sp.target_stock
                              else null end,
        -- the suggestion is in the ORDER unit (suggestedBaseQuantity = the same amount in base units)
        'suggestedQuantity', u.order_units,
        'suggestedBaseQuantity', case when u.order_units is null then null else u.order_units * u.factor end,
        'hasOpenOrder', t.pending > 0,
        'calendar', public.procurement_calendar(now(), v_tz, sp.allowed_order_weekdays, sp.order_cutoff_time, sp.delivery_weekdays, sp.lead_time_days)
      ) as x
      from public.item_supply_params sp
      join public.inventory_items i on i.id = sp.item_id
      join public.suppliers s on s.id = sp.supplier_id
      cross join lateral (
        select public.inventory_stock_quantity(i.id) as on_hand,
               -- pending inbound in BASE units: open order quantity * the line's frozen pack factor
               coalesce((select sum((l.ordered_quantity - l.received_quantity) * coalesce(l.units_per_pack_snapshot, 1))
                           from public.purchase_order_lines l join public.purchase_orders po on po.id = l.purchase_order_id
                          where l.inventory_item_id = i.id and po.branch_id = p_branch_id
                            and po.status in ('SUBMITTED', 'APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')), 0) as pending
      ) t
      cross join lateral (
        select c.conv, c.factor,
               case when c.conv = 'missing' or sp.target_stock is null or sp.target_stock - (t.on_hand + t.pending) <= 0 then null
                    when sp.order_multiple is not null
                      then ceil(greatest((sp.target_stock - (t.on_hand + t.pending)) / c.factor, coalesce(sp.minimum_order_quantity, 0)) / sp.order_multiple) * sp.order_multiple
                    when c.conv = 'pack'   -- a pack is indivisible: round up to whole order units
                      then ceil(greatest((sp.target_stock - (t.on_hand + t.pending)) / c.factor, coalesce(sp.minimum_order_quantity, 0)))
                    else greatest(sp.target_stock - (t.on_hand + t.pending), coalesce(sp.minimum_order_quantity, 0)) end as order_units
        from (select case when (sp.order_unit is null) <> (sp.units_per_pack is null) then 'missing'
                          when sp.order_unit is null then 'base_unit' else 'pack' end as conv,
                     case when sp.order_unit is not null and sp.units_per_pack is not null then sp.units_per_pack else 1 end as factor) c
      ) u
      where sp.branch_id = p_branch_id and sp.is_active and i.is_active
    ) q), '[]'::jsonb);
end;
$$;
comment on function public.get_order_suggestions(uuid) is
  'Deterministic V1 primitives per configured item. Stock figures are in the BASE unit: onHand (ledger), pendingOrderQuantity (open orders SUBMITTED..PARTIALLY_RECEIVED x frozen pack factor, DRAFT excluded), effectiveStock = onHand + pending, thresholds. The need target - effective (base) is converted to the ORDER unit (/ units_per_pack), raised to the minimum order quantity (order unit), rounded up to the order multiple (order unit) or, for packs, to whole packs; suggestedBaseQuantity = the same in base units. conversionStatus base_unit|pack|missing (a half-configured conversion yields no suggestion). reorderNeeded: effective < minimum, else < target, else null; suggestedQuantity null (never 0 or negative) when no need or no target. safety_stock, sales velocity, weather and season are extension points, not used.';

-- ---------------------------------------------------------------------------
-- Command Center read model (no UI redesign here)
-- ---------------------------------------------------------------------------
create or replace function public.get_procurement_attention(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_today date;
  v_suggestions jsonb;
begin
  if not public.current_user_can_inventory('procurement.order.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select timezone into v_tz from public.branches where id = p_branch_id;
  v_today := (now() at time zone coalesce(v_tz, 'Europe/Istanbul'))::date;
  v_suggestions := public.get_order_suggestions(p_branch_id);

  return jsonb_build_object(
    'branchId', p_branch_id, 'today', v_today,
    'awaitingApproval', coalesce((select jsonb_agg(public.procurement_order_brief(po.id) order by po.submitted_at) from public.purchase_orders po
                                   where po.branch_id = p_branch_id and po.status = 'SUBMITTED'), '[]'::jsonb),
    'dueToday', coalesce((select jsonb_agg(public.procurement_order_brief(po.id) order by po.order_number) from public.purchase_orders po
                           where po.branch_id = p_branch_id and po.expected_delivery_date = v_today
                             and po.status in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')), '[]'::jsonb),
    'overdueDelivery', coalesce((select jsonb_agg(public.procurement_order_brief(po.id) order by po.expected_delivery_date) from public.purchase_orders po
                                  where po.branch_id = p_branch_id and po.expected_delivery_date < v_today
                                    and po.status in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')), '[]'::jsonb),
    'partiallyReceived', coalesce((select jsonb_agg(public.procurement_order_brief(po.id) order by po.order_number) from public.purchase_orders po
                                    where po.branch_id = p_branch_id and po.status = 'PARTIALLY_RECEIVED'), '[]'::jsonb),
    'nextDeliveries', coalesce((select jsonb_agg(b order by b ->> 'expectedDeliveryDate') from (
                                   select public.procurement_order_brief(po.id) as b from public.purchase_orders po
                                    where po.branch_id = p_branch_id and po.expected_delivery_date >= v_today
                                      and po.status in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED')
                                    order by po.expected_delivery_date, po.order_number limit 10) z), '[]'::jsonb),
    'lowStockNoOpenOrder', coalesce((select jsonb_agg(e) from jsonb_array_elements(v_suggestions) e
                                      where (e ->> 'reorderNeeded') = 'true' and (e ->> 'hasOpenOrder') = 'false'), '[]'::jsonb),
    -- fulfillment that no longer matches the ledger (e.g. a receipt movement was reversed): shown, never silently reopened
    'reconciliationWarnings', coalesce((select jsonb_agg(public.procurement_order_brief(z.id) || jsonb_build_object('reasons', z.rec -> 'reasons') order by z.id)
                                         from (select po.id, public.procurement_order_reconciliation(po.id) as rec from public.purchase_orders po
                                                where po.branch_id = p_branch_id and po.status in ('APPROVED', 'PREPARING', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED')) z
                                        where z.rec ->> 'state' = 'warning'), '[]'::jsonb));
end;
$$;
comment on function public.get_procurement_attention(uuid) is
  'Command Center building block: awaiting approval, due today, overdue delivery (by the branch time zone), partially received, next deliveries and low-stock items with no open order. procurement.order.read + branch scope. Read-only.';

-- compact order summary used by the attention lists (internal)
create or replace function public.procurement_order_brief(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object('id', po.id, 'orderNumber', po.order_number, 'status', po.status, 'supplierName', s.name,
           'expectedDeliveryDate', po.expected_delivery_date, 'submittedAt', po.submitted_at,
           'lineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id),
           'receivedLineCount', (select count(*) from public.purchase_order_lines l where l.purchase_order_id = po.id and l.received_quantity >= l.ordered_quantity))
  from public.purchase_orders po join public.suppliers s on s.id = po.supplier_id where po.id = p_order_id;
$$;
revoke all on function public.procurement_order_brief(uuid) from public, anon, authenticated;
grant execute on function public.procurement_order_brief(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- grants (PUBLIC/anon never execute; internal helpers service_role only)
-- ---------------------------------------------------------------------------
revoke all on function public.upsert_supplier(uuid, text, text, text, text, text, text, text, text) from public, anon;
revoke all on function public.set_supplier_active(uuid, boolean, text) from public, anon;
revoke all on function public.upsert_item_supply_params(uuid, uuid, uuid, jsonb, text) from public, anon;
revoke all on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb) from public, anon;
revoke all on function public.replace_purchase_order_lines(uuid, jsonb) from public, anon;
revoke all on function public.update_purchase_order_header(uuid, date, date, text) from public, anon;
revoke all on function public.transition_purchase_order(uuid, text, text) from public, anon;
revoke all on function public.receive_purchase_order(uuid, jsonb, text) from public, anon;
revoke all on function public.get_purchase_order(uuid) from public, anon;
revoke all on function public.list_purchase_orders(uuid, text[], integer) from public, anon;
revoke all on function public.get_order_suggestions(uuid) from public, anon;
revoke all on function public.get_procurement_attention(uuid) from public, anon;
grant execute on function public.upsert_supplier(uuid, text, text, text, text, text, text, text, text) to authenticated;
grant execute on function public.set_supplier_active(uuid, boolean, text) to authenticated;
grant execute on function public.upsert_item_supply_params(uuid, uuid, uuid, jsonb, text) to authenticated;
grant execute on function public.create_purchase_order(uuid, uuid, date, date, text, jsonb) to authenticated;
grant execute on function public.replace_purchase_order_lines(uuid, jsonb) to authenticated;
grant execute on function public.update_purchase_order_header(uuid, date, date, text) to authenticated;
grant execute on function public.transition_purchase_order(uuid, text, text) to authenticated;
grant execute on function public.receive_purchase_order(uuid, jsonb, text) to authenticated;
grant execute on function public.get_purchase_order(uuid) to authenticated;
grant execute on function public.list_purchase_orders(uuid, text[], integer) to authenticated;
grant execute on function public.get_order_suggestions(uuid) to authenticated;
grant execute on function public.get_procurement_attention(uuid) to authenticated;
