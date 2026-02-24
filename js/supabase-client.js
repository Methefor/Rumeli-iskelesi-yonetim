import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://iwikwbjsznjuefvuemdb.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_ANON_KEY) {
  console.warn('⚠️ WARNING: VITE_SUPABASE_ANON_KEY environment variable is not set. Supabase may not work correctly.')
}

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

  // Sadece BUGÜN için zamanında kontrolü yap
  if (selectedDate.getTime() === today.getTime()) {
    const hour = now.getHours()
    const minute = now.getMinutes()

    if (data.shift === 'sabah') {
      // Sabah: 17:00'den önce (16:59'a kadar) zamanında
      isOnTime = (hour < 17)
    } else if (data.shift === 'aksam') {
      // Akşam: 00:30'a kadar zamanında
      if (hour >= 16 && hour <= 23) {
        // 16:00 - 23:59 arası (vardiya saatleri) zamanında kabul et
        isOnTime = true
      } else if (hour === 0 && minute <= 30) {
        isOnTime = true  // 00:00 - 00:30 zamanında
      } else {
        isOnTime = false
      }
    }
  } else {
    // Geçmiş tarih girişi → otomatik GEÇ sayılır
    isOnTime = false
  }

  // Eksiksiz mi kontrolü (tüm kategoriler dolu mu?)
  const isComplete = data.gida && data.kahve && data.sicakIcecek &&
    data.sogukIcecek && data.tatli && data.meyveSuyu &&
    data.kahvalti

  // Puan hesapla
  let pointsEarned = 10 // Base puan
  if (isOnTime) pointsEarned += 5 // Zamanında bonus
  if (isComplete) pointsEarned += 10 // Eksiksiz bonus

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

  // Kasiyerin toplam puanını güncelle
  await updateCashierPoints(data.cashierId, pointsEarned)

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