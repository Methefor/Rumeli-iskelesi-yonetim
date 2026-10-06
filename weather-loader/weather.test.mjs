import test from "node:test";
import assert from "node:assert/strict";
import { createOpenMeteoProvider, localToInstant, normalizeOpenMeteoForecast, normalizeOpenMeteoObserved, ProviderError } from "./provider.mjs";
import { runLoader } from "./load.mjs";

// Synthetic Open-Meteo-shaped answer (Europe/Istanbul = UTC+3, no DST): no real location, no real data.
const forecastJson = () => ({
  utc_offset_seconds: 10800,
  current: { time: "2026-10-07T12:00", temperature_2m: 21.5, apparent_temperature: 20.1, weather_code: 2, precipitation: 0, wind_speed_10m: 12, wind_gusts_10m: 25 },
  hourly: {
    time: ["2026-10-07T23:00", "2026-10-08T00:00", "2026-10-08T01:00"],
    temperature_2m: [18, 17.5, null],
    apparent_temperature: [17, 16, 15],
    precipitation_probability: [10, 80, 90],
    precipitation: [0, 1.2, 0],
    weather_code: [3, 61, 61],
    wind_speed_10m: [10, 11, 12],
    wind_gusts_10m: [20, 22, 24],
  },
  daily: {
    time: ["2026-10-07", "2026-10-08"],
    temperature_2m_min: [15, 14],
    temperature_2m_max: [24, 22],
    precipitation_probability_max: [80, 20],
    precipitation_sum: [6, 0],
    wind_speed_10m_max: [30, 15],
    wind_gusts_10m_max: [45, 25],
    weather_code: [61, 1],
    sunrise: ["2026-10-07T06:55", "2026-10-08T06:56"],
    sunset: ["2026-10-07T18:05", "2026-10-08T18:03"],
  },
});

test("normalisation: local wall-clock times become UTC instants using the provider offset (hour and day boundary)", () => {
  assert.equal(localToInstant("2026-10-07T12:00", 10800), "2026-10-07T09:00:00.000Z");
  const n = normalizeOpenMeteoForecast(forecastJson());
  assert.equal(n.current.time, "2026-10-07T09:00:00.000Z");
  // local midnight 2026-10-08T00:00+03:00 is 21:00 UTC of the previous day: the day boundary is local, the instant is UTC
  assert.equal(n.hourly[1].time, "2026-10-07T21:00:00.000Z");
  assert.equal(n.daily[1].date, "2026-10-08");
  assert.equal(n.daily[0].sunrise, "2026-10-07T03:55:00.000Z");
});

test("normalisation: names, units and nulls (a missing value is null, never 0)", () => {
  const n = normalizeOpenMeteoForecast(forecastJson());
  assert.deepEqual(n.current, { time: "2026-10-07T09:00:00.000Z", temperatureC: 21.5, apparentTemperatureC: 20.1, weatherCode: 2, precipitationMm: 0, windKmh: 12, windGustKmh: 25 });
  assert.equal(n.hourly[2].temperatureC, null);
  assert.equal(n.hourly[1].precipitationProbability, 80);
  assert.equal(n.daily[0].precipitationSumMm, 6);
  assert.equal(n.generatedAt, null, "the provider does not say when the forecast was issued: nothing is invented");
  const noGust = forecastJson();
  delete noGust.current.wind_gusts_10m;
  assert.equal(normalizeOpenMeteoForecast(noGust).current.windGustKmh, null);
});

test("an unusable provider response is rejected, not stored as zeros", () => {
  assert.throws(() => normalizeOpenMeteoForecast({}), ProviderError);
  const noTemp = forecastJson();
  noTemp.current.temperature_2m = null;
  assert.throws(() => normalizeOpenMeteoForecast(noTemp), /no time or temperature/);
});

test("observed (archive) normalisation maps to the context columns", () => {
  const rows = normalizeOpenMeteoObserved({ daily: { time: ["2026-10-05"], temperature_2m_mean: [18.5], temperature_2m_min: [13], temperature_2m_max: [23], apparent_temperature_mean: [17], precipitation_sum: [2.4], wind_speed_10m_max: [14], wind_gusts_10m_max: [31], weather_code: [61] } });
  assert.deepEqual(rows, [{ date: "2026-10-05", values: { temperatureC: 18.5, temperatureMinC: 13, temperatureMaxC: 23, apparentTemperatureC: 17, precipitationMm: 2.4, windKmh: 14, windGustKmh: 31, weatherCode: 61 } }]);
});

