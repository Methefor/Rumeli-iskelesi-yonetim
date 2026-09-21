import { describe, expect, it } from 'vitest'
import { friendlyErrorMessage, friendlyFromSupabaseError } from './errors'

describe('friendlyErrorMessage', () => {
  it('maps known RPC phrases to Turkish', () => {
    expect(
      friendlyErrorMessage('submission window has closed for this shift', '22023'),
    ).toMatch(/süresi doldu/)
    expect(
      friendlyErrorMessage('a reason is required to edit a sales report', '22023'),
    ).toBe('Gerekçe zorunludur.')
    expect(
      friendlyErrorMessage('this movement has already been reversed', '23505'),
    ).toMatch(/geri alınmış/)
    expect(
      friendlyErrorMessage(
        'effective_from must be later than the latest existing cost',
        '22023',
      ),
    ).toMatch(/maliyet tarihi/)
  })

  it('maps permission failures without echoing the raw text', () => {
    const text = friendlyErrorMessage(
      'permission denied for table inventory_item_costs',
      '42501',
    )
    expect(text).toBe('Bu işlem için yetkiniz yok.')
    expect(text).not.toMatch(/inventory_item_costs/)
  })

  it('falls back on the SQLSTATE class, then on a generic message', () => {
    expect(friendlyErrorMessage('weird', '23505')).toBe('Bu kayıt zaten mevcut.')
    expect(friendlyErrorMessage('weird', '22023')).toMatch(/geçersiz/)
    expect(
      friendlyErrorMessage('relation "public.secret_table" does not exist', '42P01'),
    ).toBe('İşlem tamamlanamadı. Lütfen tekrar deneyin.')
  })

  it('recognises network failures', () => {
    expect(friendlyErrorMessage('TypeError: Failed to fetch')).toMatch(/Bağlantı hatası/)
  })

  it('never returns raw database text', () => {
    const raw =
      'insert or update on table "inventory_movements" violates foreign key constraint "inventory_movements_x_fkey"'
    const text = friendlyErrorMessage(raw, '23503')
    expect(text).not.toContain('inventory_movements')
    expect(text).not.toContain('constraint')
  })

  it('handles missing input', () => {
    expect(friendlyErrorMessage(undefined, undefined)).toBe(
      'İşlem tamamlanamadı. Lütfen tekrar deneyin.',
    )
  })
})

describe('friendlyFromSupabaseError', () => {
  it('returns null when there is no error', () => {
    expect(friendlyFromSupabaseError(null)).toBeNull()
    expect(friendlyFromSupabaseError(undefined)).toBeNull()
  })

  it('maps a supabase error object', () => {
    expect(friendlyFromSupabaseError({ message: 'not authorized', code: '42501' })).toBe(
      'Bu işlem için yetkiniz yok.',
    )
  })
})
