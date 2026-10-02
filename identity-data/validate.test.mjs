import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseTable } from '../operating-data/csv.mjs'

const path = fileURLToPath(new URL('./approved_staff.csv', import.meta.url))
const table = parseTable(readFileSync(path, 'utf8'))
const expectedHeader = [
  'employee_code', 'full_name', 'role_key', 'branch_key', 'is_active',
  'provenance', 'approval_status', 'source',
]

test('approved active cashier roster is complete and contains no credentials', () => {
  assert.deepEqual(table.header, expectedHeader)
  assert.equal(table.rows.length, 5)
  const rows = table.rows.map((row) => row.values)
  const codes = rows.map((row) => row.employee_code)
  assert.equal(new Set(codes).size, rows.length)
  assert.deepEqual(codes, ['K001', 'K002', 'K003', 'D001', 'D002'])
  assert.deepEqual(
    rows.map((row) => [row.full_name, row.branch_key]),
    [
      ['Tuba Bozaklı', 'rumeli_iskelesi'],
      ['Ceren Erdem', 'rumeli_iskelesi'],
      ['Rüya Akşar', 'rumeli_iskelesi'],
      ['Tuba Öztav', 'iskele_dondurma'],
      ['Tuğkan Karademir', 'iskele_dondurma'],
    ],
  )
  for (const row of rows) {
    assert.match(row.employee_code, /^[KD][0-9]{3}$/)
    assert.equal(row.role_key, 'cashier')
    assert.equal(row.is_active, 'true')
    assert.equal(row.provenance, 'confirmed')
    assert.equal(row.approval_status, 'approved')
    assert.ok(row.source)
    assert.deepEqual(
      Object.keys(row).filter((key) => /pin|password|email|uuid|secret|token/i.test(key)),
      [],
    )
  }
})
