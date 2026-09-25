# V4 Local-First Execution and Controlled Cutover Roadmap

Status anchor: `v4-2027` at `24770ca1e84540ef8e552891022ce9a6fe314b26`.

Decision date: 2026-09-26. The two available free Supabase projects are active
and operationally important. V4 will therefore stay on Supabase, complete its
remaining development and regression work against the real local Supabase
stack, and use the existing cashier Supabase project only during a separately
approved, controlled production cutover. No paid staging project is planned.

This roadmap authorizes planning and local development only. It does not
authorize access to or mutation of production, a deployment, a maintenance
window, a commit, or a push.

## Operating rule

Claude Code receives this whole roadmap for context but executes exactly one
stage at a time. Every stage ends with evidence and an explicit approval gate.
Do not begin the next stage, commit, push, touch `main`, use the old stash, or
access production unless the current prompt explicitly authorizes that exact
action.

Each stage must:

1. Verify branch, HEAD and working-tree state before work.
2. Read `CURRENT_STATE.md`, `DECISIONS.md`, `MIGRATION_PLAN.md`, `BACKLOG.md`,
   the latest validation report and this roadmap.
3. Keep demo mode isolated and keep all non-demo local development pointed at
   the local Supabase stack. The current gitignored `app/.env.local` points at
   production and must not be used for local development.
4. Preserve secrets outside Git and never print service-role keys or tokens.
5. Run the checks appropriate to the stage and retain concise reproducible
   evidence.
6. Stop at the stage gate and report result, changes, tests, risks, rollback
   state, git status and the next approval required.

## Stage 1 — Real login integration on local Supabase

Purpose: replace the non-demo "not ready" login path with the already locally
validated `pin-login` flow, without contacting a hosted project.

Scope:

- Create a local-only non-demo environment configuration. Never copy or expose
  production keys.
- Add a typed frontend service for `pin-login` and connect `LoginPage` to it.
- Pass returned access and refresh tokens to `supabase.auth.setSession()`.
- Cover loading, generic invalid-credential response, lockout, network error,
  session restoration, refresh and logout.
- Preserve Preview-only demo mode and prove it makes zero Supabase requests.
- Run real browser flows against local GoTrue/PostgREST/Edge Runtime for owner,
  manager, branch_manager, cashier and employee.

Gate 1: all local login/session/error flows pass; no secret is logged or
bundled; full app regression passes; production remains untouched; review and
explicit approval precede Stage 2.

## Stage 2 — Management Center and local user provisioning

Purpose: allow authorized managers to operate identity and configuration
without dashboard SQL or service-role credentials in the browser.

Scope:

- Provision employees only through a trusted server-side function.
- Activate/deactivate employees, set employee code, reset PIN, assign/revoke
  roles and manage branch memberships.
- Manage branch/shift settings and supported tolerances.
- Provide owner/manager audit views for critical actions.
- Enforce role hierarchy, branch boundaries and self-modification protections.
- Record actor, server time, reason and before/after values for critical
  mutations.

Gate 2: all workflows and denial cases pass against a fresh local reset; no
service-role material reaches the browser; full regression passes; explicit
approval precedes Stage 3.

## Stage 3 — Realistic local catalog and operating configuration

Purpose: replace invented demo fixtures with owner-approved operating data in
the local stack before production is contacted.

Required inputs include real branches and shifts, temporary user assignments,
product codes/names/units, sales mappings, opening stock, effective-dated
costs, waste reasons, register definitions and reconciliation thresholds.

Rules:

- Keep development fixtures separate from the eventual production loader.
- Make loading idempotent and report created/updated/skipped/rejected rows.
- Do not use production PINs or unnecessary personal data.
- Re-run complete daily-operation flows after every catalog revision.

Gate 3: realistic local daily operation and data-quality checks pass; business
owner approves the catalog and operating rules.

## Stage 4 — Legacy reconciliation and migration rehearsal

