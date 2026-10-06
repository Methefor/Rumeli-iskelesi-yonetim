/**
 * Weather provider ABSTRACTION. Application and database logic only ever see the NORMALISED shapes below; the provider response
 * format never leaks past this module.
 *
 * WeatherProvider (duck-typed contract):
 *   name: string                                   stored as `provider` / `source` ('open-meteo')
 *   historicalProvenance: 'observed' | 'reanalysis' | 'provider_historical'   what kind of data fetchObservedDaily returns. REQUIRED for
 *                                                  history: without it the loader refuses to write historical context. Open-Meteo's archive API
 *                                                  is model REANALYSIS, so it is 'reanalysis', never 'observed'.
 *   fetchForecast({ latitude, longitude, timezone }) -> Promise<NormalizedForecast>
 *   fetchObservedDaily({ latitude, longitude, timezone, from, to }) -> Promise<Array<{ date, values }>>   (HISTORICAL source only, completed days)
 *
 * Forecast and "current" payloads are NEVER history: history comes only from fetchObservedDaily of a historical-capable endpoint.
 *
 * NormalizedForecast = {
 *   generatedAt: ISO string | null            when the provider says the forecast was produced (null if it does not say)
 *   current: { time, temperatureC, apparentTemperatureC, weatherCode, precipitationMm, windKmh, windGustKmh }
 *   hourly:  [{ time, temperatureC, apparentTemperatureC, precipitationProbability, precipitationMm, weatherCode, windKmh, windGustKmh }]
 *   daily:   [{ date, temperatureMinC, temperatureMaxC, precipitationProbabilityMax, precipitationSumMm, windMaxKmh, windGustMaxKmh, weatherCode, sunrise, sunset }]
 * }
 * Times are UTC instants (ISO with Z); daily `date` is the branch-local calendar date. A value the provider did not return is
 * `null` (never 0): "unknown" and "zero" are different facts.
 */

const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
const OPEN_METEO_ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

export class ProviderError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/** a finite number or null */
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Open-Meteo returns local wall-clock times without an offset; utc_offset_seconds turns them into real instants. */
export function localToInstant(local, utcOffsetSeconds) {
  if (typeof local !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(local) || !Number.isFinite(utcOffsetSeconds)) return null;
  const ms = Date.parse(`${local.length === 16 ? `${local}:00` : local}Z`);
  return Number.isNaN(ms) ? null : new Date(ms - utcOffsetSeconds * 1000).toISOString();
}

const column = (block, key, i) => (Array.isArray(block?.[key]) ? num(block[key][i]) : null);

/** Pure: Open-Meteo forecast JSON -> NormalizedForecast (throws ProviderError on an unusable response). */
export function normalizeOpenMeteoForecast(json) {
  if (!json || typeof json !== "object" || !json.current || !json.hourly || !json.daily) {
    throw new ProviderError("provider_shape", "Open-Meteo response is missing current/hourly/daily");
  }
  const offset = json.utc_offset_seconds;
  const cur = json.current;
  const current = {
    time: localToInstant(cur.time, offset),
    temperatureC: num(cur.temperature_2m),
    apparentTemperatureC: num(cur.apparent_temperature),
    weatherCode: num(cur.weather_code),
    precipitationMm: num(cur.precipitation),
    windKmh: num(cur.wind_speed_10m),
    windGustKmh: num(cur.wind_gusts_10m),
  };
  if (current.time === null || current.temperatureC === null) {
    throw new ProviderError("provider_shape", "Open-Meteo current block has no time or temperature");
  }
  const hourly = (json.hourly.time ?? []).map((t, i) => ({
    time: localToInstant(t, offset),
    temperatureC: column(json.hourly, "temperature_2m", i),
    apparentTemperatureC: column(json.hourly, "apparent_temperature", i),
    precipitationProbability: column(json.hourly, "precipitation_probability", i),
    precipitationMm: column(json.hourly, "precipitation", i),
    weatherCode: column(json.hourly, "weather_code", i),
    windKmh: column(json.hourly, "wind_speed_10m", i),
    windGustKmh: column(json.hourly, "wind_gusts_10m", i),
  })).filter((h) => h.time !== null);
  const daily = (json.daily.time ?? []).map((d, i) => ({
    date: d,
    temperatureMinC: column(json.daily, "temperature_2m_min", i),
    temperatureMaxC: column(json.daily, "temperature_2m_max", i),
    precipitationProbabilityMax: column(json.daily, "precipitation_probability_max", i),
    precipitationSumMm: column(json.daily, "precipitation_sum", i),
    windMaxKmh: column(json.daily, "wind_speed_10m_max", i),
    windGustMaxKmh: column(json.daily, "wind_gusts_10m_max", i),
    weatherCode: column(json.daily, "weather_code", i),
    sunrise: localToInstant(json.daily.sunrise?.[i], offset),
    sunset: localToInstant(json.daily.sunset?.[i], offset),
  }));
  // Open-Meteo reports how long the model run took, not when the forecast was issued: generatedAt stays null (never invented)
  return { generatedAt: null, current, hourly, daily };
}

