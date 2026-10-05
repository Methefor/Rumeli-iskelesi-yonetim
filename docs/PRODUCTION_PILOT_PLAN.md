# Production pilot plan (prepared 2026-10-04 — not started)

The pilot starts only after: schema applied and verified, identities provisioned,
operating data loaded, legacy import applied and `post_apply_checks.sql` green
(all STOP gates of `PRODUCTION_CUTOVER_RUNBOOK.md`). The legacy app stays live
and authoritative for everyone outside the pilot; pilot users also keep the legacy
app as their fallback. Starting the pilot **REQUIRES EXPLICIT OWNER APPROVAL
BEFORE EXECUTION**.

## Cohort (smallest useful, from `identity-data/approved_staff.csv`)

| Seat | Account | Why |
|---|---|---|
| Owner | `M001` | manager dashboard, Management Center, reconciliation, approvals |
| 1 Rumeli cashier | one of `K001`/`K002`/`K003` (owner picks; `K001`/`K002` also have imported history) | register-based X/Z flow, 3-day rule |
| 1 İskele Dondurma cashier | `D001` or `D002` (owner picks) | single daily shift, stock/count/waste |

No other account is announced or given a PIN until the pilot passes. Real names
are not hard-coded here beyond what `approved_staff.csv` already tracks.

## Duration and rhythm

At least **3 consecutive business days** covering one full evening shift per
branch each day (the legacy app is used in parallel; every V4 report is compared
with the legacy entry for the same shift/register). The owner logs a daily
GO/PAUSE/ROLLBACK note.

## Checklist (every item must be exercised at least once; record PASS/FAIL)

| # | Check | Pass criterion |
|---|---|---|
| 1 | PIN login (owner + 2 cashiers) | success; wrong PIN refused with one generic message; lockout after repeated failures; no PIN in any URL/log |
| 2 | Session restore | closing/reopening the PWA or refreshing keeps the session; a deactivated test account is refused within one request |
| 3 | Shift | assigned shift visible; Rumeli Sabah/Akşam, Dondurma/Balık Ekmek single `daily` shift |
| 4 | Report entry | X (morning) and Z (evening) saved with correct totals; duplicate X/Z refused; cutoff respected (Istanbul) |
| 5 | 3-day back-dated rule | cashier can enter today and the previous 3 Istanbul days; older refused; only owner/manager with a reason beyond 3 days |
| 6 | Reconciliation | OK/WARNING/ERROR as expected; owner override needs a reason and is audited; queue opens from the dashboard |
| 7 | Receipt OCR | a real supplier receipt photo is read, lines reviewed/edited by the cashier before saving; permissions as designed (cashier receiving, no cost visibility) |
| 8 | Stock receive | quantities correct, append-only ledger entry, cashier cannot see unit cost |
| 9 | Waste / count (Dondurma, where inventory applies) | waste with reason code; count shows variance without rewriting the ledger |
| 10 | Manager dashboard | totals equal the legacy figures for the same period (Z-based, X never added); missing data shows "Veri yok", partial gross profit shows "Kısmi"; **492 historical flagged reports** are understood by the owner (see import dry-run doc) |
| 11 | Shift-change request | cashier files a request; manager approves/rejects; both audited |
| 12 | Logout / login | clean sign-out, no leftover data on a shared device |
| 13 | Mobile PWA | install to home screen, update notice works, 360 px layout clean, offline notice does not cache business data |
| 14 | Fallback to legacy | pilot cashier can enter the same shift in the legacy app at any moment; verified once deliberately |
| 15 | Identity | only the 6 active accounts can sign in; `H001–H003` cannot; `post_apply_checks.sql` identity rows PASS |

## GO / PAUSE / ROLLBACK criteria

**GO** (continue the pilot / proceed to the next gate) — all of:
- checks 1–15 PASS (or accepted by the owner in writing with a reason);
- for every pilot shift the V4 total equals the legacy total to the kuruş;
- `post_apply_checks.sql` still 0 FAIL after the pilot's own data;
- no security finding, no unexplained RLS denial, no lost report.

**PAUSE** (stop new V4 entries, staff use legacy, investigate; resume only on owner approval) — any of:
- one cashier cannot sign in or loses a session repeatedly;
- a total differs from legacy by any amount (even 1 kuruş) until explained;
- a UI/OCR defect that blocks entry but loses no data;
- a post-apply check turns INFO→FAIL; Vercel/Supabase incident;
- the owner finds the reconciliation queue unworkable (historical flood) and wants a decision first.

**ROLLBACK** (execute `PRODUCTION_ROLLBACK_RUNBOOK.md`) — any of:
- data-integrity defect: a report attributed to the wrong person/branch, a duplicate/missing report, lineage corruption, an active archival profile, any write to a legacy table;
- an authorization failure (a cashier sees cost, another branch's data or manager functions; a deactivated user keeps access);
- a security incident (credential exposure, unexpected public access);
- the legacy app is affected by V4 (Data API errors after the pre-request hook) and emergency step 0 does not restore it;
- the owner withdraws approval.

## Exit

The pilot ends with a written owner decision: GO (schedule frontend activation for
all staff), PAUSE (list of defects), or ROLLBACK. Frontend activation for everyone
is a **separate** approval; Vercel Production is not changed by the pilot.
