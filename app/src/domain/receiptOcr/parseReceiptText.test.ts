import { describe, expect, it } from 'vitest'
import { parseReceiptText, parseTurkishMoneyMinor } from './parseReceiptText'

describe('parseReceiptText', () => {
  it('extracts Turkish dispatch note fields without losing money precision', () => {
    expect(
      parseReceiptText(
        'İrsaliye No: IRS-2026/0042\nTarih: 01.10.2026\nGenel Toplam 1.234,56 TL',
      ),
    ).toEqual({
      reference: 'IRS-2026/0042',
      documentDate: '2026-10-01',
      totalMinor: 123456,
    })
  })

  it('accepts OCR text without Turkish characters', () => {
    expect(
      parseReceiptText('FIS NO: AB-9087\n2026-09-30\nODENECEK TUTAR 245.90'),
    ).toEqual({
      reference: 'AB-9087',
      documentDate: '2026-09-30',
      totalMinor: 24590,
    })
  })

  it('rejects impossible dates and leaves absent fields empty', () => {
    expect(parseReceiptText('Tarih 31.02.2026\nürün satırı')).toEqual({
      reference: null,
      documentDate: null,
      totalMinor: null,
    })
  })
})

describe('parseTurkishMoneyMinor', () => {
  it.each([
    ['1.234,56 TL', 123456],
    ['1234.56', 123456],
    ['24,00', 2400],
    ['1.250', 125000],
  ])('parses %s as integer minor units', (value, expected) => {
    expect(parseTurkishMoneyMinor(value)).toBe(expected)
  })
})
