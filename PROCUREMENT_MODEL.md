# Procurement / Supply-Order Model (Phase 1C)

Status: **local development only**. Migrations `20261006000500_procurement_core` and `20261006000600_procurement_rpcs` (after
`20261006000400_branch_location`) are NOT applied to production; nothing was committed, pushed or deployed. The model sits on top of
the existing inventory ledger: **there is no second inventory, stock balance, receiving path or audit system.**

## 1. What is reused

| Need | Reused object |
|---|---|
| items | `inventory_items` (branch-scoped; composite FK `(item_id, branch_id)`) |
| stock | `inventory_movements` (append-only ledger); receiving writes plain `RECEIPT` movements through `inventory_insert_movement` |
| authorization | `current_user_can_inventory(permission, branch)` (permission + branch scope in one check) |
| audit | `write_audit_log` (actor = `auth.uid()`) |
| cost rule | `inventory_set_cost_internal` / `inventory.cost.manage`, same behaviour as `record_inventory_receipt` |
| time zone | `branches.timezone` (default `Europe/Istanbul`) |
| UI | RowCard / ReasonSheet / ConfirmSheet / ItemLinesEditor, the Management hub, the demo store and QA fixtures |

New tables: `suppliers`, `item_supply_params`, `purchase_orders`, `purchase_order_lines`, `purchase_order_status_history`,
`purchase_order_receipts` (+ sequence `purchase_order_seq`). The ledger table is **unchanged**; the link to it is
`purchase_order_receipts.inventory_movement_id` (unique).

## 2. UNIT CONTRACT (canonical model)

The ledger and every stock calculation use the item's **BASE (stock) unit** (`inventory_items.unit`). Ordering may use an **ORDER unit**
(e.g. a case) converted by a pack factor. Each field and its unit:

