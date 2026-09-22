# Inventory Security (Phase E)

Same rules as Phases C/D: no anonymous access, **no raw client write on any
inventory table**, every mutation is an audited `SECURITY DEFINER` RPC.

## Permissions (`012`, seeded into `role_permissions`)

| Permission | owner | manager | branch_manager | cashier | employee | viewer |
|---|:-:|:-:|:-:|:-:|:-:|:-:|
| `inventory.read` | ✔ | ✔ | ✔ (own branches) | ✔ (own branch) | ✔ (own branch) | – |
| `inventory.record` (waste) | ✔ | ✔ | ✔ | ✔ | ✔ | – |
| `inventory.count` | ✔ | ✔ | ✔ | ✔ | ✔ | – |
| `inventory.receive` | ✔ | ✔ | ✔ | – | – | – |
| `inventory.adjust` (adjust + void count; see below — NOT reversal) | ✔ | ✔ | ✔ (own branches) | – | – | – |
| movement reversal (`reverse_inventory_movement`) | ✔ | ✔ | – | – | – | – |
| `inventory.item.manage` | ✔ | ✔ | ✔ | – | – | – |
| `inventory.cost.read` | ✔ | ✔ | ✔ | – | – | – |
| `inventory.cost.manage` | ✔ | ✔ | – | – | – | – |

Branch scope is enforced in one place, `current_user_can_inventory(perm,
branch)` = holds the permission **and** (owner/manager **or** member of that
branch). `viewer` has no inventory permission until a reviewer grants one.
`app/src/domain/inventory/permissions.ts` mirrors this table for **UI
visibility only**; drift can hide a button but cannot bypass the server.

**2026-09-22 — final policy (a same-day cashier grant was tried, then rolled
back).** Earlier the same day, `cashier` was briefly granted `inventory.adjust`
(own branch). The user's explicit, written decision superseded that before
any of it was committed or deployed anywhere:

* **cashier / employee**: `inventory.read`, `inventory.record` (waste),
  `inventory.count` — own branch only. **No** `inventory.adjust`, **no**
  `reverse_inventory_movement`, **no** `void_inventory_count`, **no**
  `inventory.cost.read`/`cost.manage`, **no** `inventory.receive`. Identical
  for both roles — the earlier cashier-specific grant is fully reverted.
* **branch_manager**: unchanged — `inventory.read`/`record`/`receive`/`count`/
  `adjust`/`item.manage`/`cost.read`, own branches. `inventory.adjust` covers
  `record_inventory_adjustment` (mandatory reason, audited, append-only
  `ADJUSTMENT_IN`/`ADJUSTMENT_OUT`, server timestamp, before/after theoretical
  quantity in the audit row) and `void_inventory_count` (mandatory reason,
  audited; **does not** reverse stock or any adjustment linked to that count —
  the UI says so explicitly). branch_manager does **not** get
  `reverse_inventory_movement` — see the next point.
* **manager / owner**: unchanged, full scope, including `reverse_inventory_movement`.
  **Movement reversal is now owner/manager only**, not part of what
  `inventory.adjust` unlocks for branch_manager — `reverse_inventory_movement`
  in `014_inventory_rpcs.sql` additionally requires
  `current_user_is_owner_or_manager()`. This is the one behavioral change from
  the original Phase E design (which let branch_manager reverse too).

