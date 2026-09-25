/**
 * Turns a database / network error into a short Turkish, user-facing
 * message. Raw Postgres / PostgREST text must never reach the screen: it can
 * expose table names, function names and constraint details.
 *
 * Only messages this app's own RPCs raise (see supabase/migrations 008-014)
 * are recognised by phrase; anything unrecognised falls back to a generic
 * message keyed on the SQLSTATE class where that is meaningful.
 */
const PHRASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/submission window has closed/i, 'Bu vardiya için rapor gönderme süresi doldu.'],
  [/not assigned to this shift/i, 'Bu vardiyaya atanmış değilsiniz.'],
  [/cannot submit a report for a future business date/i, 'İleri bir tarih için rapor girilemez.'],
  [
    /submission is limited to today and the previous 3/i,
    'Yalnızca bugün ve önceki 3 gün için rapor girebilirsiniz. Daha eski bir tarih için yönetici/işletme sahibi gerekçeli olarak girebilir.',
  ],
  [
    /editing is limited to reports from today and the previous 3/i,
    'Yalnızca bugün ve önceki 3 güne ait raporlar düzenlenebilir. Daha eski bir rapor için yönetici/işletme sahibi gerekçeli olarak düzenleyebilir.',
  ],
  [
    /reason is required to submit for a business date more than 3 days/i,
    '3 günden eski bir tarih için gerekçe zorunludur.',
  ],
  [/a reason is required|reason.*required|gerekçe/i, 'Gerekçe zorunludur.'],
  [/report already exists/i, 'Bu vardiya için bu tipte bir rapor zaten var.'],
  [/already exists in this branch/i, 'Bu koda sahip bir ürün bu şubede zaten var.'],
  [/already been reversed/i, 'Bu hareket zaten geri alınmış.'],
  [/reversal cannot itself be reversed/i, 'Bir geri alma işlemi tekrar geri alınamaz.'],
  [
    /sale-linked movements/i,
    'Satışa bağlı hareketler, satış raporu düzenlenerek veya iptal edilerek düzeltilir.',
  ],
  [
    /whole (number|unit)|counted in whole units|sold in whole units/i,
    'Bu ürün yalnızca tam sayı olarak girilebilir.',
  ],
  [/greater than zero|sold quantity greater/i, 'Miktar sıfırdan büyük olmalıdır.'],
  [/negative/i, 'Değer negatif olamaz.'],
  [/at most 3 decimal/i, 'En fazla 3 ondalık basamak girilebilir.'],
  [/at most 4 decimal/i, 'Maliyet en fazla 4 ondalık basamak içerebilir.'],
  [
    /does not belong to this branch|belongs to a different branch/i,
    'Seçilen ürün veya vardiya bu şubeye ait değil.',
  ],
  [/inactive/i, 'Bu ürün pasif durumda.'],
  [
    /effective_from must be later|append-only/i,
    'Yeni maliyet tarihi, mevcut son maliyet tarihinden sonra olmalıdır.',
  ],
  [/30 days in the future/i, 'Maliyet tarihi en fazla 30 gün ileri olabilir.'],
  [
    /cannot have both a category-level line/i,
    'Aynı kategoride hem kategori toplamı hem ürün satırı girilemez.',
  ],
  [/no sales category/i, 'Bu ürünün satış kategorisi tanımlı değil.'],
  [
    /unit and decimal setting cannot change/i,
    'Hareket görmüş bir ürünün birimi değiştirilemez.',
  ],
  [/sales category is not enabled/i, 'Bu satış kategorisi bu şubede kullanılmıyor.'],
  [/invalid item code/i, 'Ürün kodu geçersiz (harf/rakam, en fazla 32 karakter).'],
  [/waste reason/i, 'Geçerli bir fire nedeni seçin.'],
  [
    /failed to fetch|networkerror|load failed|network request failed/i,
    'Bağlantı hatası. İnternet bağlantınızı kontrol edip tekrar deneyin.',
  ],
]

export function friendlyErrorMessage(
  message?: string | null,
  code?: string | null,
): string {
  const text = message ?? ''

  for (const [pattern, friendly] of PHRASES) {
    if (pattern.test(text)) return friendly
  }

  if (
    code === '42501' ||
    /permission denied|not authorized|row-level security/i.test(text)
  ) {
    return 'Bu işlem için yetkiniz yok.'
  }
  if (code === '23505') return 'Bu kayıt zaten mevcut.'
  if (code === '22023') return 'Girilen bilgiler geçersiz. Lütfen kontrol edin.'

  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

/** Convenience for `{ error }` objects returned by supabase-js. */
export function friendlyFromSupabaseError(
  error: { message?: string; code?: string } | null | undefined,
): string | null {
  if (!error) return null
  return friendlyErrorMessage(error.message, error.code)
}
