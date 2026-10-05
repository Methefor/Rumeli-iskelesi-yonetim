# Production readiness (2026-10-05)

Branch `v4-2027`, base HEAD `1f60acb`; this phase's work is uncommitted.
**Production has never been written to by this work.** Readiness is reported at three
independent levels; production overall is **not** "READY".

| Level | Verdict |
|---|---|
| **1. SCHEMA APPLY REVIEW** (migrations, functions, identity bootstrap, operating data) | **READY FOR REVIEW** |
| **2. DATA APPLY** (legacy sales import) | **NOT READY** |
| **3. PILOT / CUTOVER** (restricted frontend, pilot, activation) | **NOT READY** |

Status words per gate: PASS / OPEN / BLOCKED / NOT APPLICABLE. "READY FOR REVIEW" means
the owner may now review the schema-apply step and decide; it does **not** approve any write.

---

## 1. SCHEMA APPLY REVIEW — READY FOR REVIEW

The final legacy fingerprint is **not** a precondition here (the schema apply never reads or
writes legacy rows).

| Gate | Status | Evidence |
|---|---|---|
| Name collisions | **PASS** | read-only audit: 0 collisions (30 tables, 3 views, 74 functions, indexes, triggers, policies, buckets); `docs/PRODUCTION_COLLISION_AUDIT_2026-10-04.md` |
| Migration chain (local, from zero) | **PASS** | 25 files = 24 V4 + the `20260611233031` history mirror; `db push --linked --dry-run --include-all` (read-only) lists exactly the 24 |
| Hosted-only behaviour | **OPEN (accepted)** | not provable without a write (alter role, storage policies, GoTrue ban, function secrets); covered by STOP gates; hosted staging deliberately skipped (2026-09-26) |
| Rollback tested | **PASS** | `supabase/rollback/v4_schema_teardown.sql` (locked; decoy legacy tables survive) and `v4_legacy_import_cleanup.sql`; `docs/PRODUCTION_ROLLBACK_RUNBOOK.md` |
| Target guards | **PASS** | `legacy-migration/guards.mjs` (importer, archival tool, bootstrap, operating-data runner all fail closed) |
| Owner bootstrap tool (local) | **PASS** | `identity-data/bootstrap-owner.mjs` + service-role-only `internal_bootstrap_owner`; `owner_bootstrap.test.mjs` |
| Production operating-data runner (local) | **PASS** | `operating-data/run-production.mjs`; `operating_data_production_runner.test.mjs`; local loader's localhost guard untouched |
| Backup + cutover runbooks | **PASS** (prepared) | `docs/PRODUCTION_BACKUP_RUNBOOK.md`, `docs/PRODUCTION_CUTOVER_RUNBOOK.md`; execution of each WRITE step needs the owner's explicit approval |
| Historical reconciliation policy | **PASS** | view `sales_reports_with_origin`; active vs historical queue; status never altered |
| Owner break-glass PIN rotation (local) | **PASS** | `identity-data/rotate-owner-pin.mjs` + service-role-only `internal_rotate_owner_pin`; `owner_pin_rotation.test.mjs`; `admin_reset_pin` hierarchy unchanged (no manager can reset an owner) |
| Import-level audit event (local) | **PASS** | one `legacy_sales_import_applied` row per live import, same transaction; none on dry run / failure / repeat |
| Historical reconciliation immutability (server-side) | **PASS** | `override_reconciliation` refuses reports with legacy lineage; native overrides unchanged |
| Pending decisions for the review | **none open** | review `20261005000300_final_hardening.sql` together with the rest of the chain |

Required order of the schema phase (details in the cutover runbook): fresh verified backup →
`db push --include-all` → verify → bootstrap owner → Edge Functions → operating data
(`run-production.mjs`, dry run → reviewed plan → apply). Each WRITE step is a separate approval.

## 2. DATA APPLY — NOT READY

**Mandatory DATA APPLY STOP gate (all required, in order):**

