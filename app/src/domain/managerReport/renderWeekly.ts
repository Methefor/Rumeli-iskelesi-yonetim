import { assemble, count, celsius, dateTr, decimal2, directionTr, pctAbs, SectionBuilder, tl } from './format'
import type { Narrative, RecurrenceItem, WeeklyBranchFacts, WeeklyFactPack } from './types'

const RECURRENCE_TEXT: Record<RecurrenceItem['code'], string> = {
  missing_z: 'Z raporu eksikliği',
  reconciliation_warning: 'mutabakat uyarısı',
  reconciliation_error: 'mutabakat hatası',
  z_below_x: 'Z değerinin X değerinden küçük olması',
  count_unexplained_shortage: 'açıklanamayan sayım eksiği',
  count_timing_uncertain: 'fire zamanı belirsiz sayım eksiği',
}

const rangeTr = (a: string, b: string) => `${dateTr(a)} – ${dateTr(b)}`

const branchRevenue = (b: WeeklyBranchFacts, sec: SectionBuilder) => {
  if (b.finalizedRevenue.value === null) {
    sec.line(`${b.branchName}: haftalık kesinleşmiş ciro hesaplanamadı.`)
    return
  }
  const partial = b.finalizedRevenue.support === 'partial'
  let text = `${b.branchName}: ${tl(b.finalizedRevenue.value)}${partial ? ' (kısmi)' : ''}`
  const refs: Array<string | null> = [b.finalizedRevenue.ref]
  if (b.vsPreviousWeek.state === 'ok' && b.vsPreviousWeek.pct !== null) {
    text += `, önceki haftaya göre ${pctAbs(b.vsPreviousWeek.pct)} ${directionTr(b.vsPreviousWeek.pct)}`
    refs.push(b.vsPreviousWeek.ref)
  }
  sec.line(`${text}.`, ...refs)
}

/**
 * Deterministic Turkish renderer of the WEEKLY Fact Pack ("HAFTALIK YÖNETİCİ ÖZETİ"). Revenue is only the finalized (Z) revenue of
 * the supported weeks; an unfinished week is stated as such; relationships are written as associations, never causes; a section
 * without supported facts says so instead of guessing.
 */
