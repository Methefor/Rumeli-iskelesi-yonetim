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
