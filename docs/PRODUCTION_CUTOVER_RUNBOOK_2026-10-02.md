# Production cutover runbook — prepared 2026-10-02, updated 2026-10-03

> **SUPERSEDED 2026-10-04** by `PRODUCTION_CUTOVER_RUNBOOK.md`. The fingerprint (`e83b3fa1…`), the 541-row source and the 840-report plan below are obsolete (current: 542 rows, fingerprint `8195640b…`, plan 842) and must not be used as approvals. Kept unchanged below as history.


## Status

Prepared only. No hosted schema, Auth user, PIN, Edge Function, Storage object or
business row has been changed. Production execution requires a separate,
explicit owner approval after the read-only checks, backups and dry-run results
below are shown.

## Approved identity plan

Active accounts come from `identity-data/approved_staff.csv`:

- `K001` Tuba Bozaklı — Rumeli İskelesi cashier
- `K002` Ceren Erdem — Rumeli İskelesi cashier
- `K003` Rüya Akşar — Rumeli İskelesi cashier
- `D001` Tuba Öztav — İskele Dondurma cashier
- `D002` Tuğkan Karademir — İskele Dondurma cashier

The owner account remains `M001`. Each active person receives an individual
PIN through the secure provisioning flow. PINs are never placed in commands,
chat, Git, logs or the legacy map.

Five legacy cashier identities own historical reports. Tuba Bozaklı and Ceren
Erdem map to `K001` and `K002`. The remaining three map to `H001`–`H003`
inactive archival profiles with no PIN credential and no branch membership.
Those profiles preserve authorship only and never appear as current staff.

The private UUID-to-code map lives at
`legacy-migration/private/cashier-map.json`, is gitignored and must never be
printed or committed.

## Gate A — read-only identity and target checks

1. Confirm the Supabase project ref exactly matches the approved legacy/V4
   target and record the ref without printing keys.
2. Confirm the current source fingerprint is
   `e83b3fa15fc262bd2fab3f6eb2a415ed726c618e82c45801b30d995bb883a67c`.
   Any change stops the run for a new audit.
3. Confirm 541 source reports, five source cashier identities, no duplicate
   date/shift/register grain and no orphan cashier reference.
4. Inspect migration history and schema name collisions before applying any V4
   migration.
5. Confirm the short Vercel Production target and environment values point to
   the intended Supabase project only after the database gate passes.

## Gate B — recoverable backups

1. Create a timestamped database roles/schema/data dump outside Git.
2. Record row counts and SHA-256 for each dump.
3. Export the Storage bucket inventory separately; database dumps do not contain
   object bodies.
4. Verify the dump can be read and list its contents. If practical, restore it
   to a disposable local database before mutation.
5. Record the exact rollback boundary. The legacy tables remain untouched
   throughout coexistence.

## Gate C — schema and functions

1. Apply the reviewed migration chain in order.
2. Deploy only the required `pin-login` and `employee-provision` functions.
3. Keep public signup disabled.
4. Run Auth/PostgREST/RLS smoke tests with temporary accounts, then remove them
   according to the cleanup plan.
5. Stop on any policy, grant, timezone, reconciliation or branch-scope failure.

## Gate D — identities and operating data

1. Provision `M001` and the five active cashier accounts.
2. Create `H001`–`H003` as inactive profiles without PIN credentials or
   branch memberships.
3. Load the approved operating dataset and verify branches, categories,
   registers, shifts and thresholds.
4. Build the private five-entry legacy UUID map and independently review every
   name-to-code match.
5. Verify only the five approved cashiers are active/selectable.

## Gate E — legacy dry run

Run the exact migration transaction with `p_commit=false` and the confirmed
fingerprint. Required result:

- source rows: 541
- Rumeli reports: 541
- Balık Ekmek reports: 191
- İskele Dondurma reports: 108
- total target reports: 840
- writes after dry run: zero
- current Z component total: exact to the kuruş
- June/July frozen-reference variance: still disclosed, never balanced
- three former cashiers: attributed only through inactive archival profiles
- Balık/Dondurma missing historical category splits: visible as unreconciled

Only after these results, backup evidence and the target identity are shown to
the owner may the final production data-apply approval be requested.

## Gate F — controlled apply and verification

After explicit approval, run the same fingerprinted transaction once with
commit enabled. Verify 840 lineage links, one immutable import-run record,
idempotent second execution, per-branch/month totals and current-user access.
Do not delete or rewrite the legacy source. Keep rollback and legacy read access
available through the pilot window.

## Cutover follow-up

Switch the V4 deployment from Preview/demo configuration to real login only
after hosted login, dashboard, reporting, stock receipt and PWA update checks
pass. Start with the owner and a small cashier pilot. The second-level dashboard
and performance work resumes after the real-data cutover is stable.

## Execution evidence — 2026-10-03

- CLI target: Rumeli İskelesi Database / `iwikwbjsznjuefvuemdb`.
- Separate `tatli-imalat-dagitim` project remained untouched.
- Role, schema and data dumps created outside Git with SHA-256 manifest.
- Disposable local restore: 541 reports, five cashiers, zero Auth users and one
  Storage metadata row.
- Current fingerprint:
  `e83b3fa15fc262bd2fab3f6eb2a415ed726c618e82c45801b30d995bb883a67c`.
- Current migration plan: 541 Rumeli + 191 Balık Ekmek + 108 Dondurma = 840.
- Real-source/local-target migration suite: 15/15 passed.
- Offline schema comparison: zero table-name and zero function-name collisions.
- Local migration data reset and local Supabase stopped.
- Open backup item: download and hash the one legacy Storage object body.
- Hosted schema, Auth users, functions and V4 business rows remain untouched.
