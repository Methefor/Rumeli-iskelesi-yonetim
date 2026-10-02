# Legacy sales migration

This package migrates the existing `daily_reports` history without changing or
deleting the legacy tables. It reads only the columns required by the V4 model;
cashier names and legacy PINs are never fetched.

Safety properties:

- `audit.mjs` is read-only and prints aggregate evidence only.
- `run.mjs` defaults to a transactional dry run.
- Apply requires the exact audited SHA-256 fingerprint.
- Hosted apply is disabled in the script. Production execution follows a
  separately reviewed runbook and explicit owner approval.
- Every imported report has a source link and source hash. A later source edit
  is rejected as drift instead of silently overwriting V4 history.
- `total_revenue` is not trusted. Rumeli revenue is reconstructed from
  `rumeli_z1 + rumeli_z2`; Balık Ekmek and Dondurma remain separate branches.
- `sabah` maps to X, `aksam` maps to Z. Management revenue uses Z reports, so X
  and Z are never added together.
- Old `cafetarya` and `restoran` register keys are retained as inactive
  historical registers rather than guessed to be today's devices.
- Balık Ekmek/Dondurma category splits are unavailable in the legacy table.
  Their gross revenue is preserved and the missing breakdown remains visibly
  unreconciled.

The cashier-map file maps legacy cashier UUIDs to already-provisioned V4
employee codes. Never put PINs in this file and never commit a real mapping.

The owner-confirmed current roster is in `identity-data/approved_staff.csv`.
Only the two legacy identities who are still active map to active V4 profiles
(`K001`/`K002`). The other three legacy identities have historical reports but
are no longer current staff: create inactive, no-login archival profiles for
them and map their legacy UUIDs to those profiles. Do not reassign their reports
to a current cashier and do not add them to the active roster. The three newly
confirmed cashiers without legacy history require no entry in the legacy map.

```text
node legacy-migration/audit.mjs
node legacy-migration/run.mjs --actor=<owner-code> --cashier-map=<private-json>
```
