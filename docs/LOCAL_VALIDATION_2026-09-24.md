# Local Supabase validation — 24 September 2026

## Result: LOCAL PASS

Repo `v4-2027`, base commit `19d0b51423786598d01468d8373c29e36c394519`. Working
files not committed at the time this was written. Production/hosted Supabase,
`main`, the old stash (`laptop-old-phase-c-before-sync`) and Vercel were not
touched. No migration was applied anywhere but this laptop's disposable local
Supabase (Docker), no Edge Function was deployed anywhere, no commit or push
was made while writing this.

| Check | Result |
|---|---|
| Fresh `supabase db reset --local --no-seed`, migrations 001–015 from zero | PASS |
| `inventory_security.test.sql` | PASS, transaction rollback |
| `timezone_regression.test.sql` | PASS, transaction rollback |
| `timezone_rpc.test.sql` | 32/32 PASS |
| `backdated_entry.test.sql` (new) | PASS, transaction rollback |
| `backdated_entry_timezone.test.sql` (new) | 24/24 PASS across UTC / Europe/Istanbul / America/New_York / Asia/Tokyo |
| `local_inventory_api.mjs` (real Auth/PostgREST) | 137/137 PASS |
| `storage_policy.test.mjs` (new, real Storage API + real Auth JWTs) | 48/48 PASS — **found and fixed one real bug**, see below |
| `pin_login.test.mjs` (new, real local Edge Function over real HTTP) | 45/45 PASS — no fix needed |
| Application: typecheck, lint, 175 tests, build | PASS |

## 1. Backdated-entry policy (new: `015_sales_backdated_policy.sql`)

**Rule** (server-side, `create_sales_report` and `edit_sales_report`):
Europe/Istanbul **calendar date**, never a rolling 72 hours, never the
session/browser timezone. Normal operational users (cashier, employee,
branch_manager) may create or edit a report for a shift whose `business_date`
is today or one of the previous 3 Istanbul calendar dates. A **future**
business_date is always denied, for everyone, with no override. Owner/manager
may go further into the past, but only with an explicit, mandatory reason
(`create_sales_report`'s new `p_backdated_reason` parameter; `edit_sales_report`
reuses its already-mandatory `p_reason`), audited separately as
`sales_report_backdated_override` — distinct from the normal `report_edit`
audit row every create/edit already writes. `branch_manager`'s existing
`sales.edit_all` does **not** count as privileged for this rule — only
`current_user_is_owner_or_manager()` does; this is the one place branch_manager
lost a capability it previously had unrestricted (bypassing the same-day
cutoff via `sales.edit_all` was, and remains, unaffected).

**A design detail worth recording**: the pre-existing same-day submission
cutoff (011/014) already blocks a normal user from creating a report much
more than ~1-2 days after its shift (cutoff_day_offset is a table CHECK
limited to 0 or 1). So for `create_sales_report`, the new rule's practical
effect for a normal role is mostly redundant with that old rule — except it
closes a real gap for `branch_manager`, who bypasses the cutoff via
`sales.edit_all` and previously had **no** backdating limit at all.
`edit_sales_report` has no cutoff of any kind, so it's where the new rule is
cleanest to observe for every role — see `backdated_entry.test.sql`'s header
for the full reasoning and how the fixtures are built to isolate this.

Frontend: `app/src/domain/shifts/backdatedPolicy.ts` (`evaluateBackdatedEntry`,
pure, Istanbul-date input only) mirrors the rule for UI messaging;
`NewSalesReportPage.tsx` shows a clear Turkish message and blocks the form
for a denied date, and shows a mandatory reason field for an owner/manager
override; `services/errors.ts` maps the new server messages to Turkish so a
raw SQL/PostgREST error never reaches the screen. Demo mode
(`services/demo/api.ts`) mirrors the same rule for Preview-mode fidelity.

## 2. Storage policies (`avatars-v4`, real executable test)

`avatars-v4` is intentionally **public for reads** — anyone, including anon,
can read/download any avatar via its public URL; only writes are restricted.
Confirmed both ways (own-path SELECT and the `/object/public/...` URL) for
every role, and for anon.

**Access matrix** (own-path unless noted):

