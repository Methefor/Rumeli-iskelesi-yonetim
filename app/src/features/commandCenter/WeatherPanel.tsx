import { useState } from 'react'
import { Card, LinkButton, Note, Select, Stack, StatusChip } from '../../components/ui'
import type { AnalyticsSignalInsight, BranchSignals } from '../../domain/commandCenter'
import { ROUTES } from '../../domain/commandCenter'
import { WEATHER_LABELS, freshnessText, upcomingHours, weatherConditionLabel, weatherNotes, type WeatherForecast } from '../../domain/weather'
import styles from './CommandCenter.module.css'

const deg = (v: number | null) => (v === null ? '—' : `${Math.round(v)}°`)
const timeIn = (iso: string, timeZone: string) =>
  new Intl.DateTimeFormat('tr-TR', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))

function relationshipText(insights: AnalyticsSignalInsight[]): string | null {
  return insights.find((i) => i.confidence === 'relationship' && /weather|rain|temp|hava/i.test(i.code))?.title ?? null
}

/**
 * D. WEATHER / CONTEXT of ONE branch (its own coordinates and time zone). A forecast is labelled as a forecast; a stale one keeps its
 * timestamp; a missing location links to the settings; no value is ever invented. Detail lives under Analytics.
 */
export function WeatherPanel({ branches, signals, now }: { branches: Array<{ id: string; name: string }>; signals: Record<string, BranchSignals | null>; now: Date }) {
  const [selected, setSelected] = useState(branches[0]?.id ?? '')
  const id = branches.some((b) => b.id === selected) ? selected : (branches[0]?.id ?? '')
  const branch = branches.find((b) => b.id === id)
  const s = signals[id]
  const w = s?.weather.state === 'available' ? s.weather.data : null
  const insights = s?.analytics.state === 'available' ? [...(s.analytics.data.weekly?.insights ?? []), ...(s.analytics.data.daily?.insights ?? [])] : []

  return (
    <section aria-labelledby="cc-weather">
      <div className={styles.sectionHead}>
        <h2 id="cc-weather">Hava durumu</h2>
        <small>Tahmin</small>
      </div>
      <Stack gap="sm">
        {branches.length > 1 && (
          <Select label="Şube" value={id} onChange={(e) => setSelected(e.target.value)} options={branches.map((b) => ({ value: b.id, label: b.name }))} />
        )}
        {!s || s.weather.state === 'unavailable' ? (
          <Note>{!s ? 'Hava verisi şu anda alınamıyor.' : 'Hava durumunu görme yetkiniz yok.'}</Note>
        ) : w?.status === 'unavailable' ? (
          w.reason === 'missing_branch_location' ? (
            <Card>
              <Stack gap="sm">
                <strong>{branch?.name}</strong>
                <span className={styles.muted}>Hava durumu için bu şubenin koordinatları tanımlı değil; konum tahmin edilmez.</span>
                <LinkButton to={ROUTES.branchLocation} variant="secondary">Şube konumunu tanımla</LinkButton>
              </Stack>
            </Card>
          ) : (
            <Note>Hava verisi şu anda alınamıyor.</Note>
          )
        ) : w ? (
          <ForecastCard w={w} branchName={branch?.name ?? ''} now={now} insights={insights} />
        ) : null}
      </Stack>
    </section>
  )
}

function ForecastCard({ w, branchName, now, insights }: { w: WeatherForecast; branchName: string; now: Date; insights: AnalyticsSignalInsight[] }) {
  const today = w.daily[0]
  const hours = upcomingHours(w, now).slice(0, 6)
  const prob = hours.reduce<number | null>((m, h) => (h.precipitationProbability === null ? m : Math.max(m ?? 0, h.precipitationProbability)), null)
  const notes = weatherNotes(w, now, relationshipText(insights))
  return (
    <Card>
      <Stack gap="sm">
        <div className={styles.sectionHead}>
          <strong>
            {branchName}
            {w.location.label ? ` · ${w.location.label}` : ''}
          </strong>
          <StatusChip tone={w.status === 'fresh' ? 'success' : 'warning'}>{w.status === 'fresh' ? 'Güncel' : 'Eski'}</StatusChip>
        </div>
        <span className={styles.muted} title={WEATHER_LABELS.currentNote}>{WEATHER_LABELS.current}</span>
        <div className={styles.weatherMain}>
          <span className={styles.weatherTemp}>{deg(w.current.temperatureC)}</span>
          <span>{weatherConditionLabel(w.current.weatherCode)}</span>
          <span className={styles.muted}>Hissedilen {deg(w.current.apparentTemperatureC)}</span>
        </div>
        <div className={styles.muted}>
          Yağış olasılığı (tahmin) {prob === null ? 'bilinmiyor' : `%${Math.round(prob)}`} · Rüzgâr {w.current.windKmh === null ? '—' : `${Math.round(w.current.windKmh)} km/sa`}
          {w.current.windGustKmh !== null ? ` (hamle ${Math.round(w.current.windGustKmh)})` : ''}
        </div>
        <div className={styles.muted}>
          {WEATHER_LABELS.daily}: bugün {deg(today?.temperatureMinC ?? null)} / {deg(today?.temperatureMaxC ?? null)}
        </div>
        {hours.length > 0 && (
          <div className={styles.hours} aria-label={WEATHER_LABELS.hourly}>
            {hours.map((h) => (
              <div key={h.time}>
                <div>{timeIn(h.time, w.timezone)}</div>
                <strong>{deg(h.temperatureC)}</strong>
                <div>{h.precipitationProbability === null ? '—' : `%${Math.round(h.precipitationProbability)}`}</div>
              </div>
            ))}
          </div>
        )}
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {notes.map((n) => (
            <li key={n.code} className={styles.muted}>
              {n.text}
            </li>
          ))}
        </ul>
        <span className={styles.muted}>
          {freshnessText(w)} · {timeIn(w.fetchedAt, w.timezone)} · kaynak: {w.provider} · {WEATHER_LABELS.sourceNote}
        </span>
        <LinkButton to={ROUTES.analytics} variant="secondary">Analiz ve hava ayrıntısı</LinkButton>
      </Stack>
    </Card>
  )
}
