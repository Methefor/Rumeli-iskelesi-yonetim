import type {
  AnalyticsInsight,
  Completeness,
  DailyAnalyticsPayload,
  WeatherEffect,
  WeeklyAnalyticsPayload,
} from '../../domain/analytics'
import { Card, EmptyState, Grid, Note, Stack, StatCard, StatusChip } from '../../components/ui'
import { formatMoney, formatQuantity, formatRatioPercent } from '../../utils/format'
import { formatShortDate } from '../../utils/dates'
import { STATUS_LABEL, STATUS_TONE, comparisonView, countMetric, metricNote, moneyMetric, reasonText } from './analyticsFormat'
import { ConfidenceBadge, RedactedNote } from './parts'
import styles from './Analytics.module.css'

// ---------------------------------------------------------------------------
// Insights list (facts / relationships; hypotheses only ever come from the AI report)
// ---------------------------------------------------------------------------
export function InsightList({ insights }: { insights: AnalyticsInsight[] }) {
  if (insights.length === 0) return <Note>Bu dönem için öne çıkan bir bulgu yok.</Note>
  return (
    <Stack gap="sm">
      {insights.map((i) => (
        <div key={i.id} className={styles.insight}>
          <ConfidenceBadge confidence={i.confidence} />
          <p className={styles.insightTitle}>{i.title}</p>
        </div>
      ))}
    </Stack>
  )
}