| Action | employee/cashier/branch_manager | manager/owner | anon |
|---|:-:|:-:|:-:|
| Read (own or anyone's) | ✔ | ✔ | ✔ |
| Insert (own path) | ✔ | ✔ | – |
| Insert/replace/delete (**another** user's path) | – | ✔ (`employee.manage`) | – |
| Delete (own path) | ✔ | ✔ | – |

No branch scope applies to this bucket at all (by design — avatars aren't
branch data); confirmed `branch_manager`'s `employee.manage_branch` does
**not** grant the override (only the org-wide `employee.manage` held by
manager/owner does).

**Bug found and fixed by the real HTTP test (not visible from reading the
SQL)**: the local Supabase Storage API implements "replace an existing
object" (an avatar re-upload, i.e. `PUT`) as
`INSERT ... ON CONFLICT (name, bucket_id) DO UPDATE`, not a plain `UPDATE`.
Postgres RLS requires the **INSERT** policy's `WITH CHECK` to pass for that
statement regardless of which branch actually fires, so a manager's replace
of another employee's avatar was being rejected by the `avatars_v4_insert`
policy (own-path only) even though `avatars_v4_update` was written to allow
it via `employee.manage`. Fixed in `007_storage_policies.sql`: the
`employee.manage` override is now on `avatars_v4_insert` too, matching
update/delete. A side effect, disclosed rather than further restricted: a
manager/owner can now also upload a **brand-new** avatar under someone
else's path (not just replace an existing one) — consistent with "manager
manages employee avatars," and not distinguishable from the replace case
without a much more complex policy.

**Also found, not a bug, documented instead**: `storage.buckets` ships with
RLS enabled and zero policies by default (a Supabase Storage default, not
introduced by 007) — the `/storage/v1/bucket/:id` metadata endpoint 404s for
every role including authenticated ones. This does not affect object
read/write (those policies compare `bucket_id` as a literal string, never
via a `storage.buckets` RLS join) and fails safe, not open. Left as a
one-line future item if bucket-listing is ever needed by the client.

Not tested: real image content / actual `imgproxy` transform (the fixture
upload is 8 bytes of PNG magic bytes, enough to exercise the MIME/size
policy but not a real render pipeline) — out of scope for an authorization
test.

## 3. pin-login Edge Function (real local HTTP, no fix needed)

Served automatically by the local edge runtime (`supabase_edge_runtime_*`,
part of `supabase db reset`/`start` — **nothing deployed to any hosted
project**) and called over real HTTP exactly as a browser would, using the
anon key only (the function's own service-role key lives solely inside the
Edge Function runtime's environment).

- **Identity**: `employee_code` is the login handle; a legacy-shaped bare
  numeric id (`legacy_cashier_id`'s old shape) is not accepted.
- **PIN**: correct succeeds; wrong PIN, wrong employee_code, inactive user,
  and a profile with no `pin_credentials` row at all all fail with the
  **identical** generic `401 {"error":"invalid_credentials"}` — confirmed
  byte-for-byte identical shape, not just "both fail." Format validation
  (too short, non-numeric) is rejected with `400` before any DB lookup.
- **Lockout**: `verify_pin`'s `select ... for update` row lock serializes
  concurrent attempts correctly — 5 concurrent wrong-PIN calls land on
  exactly `failed_attempts = 5` (no lost update) and exactly **one**
  `pin_lockout` audit row, not five. A correct PIN presented while locked is
  still rejected (the function returns `false` before even checking the
  hash once locked). Further attempts while locked (right or wrong PIN)
  never add a second lockout audit row — no audit flooding. A successful
  login below the lockout threshold resets `failed_attempts` to 0.
- **Session issuance**: the returned `access_token` resolves to the correct
  user via `/auth/v1/user` **and** authorizes a real PostgREST read under
  that identity (RLS-scoped, not just token-decodable) — proving the session
  is genuinely usable, not merely well-formed. The `refresh_token` flow
  issues a fresh access/refresh pair.
- **Security**: no `service_credentials` table exists anywhere in the
  schema; the success response contains only `access_token`/`refresh_token`
  (no user object, no `token_hash`, no key); `pin_credentials` is completely
  unreachable via PostgREST for anon/authenticated; and — checked against
  the local Mailpit mail catcher, not just read from the source comment —
  **no email is actually sent** by a successful PIN login (`generateLink`
  never dispatches one; the token is consumed server-side by `verifyOtp`
  before the browser ever sees it).

## Repeat locally

From the repo root, on a disposable local stack only:

```
supabase db reset --local --no-seed
# SQL suites (rolled back, safe to run in any order on the same reset):
cat supabase/tests/inventory_security.test.sql | psql ... -v ON_ERROR_STOP=1
cat supabase/tests/timezone_regression.test.sql | psql ... -v ON_ERROR_STOP=1
cat supabase/tests/timezone_rpc.test.sql | psql ... -v ON_ERROR_STOP=1
cat supabase/tests/backdated_entry.test.sql | psql ... -v ON_ERROR_STOP=1
cat supabase/tests/backdated_entry_timezone.test.sql | psql ... -v ON_ERROR_STOP=1
# HTTP suites (each creates real fixture users — reset between runs):
node supabase/tests/local_inventory_api.mjs
node supabase/tests/storage_policy.test.mjs
node supabase/tests/pin_login.test.mjs
```

`SUPABASE_CLI`/`DOCKER_CLI` env vars may need to point at real executables if
they aren't on `PATH` (see each script's header comment).

## Validation status

| Item | Status |
|---|---|
| Local Supabase (fresh reset, migrations 001–015) | **VALIDATED** |
| Backdated-entry policy (SQL + timezone matrix + app) | **VALIDATED LOCALLY** |
| Local Storage API (`avatars-v4`) | **VALIDATED LOCALLY** — one real bug found and fixed |
| Local Edge Function (`pin-login`) | **VALIDATED LOCALLY** — no fix needed |
| Real local Auth/PostgREST/RLS (inventory) | **VALIDATED LOCALLY** (unchanged from 2026-09-22) |
| Application (typecheck, lint, 175 tests, build) | **VALIDATED** |
| Hosted / staging Supabase | **NOT DONE** |
| Production | **UNTOUCHED** |

Not commited or pushed at the time this document was written.
