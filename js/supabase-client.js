import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = 'https://iwikwbjsznjuefvuemdb.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3aWt3Ympzem5qdWVmdnVlbWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzkwNzEsImV4cCI6MjA4NTg1NTA3MX0.JLTiyDsrzcyEQEf_yS0cwUwtR3H1FaPl4mRFBRk142Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function localDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

// ─── KASİYER ─────────────────────────────────────────────────────────────────

export async function getAllCashiers() {
  return await supabase.from('cashiers').select('*').order('name')
}

export async function addCashier(name, pin) {
  return await supabase.from('cashiers')
    .insert([{ name, pin, badge_level: 'yeni', total_points: 0, active: true }])
    .select().single()
}

export async function updateCashierPin(id, newPin) {
  return await supabase.from('cashiers').update({ pin: newPin }).eq('id', id).select().single()
}

export async function updateCashierName(id, newName) {
  return await supabase.from('cashiers').update({ name: newName }).eq('id', id).select().single()
}

export async function setCashierActive(id, active) {
  return await supabase.from('cashiers').update({ active }).eq('id', id).select().single()
}

export async function updateCashierProfile(id, fields) {
  return await supabase.from('cashiers').update(fields).eq('id', id).select().single()
}

// ─── VARDİYA KONTROL ─────────────────────────────────────────────────────────

/**
 * Belirtilen tarih + vardiya + kasa için kayıt yapılmış mı kontrol eder.
 * Döner: { data: { id, cashier_id, entry_time, cashiers: { name } } | null }
 */
export async function checkShiftExists(date, shift, kasa) {
  const { data, error } = await supabase
    .from('daily_reports')
    .select('id, cashier_id, entry_time, cashiers(name)')
    .eq('date', date)
    .eq('kasa', kasa)
    .eq('shift', shift)
    .maybeSingle()
  return { data, error }
}

// ─── YENİ VARDİYA GİRİŞİ ─────────────────────────────────────────────────────

/**
 * 2-kasa sistemi için yeni vardiya girişi.
 * kasa: 'ana_kasa' | 'iki_kasa'
 * Sabah = X Raporu (balik/dondurma yok), Akşam = Z Raporu (balik+dondurma var)
 *
 * Puanlama (max 100 / giriş — oran tabanlı adil yarış):
 *   Zamanında  → +50 puan   (Geç → 0)
 *   Eksiksiz   → +50 puan
 *     Ana Kasa: rapor > 0 && en az 2 ek alan dolu
 *     2. Kasa:  rapor > 0 (kategori yok)
 */
