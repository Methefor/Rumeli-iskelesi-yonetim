# Production identity plan (prepared 2026-10-04 — nothing provisioned)

No production user, PIN, profile or Auth record exists or was created by this
document. `auth.users` in production is empty (read-only check, 2026-10-04).
Source of truth for people: `identity-data/approved_staff.csv`
(owner-confirmed 2026-10-02). Nobody is invented here.

## Rules (non-negotiable)

1. Never migrate a plaintext legacy PIN. The legacy `cashiers.pin` column is not
   read by any V4 tool (`guards.assertSourceFieldsSafe` fails if a PIN/name
   column ever enters the source field list; the importer RPC accepts neither).
2. Every production PIN is **newly assigned**: the owner types it once into the
   Management Center "new employee" form (it goes browser → `employee-provision`
   Edge Function over HTTPS, is hashed with bcrypt in the database transaction,
   and is never stored, returned, logged or shown again). PINs are never in
   Git, chat, shell history, CSV files, runbook commands or the legacy map.
3. A PIN handed to a person is temporary by convention only: V4 has **no
   self-service PIN change** (only a higher-ranked manager can reset). Hand it
   over verbally/in person, one person at a time.
4. Active staff (current roster) and historical authorship are separate concepts.
   Archival profiles are never added to the roster and never selectable.