test("provider failures: network error, HTTP error and non-JSON each fail cleanly", async () => {
  const boom = createOpenMeteoProvider({ fetch: async () => { throw new TypeError("fetch failed"); } });
  await assert.rejects(boom.fetchForecast({ latitude: 1, longitude: 1, timezone: "Europe/Istanbul" }), (e) => e.code === "provider_unreachable");
  const http = createOpenMeteoProvider({ fetch: async () => ({ ok: false, status: 503 }) });
  await assert.rejects(http.fetchForecast({ latitude: 1, longitude: 1, timezone: "Europe/Istanbul" }), (e) => e.code === "provider_http");
  const junk = createOpenMeteoProvider({ fetch: async () => ({ ok: true, json: async () => { throw new Error("x"); } }) });
  await assert.rejects(junk.fetchForecast({ latitude: 1, longitude: 1, timezone: "Europe/Istanbul" }), (e) => e.code === "provider_shape");
});

test("the provider request is branch-specific, keyless and uses the branch time zone", async () => {
  let url = "";
  const p = createOpenMeteoProvider({ fetch: async (u) => { url = String(u); return { ok: true, json: async () => forecastJson() }; } });
  await p.fetchForecast({ latitude: 40.5, longitude: 29.5, timezone: "Europe/Istanbul" });
  assert.match(url, /latitude=40.5/);
  assert.match(url, /longitude=29.5/);
  assert.match(url, /timezone=Europe%2FIstanbul/);
  assert.doesNotMatch(url, /apikey|api_key|key=/i);
});

const fakeProvider = (impl, extra = {}) => ({ name: "open-meteo", historicalProvenance: "reanalysis", fetchForecast: impl, fetchObservedDaily: impl, ...extra });
const memoryDb = (branches) => {
  const stored = [];
  const observed = [];
  return { stored, observed, listBranches: async () => branches, storeForecast: async (x) => stored.push(x), upsertObserved: async (x) => (observed.push(x), x.date === "2026-10-04" ? "skipped_other_source" : "inserted") };
};

test("loader: a branch without coordinates is skipped (never guessed); others are still loaded", async () => {
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 40.5, longitude: 29.5 }, { id: "b2", timezone: "Europe/Istanbul", latitude: null, longitude: null }]);
  const res = await runLoader({ db, provider: fakeProvider(async () => normalizeOpenMeteoForecast(forecastJson())), mode: "forecast", now: new Date("2026-10-07T09:10:00Z") });
  assert.deepEqual(res, [{ branchId: "b1", status: "stored" }, { branchId: "b2", status: "skipped", reason: "missing_branch_location" }]);
  assert.equal(db.stored.length, 1);
});

test("loader: forecast validity is NOT decided by the loader (the database applies its central technical TTL); an explicit override is passed through", async () => {
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 40.5, longitude: 29.5 }]);
  await runLoader({ db, provider: fakeProvider(async () => normalizeOpenMeteoForecast(forecastJson())), mode: "forecast", now: new Date("2026-10-07T09:10:00Z") });
  const s = db.stored[0];
  assert.equal(s.fetchedAt, "2026-10-07T09:10:00.000Z");
  assert.equal(s.validUntil, null, "no hard-coded TTL in the loader");
  const o = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 40.5, longitude: 29.5 }]);
  await runLoader({ db: o, provider: fakeProvider(async () => normalizeOpenMeteoForecast(forecastJson())), mode: "forecast", now: new Date("2026-10-07T09:10:00Z"), ttlMinutes: 30 });
  assert.equal(o.stored[0].validUntil, "2026-10-07T09:40:00.000Z", "an explicit override is honoured");
  assert.deepEqual(Object.keys(s.payload), ["current", "hourly", "daily"]);
  assert.equal(s.provider, "open-meteo");
});