Purpose: finish the transformation logic locally before requesting any
production access.

- Build the documented legacy adapter and migration code.
- Keep identity migration secure; never carry plaintext legacy PINs forward.
- Make migration idempotent, resumable and auditable.
- Rehearse against sanitized/local snapshots with row counts, control totals,
  rejected rows and rollback behavior.
- Reproduce the known 2026 reference totals or classify every difference.

Any production read-only metadata or data export requires a separate prompt
that names the production project and the exact allowed queries. No production
access is implied by this roadmap.

Gate 4: repeatable local rehearsals produce identical results and all material
differences are explained or explicitly accepted.

## Stage 5 — Production readiness and maintenance package

Purpose: produce a concrete, reviewable cutover package before the first
production action.

After separate authorization, perform production read-only inventory and
collision checks. Prepare:

- Full database and Storage backup instructions plus a verified restore path.
- Exact migration/function/frontend commit SHAs.
- Maintenance window, entry freeze, owners, communications and rollback
  thresholds.
- Target guards that reject every project ref except the explicitly approved
  cashier production ref and require repeated human-readable confirmation.
- A side-by-side plan: retain legacy tables and frontend; add V4 objects; never
  reset production; never use destructive cleanup as rollback.
- Production-safe smoke tests that do not create undeletable fake audit data.
- Legacy frontend rollback and new frontend activation steps.

Gate 5: the package is reviewed, backup/restore evidence exists, exact downtime
is agreed and Metehan gives a new explicit approval immediately before the
first production mutation.

## Stage 6 — Controlled production deployment and limited pilot

Purpose: apply the locally proven system during a short maintenance window,
then expose it first to a small operational group.

Only after the Stage 5 approval:

1. Freeze legacy entries and record the final control totals.
2. Take and verify database and Storage backups.
3. Re-check the production project identity.
4. Apply migrations 001–015 without dropping or renaming legacy objects.
5. Deploy only the reviewed V4 functions and configuration.
6. Run production-safe Auth/PostgREST/RLS/Storage/PIN/timezone smoke tests.
7. Enable the new frontend for a small named pilot group.
8. Validate actual devices, networks, login, shift, report, inventory, avatar,
   session expiry and interrupted-request recovery.
9. Roll back to the legacy frontend when any defined threshold is crossed.
10. Expand access only after an explicit pilot go/no-go decision.

Target service interruption is a few hours in the cutover window, not the full
development period. The legacy application remains available until this stage.

## Stage 7 — Stabilization, migration completion and legacy retirement

Purpose: monitor the new system, finish accepted historical migration and
retire legacy components only after a stability window.

- Reconcile daily control totals and audit privileged actions.
- Resolve pilot defects and monitor Auth/Function/database logs.
- Complete approved legacy data migration in repeatable batches.
- Keep legacy tables, public avatar bucket and frontend intact until a separate
  retirement approval.
- Treat deletion, irreversible conversion and legacy shutdown as separate
  approved actions.

## Claude Code master prompt contract

Use this contract at the top of every stage prompt:

> Work in `Rumeli-iskelesi-yonetim` on `v4-2027`. Read
> `docs/HOSTED_EXECUTION_ROADMAP.md`, `CURRENT_STATE.md`, `DECISIONS.md`,
> `MIGRATION_PLAN.md`, `BACKLOG.md` and the latest validation report first.
> Execute only the named stage. Do not begin later stages. Do not access or
> mutate production unless this prompt names the exact production project,
> exact allowed actions and explicit approval. Do not touch `main` or
> `laptop-old-phase-c-before-sync`. Do not expose secrets. Keep non-demo local
> work pointed at local Supabase. Complete all reviewable work and tests, then
> stop at the stage gate. Do not commit or push unless explicitly authorized.
> Report changes, test evidence, environment, risks, rollback state, git status
> and the exact approval needed next.
