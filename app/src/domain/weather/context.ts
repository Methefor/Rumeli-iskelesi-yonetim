import type { WeatherForecast, WeatherHour } from './types'

export interface WeatherNote {
  code: 'rain' | 'wind' | 'temperature' | 'impact'
  text: string
}

const HOURS_AHEAD = 12

/** Next `HOURS_AHEAD` forecast hours starting with the current hour (branch-independent: instants are UTC). */
export function upcomingHours(w: WeatherForecast, now: Date): WeatherHour[] {
  const start = now.getTime() - 60 * 60 * 1000 // the hour that is running now
  const end = now.getTime() + HOURS_AHEAD * 60 * 60 * 1000
  return w.hourly.filter((h) => {
    const t = Date.parse(h.time)
    return t >= start && t < end
  })
}

const hhmm = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

/**
 * Operational weather CONTEXT, facts only. It never labels anything critical (no weather threshold is configured), never claims an
 * effect on sales ("rain will cut sales by x%" is not supported), and states when historical impact is unknown. An analytics
 * RELATIONSHIP insight (evidence-gated in the Analytics Engine) may be quoted, marked as a relationship, not causation.
 */
export function weatherNotes(w: WeatherForecast, now: Date, relationshipInsight: string | null = null): WeatherNote[] {
  const hours = upcomingHours(w, now)
  const notes: WeatherNote[] = []

  const probs = hours.filter((h) => h.precipitationProbability !== null)
  const peak = probs.reduce<WeatherHour | null>((best, h) => (best === null || (h.precipitationProbability ?? 0) > (best.precipitationProbability ?? 0) ? h : best), null)
  const rainSum = hours.reduce((s, h) => s + (h.precipitationMm ?? 0), 0)
  if (peak && peak.precipitationProbability !== null) {
    notes.push({
      code: 'rain',
      text:
        `Tahmin: önümüzdeki ${HOURS_AHEAD} saatte en yüksek yağış olasılığı %${Math.round(peak.precipitationProbability)} (${hhmm(peak.time, w.timezone)} civarı)` +
        (rainSum > 0 ? `; beklenen yağış toplamı ${rainSum.toFixed(1)} mm.` : '.'),
    })
  }

  const winds = hours.map((h) => h.windGustKmh ?? h.windKmh).filter((v): v is number => v !== null)
  if (winds.length > 0) {
    notes.push({ code: 'wind', text: `Tahmin: önümüzdeki ${HOURS_AHEAD} saatte rüzgâr en fazla ${Math.round(Math.max(...winds))} km/sa.` })
  }

  const today = w.daily[0]
  if (today && today.temperatureMinC !== null && today.temperatureMaxC !== null) {
    notes.push({ code: 'temperature', text: `Bugün tahmini ${Math.round(today.temperatureMinC)}° / ${Math.round(today.temperatureMaxC)}° (en düşük / en yüksek).` })
  }

  notes.push({
    code: 'impact',
    text: relationshipInsight
      ? `${relationshipInsight} (geçmiş verilerde görülen bir ilişkidir; neden-sonuç iddiası değildir.)`
      : 'Geçmiş satışlara etkisi henüz desteklenmiyor.',
  })
  return notes
}

/** A forecast with measurable precipitation in the next hours is worth a (neutral, INFO) mention; no threshold is implied. */
export function rainExpected(w: WeatherForecast, now: Date): boolean {
  return upcomingHours(w, now).some((h) => (h.precipitationMm ?? 0) > 0)
}

export const freshnessText = (w: WeatherForecast): string =>
  w.status === 'fresh'
    ? `Güncel (${w.ageMinutes} dk önce alındı)`
    : w.staleReason === 'location_changed'
      ? 'Eski: şube konumu sonradan değişti'
      : `Eski veri (${w.ageMinutes < 120 ? `${w.ageMinutes} dk` : `${Math.round(w.ageMinutes / 60)} saat`} önce alındı)`