| Field | Unit |
|---|---|
| on-hand (ledger sum), pending inbound, effective stock | BASE |
| `minimum_stock`, `target_stock`, `safety_stock` | BASE |
| `units_per_pack` (and the line's `units_per_pack_snapshot`) | BASE units per ORDER unit |
| ledger `RECEIPT` quantity, `purchase_order_receipts.base_quantity`, unit costs | BASE |
| `purchase_order_lines.ordered_quantity`, `received_quantity`, open quantity | ORDER (BASE when `order_unit` is NULL) |
| `minimum_order_quantity`, `order_multiple` | ORDER |
| receive input quantity, `purchase_order_receipts.quantity` | ORDER |
| `unit_cost` supplied at receiving | per BASE unit (same as `record_inventory_receipt`) |
| suggestion `suggestedQuantity` / `suggestedBaseQuantity` | ORDER / BASE |

Conversion: `base = order quantity x units_per_pack_snapshot` (factor 1 when the line has no order unit). `order_unit` and
`units_per_pack` are set **together or not at all** (a line constraint enforces `(order_unit is null) = (units_per_pack_snapshot is null)`).
A half-configured conversion is **never guessed**: creating an order line, producing a suggestion and receiving all refuse it.
The factor is **snapshotted** on the line when the line is written; later changes to the supply parameters never alter existing
orders (new orders and new suggestions use the new size). Example: 2 cases x 12 pieces = 24 pieces added to the ledger; receiving 1 case
adds 12. The converted base quantity must have at most 3 decimals and, for whole-unit items, be a whole number.

No supplier, contact, weekday, cutoff, lead time, stock threshold, minimum order or price is seeded; every business input is nullable and
"not configured" is a real, visible state.

## 3. Suppliers

`suppliers(code unique + immutable, name, supplier_type COMPANY | CENTRAL_WAREHOUSE, contact_name, phone, email, notes, is_active)`.
Created/edited by `upsert_supplier`, (de)activated by `set_supplier_active` (permission `procurement.supplier.manage` = owner + manager,
mandatory reason, audited). A trigger forbids code changes and deletes. Read: `procurement.supplier.read` (owner, manager, branch_manager).
Cashier/employee/viewer/anon: nothing.

## 4. Item supply parameters

`item_supply_params`: one row per (branch, item) in V1 (one supplier per item and branch). Constraints: thresholds >= 0, target >= minimum
when both exist, lead time 0..365, pack/multiple/minimum order > 0, weekdays within 1..7. `upsert_item_supply_params`
(`procurement.supply.manage` + branch scope, mandatory reason, audited) takes a jsonb of the optional inputs and **replaces** them (missing key
= NULL). It may be saved half-configured (e.g. order unit without pack size) because the business input can still be missing; ordering and
suggestions then refuse to guess. Order creation enforces the minimum order quantity and order multiple (ORDER units).

## 5. Purchase orders

`purchase_orders` (human-readable `PO-YYYY-NNNNNN`) + `purchase_order_lines` (unique item per order, `ordered_quantity > 0`,
`received_quantity <= ordered_quantity`, pack snapshot, `unit_cost_estimate_kurus` = an **estimate**, never the ledger cost snapshot; hidden
from direct SELECT, returned by `get_purchase_order` to `inventory.cost.read` holders, missing = `unavailable`, never 0) +
`purchase_order_status_history` (append-only). Progress in lists is counted in **lines**; quantities of different items/units are never added.

### Lifecycle (single source: `procurement_transition_allowed`, TypeScript twin `transitionAllowed`)

```
DRAFT -> SUBMITTED -> APPROVED -> PREPARING -> IN_TRANSIT -> (PARTIALLY_RECEIVED ->) RECEIVED
DRAFT/SUBMITTED/APPROVED/PREPARING/IN_TRANSIT -> CANCELLED        SUBMITTED -> DRAFT (return, reason)
PARTIALLY_RECEIVED -> RECEIVED (close short, reason)              APPROVED may go straight to IN_TRANSIT
```
`RECEIVED` and `CANCELLED` are terminal (no reopen is designed). PARTIALLY_RECEIVED has no cancel edge. Receiving states are only reachable
through `receive_purchase_order`.

| Move | Permission |
|---|---|
| create / edit DRAFT lines+header / DRAFT->SUBMITTED / DRAFT->CANCELLED | `procurement.order.create` (owner, manager, branch_manager) |
| SUBMITTED->APPROVED | `procurement.order.approve` (owner, manager; **not** branch_manager) |
| everything else (return to draft, PREPARING, IN_TRANSIT, cancel after submit, close short) | `procurement.order.manage` (owner, manager) |

Reasons (>= 5 chars) are mandatory for cancel, return-to-draft and close-short. Lines are editable only while DRAFT (trigger + RPC);
approved quantities are frozen even for a privileged writer. Every transition and receipt is audited and written to the status history.
**Self-approval (owner decision for V1, 2026-10-06):** an owner/manager holding `procurement.order.approve` MAY approve an order they created
themselves (a test documents this). No four-eyes / segregation of duties is added in V1; it is a conscious policy, not an accident.

## 6. Receiving into the existing ledger

`receive_purchase_order(order, [{line_id, quantity (ORDER unit), unit_cost? (per BASE unit)}], note)`
(`procurement.order.receive`, branch-scoped; allowed from APPROVED / PREPARING / IN_TRANSIT / PARTIALLY_RECEIVED):

1. **locks the order header row first** (`FOR UPDATE`), so concurrent receivers of the same order serialise; each line is then locked and
   re-read, and the open quantity is computed **under the lock**;
2. quantity must be `> 0` and `<= ordered - received` (no double receiving, no over-receipt);
3. converts to BASE units with the line's pack snapshot (refuses an unknown conversion, fractional whole-unit pieces, an inactive item);
4. writes the stock through `inventory_insert_movement(item, 'RECEIPT', base quantity, ..., reference = order number)`: the existing,
   append-only ledger writer;
5. inserts the link in `purchase_order_receipts` (order quantity + base quantity + movement id) and grows `received_quantity`;
6. partial receipts set `PARTIALLY_RECEIVED`; when every line is fully received the order becomes `RECEIVED`; history + audit are written.

Steps 1-6 are **one transaction**: a failing line rolls back movements, links and `received_quantity` together (tested: valid line 1 +
invalid line 2 leaves no movement, no link, no received change). An optional `unit_cost` needs `inventory.cost.manage` and updates the item
cost like `record_inventory_receipt`; the ledger snapshot is otherwise the item's effective cost (missing stays NULL, never 0); the line
estimate is never used. A shortage the supplier will not deliver is closed explicitly (`PARTIALLY_RECEIVED -> RECEIVED` with a reason).
`supabase/tests/procurement_concurrency.test.mjs` proves, with two real database sessions, that the same remaining quantity cannot be
received twice (the second session waits for the first one's lock, then is refused), that 6 + 6 of 10 admits only one, and that receipts that
fit both succeed serially.

## 7. Fulfillment source of truth and reconciliation

`received_quantity` is fulfillment **state**, not an independently editable second truth: clients have no write privilege, and a trigger
rejects any change of it unless it happens inside `receive_purchase_order` (transaction-local flag), even for a privileged writer; it can
never decrease or exceed `ordered_quantity`. It is reconcilable: `received_quantity x pack snapshot` must equal the sum of
`purchase_order_receipts.base_quantity` of the line, and each link's RECEIPT movement is immutable (ledger trigger).

**If a RECEIPT movement is later reversed** (ledger REVERSAL), the order is **not** silently reopened (owner decision for V1, 2026-10-06;
reopening could contradict approvals and history). Instead `get_purchase_order.reconciliation` reports `state: warning` with reason `receipt_reversed` (reversed and net received base
quantity), the receipt is flagged `reversed`, `get_procurement_attention` lists the order under `reconciliationWarnings`, and the UI shows a
warning. `received_quantity` keeps what was recorded; a replacement quantity is stocked by a manager with a normal inventory receipt or
adjustment. A `link_mismatch` reason would expose any drift between the line and its links. The manager resolves the stock through the explicit
inventory workflow; there is no silent PO state rewrite.

## 8. Supplier / item deactivation

An inactive supplier cannot be newly assigned to an item and cannot receive **new** orders. Existing orders are not stranded: an already
approved order of a supplier that became inactive can still be received, an existing draft can still move on, and received/cancelled
history stays readable (tested). An inactive **item** cannot be received (the ledger writer refuses inactive items): the RPC says so
explicitly; reactivate the item to receive, or cancel the order with a reason (or close it short if partly received).

## 9. Order calendar (`procurement_calendar`, twin `procurementCalendar`)

Pure, timezone-aware (branch time zone, never UTC): `canOrderToday`, `cutoffPassed` (only meaningful on an order day; the cutoff minute
counts as passed), `nextOrderDate` and `expectedDelivery {state: estimated | unknown, date}` (order date + lead time, moved to the next
delivery weekday; **never exact**; unknown without lead time and delivery weekdays). Unconfigured weekdays return `configured: false`.

## 10. Order suggestion foundation (`get_order_suggestions`, twin `suggestOrder`) - dimensional audit

```
effective (BASE)   = onHand (BASE ledger) + pending (BASE: sum of (ordered - received) x the line's frozen pack factor over open orders)
need (BASE)        = target_stock (BASE) - effective
order units        = need / units_per_pack          (1 when ordering in the base unit)
suggestedQuantity  = max(order units, minimum_order_quantity) rounded UP to order_multiple (ORDER); whole packs when ordering in packs
suggestedBaseQuantity = suggestedQuantity x units_per_pack
```
Never `12 pieces + 2 cases`: pending packs are converted to pieces before they are added to stock. Open = SUBMITTED..PARTIALLY_RECEIVED
(DRAFT is not committed). `status`: `configured` (target set) / `partially_configured` (minimum or safety only) / `unavailable`;
`reorderNeeded`: effective < minimum, else < target, else `null`; `conversionStatus`: `base_unit` / `pack` / `missing` (no suggestion);
`suggestedQuantity` is positive or `null`, never 0 or negative. Safety stock, sales velocity, weather and season are extension points, not
used. No AI/ML.

## 11. Command Center building blocks (`get_procurement_attention`)

awaiting approval, due today, overdue delivery (branch-local date), partially received, next deliveries (<= 10), low-stock items without an
open order, and reconciliation warnings. Read-only, branch-scoped. No dashboard redesign here.

## 12. Receive permissions (architecture, no new policy)

Two **separate** permissions already exist and stay separate:

| Permission | Holders today |
|---|---|
| `inventory.receive` (generic own-branch stock receipt, `record_inventory_receipt`) | owner, manager, branch_manager, cashier, employee (existing decision, unchanged, tested) |
| `procurement.order.receive` (receiving **against a purchase order**) | owner, manager, branch_manager |

**V1 DEFAULT = option A (owner decision, 2026-10-06):** PO receiving stays owner/manager/branch_manager only, while the generic receipt stays
available to cashier/employee under the existing own-branch rules. Cashier/employee do **not** receive against a purchase order by default.
Configurability is kept: `procurement.order.receive` can later be granted to another role by a `role_permissions` grant with no code change,
and the branch restriction still applies (tested: another branch is denied, revoking closes it). Such a role would additionally need a minimal
read model, because it cannot read orders (`procurement.order.read`) today.

## 13. Security summary

All tables: RLS, SELECT only for clients (writes only via audited SECURITY DEFINER RPCs with `search_path = public`, no PUBLIC/anon execute).
Branch isolation through `current_user_can_inventory`. The line cost estimate column is not directly selectable. Internal helpers
(`procurement_write_lines`, `procurement_order_brief`, `procurement_order_reconciliation`) are service_role only.
`supabase/tests/procurement.test.sql` covers owner, manager, branch_manager, cashier, employee, viewer, anon and service_role.

## 14. Open owner decisions (nothing invented)

- real suppliers, contacts, order weekdays, cutoffs, delivery days, lead times, minimum/target/safety stock, minimum order quantities, prices;
- approval thresholds (V1 keeps single-step approval, self-approval allowed); whether a minimal read model should ever let non-managers see orders;
- several suppliers per item/branch (V1 allows one) and a primary-supplier rule;
- whether a cancelled order may be reopened (not designed), over-receipt tolerance (none), and whether a reversed receipt should ever offer a guided re-receive;
- how the estimate relates to actual purchase cost, invoices/payments (out of scope);
- future inputs: sales velocity, weather, season, lead-time demand, central-warehouse stock visibility.