export async function insertShiftEntry(data) {
  const now      = new Date()
  const todayStr = localDateStr(now)
  const kasa     = data.kasa || 'ana_kasa'

  // — Zamanında mı? —
  let isOnTime = false
  if (data.selectedDate === todayStr) {
    const h = now.getHours(), m = now.getMinutes()
    if (data.shift === 'sabah') {
      isOnTime = h < 17 || (h === 17 && m <= 30)
    } else {
      isOnTime = h >= 16 || h === 0 || (h === 1 && m === 0)
    }
  }

  // — Eksiksiz veri mi? —
  const extraFields = [
    data.balikEkmek, data.dondurmaZ,
    data.kahve, data.meyveSuyu, data.sicakIcecek, data.sogukIcecek, data.tatli,
    data.gida, data.kahvalti, data.salata, data.dondurmaKategori, data.borekCorek,
  ]
  // Her iki kasa için de rapor + en az 2 kategori alanı dolu olmalı
  const hasCompleteData =
    parseFloat(data.rumeliZ1) > 0 && extraFields.filter(v => parseFloat(v) > 0).length >= 2

  // — Puan (max 100) — iki_kasa puanlamaya dahil edilmez
  const pointsEarned = kasa === 'iki_kasa' ? 0 : (isOnTime ? 50 : 0) + (hasCompleteData ? 50 : 0)

  // — Toplam ciro —
  const totalRevenue =
    (parseFloat(data.rumeliZ1)   || 0) +
    (parseFloat(data.balikEkmek) || 0) +
    (parseFloat(data.dondurmaZ)  || 0)

  const reportRecord = {
    date:          data.selectedDate,
    cashier_id:    data.cashierId,
    kasa:          kasa,
    shift:         data.shift,
    register_name: kasa === 'ana_kasa' ? 'Ana Kasa' : '2. Kasa',

    rumeli_z1:    parseFloat(data.rumeliZ1)   || 0,
    rumeli_z2:    0,
    balik_ekmek:  parseFloat(data.balikEkmek) || 0,
    dondurma:     parseFloat(data.dondurmaZ)  || 0,
    dondurma_adet: 0,

    kahve:        parseFloat(data.kahve)       || 0,
    sicak_icecek: parseFloat(data.sicakIcecek) || 0,
    soguk_icecek: parseFloat(data.sogukIcecek) || 0,
    tatli:        parseFloat(data.tatli)       || 0,
    meyvesuyu:    parseFloat(data.meyveSuyu)   || 0,
    gida:         parseFloat(data.gida)        || 0,
    kahvalti:     parseFloat(data.kahvalti)    || 0,
    salata:       parseFloat(data.salata)      || 0,

    dondurma_kategori: parseFloat(data.dondurmaKategori) || 0,
    borek_corek:       parseFloat(data.borekCorek)       || 0,
    depo: 0,

    notlar:             data.notlar || '',
    total_revenue:      totalRevenue,
    individual_revenue: totalRevenue,
    entry_time:         now.toISOString(),
    is_on_time:         isOnTime,
    points_earned:      pointsEarned,
  }

  const { data: reportData, error: reportError } = await supabase
    .from('daily_reports')
    .insert([reportRecord])
    .select()
    .single()

  if (reportError) return { data: null, error: reportError }

  if (kasa !== 'iki_kasa') {
    await supabase.from('entry_history').insert([{
      cashier_id:     data.cashierId,
      report_id:      reportData.id,
      shift:          data.shift,
      kasa:           kasa,
      entry_time:     now.toISOString(),
      is_on_time:     isOnTime,
      is_complete:    hasCompleteData,
      points_earned:  pointsEarned,
      revenue_amount: totalRevenue,
    }])

    await _syncMonthlyScore(data.cashierId, now)
  }

  return {
    data: { ...reportData, pointsEarned, isOnTime, isComplete: hasCompleteData },
    error: null,
  }
}

// ─── VARDİYA DÜZENLEME (-5 PUAN CEZA) ───────────────────────────────────────

/**
 * Mevcut vardiya kaydını günceller.
 * Her düzenleme sabit -5 puan cezası uygular (min 0).
 */
export async function updateShiftEntry(reportId, formData, cashierId) {
  const { data: existing } = await supabase
    .from('daily_reports')
    .select('points_earned')
    .eq('id', reportId)
    .single()

  const newPoints = Math.max(0, (parseInt(existing?.points_earned) || 0) - 5)

  const totalRevenue =
    (parseFloat(formData.rumeliZ1)   || 0) +
    (parseFloat(formData.balikEkmek) || 0) +
    (parseFloat(formData.dondurmaZ)  || 0)

  const { data, error } = await supabase
    .from('daily_reports')
    .update({
      rumeli_z1:    parseFloat(formData.rumeliZ1)   || 0,
      balik_ekmek:  parseFloat(formData.balikEkmek) || 0,
      dondurma:     parseFloat(formData.dondurmaZ)  || 0,
      kahve:        parseFloat(formData.kahve)       || 0,
      sicak_icecek: parseFloat(formData.sicakIcecek) || 0,
      soguk_icecek: parseFloat(formData.sogukIcecek) || 0,
      tatli:        parseFloat(formData.tatli)       || 0,
      meyvesuyu:    parseFloat(formData.meyveSuyu)   || 0,
      gida:         parseFloat(formData.gida)        || 0,
      kahvalti:          parseFloat(formData.kahvalti)         || 0,
      salata:            parseFloat(formData.salata)            || 0,
      dondurma_kategori: parseFloat(formData.dondurmaKategori) || 0,
      borek_corek:       parseFloat(formData.borekCorek)       || 0,
      notlar:            formData.notlar || '',
      total_revenue:      totalRevenue,
      individual_revenue: totalRevenue,
      points_earned:      newPoints,
    })
    .eq('id', reportId)
    .select()
    .single()

  if (error) return { data: null, error }

  await _syncMonthlyScore(cashierId, new Date())
  return { data: { ...data, pointsEarned: newPoints }, error: null }
}

