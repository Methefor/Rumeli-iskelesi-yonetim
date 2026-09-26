# Local Management Center validation - 2026-09-26

Scope: Stage 2 only, real local Supabase (Docker). Hosted/staging/production:
NOT DONE, not contacted. No commit or push.

## Backend (fresh `supabase db reset --local --no-seed`, 001-016)
- timezone_regression, timezone_rpc (32), inventory_security, backdated_entry,
  backdated_entry_timezone (24): pass.
- management_center.test.sql (real Postgres roles): pass.
- local_inventory_api.mjs 137, storage_policy 48, pin_login 45,
  management_center.test.mjs 76: pass (each on its own fresh reset).

## App
- typecheck, lint clean; 240 tests pass; `build:local` succeeds.
- dist scan: 0 production-ref / service_role matches. `git diff --check` clean;
  no keys or production ref in changed files.

## Browser (local stack, fake L001-L007 users, `.invalid` emails)
- Manager flow: create via real function, PIN reset, deactivate/activate
  (old and new PIN refused while inactive), threshold edit, audit view.
- 360x740: no horizontal overflow on management home, employees, create,
  detail (with reason sheet), settings, audit; inputs >= 16px.

## Known limits
- Owner/branch_manager/cashier/employee flows are covered by SQL, HTTP and
  demo integration tests rather than a full manual browser run.
- No lateness-tolerance column exists; demo owner/branch_manager are
  non-login demo records; hosted validation is still required.

## Independent review correction

The post-implementation review found that the first migration draft allowed an
owner to grant or provision another owner even though the documented hierarchy
requires the actor to outrank the granted role. Migration 016 now rejects
equal-rank grants/provisioning, verifies the actor's explicit employee-management
permission as well as rank, and targets the avatar write policies with
`TO authenticated` instead of the deprecated `auth.role()` predicate. A
fresh reset, the SQL role suite and the 76-assertion real HTTP suite pass after
the correction.
