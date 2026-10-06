/**
 * Normalised weather model. Mirror of the payload stored by the weather loader and returned by get_branch_weather
 * (supabase/migrations/20261006000700_weather_context.sql). Application logic NEVER sees a provider response.
 *
 * Everything here is a FORECAST (provider model output), not a measured fact, and a value the provider did not return is `null`
 * (never 0). Times are UTC instants; daily dates are branch-local calendar dates.
 */

export type WeatherStatus = 'fresh' | 'stale' | 'unavailable'

/** The provider's MODELLED current state (not a station observation); see WEATHER_LABELS. */
export interface WeatherCurrent {
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  weatherCode: number | null
  precipitationMm: number | null
  windKmh: number | null
  windGustKmh: number | null
}

export interface WeatherHour {
  time: string
  temperatureC: number | null
  apparentTemperatureC: number | null
  precipitationProbability: number | null
  precipitationMm: number | null
  weatherCode: number | null
  windKmh: number | null
  windGustKmh: number | null
}

export interface WeatherDay {
  date: string
  temperatureMinC: number | null
  temperatureMaxC: number | null
  precipitationProbabilityMax: number | null
  precipitationSumMm: number | null
  windMaxKmh: number | null
  windGustMaxKmh: number | null
  weatherCode: number | null
  sunrise: string | null
  sunset: string | null
}

export interface WeatherUnavailable {
  status: 'unavailable'
  /** missing_branch_location: the branch has no coordinates (never guessed). no_forecast_loaded: coordinates exist, nothing fetched yet. */
  reason: 'missing_branch_location' | 'no_forecast_loaded'
  timezone: string
  location?: { label: string | null }
}

export interface WeatherForecast {
  status: 'fresh' | 'stale'
  /** why a forecast is stale: its validity expired, or the branch location changed after it was fetched */
  staleReason: 'expired' | 'location_changed' | null
  isForecast: true
  provider: string
  timezone: string
  fetchedAt: string
  generatedAt: string | null
  validUntil: string
  ageMinutes: number
  location: { label: string | null }
  current: WeatherCurrent
  hourly: WeatherHour[]
  daily: WeatherDay[]
}

export type BranchWeather = WeatherUnavailable | WeatherForecast
