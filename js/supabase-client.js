import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iwikwbjsznjuefvuemdb.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3aWt3Ympzem5qdWVmdnVlbWRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNzkwNzEsImV4cCI6MjA4NTg1NTA3MX0.JLTiyDsrzcyEQEf_yS0cwUwtR3H1FaPl4mRFBRk142Q'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ============================================
// KASİYER FONKSİYONLARI (YENİ)
// ============================================

/**
 * PIN ile kasiyer doğrulama
 * @param {string} pin - 4 haneli PIN
 * @returns {Promise<{data: any, error: any}>}
 */
export async function verifyCashierPin(pin) {
  return await supabase
    .from('cashiers')
    .select('*')
    .eq('pin', pin)
    .single()
}

/**
 * Tüm kasiyerleri getir
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getAllCashiers() {
  return await supabase
    .from('cashiers')
    .select('*')
    .order('name')
}

/**
 * Kasiyer puanını güncelle
 * @param {string} cashierId - Kasiyer UUID
 * @param {number} pointsToAdd - Eklenecek puan
 * @returns {Promise<{data: any, error: any}>}
 */
export async function updateCashierPoints(cashierId, pointsToAdd) {
  // Önce mevcut puanı al
  const { data: cashier, error: fetchError } = await supabase
    .from('cashiers')
    .select('total_points')
    .eq('id', cashierId)
    .single()

  if (fetchError) return { data: null, error: fetchError }

  // Yeni toplam hesapla
  const newTotal = (cashier.total_points || 0) + pointsToAdd

  // Güncelle
  return await supabase
    .from('cashiers')
    .update({
      total_points: newTotal,
      updated_at: new Date().toISOString()
    })
    .eq('id', cashierId)
    .select()
}

// ============================================
// VARDİYA FONKSİYONLARI (YENİ)
// ============================================

/**
 * Vardiya bilgisi ile veri girişi
 * @param {Object} data - Giriş verisi
 * @returns {Promise<{data: any, error: any}>}
 */
