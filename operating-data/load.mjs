#!/usr/bin/env node
/**
 * LOCAL-ONLY operating-data loader.
 *
 *   node operating-data/load.mjs [--dataset real|test-only] [--apply]
 *                                [--actor-code CODE] [--allow-test-data]
 *                                [--dir PATH] [--json] [--today YYYY-MM-DD]
 *
 * - Default is a DRY RUN: the database executes the exact apply path and rolls
 *   it back, so the report shows what --apply would do. Nothing changes
 *   without --apply.
 * - Refuses any Supabase URL whose host is not 127.0.0.1 / localhost / [::1],
 *   before reading any credential.
 * - The service-role key is read ONLY from the operator shell environment
 *   (SUPABASE_SERVICE_ROLE_KEY). It is never printed, logged or stored.
 * - Any rejected row aborts the whole load: nothing is partially applied.
 * - Statuses: created | updated | unchanged | skipped | rejected.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { GROUPS } from './contract.mjs'
import { buildPayload, validateDataset } from './validate.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const PRODUCTION_REF = 'iwikwbjsznjuefvuemdb'

export class LoaderError extends Error {
  constructor(message, exitCode = 3) {
    super(message)
    this.exitCode = exitCode
  }
}

/** Throws unless the URL is a plain local Supabase endpoint. */
export function assertLocalUrl(raw) {
  let url
  try {
    url = new URL(raw)
  } catch {
    throw new LoaderError('SUPABASE_URL is not a valid URL. Refusing to continue.')
  }
  if (!LOCAL_HOSTS.has(url.hostname) || raw.includes(PRODUCTION_REF) || /supabase\.(co|in|net)/i.test(url.hostname)) {
    throw new LoaderError(
      `LOCAL ONLY: refusing to contact host '${url.hostname}'. The operating-data loader only runs against 127.0.0.1 or localhost.`,
    )
  }
  return url
}

export function parseArgs(argv) {
  const opts = { dataset: 'real', apply: false, allowTestData: false, json: false, dir: null, actorCode: null, today: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined || v.startsWith('--')) throw new LoaderError(`${a} needs a value`, 1)
      return v
    }
    if (a === '--apply') opts.apply = true
    else if (a === '--dry-run') opts.apply = false
    else if (a === '--allow-test-data') opts.allowTestData = true
    else if (a === '--json') opts.json = true
    else if (a === '--dataset') opts.dataset = next()
    else if (a === '--dir') opts.dir = next()
    else if (a === '--actor-code') opts.actorCode = next()
    else if (a === '--today') opts.today = next()
    else throw new LoaderError(`unknown option ${a}`, 1)
  }
  if (!['real', 'test-only'].includes(opts.dataset)) throw new LoaderError('--dataset must be real or test-only', 1)
  return opts
}

/** Business "today" in Europe/Istanbul. */
export function istanbulToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function readDatasetFiles(dir) {
  const files = {}
  for (const g of GROUPS) {
    const p = join(dir, `${g}.csv`)
    files[g] = existsSync(p) ? readFileSync(p, 'utf8') : null
  }
  return files
}

function baseBranchKeysFor(dataset) {
  if (dataset !== 'test-only') return []
  const p = join(HERE, 'real', 'branches.csv')
  if (!existsSync(p)) return []
  const { entries } = validateDataset({ dataset: 'real', files: { branches: readFileSync(p, 'utf8') }, today: '2000-01-01' })
  return entries.filter((e) => e.group === 'branches' && e.status !== 'rejected').map((e) => e.key)
}

async function callDatabase({ url, serviceKey, actorCode, payload, commit, fetchImpl }) {
  const res = await fetchImpl(new URL('/rest/v1/rpc/internal_run_operating_data', url), {
    method: 'POST',
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_actor_code: actorCode, p_payload: payload, p_commit: commit }),
  })
  const text = await res.text()
  let body
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) {
    // Never echo the request (it carries the key); only the server's own message.
    throw new LoaderError(`database refused the load (HTTP ${res.status}): ${body?.message ?? 'no detail'}`, 2)
  }
  return body
}