function Row({ title, sub, value }: { title: string; sub?: string; value: string }) {
  return (
    <div className={styles.rowCard}>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle}>{title}</p>
        {sub && <p className={styles.rowSub}>{sub}</p>}
      </div>
      <div className={styles.rowValue}>{value}</div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Manager summary
// ---------------------------------------------------------------------------
export function ManagerSummaryCard({
  daily,
  weekly,
  insights,
}: {
  daily: DailyAnalyticsPayload | undefined
  weekly: WeeklyAnalyticsPayload | undefined
  insights: AnalyticsInsight[]
}) {
  const redacted = daily?.redacted === true
  const dayCmp = comparisonView(daily?.financialComparisons?.grossRevenue.previousWeekSameWeekday)
  const weekCmp = comparisonView(weekly?.financialComparisons?.grossRevenue)
  return (
    <Card>
      <Stack gap="sm">
        <h2 className={styles.sectionTitle}>Yönetici özeti</h2>
        {!daily && <Note>Seçili gün için anlık görüntü yok.</Note>}
        {daily && <FinalizationChip finalization={daily.finalization} />}
        {daily && (
          <>
            {redacted ? (
              <p className={styles.summaryHeadline}>{countMetric(daily.volume.transactions)} işlem</p>
            ) : (
              <p className={styles.summaryHeadline}>
                {daily.hasData ? moneyMetric(daily.financial?.grossRevenue) : 'Rapor yok'}
                {daily.finalization === 'provisional' ? ' (geçici)' : ''}
              </p>
            )}
            {!redacted && (
              <Note>
                {daily.hasData ? `Geçen haftanın aynı gününe göre: ${dayCmp.text}` : 'Bu gün için aktif satış raporu yok.'}
              </Note>
            )}
            <Grid min={140}>
              <StatCard label="İşlem" value={countMetric(daily.volume.transactions)} />
              {!redacted && <StatCard label="Ort. sepet" value={moneyMetric(daily.financial?.averageBasket)} />}
              {!redacted && weekly && <StatCard label="Hafta ciro değişimi" value={weekCmp.text} trend={weekCmp.trend} />}
            </Grid>
          </>
        )}
        {daily && <InsightList insights={insights.slice(0, 3)} />}
      </Stack>
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Daily
// ---------------------------------------------------------------------------
export function DailyAnalytics({ p }: { p: DailyAnalyticsPayload }) {
  if (p.redacted || !p.financial) {
    return (
      <Stack>
        <RedactedNote />
        <Grid min={150}>
          <StatCard label="İşlem" value={countMetric(p.volume.transactions)} />
          <StatCard label="Adet" value={countMetric(p.volume.itemQuantity)} />
        </Grid>
      </Stack>
    )
  }
  const f = p.financial
  const rows: Array<[string, string, ReturnType<typeof comparisonView>]> = [
    ['Dün', 'Önceki gün', comparisonView(p.financialComparisons?.grossRevenue.previousDay)],
    ['Geçen hafta aynı gün', 'Aynı hafta günü', comparisonView(p.financialComparisons?.grossRevenue.previousWeekSameWeekday)],
    [`Son ${p.params.baselineWeeks} hafta ortalaması`, `${p.baselineSamples.sameWeekdayFinalizedDays}/${p.baselineSamples.of} kesinleşmiş hafta`, comparisonView(p.financialComparisons?.grossRevenue.baseline4SameWeekday)],
  ]
  return (
    <Stack>
      {!p.hasData && <Note>Bu gün için aktif rapor yok; ciro 0 gerçek bir sıfırdır, eksik veri değil.</Note>}
      <Grid min={150}>
        <StatCard label="Brüt ciro" value={moneyMetric(f.grossRevenue)} />
        <StatCard label="İşlem" value={countMetric(p.volume.transactions)} changeLabel={metricNote(p.volume.transactions)} />
        <StatCard label="Ort. sepet" value={moneyMetric(f.averageBasket)} changeLabel={metricNote(f.averageBasket)} />
        <StatCard label="Adet" value={countMetric(p.volume.itemQuantity)} changeLabel={metricNote(p.volume.itemQuantity)} />
      </Grid>
      <Card>
        <h3 className={styles.sectionTitle}>Karşılaştırma (ciro)</h3>
        {rows.map(([title, sub, c]) => (
          <Row key={title} title={title} sub={sub} value={c.text} />
        ))}
      </Card>
      <Card>
        <h3 className={styles.sectionTitle}>Kategoriler</h3>
        {f.categories.length === 0 && <Note>Kategori verisi yok.</Note>}
        {f.categories.map((c) => (
          <Row key={c.categoryId} title={c.name} sub={c.share === null ? undefined : formatRatioPercent(c.share)} value={formatMoney(c.revenue)} />
        ))}
      </Card>
      <Card>
        <h3 className={styles.sectionTitle}>Brüt kâr</h3>
        <Row title="Brüt kâr" sub={metricNote(f.grossProfit.metric)} value={moneyMetric(f.grossProfit.metric)} />
        <Note>Yalnızca ürün cirosu eksi satılan malın maliyeti; kira, personel ve diğer giderler dahil değildir. Net kâr değildir.</Note>
      </Card>
      <ReadingsCard p={p} />
      <CompletenessCard completeness={p.completeness} />
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Weekly
// ---------------------------------------------------------------------------
export function WeeklyAnalytics({ p }: { p: WeeklyAnalyticsPayload }) {
  if (p.redacted || !p.financial) {
    return (
      <Stack>
        <RedactedNote />
        <Grid min={150}>
          <StatCard label="İşlem" value={countMetric(p.volume.transactions)} />
        </Grid>
      </Stack>
    )
  }
  const rev = comparisonView(p.financialComparisons?.grossRevenue)
  const tx = comparisonView(p.volumeComparisons.transactions, 'count')
  const basket = comparisonView(p.financialComparisons?.averageBasket)
  const max = Math.max(1, ...p.days.map((d) => d.grossRevenue ?? 0))
  return (
    <Stack>
      {!p.weekComplete && <Note>Hafta henüz tamamlanmadı; değerler şimdiye kadarki günleri kapsar.</Note>}
      <FinalizationChip finalization={p.finalization} />
      {p.provisionalDays > 0 && (
        <Note>
          {p.provisionalDays} günün Z raporu yok; hafta kesinleşmedi. Geçici (yalnızca X) ciro: {p.financial.provisionalRevenue === null ? '—' : formatMoney(p.financial.provisionalRevenue)}.
        </Note>
      )}
      <Grid min={150}>
        <StatCard label="Haftalık ciro" value={p.daysWithData === 0 ? 'Rapor yok' : moneyMetric(p.financial.grossRevenue)} trend={rev.trend} changeLabel={rev.hasPct ? rev.text : undefined} />
        <StatCard label="İşlem" value={countMetric(p.volume.transactions)} trend={tx.trend} changeLabel={tx.hasPct ? tx.text : undefined} />
        <StatCard label="Ort. sepet" value={moneyMetric(p.financial.averageBasket)} trend={basket.trend} changeLabel={basket.hasPct ? basket.text : undefined} />
      </Grid>
      {(!rev.hasPct || !tx.hasPct) && (
        <Note>
          Ciro: {rev.text}. İşlem: {tx.text}.
        </Note>
      )}
      <Card>
        <h3 className={styles.sectionTitle}>Günler</h3>
        {p.days.map((d) => (
          <div key={d.date} className={styles.dayRow}>
            <span>{formatShortDate(d.date)}</span>
            <div className={styles.bar} aria-hidden="true">
              <div className={styles.barFill} style={{ width: `${((d.grossRevenue ?? 0) / max) * 100}%` }} />
            </div>
            <span>{d.hasData ? formatMoney(d.grossRevenue ?? 0) : 'Veri yok'}</span>
          </div>
        ))}
      </Card>
      <CompletenessCard completeness={p.completeness} />
      <Card>
        <h3 className={styles.sectionTitle}>Kategoriler</h3>
        {p.financial.categories.map((c) => (
          <Row key={c.categoryId} title={c.name} sub={c.share === null ? undefined : formatRatioPercent(c.share)} value={formatMoney(c.revenue)} />
        ))}
      </Card>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
export function ProductsAnalytics({ p }: { p: WeeklyAnalyticsPayload }) {
  if (p.redacted || !p.financial) return <RedactedNote />
  const products = p.financial.products
  if (products.length === 0)
    return (
      <EmptyState
        icon="📦"
        title="Ürün bazlı satış yok"
        description={`Ürün metrikleri yalnızca ürüne bağlı ve anlamı doğrulanmış satış satırlarından oluşur; kategori toplamları ürüne bölünmez. ${(p.completeness.metrics.products?.reasons ?? []).map((r) => reasonText(r)).join(' · ')}`}
      />
    )
  return (
    <Stack>
      <Card>
        <h3 className={styles.sectionTitle}>Ürünler (haftalık)</h3>
        {products.map((x) => (
          <Row
            key={x.inventoryItemId}
            title={`${x.code} · ${x.name}`}
            sub={`${x.quantity === null ? 'Adet yok' : `${formatQuantity(x.quantity)} ${x.unit}`} · ${x.costedDays}/${x.days} gün maliyetli${x.grossProfit === null ? '' : ` · Brüt kâr ${formatMoney(x.grossProfit)}`}`}
            value={formatMoney(x.revenue)}
          />
        ))}
      </Card>
      <Note>Brüt kâr yalnızca maliyeti olan ürünler için gösterilir; net kâr değildir.</Note>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Hourly (unsupported by the source: say so, show what IS available)
// ---------------------------------------------------------------------------
export function HourlyAnalytics({ daily }: { daily: DailyAnalyticsPayload | undefined }) {
  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <StatusChip tone="neutral">Desteklenmiyor</StatusChip>
          <p className={styles.rowTitle}>Saatlik satış analizi yapılamıyor</p>
          <Note>
            Satış raporları vardiya bazlı X/Z okumalarıdır; işlem veya saat zaman damgası içermez. Yoğun saat bu veriden güvenilir şekilde hesaplanamaz ve tahmin edilmez.
          </Note>
        </Stack>
      </Card>
      {daily && !daily.redacted && <ReadingsCard p={daily} />}
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Weather
// ---------------------------------------------------------------------------
export function WeatherEffectCard({ effect, redacted }: { effect: WeatherEffect | undefined; redacted: boolean }) {
  if (redacted || !effect) return <RedactedNote />
  if (effect.state === 'no_context')
    return <EmptyState icon="🌦" title="Hava durumu verisi yok" description="Hava ve takvim bağlamı girilmedikçe ilişki hesaplanmaz; eksik gün 'normal gün' sayılmaz." />
  if (effect.state === 'insufficient_sample')
    return (
      <EmptyState
        icon="🌦"
        title="Örnek yetersiz"
        description={`İlişki için en az ${effect.required} gün gerekir; elde ${effect.sample} gün var. Bu yüzden korelasyon gösterilmiyor.`}
      />
    )
  const r = effect.temperatureCorrelation?.r
  const strength = r === undefined ? '' : Math.abs(r) < 0.3 ? 'zayıf' : Math.abs(r) < 0.6 ? 'orta' : 'güçlü'
  const rain = effect.rainEffect
  return (
    <Stack>
      <Card>
        <Stack gap="sm">
          <ConfidenceBadge confidence="relationship" />
          <p className={styles.rowTitle}>Sıcaklık ile ciro ilişkisi: {r === undefined ? 'hesaplanamadı' : `r = ${r} (${strength})`}</p>
          <Note>{effect.sample} gün · hafta günü-düzeltilmiş ciro endeksi</Note>
        </Stack>
      </Card>
      {rain && 'rainyIndex' in rain && (
        <Card>
          <Row title="Yağışlı günler" sub={`${rain.rainyDays} gün`} value={`endeks ${rain.rainyIndex}`} />
          <Row title="Kuru günler" sub={`${rain.dryDays} gün`} value={`endeks ${rain.dryIndex}`} />
        </Card>
      )}
      {rain && 'state' in rain && <Note>Yağış karşılaştırması için gruplarda yeterli gün yok ({rain.rainyDays} yağışlı, {rain.dryDays} kuru).</Note>}
      <Note>{effect.caveat}</Note>
    </Stack>
  )
}

// ---------------------------------------------------------------------------
// Provisional vs finalized, readings and completeness
// ---------------------------------------------------------------------------
export function FinalizationChip({ finalization }: { finalization: 'finalized' | 'provisional' | 'no_data' }) {
  if (finalization === 'finalized') return <StatusChip tone="success">Kesinleşmiş (Z)</StatusChip>
  if (finalization === 'provisional') return <StatusChip tone="warning">Geçici: Z yok</StatusChip>
  return <StatusChip tone="neutral">Rapor yok</StatusChip>
}

/** The X and Z readings, never added together: Z already includes X. */
export function ReadingsCard({ p }: { p: DailyAnalyticsPayload }) {
  if (!p.readings) return null
  const x = p.readings.x
  const z = p.readings.z
  return (
    <Card>
      <Stack gap="sm">
        <h3 className={styles.sectionTitle}>X / Z okumaları</h3>
        <FinalizationChip finalization={p.finalization} />
        <Row title="X (sabah)" sub={x.present ? undefined : 'Rapor yok'} value={x.present && x.revenue !== null ? formatMoney(x.revenue) : '—'} />
        <Row title="Z (akşam, kümülatif)" sub={z.present ? undefined : 'Rapor yok'} value={z.present && z.revenue !== null ? formatMoney(z.revenue) : '—'} />
        <Note>Z, X'i zaten içerir; ikisi toplanmaz. Günlük ciro Z'den türetilir. Z yoksa gün geçicidir ve X ayrı gösterilir.</Note>
        {p.warnings.map((w, i) => (
          <Note key={i}>
            {w.code === 'multiple_active_readings'
              ? `Uyarı: ${w.count} aktif ${w.type} okuması var; en son olan kullanılır (mevcut davranış).`
              : 'Uyarı: Z, X değerinden küçük; veri girişini kontrol edin.'}
          </Note>
        ))}
      </Stack>
    </Card>
  )
}

const METRIC_LABEL: Record<string, string> = {
  revenue: 'Ciro',
  transactions: 'İşlem sayısı',
  averageBasket: 'Ortalama sepet',
  categories: 'Kategori detayı',
  products: 'Ürün detayı',
  grossProfit: 'Brüt kâr',
  hourly: 'Saatlik analiz',
  context: 'Hava / takvim',
}

/** Why a metric is partial or unsupported (complete / partial / unsupported + reason codes). */
export function CompletenessCard({ completeness }: { completeness: Completeness }) {
  const entries = Object.entries(completeness.metrics)
  return (
    <Card>
      <Stack gap="sm">
        <h3 className={styles.sectionTitle}>Veri tamlığı</h3>
        {entries.map(([key, c]) => (
          <div key={key} className={styles.rowCard}>
            <div className={styles.rowMain}>
              <p className={styles.rowTitle}>{METRIC_LABEL[key] ?? key}</p>
              {c.reasons.length > 0 && <p className={styles.rowSub}>{c.reasons.map((r) => reasonText(r)).join(' · ')}</p>}
            </div>
            <StatusChip tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</StatusChip>
          </div>
        ))}
      </Stack>
    </Card>
  )
}
