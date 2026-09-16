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