Owner/manager get a read-only oversight screen (`/app/manager/inventory/audit`,
`InventoryAuditPage`) listing a branch's last 100 adjust/reverse/count-void
entries (actor, Istanbul timestamp, reason, before/after). A dedicated
`audit_logs` RLS policy (`013_inventory_rls.sql`) keeps inventory audit rows —
which can carry `branch_id` and quantities — visible only to
`current_user_is_owner_or_manager()`; a plain `reports.read` holder does not
see `inventory_*` audit rows through the generic audit table, and
branch_manager does not see this screen either (RLS-consistent with the UI
gate). `write_audit_log` EXECUTE is revoked from `PUBLIC`/`anon`/`authenticated`
so only trusted `SECURITY DEFINER` RPCs can append audit rows at all.

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
employee/cashier cannot create items / set cost / receive / adjust / reverse /
void (in their own branch, not just cross-branch — see section E2); unrelated
branch_manager blocked cross-branch for read, item, receipt, adjustment,
count and cost; branch_manager can read but not set cost; branch_manager
adjusts and voids a count in their own branch but is explicitly denied
`reverse_inventory_movement`, both cross-branch and in their own branch;
manager/owner retain reversal; raw INSERT/UPDATE/DELETE denied on every table
(even for a manager); `unit_cost_snapshot` unreadable; internal helpers not
callable; ledger/cost UPDATE+DELETE blocked even for superuser; audit row per
privileged action with a non-null actor and before/after values; server
timestamp (`occurred_at = now()`, no time parameter on any RPC); count never
changes stock or writes movements; variance reproducible; cancelled/edited
sale keeps history (SALE, REVERSAL, SALE, REVERSAL) and nets to zero;
historical snapshot stable after a later cost row; cross-branch isolation of
items, movements, balances, counts.

Also executable, and run against a real local Supabase stack (not just this
harness): `timezone_regression.test.sql`, `timezone_rpc.test.sql`, and
`supabase/tests/local_inventory_api.mjs` (real Auth/PostgREST, 137
assertions, updated 2026-09-22 for the same rollback: cashier denied
adjust/reverse/void even in their own branch; branch_manager denied reversal
own-branch and cross-branch; branch_manager keeps own-branch adjust and
count-void; manager/owner keep reversal) — see
`docs/LOCAL_VALIDATION_2026-09-22.md`.

Not yet covered by an executable test: storage policies, and an Edge
Function run. The column-grant / raw-write-denial behaviour that used to be
listed here as PostgREST-only is now covered by `local_inventory_api.mjs`.

## Known limitations

* The 011 timing check no longer depends on session timezone — both 011 and
  014 now compute the cutoff with an explicit `AT TIME ZONE 'Europe/Istanbul'`
  and this was verified under 4 different session timezones on a real local
  Supabase stack (2026-09-22). See `docs/LOCAL_VALIDATION_2026-09-22.md`.
* `branch_manager` can adjust and void a count within its own branch(es), but
  cannot reverse a movement (owner/manager only). `cashier` and `employee`
  have neither adjust, reverse, nor void, in any branch.
* Voiding a count does not reverse stock or any adjustment linked to that
  count; the UI (`ClosingCountPage`, `InventoryAuditPage`) says so explicitly.
  No quantity/time limit, second approval, or negative-stock block exists for
  branch_manager's adjust/void, or for owner/manager's adjust/reverse/void —
  the append-only ledger plus the owner/manager audit view are the only
  after-the-fact control.

**Validation status (Phase E) — keep this distinction:**

| Item | Status |
|---|---|
| Phase E application / domain / UI tests (typecheck, lint, 165 unit + demo-flow tests, build) | **VALIDATED** |
| Migrations 012-014 | **PREPARED**, validated on a real local Supabase stack; **not applied to any hosted project** |
| Fresh local Supabase `db reset` (001-014 from zero) | **VALIDATED LOCALLY** (2026-09-22, real Docker/Postgres/GoTrue/PostgREST) |
| SQL security/timezone suites (`inventory_security.test.sql`, `timezone_regression.test.sql`, `timezone_rpc.test.sql`, ~155+32 assertions incl. the cashier/branch_manager rollback) against real local Postgres roles | **VALIDATED LOCALLY** |
| Real local Auth + PostgREST integration (`local_inventory_api.mjs`, 137 assertions, real password sessions/JWTs, every role) | **VALIDATED LOCALLY** |
| Timezone invariance (session TZ UTC / Europe/Istanbul / America/New_York / Asia/Tokyo all produce the same business result) | **VALIDATED LOCALLY** |
| Hosted / staging validation | **NOT DONE** |
| Production | **UNTOUCHED** |

The PGlite harness result described in earlier Phase E docs has been
superseded by the above real local Supabase run; see
`docs/LOCAL_VALIDATION_2026-09-22.md`. Do not describe any of this as
hosted/staging-validated until it has actually run there.
