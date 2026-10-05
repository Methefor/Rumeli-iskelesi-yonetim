# Legacy identity mapping runbook (prepared 2026-10-04)

Purpose: attach the five legacy cashier identities that own historical
`daily_reports` rows to V4 profiles **without** reassigning history to current
staff and **without** migrating any credential. No production user is created by
this document.

## Principles

- Active current staff and historical authorship are different concepts.
- Two of the five legacy identities are still-working cashiers → they map to
  their real V4 profiles (`K001`, `K002`).
- The other three are former staff → they map to **inactive, no-login archival
  profiles** `H001`, `H002`, `H003`. Their reports stay attributed to them.
- The three newly confirmed cashiers (`K003`, `D001`, `D002`) have **no** legacy
  history and need no map entry.
- The map lives in `legacy-migration/private/cashier-map.json` (gitignored). It
  contains legacy UUIDs and employee codes only — never names, PINs, tokens.

## Classification of the five legacy identifiers

| Legacy identity (private UUID) | Classification | V4 target |
|---|---|---|
| legacy cashier A | still active staff | `K001` (Tuba Bozaklı) |
| legacy cashier B | still active staff | `K002` (Ceren Erdem) |
| legacy cashier C | former staff | `H001` (inactive archival) |
| legacy cashier D | former staff | `H002` (inactive archival) |
| legacy cashier E | former staff | `H003` (inactive archival) |

Which UUID is which person is established **only** by the owner, by comparing
the legacy `cashiers.name` of each UUID with `approved_staff.csv`, in a private
review (names are never fetched by any tool, never committed, never printed).
A private map file exists on the operator machine; on 2026-10-04 it was verified
(shape only, no values read out) to cover exactly the five current source cashier
ids. The owner's name-to-code review of that file is still an owner step before
the production import.

## Private runtime mapping format

```json
{
  "<legacy-cashier-uuid-1>": "K001",
  "<legacy-cashier-uuid-2>": "K002",
  "<legacy-cashier-uuid-3>": "H001",
  "<legacy-cashier-uuid-4>": "H002",
  "<legacy-cashier-uuid-5>": "H003"
}
```

Template without real values: `legacy-migration/cashier-map.template.json`.

## Validation rules (enforced in code — `legacy-migration/guards.mjs`)

1. The map is a non-empty JSON object; every key is a UUID, every value matches
   `^[A-Z][0-9]{2,4}$` (so a PIN-like key/value is refused).
2. **Duplicate protection:** two legacy identities cannot map to the same V4
   profile (`cashier_map_duplicate`); inside the database a legacy id already
   mapped to a different profile is rejected (`legacy cashier … already mapped`).
3. **Exact coverage:** the keys must equal the set of cashier ids found in the
   legacy `cashiers` table — no missing, no unknown (`cashier_map_coverage`). An
   unmapped cashier in any report also aborts and rolls back the whole import.
4. Every referenced employee code must already exist as a V4 profile
   (`employee code … does not exist` otherwise).
5. The importer never accepts names or PINs; the DB function has no such column.

## No-login guarantee for archival profiles

Verified locally by `supabase/tests/legacy_import_rehearsal.test.mjs` and, in
production after import, by `legacy-migration/post_apply_checks.sql` (checks 42–46):

- `profiles.is_active = false` (the `enforce_active_user` hook also refuses any
  JWT of an inactive profile on every Data API call);
- **no** `pin_credentials` row (the `pin-login` function cannot authenticate it);
- no role and no branch membership;
- Auth user banned (`ban_duration`) with a random password nobody knows and an
  `@archive.invalid` address;
- the import itself creates no credential.

## Workflow (executed only at the approved identity step)

1. Prerequisite: gate D done — owner + five active cashiers + `H001–H003`
   provisioned (`PRODUCTION_IDENTITY_PLAN.md`).
2. Owner builds the private map (above) on the operator machine; file stays in
   `legacy-migration/private/` (gitignored). Never print its contents.
3. Check shape only (no values): `node -e "const m=JSON.parse(require('fs').readFileSync('legacy-migration/private/cashier-map.json','utf8'));console.log(Object.keys(m).length,[...new Set(Object.values(m))].sort().join(','))"`
   → expected `5 H001,H002,H003,K001,K002`.
4. The importer re-validates it (guards) and the database re-validates it
   (profile existence, no remap) on every run.

## Authorship verification query (after import; codes and counts only)

```sql
select p.employee_code, p.is_active, count(*) as reports
from public.sales_reports sr
join public.legacy_sales_report_links l on l.sales_report_id = sr.id
join public.profiles p on p.id = sr.submitted_by
group by 1, 2 order by 1;
```

Expected: exactly the five codes `H001, H002, H003, K001, K002`; the three `H###`
rows `is_active = false`. The counts must equal the per-person counts predicted
from the source through the private map: the rehearsal computes them
independently (2026-10-04 snapshot: `H001=261 H002=118 H003=50 K001=303 K002=110`,
total 842) and the cutover must reproduce the numbers of the **final**
fingerprint. Also run `post_apply_checks.sql` checks 41–46.

## Stop conditions

Any of: map keys ≠ source cashier ids; a value that is not an existing profile; an
`H###` profile active or with a PIN; a duplicate target; a report attributed to a
profile outside the five codes → **STOP, do not import / roll back per
`PRODUCTION_ROLLBACK_RUNBOOK.md`**.