/** Pure: Open-Meteo archive JSON -> [{ date, values }] for the context table (mean/min/max temperature, rain, wind, code). */
export function normalizeOpenMeteoObserved(json) {
  const d = json?.daily;
  if (!d || !Array.isArray(d.time)) throw new ProviderError("provider_shape", "Open-Meteo archive response has no daily block");
  return d.time.map((date, i) => ({
    date,
    values: {
      temperatureC: column(d, "temperature_2m_mean", i),
      temperatureMinC: column(d, "temperature_2m_min", i),
      temperatureMaxC: column(d, "temperature_2m_max", i),
      apparentTemperatureC: column(d, "apparent_temperature_mean", i),
      precipitationMm: column(d, "precipitation_sum", i),
      windKmh: column(d, "wind_speed_10m_max", i), // daily MAX wind speed (documented in WEATHER_MODEL.md)
      windGustKmh: column(d, "wind_gusts_10m_max", i),
      weatherCode: column(d, "weather_code", i),
    },
  }));
}

async function getJson(fetchImpl, url, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw new ProviderError("provider_unreachable", `provider request failed: ${error?.name ?? "error"}`);
  }
  if (!response.ok) throw new ProviderError("provider_http", `provider answered HTTP ${response.status}`);
  try {
    return await response.json();
  } catch {
    throw new ProviderError("provider_shape", "provider answer is not JSON");
  }
}

/** The V1 provider. `fetch` is injectable so tests never touch the network. No API key is needed or read. */
export function createOpenMeteoProvider({ fetch: fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  return {
    name: "open-meteo",
    historicalProvenance: "reanalysis", // archive-api.open-meteo.com serves reanalysis (modelled), not station observations
    async fetchForecast({ latitude, longitude, timezone }) {
      const q = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone,
        forecast_days: "3",
        wind_speed_unit: "kmh",
        current: "temperature_2m,apparent_temperature,weather_code,precipitation,wind_speed_10m,wind_gusts_10m",
        hourly: "temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m",
        daily: "temperature_2m_min,temperature_2m_max,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,weather_code,sunrise,sunset",
      });
      return normalizeOpenMeteoForecast(await getJson(fetchImpl, `${OPEN_METEO_FORECAST}?${q}`, timeoutMs));
    },
    async fetchObservedDaily({ latitude, longitude, timezone, from, to }) {
      const q = new URLSearchParams({
        latitude: String(latitude),
        longitude: String(longitude),
        timezone,
        start_date: from,
        end_date: to,
        wind_speed_unit: "kmh",
        daily: "temperature_2m_mean,temperature_2m_min,temperature_2m_max,apparent_temperature_mean,precipitation_sum,wind_speed_10m_max,wind_gusts_10m_max,weather_code",
      });
      return normalizeOpenMeteoObserved(await getJson(fetchImpl, `${OPEN_METEO_ARCHIVE}?${q}`, timeoutMs));
    },
  };
}
