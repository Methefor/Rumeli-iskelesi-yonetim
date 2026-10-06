# Decisions

Architectural decisions for the V4 rebuild, with the reasoning, so later
phases don't silently re-litigate them.

## Build the new app alongside the legacy one (`app/` subdirectory)

**Decision:** V4 lives in `app/`, not in a replacement of the root files.
**Why:** the root files are in active production use with real 2026 data;
they must keep working unchanged until V4 is validated and a cutover is
explicitly approved (Phase L). Building alongside, rather than in place,
makes "don't touch legacy files" mechanically enforceable rather than a
discipline problem.

## No CSS framework — plain CSS Modules over a token system

**Decision:** `src/styles/tokens.css` defines the color/spacing/radius/
shadow/typography/motion scale as CSS custom properties; components use
CSS Modules that reference those tokens.
**Why:** the brief asks for a small dependency footprint and a consistent
token system. A utility framework (Tailwind etc.) is a defensible
alternative but wasn't required, and CSS Modules + tokens gets the same
consistency with one fewer dependency and no build-time class-scanning
step to reason about.

## ESLint + Prettier instead of the Vite-default oxlint

**Decision:** removed the `oxlint` the Vite scaffold installs by default;
configured ESLint (flat config, typescript-eslint, react-hooks,
react-refresh) + Prettier instead.
**Why:** explicitly requested in the Phase B brief ("Configure ESLint and
formatting"). oxlint is fast but younger/less configurable; ESLint's rule
ecosystem is what the brief asked for.

## Legacy PIN-login pattern is NOT ported into `services/supabase`

**Decision:** `services/supabase/client.ts` creates a Supabase client and
nothing else. `features/auth` is an empty placeholder in Phase B.
**Why:** the Phase A audit found the legacy login runs
`supabase.from('cashiers').eq('pin', <plaintext PIN from browser>)`
directly from client JS, with no Supabase Auth session — identity then
travels as a forgeable `?cashier_id=` URL parameter, and the admin
dashboard has no session guard at all. The brief explicitly prohibits
storing PINs in plaintext, using URL params as auth, and relying on
frontend-only authorization. Reproducing this pattern in the new codebase,
even temporarily "to keep moving," would recreate the exact vulnerability
Phase C exists to remove. Real Supabase Auth + hashed PIN is Phase C's job
specifically, once DB-side RLS/schema has been inspected.

## Revenue is not the primary performance metric

**Decision:** `domain/scoring` scores configurable dimensions (on-time
reporting, closing completeness, etc.) via `PerformanceEvent` +
`ScoringRule`; there is no revenue input anywhere in the scoring
calculation.
**Why:** explicit in the brief — revenue is heavily affected by weather,
seasonality, events, and shift timing, none of which are under an
individual employee's control. This mirrors legacy's own intent (its
scoring already excluded raw revenue from the on-time/complete point
calculation) but makes it structural instead of incidental.

## X/Z revenue logic lives in one function, not duplicated per screen

> **SUPERSEDED 2026-10-07:** `calculateDailyRevenue` and `calculateEveningIncrement` were removed; the binding rule is now Z exactly per business day (X provisional, never X + Z). See the 2026-10-07 Phase 1A entry at the end of this file.

**Decision:** `domain/revenue/calculateShiftRevenue.ts` owns
`calculateEveningIncrement` (Z − X, floored at 0) and
`calculateDailyRevenue`. Every future screen must import these, never
re-derive the subtraction.
**Why:** the Phase A audit found this exact arithmetic duplicated across
`supabase-client.js`, `admin-dashboard.html` (~25 call sites), and
`cashier-dashboard.html` (~17 call sites) in the legacy app, with no shared
implementation and no tests. The brief explicitly requires "a single shared
domain function... covered by tests" for this calculation.

## Shift on-time evaluation takes a resolved `Date`, not a bare "HH:mm" string

**Decision:** `domain/shifts/evaluateOnTime.ts` resolves a shift's cutoff
to a concrete `Date` for the given business date (via `cutoffDayOffset`)
before comparing to `submittedAt: Date`.
**Why:** a first draft compared raw clock strings ("00:45" vs a "01:00"
cutoffs marked `cutoffIsNextDay`), which can't distinguish "00:45 tonight"
from "00:45 two nights ago" — a real correctness bug for shifts that cross
midnight, caught by writing the test for it. Resolving to a timestamp
against a known business date removes the ambiguity entirely.

## `.gitignore` fix: stop excluding `package.json`/`package-lock.json`

**Decision:** removed the blanket `package.json` / `package-lock.json`
rules from the root `.gitignore`.
**Why:** those rules (likely a leftover from a much earlier prototype) would
have silently excluded `app/package.json` and `app/package-lock.json` from
git — directly breaking the Phase B requirement to commit a lockfile. This
is a tooling-config fix, not a change to any legacy production file.

## Phase C: PIN login mints a real session via password-grant, not a custom JWT

**Decision:** the `pin-login` Edge Function design (prepared, not deployed)
verifies the PIN via a `SECURITY DEFINER` RPC, then signs in as the user
using `supabase.auth.signInWithPassword` with a per-profile, randomly
generated password stored server-side only, rather than hand-signing a
GoTrue-shaped JWT.
**Why:** minting a session is GoTrue's job, not Postgres's — there's no
supported way to fabricate a valid session token from inside a SQL
function. Password-grant uses only a public, documented Supabase Auth API
end to end; custom JWT signing would work too but means safely handling the
project's JWT secret inside function code and tracking any future
key-rotation, for no functional benefit here. See `AUTH_ARCHITECTURE.md`
"Why an Edge Function is required" for the full comparison.

## Phase C: `pin_credentials` gets RLS enabled with zero policies

**Decision:** rather than writing a restrictive-but-present policy on
`pin_credentials`, the table has RLS enabled and *no policies at all*.
**Why:** with RLS enabled and zero policies, PostgREST denies every
operation to both `anon` and `authenticated` unconditionally — there is no
policy logic that could later be loosened by mistake. The only access path
is the `verify_pin()` RPC, which is itself only executable by `service_role`
(never granted to `authenticated`), so the PIN hash is unreachable from any
client context by construction, not by policy discipline.

## Phase C: new `avatars-v4` storage bucket instead of tightening `avatars` in place

**Decision:** V4's secure avatar policies target a new `avatars-v4` bucket;
the existing public `avatars` bucket (which the audit confirmed has anon
SELECT and INSERT) is left completely alone.
**Why:** the legacy app depends on exactly that public/anon-writable
behavior for its own avatar uploads. Restricting `avatars` now would break
a live production feature before cutover — directly contradicting this
phase's "do not break the legacy application" constraint and the general
"legacy policies remain untouched initially" transition principle.

## Phase C: RLS helper functions take no target-user parameter

**Decision:** every helper function used inside RLS policies
(`current_user_role_keys()`, `current_user_has_permission()`,
`current_user_branch_ids()`, `current_user_is_owner_or_manager()`) operates
implicitly on `auth.uid()` and accepts no user-id argument.
**Why:** a version that accepted `p_user_id` would let any authenticated
caller invoke it against an arbitrary other user's id from client code
(e.g. via `.rpc('current_user_role_keys', { p_user_id: someoneElse })`),
turning a helper meant only for policy internals into an accidental
role/branch-membership oracle for the whole user base. Removing the
parameter removes the vulnerability class entirely rather than relying on
callers to "just not do that."

## Security review (2026-09-17): `profiles` self-update restricted by column-level GRANT, not RLS alone

**Decision:** `revoke update on public.profiles from authenticated;` then
`grant update (full_name, phone, avatar_url) on public.profiles to authenticated;`
in `006_rls_policies.sql`, alongside (not instead of) the row-level policies.
**Why:** the original `profiles_update_self_limited` policy was
`using (id = auth.uid())` with no column restriction — a user could update
*any* column on their own row, including `is_active` and (once added)
`employee_code`. Postgres RLS `USING`/`WITH CHECK` clauses are row-scoped
only; they cannot express "this row, but only these columns." Postgres's
column-level privilege system is the correct tool for that and is a
first-class, well-supported feature — not a workaround. `is_active` and
`employee_code` are excluded from the grant entirely; the only way to change
them is a `SECURITY DEFINER` RPC (`008_admin_rpcs.sql`), which runs as the
function owner and so is unaffected by the caller's own column grants.

## Security review (2026-09-17): `branch_manager` gets `employee.manage_branch`, not `employee.manage`

**Decision:** added a new permission `employee.manage_branch`, granted to
`branch_manager` in place of the previous `employee.manage` grant. Every RLS
policy and RPC that checks it also checks
`current_user_shares_branch_with(target_user_id)` (new helper,
`005_auth_helpers.sql`).
**Why:** `employee.manage` is a boolean permission with no row context — a
policy gated only on `current_user_has_permission('employee.manage')`
returns the same answer for every row, so a branch manager for Branch X
could read/write employee records in Branch Y. This is exactly the kind of
bug a permission-only (role-based) authorization model produces once any
role needs to be scoped to a subset of rows; the fix pairs the permission
check with an explicit relationship check (shared branch membership) on
every policy/RPC that uses it, rather than trying to make the permission
system itself branch-aware.

## Security review (2026-09-17): critical writes are RPC-only, not raw-write-with-permission-check

**Decision:** removed the raw `for all using (current_user_has_permission(...))`
write policies on `user_roles` and `branch_memberships`
(`006_rls_policies.sql`). The only way to change either table now is through
the audited `SECURITY DEFINER` RPCs in `008_admin_rpcs.sql`
(`assign_role`/`revoke_role`/`assign_branch_membership`/`remove_branch_membership`),
which also cover `admin_set_employee_active`, `admin_reset_pin`, and
`admin_set_employee_code` for the equivalent `profiles`-column cases.
**Why:** a permission-gated raw write policy can only express "does the
caller hold this permission," never a role hierarchy — there was nothing
stopping a `manager` from granting `owner`, or a `branch_manager` (once
scoped to `employee.manage_branch`) from granting a role to a user outside
their branch, because RLS has no vocabulary for "and also enforce this
business rule about which role may grant which other role." A
`SECURITY DEFINER` function can encode that hierarchy directly in code and
guarantees an `audit_logs` row is written on every change — a raw table
write policy could easily be used correctly by a well-behaved client and
still leave no trace if any future client (or a manual `supabase.from(...)`
call) bypassed the intended RPC path.

## Security review (2026-09-17): `service_credentials` rejected in favor of `generateLink` + `verifyOtp`

**Decision:** the `pin-login` Edge Function no longer stores or reads a
per-profile password anywhere. It calls
`adminClient.auth.admin.generateLink({ type: 'magiclink', email })` followed
by `anonClient.auth.verifyOtp({ type: 'magiclink', token_hash, email })`,
both server-side, to obtain a real session.
**Why:** `service_credentials` would have required a service-role-only table
holding a plaintext-equivalent, readable password per employee — its own
generation scheme, rotation policy, and access-control review, all to solve
a problem (mint a session for a verified user, server-side) that
`generateLink`/`verifyOtp` already solves with zero stored secrets, using
only public Supabase Auth Admin/Auth API calls. See `AUTH_ARCHITECTURE.md`
"Why an Edge Function is required" for the full comparison, including the
"not live-verified, deployment blocked pending a staging smoke test" caveat
— this flow is believed correct from documented Supabase behavior but has
not been exercised against a real project in this session.

## Security review (2026-09-17): `employee_code` is the login handle, not `legacy_cashier_id`

**Decision:** added `profiles.employee_code` (unique, format
`^[A-Z][0-9]{2,4}$`, e.g. `M001`/`K002`/`D001`) as the resolved login handle,
closing the "Open question" `AUTH_ARCHITECTURE.md` previously left open.
Client-writable only through `admin_set_employee_code()`
(`008_admin_rpcs.sql`) — excluded from the self-service column grant above.
**Why:** `legacy_cashier_id` is explicitly documented (see its column
comment in `001_profiles_roles.sql`) as traceability-only, for joining
historical `daily_reports` rows during the transition — reusing it as a
login handle would couple authentication to a legacy foreign key that Phase
D's data migration may need to remap or leave null for accounts that never
existed in the legacy system (e.g. a newly hired owner/manager account
created directly in V4).

## Local staging smoke test (2026-09-17): schema-qualify pgcrypto calls inside SECURITY DEFINER functions

**Decision:** `verify_pin()` (`005_auth_helpers.sql`) and `admin_reset_pin()`
(`008_admin_rpcs.sql`) now call `extensions.crypt(...)`/`extensions.gen_salt(...)`
instead of the unqualified `crypt`/`gen_salt`.
**Why:** running the prepared migrations against a real local Supabase stack
(not just reading the SQL) surfaced a genuine failure: pgcrypto is installed
into the `extensions` schema on Supabase (local and hosted alike), and both
functions pin `search_path = public` as a SECURITY DEFINER hardening
measure — which excludes `extensions`, so `crypt()` was unresolvable and
every PIN check failed with `function crypt(text, text) does not exist`.
This was invisible to static review because the SQL is syntactically valid
and only fails at call time against a real Supabase-shaped database. Lesson
generalized in the code comment: never rely on `search_path` for extension
functions inside a `SECURITY DEFINER` body — always schema-qualify.

## Local staging smoke test (2026-09-17): `verifyOtp` must be called with only `token_hash` + `type`

**Decision:** `pin-login/index.ts`'s `verifyOtp` call no longer passes
`email` alongside `token_hash`.
**Why:** the live smoke test showed supabase-js's `verifyOtp` rejects the
call outright (400, "Only the token_hash and type should be provided") when
both `token_hash` and `email` are given — they are alternative, mutually
exclusive verification inputs in the SDK, not additive fields. The original
design (written from documented behavior, never executed) passed both,
so every login attempt failed at the last step with a generic
`sign_in_failed`. Confirmed by isolating the call: `token_hash` + `type`
alone mints a correct session; adding `email` breaks it. This is exactly
the class of defect `AUTH_ARCHITECTURE.md`'s "not live-verified" caveat
was flagging, and exactly why the smoke test was required before treating
the design as production-ready.

## Phase D: cross-referencing RLS policies need SECURITY DEFINER helpers, not direct subqueries

**Decision:** `shifts`' select policy checks `shift_assignments` (is the
caller assigned to this shift?) and `shift_assignments`' select policy
checks `shifts` (what branch is this assignment's shift in?) — both via new
`SECURITY DEFINER` helpers (`current_user_assigned_shift_ids()`,
`shift_branch_id()`, `010_operational_rls.sql`), not a direct subquery
against the other table.
**Why:** a direct subquery re-enters the other table's own RLS policy,
which re-enters this one — Postgres detects this as infinite recursion
(`42P17`) rather than looping forever, and every read on either table
fails. This was found only by a live browser smoke test hitting
`/rest/v1/shifts` (a 500 with that exact error code) — the SQL in both
policies is individually valid and passed migration application without
error; only combining them at query time exposes the cycle. `SECURITY
DEFINER` functions run as the function owner and bypass RLS on their own
internal query, the same mechanism Phase C's `current_user_branch_ids()`
already relies on — this generalizes that fix to any future pair of tables
whose RLS policies need to reference each other.

## Phase D: reconciliation "expected/actual" means "declared total vs. item sum"

**Decision:** `create_sales_report()`/`edit_sales_report()`
(`011_operational_rpcs.sql`) compute `reconciliation_status` by comparing
the report's declared `gross_revenue` (expected) against the sum of its
`sales_report_items.amount` (actual), against per-branch thresholds in
`reconciliation_thresholds`.
**Why:** the brief's `expected/actual/difference/status` shape is generic
by design (see `RLS_PLAN.md`'s original "Future operational tables"
template), and needed one concrete interpretation to actually build. This
one mirrors what the legacy app's own "kasa dağılımı" (cash distribution)
checks were already informally verifying — a category breakdown should sum
to the register total; anything else is either a data-entry mistake or a
real cash discrepancy, and both deserve the same flag. See
`SALES_MODEL.md`.

## Phase D: `create_sales_report`'s duplicate check is both an explicit RPC pre-check AND a DB constraint

**Decision:** the RPC raises a friendly, specific error before insert;
`009_operational_core.sql`'s two partial unique indexes
(`sales_reports_unique_no_register`/`_with_register`) are the actual
authoritative guarantee.
**Why:** the pre-check alone would have a TOCTOU gap under concurrent
submissions (two requests both pass the check, both insert); the
constraint alone would surface as a raw, unfriendly Postgres unique-
violation error to the client. Both together: correct under concurrency,
and a clear message in the common case. Same reasoning as `verify_pin()`'s
`for update` row lock in Phase C, applied to a different concurrency shape.

## Phase C: guards fail closed on missing authorization data, not open

**Decision:** `RoleGuard`/`BranchGuard` show `Unauthorized` when `roles`/
`branchIds` are empty — including the current, expected state where the
Phase D schema doesn't exist yet and every real session has empty arrays.
**Why:** the alternative (treat "we don't know your role yet" as "let them
through") would make every guarded route wide open the moment real login
exists but before roles are populated — precisely the kind of silent
security regression this phase exists to prevent. Failing closed means a
route only ever opens once its authorization data is actually correct, at
the cost of every guarded route being inaccessible until Phase D's schema
is live — an acceptable, visible gap, not a hidden one.

## Phase E (2026-09-21): inventory decisions

* **Append-oriented ledger + REVERSAL**, no UPDATE/DELETE anywhere; signed
  `stock_delta` set server-side. Corrections are audited reversals/adjustments.
* **Counts never rewrite stock.** Variance is recorded against a server-side
  theoretical snapshot; only an explicit audited adjustment moves the ledger.
* **Revenue != quantity.** Sales lines get optional `inventory_item_id` +
  explicit `inventory_quantity` (not a separate table, so revenue and quantity
  of one product stay together); a category is category-level XOR product-level
  within one report.
* **Effective-dated, append-only cost** (must be later than the latest; <=30
  days ahead) + per-movement snapshot; NULL snapshot means unknown, not zero.
* **Cost confidentiality via column grant** (`unit_cost_snapshot` excluded) and
  a cost-gated RPC; branch_manager reads cost but cannot set it.
* **Gross profit only**, shown partial/unavailable when unmapped or uncosted.
* **Sell-through denominator** = opening + received + adjustment-in (see `INVENTORY_MODEL.md`).
* **Closing workflow**: sales report + count required, waste optional (no fake
  "no waste" confirmation is stored). No task subsystem.
* **Demo mode via a data facade** (`services/data`), one deterministic store;
  demo authorization mirrors roles but is not a security boundary.
* **Employee cannot receive stock** (per brief); revisit with the business.
* **Docker missing**: a scratch PGlite harness was used as a *substitute*,
  reported as not equivalent to local Supabase.


###  2026-09-22 — cashier direct inventory corrections, owner oversight

Metehan explicitly selected own-branch stock adjustment, non-sale movement reversal and count void for cashiers, without per-action owner approval. This supersedes the proposed manager-only direct-action model in the 2026-09-21 validation report. Mandatory reason, actor, server time, before/after audit and branch boundaries remain required. Costs and unassigned-shift privilege are not expanded. Owner/manager receives a read-only inventory audit view. Prepared/local only; production rollout not authorized. Count void continues to preserve linked adjustments; UI explains this.

**Superseded the same day — see below.**

### 2026-09-22 (later) — cashier grant rolled back; final inventory authorization scope

The above cashier grant is reverted. Explicit written approval from the user set the final scope instead:

* **cashier / employee**: `inventory.read`, `inventory.record` (waste), `inventory.count` — own branch, nothing else. No `inventory.adjust`, no `reverse_inventory_movement`, no `void_inventory_count`, no cost access, no receive. Identical treatment for both roles — the cashier-specific carve-out is gone.
* **branch_manager**: unchanged — read/receive/waste/count/adjust/item.manage/cost.read in their own branch(es); `inventory.adjust` covers `record_inventory_adjustment` (mandatory reason, audited, append-only) and `void_inventory_count` (mandatory reason, audited, does not reverse stock or linked adjustments).
* **branch_manager loses `reverse_inventory_movement`** — this is the one substantive change from the original Phase E design, not just a rollback of the cashier grant. Movement reversal is now owner/manager only; `reverse_inventory_movement` additionally requires `current_user_is_owner_or_manager()`.
* **manager / owner**: unchanged, full scope including reversal.

Rationale: reversal is the one inventory action that erases the practical effect of an earlier movement outright (append-only in the ledger, but functionally undoing a colleague's or one's own entry) — narrower than a bounded, reasoned adjustment or a count void that leaves the linked adjustment untouched. Keeping it owner/manager-only while still letting branch_manager self-serve adjustments and count-voids balances day-to-day autonomy against the fact that a wrong reversal is the hardest of the three to catch after the fact from the ledger alone.

Updated: `012_inventory_core.sql` (permission grant), `014_inventory_rpcs.sql` (`reverse_inventory_movement` authorization), `app/src/domain/inventory/permissions.ts` (+ new `isOwnerOrManager` UI-mirror helper), `app/src/features/inventory/hooks.ts` (`canReverseMovement`), `MovementHistoryPage.tsx`, `ClosingCountPage.tsx` (copy), `services/demo/api.ts`, SQL test suite (`inventory_security.test.sql`, new section E2), `local_inventory_api.mjs` (rewritten adjust/reverse/void flow, 137 assertions), app unit/demo tests. Re-validated on a fresh real local Supabase reset: all SQL/timezone/Auth-PostgREST suites and the full app suite (165 tests) pass. Still prepared/local only; no hosted or production change; not committed at the time this entry was written.

### 2026-09-24 — backdated-entry policy: calendar date, owner/manager override

Per explicit user instruction: sales reports (create + edit) are now limited, server-side, to today and the previous 3 Europe/Istanbul **calendar** dates for cashier, employee and branch_manager — explicitly NOT a rolling 72-hour window, and explicitly not satisfied by branch_manager's existing `sales.edit_all` (that permission still bypasses the unrelated same-day cutoff, unchanged). A future business_date is always denied, for every role, with no override — there is no legitimate reason to enter data for a date that hasn't happened. Owner/manager may go further back, but only with an explicit, mandatory reason, audited under its own action (`sales_report_backdated_override`) distinct from the ordinary `report_edit` row, so an auditor can find every override without wading through routine edits.

Implementation choice: one new optional parameter on `create_sales_report` (`p_backdated_reason`, defaults null so every existing caller is unaffected) plus a body change to `edit_sales_report` (which already had a mandatory `p_reason`, reused rather than duplicated) — not a second "admin override" RPC. A parallel RPC for the same table/shape as the primary one duplicates authorization logic and invites drift (the Phase E inventory adjust/reverse split already showed this is worth avoiding where the primary RPC can absorb the distinction cleanly). `cancel_sales_report` is deliberately untouched: cancelling removes data rather than inserting new backdated financial data, and the brief scoped this to create/edit.

New migration `015_sales_backdated_policy.sql` rather than editing 011/014 in place, since this is a genuinely new rule layered on top of already-validated behavior, not a bugfix to it.

### 2026-09-24 — Storage/Edge Function: real executable tests, one real bug found

First real (not SQL-inspection) test of the local Storage API and the `pin-login` Edge Function. The Storage test found a genuine bug that reading `007_storage_policies.sql` would not have caught: Supabase's local Storage API implements a file "replace" (PUT) as `INSERT ... ON CONFLICT DO UPDATE`, so Postgres RLS enforces the **INSERT** policy's `WITH CHECK` for that statement — not just the UPDATE policy that was clearly written to carry the `employee.manage` manager-override. `avatars_v4_insert` was missing that override, so a manager attempting to replace another employee's avatar was silently rejected. Fixed by adding the same `employee.manage` check to `avatars_v4_insert`. Documented rather than further restricted: this also lets a manager/owner upload a brand-new avatar under someone else's path, not just replace an existing one — an acceptable, disclosed superset of "manager override," not a narrower one Postgres RLS can easily express without an extra existence check.

The Edge Function test needed no fix — every listed check (identity via employee_code only, identical generic-failure shape across every failure reason, a 5-way concurrent-request lockout race producing exactly one audit row, session issuance/refresh, and confirmation via the local Mailpit catcher that no email is ever actually sent) passed as designed. See `docs/LOCAL_VALIDATION_2026-09-24.md` for the full access matrix and assertion counts.

## 2026-09-26 — local-first completion and controlled direct production cutover

**Decision:** Keep Supabase. Do not create a paid staging project and do not
repurpose either of the two active Free Plan projects. Complete real login,
Management Center, realistic catalog/configuration and migration rehearsals
against the real local Supabase stack. When those gates pass, use the existing
cashier Supabase project only through a separately approved maintenance-window
cutover.

The production change must be side-by-side: retain the legacy tables, Storage
objects and frontend while adding V4 objects; never reset production and never
use destructive cleanup as rollback. Production read-only inspection, backups,
the first migration/function deployment, frontend activation and later legacy
retirement each retain their own explicit approval gates. The legacy
application remains available during development; expected interruption is
limited to the final controlled cutover window.

**Why:** both free hosted projects are important and cannot be paused. Changing
backend platforms would require rewriting Supabase Auth, RLS, PostgREST/RPC,
Storage and Edge Function work that is already locally validated. A temporary
paid staging project is deferred to avoid cost. The accepted tradeoff is that
hosted-only behavior is first verified during the controlled production window,
mitigated by full local validation, verified backups, target guards, a small
pilot group and immediate frontend rollback.

### 2026-09-26 - Client authorization fails closed; local env guard

`fetchAuthorizationContext` returns `active:false` on any lookup error, a
missing/deactivated profile, or a user without a role, and `AuthProvider`
discards the session (sign out) instead of treating "nothing known" as
"logged in with no permissions". Real login uses one generic credential
message for every authentication failure. Local development for real login
uses gitignored higher-priority env files plus a guard script that aborts
unless the effective Supabase host is local, because a developer
`app/.env.local` may point at production.

### 2026-09-26 - Server-side inactive-user blocking and management hierarchy

Deactivation is enforced in the database, not only by client logout: the
`current_user_*` helpers require an active profile, and `enforce_active_user`
runs as PostgREST `db_pre_request` for every request (Storage bypasses
PostgREST, so its avatar policies check activity directly). Deactivation also
bans the auth user and deletes their sessions. Management actions use a strict
rank rule: the actor must outrank the target and the granted role; owners are
never modifiable through RPCs, self changes are refused, the last active owner
is protected, and every action needs a reason and is audited. Employees are
created only through the `employee-provision` Edge Function, never from the
browser with a service key.

### 2026-09-26 - Operating data: provenance, approval and a local-only loader

Business configuration carries provenance (confirmed / legacy_observed /
demo_only / unknown) and approval (approved / pending / rejected). Only approved
confirmed or legacy_observed rows are applied; pending rows are skipped;
demo_only in the real dataset and unknown-but-approved rows are rejected. The
loader is local-only, dry-run by default, all-or-nothing (any rejected row rolls
back the whole load) and idempotent; it is not a production loader. It writes
through migration 017's service_role-only function, which binds the audit actor
to a verified active owner and reuses the audited inventory RPCs. Wrong seeds in
001-016 are classified, never edited. Synthetic test data lives in a separate
folder and is loadable only with an explicit flag.

### 2026-09-26 - Rumeli legacy operating configuration approved

Metehan approved the ten legacy sales categories, their use by Rumeli, the
`Ana Kasa` / `2. Kasa` register layout, and the shift mapping `sabah` ->
`morning`, `aksam` -> `evening`. Approved times are Sabah 09:00-17:30 with a
17:30 report cutoff and Akşam 16:00-01:00 with a 01:00 next-day cutoff. These
owner-approved rows may replace the generic migration 009 seed through the
audited operating-data loader. This does not approve İskele Dondurma or Balık
Ekmek structure, thresholds, waste reasons, catalogue, costs or opening stock.

### 2026-09-26 - Reconciliation thresholds and waste reasons approved

Metehan approved a 2% warning and 5% error threshold for all three branches.
He also approved the six schema-supported waste reasons: son kullanma tarihi
geçmiş (`expired`), hasarlı (`damaged`), dökülme (`spilled`), kalite sorunu
(`quality`), ikram/numune (`sample`) and diğer (`other`). These are confirmed
operating data. The fixed reason codes remain stable for audit/reporting; the
Turkish labels are recorded in provenance.

### 2026-09-26 - İskele Dondurma register and seasonal shifts

İskele Dondurma currently operates one S900 computer/register. Pavo is a
planned replacement and is not activated before its transition date/name is
confirmed. The branch works one seasonal shift: summer 16:00-00:00 and cold
season 14:00-22:00, with report cutoff at shift end. Since the owner stated the
summer season has ended and supplied no automatic season dates, the cold-season
shift is active, summer is prepared inactive, and the generic migration 009
morning/evening definitions are disabled. Management Center controls later
season activation without changing historical shift records.

### 2026-09-26 - İskele Dondurma sales categories

The owner approved Dondurma, Sıcak İçecek and Soğuk İçecek as İskele Dondurma's
categories. Recorded in `operating-data/real/category_branches.csv` as
confirmed / approved. Pavo remains a future transition and is not activated;
hosted and production are untouched.

### 2026-09-26 - Balık Ekmek configuration and legacy revenue mapping

Owner approved Balık Ekmek as a separate branch with one S900 register, one daily
shift 14:00-00:00 (cutoff 00:00 next day) and the categories Balık Ekmek and
Soğuk İçecek (more may be added later). Owner also approved the legacy mapping for
the future Stage 4 adapter: Rumeli evening-report `balik_ekmek` revenue belongs to
branch `balik_ekmek`, and `dondurma` revenue to branch `iskele_dondurma`. The
adapter is not built. Pavo stays absent; hosted/production untouched.

### 2026-09-26 - Dondurma categories corrected; audited mapping removals

Owner correction: İskele Dondurma reports exactly Dondurma and Su. This
**supersedes** the earlier decision (Dondurma, Sıcak İçecek, Soğuk İçecek). Global
Sıcak/Soğuk İçecek stay for Rumeli and Balık Ekmek; Balık Ekmek keeps Balık Ekmek and
Soğuk İçecek. Categories may change later, so migration 018 adds an audited,
idempotent, all-or-nothing removal of branch/category mappings to the loader
(refused while items use the category) and closes the unaudited raw-write path on
`sales_category_branches`. Migrations 001-017 were not rewritten.

Migration 018 also makes provenance writes state-idempotent: re-applying an
identical approved dataset preserves `updated_at` and `updated_by`. Those fields
change only when provenance, approval, dataset, source or note actually changes.

### 2026-09-27 - PWA hosting, caching and updates

Mobile is the primary operating surface. Continue with an installable web app
hosted on Vercel, but staff must install a stable production alias/custom domain,
not a commit-specific Preview URL. Preview URLs remain for review and pilot QA.

The service worker may precache only versioned frontend assets, the navigation
shell and application icons. It must not runtime-cache Supabase database, Auth,
Storage or Edge Function responses. The installed shell can open without a
connection, but business data stays server-authoritative and offline writes are
not queued. A new version waits for the user to press `Şimdi güncelle`, avoiding
an automatic reload while a cashier is filling a form. Real-device installation
and update behavior is a cutover gate.

### 2026-09-27 - Preview is always visibly synthetic

The Vercel `Preview` environment has `VITE_DEMO_MODE=true`. Preview must show a
prominent `DEMO / PREVIEW` label and the three synthetic account codes before
any login. This setting is scoped only to Preview; Production keeps real login
behavior. A Preview without the label must not be used with employee credentials.

The login visual direction deliberately carries forward the legacy product's
navy night canvas, orange action color, lighthouse identity and restrained
ambient motion. V4 keeps one role-aware login form instead of restoring the old
manager/cashier split or client-side PIN keypad.

### 2026-09-27 - Manager Dashboard: kuruş money, MetricState, one shared period

Dashboard money aggregation sums integer kuruş, never TL floats, converting
back to TL only at the presentation boundary. Every metric that can fail to
exist is a `MetricState` (available/partial/unavailable/not_applicable) so a
missing gross-profit mapping, an untracked branch, and a genuine zero can
never look identical on screen — "Net Kâr" is never used, and a partial
figure is always labelled "Kısmi". One `DashboardPeriod`, resolved once per
render in Istanbul calendar days, is threaded through every fetch and every
aggregation call; no widget computes its own date boundary. Branch inclusion
in the comparison table uses the SAME period and the SAME cancelled-report
exclusion rule for every branch, and a branch's revenue counts a report under
its shift's business date, not its submission time.

### 2026-10-01 - On-device receipt OCR and cashier receipt access

Warehouse receipt OCR uses pinned `tesseract.js` in the browser so there is no
paid OCR service or third-party receipt upload. The worker is loaded only when
the user starts an analysis. OCR output is an untrusted draft: reference, date
and total may be suggested, but item, quantity and cost lines are never posted
automatically. The cashier must compare the form with the physical document
before submitting.

Cashier and employee roles may record incoming receipts only for their assigned
branch through the existing `record_inventory_receipt` RPC. This does not grant
`inventory.adjust`, `inventory.cost.read` or `inventory.cost.manage`; attempts
to include unit cost remain denied server-side. Owner, manager and branch
manager behavior is unchanged.

### 2026-10-01 - Vardiya değişiklik talebi ve ücretsiz yönetici bildirimi

Kasiyer/çalışan, yalnızca kendisine atanmış bugün veya gelecekteki bir vardiya
için aynı şubedeki başka bir vardiyayı ve 5–500 karakterlik sebebi seçerek talep
açar. Talep vardiyayı kendiliğinden değiştirmez. Aynı atama için yalnızca bir
bekleyen talep olabilir.

Owner/manager bütün şubelerde, branch_manager yalnızca kendi şubesinde karar
verebilir. Onay, eski atamayı iptal edip istenen atamayı tek veritabanı işlemi
içinde oluşturur; ret açıklaması zorunludur. Talep ve karar ayrı denetim
kayıtlarıdır. İlk bildirim modeli Vardiyalar ekranındaki uygulama içi bekleyen
talep sayısı ve karar kutusudur; ücretli bildirim servisi kullanılmaz.

### 2026-10-01 - Dondurma ve Balık Ekmek sabit tek vardiya

İskele Dondurma ve Balık Ekmek yıl boyunca 16:00-00:00 tek vardiya kullanır;
rapor kesim saati ertesi gün 00:00'dır. Bu karar, Dondurma için önceki sezonluk
16:00-00:00 / 14:00-22:00 modelini ve Balık Ekmek için önceki 14:00-00:00
saatini geçersiz kılar. Eski Dondurma tanımları geçmiş referansları korumak için
silinmez, pasif tutulur; yalnızca `daily` tanımı aktiftir.

Bekleyen vardiya taleplerinin sayısı yönetici navigasyonunda global rozet olarak
gösterilir. `inventory.receive` yetkili çalışanların ana sayfasında doğrudan
Stok Girişi kısayolu bulunur.

### 2026-10-01 - Saha rolü Kasiyer, operasyon ayrımı şube

Yönetici dışındaki veri giriş personeli kullanıcıya Kasiyer olarak gösterilir;
hangi veriyi girebildiğini rol adı değil şube ataması belirler. Yeni saha hesabı
`cashier` rolüyle açılır. Mevcut RLS ve geçmiş kayıtlarla uyumluluk için dahili
`employee` rolü silinmez, arayüzde Kasiyer olarak gösterilir ve aynı filtreye
dahil edilir. Çalışan kodları operasyonel kimliktir; PIN her kullanıcı için ayrı
atanır ve yönetim merkezinden güvenli şekilde sıfırlanabilir.

Yönetici gösterge paneli görsel bir rapor listesi yerine operasyon kontrol
merkezi olarak tasarlanır. Öncelik sırası açık sorunlar, günlük finansal sonuç,
vardiya/sayım ilerlemesi ve şube karşılaştırmasıdır. Yalnızca mevcut kaynaklardan
hesaplanabilen metrikler gösterilir; birleşik veya tahmini bir verimlilik puanı
tanımlanmadan eklenmez.

### 2026-10-02 - Legacy history uses Z and preserves both evidence sets

Legacy `sabah` is X and `aksam` is Z. Historical revenue uses Z; X and Z are
never added together. `total_revenue` is not authoritative when it disagrees
with branch components, so Rumeli is reconstructed from `rumeli_z1 +
rumeli_z2`, while Balık Ekmek and Dondurma become separate branch reports.
Current row-level data is imported unchanged in meaning. The older frozen
management totals remain separate references because June/July cannot be
reconstructed after unversioned legacy edits. No artificial balancing row is
allowed. Public Preview keeps demo access but ships no invented financial or
inventory figures by default.

### 2026-10-02 - Current staff and historical report identity are separate

The active V4 cashier roster contains exactly the five owner-confirmed people
in `identity-data/approved_staff.csv`: three Rumeli İskelesi cashiers and two
İskele Dondurma cashiers. Everyone else is excluded from the current roster.
When a former legacy cashier owns historical reports, migration retains that
authorship through an inactive, no-login archival profile. Historical reports
must never be reassigned to a current employee merely to avoid provisioning an
archival identity. PINs remain individual, are set only through the secure
provisioning/management path, and are never stored in Git or migration files.

### 2026-10-04 - Production preparation: fail-closed importer, history mirror, tested rollback

Importer guards are code, not convention (`legacy-migration/guards.mjs`); no fingerprint
taken before the legacy freeze may be approved; a mirror migration with the production-only
version `20260611233031` keeps `db push` honest instead of using `migration repair`; rollback
is "remove V4", via locked scripts proven against decoy legacy tables. No business rule changed.

### 2026-10-05 - Three-level readiness; historical findings are context, not today's work

Readiness is split into SCHEMA APPLY REVIEW, DATA APPLY and PILOT/CUTOVER; the final legacy
fingerprint gates only data apply (legacy is still being written, so it may only be taken after
a verified write freeze). A one-time, service-role-only bootstrap function (closed once any owner
exists) solves the first-owner problem without a public RPC. The production operating-data runner
is a separate tool; the local loader's localhost guard is untouched. Imported legacy
reconciliation findings are never converted to OK: they are identified through existing lineage,
shown in a separate "historical" scope and excluded from the active queue and dashboard tallies.

### 2026-10-05 - Final hardening: break-glass owner PIN rotation, import audit, immutable history

Owners stay unmodifiable through `admin_reset_pin`; rotation is a separate service-role-only
function with a script that needs the service key, a hidden/stdin PIN, a run-specific approval
phrase on hosted targets, and writes one audit row with actor NULL (no `auth.uid()` is pretended;
the operator label is explicitly unverified). A live legacy import writes exactly one audit event in
the same transaction (actor = the owner named for the run, `executedVia: service_role`); dry runs,
failures and repeat no-ops write none. Historical imported reconciliation findings are evidence:
`override_reconciliation` refuses any report with legacy lineage (status, lineage and reading
untouched). `internal_bootstrap_owner` stays: service_role only, permanently closed once any owner
exists, needed for the deterministic migration/rehearsal chain.

### 2026-10-06 - Schema Apply Review approved (review only, not a write approval)

Schema Apply Review = APPROVED. This approves the review of the 24 V4 migrations and nothing
else: a production schema apply still requires a separate, explicit owner approval, and the next
gate is a fresh verified DB + Storage backup. DATA APPLY and PILOT/CUTOVER stay NOT READY.

`20260611233031_add_kategori_devri.sql` is accepted as a production-history mirror and no-op:
production already contains `daily_reports.kategori_devri`, the migration uses `ADD COLUMN IF
NOT EXISTS`, the remote migration history already contains `20260611233031`, and
`db push --dry-run --include-all` does not propose it (it lists exactly the 24 V4 migrations).

### 2026-10-06 - Analytics Engine V1 (development only)

Metrics are calculated only by deterministic code (SQL authoritative, a tested TypeScript twin for demo mode); AI interprets
supplied facts and never calculates. Project X/Z rule at BUSINESS-DAY level: morning = X, evening = Z, Z already includes X, so
they are never two revenues. A day with a Z is FINALIZED (revenue = Z exactly, never normalized by X; Z < X keeps Z and warns
`z_below_x`); a day with only an X is PROVISIONAL (no finalized revenue, `missing_z`, X exposed as provisionalRevenue, never a baseline, no percentage); a week is final only when it has ended and has no provisional
day. Whether Z item lines are cumulative of X is NOT known and is not inferred: the X/Z rule is not applied to category/product
lines (single reading = partial, both = unsupported, gross profit never complete). Legacy-imported reports support total revenue
only where the source does (no product detail, no gross profit, transactions only where present) and mixed native + legacy
transaction/basket comparisons are refused. Thresholds are technical defaults held in one central settings row, not business
decisions. The inherited latest-reading-wins behaviour for several registers is kept, warned about and regression-tested. Every
snapshot exposes an explicit completeness model (complete / partial / unsupported with reason codes). Snapshots, insights and AI
reports are immutable and versioned; regeneration is audited with a reason. A percentage is never produced from a missing, zero,
low-volume, provisional or incomparable base, a correlation never from a small sample. Only a validated AI report may emit a
hypothesis, and a fact claim may rest only on complete-support evidence. Peak hour is unsupported (no hourly data). Revenue-bearing
data (including the X/Z readings) needs `analytics.financial.read`; `analytics.read` alone gets a redacted payload. owner/manager
may regenerate; branch_manager is read-only; cashier/employee/viewer are denied by default. The migration is not applied to
production; the open items in `ANALYTICS_MODEL.md` await owner review.

### 2026-10-07 - Phase 1A: dashboard X/Z at business-day level, PWA build output, synthetic QA set

The manager dashboard now follows the project X/Z rule at business-day level, like Analytics Engine V1: Z exactly when it exists
(Z < X keeps Z and warns), an X-only day is provisional and is shown separately, never added. The PWA manifest is generated from
one definition in `vite.config.ts` (a build output) and verified together with icons, the service worker precache and registration;
the maskable icon is full-bleed and derived from the existing logo (no new artwork). Phone QA uses an opt-in rich synthetic fixture
set (`VITE_DEMO_FIXTURES=qa`, clearly labelled, deterministic, no real data); the Vercel env is unchanged. Deployment Protection is
untouched, so a protected Preview remains non-installable until the owner approves a Vercel setting change.
