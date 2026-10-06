#!/usr/bin/env node
/**
 * Weather LOADER (LOCAL ONLY in V1). Fetches branch-specific weather through the provider abstraction and stores the NORMALISED
 * result with the existing service-role-only database functions. It is NOT deployed anywhere and never touches production:
 * only a local stack (127.0.0.1) is accepted, hosted targets are refused before any request.
 *
 *   TARGET_SUPABASE_URL=http://127.0.0.1:54321 TARGET_SUPABASE_SERVICE_ROLE_KEY=<local service key> \
 *     node weather-loader/load.mjs --target-ref=local --forecast
 *   ... --observed --days=7        (completed days only, source 'open-meteo'; manual context rows are never overwritten)
 *
 * Branch location: a branch WITHOUT coordinates is skipped with reason missing_branch_location (never guessed, never device location).
 * One failing branch/provider call never stops the others, and a failure stores nothing: the previous forecast simply becomes
 * stale in the app (shown with its timestamp).
 *
 * Forecast validity is NOT decided here: by default the database applies its central technical TTL (weather_settings.forecast_ttl_minutes,
 * default 60, a technical default and not a risk threshold). `--ttl-minutes=N` is an explicit one-off override.
 * Historical context comes ONLY from the provider's historical endpoint, stored with the provider's declared provenance (Open-Meteo
 * archive = 'reanalysis'); a forecast or current payload is never written as history.
 */
import { pathToFileURL } from "node:url";
import { GuardError, assertServiceKey, resolveTarget } from "../legacy-migration/guards.mjs";
import { createOpenMeteoProvider } from "./provider.mjs";

const istanbulDate = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul" }).format(d);
const addDays = (iso, n) => new Date(Date.UTC(...iso.split("-").map((x, i) => (i === 1 ? Number(x) - 1 : Number(x))), 0) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * Core, side-effect free apart from the injected `db` and `provider`:
 *   db.listBranches() -> [{ id, name, timezone, latitude, longitude }]
 *   db.storeForecast({ branchId, provider, fetchedAt, generatedAt, validUntil, payload })
 *   db.upsertObserved({ branchId, date, values, source, provenance }) -> 'inserted' | 'updated' | 'skipped_other_source'
 * `ttlMinutes`: null (default) = let the database apply its central TTL; a number = explicit override for this run.
 */
export async function runLoader({ db, provider, mode, now = new Date(), days = 7, ttlMinutes = null }) {
  const results = [];
  for (const branch of await db.listBranches()) {
    if (branch.latitude === null || branch.longitude === null || branch.latitude === undefined) {
      results.push({ branchId: branch.id, status: "skipped", reason: "missing_branch_location" });
      continue;
    }
    try {
      const where = { latitude: branch.latitude, longitude: branch.longitude, timezone: branch.timezone ?? "Europe/Istanbul" };
      if (mode === "forecast") {
        const forecast = await provider.fetchForecast(where);
        const fetchedAt = new Date(now);
        await db.storeForecast({
          branchId: branch.id,
          provider: provider.name,
          fetchedAt: fetchedAt.toISOString(),
          generatedAt: forecast.generatedAt,
          validUntil: ttlMinutes === null ? null : new Date(fetchedAt.getTime() + ttlMinutes * 60_000).toISOString(),
          payload: { current: forecast.current, hourly: forecast.hourly, daily: forecast.daily },
        });
        results.push({ branchId: branch.id, status: "stored" });
      } else {
        if (!provider.historicalProvenance) throw Object.assign(new Error("provider declares no historical provenance"), { code: "no_historical_provenance" });
        const today = istanbulDate(now);
        const rows = await provider.fetchObservedDaily({ ...where, from: addDays(today, -days), to: addDays(today, -1) });
        const outcome = { inserted: 0, updated: 0, skipped: 0 };
        for (const row of rows) {
          if (row.date >= today) continue; // today and the future are forecasts, never "observed"
          const r = await db.upsertObserved({ branchId: branch.id, date: row.date, values: row.values, source: provider.name, provenance: provider.historicalProvenance });
          outcome[r === "inserted" ? "inserted" : r === "updated" ? "updated" : "skipped"] += 1;
        }
        results.push({ branchId: branch.id, status: "observed", ...outcome });
      }
    } catch (error) {
      results.push({ branchId: branch.id, status: "failed", reason: error?.code ?? "error" });
    }
  }
  return results;
}

/** PostgREST adapter for a LOCAL stack. */
export function createRestDb({ url, serviceKey, fetch: fetchImpl = globalThis.fetch }) {
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  const call = async (path, init) => {
    const res = await fetchImpl(`${url}/rest/v1/${path}`, { headers, ...init });
    if (!res.ok) throw Object.assign(new Error(await res.text()), { code: `db_${res.status}` });
    return res.status === 204 ? null : res.json();
  };
  return {
    async listBranches() {
      const branches = await call("branches?select=id,name,timezone&is_active=eq.true");
      const locations = await call("branch_locations?select=branch_id,latitude,longitude");
      return branches.map((b) => {
        const l = locations.find((x) => x.branch_id === b.id);
        return { id: b.id, name: b.name, timezone: b.timezone, latitude: l?.latitude ?? null, longitude: l?.longitude ?? null };
      });
    },
    async storeForecast({ branchId, provider, fetchedAt, generatedAt, validUntil, payload }) {
      await call("rpc/internal_store_weather_forecast", {
        method: "POST",
        body: JSON.stringify({ p_branch_id: branchId, p_provider: provider, p_fetched_at: fetchedAt, p_generated_at: generatedAt, p_valid_until: validUntil, p_payload: payload }),
      });
    },
    async upsertObserved({ branchId, date, values, source, provenance }) {
      return call("rpc/internal_upsert_observed_weather", { method: "POST", body: JSON.stringify({ p_branch_id: branchId, p_date: date, p_values: values, p_source: source, p_provenance: provenance }) });
    },
  };
}

function parseArgs(argv) {
  const out = { mode: null, days: 7, targetRef: null, ttlMinutes: null };
  for (const a of argv) {
    if (a === "--forecast") out.mode = "forecast";
    else if (a === "--observed") out.mode = "observed";
    else if (a.startsWith("--days=")) out.days = Math.max(1, Math.min(31, Number(a.slice(7)) || 7));
    else if (a.startsWith("--ttl-minutes=")) out.ttlMinutes = Math.max(5, Math.min(1440, Number(a.slice(14)) || 60));
    else if (a.startsWith("--target-ref=")) out.targetRef = a.slice(13);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (!args.mode) throw new GuardError("mode_required", "Pass --forecast or --observed.");
    const url = (process.env.TARGET_SUPABASE_URL ?? "").replace(/\/$/, "");
    const target = resolveTarget({ url, targetRef: args.targetRef });
    if (target.kind !== "local") throw new GuardError("local_only", "The weather loader accepts only a local stack in V1.");
    const key = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
    assertServiceKey(key);
    const results = await runLoader({ db: createRestDb({ url, serviceKey: key }), provider: createOpenMeteoProvider(), mode: args.mode, days: args.days, ttlMinutes: args.ttlMinutes });
    console.log(JSON.stringify(results, null, 2));
    process.exitCode = results.some((r) => r.status === "failed") ? 2 : 0;
  } catch (error) {
    console.error(`weather-loader refused: ${error?.code ?? "error"}: ${error?.message}`);
    process.exitCode = 1;
  }
}