1. Legacy writes are **frozen** (`docs/LEGACY_WRITE_FREEZE_RUNBOOK.md`; owner approves `T0`).
2. A **fresh source audit after the freeze**: two identical `legacy-migration/audit.mjs` runs ≥ 10 min apart; row count, date range, X/Z split, cashier-identity shape recorded.
3. Recompute the **fingerprint `F`** and compare the row/date/identity summary with the previous audit; every difference is explained.
4. Importer **dry run with exactly `F`** (`--expect-fingerprint=F`).
5. The owner **reviews the dry run** (plan `P`, branch split, per-person attribution, backup evidence).
6. The owner **explicitly approves that exact `F`** (and `P`) in writing.
7. The live apply must **reject any changed fingerprint** — enforced in code (`source_drift`; `--expect-fingerprint` mandatory in every mode; the approval phrase is bound to `F`).

Until all seven pass, **DATA APPLY is BLOCKED**. Today's value is informational only:
544 rows, plan 845, `00fed3c2f19fed2299391a1e7c631dc3e9f63343b472ca9e8f168e19fd0aa26d`; the fingerprint moved three times in 48 h because legacy is still being written.

Also required before data apply:

| Item | Status |
|---|---|
| Legacy write freeze executed | OPEN |
| Final fingerprint + owner approval | OPEN |
| Private identity map approved by the owner (name→code review) | OPEN |
| Real production identities provisioned (`M001`, `K001–K003`, `D001–D002`, `H001–H003`) | OPEN |
| Actual verified cutover backup (DB dumps are stale; Storage object body already exported and hashed) | OPEN |
| Operating data loaded in production | OPEN |
| Final owner approval | OPEN |
| Importer dry run/rehearsal, guards, post-apply SQL pack, cleanup script | PASS (local) |

## 3. PILOT / CUTOVER — NOT READY

| Item | Status |
|---|---|
| Schema, functions and data provisioned in production | OPEN (levels 1–2) |
| Restricted pilot frontend | **OPEN** — approach selected and documented (`docs/PRODUCTION_PILOT_FRONTEND.md`: separate CLI-deployed project, `build:pilot` fail-closed guard, legacy alias and synthetic Preview untouched); not created, not deployed (Vercel write needs owner approval) |
| Mobile pilot passes | OPEN (`docs/PRODUCTION_PILOT_PLAN.md`; not started) |
| Frontend activation for all staff | OPEN |

---

## Known risks

- Legacy tables stay anon-open (insert/update/delete, plaintext PIN column) until legacy is retired.
- Hosted-only behaviour is unrehearsed (no staging); mitigated by STOP gates and a tested teardown.
- The DB importer trusts the caller-supplied fingerprint; integrity is enforced by `run.mjs` recomputation.
- Import audit actor is the owner named for the run while the service role executed it (documented in the row: `executedVia`, `actorSemantics`); the rotation audit has actor NULL and an unverified operator label.
- `internal_bootstrap_owner` stays in the schema on purpose: EXECUTE is service_role only (anon, authenticated and PUBLIC revoked; asserted with `has_function_privilege` in `owner_pin_rotation.test.mjs`), and its first check refuses (42501) as soon as ANY owner role exists, so after the first bootstrap it is permanently closed even for the service role (tested). Dropping it would break the deterministic migration chain used by the rehearsal and rollback and gains nothing: a service-role key can already do anything.
- Owner PIN rotation is a break-glass service-role path: it needs the service key, a run-specific approval phrase on hosted targets and leaves one audit row; the service key is the unavoidable trust root.
- Historical imported findings cannot be overridden through the normal workflow; any future annotation of them needs a separate mechanism (not built).
- ~493 historical flagged reports remain stored as ERROR/WARNING; they are hidden from the default queue and dashboard tallies, not resolved.

## Regression of record

Fresh local reset per suite, 2026-10-05, 25 migration files (24 V4 + history mirror):

- SQL: timezone, timezone RPC (32 cases), inventory security, backdated entry (+24 timezone cases), management center, shift change requests — pass (SQL suites print no total).
- HTTP/real stack: inventory API 152, storage 48, pin-login 45, management 76, operating-data loader 120.
- Legacy/production prep: sales import 15, import rehearsal 77, owner bootstrap 30, owner PIN rotation 37, production operating-data runner 30, schema teardown 10.
- Node: operating-data validator 26, identity 1, legacy lib + guards 13, pilot build guard 3.
- App: typecheck and lint clean; **309 tests** (39 files); build passes (bundle-size warning unchanged).
- `git diff --check` clean; secret scan: only the `sb_secret_` prefix constants in `guards.mjs`/`guards.test.mjs` (key-type detection, not keys).