export async function insertShiftEntry(data) {
  // Seçilen tarih ile şu anki zamanı karşılaştır
  const selectedDate = new Date(data.selectedDate)
  selectedDate.setHours(0, 0, 0, 0)

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  let isOnTime = false
  const hour = now.getHours()
  const minute = now.getMinutes()

  // Sadece BUGÜN için zamanında kontrolü yap
  if (selectedDate.getTime() === today.getTime()) {
    if (data.shift === 'sabah') {
      // Sabah: 17:30'a kadar zamanında
      isOnTime = (hour < 17) || (hour === 17 && minute <= 30)
    } else if (data.shift === 'aksam') {
      // Akşam: 01:00'a kadar zamanında
      if (hour >= 16 && hour <= 23) {
        isOnTime = true
      } else if ((hour === 0 && minute <= 59) || (hour === 1 && minute === 0)) {
        isOnTime = true
      } else {
        isOnTime = false
      }
    }
  } else {
    // Geçmiş tarih girişi → otomatik GEÇ sayılır
    isOnTime = false
  }

  // Mükerrer vardiya kontrolü - aynı gün aynı tipten puan alınmaz
  const { data: existingEntries } = await supabase
    .from('daily_reports')
    .select('id')
    .eq('cashier_id', data.cashierId)
    .eq('date', data.selectedDate)
    .eq('shift', data.shift)
  const isDuplicateShift = existingEntries && existingEntries.length > 0

  // 7 gün üst üste giriş kontrolü
  async function checkConsecutiveDays(cashierId) {
    try {
      const today = new Date()
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0]

      const { data: monthReports, error } = await supabase
        .from('daily_reports')
        .select('date')
        .eq('cashier_id', cashierId)
        .gte('date', monthStart)
        .lte('date', monthEnd)
        .order('date', { ascending: false })

      if (error || !monthReports || monthReports.length < 7) return false

      const uniqueDays = [...new Set(monthReports.map(r => r.date))].sort().reverse()
      if (uniqueDays.length < 7) return false

      let streak = 1
      for (let i = 0; i < uniqueDays.length - 1; i++) {
        const d1 = new Date(uniqueDays[i])
        const d2 = new Date(uniqueDays[i + 1])
        const diffDays = Math.floor((d1 - d2) / (1000 * 60 * 60 * 24))
        if (diffDays === 1) {
          streak++
          if (streak >= 7) return true
        } else {
          streak = 1
        }
      }
      return false
    } catch (err) {
      console.error('Ardışık gün kontrolü hatası:', err)
      return false
    }
  }

  const has7DayStreak = await checkConsecutiveDays(data.cashierId)

  // Eksiksiz veri kontrolü
  const hasCompleteData = (
    (data.rumeliZ1 && parseFloat(data.rumeliZ1) > 0) ||
    (data.rumeliZ2 && parseFloat(data.rumeliZ2) > 0) ||
    (data.balikEkmek && parseFloat(data.balikEkmek) > 0) ||
    (data.dondurma && parseFloat(data.dondurma) > 0) ||
    (data.dondurmaZ && parseFloat(data.dondurmaZ) > 0)
  ) && (
    [data.gida, data.kahvalti, data.kahve, data.meyveSuyu,
     data.sicakIcecek, data.sogukIcecek, data.tatli].filter(cat =>
      cat && parseFloat(cat) > 0
    ).length >= 3
  )

  // Eski uyumluluk için
  const isComplete = hasCompleteData

  // Puan hesapla - mükerrer vardiyada puan yok
  let pointsEarned = 0
  if (!isDuplicateShift) {
    pointsEarned = 10                          // 1. Temel puan
    if (isOnTime) pointsEarned += 10           // 2. Zamanında: +10
    else          pointsEarned -= 5            //    Geç: -5
    if (hasCompleteData) pointsEarned += 10    // 3. Eksiksiz veri: +10
    if (has7DayStreak)   pointsEarned += 25    // 4. 7 gün streak: +25
  }

  console.log('Puan Detayları:', {
    mukerrerGiris: isDuplicateShift,
    temelPuan: isDuplicateShift ? 0 : 10,
    zamanindaBonus: isDuplicateShift ? 0 : (isOnTime ? 10 : -5),
    eksiksizBonus: isDuplicateShift ? 0 : (hasCompleteData ? 10 : 0),
    ardisikBonus: isDuplicateShift ? 0 : (has7DayStreak ? 25 : 0),
    toplamPuan: pointsEarned,
    isOnTime, hasCompleteData, has7DayStreak
  })

  // AKŞAM VARDİYASI İÇİN SABAH VERİSİNİ ÇIKAR
  let actualRevenue = {
    rumeli_z1: parseFloat(data.rumeliZ1) || 0,
    rumeli_z2: parseFloat(data.rumeliZ2) || 0,
    balik_ekmek: parseFloat(data.balikEkmek) || 0,
    dondurma: parseFloat(data.dondurma) || parseFloat(data.dondurmaZ) || 0,
    gida: parseFloat(data.gida) || 0,
    kahvalti: parseFloat(data.kahvalti) || 0,
    kahve: parseFloat(data.kahve) || 0,
    meyvesuyu: parseFloat(data.meyveSuyu) || 0,
    sicak_icecek: parseFloat(data.sicakIcecek) || 0,
    soguk_icecek: parseFloat(data.sogukIcecek) || 0,
    tatli: parseFloat(data.tatli) || 0,
    salata: parseFloat(data.salata) || 0,
    dondurma_kategori: parseFloat(data.dondurmaKategori) || 0
  }

  // Eğer akşam vardiyası ise sabah verisini çıkar
  if (data.shift === 'aksam') {
    // Sabah verisini getir
    const { data: morningData, error: morningError } = await supabase
      .from('daily_reports')
      .select('*')
      .eq('date', data.selectedDate)
      .eq('kasa', data.kasa)
      .eq('shift', 'sabah')
      .single()

    if (morningData && !morningError) {
      console.log('Sabah verisi bulundu, bireysel performans hesaplanıyor...')
      actualRevenue.rumeli_z1 = Math.max(0, (actualRevenue.rumeli_z1 || 0) - (parseFloat(morningData.rumeli_z1) || 0))
      actualRevenue.rumeli_z2 = Math.max(0, (actualRevenue.rumeli_z2 || 0) - (parseFloat(morningData.rumeli_z2) || 0))
      actualRevenue.balik_ekmek = Math.max(0, (actualRevenue.balik_ekmek || 0) - (parseFloat(morningData.balik_ekmek) || 0))
      actualRevenue.dondurma = Math.max(0, (actualRevenue.dondurma || 0) - (parseFloat(morningData.dondurma) || 0))
      actualRevenue.gida = Math.max(0, (actualRevenue.gida || 0) - (parseFloat(morningData.gida) || 0))
      actualRevenue.kahvalti = Math.max(0, (actualRevenue.kahvalti || 0) - (parseFloat(morningData.kahvalti) || 0))
      actualRevenue.kahve = Math.max(0, (actualRevenue.kahve || 0) - (parseFloat(morningData.kahve) || 0))
      actualRevenue.meyvesuyu = Math.max(0, (actualRevenue.meyvesuyu || 0) - (parseFloat(morningData.meyvesuyu) || 0))
      actualRevenue.sicak_icecek = Math.max(0, (actualRevenue.sicak_icecek || 0) - (parseFloat(morningData.sicak_icecek) || 0))
      actualRevenue.soguk_icecek = Math.max(0, (actualRevenue.soguk_icecek || 0) - (parseFloat(morningData.soguk_icecek) || 0))
      actualRevenue.tatli = Math.max(0, (actualRevenue.tatli || 0) - (parseFloat(morningData.tatli) || 0))
      actualRevenue.salata = Math.max(0, (actualRevenue.salata || 0) - (parseFloat(morningData.salata) || 0))
      actualRevenue.dondurma_kategori = Math.max(0, (actualRevenue.dondurma_kategori || 0) - (parseFloat(morningData.dondurma_kategori) || 0))
    }
  }

  // Bireysel performans cirosu (Z'ler toplamı)
  const individualRevenue = Math.max(0, actualRevenue.rumeli_z1 + actualRevenue.rumeli_z2 +
    actualRevenue.balik_ekmek + actualRevenue.dondurma)

  // Toplam ciro (Girdiğimiz gün sonu toplamı)
  const totalRevenue = (parseFloat(data.rumeliZ1) || 0) +
    (parseFloat(data.rumeliZ2) || 0) +
    (parseFloat(data.balikEkmek) || 0) +
    (parseFloat(data.dondurma) || parseFloat(data.dondurmaZ) || 0)

  // daily_reports'a ekle
  const reportRecord = {
    date: data.selectedDate,
    cashier_id: data.cashierId,
    kasa: data.kasa,
    shift: data.shift,
    register_name: 'Rumeli İskelesi',

    // Z Raporu değerleri (snake_case)
    rumeli_z1: parseFloat(data.rumeliZ1) || 0,
    rumeli_z2: parseFloat(data.rumeliZ2) || 0,
    balik_ekmek: parseFloat(data.balikEkmek) || 0,
    dondurma: parseFloat(data.dondurma) || parseFloat(data.dondurmaZ) || 0,
    dondurma_adet: parseFloat(data.dondurmaAdet) || 0,

    // Kategori değerleri (snake_case)
    gida: parseFloat(data.gida) || 0,
    kahve: parseFloat(data.kahve) || 0,
    sicak_icecek: parseFloat(data.sicakIcecek) || 0,
    soguk_icecek: parseFloat(data.sogukIcecek) || 0,
    tatli: parseFloat(data.tatli) || 0,
    meyvesuyu: parseFloat(data.meyveSuyu) || 0,
    kahvalti: parseFloat(data.kahvalti) || 0,
    salata: parseFloat(data.salata) || 0,
    dondurma_kategori: parseFloat(data.dondurmaKategori) || 0,

    // Diğer alanlar
    depo: parseFloat(data.depo) || 0,
    notlar: data.notlar || '',

    // Ciro bilgileri
    total_revenue: totalRevenue,
    individual_revenue: individualRevenue,

    // Puan ve zaman bilgileri
    entry_time: now.toISOString(),
    is_on_time: isOnTime,
    points_earned: pointsEarned
  }

  const { data: reportData, error: reportError } = await supabase
    .from('daily_reports')
    .insert([reportRecord])
    .select()
    .single()

  if (reportError) return { data: null, error: reportError }

  // entry_history'ye ekle
  const historyRecord = {
    cashier_id: data.cashierId,
    report_id: reportData.id,
    shift: data.shift,
    kasa: data.kasa,
    entry_time: now.toISOString(),
    is_on_time: isOnTime,
    is_complete: isComplete,
    points_earned: pointsEarned,
    revenue_amount: reportRecord.rumeli_z1 + reportRecord.rumeli_z2 + reportRecord.balik_ekmek + reportRecord.dondurma + reportRecord.salata
  }

  await supabase
    .from('entry_history')
    .insert([historyRecord])

  // Kasiyer aylık puanını bu ayın raporlarından hesapla (ay başında kendiliğinden sıfırlanır)
  try {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
    const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

    const { data: monthReports } = await supabase
      .from('daily_reports')
      .select('points_earned')
      .eq('cashier_id', data.cashierId)
      .gte('date', monthStart)
      .lte('date', monthEnd)

    const totalPoints = (monthReports || []).reduce((sum, r) => sum + (parseInt(r.points_earned) || 0), 0)

    // Aylık baz rozet eşikleri
    let badgeLevel = 'yeni'
    if (totalPoints >= 600) badgeLevel = 'efsane_plus'
    else if (totalPoints >= 400) badgeLevel = 'efsane'
    else if (totalPoints >= 250) badgeLevel = 'elmas'
    else if (totalPoints >= 150) badgeLevel = 'altin'
    else if (totalPoints >= 75)  badgeLevel = 'gumus'
    else if (totalPoints >= 30)  badgeLevel = 'bronz'

    // Müdür tarafından özel rozet atanmışsa dokunma
    const { data: cashierRow } = await supabase
      .from('cashiers')
      .select('badge_level')
      .eq('id', data.cashierId)
      .single()

    const isSpecialBadge = cashierRow?.badge_level?.startsWith('ozel_')
    if (!isSpecialBadge) {
      await supabase
        .from('cashiers')
        .update({ total_points: totalPoints, badge_level: badgeLevel })
        .eq('id', data.cashierId)
    } else {
      await supabase
        .from('cashiers')
        .update({ total_points: totalPoints })
        .eq('id', data.cashierId)
    }

    console.log('Kasiyer aylık puanı senkronize edildi:', { totalPoints, badgeLevel, monthStart, monthEnd })
  } catch (syncError) {
    console.error('Puan senkronizasyonu hatası:', syncError)
  }

  return {
    data: {
      ...reportData,
      pointsEarned,
      isOnTime,
      isComplete
    },
    error: null
  }
}

