/**
 * Weather TERMINOLOGY. Four different things, never merged and never all called "observed":
 *
 *   current          the provider's modelled "current" state (weather-model output for right now). It is NOT a station measurement.
 *   hourly forecast  expected values for the coming hours
 *   daily forecast   expected daily values
 *   historical       context for a COMPLETED business date, from a historical-capable source, with provenance:
 *                    manual | observed | reanalysis | provider_historical (Open-Meteo archive = reanalysis, i.e. modelled, not observed)
 */
export const WEATHER_LABELS = {
  current: 'Şu an (model tahmini)',
  currentNote: 'Anlık değerler sağlayıcının hava modelinden gelir; istasyon ölçümü değildir.',
  hourly: 'Saatlik tahmin',
  daily: 'Günlük tahmin',
  historical: 'Geçmiş bağlam',
  sourceNote: 'Tahmin ve model değerleri; ölçüm değildir.',
} as const

export type HistoricalProvenance = 'manual' | 'observed' | 'reanalysis' | 'provider_historical'

export const HISTORICAL_PROVENANCE_LABELS: Record<HistoricalProvenance, string> = {
  manual: 'Elle girildi',
  observed: 'Ölçülmüş (gözlem)',
  reanalysis: 'Yeniden analiz (modellenmiş geçmiş veri, doğrudan ölçüm değil)',
  provider_historical: 'Sağlayıcının geçmiş verisi',
}