/** Runs the whole flow and returns { report, exitCode }. */
export async function runLoader({ argv = [], env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
  const opts = parseArgs(argv)
  const urlRaw = env.SUPABASE_URL || 'http://127.0.0.1:54321'
  const url = assertLocalUrl(urlRaw) // before any credential is read
  if (opts.dataset === 'test-only' && !opts.allowTestData)
    throw new LoaderError('the test-only dataset is synthetic; pass --allow-test-data to load it into this LOCAL database', 1)

  const dir = resolve(opts.dir ?? join(HERE, opts.dataset))
  const today = opts.today ?? istanbulToday(now)
  const { entries, counts } = validateDataset({
    dataset: opts.dataset,
    files: readDatasetFiles(dir),
    baseBranchKeys: baseBranchKeysFor(opts.dataset),
    today,
  })

  const report = {
    dataset: opts.dataset,
    mode: opts.apply ? 'apply' : 'dry-run',
    validation: counts,
    applied: false,
    totals: { created: 0, updated: 0, unchanged: 0, skipped: 0, rejected: 0 },
    rows: [],
  }
  for (const e of entries)
    if (e.status === 'skipped' || e.status === 'rejected')
      report.rows.push({ group: e.group, row: e.row, key: e.key, status: e.status, message: e.message })

  if (counts.rejected > 0) {
    report.totals.rejected = counts.rejected
    report.totals.skipped = counts.skipped
    report.note = 'Validation failed: nothing was sent to the database and nothing was changed.'
    return { report, exitCode: 2 }
  }

  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  const actorCode = opts.actorCode || env.OPERATING_DATA_ACTOR_CODE
  if (!serviceKey) throw new LoaderError('SUPABASE_SERVICE_ROLE_KEY is not set in this shell (operator shell only; never commit it).')
  if (!actorCode) throw new LoaderError('--actor-code (the employee code of an active owner) is required.')

  const payload = buildPayload(opts.dataset, entries)
  const sendable = GROUPS.reduce((n, g) => n + payload[g].length, 0)
  let db = { applied: false, results: [] }
  if (sendable > 0) db = await callDatabase({ url, serviceKey, actorCode, payload, commit: opts.apply, fetchImpl })

  const seenDb = new Set()
  for (const r of db.results) {
    seenDb.add(`${r.group}:${r.row}`)
    report.totals[r.status]++
    if (r.status === 'rejected') report.rows.push(r)
  }
  report.totals.skipped += counts.skipped
  report.applied = Boolean(db.applied)
  report.rows.sort((a, b) => a.group.localeCompare(b.group) || a.row - b.row)
  if (opts.apply && !report.applied && report.totals.rejected > 0)
    report.note = 'The database rejected at least one row: the whole load was rolled back.'
  if (!opts.apply) report.note = 'Dry run: nothing was changed. Re-run with --apply to write.'
  report.details = db.results
  return { report, exitCode: report.totals.rejected > 0 ? 2 : 0 }
}

export function formatReport(report) {
  const t = report.totals
  const lines = [
    `Operating data load — dataset: ${report.dataset} — mode: ${report.mode}`,
    `created ${t.created} | updated ${t.updated} | unchanged ${t.unchanged} | skipped ${t.skipped} | rejected ${t.rejected}`,
    `applied: ${report.applied ? 'yes' : 'no'}`,
  ]
  for (const r of report.rows) lines.push(`  ${r.status.toUpperCase().padEnd(8)} ${r.group} line ${r.row} [${r.key}]: ${r.message ?? ''}`)
  if (report.note) lines.push(report.note)
  return lines.join('\n')
}

async function main() {
  try {
    const { report, exitCode } = await runLoader({ argv: process.argv.slice(2) })
    const asJson = process.argv.includes('--json')
    const printable = { ...report }
    if (!asJson) delete printable.details
    console.log(asJson ? JSON.stringify(printable, null, 2) : formatReport(report))
    process.exit(exitCode)
  } catch (e) {
    console.error(e instanceof LoaderError ? e.message : `loader failed: ${e.message}`)
    process.exit(e instanceof LoaderError ? e.exitCode : 1)
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