export function renderWeeklyNarrative(pack: WeeklyFactPack): Narrative {
  const org = pack.organization
  const multi = pack.branches.length > 1
  const sections = []
  const weekLabel = rangeTr(pack.weekStart, pack.weekEnd)

  // 1. Hafta özeti ---------------------------------------------------------------------------------------------------------------
  const sum = new SectionBuilder('summary', 'Hafta özeti')
  let headline: string
  let summary: string
  if (pack.completeness.overall === 'no_data') {
    headline = `${weekLabel}: veri yok`
    summary = 'Bu hafta için satış verisi bulunmuyor; hafta yorumu yapılmadı.'
    sum.line(summary)
  } else if (org.finalizedRevenue.value !== null) {
    const partial = org.finalizedRevenue.support === 'partial'
    headline = `${weekLabel}: ${tl(org.finalizedRevenue.value)} kesinleşmiş ciro${pack.weekComplete ? '' : ' (hafta sürüyor)'}`
    summary = pack.weekComplete
      ? `Hafta boyunca kesinleşmiş ciro ${tl(org.finalizedRevenue.value)}${partial ? ' (kısmi: bazı günlerde Z raporu yok)' : ''}.`
      : `Haftanın şu ana kadarki kesinleşmiş cirosu ${tl(org.finalizedRevenue.value)}; hafta henüz bitmedi, kesin hafta sonucu değildir.`
    sum.line(summary, org.finalizedRevenue.ref)
  } else {
    headline = `${weekLabel}: ciro kesinleşmedi`
    summary = 'Haftanın cirosu henüz kesinleşmedi (Z raporu yok).'
    sum.line(summary)
  }
  if (org.provisionalRevenue.value !== null) sum.line(`Geçici (yalnızca X) ciro ${tl(org.provisionalRevenue.value)}; kesinleşmiş ciroya eklenmedi.`, org.provisionalRevenue.ref)
  sections.push(sum.build())

  // 2. Ciro ve performans --------------------------------------------------------------------------------------------------------
  const perf = new SectionBuilder('performance', 'Ciro ve performans')
  if (org.vsPreviousWeek.support === 'complete' && org.vsPreviousWeek.pct !== null) {
    perf.line(`Önceki haftaya göre kesinleşmiş ciroda ${pctAbs(org.vsPreviousWeek.pct)} ${directionTr(org.vsPreviousWeek.pct)} (önceki hafta ${tl(org.vsPreviousWeek.baseline ?? 0)}).`, org.vsPreviousWeek.refs.pct, org.vsPreviousWeek.refs.baseline)
    if (org.vsPreviousWeek.reasons.includes('mixed_origin')) perf.line('Karşılaştırma eski ve yeni sistem verisini birlikte içerir; yalnızca ciro karşılaştırılabilir.')
  } else {
    perf.line('Önceki haftayla karşılaştırma yapılamadı: uygun, kesinleşmiş bir önceki hafta verisi yok.')
  }
  if (org.strongestDay && org.weakestDay) {
    perf.line(`En güçlü gün ${dateTr(org.strongestDay.date)} (${tl(org.strongestDay.revenue)}), en zayıf gün ${dateTr(org.weakestDay.date)} (${tl(org.weakestDay.revenue)}).`, org.strongestDay.ref, org.weakestDay.ref)
  } else if (multi || pack.branches.length === 1) {
    const only = pack.branches.length === 1 ? pack.branches[0] : undefined
    if (only?.strongestDay && only.weakestDay) {
      perf.line(`En güçlü gün ${dateTr(only.strongestDay.date)} (${tl(only.strongestDay.revenue)}), en zayıf gün ${dateTr(only.weakestDay.date)} (${tl(only.weakestDay.revenue)}).`, only.strongestDay.ref, only.weakestDay.ref)
    } else {
      perf.line(pack.weekComplete ? 'Güçlü/zayıf gün karşılaştırması için yeterli sayıda kesinleşmiş gün yok.' : 'En güçlü ve en zayıf gün, hafta tamamlandığında belirlenir.')
    }
  }
  if (org.transactions.value !== null) {
    perf.line(`İşlem sayısı ${count(org.transactions.value)}${org.transactions.support === 'partial' ? ' (yalnızca verisi olan şubeler)' : ''}.`, org.transactions.ref)
    const only = pack.branches.length === 1 ? pack.branches[0] : undefined
    if (only?.transactionsVsPreviousWeek.state === 'ok' && only.transactionsVsPreviousWeek.pct !== null) {
      perf.line(`İşlem sayısında önceki haftaya göre ${pctAbs(only.transactionsVsPreviousWeek.pct)} ${directionTr(only.transactionsVsPreviousWeek.pct)}.`, only.transactionsVsPreviousWeek.ref)
    }
    if (only?.basketVsPreviousWeek.state === 'ok' && only.basketVsPreviousWeek.pct !== null) {
      perf.line(`Ortalama sepette önceki haftaya göre ${pctAbs(only.basketVsPreviousWeek.pct)} ${directionTr(only.basketVsPreviousWeek.pct)}.`, only.basketVsPreviousWeek.ref)
    }
  } else if (pack.limitations.some((l) => l.code === 'missing_transaction_count' || l.code === 'mixed_origin')) {
    perf.line('İşlem sayısı bu veri kaynağında desteklenmediği için ortalama sepet karşılaştırması yapılmadı.')
  }
  if (org.grossProfit.value !== null) {
    perf.line(`Brüt kâr ${tl(org.grossProfit.value)}${org.grossProfit.support === 'partial' ? ' (kısmi; ayrıntı sınırlamalar bölümünde)' : ''}; maliyet düşülmüş brüt tutardır, net kâr değildir.`, org.grossProfit.ref)
  }
  sections.push(perf.build())

  // 3. Şube karşılaştırması -------------------------------------------------------------------------------------------------------
  if (multi) {
    const br = new SectionBuilder('branches', 'Şube karşılaştırması')
    for (const b of pack.branches) branchRevenue(b, br)
    sections.push(br.build())
  }

  // 4. Operasyonel sorunlar -------------------------------------------------------------------------------------------------------
  const ops = new SectionBuilder('issues', 'Operasyonel sorunlar')
  const o = pack.operations
  if (o.missingZDays.value) ops.line(`${count(o.missingZDays.value)} şube-gününde Z raporu eksik kaldı.`, o.missingZDays.ref)
  if (o.reconciliationErrorDays.value) ops.line(`${count(o.reconciliationErrorDays.value)} şube-gününde mutabakat hatası görüldü${o.reconciliationErrorDays.support === 'partial' ? ' (günlük kaydı eksik günler hariç)' : ''}.`, o.reconciliationErrorDays.ref)
  if (o.reconciliationWarningDays.value) ops.line(`${count(o.reconciliationWarningDays.value)} şube-gününde mutabakat uyarısı görüldü${o.reconciliationWarningDays.support === 'partial' ? ' (günlük kaydı eksik günler hariç)' : ''}.`, o.reconciliationWarningDays.ref)
  if (o.zBelowXDays.value) ops.line(`${count(o.zBelowXDays.value)} şube-gününde Z değeri X değerinden küçüktü; ciro Z olarak kaldı.`, o.zBelowXDays.ref)
  for (const r of pack.recurrence.items) {
    ops.line(`${r.branchName}: ${RECURRENCE_TEXT[r.code]} bu hafta ${count(r.days)} gün görüldü.`, r.ref)
  }
  if (ops.isEmpty) ops.line('Bu hafta kaydedilen günlerde operasyonel sorun görülmedi.', o.missingZDays.ref)
  ops.line('Düşük stok ve geciken sipariş günlük olarak geçmişe dönük saklanmadığı için haftalık tekrar sayımı yapılamadı.')
  sections.push(ops.build())

  // 5. Stok / fire / sayım --------------------------------------------------------------------------------------------------------
  const inv = new SectionBuilder('inventory', 'Stok, fire ve sayım')
  const iv = pack.inventory
  if (iv.wasteEntries.value !== null) {
    inv.line(`${count(iv.wasteEntries.value)} fire kaydı${iv.wasteCost.value !== null ? `, toplam maliyeti ${tl(iv.wasteCost.value)}${iv.wasteCost.support === 'partial' ? ' (kısmi: bazı kalemlerde maliyet yok)' : ''}` : ' (maliyet hesaplanamadı)'}.`, iv.wasteEntries.ref, iv.wasteCost.ref)
  }
  for (const n of iv.countShortageBranches) inv.line(`${n}: bu hafta açıklanamayan sayım eksiği görüldü.`)
  for (const n of iv.timingUncertainBranches) inv.line(`${n}: sayım eksiği var, fire zamanı belirsiz; nedeni doğrulanmadı.`)
  if (inv.isEmpty) inv.line('Stok, fire veya sayım verisi okunamadı.')
  sections.push(inv.build())

  // 6. Tedarik ve sipariş ---------------------------------------------------------------------------------------------------------
  const pr = new SectionBuilder('procurement', 'Tedarik ve sipariş')
  const p = pack.procurement
  if (p.state === 'unavailable') {
    pr.line('Sipariş durumu anlık bir durumdur; geçmiş haftalar için saklanmadığından bu özette yer almaz.')
  } else {
    const rows: Array<[typeof p.overdue, string]> = [
      [p.overdue, 'siparişin teslim tarihi geçti'],
      [p.awaitingApproval, 'sipariş onay bekliyor'],
      [p.partiallyReceived, 'sipariş kısmen teslim alındı'],
      [p.receiptWarnings, 'siparişte teslim alınan miktar stok kaydıyla uyuşmuyor'],
      [p.lowStockNoOpenOrder, 'üründe stok az ve açık sipariş yok'],
    ]
    for (const [f, text] of rows) if (f.value) pr.line(`Şu an ${count(f.value)} ${text}.`, f.ref)
    if (pr.isEmpty) pr.line('Şu an geciken, onay bekleyen veya dikkat gerektiren sipariş yok.', p.overdue.ref)
  }
  sections.push(pr.build())

  // 7. Hava / bağlam ilişkileri (historical context only; relationships are associations, never causes) ---------------------------
  const wx = new SectionBuilder('weather', 'Hava ve bağlam ilişkileri')
  for (const r of pack.weather.relationships) {
    if (r.state === 'ok') {
      if (r.rainDifferencePct !== null && r.refs.rainDifferencePct) {
        wx.line(`${r.branchName}: geçmiş verilerde yağışlı günlerde ciro, kuru günlere göre ${pctAbs(r.rainDifferencePct)} ${r.rainDifferencePct < 0 ? 'düşük' : 'yüksek'} görüldü (${count(r.rainyDays ?? 0)} yağışlı, ${count(r.dryDays ?? 0)} kuru gün). Bu bir ilişkidir, neden-sonuç iddiası değildir.`, r.refs.rainDifferencePct, r.refs.rainyDays, r.refs.dryDays)
      }
      if (r.temperatureCorrelation !== null && r.refs.temperatureCorrelation) {
        wx.line(`${r.branchName}: sıcaklık ile ciro arasında ${count(r.sample)} günlük örnekte ${decimal2(r.temperatureCorrelation)} ilişki katsayısı görüldü; bu bir ilişkidir, neden-sonuç iddiası değildir.`, r.refs.temperatureCorrelation, r.refs.sample)
      }
    } else if (r.state === 'insufficient_sample') {
      wx.line(`${r.branchName}: hava ile ciro ilişkisi için yeterli örnek yok (${count(r.sample)} gün${r.required !== null ? `, en az ${count(r.required)} gün gerekir` : ''}); yorum yapılmadı.`, r.refs.sample, r.refs.required)
    } else {
      wx.line(`${r.branchName}: hava bağlamı eksik olduğu için ilişki değerlendirilemedi.`)
    }
  }
  const temps = pack.weather.historical.filter((h) => h.temperatureC !== null)
  if (temps.length > 0) {
    const reanalysis = temps.every((h) => h.provenance === 'reanalysis')
    wx.line(`Haftanın günlük sıcaklık bağlamı mevcut${reanalysis ? ' (modellenmiş geçmiş veri; doğrudan ölçüm değildir)' : ''}.`, ...temps.slice(0, 7).map((h) => h.ref))
    const first = temps[0]
    if (first?.temperatureC !== null && first) wx.line(`Örnek: ${first.branchName}, ${dateTr(first.date)} günlük ortalama ${celsius(first.temperatureC as number)}.`, first.ref)
  }
  if (wx.isEmpty) wx.line('Bu hafta için hava bağlamı yok.')
  sections.push(wx.build())

  // 8. Önümüzdeki hafta takip listesi (existing unresolved facts only; no prediction, staffing or quantities) ----------------------
  const nx = new SectionBuilder('next', 'Önümüzdeki hafta takip listesi')
  if (o.missingZDays.value) nx.line('Z raporu eksik kalan günlerin tamamlanması.', o.missingZDays.ref)
  for (const r of pack.recurrence.items.filter((x) => x.code === 'reconciliation_error' || x.code === 'reconciliation_warning')) nx.line(`${r.branchName}: ${RECURRENCE_TEXT[r.code]} kayıtlarının gözden geçirilmesi.`, r.ref)
  if (pack.procurement.overdue.value) nx.line(`${count(pack.procurement.overdue.value)} geciken siparişin takibi.`, pack.procurement.overdue.ref)
  if (pack.procurement.awaitingApproval.value) nx.line(`${count(pack.procurement.awaitingApproval.value)} onay bekleyen siparişin karara bağlanması.`, pack.procurement.awaitingApproval.ref)
  if (pack.inventory.countShortageBranches.length > 0) nx.line(`Açıklanamayan sayım eksiği olan şubelerin sayım incelemesi: ${pack.inventory.countShortageBranches.join(', ')}.`)
  if (!nx.isEmpty) sections.push(nx.build())

  // 9. Veri kalitesi / eksikler ---------------------------------------------------------------------------------------------------
  const dq = new SectionBuilder('quality', 'Veri kalitesi ve eksikler')
  if (!pack.weekComplete) dq.line('Hafta henüz bitmedi; değerler şu ana kadarki kısımdır.')
  if (pack.limitations.length === 0) dq.line('Bu özet için bildirilecek bir veri eksiği yok.')
  else dq.line('Bu özetin sınırları aşağıda "Sınırlamalar" bölümünde listelenmiştir.')
  sections.push(dq.build())

  return assemble('weekly', headline, summary, sections, pack.limitations, pack.generatedAt)
}