// ============================================
// PERFORMANS FONKSİYONLARI (YENİ)
// ============================================

/**
 * Haftalık performans tablosu
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getWeeklyPerformance() {
  return await supabase
    .from('weekly_performance')
    .select('*')
}

/**
 * Bugünün performansı
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getDailyPerformance() {
  return await supabase
    .from('daily_performance')
    .select('*')
}

/**
 * Kasiyer başarımları
 * @param {string} cashierId - Kasiyer UUID
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getCashierAchievements(cashierId) {
  return await supabase
    .from('achievements')
    .select('*')
    .eq('cashier_id', cashierId)
    .order('achieved_at', { ascending: false })
}

/**
 * Kasiyer giriş geçmişi
 * @param {string} cashierId - Kasiyer UUID
 * @param {number} limit - Kaç kayıt
 * @returns {Promise<{data: any, error: any}>}
 */
export async function getCashierHistory(cashierId, limit = 20) {
  return await supabase
    .from('entry_history')
    .select('*')
    .eq('cashier_id', cashierId)
    .order('entry_time', { ascending: false })
    .limit(limit)
}

// ============================================
// ESKİ FONKSİYONLAR (UYUMLULUK İÇİN)
// ============================================

/**
 * Inserts a new sales record into Supabase
 * @param {Object} data - The sales data object
 * @returns {Promise<{data: any, error: any}>}
 */
