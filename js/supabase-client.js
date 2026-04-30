import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iwikwbjsznjuefvuemdb.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3aWt3Ympzem5qdWVmdnVlbWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzkwNzEsImV4cCI6MjA4NTg1NTA3MX0.JLTiyDsrzcyEQEf_yS0cwUwtR3H1FaPl4mRFBRk142Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

function localDateStr(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0')
}

// ─── KASİYER ─────────────────────────────────────────────────────────────────

export async function verifyCashierPin(pin) {
  return await supabase.from('cashiers').select('*').eq('pin', pin).single()
}

export async function getAllCashiers() {
  return await supabase.from('cashiers').select('*').order('name')
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
    data.gida, data.kahvalti, data.salata, data.dondurmaKategori,
  ]
  // Her iki kasa için de rapor + en az 2 kategori alanı dolu olmalı
  const hasCompleteData =
    parseFloat(data.rumeliZ1) > 0 && extraFields.filter(v => parseFloat(v) > 0).length >= 2

  // — Puan (max 100) —
  const pointsEarned = (isOnTime ? 50 : 0) + (hasCompleteData ? 50 : 0)

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

  await supabase.from('entry_history').insert([{
    cashier_id:     data.cashierId,
    report_id:      reportData.id,
    shift:          data.shift,
    kasa:           'tek_kasa',
    entry_time:     now.toISOString(),
    is_on_time:     isOnTime,
    is_complete:    hasCompleteData,
    points_earned:  pointsEarned,
    revenue_amount: totalRevenue,
  }])

  await _syncMonthlyScore(data.cashierId, now)

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
      kahvalti:     parseFloat(formData.kahvalti)    || 0,
      salata:            parseFloat(formData.salata)            || 0,
      dondurma_kategori: parseFloat(formData.dondurmaKategori) || 0,
      notlar:       formData.notlar || '',
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
      .gte('date', monthStart)
      .lte('date', monthEnd)

    if (!monthReports?.length) return

    const totalPoints    = monthReports.reduce((s, r) => s + (parseInt(r.points_earned) || 0), 0)
    const entryCount     = monthReports.length
    const performancePct = Math.round((totalPoints / (entryCount * 100)) * 100)

    // Rozet seviyesi — oran tabanlı
    let badgeLevel = 'yeni'
    if      (performancePct >= 95) badgeLevel = 'efsane_plus'
    else if (performancePct >= 85) badgeLevel = 'efsane'
    else if (performancePct >= 75) badgeLevel = 'elmas'
    else if (performancePct >= 65) badgeLevel = 'altin'
    else if (performancePct >= 50) badgeLevel = 'gumus'
    else if (performancePct >= 30) badgeLevel = 'bronz'

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

// ─── PERFORMANS ───────────────────────────────────────────────────────────────

export async function getWeeklyPerformance() {
  return await supabase.from('weekly_performance').select('*')
}

export async function getDailyPerformance() {
  return await supabase.from('daily_performance').select('*')
}

export async function getCashierAchievements(cashierId) {
  return await supabase
    .from('achievements').select('*')
    .eq('cashier_id', cashierId)
    .order('achieved_at', { ascending: false })
}

export async function getCashierHistory(cashierId, limit = 20) {
  return await supabase
    .from('entry_history').select('*')
    .eq('cashier_id', cashierId)
    .order('entry_time', { ascending: false })
    .limit(limit)
}

// ─── ESKİ FONKSİYONLAR (UYUMLULUK) ──────────────────────────────────────────

export async function insertSalesRecord(data) {
  return await supabase.from('sales_records').insert([{
    date: data.selectedDate, cashier_name: data.cashierName,
    rumeli_z1: data.rumeliZ1, rumeli_z2: data.rumeliZ2,
    balik_ekmek: data.balikEkmek, dondurma: data.dondurma,
    gida: data.gida, kahve: data.kahve,
    sicak_icecek: data.sicakIcecek, soguk_icecek: data.sogukIcecek,
    tatli: data.tatli, meyvesuyu: data.meyveSuyu,
    kahvalti: data.kahvalti, dondurma_adet: data.dondurmaAdet,
    depo: data.depo, notlar: data.notlar,
  }]).select()
}

export async function fetchSalesRecords() {
  return await supabase.from('sales_records').select('*').order('date', { ascending: false })
}

export async function deleteSalesRecord(id) {
  return await supabase.from('sales_records').delete().eq('id', id)
}

export async function verifyAdminPin(pin) {
  return await supabase.from('admins').select('*').eq('pin', pin).single()
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
