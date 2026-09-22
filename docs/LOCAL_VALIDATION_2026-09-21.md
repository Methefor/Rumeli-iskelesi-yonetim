> Superseded by LOCAL_VALIDATION_2026-09-22.md: real local validation now PASS; cashier direct-action model explicitly approved. This file records the earlier blocked attempt.

# Local validation attempt — 2026-09-21

## Outcome

BLOCKED for real Supabase validation. Initial repository: clean `v4-2027`, HEAD `5a3922e02a5e0798f78c115a70d46f9e93269acc`, matching local origin tracking ref (no remote fetch performed). Supabase CLI 2.117.0 exists in the npm cache. Docker/Podman were not found on Windows; Docker also was not found in Ubuntu-24.04 WSL. `supabase start` failed with `LegacyDockerLifecycleInspectError`, docker/podman command not found.

No fresh db reset occurred. Migrations 001-014 were NOT applied during this run. No real Auth/PostgREST inventory tests ran. Previous PGlite results remain historical, not a substitute. Production/hosted services, role grants and old stash were untouched. No commit or push.

## Prepared timezone correction

Migration 011 assigned a timestamp without time zone to a timestamptz variable. The implicit conversion used session TimeZone. A 17:30 Istanbul cutoff should be 14:30 UTC; in a UTC session the old expression allowed submissions until 20:30 Istanbul. Sessions ahead of Istanbul could close the window early. This proves a defect in the prepared SQL, not that it caused historical production incidents.

The prepared expression now constructs the business date plus calendar day offset and cutoff, then explicitly uses `AT TIME ZONE 'Europe/Istanbul'`. Exact-cutoff submission remains allowed; later submission is rejected for nonprivileged users. Privileged bypass is unchanged. No historical data conversion was performed.

The application evaluator also used the device timezone via local Date methods. It now compares Istanbul wall-clock components with timezone-independent calendar arithmetic, including milliseconds. The existing `isBackdated` rule remains unchanged: backdated entries are marked late, while SQL uses the shift business date and cutoff. That policy difference remains a separate decision; this patch does not silently change it.

## Verification

- Typecheck: PASS.
- Lint: PASS.
- Full suite: 158 tests / 20 files PASS.
- Build: PASS, bundle-size warning remains (628.75 kB JS).
- Additional timezone runs: all 13 shift tests PASS individually in UTC, America/New_York and Asia/Tokyo.
- SQL arithmetic regression added for four session timezones, inclusive boundary, next-day cutoff, year rollover and leap day: PREPARED, NOT EXECUTED.
- Fresh local migrations, real database security assertions and Auth/PostgREST integration: OPEN.

## Existing branch_manager permissions (SQL review)

Migration 012 grants `inventory.adjust`; there is no separate void permission. Migration 013 scopes checks to every branch in the user's memberships. Migration 014 uses that permission for:

1. `record_inventory_adjustment`: increase/decrease theoretical stock with positive quantity and required reason, optionally tied to a submitted count.
2. `reverse_inventory_movement`: reverse a non-sales movement once with opposite stock impact and the same cost snapshot. No deletion. Sales-linked movements must go through sales report edit/cancel.
3. `void_inventory_count`: mark a submitted count voided; retain records and exclude it from last-count selection. This does NOT reverse previously linked stock adjustments.

All three write audit information. No business amount/age limit, creator-only rule, second-person approval or negative-stock prohibition is enforced. Count-linked adjustments do not require matching the counted item's variance and do not prevent repeated corrections for the same variance. `inventory.adjust` also bypasses shift-assignment requirements for waste/count; changing it would affect that flow. Branch managers can read costs but cannot set costs. Separately authorized sales edit/cancel can also affect inventory.

Recommendation only, NOT IMPLEMENTED: manager/owner performs direct adjustment/reversal/count void; branch manager submits a reasoned request for approval. If delegated authority is needed, separate adjust/reverse/count-void and shift-scope permissions, with quantity/time limits and closed-period protection. Define treatment of linked adjustments explicitly before changing count-void behavior.

## Next validation steps

Install/enable a Docker-compatible local engine after the pending system-installation approval. Inspect CLI help for this installed version. Start an isolated disposable local project; verify local endpoints before `db reset --local`. Apply 001-014 from scratch and run both SQL scripts with ON_ERROR_STOP. Use real local Auth sessions through PostgREST for owner, manager, branch_manager (both branch memberships), employee/cashier, viewer and anonymous callers. Include cross-branch reversal/void denial, permitted branch-manager reversal, audit and grant checks, and real create_sales_report cutoff cases. The existing security SQL uses SET LOCAL ROLE/JWT claims and does not itself exercise GoTrue/PostgREST. Do not mark validated until those runs pass.
