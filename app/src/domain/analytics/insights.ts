import type { AnalyticsInsight, Comparison, DailyAnalyticsPayload, WeeklyAnalyticsPayload } from './types'

/**
 * Deterministic insights (TypeScript twin of analytics_write_daily_insights /
 * analytics_write_weekly_insights in the SQL migration). Each insight is a `fact`
 * or a `relationship` computed from the payload; a `hypothesis` can only come
 * from the validated AI report, never from here.
 */

const direction = (c: Comparison) => ((c.delta ?? 0) >= 0 ? 'yüksek' : 'düşük')

function insight(
  scope: 'daily' | 'weekly',
  confidence: AnalyticsInsight['confidence'],
  code: string,
  title: string,
  evidence: Record<string, unknown>,
  isFinancial: boolean,
): AnalyticsInsight {
  return { id: `${scope}:${code}`, scope, confidence, code, title, body: null, evidence, isFinancial, origin: 'deterministic' }
}

export function deriveDailyInsights(p: DailyAnalyticsPayload): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = []
  const pw = p.financialComparisons?.grossRevenue.previousWeekSameWeekday
  const base = p.financialComparisons?.grossRevenue.baseline4SameWeekday
  if (pw?.state === 'ok')
    out.push(
      insight('daily', 'fact', 'revenue_vs_previous_week_same_weekday', `Ciro, geçen haftanın aynı gününe göre %${pw.pct} ${direction(pw)}`, { comparison: pw }, true),
    )
  if (base?.state === 'ok')
    out.push(
      insight('daily', 'fact', 'revenue_vs_baseline4', `Ciro, son ${base.samples} haftanın aynı gün ortalamasına göre %${base.pct} ${direction(base)}`, { comparison: base }, true),
    )
  if (p.finalization === 'provisional')
    out.push(
      insight('daily', 'fact', 'revenue_provisional', 'Günün cirosu geçici: Z raporu yok, yalnızca X okuması var', { provisionalRevenue: p.financial?.provisionalRevenue ?? null }, true),
    )
  if (p.financial?.grossProfit.metric.state === 'partial' && p.financial.grossProfit.metric.reason === 'missing_cost')
    out.push(
      insight('daily', 'fact', 'gross_profit_partial_coverage', 'Brüt kâr kısmi: cirosunun bir bölümü için maliyet/ürün eşlemesi yok', { grossProfit: p.financial.grossProfit }, true),
    )
  return out
}

export function deriveWeeklyInsights(p: WeeklyAnalyticsPayload): AnalyticsInsight[] {
  const out: AnalyticsInsight[] = []
  const rev = p.financialComparisons?.grossRevenue
  const tx = p.volumeComparisons.transactions
  if (rev?.state === 'ok')
    out.push(insight('weekly', 'fact', 'weekly_revenue_change', `Haftalık ciro, önceki haftaya göre %${rev.pct} ${direction(rev)}`, { comparison: rev }, true))
  if (tx.state === 'ok')
    out.push(insight('weekly', 'fact', 'weekly_transactions_change', `Haftalık işlem sayısı, önceki haftaya göre %${tx.pct} ${direction(tx)}`, { comparison: tx }, false))
  if (p.provisionalDays > 0)
    out.push(insight('weekly', 'fact', 'weekly_provisional_days', `${p.provisionalDays} günün Z raporu yok; hafta kesinleşmedi`, { provisionalDays: p.provisionalDays }, false))
  const best = [...(p.days ?? [])]
    .filter((d) => d.hasData && d.finalization === 'finalized' && d.grossRevenue !== null)
    .sort((a, b) => (b.grossRevenue as number) - (a.grossRevenue as number) || (a.date < b.date ? -1 : 1))[0]
  if (best) out.push(insight('weekly', 'fact', 'weekly_best_day', `Haftanın en yüksek ciro günü: ${best.date}`, { date: best.date, grossRevenue: best.grossRevenue }, true))
  const wx = p.weatherEffect
  if (wx?.state === 'ok' && wx.temperatureCorrelation)
    out.push(
      insight('weekly', 'relationship', 'weather_relationship', `Sıcaklık ile hafta günü-düzeltilmiş ciro arasında ilişki (r=${wx.temperatureCorrelation.r}, n=${wx.sample})`, { weatherEffect: wx }, true),
    )
  return out
}
