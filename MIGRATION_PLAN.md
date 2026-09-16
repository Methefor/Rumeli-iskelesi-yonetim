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

Each file's own header comment repeats its dependencies and a rollback
snippet — this table is a summary, the files are the source of truth.

## What is explicitly NOT in these migrations

- No change to any legacy table (`admins`, `cashiers`, `daily_reports`,
  `daily_revenue`, `entry_history`, `shift_schedule`, `targets`) or the
  existing `avatars` bucket.
- No data migration (legacy `cashiers`/`admins` rows → `profiles`). That is
  a separate, explicitly-approved script, written after 001-007 are
  reviewed and applied to a staging project — not bundled here so a schema
  review and a data-migration review can happen independently.
- No Phase D operational tables (shifts, sales_reports, tasks, performance,
  badges, inventory) — see `RLS_PLAN.md` "Future operational tables" for
  the design template those will follow.
- The `service_credentials` mechanism the `pin-login` Edge Function needs
  (see `AUTH_ARCHITECTURE.md` "Open design item") — not written as a
  migration yet, needs its own review.

## How to review

1. Read each file top-to-bottom — every file has a header explaining
   purpose, dependencies, and rollback.
2. Check `RLS_PLAN.md` for the full policy rationale per table/role.
3. Check `AUTH_ARCHITECTURE.md` for how `pin_credentials`/`verify_pin` fit
   into the actual login flow (they're necessary but not sufficient on
   their own — the Edge Function and `service_credentials` are still open).
4. Confirm nothing here references or writes to a legacy table name.

## How to apply (once approved — not yet)

Intended path, in order, against a **staging** Supabase project first, not
production directly:

```bash
supabase link --project-ref <staging-project-ref>
supabase db push
```

`supabase db push` applies migration files in filename order, which is why
they're numbered `001`-`007` rather than timestamped — the numeric prefixes
enforce the dependency order in this table regardless of file creation
date. After staging verification, repeat against the production project
only with explicit sign-off.

Do not apply via the Supabase dashboard SQL editor as a substitute for
`db push` unless doing so file-by-file in the same order — the dashboard
editor does not track which migrations have run.

## Rollback strategy

Each file documents its own rollback (drop statements in dependency-safe
reverse order). Applying and rolling back should be exercised on staging
before production ever sees these files. Because 001-007 create entirely
new tables/functions/policies with no foreign keys into any legacy table,
a full rollback of all seven is non-destructive to legacy data by
construction — but always confirm with `git diff`-style review of the
actual staging schema state before trusting that in the moment.

## Coexistence with legacy

Legacy and V4 run against the same Supabase project but disjoint tables
during Phases C-K. Legacy keeps working unmodified. V4 features (Phase E
onward) read/write only the new schema. See `CURRENT_STATE.md` and
`RLS_PLAN.md` "Legacy transition."

## Sign-off checklist before applying to staging

- [ ] Someone other than the author has read all 7 files.
- [ ] `RLS_PLAN.md`'s policy table matches what's actually in `006`.
- [ ] Confirmed via `\d` or the dashboard schema view that no table/function
      name in 001-007 collides with an existing legacy name.
- [ ] Staging project exists and is not the production project.
- [ ] A rollback has been test-run on staging at least once.

## Sign-off checklist before applying to production

- [ ] All of the above, on staging, with no issues found.
- [ ] `AUTH_ARCHITECTURE.md`'s open items (login-handle column,
      `service_credentials`) have a decision, even if not yet implemented.
- [ ] Explicit user approval for this specific step, separate from the
      approval to prepare these files.
