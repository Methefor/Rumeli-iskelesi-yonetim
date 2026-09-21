# Inventory Security (Phase E)

Same rules as Phases C/D: no anonymous access, **no raw client write on any
inventory table**, every mutation is an audited `SECURITY DEFINER` RPC.

## Permissions (`012`, seeded into `role_permissions`)

| Permission | owner | manager | branch_manager | cashier / employee | viewer |
|---|:-:|:-:|:-:|:-:|:-:|
| `inventory.read` | ✔ | ✔ | ✔ (own branches) | ✔ (own branch) | – |
| `inventory.record` (waste) | ✔ | ✔ | ✔ | ✔ | – |
| `inventory.count` | ✔ | ✔ | ✔ | ✔ | – |
| `inventory.receive` | ✔ | ✔ | ✔ | – | – |
| `inventory.adjust` (adjust / reverse / void count) | ✔ | ✔ | ✔ | – | – |
| `inventory.item.manage` | ✔ | ✔ | ✔ | – | – |
| `inventory.cost.read` | ✔ | ✔ | ✔ | – | – |
| `inventory.cost.manage` | ✔ | ✔ | – | – | – |

Branch scope is enforced in one place, `current_user_can_inventory(perm,
branch)` = holds the permission **and** (owner/manager **or** member of that
branch). `viewer` has no inventory permission until a reviewer grants one.
`app/src/domain/inventory/permissions.ts` mirrors this table for **UI
visibility only**; drift can hide a button but cannot bypass the server.

## Layers

1. **Privileges**: `anon`/`authenticated` have no INSERT/UPDATE/DELETE on
   any inventory table; SELECT only, with RLS (branch + permission).
2. **Cost confidentiality**: `inventory_item_costs` rows need `cost.read`;
   `inventory_movements.unit_cost_snapshot` is excluded from the client
   column grant (clients must list columns; `select *` is rejected); cost and
   gross profit are read only via `get_inventory_gross_profit` (`cost.read`).
   A receipt line may carry `unit_cost` only for a caller who also holds
   `cost.manage`.
3. **Append-only triggers** on movements and costs (protect against a future
   bug in a definer function), and a guard allowing counts only
   `submitted → voided`.
4. **RPCs**: fixed `search_path`; authorization inside the body; no
   caller-supplied actor (`write_audit_log` uses `auth.uid()`); `EXECUTE`
   revoked from `PUBLIC`/`anon`; internal helpers (`inventory_insert_movement`,
   `inventory_effective_cost`, …) have no client grant at all.
5. **Audit** (`audit_logs.action`): `inventory_item_create/update/active_change`,
   `inventory_cost_change`, `inventory_receipt`, `inventory_waste`,
   `inventory_adjustment`, `inventory_movement_reversal`,
   `inventory_count_submit/void`, plus the existing `report_edit` /
   `report_delete` for sales-driven stock changes.

## Test plan

Executable: `supabase/tests/inventory_security.test.sql` (run only against a
local/disposable DB; one transaction, rolled back). Covers: anon denied;
employee cannot create items / set cost / receive / adjust / reverse / void;
cashier cannot privileged-adjust; branch_manager blocked cross-branch for
read, item, receipt, adjustment, count and cost; branch_manager can read but
not set cost; raw INSERT/UPDATE/DELETE denied on every table (even for a
manager); `unit_cost_snapshot` unreadable; internal helpers not callable;
ledger/cost UPDATE+DELETE blocked even for superuser; audit row per privileged
action with a non-null actor; server timestamp (`occurred_at = now()`, no
time parameter on any RPC); count never changes stock or writes movements;
variance reproducible; cancelled/edited sale keeps history (SALE, REVERSAL,
SALE, REVERSAL) and nets to zero; historical snapshot stable after a later
cost row; cross-branch isolation of items, movements, balances, counts.

Not yet covered by an executable test: storage policies, Edge Function, and a
real-Supabase (PostgREST) run of the column-grant behaviour.

## Known limitations

* Local Supabase was not available; see `INVENTORY_MODEL.md` "Validation".
* Existing 011 timing check builds the shift cutoff with the session
  timezone (UTC on Supabase) while business dates are Istanbul — pre-existing,
  untouched; worth a dedicated review before production.
* `branch_manager` can adjust/void within its branch; if that is too broad,
  remove `inventory.adjust` from its seed in `012`.

**Validation status (Phase E) — keep this distinction:**

| Item | Status |
|---|---|
| Phase E application / domain / UI tests (typecheck, lint, 150 unit + demo-flow tests, build) | **VALIDATED** |
| Migrations 012-014 | **PREPARED** (not applied anywhere) |
| PGlite security harness (`supabase/tests/inventory_security.test.sql`, ~150 assertions) | **PASSED, but NOT equivalent to real Supabase** (WASM Postgres + hand-written auth/storage shim; no GoTrue, PostgREST or real roles/grants) |
| Real local Supabase `db reset` + integration run | **OPEN** |
| Hosted / staging validation | **NOT DONE** |
| Production | **UNTOUCHED** |

The SQL must not be described as fully validated until it passes on a real
local Supabase stack.
