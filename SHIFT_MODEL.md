# Shift Model (Phase D — prepared, local-staging-validated)

See `CORE_DATA_MODEL.md` for how this fits the wider schema.

## Shapes

- **`shift_definitions`**: a named shift type per branch (`key`, `name`,
  `start_hour/minute`, `end_hour/minute`, `cutoff_hour/minute/day_offset`).
  Seeded with a generic `morning`/`evening` pair for Rumeli İskelesi and
  İskele Dondurma (Balık Ekmek intentionally not seeded — see
  `CORE_DATA_MODEL.md`). Times are a starting point for a manager to
  adjust via `shift_definitions_write_scoped` (010), not a migrated legacy
  fact.
- **`shifts`**: one concrete instance — `(branch_id, shift_definition_id,
  business_date)` is unique. `status` is a lifecycle
  (`scheduled → in_progress → submitted → closed`, or `cancelled`), never a
  soft-delete flag — a cancelled shift is kept for historical integrity.
- **`shift_assignments`**: which employee(s) are on a shift. `status`
  (`assigned → confirmed`, or `cancelled`), `is_on_time` (computed, not yet
  wired to a specific "clock-in" event in this phase — reserved for
  Phase E), `late_override`/`late_override_reason` (settable ONLY via
  `override_shift_lateness()`, excluded from any client column grant).

## Server-evaluated timing, not the browser clock

The brief is explicit: "Do not depend on browser clock for authority." Two
places enforce this:

1. **`domain/shifts/evaluateOnTime.ts`** (existing since Phase B) — a pure
   function taking a `ShiftTimingRule { cutoffHour, cutoffMinute,
   cutoffDayOffset }`, a `businessDate`, and a `submittedAt: Date`. Used for
   client-side UI preview only ("your submission will be marked late").
2. **`create_sales_report()`** (`011_operational_rpcs.sql`) — resolves the
   *same* rule shape from `shift_definitions.cutoff_hour/cutoff_minute/
   cutoff_day_offset`, compares against `now()` (the Postgres server's
   clock, never a client timestamp), and rejects submission past the
   cutoff **unless** the caller holds org-wide or branch-scoped
   `sales.edit_all` (the documented manager-override path). This is the
   authoritative check — (1) can be wrong or bypassed client-side and
   nothing breaks, because (2) still enforces it server-side.

The two are deliberately parallel implementations (SQL vs. TypeScript, two
different runtimes) of the identical rule, not a shared library — see
`009_operational_core.sql`'s column comments for the field-by-field
correspondence.

## Assignment authorization

`assign_shift()`/`update_shift_assignment_status()` (011):

- Owner/manager: any shift, org-wide.
- `branch_manager` (`shift.manage` + a shared branch membership with the
  shift's own branch): any shift within that branch only.
- The assigned employee: may self-confirm (`status → 'confirmed'`) but may
  **not** self-cancel or assign themselves — cancellation and assignment
  are privileged/branch-scoped actions, matching the audited-actions list
  in `AUTH_ARCHITECTURE.md`.

## Branch reassignment

`reassign_shift_branch()` is **org-wide only** (`current_user_is_owner_or_manager()`),
never branch-scoped — a `branch_manager` reassigning a shift *out of* their
branch would need authority over the *destination* branch too, which their
own membership doesn't establish. Reason is mandatory; every call writes an
`audit_logs` row with the old and new `branch_id`.

## What Phase E is expected to add (not built here)

- A real "clock-in" event distinct from shift assignment, to make
  `shift_assignments.is_on_time` mean something concrete.
- Manager UI for editing `shift_definitions` times (the write path already
  exists in RLS/RPCs; only the Management Center screen doesn't).
- Recurring shift scheduling (currently one `schedule_shift()` call per
  concrete date).

## Note (Stage 3, 2026-09-26)

The morning/evening times seeded by migration 009 are generic starting values
(classified demo_only). The legacy app shows Sabah 09:00-17:30 and Akşam
16:00-01:00; they are waiting for owner approval in `operating-data/real/`.
