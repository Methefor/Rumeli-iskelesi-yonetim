/** Schema/validation tests for the operating-data contract. No database.
 *  node --test operating-data/tests
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseCsv } from '../csv.mjs'
import { buildPayload, validateDataset } from '../validate.mjs'
import { assertLocalUrl, parseArgs, runLoader, LoaderError } from '../load.mjs'
import { GROUPS } from '../contract.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const TODAY = '2026-09-26'
const OK = 'confirmed,approved,owner statement'
const M = 'provenance,approval_status,source'

const BRANCHES = `branch_key,name,is_active,${M}\nb1,Sube 1,true,${OK}\nb2,Sube 2,true,${OK}\n`
const CATS = `category_key,name,is_active,${M}\nc1,Kat 1,true,${OK}\nc2,Kat 2,true,${OK}\n`
const CB = `branch_key,category_key,level,${M}\nb1,c1,category,${OK}\n`
const ITEMS = `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\nb1,A1,Urun,adet,false,true,${OK}\nb1,K1,Kilo,kg,true,true,${OK}\n`

const run = (files, extra = {}) =>
  validateDataset({ dataset: 'real', today: TODAY, files: { branches: BRANCHES, sales_categories: CATS, category_branches: CB, inventory_items: ITEMS, ...files }, ...extra })
const find = (res, group, pred = () => true) => res.entries.filter((e) => e.group === group && pred(e))
const msg = (e) => e.message ?? ''

test('the committed real dataset and test-only fixture validate without a rejected row', () => {
  for (const [dataset, dir] of [['real', join(HERE, '..', 'real')], ['test-only', join(HERE, '..', 'test-only')]]) {
    const files = {}
    for (const g of GROUPS) {
      try { files[g] = readFileSync(join(dir, `${g}.csv`), 'utf8') } catch { files[g] = null }
    }
    const res = validateDataset({ dataset, files, baseBranchKeys: ['rumeli_iskelesi', 'iskele_dondurma', 'balik_ekmek'], today: TODAY })
    assert.equal(res.counts.rejected, 0, JSON.stringify(res.entries.filter((e) => e.status === 'rejected')))
  }
})

test('real dataset: all owner-approved operating configuration is ready to apply', () => {
  const files = {}
  const dir = join(HERE, '..', 'real')
  for (const g of GROUPS) { try { files[g] = readFileSync(join(dir, `${g}.csv`), 'utf8') } catch { files[g] = null } }
  const res = validateDataset({ dataset: 'real', files, today: TODAY })
  const okGroups = new Set(res.entries.filter((e) => e.status === 'ok').map((e) => e.group))
  assert.deepEqual([...okGroups], [
    'branches',
    'sales_categories',
    'registers',
    'shift_definitions',
    'category_branches',
    'reconciliation_thresholds',
    'waste_reasons',
  ])
  assert.equal(res.counts.skipped, 0)
})

test('real dataset: the three owner-approved Dondurma category mappings are applied as confirmed', () => {
  const files = {}
  const dir = join(HERE, '..', 'real')
  for (const g of GROUPS) { try { files[g] = readFileSync(join(dir, `${g}.csv`), 'utf8') } catch { files[g] = null } }
  const res = validateDataset({ dataset: 'real', files, today: TODAY })
  const rows = res.entries.filter((e) => e.group === 'category_branches' && e.data.branch_key === 'iskele_dondurma')
  assert.deepEqual(rows.map((e) => e.data.category_key).sort(), ['dondurma', 'sicak_icecek', 'soguk_icecek'])
  assert.ok(rows.every((e) => e.status === 'ok' && e.data.provenance === 'confirmed' && e.data.approval_status === 'approved'))
  assert.equal(res.counts.rejected, 0)
  assert.equal(res.counts.skipped, 0)
})

test('owner-input templates are never inside the loaded directories and hold no data rows', () => {
  for (const f of readdirSync(join(HERE, '..', 'owner-input'))) {
    const rows = parseCsv(readFileSync(join(HERE, '..', 'owner-input', f), 'utf8'))
    assert.equal(rows.length, 1, `${f} must contain only the header row (examples are comments)`)
  }
})

test('csv parser: quotes, commas, BOM, comments and line numbers', () => {
  const recs = parseCsv('﻿# note\na,b\n"x,y","he said ""hi"""\n\n1,2\n')
  assert.deepEqual(recs.map((r) => r.cells), [['a', 'b'], ['x,y', 'he said "hi"'], ['1', '2']])
  assert.deepEqual(recs.map((r) => r.line), [2, 3, 5])
})

test('header mismatch rejects the whole file with a clear message', () => {
  const r = run({ registers: 'branch_key,name\nb1,K1\n' })
  const e = find(r, 'registers')[0]
  assert.equal(e.status, 'rejected')
  assert.match(msg(e), /header mismatch: missing register_key/)
})

test('duplicate stable keys reject every row that shares the key', () => {
  const r = run({ registers: `branch_key,register_key,name,is_active,${M}\nb1,k1,A,true,${OK}\nb1,k1,B,true,${OK}\n` })
  const rows = find(r, 'registers')
  assert.ok(rows.every((e) => e.status === 'rejected' && /duplicate/.test(msg(e))))
  const dupItems = run({ inventory_items: ITEMS + `b1,a1,X,adet,false,true,${OK}\n` })
  assert.ok(find(dupItems, 'inventory_items', (e) => e.status === 'rejected').length >= 1)
})

test('unknown branch/category/item references are rejected', () => {
  const r = run({
    registers: `branch_key,register_key,name,is_active,${M}\nnope,k1,A,true,${OK}\n`,
    category_branches: CB + `b1,nope,category,${OK}\n`,
    product_categories: `branch_key,item_code,category_key,level,${M}\nb1,ZZZ,c1,product,${OK}\n`,
    opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\nb1,ZZZ,1,2026-09-01,${OK}\n`,
  })
  assert.match(msg(find(r, 'registers')[0]), /unknown branch 'nope'/)
  assert.match(msg(find(r, 'category_branches', (e) => e.row === 3)[0]), /unknown category 'nope'/)
  assert.match(msg(find(r, 'product_categories')[0]), /unknown item/)
  assert.match(msg(find(r, 'opening_stock')[0]), /unknown item/)
})

test('unsupported unit is rejected; decimals in a whole-unit item are rejected', () => {
  const r = run({
    inventory_items: `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\nb1,U1,X,zorba,true,true,${OK}\nb1,W1,Y,adet,false,true,${OK}\n`,
    opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\nb1,W1,2.5,2026-09-01,${OK}\n`,
  })
  assert.match(msg(find(r, 'inventory_items', (e) => e.key === 'b1/U1')[0]), /unit 'zorba' is not supported/)
  assert.match(msg(find(r, 'opening_stock')[0]), /whole units/)
})

test('opening stock: negative, comma decimal, too many decimals and future dates are rejected; zero-safe', () => {
  const rows = ["-1", "1,5", "1.2345", "abc", ""].map((q) => `b1,K1,"${q}",2026-09-01,${OK}`)
  const r = run({ opening_stock: [`branch_key,item_code,quantity,as_of_date,${M}`, ...rows].join('\n') })
  // each line uses the same key, so duplicates also reject; assert that field errors are present
  const messages = find(r, 'opening_stock').map(msg).join(' | ')
  for (const part of [/must not be negative/, /dot as decimal separator/, /at most 3 decimal places/, /plain number/, /quantity is required/]) assert.match(messages, part)
  const future = run({ opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\nb1,K1,1,2026-10-01,${OK}\n` })
  assert.match(msg(find(future, 'opening_stock')[0]), /in the future/)
  const good = run({ opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\nb1,K1,0.001,2026-09-01,${OK}\nb1,A1,7,2026-09-01,${OK}\n` })
  assert.equal(find(good, 'opening_stock').filter((e) => e.status === 'ok').length, 2)
})

test('costs: invalid, too precise, beyond the 30-day window and overlapping effective dates are rejected', () => {
  const head = `branch_key,item_code,unit_cost,effective_from,${M}\n`
  const r = run({ item_costs: head + `b1,K1,-3,2026-09-01,${OK}\nb1,K1,1.23456,2026-09-02,${OK}\nb1,K1,5,2026-10-27,${OK}\nb1,K1,5,2026-13-01,${OK}\n` })
  const m = find(r, 'item_costs').map(msg).join(' | ')
  for (const part of [/must not be negative/, /at most 4 decimal places/, /more than 30 days/, /real date/]) assert.match(m, part)
  const edge = run({ item_costs: head + `b1,K1,5,2026-10-26,${OK}\n` })
  assert.equal(find(edge, 'item_costs')[0].status, 'ok', 'exactly 30 days ahead is allowed')
  const overlap = run({ item_costs: head + `b1,K1,5,2026-09-01,${OK}\nb1,K1,6,2026-09-01,${OK}\n` })
  assert.ok(find(overlap, 'item_costs').every((e) => e.status === 'rejected' && /overlapping effective-date/.test(msg(e))))
})

test('category-level and product-level mappings cannot be mixed in one row', () => {
  const r = run({
    category_branches: `branch_key,category_key,level,${M}\nb1,c1,product,${OK}\n`,
    product_categories: `branch_key,item_code,category_key,level,${M}\nb1,,c1,category,${OK}\nb1,A1,c1,product,${OK}\n`,
  })
  assert.match(msg(find(r, 'category_branches')[0]), /product-level mappings belong in product_categories/)
  assert.match(msg(find(r, 'product_categories', (e) => e.row === 2)[0]), /category-level rows belong in category_branches/)
})

test('cross-branch mappings are rejected: item of another branch, category not enabled for the item branch', () => {
  const r = run({
    inventory_items: ITEMS + `b2,B2,Baska,adet,false,true,${OK}\n`,
    product_categories: `branch_key,item_code,category_key,level,${M}\nb1,B2,c1,product,${OK}\nb2,B2,c1,product,${OK}\n`,
    opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\nb1,B2,3,2026-09-01,${OK}\n`,
  })
  const pc = find(r, 'product_categories')
  assert.match(msg(pc[0]), /not defined for branch 'b1' \(it exists in 'b2'\)/)
  assert.match(msg(pc[1]), /not enabled for branch 'b2' \(cross-branch mapping\)/)
  assert.match(msg(find(r, 'opening_stock')[0]), /exists in 'b2'/)
})

test('thresholds: warning >= error is rejected, ranges are enforced', () => {
  const h = `branch_key,warning_percentage,error_percentage,${M}\n`
  const r = run({ reconciliation_thresholds: h + `b1,5,5,${OK}\nb2,6,4,${OK}\nb1,-1,3,${OK}\nb2,1,101,${OK}\n` })
  assert.ok(find(r, 'reconciliation_thresholds').every((e) => e.status === 'rejected'))
  assert.match(msg(find(r, 'reconciliation_thresholds')[0]), /warning_percentage must be lower than error_percentage/)
  assert.equal(find(run({ reconciliation_thresholds: h + `b1,2,5,${OK}\n` }), 'reconciliation_thresholds')[0].status, 'ok')
})

test('shift times: invalid hours/minutes, bad offset and same-day cutoff before start are rejected', () => {
  const h = `branch_key,shift_key,name,start_time,end_time,cutoff_time,cutoff_day_offset,is_active,${M}\n`
  const r = run({ shift_definitions: h + `b1,s1,A,25:00,17:00,17:30,0,true,${OK}\nb1,s2,B,09:00,17:00,17:60,0,true,${OK}\nb1,s3,C,09:00,17:00,17:30,2,true,${OK}\nb1,s4,D,09:00,17:00,08:00,0,true,${OK}\n` })
  const rows = find(r, 'shift_definitions')
  assert.ok(rows.every((e) => e.status === 'rejected'))
  assert.match(msg(rows[0]), /start_time/)
  assert.match(msg(rows[1]), /cutoff_time/)
  assert.match(msg(rows[2]), /cutoff_day_offset/)
  assert.match(msg(rows[3]), /before start_time/)
  const ok = run({ shift_definitions: h + `b1,s5,E,16:00,01:00,01:00,1,true,${OK}\n` })
  assert.equal(find(ok, 'shift_definitions')[0].status, 'ok')
})

test('waste reason outside the schema list is rejected', () => {
  const r = run({ waste_reasons: `reason_code,name,is_active,${M}\nteft,Hirsizlik,true,${OK}\nexpired,SKT,true,${OK}\n` })
  const rows = find(r, 'waste_reasons')
  assert.match(msg(rows[0]), /not supported by the schema/)
  assert.equal(rows[1].status, 'ok')
})

test('unapproved or unknown business data is never applied as real data', () => {
  const r = run({
    registers: `branch_key,register_key,name,is_active,${M}\n` +
      `b1,k1,A,true,legacy_observed,pending,legacy\n` + // pending -> skipped
      `b1,k2,B,true,unknown,approved,nobody\n` + // unknown + approved -> rejected
      `b1,k3,C,true,demo_only,approved,demo\n` + // demo in real -> rejected
      `b1,k4,D,true,confirmed,rejected,owner said no\n` + // owner rejected -> skipped
      `b1,k5,E,true,legacy_observed,approved,owner ok\n`, // approved legacy -> ok
  })
  const st = find(r, 'registers').map((e) => e.status)
  assert.deepEqual(st, ['skipped', 'rejected', 'rejected', 'skipped', 'ok'])
  assert.deepEqual(buildPayload('real', r.entries).registers.map((x) => x.register_key), ['k5'])
})

test('children of a skipped parent are skipped, not applied', () => {
  const r = run({
    sales_categories: `category_key,name,is_active,${M}\nc1,Kat,true,legacy_observed,pending,legacy\n`,
    category_branches: `branch_key,category_key,level,${M}\nb1,c1,category,${OK}\n`,
  })
  assert.equal(find(r, 'category_branches')[0].status, 'skipped')
  assert.deepEqual(buildPayload('real', r.entries).category_branches, [])
})

test('test-only dataset accepts demo_only rows only and needs the real branch keys', () => {
  const h = `category_key,name,is_active,${M}\n`
  const r = validateDataset({
    dataset: 'test-only', today: TODAY, baseBranchKeys: ['b1'],
    files: {
      sales_categories: h + `t1,T,true,demo_only,approved,synthetic\nt2,T,true,confirmed,approved,real\n`,
      registers: `branch_key,register_key,name,is_active,${M}\nb1,k1,K,true,demo_only,approved,synthetic\nbX,k1,K,true,demo_only,approved,synthetic\n`,
    },
  })
  assert.deepEqual(find(r, 'sales_categories').map((e) => e.status), ['ok', 'rejected'])
  assert.deepEqual(find(r, 'registers').map((e) => e.status), ['ok', 'rejected'])
})

test('loader safety: only local hosts, dry-run default, test data needs an explicit flag', async () => {
  for (const ok of ['http://127.0.0.1:54321', 'http://localhost:54321']) assert.doesNotThrow(() => assertLocalUrl(ok))
  for (const bad of ['https://iwikwbjsznjuefvuemdb.supabase.co', 'https://example.com', 'http://10.0.0.5:54321', 'http://127.0.0.1.evil.com'])
    assert.throws(() => assertLocalUrl(bad), LoaderError)
  assert.equal(parseArgs([]).apply, false)
  assert.equal(parseArgs(['--apply']).apply, true)
  await assert.rejects(runLoader({ argv: [], env: { SUPABASE_URL: 'https://iwikwbjsznjuefvuemdb.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'x' }, fetchImpl: () => { throw new Error('must not be called') } }), /LOCAL ONLY/)
  await assert.rejects(runLoader({ argv: ['--dataset', 'test-only'], env: {}, fetchImpl: () => { throw new Error('nope') } }), /--allow-test-data/)
})

test('loader: a rejected row means nothing is sent to the database', async () => {
  let called = false
  const { report, exitCode } = await runLoader({
    argv: ['--apply', '--dir', join(HERE, 'fixtures-bad')], env: { SUPABASE_SERVICE_ROLE_KEY: 'k', OPERATING_DATA_ACTOR_CODE: 'X' },
    fetchImpl: () => { called = true; throw new Error('no') },
  })
  assert.equal(exitCode, 2)
  assert.equal(report.applied, false)
  assert.ok(report.rows.every((r) => r.status === 'rejected' && /duplicate/.test(r.message)))
  assert.equal(called, false)
})