// ─── PUAN SENKRONİZASYONU (İÇSEL) ───────────────────────────────────────────

/**
 * Kasiyer aylık toplam puanını ve rozet seviyesini günceller.
 * Rozet: performans oranına (%) göre belirlenir, toplam puana göre değil.
 */
async function _syncMonthlyScore(cashierId, now) {
  try {
    const monthStart = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1))
    const monthEnd   = localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0))

    const { data: monthReports } = await supabase
      .from('daily_reports')
      .select('points_earned')
      .eq('cashier_id', cashierId)
      .neq('kasa', 'iki_kasa')
      .gte('date', monthStart)
      .lte('date', monthEnd)

    if (!monthReports?.length) return

    const totalPoints    = monthReports.reduce((s, r) => s + (parseInt(r.points_earned) || 0), 0)
    const entryCount     = monthReports.length
    const performancePct = Math.round((totalPoints / (entryCount * 100)) * 100)

    // Rozet seviyesi — oran + minimum giriş sayısı tabanlı
    let badgeLevel = 'yeni'
    if      (entryCount >= 30 && performancePct >= 95) badgeLevel = 'efsane_plus'
    else if (entryCount >= 24 && performancePct >= 88) badgeLevel = 'efsane'
    else if (entryCount >= 18 && performancePct >= 80) badgeLevel = 'elmas'
    else if (entryCount >= 12 && performancePct >= 72) badgeLevel = 'altin'
    else if (entryCount >= 8  && performancePct >= 62) badgeLevel = 'gumus'
    else if (entryCount >= 4  && performancePct >= 50) badgeLevel = 'bronz'

    const { data: cashierRow } = await supabase
      .from('cashiers').select('badge_level').eq('id', cashierId).single()

    const payload = { total_points: totalPoints }
    if (!cashierRow?.badge_level?.startsWith('ozel_')) {
      payload.badge_level = badgeLevel
    }
    await supabase.from('cashiers').update(payload).eq('id', cashierId)
  } catch (err) {
    console.error('Puan senkronizasyonu hatası:', err)
  }
}

// ─── PROFİL FOTOĞRAFI ────────────────────────────────────────────────────────