test("loader: a provider failure stores NOTHING (the old forecast just becomes stale) and does not stop other branches", async () => {
  let calls = 0;
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 1, longitude: 1 }, { id: "b2", timezone: "Europe/Istanbul", latitude: 2, longitude: 2 }]);
  const provider = fakeProvider(async () => { calls += 1; if (calls === 1) throw new ProviderError("provider_unreachable", "x"); return normalizeOpenMeteoForecast(forecastJson()); });
  const res = await runLoader({ db, provider, mode: "forecast", now: new Date("2026-10-07T09:10:00Z") });
  assert.deepEqual(res.map((r) => r.status), ["failed", "stored"]);
  assert.equal(res[0].reason, "provider_unreachable");
  assert.equal(db.stored.length, 1);
});

test("loader (observed): completed days only; today and the future are never written as observed; skipped rows are counted", async () => {
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 1, longitude: 1 }]);
  const provider = fakeProvider(async () => ["2026-10-04", "2026-10-05", "2026-10-07", "2026-10-08"].map((date) => ({ date, values: { temperatureC: 18 } })));
  const res = await runLoader({ db, provider, mode: "observed", now: new Date("2026-10-07T09:10:00Z"), days: 7 });
  assert.deepEqual(db.observed.map((o) => o.date), ["2026-10-04", "2026-10-05"]);
  assert.deepEqual(res[0], { branchId: "b1", status: "observed", inserted: 1, updated: 0, skipped: 1 });
  assert.ok(db.observed.every((o) => o.source === "open-meteo"));
  assert.ok(db.observed.every((o) => o.provenance === "reanalysis"), "historical rows carry the provider-declared provenance (archive = reanalysis, never observed)");
});

test("forecast mode never writes history, even when the forecast daily block contains past dates", async () => {
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 1, longitude: 1 }]);
  const json = forecastJson();
  json.daily.time = ["2026-10-05", "2026-10-06"]; // past dates inside a forecast payload
  await runLoader({ db, provider: fakeProvider(async () => normalizeOpenMeteoForecast(json)), mode: "forecast", now: new Date("2026-10-07T09:10:00Z") });
  assert.equal(db.stored.length, 1);
  assert.equal(db.observed.length, 0, "a forecast never becomes historical context by itself");
});

test("observed mode uses ONLY the historical endpoint (never the forecast/current call) and refuses a provider without declared provenance", async () => {
  const db = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 1, longitude: 1 }]);
  let forecastCalls = 0;
  const provider = { name: "open-meteo", historicalProvenance: "reanalysis", fetchForecast: async () => { forecastCalls += 1; throw new Error("must not be called"); }, fetchObservedDaily: async () => [{ date: "2026-10-05", values: { temperatureC: 18 } }] };
  await runLoader({ db, provider, mode: "observed", now: new Date("2026-10-07T09:10:00Z") });
  assert.equal(forecastCalls, 0);
  assert.equal(db.observed.length, 1);
  const noProv = { name: "x-provider", fetchObservedDaily: async () => [{ date: "2026-10-05", values: {} }] };
  const db2 = memoryDb([{ id: "b1", timezone: "Europe/Istanbul", latitude: 1, longitude: 1 }]);
  const res = await runLoader({ db: db2, provider: noProv, mode: "observed", now: new Date("2026-10-07T09:10:00Z") });
  assert.deepEqual(res, [{ branchId: "b1", status: "failed", reason: "no_historical_provenance" }]);
  assert.equal(db2.observed.length, 0);
});

test("the Open-Meteo provider declares reanalysis (modelled) history and requests the archive endpoint for history", async () => {
  let url = "";
  const p = createOpenMeteoProvider({ fetch: async (u) => { url = String(u); return { ok: true, json: async () => ({ daily: { time: [] } }) }; } });
  assert.equal(p.historicalProvenance, "reanalysis");
  await p.fetchObservedDaily({ latitude: 1, longitude: 1, timezone: "Europe/Istanbul", from: "2026-10-01", to: "2026-10-05" });
  assert.match(url, /archive-api\.open-meteo\.com/);
  assert.doesNotMatch(url, /forecast/);
});

test("the loader refuses a hosted target before any request", async () => {
  const { spawnSync } = await import("node:child_process");
  const run = spawnSync(process.execPath, ["weather-loader/load.mjs", "--forecast", "--target-ref=abcdefghijklmnopqrst"], {
    encoding: "utf8",
    env: { ...process.env, TARGET_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co", TARGET_SUPABASE_SERVICE_ROLE_KEY: "sb_secret_dummy" },
  });
  assert.notEqual(run.status, 0);
  assert.match(run.stderr, /refused/);
});
