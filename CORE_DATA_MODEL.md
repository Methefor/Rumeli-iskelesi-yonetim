# Core Data Model (Phase D — prepared, local-staging-validated, not applied to production)

Status: schema, RLS, and audited RPCs exist as reviewable SQL
(`supabase/migrations/009-011`), applied and integration-tested only
against local Supabase (see `WORKLOG.md`). **Not applied to any staging or
production project.**

## The central rule

**Branch, category, and register are always a foreign key, never a column
name.** The legacy schema encodes branch/category into column names
(`rumeli_z1`, `balik_ekmek`, `dondurma`, `gida`, `kahve`, ...) — every table
below normalizes that into rows referenced by id, so adding a fourth branch
or an eleventh category is a data insert, not a schema migration. See
`docs/LEGACY_RECONCILIATION.md` "Legacy adapter strategy" for the exact
legacy-column → V4-row mapping.

## Table map

```
branches (003) ─┬─< shift_definitions (009) ─┬─< shifts (009) ─┬─< shift_assignments (009)
                 ├─< registers (009)          │                 │
                 ├─< sales_category_branches ─┘                 └─< sales_reports (009) ─┬─< sales_report_items (009)
                 │        │                                                              └─< sales_report_overrides (009)
                 │        └── sales_categories (009, global catalog)
                 └─< reconciliation_thresholds (009, one row per branch)

profiles (001) ──< shift_assignments.user_id, sales_reports.submitted_by
audit_logs (004) ← every audited RPC in 011_operational_rpcs.sql
```

## Tables

| Table | Purpose | Lifecycle |
|---|---|---|
| `shift_definitions` | Named shift types per branch (sabah/akşam), with the server-authoritative submission cutoff | `is_active` flag, never deleted |
| `registers` | Cash registers per branch (Kasa 1, Kasa 2, ...) | `is_active` flag |
| `sales_categories` | Global category catalog (Gıda, Kahve, Dondurma, ...) | `is_active` flag |
| `sales_category_branches` | Which categories a branch actually reports on | join row insert/delete |
| `reconciliation_thresholds` | Per-branch WARNING/ERROR tolerance (config-driven, see `domain/reconciliation`) | one row per branch |
| `shifts` | One concrete shift instance (branch + definition + business_date) | `status`: scheduled → in_progress → submitted → closed, or cancelled |
| `shift_assignments` | Employee assigned to a shift | `status`: assigned → confirmed, or cancelled |
| `sales_reports` | Generic X/Z report, branch/category agnostic | `status`: submitted → edited, or cancelled (never deleted); `reconciliation_status`: OK/WARNING/ERROR, server-computed |
| `sales_report_items` | Category breakdown for a report | written atomically with the parent report |
| `sales_report_overrides` | Append-only history of manager reconciliation overrides | insert-only |

## Why so many things are RPC-only

Every write that AUTH_ARCHITECTURE.md's Phase C security review would call
a "critical action" — schedule/cancel a shift, assign an employee, change a
report's numbers, cancel a report, override reconciliation, reassign a
shift's branch — goes through a `SECURITY DEFINER` RPC in
`011_operational_rpcs.sql`, never a raw table write. `010_operational_rls.sql`
grants **no** client INSERT/UPDATE/DELETE on `shifts`, `shift_assignments`,
`sales_reports`, `sales_report_items`, or `sales_report_overrides` — this is
the same rule Phase C established for `user_roles`/`branch_memberships`
(see `DECISIONS.md`), generalized to the operational tables. A raw,
permission-gated table policy cannot express branch scoping + ownership +
"and write an audit_logs row" all at once; a `plpgsql` function can, and
does, every time.

## Server-side authority, not the browser clock

`create_sales_report()` resolves a shift's submission cutoff from
`shift_definitions.cutoff_hour/cutoff_minute/cutoff_day_offset` against
`now()` (the database server's clock) — never a client-supplied timestamp.
This mirrors `domain/shifts/evaluateOnTime.ts`'s `ShiftTimingRule` shape
exactly (same three fields, same semantics for a cutoff crossing midnight),
so the SQL and TypeScript never encode the rule differently even though
they're necessarily two separate implementations. See `SHIFT_MODEL.md`.

## Reconciliation is config-driven, not hardcoded

`reconciliation_thresholds` holds one `(warning_percentage,
error_percentage)` row per branch. `compute_reconciliation_status()` (SQL,
authoritative) and `domain/reconciliation/reconcile.ts` (TypeScript,
optimistic client preview) implement the identical three-tier comparison —
see `SALES_MODEL.md` for what "expected" and "actual" mean concretely in
this phase.

## A bug this exact model exposed, twice

A `shifts`-select policy referencing `shift_assignments`, and a
`shift_assignments`-select policy referencing `shifts` back, is exactly the
RLS infinite-recursion trap (`42P17`) — found only by a live browser smoke
test against local Supabase, not by reading the SQL. Fixed with two more
`SECURITY DEFINER` helpers (`current_user_assigned_shift_ids()`,
`shift_branch_id()`) that bypass RLS on their own internal query, the exact
same fix class Phase C's `current_user_branch_ids()` already established.
See `DECISIONS.md` and `010_operational_rls.sql`'s header comment.

## What Phase D deliberately does not build

- Inventory/waste/cost tables for İskele Dondurma (explicitly deferred —
  the brief calls for the core sales/shift model to stabilize first).
- Performance scoring, badges, analytics dashboards (Phase G/H/I).
- Any legacy data migration or backfill — see
  `docs/LEGACY_RECONCILIATION.md` "Legacy adapter strategy" for the
  documented-only mapping.
- Balık Ekmek shift definitions / category assignments — seeded only for
  Rumeli İskelesi and İskele Dondurma per the brief's stated priority;
  Balık Ekmek's `branches` row exists (Phase C) but has no operational
  config yet.