export async function uploadCashierAvatar(cashierId, file) {
  const ext  = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const path = `${cashierId}/avatar.${ext}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) return { url: null, error: uploadError }

  const { data: { publicUrl } } = supabase.storage
    .from('avatars')
    .getPublicUrl(path)

  // URL'ye cache-buster ekle — upsert sonrası tarayıcı eski görseli gösterebilir
  const cacheBusted = publicUrl + '?t=' + Date.now()

  const { error: dbError } = await supabase
    .from('cashiers')
    .update({ avatar_url: publicUrl })
    .eq('id', cashierId)

  return { url: cacheBusted, error: dbError }
}

// ─── VARDİYA PLANLAMASI ──────────────────────────────────────────────────────

function _monthRange(year, month) {
  const mm      = String(month).padStart(2, '0')
  const lastDay = new Date(year, month, 0).getDate()
  return { start: `${year}-${mm}-01`, end: `${year}-${mm}-${String(lastDay).padStart(2,'0')}` }
}

export async function getMonthSchedule(year, month) {
  const { start, end } = _monthRange(year, month)
  return await supabase
    .from('shift_schedule')
    .select('*, cashiers(name)')
    .gte('date', start)
    .lte('date', end)
    .order('date', { ascending: true })
    .order('shift', { ascending: true })
}

export async function upsertShiftSlot(date, shift, kasa, cashierId) {
  return await supabase
    .from('shift_schedule')
    .upsert(
      { date, shift, kasa, cashier_id: cashierId || null, updated_at: new Date().toISOString() },
      { onConflict: 'date,shift,kasa' }
    )
    .select('*, cashiers(name)')
    .single()
}

export async function deleteShiftSlot(date, shift, kasa) {
  return await supabase
    .from('shift_schedule')
    .delete()
    .eq('date', date)
    .eq('shift', shift)
    .eq('kasa', kasa)
}

export async function getChampionData(year, month) {
  const { start, end } = _monthRange(year, month)
  const [schedRes, reportsRes, cashiersRes] = await Promise.all([
    supabase.from('shift_schedule').select('cashier_id').gte('date', start).lte('date', end).not('cashier_id', 'is', null),
    supabase.from('daily_reports').select('cashier_id, points_earned, is_on_time, total_revenue').neq('kasa', 'iki_kasa').gte('date', start).lte('date', end),
    supabase.from('cashiers').select('*').order('name')
  ])
  if (cashiersRes.error) return { data: [], error: cashiersRes.error }

  const assignedMap = {}
  ;(schedRes.data || []).forEach(s => { assignedMap[s.cashier_id] = (assignedMap[s.cashier_id] || 0) + 1 })

  const reportMap = {}
  ;(reportsRes.data || []).forEach(r => {
    if (!reportMap[r.cashier_id]) reportMap[r.cashier_id] = { total_points: 0, entry_count: 0, on_time_count: 0, total_revenue: 0 }
    reportMap[r.cashier_id].total_points  += parseInt(r.points_earned)       || 0
    reportMap[r.cashier_id].total_revenue += parseFloat(r.total_revenue)     || 0
    reportMap[r.cashier_id].entry_count   += 1
    if (r.is_on_time) reportMap[r.cashier_id].on_time_count += 1
  })

  // İlk geçiş: temel metrikler
  const results = (cashiersRes.data || []).map(c => {
    const assigned    = assignedMap[c.id] || 0
    const rm          = reportMap[c.id]   || { total_points: 0, entry_count: 0, on_time_count: 0, total_revenue: 0 }
    const att_pct     = assigned > 0 ? Math.round((rm.entry_count / assigned) * 100) : 0
    const perf_pct    = rm.entry_count > 0 ? Math.round((rm.total_points / (rm.entry_count * 100)) * 100) : 0
    const rev_per_shift = rm.entry_count > 0 ? rm.total_revenue / rm.entry_count : 0
    return {
      cashier_id: c.id, name: c.name, badge_level: c.badge_level,
      assigned_slots: assigned, worked_slots: rm.entry_count,
      attendance_pct: att_pct, is_eligible: assigned > 0 && att_pct >= 80,
      entry_count: rm.entry_count, total_points: rm.total_points,
      total_revenue: rm.total_revenue, rev_per_shift,
      performance_pct: perf_pct, on_time_count: rm.on_time_count,
      revenue_pct: 0, final_score: 0, rank: null
    }
  })

  // Ciro puanı: grubun en yüksek vardiya-başına-cirosu 100 puan → normalize
  const maxRevPerShift = Math.max(...results.map(r => r.rev_per_shift), 1)
  results.forEach(r => {
    r.revenue_pct  = Math.round((r.rev_per_shift / maxRevPerShift) * 100)
    // Final skor: %60 performans + %40 ciro
    r.final_score  = Math.round(r.performance_pct * 0.6 + r.revenue_pct * 0.4)
  })

  // Sıralama: uygunlar arasında final_score'a göre, eşitlikte on_time_count
  const eligible = results.filter(r => r.is_eligible)
    .sort((a, b) => b.final_score - a.final_score || b.on_time_count - a.on_time_count)
  eligible.forEach((r, i) => { r.rank = i + 1 })

  return {
    data: results.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)),
    error: reportsRes.error
  }
}
