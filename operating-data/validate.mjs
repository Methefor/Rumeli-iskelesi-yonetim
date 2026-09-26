/**
 * Pure validation of an operating-data dataset (no I/O, no database).
 *
 * Every row ends in exactly one status:
 *   ok        valid and approved: will be sent to the database
 *   skipped   valid but intentionally NOT applied (owner approval is pending,
 *             owner rejected it, or a row it depends on is not applied)
 *   rejected  invalid: wrong field, duplicate, broken reference, or business
 *             data that claims a status it cannot have
 * The loader applies NOTHING when any row is rejected.
 */
import { parseTable } from './csv.mjs'
import {
  APPROVAL,
  COLUMNS,
  GROUPS,
  ITEM_CODE_PATTERN,
  KEY_FIELDS,
  KEY_PATTERN,
  MAX_COST_DAYS_AHEAD,
  META_COLUMNS,
  PROVENANCE,
  SUPPORTED_UNITS,
  WASTE_REASON_CODES,
} from './contract.mjs'

const DECIMAL = /^\d+(\.\d+)?$/

function isRealDate(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

function addDays(iso, days) {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 'HH:MM' -> { h, m } or null */
function parseTime(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(s)
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  return h <= 23 && min <= 59 ? { h, m: min } : null
}

function parseBool(s) {
  if (s === 'true') return true
  if (s === 'false') return false
  return null
}

function decimalError(raw, label, { maxDecimals, maxExclusive }) {
  if (raw === '') return `${label} is required`
  if (raw.startsWith('-')) return `${label} must not be negative`
  if (raw.includes(',')) return `${label} must use a dot as decimal separator`
  if (!DECIMAL.test(raw)) return `${label} must be a plain number`
  const decimals = (raw.split('.')[1] ?? '').length
  if (decimals > maxDecimals) return `${label} supports at most ${maxDecimals} decimal places`
  if (Number(raw) >= maxExclusive) return `${label} is too large`
  return null
}

/** Field-level validation; returns { errors, data } where data is the payload row. */
function validateFields(group, v, ctx) {
  const errors = []
  const data = {}
  const key = (field) => {
    const s = v[field]
    if (!KEY_PATTERN.test(s)) errors.push(`${field} '${s}' must be lowercase letters, digits or _ (2-48 chars, starting with a letter)`)
    data[field] = s
  }
  const text = (field) => {
    if (!v[field]) errors.push(`${field} is required`)
    data[field] = v[field]
  }
  const bool = (field) => {
    const b = parseBool(v[field])
    if (b === null) errors.push(`${field} must be true or false`)
    data[field] = b
  }
  const itemCode = () => {
    if (!ITEM_CODE_PATTERN.test(v.item_code))
      errors.push(`item_code '${v.item_code}' must be upper-case letters/digits/._- (max 32 chars)`)
    data.item_code = v.item_code
  }

  switch (group) {
    case 'branches':
      key('branch_key'); text('name'); bool('is_active')
      break
    case 'sales_categories':
      key('category_key'); text('name'); bool('is_active')
      break
    case 'registers':
      key('branch_key'); key('register_key'); text('name'); bool('is_active')
      break
    case 'shift_definitions': {
      key('branch_key'); key('shift_key'); text('name'); bool('is_active')
      const s = parseTime(v.start_time)
      const e = parseTime(v.end_time)
      const c = parseTime(v.cutoff_time)
      if (!s) errors.push(`start_time '${v.start_time}' must be HH:MM between 00:00 and 23:59`)
      if (!e) errors.push(`end_time '${v.end_time}' must be HH:MM between 00:00 and 23:59`)
      if (!c) errors.push(`cutoff_time '${v.cutoff_time}' must be HH:MM between 00:00 and 23:59`)
      if (!['0', '1'].includes(v.cutoff_day_offset)) errors.push('cutoff_day_offset must be 0 or 1')
      const offset = Number(v.cutoff_day_offset)
      if (s && c && offset === 0 && c.h * 60 + c.m < s.h * 60 + s.m)
        errors.push('cutoff_time is before start_time on the same day (use cutoff_day_offset 1 for a cutoff after midnight)')
      if (s && e && c) {
        data.start_hour = s.h; data.start_minute = s.m
        data.end_hour = e.h; data.end_minute = e.m
        data.cutoff_hour = c.h; data.cutoff_minute = c.m
      }
      data.cutoff_day_offset = offset
      break
    }
    case 'category_branches':
      key('branch_key'); key('category_key')
      if (v.level !== 'category')
        errors.push("level must be 'category' in this file (product-level mappings belong in product_categories)")
      break
    case 'inventory_items': {
      key('branch_key'); itemCode(); text('name'); bool('is_active'); bool('allows_decimal')
      if (!SUPPORTED_UNITS.includes(v.unit))
        errors.push(`unit '${v.unit}' is not supported (supported: ${SUPPORTED_UNITS.join(', ')})`)
      data.unit = v.unit
      break
    }
    case 'product_categories':
      key('branch_key'); key('category_key')
      if (v.level !== 'product' || !v.item_code)
        errors.push("a product mapping needs level 'product' and an item_code (category-level rows belong in category_branches)")
      else itemCode()
      break
    case 'opening_stock': {
      key('branch_key'); itemCode()
      const qe = decimalError(v.quantity, 'quantity', { maxDecimals: 3, maxExclusive: 1e11 })
      if (qe) errors.push(qe)
      data.quantity = v.quantity
      if (!isRealDate(v.as_of_date)) errors.push('as_of_date must be a real date YYYY-MM-DD')
      else if (v.as_of_date > ctx.today) errors.push('as_of_date cannot be in the future')
      data.as_of_date = v.as_of_date
      break
    }
    case 'item_costs': {
      key('branch_key'); itemCode()
      const ce = decimalError(v.unit_cost, 'unit_cost', { maxDecimals: 4, maxExclusive: 1e9 })
      if (ce) errors.push(ce)
      data.unit_cost = v.unit_cost
      if (!isRealDate(v.effective_from)) errors.push('effective_from must be a real date YYYY-MM-DD')
      else if (v.effective_from > addDays(ctx.today, MAX_COST_DAYS_AHEAD))
        errors.push(`effective_from is more than ${MAX_COST_DAYS_AHEAD} days in the future`)
      data.effective_from = v.effective_from
      break
    }
    case 'reconciliation_thresholds': {
      key('branch_key')
      const we = decimalError(v.warning_percentage, 'warning_percentage', { maxDecimals: 2, maxExclusive: 101 })
      const ee = decimalError(v.error_percentage, 'error_percentage', { maxDecimals: 2, maxExclusive: 101 })
      if (we) errors.push(we)
      if (ee) errors.push(ee)
      if (!we && !ee && Number(v.warning_percentage) >= Number(v.error_percentage))
        errors.push('warning_percentage must be lower than error_percentage')
      data.warning_percentage = v.warning_percentage
      data.error_percentage = v.error_percentage
      break
    }
    case 'waste_reasons':
      text('name'); bool('is_active')
      if (!WASTE_REASON_CODES.includes(v.reason_code))
        errors.push(`reason_code '${v.reason_code}' is not supported by the schema (${WASTE_REASON_CODES.join(', ')})`)
      data.reason_code = v.reason_code
      break
    default:
      errors.push(`unknown group ${group}`)
  }

  if (!PROVENANCE.includes(v.provenance)) errors.push(`provenance must be one of ${PROVENANCE.join(', ')}`)
  if (!APPROVAL.includes(v.approval_status)) errors.push(`approval_status must be one of ${APPROVAL.join(', ')}`)
  if (!v.source) errors.push('source is required (where does this value come from?)')
  data.provenance = v.provenance
  data.approval_status = v.approval_status
  data.source = v.source
  return { errors, data }
}

/** Apply the dataset policy; returns 'ok' | 'skipped' | 'rejected' plus a message. */
function applyPolicy(dataset, data) {
  const { provenance, approval_status: approval } = data
  if (!PROVENANCE.includes(provenance) || !APPROVAL.includes(approval)) return { status: 'rejected' }
  if (dataset === 'test-only') {
    if (provenance !== 'demo_only')
      return { status: 'rejected', message: "the test-only dataset accepts provenance 'demo_only' rows only" }
    return approval === 'approved'
      ? { status: 'ok' }
      : { status: 'skipped', message: `approval_status is ${approval}` }
  }
  if (provenance === 'demo_only')
    return { status: 'rejected', message: 'demo_only data can never be part of the real dataset' }
  if (provenance === 'unknown' && approval === 'approved')
    return { status: 'rejected', message: 'unknown business data cannot be marked approved: obtain the value from the owner first' }
  if (approval === 'approved') return { status: 'ok' }
  return {
    status: 'skipped',
    message:
      approval === 'pending'
        ? 'not applied: owner approval is pending'
        : 'not applied: the owner rejected this value',
  }
}

const keyOf = (group, data) => KEY_FIELDS[group].map((f) => data[f]).join('/')

/**
 * @param {object} p
 * @param {'real'|'test-only'} p.dataset
 * @param {Record<string,string|null|undefined>} p.files   CSV text per group
 * @param {string[]} [p.baseBranchKeys]  branch keys that already exist (test-only builds on the real branches)
 * @param {string} p.today  YYYY-MM-DD, the business "today" (Europe/Istanbul)
 */
export function validateDataset({ dataset = 'real', files, baseBranchKeys = [], today }) {
  if (!isRealDate(today)) throw new Error('today must be YYYY-MM-DD')
  const ctx = { today }
  const entries = []
  const byGroup = Object.fromEntries(GROUPS.map((g) => [g, []]))

  // 1. parse + field validation
  for (const group of GROUPS) {
    const text = files[group]
    if (text == null || text.trim() === '') continue
    let table
    try {
      table = parseTable(text)
    } catch (e) {
      entries.push({ group, row: 0, key: group, status: 'rejected', message: `file cannot be parsed: ${e.message}` })
      continue
    }
    const wanted = [...COLUMNS[group], ...META_COLUMNS]
    const missing = wanted.filter((c) => !table.header.includes(c))
    const extra = table.header.filter((c) => !wanted.includes(c))
    if (table.header.length === 0) continue
    if (missing.length || extra.length) {
      entries.push({
        group, row: 1, key: group, status: 'rejected',
        message: `header mismatch${missing.length ? `: missing ${missing.join(', ')}` : ''}${extra.length ? `: unexpected ${extra.join(', ')}` : ''}`,
      })
      continue
    }
    for (const r of table.rows) {
      if (r.extraCells) {
        const e = { group, row: r.line, key: '?', status: 'rejected', message: 'row has more cells than the header' }
        entries.push(e); byGroup[group].push(e)
        continue
      }
      const { errors, data } = validateFields(group, r.values, ctx)
      const e = { group, row: r.line, key: keyOf(group, r.values), data, status: 'ok', message: null }
      if (errors.length) {
        e.status = 'rejected'
        e.message = errors.join('; ')
      }
      entries.push(e); byGroup[group].push(e)
    }
  }

  const reject = (e, message) => {
    e.status = 'rejected'
    e.message = e.message ? `${e.message}; ${message}` : message
  }

  // 2. duplicates: every row that shares a key is rejected (nothing is guessed)
  for (const group of GROUPS) {
    const seen = new Map()
    for (const e of byGroup[group]) {
      const k = (group === 'inventory_items' || group === 'product_categories' || group === 'opening_stock' || group === 'item_costs')
        ? e.key.toUpperCase()
        : e.key
      if (!seen.has(k)) seen.set(k, [])
      seen.get(k).push(e)
    }
    for (const [k, list] of seen) {
      if (list.length > 1) {
        const lines = list.map((x) => x.row).join(', ')
        for (const e of list)
          reject(e, group === 'item_costs'
            ? `overlapping effective-date record for ${k} (lines ${lines})`
            : `duplicate ${KEY_FIELDS[group].join('/')} '${k}' (lines ${lines})`)
      }
    }
  }

  // 3. dataset policy (provenance x approval)
  for (const e of entries) {
    if (e.status !== 'ok' || !e.data) continue
    const p = applyPolicy(dataset, e.data)
    if (p.status === 'rejected') reject(e, p.message ?? 'invalid provenance/approval')
    else if (p.status === 'skipped') {
      e.status = 'skipped'
      e.message = p.message
    }
  }

  // 4. references. A parent counts as "known" whether or not it will be applied;
  //    a child of a skipped parent is skipped, a child of an unknown parent is rejected.
  const known = (group, k) => byGroup[group].find((e) => e.status !== 'rejected' && e.key === k)
  const branchKnown = (bk) => {
    const e = known('branches', bk)
    if (e) return e
    return baseBranchKeys.includes(bk) ? { status: 'ok', external: true } : null
  }
  const dependOn = (e, parent, label) => {
    if (!parent) return reject(e, `unknown ${label}`), false
    if (parent.status === 'skipped' && e.status === 'ok') {
      e.status = 'skipped'
      e.message = `not applied: ${label} is not applied`
    }
    return true
  }
  const itemKnown = (branch, code) =>
    byGroup.inventory_items.find((e) => e.status !== 'rejected' && e.data.branch_key === branch && e.data.item_code.toUpperCase() === code.toUpperCase())

  for (const e of entries) {
    if (e.status === 'rejected' || !e.data) continue
    const d = e.data
    switch (e.group) {
      case 'registers':
      case 'shift_definitions':
      case 'inventory_items':
      case 'reconciliation_thresholds':
        dependOn(e, branchKnown(d.branch_key), `branch '${d.branch_key}'`)
        break
      case 'category_branches':
        if (dependOn(e, branchKnown(d.branch_key), `branch '${d.branch_key}'`))
          dependOn(e, known('sales_categories', d.category_key), `category '${d.category_key}'`)
        break
      case 'product_categories': {
        const item = itemKnown(d.branch_key, d.item_code)
        if (!item) {
          const other = byGroup.inventory_items.find((x) => x.status !== 'rejected' && x.data.item_code.toUpperCase() === d.item_code.toUpperCase())
          reject(e, other
            ? `item '${d.item_code}' is not defined for branch '${d.branch_key}' (it exists in '${other.data.branch_key}')`
            : `unknown item '${d.item_code}' in branch '${d.branch_key}'`)
          break
        }
        if (!known('sales_categories', d.category_key)) { reject(e, `unknown category '${d.category_key}'`); break }
        const cb = byGroup.category_branches.find((x) => x.status !== 'rejected' && x.data.branch_key === d.branch_key && x.data.category_key === d.category_key)
        if (!cb) { reject(e, `category '${d.category_key}' is not enabled for branch '${d.branch_key}' (cross-branch mapping)`); break }
        dependOn(e, item, `item '${d.item_code}'`)
        dependOn(e, cb, `category mapping '${d.branch_key}/${d.category_key}'`)
        dependOn(e, known('sales_categories', d.category_key), `category '${d.category_key}'`)
        break
      }
      case 'item_costs':
      case 'opening_stock': {
        const item = itemKnown(d.branch_key, d.item_code)
        if (!item) {
          const other = byGroup.inventory_items.find((x) => x.status !== 'rejected' && x.data.item_code.toUpperCase() === d.item_code.toUpperCase())
          reject(e, other
            ? `item '${d.item_code}' is not defined for branch '${d.branch_key}' (it exists in '${other.data.branch_key}')`
            : `unknown item '${d.item_code}' in branch '${d.branch_key}'`)
          break
        }
        if (e.group === 'opening_stock' && item.data.allows_decimal === false && !Number.isInteger(Number(d.quantity)))
          reject(e, `item '${d.item_code}' is counted in whole units; fractional quantity ${d.quantity} is not allowed`)
        else dependOn(e, item, `item '${d.item_code}'`)
        break
      }
      default:
    }
  }

  const counts = { ok: 0, skipped: 0, rejected: 0 }
  for (const e of entries) counts[e.status]++
  return { entries, counts }
}

/** Payload rows for the database: only rows that are 'ok'. */
export function buildPayload(dataset, entries) {
  const payload = { dataset }
  for (const g of GROUPS) {
    payload[g] = entries
      .filter((e) => e.group === g && e.status === 'ok')
      .map((e) => ({ row: e.row, ...e.data }))
  }
  return payload
}
