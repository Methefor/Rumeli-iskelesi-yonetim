import type { VarianceClass, WasteExplanation } from '../../domain/inventory/control'
import type { StatusTone } from '../../components/ui'

export const CLASSIFICATION_LABELS: Record<VarianceClass, string> = {
  balanced: 'Tutuyor',
  shortage: 'Eksik',
  surplus: 'Fazla',
}

export const CLASSIFICATION_TONES: Record<VarianceClass, StatusTone> = {
  balanced: 'success',
  shortage: 'danger',
  surplus: 'warning',
}

export const EXPLANATION_LABELS: Record<WasteExplanation, string> = {
  timing_uncertain: 'Sonradan fire girilmiş (zaman belirsiz)',
  unexplained: 'Açıklanamadı',
  not_applicable: '',
}

export const EXPLANATION_TONES: Record<WasteExplanation, StatusTone> = {
  timing_uncertain: 'warning',
  unexplained: 'danger',
  not_applicable: 'neutral',
}

export const COUNT_STATUS_LABELS = { submitted: 'Gönderildi', voided: 'İptal edildi' } as const

export const TODAY_COUNT_LABELS = {
  submitted: 'Bugünkü sayım yapıldı',
  voided_only: 'Bugünkü sayım iptal edilmiş',
  missing: 'Bugün sayım yok',
} as const

export const TODAY_COUNT_TONES: Record<keyof typeof TODAY_COUNT_LABELS, StatusTone> = {
  submitted: 'success',
  voided_only: 'warning',
  missing: 'danger',
}
