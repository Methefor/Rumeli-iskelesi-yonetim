#!/usr/bin/env node
/**
 * Compares two baselines produced by production_baseline_readonly.sql (production through `supabase db query --linked --output-format json`
 * or local through psql). Pure file processing: it reads two JSON files and prints a report; it never connects to any database.
 *
 *   node supabase/audit/compare_baselines.mjs <before.json> <after.json> [--legacy-aware]
 *
 * `--legacy-aware` ignores relations/functions/policies that exist ONLY in `before` (a production baseline contains legacy objects a
 * local V4-only database does not have) and reports them separately as LEGACY.
 * Exit code 0 = no unexpected difference in the compared sections, 1 = differences were found (they are printed, not hidden).
 */
import fs from 'node:fs'

function load(path) {
  const raw = JSON.parse(fs.readFileSync(path, 'utf8'))
  // Management API envelope: { boundary, rows: [ { baseline: "<json string>" } ] }
  if (raw && Array.isArray(raw.rows) && raw.rows[0]?.baseline) return JSON.parse(raw.rows[0].baseline)
  return raw
}

const [beforePath, afterPath] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const legacyAware = process.argv.includes('--legacy-aware')
if (!beforePath || !afterPath) {
  console.error('usage: compare_baselines.mjs <before.json> <after.json> [--legacy-aware]')
  process.exit(2)
}
const before = load(beforePath)
const after = load(afterPath)

const key = {
  relations: (r) => `${r.kind}:${r.name}`,
  functions: (f) => `${f.name}(${f.args})`,
  policies: (p) => `${p.schema}.${p.table}.${p.name}`,
}
const setOf = (list, k) => new Map(list.map((x) => [k(x), x]))
const out = { onlyBefore: {}, onlyAfter: {}, changed: {}, counts: {}, rowCounts: {}, other: [] }
let unexpected = 0

for (const section of ['relations', 'functions', 'policies']) {
  const a = setOf(before[section], key[section])
  const b = setOf(after[section], key[section])
  out.onlyBefore[section] = [...a.keys()].filter((k) => !b.has(k)).sort()
  out.onlyAfter[section] = [...b.keys()].filter((k) => !a.has(k)).sort()
  out.changed[section] = [...a.keys()].filter((k) => b.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k))).sort()
  if (!legacyAware) unexpected += out.onlyBefore[section].length
  unexpected += out.changed[section].length
}
for (const k of Object.keys(after.counts)) out.counts[k] = { before: before.counts[k], after: after.counts[k], delta: after.counts[k] - before.counts[k] }
for (const k of new Set([...Object.keys(before.row_counts), ...Object.keys(after.row_counts)])) {
  const x = before.row_counts[k] ?? null
  const y = after.row_counts[k] ?? null
  if (x !== y) out.rowCounts[k] = { before: x, after: y }
}
for (const s of ['auth', 'extensions', 'authenticator_settings', 'storage']) {
  if (JSON.stringify(before[s]) !== JSON.stringify(after[s])) out.other.push(s)
}
out.hygiene = {
  before: Object.fromEntries(Object.entries(before.hygiene).map(([k, v]) => [k, v.length])),
  after: Object.fromEntries(Object.entries(after.hygiene).map(([k, v]) => [k, v.length])),
}
out.migrations = { onlyBefore: before.migrations.filter((m) => !after.migrations.includes(m)), onlyAfter: after.migrations.filter((m) => !before.migrations.includes(m)) }
console.log(JSON.stringify(out, null, 2))
process.exit(unexpected > 0 ? 1 : 0)
