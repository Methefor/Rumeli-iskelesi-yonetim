import { assemble, count, celsius, dateTr, dateWithWeekdayTr, directionTr, pctAbs, SectionBuilder, tl } from './format'
import type { DailyBranchFacts, DailyFactPack, Narrative } from './types'

const branchLine = (b: DailyBranchFacts, sec: SectionBuilder) => {
  if (b.finalization === 'finalized' && b.finalizedRevenue.value !== null) {
    sec.line(`${b.branchName}: kesinleşmiş ciro ${tl(b.finalizedRevenue.value)}.`, b.finalizedRevenue.ref)
  } else if (b.finalization === 'provisional' && b.provisionalRevenue.value !== null) {
    sec.line(`${b.branchName}: yalnızca X raporu var, geçici ciro ${tl(b.provisionalRevenue.value)}; Z gelene kadar kesinleşmedi.`, b.provisionalRevenue.ref)
  } else {
    sec.line(`${b.branchName}: bu tarih için rapor yok.`)
  }
}

/**
 * Deterministic Turkish renderer of the DAILY Fact Pack ("GÜNLÜK YÖNETİCİ ÖZETİ"). It states only what the pack supports, never
 * calculates, never uses causal language and carries every limitation forward. An AI narrative may later REPLACE this text only
 * after passing the same validator; this renderer is the fallback and does not depend on any AI.
 */