export async function insertSalesRecord(data) {
  const record = {
    date: data.selectedDate,
    cashier_name: data.cashierName,
    rumeli_z1: data.rumeliZ1,
    rumeli_z2: data.rumeliZ2,
    balik_ekmek: data.balikEkmek,
    dondurma: data.dondurma,
    gida: data.gida,
    kahve: data.kahve,
    sicak_icecek: data.sicakIcecek,
    soguk_icecek: data.sogukIcecek,
    tatli: data.tatli,
    meyvesuyu: data.meyveSuyu,
    kahvalti: data.kahvalti,
    dondurma_adet: data.dondurmaAdet,
    depo: data.depo,
    notlar: data.notlar
  }

  return await supabase.from('sales_records').insert([record]).select()
}

/**
 * Fetches sales records from Supabase
 * @returns {Promise<{data: any, error: any}>}
 */
export async function fetchSalesRecords() {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const firstDayStr = firstDay.toISOString().split('T')[0];

  return await supabase
    .from('sales_records')
    .select('*')
    .order('date', { ascending: false })
}

/**
 * Deletes a sales record from Supabase
 * @param {string|number} id - The ID of the record to delete
 * @returns {Promise<{data: any, error: any}>}
 */
export async function deleteSalesRecord(id) {
  return await supabase
    .from('sales_records')
    .delete()
    .eq('id', id)
}

/**
 * PIN ile admin doğrulama
 * @param {string} pin - 4 haneli PIN (0000)
 * @returns {Promise<{data: any, error: any}>}
 */
export async function verifyAdminPin(pin) {
  return await supabase
    .from('admins')
    .select('*')
    .eq('pin', pin)
    .single()
}