# Legacy write freeze runbook (prepared 2026-10-05 — NOT performed)

Purpose: stop the legacy system from accepting new or edited data for the duration
of the DATA APPLY window so the audited source fingerprint cannot move between the
dry run, the owner approval and the live apply. Today legacy production is still
being written to every day (the fingerprint changed three times in 48 hours), so no
fingerprint may be treated as final before this freeze.

**Starting the freeze REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION.** Nothing in
this document has been executed. Legacy tables, policies and code are **never**
modified by the freeze (legacy tables are anon-open; any technical lock would be a
production change to legacy objects and is deliberately out of scope).

## Mechanism: procedural freeze, technically verified

The legacy app has no maintenance mode and its tables accept anonymous writes. The
freeze is therefore an **agreed stop of data entry** by the six people who use the
legacy app, plus a read-only, repeated technical verification that no row was added
or changed. Because verification is mandatory, a leaked entry is detected, never
silently imported.

## T-24h — staff communication (owner sends)

Message (adapt wording): "On <date> from <HH:MM> until the owner announces the end,
do **not** enter or edit any report in the old system (/entry, /cashier, /admin). Write
the shift figures on paper (date, shift, register, X or Z, branch totals, cashier
name). Everything is entered in the new system afterwards. Entries made during the
freeze will be rejected in review." Recipients: the five cashiers and the owner.
Confirm receipt from each person.

## T-60m — freeze starts

1. Owner announces "freeze started" at an exact Istanbul time `T0`; staff close the legacy pages.
2. The operator records the **last accepted legacy entry time** (read-only):
   ```sql
   select max(created_at) as last_created, max(entry_time) as last_entry, count(*) as rows from public.daily_reports;
   ```
   (`supabase db query --linked "<sql>"`, SELECT only.) `last_created` must be earlier than `T0`.
3. Take backup per `PRODUCTION_BACKUP_RUNBOOK.md`.

## Verification that no legacy write occurred (all required)

Run twice, at least **10 minutes apart**, and once more immediately before the live apply:

1. `node legacy-migration/audit.mjs` — the output (`sourceRows`, `fingerprint`, X/Z counts, last date) must be **identical** across runs.
2. `max(created_at)`, `max(entry_time)` and `count(*)` above must be unchanged and `< T0`.
3. Optional cross-check of edits (not only inserts): the audit fingerprint already covers every imported column, so an edit of a historical row changes it.

Any difference ⇒ the freeze is not effective: **STOP**, identify who wrote (the row's cashier id / time), obtain the owner's decision, restart verification from step 1 with a new `T0`. A fingerprint taken before an effective freeze is never approvable.

## Final count and fingerprint

After two identical runs: record `sourceRows`, X/Z counts, first/last date, the five cashier ids shape, the **final fingerprint `F`**, and the importer plan `P` (rows + Balık + Dondurma). These feed the DATA APPLY STOP gate in `PRODUCTION_READINESS.md`.

## A cashier submits during the freeze

1. They are told (in advance) that an entry made during the freeze is not part of the migration.
2. The next verification run shows a changed fingerprint/count. The operator does **not** import it and does not delete it.
3. The owner decides, in writing, one of: (a) restart the verification with a new `T0` and a new final fingerprint that includes the entry (preferred, the entry is then reviewed in the dry run), or (b) record the entry in a hand-off list and enter it natively in V4 after cutover. Deleting or editing the legacy row is not allowed.
4. The incident is noted in the cutover evidence log.

## End of freeze / unfreeze

- **Migration completed:** the owner announces the end only after the post-apply checks pass. If the owner keeps the legacy app live in parallel during the pilot, entries made after the import are imported later as a **delta** (new freeze, new fingerprint, new dry run and approval; unchanged rows are skipped by hash, an edited historical row is rejected as drift and reviewed).
- **Migration aborted/rolled back:** the owner announces "freeze lifted"; staff re-enter the paper figures in the legacy app (the only system of record), the rows are verified against the paper, and no V4 data is relied upon. Because the freeze never altered legacy, there is nothing to undo technically.
- In both cases record the lift time and the final legacy `count(*)` in the evidence log.

## Owner approvals needed

1. Start of the freeze (time `T0`).
2. Acceptance of the verified final fingerprint `F` and plan `P`.
3. Lifting the freeze.