export function renderDailyNarrative(pack: DailyFactPack): Narrative {
  const org = pack.organization
  const multi = pack.branches.length > 1
  const sections = []

  // 1. Günün sonucu ------------------------------------------------------------------------------------------------------------
  const result = new SectionBuilder('result', 'Günün sonucu')
  const rc = org.reportingCompleteness
  let headline: string
  let summary: string
  if (pack.completeness.overall === 'no_data') {
    headline = `${dateTr(pack.businessDate)}: henüz rapor yok`
    summary = 'Bu tarih için gönderilmiş satış raporu bulunmuyor; ciro yorumu yapılmadı.'
    result.line(summary)
  } else {
    if (org.finalizedRevenue.value !== null) {
      const partial = org.finalizedRevenue.support === 'partial'
      headline = `${dateTr(pack.businessDate)}: ${tl(org.finalizedRevenue.value)} kesinleşmiş ciro${partial ? ' (kısmi)' : ''}`
      summary = partial
        ? `${dateWithWeekdayTr(pack.businessDate)} için Z raporu gelen şubelerin kesinleşmiş cirosu ${tl(org.finalizedRevenue.value)}; diğer şubelerin cirosu henüz kesinleşmedi.`
        : `${dateWithWeekdayTr(pack.businessDate)} kesinleşmiş ciro ${tl(org.finalizedRevenue.value)} (Z raporu).`
      result.line(summary, org.finalizedRevenue.ref)
    } else {
      headline = `${dateTr(pack.businessDate)}: ciro henüz kesinleşmedi`
      summary = 'Z raporu henüz yok; ciro kesinleşmedi.'
      result.line(summary)
    }
    if (multi) result.line(`${count(rc.total)} şubenin ${count(rc.finalizedBranches)} tanesinde Z raporu tamamlandı.`, 'org.reporting.total', rc.ref)
    if (org.provisionalRevenue.value !== null) {
      result.line(`Geçici (yalnızca X) ciro ${tl(org.provisionalRevenue.value)}; kesinleşmiş ciroya eklenmedi.`, org.provisionalRevenue.ref)
    }
    const only = pack.branches.length === 1 ? pack.branches[0] : undefined
    const cmp = only?.vsSameWeekdayLastWeek
    if (cmp && cmp.state === 'ok' && cmp.pct !== null && cmp.ref) {
      result.line(`Geçen haftanın aynı gününe göre ciroda ${pctAbs(cmp.pct)} ${directionTr(cmp.pct)}.`, cmp.ref)
    }
    if (org.transactions.value !== null) {
      result.line(`İşlem sayısı ${count(org.transactions.value)}${org.transactions.support === 'partial' ? ' (yalnızca verisi olan şubeler)' : ''}.`, org.transactions.ref)
      if (org.averageBasket.value !== null) result.line(`Ortalama sepet ${tl(org.averageBasket.value)}.`, org.averageBasket.ref)
    } else if (pack.limitations.some((l) => l.code === 'missing_transaction_count')) {
      result.line('İşlem sayısı bu veri kaynağında desteklenmediği için ortalama sepet karşılaştırması yapılmadı.')
    }
    if (org.grossProfit.value !== null) {
      result.line(`Brüt kâr ${tl(org.grossProfit.value)}${org.grossProfit.support === 'partial' ? ' (kısmi; ayrıntı sınırlamalar bölümünde)' : ''}; maliyet düşülmüş brüt tutardır, net kâr değildir.`, org.grossProfit.ref)
    }
  }
  sections.push(result.build())

  // 2. Dikkat gerekenler -------------------------------------------------------------------------------------------------------
  const att = new SectionBuilder('attention', 'Dikkat gerekenler')
  if (pack.attention.state === 'unavailable') {
    att.line(pack.attention.reason === 'not_current_date' ? 'Anlık uyarılar yalnızca bugünün özetinde gösterilir.' : 'Uyarı listesi şu anda okunamadı; bu "sorun yok" anlamına gelmez.')
  } else {
    const c = pack.attention.counts
    const top = pack.attention.items.filter((i) => i.severity !== 'info').slice(0, 5)
    if (c && (c.critical > 0 || c.warning > 0)) {
      att.line(`${count(c.critical)} kritik, ${count(c.warning)} uyarı maddesi var.`, 'attention.count.critical', 'attention.count.warning')
      for (const i of top) att.line(`${i.severity === 'critical' ? 'Kritik' : 'Uyarı'} · ${i.branchName}: ${i.title}${i.count !== null ? ` (${count(i.count)})` : ''}`, i.ref)
    } else if (pack.attention.unavailableSources.length === 0) {
      att.line('Bugün için kritik veya uyarı düzeyinde madde bulunmuyor.', 'attention.count.critical', 'attention.count.warning')
    }
    if (pack.attention.unavailableSources.length > 0) att.line('Bazı veri kaynakları okunamadığı için liste eksik olabilir; bu "sorun yok" anlamına gelmez.')
  }
  sections.push(att.build())

  // 3. Şube görünümü ------------------------------------------------------------------------------------------------------------
  if (multi) {
    const br = new SectionBuilder('branches', 'Şube görünümü')
    for (const b of pack.branches) branchLine(b, br)
    sections.push(br.build())
  }

  // 4. Operasyon ----------------------------------------------------------------------------------------------------------------
  const ops = new SectionBuilder('operations', 'Operasyon')
  const o = pack.operations
  if (o.shiftsCompleted.value !== null) ops.line(`${count(o.shiftsCompleted.value)} vardiya tamamlandı${o.shiftsOpen.value ? `, ${count(o.shiftsOpen.value)} vardiya açık veya planlı` : ''}.`, o.shiftsCompleted.ref, o.shiftsOpen.value ? o.shiftsOpen.ref : null)
  if (o.reportsSubmitted.value !== null) ops.line(`${count(o.reportsSubmitted.value)} rapor gönderildi.`, o.reportsSubmitted.ref)
  if (o.reconciliationError.value) ops.line(`${count(o.reconciliationError.value)} raporda mutabakat hatası var.`, o.reconciliationError.ref)
  if (o.reconciliationWarning.value) ops.line(`${count(o.reconciliationWarning.value)} raporda mutabakat uyarısı var.`, o.reconciliationWarning.ref)
  if (!o.reconciliationError.value && !o.reconciliationWarning.value && o.reportsSubmitted.value) ops.line('Mutabakat kontrollerinde hata veya uyarı yok.', o.reconciliationOk.ref)
  if (o.openReconciliationBacklog.value) ops.line(`${count(o.openReconciliationBacklog.value)} mutabakat sorunu inceleme bekliyor.`, o.openReconciliationBacklog.ref)
  for (const b of pack.branches) for (const a of b.anomalies) if (a.code === 'z_below_x') ops.line(`${b.branchName}: Z değeri X değerinden küçük; ciro Z olarak kaldı, kayıt gözden geçirilmeli.`, a.ref)
  if (ops.isEmpty) ops.line('Bu tarih için operasyonel kayıt yok.')
  sections.push(ops.build())

  // 5. Stok / fire / sayım ------------------------------------------------------------------------------------------------------
  const inv = new SectionBuilder('inventory', 'Stok, fire ve sayım')
  const iv = pack.inventory
  if (iv.stockAlertBranches.value) inv.line(`${count(iv.stockAlertBranches.value)} şubede stok uyarısı var.`, iv.stockAlertBranches.ref)
  for (const n of iv.countsMissingBranches) inv.line(`${n}: bu tarih için kapanış sayımı yok.`)
  for (const n of iv.unexplainedShortageBranches) inv.line(`${n}: sayımda açıklanamayan eksik var (kalem sayısı şube ayrıntısında).`)
  for (const n of iv.timingUncertainBranches) inv.line(`${n}: sayım eksiği var, fire zamanı belirsiz; nedeni doğrulanmadı.`)
  for (const b of pack.branches) {
    if (b.countOutcome?.unexplainedLines.value) inv.line(`${b.branchName}: ${count(b.countOutcome.unexplainedLines.value)} kalemde açıklanamayan sayım eksiği.`, b.countOutcome.unexplainedLines.ref)
    if (b.countOutcome?.timingUncertainLines.value) inv.line(`${b.branchName}: ${count(b.countOutcome.timingUncertainLines.value)} kalemde fire zamanı belirsiz.`, b.countOutcome.timingUncertainLines.ref)
  }
  if (iv.wasteEntries.value) {
    inv.line(`${count(iv.wasteEntries.value)} fire kaydı${iv.wasteCost.value !== null ? `, maliyeti ${tl(iv.wasteCost.value)}${iv.wasteCost.support === 'partial' ? ' (kısmi: bazı kalemlerde maliyet yok)' : ''}` : ' (maliyet hesaplanamadı)'}.`, iv.wasteEntries.ref, iv.wasteCost.ref)
  }
  if (inv.isEmpty) inv.line('Stok, fire veya sayım açısından bildirilecek bir durum yok.')
  sections.push(inv.build())

  // 6. Siparişler ---------------------------------------------------------------------------------------------------------------
  const pr = new SectionBuilder('procurement', 'Siparişler')
  const p = pack.procurement
  if (p.state === 'unavailable') {
    pr.line(p.reason === 'not_current_date' ? 'Sipariş durumu yalnızca bugünün özetinde gösterilir.' : 'Sipariş durumu şu anda okunamadı.')
  } else {
    const rows: Array<[typeof p.overdue, string]> = [
      [p.overdue, 'siparişin teslim tarihi geçti'],
      [p.awaitingApproval, 'sipariş onay bekliyor'],
      [p.dueToday, 'sipariş bugün teslim edilecek'],
      [p.partiallyReceived, 'sipariş kısmen teslim alındı'],
      [p.receiptWarnings, 'siparişte teslim alınan miktar stok kaydıyla uyuşmuyor'],
      [p.lowStockNoOpenOrder, 'üründe stok az ve açık sipariş yok'],
    ]
    for (const [f, text] of rows) if (f.value) pr.line(`${count(f.value)} ${text}.`, f.ref)
    if (pr.isEmpty) pr.line('Bekleyen, geciken veya dikkat gerektiren sipariş yok.', p.overdue.ref)
  }
  sections.push(pr.build())

  // 7. Hava ve bağlam -----------------------------------------------------------------------------------------------------------
  const wx = new SectionBuilder('weather', 'Hava ve bağlam')
  for (const f of pack.weather.forecast) {
    if (f.status === 'unavailable') wx.line(`${f.branchName}: hava verisi alınamıyor.`)
    else if (f.rainExpected) wx.line(`${f.branchName}: önümüzdeki saatlerde yağış tahmin ediliyor (tahmin; satışa etkisi desteklenmiyor).`, f.ref)
    if (f.status === 'stale') wx.line(`${f.branchName}: hava tahmini eski olabilir.`)
  }
  for (const h of pack.weather.historical) {
    if (h.state === 'present' && h.temperatureC !== null) {
      wx.line(`${h.branchName}: günlük ortalama sıcaklık ${celsius(h.temperatureC)} (${h.provenance === 'reanalysis' ? 'modellenmiş geçmiş veri, doğrudan ölçüm değil' : 'geçmiş bağlam'}).`, h.ref)
    }
  }
  if (wx.isEmpty) wx.line(pack.weather.state === 'unavailable' ? 'Bu rapor için hava bağlamı yok.' : 'Hava açısından belirtilecek bir durum yok.')
  wx.line('Hava ile satış arasındaki geçmiş ilişki haftalık özetinde değerlendirilir.')
  sections.push(wx.build())

  // 8. Yarın için takip (constrained to existing facts; no prediction, no staffing, no quantities) --------------------------------
  if (pack.isCurrentDate) {
    const nx = new SectionBuilder('tomorrow', 'Yarın için takip')
    if (pack.branches.some((b) => b.finalization === 'provisional')) nx.line('Z raporu bekleyen şubelerin Z raporlarını tamamlaması.', 'org.reporting.finalizedBranches')
    if (pack.attention.counts && pack.attention.counts.critical + pack.attention.counts.warning > 0) nx.line('Çözülmemiş kritik ve uyarı maddelerinin kapatılması.', 'attention.count.critical', 'attention.count.warning')
    if (pack.procurement.overdue.value) nx.line(`${count(pack.procurement.overdue.value)} geciken siparişin teslim durumunun takibi.`, pack.procurement.overdue.ref)
    if (pack.procurement.dueToday.value) nx.line(`${count(pack.procurement.dueToday.value)} siparişin teslimatının kontrolü.`, pack.procurement.dueToday.ref)
    for (const n of pack.inventory.countsMissingBranches) nx.line(`${n}: kapanış sayımının yapılması.`)
    if (!nx.isEmpty) sections.push(nx.build())
  }

  return assemble('daily', headline, summary, sections, pack.limitations, pack.generatedAt)
}
