/**
 * Minimal RFC 4180 CSV reader for the operating-data files.
 * - UTF-8, optional BOM, "," separator, double-quote quoting with "" escapes.
 * - Blank lines and lines starting with '#' (owner instructions) are ignored.
 * - Every record keeps its 1-based physical line number so validation errors
 *   can point at the exact line an owner has to fix.
 */
export function parseCsv(text) {
  const src = String(text ?? '').replace(/^﻿/, '')
  const records = []
  let field = ''
  let record = []
  let inQuotes = false
  let line = 1
  let recordLine = 1
  let atLineStart = true
  let skipComment = false
  const endField = () => {
    record.push(field)
    field = ''
  }
  const endRecord = () => {
    endField()
    if (!(record.length === 1 && record[0].trim() === '')) records.push({ line: recordLine, cells: record })
    record = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (skipComment) {
      if (ch === '\n') {
        skipComment = false
        line++
        recordLine = line
        atLineStart = true
      }
      continue
    }
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else inQuotes = false
      } else {
        if (ch === '\n') line++
        field += ch
      }
      continue
    }
    if (atLineStart && ch === '#') {
      skipComment = true
      continue
    }
    if (ch === '"' && field === '') {
      inQuotes = true
      atLineStart = false
    } else if (ch === ',') {
      endField()
      atLineStart = false
    } else if (ch === '\r') {
      // swallowed; the following \n ends the record
    } else if (ch === '\n') {
      endRecord()
      line++
      recordLine = line
      atLineStart = true
    } else {
      field += ch
      atLineStart = false
    }
  }
  if (inQuotes) throw new Error('unterminated quoted field')
  if (field !== '' || record.length > 0) endRecord()
  return records
}

/** Parse into { header, rows:[{line, values:{col:string}}] }. */
export function parseTable(text) {
  const records = parseCsv(text)
  if (records.length === 0) return { header: [], rows: [] }
  const header = records[0].cells.map((c) => c.trim())
  const rows = records.slice(1).map((r) => {
    const values = {}
    header.forEach((h, idx) => {
      values[h] = (r.cells[idx] ?? '').trim()
    })
    return { line: r.line, values, extraCells: r.cells.length > header.length }
  })
  return { header, rows }
}