5. No account is created without the explicit owner approval of the
   `PRODUCTION_CUTOVER_RUNBOOK.md` identity step ("REQUIRES EXPLICIT OWNER
   APPROVAL BEFORE EXECUTION").

## Accounts

### Active accounts

| employee_code | Person (as in approved_staff.csv) | Role | Branch membership | Active | Provisioning method | PIN handling | Existing legacy identity? | Migration linkage |
|---|---|---|---|---|---|---|---|---|
| `M001` | **owner — name not recorded in any tracked file; supplied privately at provisioning** | owner | none (organization-wide) | yes | **Bootstrap (see below)** — the first rank-4 actor cannot be created by the Edge Function, which requires an existing authorized caller | set by the owner locally; only a bcrypt hash reaches production | no | none |
| `K001` | Tuba Bozaklı | cashier | rumeli_iskelesi | yes | Management Center → `employee-provision` (owner JWT) | new, typed once by owner | **yes** (legacy cashier, current staff) | legacy id → `K001` |
| `K002` | Ceren Erdem | cashier | rumeli_iskelesi | yes | same | new | **yes** (legacy cashier, current staff) | legacy id → `K002` |
| `K003` | Rüya Akşar | cashier | rumeli_iskelesi | yes | same | new | no | none (no legacy history) |
| `D001` | Tuba Öztav | cashier | iskele_dondurma | yes | same | new | no | none |
| `D002` | Tuğkan Karademir | cashier | iskele_dondurma | yes | same | new | no | none |

Managers: **none approved**. Do not create a `manager` or `branch_manager` account
until the owner states one explicitly.

### Archival (no-login) accounts — authorship only

| employee_code | Meaning | Role | Branch membership | Active | Provisioning | PIN | Legacy link |
|---|---|---|---|---|---|---|---|
| `H001`, `H002`, `H003` | former legacy report owners who are no longer current staff (3 of the 5 legacy cashier identities) | none | none | **no** | `node identity-data/provision-archival.mjs --target-ref=<ref> --count=3` (dry-run default; hosted needs `--allow-hosted-target --allow-hosted-apply` + `LEGACY_ARCHIVAL_OWNER_APPROVAL=approve-archival:<ref>:3`) | **none** (no `pin_credentials` row) + Auth user banned (`ban_duration` 876000h) + random unusable password | yes (historical authorship) | legacy ids → `H001..H003` via the private map |

`provision-archival.mjs` is idempotent, refuses to "repair" an active `H###`
(incident), removes the Auth user if the profile insert fails, uses a neutral
placeholder name (`Arşiv Kasiyer N`; legacy names are never read), and is
rehearsed locally by `supabase/tests/legacy_import_rehearsal.test.mjs`.

## Provisioning sequence (executed only at the approved cutover step)

1. **Bootstrap owner `M001`** — tool built and locally proven (30 assertions):
   `identity-data/bootstrap-owner.mjs` + the service-role-only database function
   `internal_bootstrap_owner` (migration `20261005000100_bootstrap_owner.sql`; it refuses once
   any owner exists, so even a leaked service key cannot mint a second owner). Dry run by
   default; hosted apply needs `--allow-hosted-target --allow-hosted-apply` and the phrase
   `OWNER_BOOTSTRAP_APPROVAL=approve-owner-bootstrap:<ref>:M001`; the PIN is typed at a hidden
   prompt or piped via `--pin-stdin`, never an argument/env/file/output. The bullet below is the
   original requirement list it satisfies. Running it in production **REQUIRES EXPLICIT OWNER
   APPROVAL BEFORE EXECUTION**.
   There is no tracked bootstrap tool. Required properties: creates the Auth user
   (random password, no email), the `profiles` row (`employee_code='M001'`,
   active), the `owner` role, and a `pin_credentials` row whose hash is computed
   **locally** (e.g. `select extensions.crypt('<pin>', extensions.gen_salt('bf'))`
   against a throwaway local database, so the PIN never leaves the operator's
   machine and never appears in a production statement or log). Two acceptable
   implementations: (a) a reviewed one-off service-role script, or (b) a new
   service-role-only migration function. Either needs review/approval; until one
   exists, gate **D** stays OPEN. Owners are unmodifiable via the RPCs (by design), so the owner PIN is
   rotated with `identity-data/rotate-owner-pin.mjs` (see "Owner PIN rotation").
2. Verify: owner can sign in through `pin-login`; `profiles` has exactly one
   active owner.
3. Sign in as `M001`; create `K001`, `K002`, `K003`, `D001`, `D002` in the
   Management Center with their branch and an individually chosen PIN. Reason
   text: "Cutover roster 2026-10".
4. `provision-archival.mjs` dry run → review → apply `H001`–`H003`.
5. Run `post_apply_checks.sql` identity checks (40–46) and
   `select employee_code, is_active from public.profiles order by 1` — expect
   exactly: 6 active (`M001`, `K001`, `K002`, `K003`, `D001`, `D002`) and 3
   inactive (`H001`–`H003`). Anything else = STOP.
6. Build/verify the private legacy map (`docs/LEGACY_IDENTITY_MAPPING_RUNBOOK.md`).

## Verification queries (read-only, codes only)

```sql
select p.employee_code, p.is_active,
       (select string_agg(r.key, ',') from public.user_roles ur join public.roles r on r.id = ur.role_id where ur.user_id = p.id) as roles,
       (select string_agg(b.key, ',') from public.branch_memberships bm join public.branches b on b.id = bm.branch_id where bm.user_id = p.id) as branches,
       exists (select 1 from public.pin_credentials pc where pc.user_id = p.id) as has_pin
from public.profiles p order by 1;
```

Expected: `M001` owner/-/pin; `K001–K003` cashier/rumeli_iskelesi/pin;
`D001–D002` cashier/iskele_dondurma/pin; `H001–H003` inactive, no role, no
branch, **no pin**.

## Open items

- Bootstrap owner method — **DONE locally** (above); production execution OPEN (needs approval).
- Owner PIN rotation — **DONE locally** (see "Owner PIN rotation"); production execution needs explicit owner approval.
- Real names of `H001–H003` are intentionally not recorded in Git; the owner
  keeps the private map to know who is who.

## Owner PIN rotation (break-glass)

`admin_reset_pin` is unchanged: no manager or branch manager can reset an owner. Rotating the
owner PIN is a separate, service-role-only door: `internal_rotate_owner_pin` (not callable by
anon/authenticated/PUBLIC), driven by `identity-data/rotate-owner-pin.mjs`.

```bash
# dry run (default): shows the plan, reads no PIN, writes nothing
node identity-data/rotate-owner-pin.mjs --target-ref=<ref> --employee-code=M001 --reason="<why>"
# hosted apply: PIN typed at a hidden prompt (or piped with --pin-stdin); never argv/env/file
OWNER_PIN_ROTATION_APPROVAL=approve-owner-pin-rotation:<ref>:M001 \
node identity-data/rotate-owner-pin.mjs --target-ref=<ref> --employee-code=M001 --reason="<why>" \
  --operator-label="<who>" --apply --allow-hosted-target --allow-hosted-apply
```

- Only an ACTIVE, non-banned owner with an existing PIN credential qualifies. It never creates an owner, changes a role or branch membership, activates anyone or touches the Auth email/password. Failed attempts and lockout are reset.
- Hosted apply is a production WRITE: explicit owner approval before execution, exact production ref, `--allow-hosted-target`, `--allow-hosted-apply`, the run-specific phrase, an explicit `--employee-code`; the anon key is refused.
- Audit: exactly ONE `owner_pin_rotated` row, `actor_user_id` NULL (no authenticated session exists; none is pretended), subject = the owner profile, `new_values` = employee code, `executed_via: service_role`, the operator label (UNVERIFIED, as typed), mandatory reason. The PIN and its hash are never recorded or printed.
- Existing Auth sessions are not touched (refresh keeps working); the old PIN stops working immediately.
