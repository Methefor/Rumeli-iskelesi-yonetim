# Restricted real-backend pilot frontend (prepared 2026-10-05 — NOT created, NOT deployed)

Execution status: **OPEN.** Creating the Vercel project and deploying it are Vercel
configuration/deployment actions: **REQUIRES EXPLICIT OWNER APPROVAL BEFORE
EXECUTION**. Nothing here changed Vercel, the legacy production domain or the demo
Preview.

## What exists today (read-only inspection, 2026-10-04/05)

| Item | State |
|---|---|
| Vercel project `rumeli-iskelesi-yonetim` | Production alias `rumeli-iskelesi-yonetim.vercel.app` serves branch `main` = the **legacy** static app (`main/vercel.json`: no framework, rewrites `/admin`, `/cashier`, `/entry`). |
| `v4-2027` pushes | become **Preview** deployments of the same project. |
| Project environment variables | **Preview only**: `VITE_DEMO_MODE`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. **Production has none.** Preview is synthetic (`VITE_DEMO_MODE=true`, DEMO/PREVIEW banner). |
| `v4-2027/vercel.json` | Vite build (`cd app && npm install && npm run build`, output `app/dist`). |

## Rules that stay in force

1. The legacy production frontend stays active as the fallback; its domain and alias are never repointed by the pilot.
2. The existing Preview stays synthetic: `VITE_DEMO_MODE=true`, DEMO / PREVIEW visible, never pointed at production data. No Preview variable is edited, added or removed.
3. The pilot uses the **real** V4 backend with `VITE_DEMO_MODE=false`.
4. Only the normal **public anon key** is ever shipped to a browser. No service-role key, no `VITE_*` secret, no PIN. Edge Functions use their own platform-provided secrets server-side.
5. Pilot access is limited to approved pilot users.
6. Rollback = delete/disable the pilot deployment (or restore legacy); nothing else has to change.
7. No automatic switch of any public production alias.

## Selected approach: separate, CLI-deployed pilot project (no git integration, no stored variables)

1. **A new, separate Vercel project** `rumeli-v4-pilot` under the same account (no cost on the current plan; verify the plan's project limit before creating it). It is **not** connected to the Git repository, so a push can never redeploy it and it can never inherit the Preview variables.
2. **Variables are not stored in Vercel at all.** The pilot bundle is built on the operator machine with the values supplied in the *shell*:
   ```bash
   cd app
   export VITE_DEMO_MODE=false
   export VITE_SUPABASE_URL=https://iwikwbjsznjuefvuemdb.supabase.co
   export VITE_SUPABASE_ANON_KEY=<public anon key, from the dashboard>
   npm run build:pilot
   ```
   `build:pilot` first runs `scripts/assert-pilot-build.mjs` (fail-closed: demo must be explicitly `false`, URL must be the approved production project, key must be an anon/publishable key, no secret-named `VITE_*` variable) and, after the build, scans `dist/` for service-role markers and demo placeholders. Values from `.env*` files are deliberately not trusted (a developer `app/.env.local` can hold other targets). Tested by `scripts/assert-pilot-build.test.mjs` (3 tests, `npm run test:scripts`).
3. **Deploy the prebuilt output** of the approved commit only (record its SHA): from a directory linked to the pilot project, `vercel deploy --prebuilt --prod` (or deploy `app/dist` as a static build). No Production alias of the legacy project is touched; the pilot has its own URL.
4. **Who can use it (restricted):**
   - the URL is shared only with the pilot users;
   - the real backend accepts only provisioned accounts: **before the pilot passes, only `M001` and the two chosen pilot cashiers exist** (the other roster accounts are provisioned after a GO), archival `H###` accounts cannot log in, and PIN lockout applies;
   - optional extra layer, only if the plan allows it without cost: Vercel password/authentication protection on the pilot project (the owner decides; the demo project's Deployment Protection is not touched).
5. **Supabase side needs nothing special:** PWA service worker never caches Supabase responses; CORS is the Supabase default; the pilot origin needs no allow-list change for PIN login (the Edge Functions answer to the anon key).

### Rollback

- Fastest: remove the pilot project's domain/alias or delete the project (`vercel remove rumeli-v4-pilot`); users are told to use the legacy URLs, which never changed.
- Data-side rollback is separate (`PRODUCTION_ROLLBACK_RUNBOOK.md`).

### Why not the alternatives

| Option | Rejected because |
|---|---|
| Put real variables on the existing project's Preview | breaks "Preview stays synthetic"; a real-backend page would carry the DEMO-free build on a public Preview URL |
| Branch-scoped Preview variables for `v4-pilot` | still changes the project that owns the legacy production alias; the preview URL is behind Vercel Authentication so cashiers could not open it |
| Switch the Production alias of the current project | forbidden (legacy must stay the fallback) |
| Git-connected second project with stored variables | any push redeploys the pilot; secrets/config live in Vercel |

## Checklist before the owner approves execution

- [ ] Approved commit SHA recorded; `npm run typecheck && lint && test && build:pilot` green on it.
- [ ] Schema, Edge Functions, identities, operating data and import are done and verified (`PRODUCTION_CUTOVER_RUNBOOK.md`).
- [ ] Only the pilot accounts are provisioned.
- [ ] Owner approves: project creation, first deployment, who receives the URL.
- [ ] Rollback owner and the previous-state notes recorded.
