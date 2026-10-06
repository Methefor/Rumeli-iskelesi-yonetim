/** WMO weather interpretation codes -> short Turkish label. null/unknown codes are "Bilinmiyor", never "açık". */
const LABELS: Record<number, string> = {
  0: 'Açık',
  1: 'Çoğunlukla açık',
  2: 'Parçalı bulutlu',
  3: 'Kapalı',
  45: 'Sisli',
  48: 'Kırağılı sis',
  51: 'Hafif çisenti',
  53: 'Çisenti',
  55: 'Yoğun çisenti',
  56: 'Dondurucu çisenti',
  57: 'Dondurucu çisenti',
  61: 'Hafif yağmur',
  63: 'Yağmur',
  65: 'Kuvvetli yağmur',
  66: 'Dondurucu yağmur',
  67: 'Dondurucu yağmur',
  71: 'Hafif kar',
  73: 'Kar',
  75: 'Yoğun kar',
  77: 'Kar taneleri',
  80: 'Hafif sağanak',
  81: 'Sağanak',
  82: 'Şiddetli sağanak',
  85: 'Kar sağanağı',
  86: 'Yoğun kar sağanağı',
  95: 'Gök gürültülü fırtına',
  96: 'Dolulu fırtına',
  99: 'Şiddetli dolulu fırtına',
}

export function weatherConditionLabel(code: number | null): string {
  return code === null ? 'Bilinmiyor' : (LABELS[code] ?? 'Bilinmiyor')
}

/** Whether the code itself describes precipitation (a fact about the code, not a risk judgement). */
export function isPrecipitationCode(code: number | null): boolean {
  return code !== null && ((code >= 51 && code <= 67) || (code >= 71 && code <= 86) || code >= 95)
}
