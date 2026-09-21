# Migration Plan (Phase C — not applied)

**Nothing in `supabase/` has been run against production.** This document
is the review/sequencing plan for when that changes — it does not itself
authorize applying anything.

## Files, in dependency order

| # | File | Creates | Depends on |
|---|---|---|---|
| 001 | `001_profiles_roles.sql` | `profiles`, `roles` (+ seed), `user_roles` | `auth.users` (built-in) |
| 002 | `002_permissions.sql` | `permissions` (+ seed), `role_permissions` (+ seed mapping) | 001 |
| 003 | `003_branches_memberships.sql` | `branches` (+ seed), `branch_memberships` | 001 |
| 004 | `004_audit_logs.sql` | `audit_logs` | `auth.users` only |
| 005 | `005_auth_helpers.sql` | helper functions, `pin_credentials`, `verify_pin()` | 001, 002, 003, 004 |
| 006 | `006_rls_policies.sql` | RLS enable + policies for every table above | 001-005 |
| 007 | `007_storage_policies.sql` | new `avatars-v4` bucket + policies | 001, 002 |
| 008 | `008_admin_rpcs.sql` | audited RPCs: `assign_role`, `revoke_role`, `assign_branch_membership`, `remove_branch_membership`, `admin_set_employee_active`, `admin_reset_pin`, `admin_set_employee_code` | 001-005 |
| 009 | `009_operational_core.sql` | `shift_definitions`, `registers`, `sales_categories` (+seed), `sales_category_branches` (+seed), `reconciliation_thresholds` (+seed), `shifts`, `shift_assignments`, `sales_reports`, `sales_report_items`, `sales_report_overrides` | 001, 003, 004 |
| 010 | `010_operational_rls.sql` | RLS for every table in 009, plus `current_user_assigned_shift_ids()`/`shift_branch_id()` helpers | 001-005, 009 |
| 011 | `011_operational_rpcs.sql` | audited RPCs: `schedule_shift`, `cancel_shift`, `reassign_shift_branch`, `assign_shift`, `update_shift_assignment_status`, `override_shift_lateness`, `create_sales_report`, `edit_sales_report`, `cancel_sales_report`, `override_reconciliation` | 001-005, 009 |

Each file's own header comment repeats its dependencies and a rollback
snippet — this table is a summary, the files are the source of truth.

## What is explicitly NOT in these migrations

- No change to any legacy table (`admins`, `cashiers`, `daily_reports`,
  `daily_revenue`, `entry_history`, `shift_schedule`, `targets`) or the
  existing `avatars` bucket.
- No data migration (legacy `cashiers`/`admins` rows → `profiles`, or any
  historical `daily_reports` data). That is a separate, explicitly-approved
  script, written after 001-011 are reviewed and applied to a staging
  project — not bundled here so a schema review and a data-migration
  review can happen independently. See `docs/LEGACY_RECONCILIATION.md`
  "Legacy adapter strategy" for the documented-only column mapping.
- `tasks`, `performance_events`/`performance_scores`, `badge_definitions`,
  `employee_badges`, and İskele Dondurma inventory/waste/cost tables — see
  `RLS_PLAN.md` "Future operational tables" for the design template those
  will follow when built.
- A `service_credentials` table — this design was reviewed and REJECTED
  (see `DECISIONS.md`); the `pin-login` Edge Function uses
  `generateLink`/`verifyOtp` instead and stores no password anywhere.

## How to review

1. Read each file top-to-bottom — every file has a header explaining
   purpose, dependencies, and rollback.
2. Check `RLS_PLAN.md` for the full policy rationale per table/role.
3. Check `AUTH_ARCHITECTURE.md` for how `pin_credentials`/`verify_pin` fit
   into the actual login flow, and the "not live-verified" caveat on the
   `generateLink`/`verifyOtp` session-minting step (008/pin-login).
4. Confirm nothing here references or writes to a legacy table name.

## How to apply (once approved — not yet)

Intended path, in order, against a **staging** Supabase project first, not
production directly:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

`supabase db push` applies migration files in filename order, which is why
they're numbered `001`-`011` rather than timestamped — the numeric prefixes
enforce the dependency order in this table regardless of file creation
date. After staging verification, repeat against the production project
only with explicit sign-off.

Do not apply via the Supabase dashboard SQL editor as a substitute for
`db push` unless doing so file-by-file in the same order — the dashboard
editor does not track which migrations have run.

## Rollback strategy

Each file documents its own rollback (drop statements in dependency-safe
reverse order). Applying and rolling back should be exercised on staging
before production ever sees these files. Because 001-011 create entirely
new tables/functions/policies with no foreign keys into any legacy table,
a full rollback of all eleven is non-destructive to legacy data by
construction — but always confirm with `git diff`-style review of the
actual staging schema state before trusting that in the moment.

## Coexistence with legacy

Legacy and V4 run against the same Supabase project but disjoint tables
during Phases C-K. Legacy keeps working unmodified. V4 features (Phase E
onward) read/write only the new schema. See `CURRENT_STATE.md` and
`RLS_PLAN.md` "Legacy transition."

## Sign-off checklist before applying to staging

- [ ] Someone other than the author has read all 11 files.
- [ ] `RLS_PLAN.md`'s policy table matches what's actually in `006` and `010`.
- [ ] Confirmed via `\d` or the dashboard schema view that no table/function
      name in 001-011 collides with an existing legacy name.
- [ ] Staging project exists and is not the production project.
- [ ] A rollback has been test-run on staging at least once.

## Sign-off checklist before applying to production

- [ ] All of the above, on staging, with no issues found.
- [x] The `generateLink`/`verifyOtp` session-minting step in `pin-login` has
      been smoke-tested — against a local Supabase stack (2026-09-17), not
      yet against a hosted staging project. See `AUTH_ARCHITECTURE.md`
      "Live-verified". A real cloud staging project run is recommended
      before production but is a lower-confidence gap than the
      never-executed state this checklist item originally flagged.
- [ ] Explicit user approval for this specific step, separate from the
      approval to prepare these files.

## Phase E additions (012-014) — prepared, not applied

| # | File | Creates | Depends on |
|---|---|---|---|
| 012 | `012_inventory_core.sql` | inventory permissions + role grants, `inventory_items`, `inventory_item_costs`, `inventory_movements`, `inventory_counts`, `inventory_count_items`, append-only guards, `sales_report_items` product link, two views | 001-003, 009 |
| 013 | `013_inventory_rls.sql` | `current_user_can_inventory`, `inventory_item_branch_id`, privileges, RLS (SELECT only), cost column grant | 012 |
| 014 | `014_inventory_rpcs.sql` | 10 public RPCs, internal helpers, replaces `create/edit/cancel_sales_report` | 011, 012, 013 |

Rollback notes are in each file. Sign-off before staging: run
`supabase/tests/inventory_security.test.sql` on a **local** Supabase reset.
