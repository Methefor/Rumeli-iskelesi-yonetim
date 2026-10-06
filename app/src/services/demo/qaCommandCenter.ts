/**
 * SYNTHETIC QA scenarios for the Command Center and weather (Phase 1D). Everything is invented and clearly labelled:
 * the coordinates below are NOT real branch locations (label "SENTETİK KONUM"), the forecasts are generated, no provider is called.
 *
 *   Rumeli İskelesi  today X-only (missing Z), closing-count shortages (unexplained + timing uncertain), FRESH forecast with an
 *                    evening rain window and wind
 *   İskele Dondurma  reconciliation ERROR today (critical), stock alerts, waste, low stock without an order, awaiting approval,
 *                    overdue delivery, STALE forecast (warm and dry)
 *   Balık Ekmek      the clean, finalized day; NO coordinates -> weather unavailable (missing_branch_location)
 */
import type { WeatherCurrent, WeatherDay, WeatherHour } from '../../domain/weather'
import { addDaysIso, istanbulDate } from '../../utils/dates'
import type { QaDeps } from './qaFixtures'
import type { DemoState } from './store'

const R = 'demo-branch-rumeli'
const D = 'demo-branch-dondurma'

export type SyntheticWeatherKind = 'rainy_windy' | 'warm_dry'

/** A normalised forecast anchored to `anchor` (hourly from -3h to +30h), in the shape the real loader stores. */
export function syntheticForecast(kind: SyntheticWeatherKind, anchor: Date): { current: WeatherCurrent; hourly: WeatherHour[]; daily: WeatherDay[] } {
  const rainy = kind === 'rainy_windy'
  const hourStart = new Date(Math.floor(anchor.getTime() / 3600_000) * 3600_000)
  const hourly: WeatherHour[] = []
  for (let h = -3; h <= 30; h += 1) {
    const inWindow = rainy && h >= 5 && h <= 8
    hourly.push({
      time: new Date(hourStart.getTime() + h * 3600_000).toISOString(),
      temperatureC: Math.round((rainy ? 17 : 26) * 10) / 10 - Math.abs(h) * 0.05,
      apparentTemperatureC: rainy ? 15.5 : 27,
      precipitationProbability: inWindow ? 80 : rainy ? 25 : 3,
      precipitationMm: inWindow ? 1.4 : 0,
      weatherCode: inWindow ? 63 : rainy ? 3 : 1,
      windKmh: rainy ? 22 : 9,
      windGustKmh: rainy ? 41 : 16,
    })
  }
  const today = istanbulDate(anchor)
  return {
    current: { time: anchor.toISOString(), temperatureC: rainy ? 17 : 26, apparentTemperatureC: rainy ? 15.5 : 27, weatherCode: rainy ? 3 : 1, precipitationMm: 0, windKmh: rainy ? 22 : 9, windGustKmh: rainy ? 41 : 16 },
    hourly,
    daily: [0, 1].map((i) => ({
      date: addDaysIso(today, i),
      temperatureMinC: rainy ? 13 : 19,
      temperatureMaxC: rainy ? 19 : 29,
      precipitationProbabilityMax: rainy ? 80 : 5,
      precipitationSumMm: rainy ? 5.6 : 0,
      windMaxKmh: rainy ? 30 : 12,
      windGustMaxKmh: rainy ? 48 : 20,
      weatherCode: rainy ? 63 : 1,
      sunrise: null,
      sunset: null,
    })),
  }
}

export function applyQaCommandCenter(state: DemoState, _deps: QaDeps): void {
  void _deps
  const now = new Date()
  state.branchLocations[R] = { latitude: 40, longitude: 29, timezone: 'Europe/Istanbul', address: null, locationLabel: 'SENTETİK KONUM (gerçek değil) · Rumeli' }
  state.branchLocations[D] = { latitude: 40.1, longitude: 29.1, timezone: 'Europe/Istanbul', address: null, locationLabel: 'SENTETİK KONUM (gerçek değil) · Dondurma' }
  // Balık Ekmek deliberately has NO coordinates: weather is unavailable (missing_branch_location), nothing is guessed.

  const snapshot = (branchId: string, kind: SyntheticWeatherKind, fetchedMinutesAgo: number, ttlMinutes: number) => {
    const loc = state.branchLocations[branchId]!
    const fetchedAt = new Date(now.getTime() - fetchedMinutesAgo * 60_000)
    state.weatherSnapshots[branchId] = {
      provider: 'synthetic_qa',
      fetchedAt: fetchedAt.toISOString(),
      generatedAt: null,
      validUntil: new Date(fetchedAt.getTime() + ttlMinutes * 60_000).toISOString(),
      latitude: loc.latitude as number,
      longitude: loc.longitude as number,
      payload: syntheticForecast(kind, now),
    }
  }
  snapshot(R, 'rainy_windy', 10, 60) // fresh
  snapshot(D, 'warm_dry', 180, 60) // stale: expired two hours ago
}
