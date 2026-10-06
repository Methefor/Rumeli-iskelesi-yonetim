import { describe, expect, it } from 'vitest'
import { freshnessText, isPrecipitationCode, rainExpected, upcomingHours, weatherConditionLabel, weatherNotes } from '.'
import type { WeatherForecast } from './types'

const NOW = new Date('2026-10-07T09:00:00Z') // 12:00 Istanbul

function forecast(hourly: Array<[number, number | null, number | null, number | null]>, patch: Partial<WeatherForecast> = {}): WeatherForecast {
  return {
    status: 'fresh', staleReason: null, isForecast: true, provider: 'open-meteo', timezone: 'Europe/Istanbul',
    fetchedAt: '2026-10-07T08:50:00Z', generatedAt: null, validUntil: '2026-10-07T09:50:00Z', ageMinutes: 10, location: { label: 'Sentetik Konum' },
    current: { time: '2026-10-07T09:00:00Z', temperatureC: 21, apparentTemperatureC: 20, weatherCode: 2, precipitationMm: 0, windKmh: 10, windGustKmh: 20 },
    hourly: hourly.map(([h, prob, mm, gust]) => ({ time: new Date(NOW.getTime() + h * 3600_000).toISOString(), temperatureC: 20, apparentTemperatureC: 19, precipitationProbability: prob, precipitationMm: mm, weatherCode: 3, windKmh: 10, windGustKmh: gust })),
    daily: [{ date: '2026-10-07', temperatureMinC: 15, temperatureMaxC: 24, precipitationProbabilityMax: 80, precipitationSumMm: 3, windMaxKmh: 30, windGustMaxKmh: 45, weatherCode: 61, sunrise: null, sunset: null }],
    ...patch,
  }
}

describe('weather conditions', () => {
  it('maps WMO codes and never turns an unknown code into clear skies', () => {
    expect(weatherConditionLabel(0)).toBe('Açık')
    expect(weatherConditionLabel(61)).toBe('Hafif yağmur')
    expect(weatherConditionLabel(null)).toBe('Bilinmiyor')
    expect(weatherConditionLabel(123)).toBe('Bilinmiyor')
    expect(isPrecipitationCode(63)).toBe(true)
    expect(isPrecipitationCode(2)).toBe(false)
    expect(isPrecipitationCode(null)).toBe(false)
  })
})

describe('upcoming window and day boundary', () => {
  it('keeps the running hour and the next 12 hours, drops older and later ones', () => {
    const w = forecast([[-3, 0, 0, 10], [-1, 0, 0, 10], [0, 0, 0, 10], [11, 0, 0, 10], [12, 0, 0, 10], [20, 0, 0, 10]])
    expect(upcomingHours(w, NOW).length).toBe(3) // -1, 0, 11
  })
  it('formats hours in the BRANCH time zone, not UTC (18:00 UTC = 21:00 Istanbul)', () => {
    const w = forecast([[9, 80, 1.2, 20]]) // 18:00Z
    expect(weatherNotes(w, NOW).find((n) => n.code === 'rain')?.text).toMatch(/21:00/)
  })
})

describe('operational notes are facts, not verdicts', () => {
  it('states rain probability and amount as a forecast and says historical impact is unsupported', () => {
    const w = forecast([[2, 20, 0, 20], [6, 80, 1.5, 22], [7, 60, 0.5, 21]])
    const notes = weatherNotes(w, NOW)
    expect(notes.find((n) => n.code === 'rain')?.text).toMatch(/Tahmin: .*%80.*2\.0 mm/)
    expect(notes.find((n) => n.code === 'wind')?.text).toMatch(/22 km\/sa/)
    expect(notes.find((n) => n.code === 'temperature')?.text).toMatch(/15° \/ 24°/)
    expect(notes.find((n) => n.code === 'impact')?.text).toBe('Geçmiş satışlara etkisi henüz desteklenmiyor.')
    expect(notes.map((n) => n.text).join(' ')).not.toMatch(/%\d+ (azal|düş)|satışlar.*(azal|art)acak/i)
  })
  it('quotes an analytics RELATIONSHIP only as a relationship, never as causation', () => {
    const impact = weatherNotes(forecast([[1, 10, 0, 10]]), NOW, 'Benzer sıcak ve kuru günlerde dondurma satışı daha yüksekti').find((n) => n.code === 'impact')!.text
    expect(impact).toMatch(/ilişkidir; neden-sonuç iddiası değildir/)
    expect(impact).not.toMatch(/Geçmiş satışlara etkisi henüz desteklenmiyor/)
  })
  it('a missing value stays missing: no probability data means no rain note, not 0%', () => {
    const w = forecast([[1, null, null, null]])
    expect(weatherNotes(w, NOW).some((n) => n.code === 'rain')).toBe(false)
    expect(weatherNotes(w, NOW).find((n) => n.code === 'wind')?.text).toMatch(/10 km\/sa/) // falls back to the wind speed the provider did return
  })
  it('rainExpected is true only for measurable forecast precipitation', () => {
    expect(rainExpected(forecast([[1, 90, 0, 10]]), NOW)).toBe(false)
    expect(rainExpected(forecast([[1, 90, 0.2, 10]]), NOW)).toBe(true)
  })
})

describe('freshness wording', () => {
  it('fresh, expired (minutes / hours) and location-changed read differently', () => {
    expect(freshnessText(forecast([]))).toBe('Güncel (10 dk önce alındı)')
    expect(freshnessText(forecast([], { status: 'stale', staleReason: 'expired', ageMinutes: 95 }))).toBe('Eski veri (95 dk önce alındı)')
    expect(freshnessText(forecast([], { status: 'stale', staleReason: 'expired', ageMinutes: 300 }))).toBe('Eski veri (5 saat önce alındı)')
    expect(freshnessText(forecast([], { status: 'stale', staleReason: 'location_changed' }))).toMatch(/konumu sonradan değişti/)
  })
})

describe('terminology: current, forecast and historical are different things', () => {
  it('current is a MODELLED state, never called measured/observed; forecast labels say forecast', async () => {
    const { WEATHER_LABELS } = await import('./labels')
    for (const text of [WEATHER_LABELS.current, WEATHER_LABELS.hourly, WEATHER_LABELS.daily, WEATHER_LABELS.sourceNote, WEATHER_LABELS.currentNote]) {
      expect(text).not.toMatch(/gözlem|gözlenen|ölçülen|gerçekleşen/i)
    }
    expect(WEATHER_LABELS.current).toMatch(/model/)
    expect(WEATHER_LABELS.currentNote).toMatch(/istasyon ölçümü değildir/)
    expect(WEATHER_LABELS.hourly).toMatch(/tahmin/)
    expect(WEATHER_LABELS.daily).toMatch(/tahmin/)
  })
  it('historical provenance is explicit: reanalysis is modelled history, only "observed" claims measurement', async () => {
    const { HISTORICAL_PROVENANCE_LABELS } = await import('./labels')
    expect(HISTORICAL_PROVENANCE_LABELS.reanalysis).toMatch(/modellenmiş/)
    expect(HISTORICAL_PROVENANCE_LABELS.reanalysis).not.toMatch(/ölçülmüş|gözlem/i)
    expect(HISTORICAL_PROVENANCE_LABELS.observed).toMatch(/Ölçülmüş/)
    expect(HISTORICAL_PROVENANCE_LABELS.manual).toBe('Elle girildi')
  })
})
