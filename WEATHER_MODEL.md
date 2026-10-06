# Weather Model (Phase 1D)

Status: **local development only**. Nothing is deployed, no hosted function exists, no provider is called from the app or from SQL, and
nothing was applied to production.

## 1. Two separate concepts

| Concept | Meaning | Storage |
|---|---|---|
| **Historical daily context** | weather of a COMPLETED business date from an explicitly HISTORICAL source, with provenance | `external_context_daily` (existing analytics input; new nullable columns `temperature_min_c`, `temperature_max_c`, `wind_gust_kmh`, `weather_code`, `provenance`, `source_retrieved_at`; `temperature_c` = daily mean) |
| **Forecast** | what weather is expected (mutable by nature) | `weather_forecast_snapshots` (append-only, one row per fetch) |

**A forecast or a "current" payload never becomes history.** Historical rows come only from `fetchObservedDaily` of a historical-capable endpoint
(Open-Meteo's *archive* API) through `internal_upsert_observed_weather`, which refuses today/future, refuses any provenance except
`observed | reanalysis | provider_historical` (a forecast/current/manual provenance is rejected), and never overwrites a manual row or a row of
another source. The loader's forecast mode never calls it, even if a forecast payload contains past dates (tested).

**Provenance** (`external_context_daily.provenance`, exposed in the analytics context payload next to `source`):

| provenance | meaning |
|---|---|
| `manual` | entered/edited by a person through the audited RPC (a trigger forces manual provenance for any `source = 'manual'` row, also when a person edits a loader row) |
| `observed` | direct measurement guaranteed by the source (none is wired in V1) |
| `reanalysis` | modelled historical re-computation. **Open-Meteo archive = reanalysis**, so V1 history is stored as `reanalysis` and never labelled observed |
| `provider_historical` | another provider-supported historical source |

`source_retrieved_at` records when the row was fetched. Manual rows are never overwritten automatically. Forecast snapshots stay separate
and immutable (append-only trigger). Analytics snapshots are immutable versions, so they stay
reproducible: a changed context only shows up when a new snapshot version is generated.

## 2. Provider abstraction (`weather-loader/`)

`provider.mjs` defines the `WeatherProvider` contract (`fetchForecast`, `fetchObservedDaily`, `name`) and the V1 implementation
`createOpenMeteoProvider` (keyless; `fetch` injectable so tests never touch the network). All provider specifics (variable names, local
timestamps + `utc_offset_seconds`, units) stop inside `normalizeOpenMeteoForecast` / `normalizeOpenMeteoObserved`; SQL and the app only see:

```
{ "current": {time, temperatureC, apparentTemperatureC, weatherCode, precipitationMm, windKmh, windGustKmh},
  "hourly":  [{time, temperatureC, apparentTemperatureC, precipitationProbability, precipitationMm, weatherCode, windKmh, windGustKmh}],
  "daily":   [{date, temperatureMinC, temperatureMaxC, precipitationProbabilityMax, precipitationSumMm, windMaxKmh, windGustMaxKmh,
               weatherCode, sunrise, sunset}] }
```
Times are UTC instants; daily `date` is the branch-local calendar date; a value the provider did not return is `null`, never 0;
`generatedAt` is `null` when the provider does not say when the forecast was issued (never invented). Observed daily `windKmh` is the
daily MAX wind speed. A new provider = a new module with the same contract; nothing else changes.

`load.mjs` is the loader (**local only in V1**: only a 127.0.0.1 target is accepted, service-role key required, hosted targets refused
before any request; no function is deployed). `--forecast` stores one snapshot per branch (validity decided by the database, see section 4a); `--ttl-minutes=N` is an explicit one-off
override. `--observed --days=N` writes completed days from the archive endpoint with the provider's declared provenance (`reanalysis`);
a provider without a declared historical provenance is refused. A branch without coordinates is skipped (`missing_branch_location`); one failing branch or
provider call never stops the others and a failure stores nothing (the previous forecast simply becomes stale).

## 3. Location

Weather is branch-specific: `branch_locations.latitude/longitude` + `branches.timezone`. **No coordinates -> `unavailable /
missing_branch_location`** (nothing guessed, no device location) with a link to the branch location settings. Snapshots store the location
they were fetched for; if the branch moves afterwards the old forecast becomes `stale / location_changed`. Coordinates are never returned
to clients (the read RPC returns only the location label; snapshot columns exclude latitude/longitude from client SELECT).

## 4. Cache, freshness and failure behaviour

`get_branch_weather(branch)` (permission `weather.read`: owner, manager, branch_manager; branch scope):

| status | rule |
|---|---|
| `fresh` | latest snapshot and `now <= valid_until` |
| `stale` | expired (`staleReason: expired`) or location changed; still shown **with its `fetchedAt` / age** |
| `unavailable` | `missing_branch_location` or `no_forecast_loaded`; no values at all |

Provider failure therefore never breaks the Command Center: with a cached forecast it shows stale data + timestamp, without one
"Hava verisi şu anda alınamıyor." No fake zero temperature anywhere. The response is labelled `isForecast` and carries provider,
fetched_at, generated_at, valid_until, age, timezone, current, hourly (-1h..+48h window) and daily. Retention of old snapshots is an open
operational item.

## 4a. Forecast TTL (central technical default)

How long a fetched forecast counts as fresh is ONE centrally configurable **technical default**, `weather_settings.forecast_ttl_minutes`
(default **60**, allowed 5..1440). It is not a business-risk threshold and says nothing about weather danger.

- **Where it lives:** the single-row table `weather_settings`; read through `internal_weather_ttl_minutes()`; nowhere is 60 hard-coded in SQL
  checks, TypeScript or the loader.
- **How it applies:** at fetch time `internal_store_weather_forecast` stores `valid_until = fetched_at + TTL` (unless the loader passes an
  explicit override). The stored validity is never rewritten, so a later TTL change affects only forecasts fetched afterwards.
- **Stale rule (the only one):** `stale = now > valid_until` (or the branch location changed after the fetch). Display texts only format
  the age.
- **Override mechanism:** owner/manager call `update_weather_settings(minutes, reason)` (audited, mandatory reason, 5..1440), or run the
  loader with `--ttl-minutes=N` for one run. Cashier/employee/viewer/branch_manager/anon cannot change it.

## 4b. Terminology (UI/domain wording)

`current` = the provider's **modelled** current state ("Şu an (model tahmini)", never a station measurement); hourly = "Saatlik tahmin";
daily = "Günlük tahmin"; historical context = "Geçmiş bağlam" with its provenance label (reanalysis is "modellenmiş geçmiş veri, doğrudan
ölçüm değil"). Nothing forecast or modelled is called observed/measured (`domain/weather/labels.ts`, tested).

## 5. Security

`internal_store_weather_forecast` and `internal_upsert_observed_weather` are service-role only (locked `search_path`, no PUBLIC execute);
clients cannot write weather or historical context through them (the existing audited `upsert_external_context_daily` remains the
manual path). The table is append-only (trigger) with RLS (`weather.read` + branch scope). Tested for owner, manager, branch_manager,
cashier, employee, viewer, anon and service_role.

## 6. Weather -> operations (facts only)

`domain/weather/context.ts` produces notes such as "Tahmin: önümüzdeki 12 saatte en yüksek yağış olasılığı %80 (18:00 civarı); beklenen
yağış toplamı 2.0 mm", wind and today's min/max, always labelled as forecast, formatted in the **branch** time zone, and followed by
"Geçmiş satışlara etkisi henüz desteklenmiyor." unless the Analytics Engine has an evidence-gated relationship, which is then quoted as "a
relationship seen in past data, not a causal claim". Weather attention items are always `info`: **no weather threshold, rain-impact
percentage or temperature/sales rule is invented.**

## 7. Analytics integration (Analytics Engine V1, not a V2)

The existing `external_context_daily` -> `analytics_context_for` -> snapshot payload path now carries mean/min/max temperature, apparent
temperature, precipitation, wind, gust and weather code (with `source`). The existing relationship logic (temperature vs weekday-adjusted
revenue; rainy vs dry days) keeps its sample thresholds and its fact / relationship / hypothesis confidence model, so "insufficient
sample" stays an explicit state. Further relationships (product/category vs temperature, wind vs evening traffic) are possible later only
where source data and sample thresholds allow.

## 8. Open decisions

- real branch coordinates (nothing is invented; the QA coordinates are synthetic and labelled so);
- scheduling and hosting of the loader (a deployed function or a scheduled job is a separate, owner-approved step) and snapshot retention (the TTL itself is now a central technical default);
- whether a station-based `observed` historical source should ever be added (V1 history is reanalysis);
- whether any weather threshold should ever raise severity (today none); a holiday/calendar source; whether a paid provider is wanted.
