export interface ParsedReceiptText {
  reference: string | null
  documentDate: string | null
  totalMinor: number | null
}

const REFERENCE_LABEL =
  /(?:BELGE|İRSALİYE|IRSALIYE|FATURA|FİŞ|FIŞ|FIS)\s*(?:NO(?:SU)?|NUMARASI|#)?\s*[:-]?\s*([A-Z0-9][A-Z0-9./-]{2,39})/u
const TOTAL_LABEL = /(?:GENEL\s+TOPLAM|ÖDENECEK\s+TUTAR|ODENECEK\s+TUTAR|TOPLAM)/u

function normalizeDate(day: string, month: string, year: string) {
  const fullYear = year.length === 2 ? `20${year}` : year
  const date = new Date(
    `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00Z`,
  )
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== Number(fullYear) ||
    date.getUTCMonth() + 1 !== Number(month) ||
    date.getUTCDate() !== Number(day)
  )
    return null
  return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
}

function parseDocumentDate(text: string) {
  const yearFirst = text.match(/\b(20\d{2})[./-](\d{1,2})[./-](\d{1,2})\b/u)
  if (yearFirst) return normalizeDate(yearFirst[3]!, yearFirst[2]!, yearFirst[1]!)
  const dayFirst = text.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})\b/u)
  if (dayFirst) return normalizeDate(dayFirst[1]!, dayFirst[2]!, dayFirst[3]!)
  return null
}

export function parseTurkishMoneyMinor(value: string) {
  let normalized = value.replace(/[^\d,.-]/gu, '').replace(/-/gu, '')
  if (!normalized) return null
  const decimalIndex = Math.max(normalized.lastIndexOf(','), normalized.lastIndexOf('.'))
  const decimalDigits = decimalIndex >= 0 ? normalized.length - decimalIndex - 1 : 0
  if (decimalIndex >= 0 && decimalDigits === 2) {
    const whole = normalized.slice(0, decimalIndex).replace(/[.,]/gu, '') || '0'
    normalized = `${whole}.${normalized.slice(decimalIndex + 1)}`
  } else {
    normalized = normalized.replace(/[.,]/gu, '')
  }
  const amount = Number(normalized)
  if (!Number.isFinite(amount) || amount < 0) return null
  return Math.round(amount * 100)
}

function parseTotalMinor(lines: string[]) {
  for (const line of [...lines].reverse()) {
    if (!TOTAL_LABEL.test(line)) continue
    const amounts = line.match(/\d[\d\s.]*(?:,\d{2})?|\d[\d\s,]*(?:\.\d{2})?/gu)
    const candidate = amounts?.at(-1)
    if (!candidate) continue
    const minor = parseTurkishMoneyMinor(candidate)
    if (minor !== null) return minor
  }
  return null
}

export function parseReceiptText(rawText: string): ParsedReceiptText {
  const lines = rawText
    .split(/\r?\n/u)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const upperLines = lines.map((line) => line.toLocaleUpperCase('tr-TR'))
  const referenceMatch = upperLines
    .map((line) => line.match(REFERENCE_LABEL))
    .find(Boolean)
  return {
    reference: referenceMatch?.[1]?.replace(/[.,;:]$/u, '') ?? null,
    documentDate: parseDocumentDate(lines.join(' ')),
    totalMinor: parseTotalMinor(upperLines),
  }
}
