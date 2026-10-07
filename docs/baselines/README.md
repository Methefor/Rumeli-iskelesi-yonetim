# docs/baselines

`production_baseline_2026-10-07.json` is an **AUDIT-TIME BASELINE ONLY - NOT VALID AS THE FUTURE APPLY BASELINE.**

Legacy production keeps receiving writes (for example `daily_reports` 547 -> 549 and `entry_history` 215 -> 216 between two audits on the same day), so this file
documents what was measured on 2026-10-07 and nothing else. It is catalog + counts only (no row contents, no secrets).

No old baseline may satisfy Gate A. The apply runbook requires a fresh **T-60** backup + baseline and an immediate pre-write **T-0** baseline.
`supabase/audit/verify_post_apply.mjs` refuses (exit 2) any input file that carries `_captured.audit_time_baseline_only`.
