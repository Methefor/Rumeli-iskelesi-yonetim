#!/usr/bin/env node
/**
 * Post-apply verification. Pure file processing (never connects to a database):
 *
 *   node supabase/audit/verify_post_apply.mjs <pre-apply-baseline.json> <post-apply-baseline.json> [expected_pending_chain_delta.json]
 *
 * Both baselines come from supabase/audit/production_baseline_readonly.sql (capture the PRE one immediately before the apply, the POST one
 * immediately after, both through the read-only Management API query). The check proves, with exact numbers:
 *   - exactly the 9 expected migrations were added, nothing else, nothing removed
 *   - every object-count delta equals the expected delta, with exactly the expected objects added and NO object dropped
 *   - the only EXISTING objects whose definition changed are the three expected ones (inventory_movements, branches, record_inventory_waste)
 *   - legacy objects are untouched (any legacy relation/function/policy definition change = failure) and legacy row counts did not shrink
 *   - Auth, storage, extensions and the PostgREST role settings are identical
 *   - the expected configuration seeds exist and NO other V4 row count moved (no business data, no orders, no stock movements, no users)
 *   - SECURITY DEFINER hygiene: locked search_path, no PUBLIC execute, internal_* service-role only
 * Exit 0 = every check passed, 1 = at least one failed (all failures are printed).
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const [prePath, postPath, expPath = path.join(here, 'expected_pending_chain_delta.json')] = process.argv.slice(2)
if (!prePath || !postPath) {
  console.error('usage: verify_post_apply.mjs <pre.json> <post.json> [expected.json]')
  process.exit(2)
}
function load(p) {
  const raw = JSON.parse(fs.readFileSync(p, 'utf8'))
  if (raw && Array.isArray(raw.rows) && raw.rows[0]?.baseline) return JSON.parse(raw.rows[0].baseline)
  return raw
}
const pre = load(prePath)
const post = load(postPath)
for (const [name, b] of [['pre', pre], ['post', post]]) {
  if (b?._captured?.audit_time_baseline_only) {
    console.error(`refused: the ${name} file is an AUDIT-TIME BASELINE ONLY (not valid for the apply). Capture a fresh T-60 / T-0 baseline.`)
    process.exit(2)
  }
}
const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'))

const failures = []
let passed = 0
const check = (ok, label, detail = '') => {
  if (ok) passed += 1
  else failures.push(`${label}${detail ? ` :: ${detail}` : ''}`)
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const sortedEq = (a, b) => eq([...a].sort(), [...b].sort())

const rk = (r) => `${r.kind}:${r.name}`
const fk = (f) => `${f.name}(${f.args})`
const pk = (p) => `${p.schema}.${p.table}.${p.name}`
const idx = (list, k) => new Map(list.map((x) => [k(x), x]))

// migrations
check(pre.migrations.every((m) => post.migrations.includes(m)), 'no migration was removed from the history')
check(sortedEq(post.migrations.filter((m) => !pre.migrations.includes(m)), exp.migrations_added), 'exactly the expected migrations were added', JSON.stringify(post.migrations.filter((m) => !pre.migrations.includes(m))))
check(post.migrations.length === pre.migrations.length + exp.migrations_added.length, 'history length = before + 9')

// counts
for (const [k, d] of Object.entries(exp.counts_delta)) check(post.counts[k] - pre.counts[k] === d, `count ${k} delta`, `expected +${d}, got ${post.counts[k] - pre.counts[k]}`)
check(post.counts.tables_without_rls === 0, 'every public table has RLS enabled')

// objects
for (const [section, key, expectedAdded] of [['relations', rk, exp.relations_added], ['functions', fk, exp.functions_added], ['policies', pk, exp.policies_added]]) {
  const a = idx(pre[section], key)
  const b = idx(post[section], key)
  const added = [...b.keys()].filter((k) => !a.has(k))
  const dropped = [...a.keys()].filter((k) => !b.has(k))
  check(sortedEq(added, expectedAdded), `${section}: exactly the expected objects were added`, `unexpected=${added.filter((x) => !expectedAdded.includes(x))} missing=${expectedAdded.filter((x) => !added.includes(x))}`)
  check(dropped.length === 0, `${section}: nothing was dropped`, dropped.join(','))
  const changed = [...a.keys()].filter((k) => b.has(k) && JSON.stringify(a.get(k)) !== JSON.stringify(b.get(k)))
  const allowed = Object.keys(section === 'relations' ? exp.relations_changed : section === 'functions' ? exp.functions_changed : {})
  check(sortedEq(changed, allowed), `${section}: only the expected existing objects changed (legacy untouched)`, `changed=${changed}`)
}

// hygiene
for (const k of ['definer_without_locked_search_path', 'definer_executable_by_public', 'internal_functions_not_service_only']) check(post.hygiene[k].length === 0, `hygiene: ${k} is empty`, post.hygiene[k].join(','))
const newAnon = post.hygiene.functions_executable_by_anon.filter((f) => !pre.hygiene.functions_executable_by_anon.includes(f))
check(sortedEq(newAnon, exp.anon_executable_functions_added), 'hygiene: the only newly anon-executable functions are the expected trigger/pure helpers', newAnon.join(','))

// rows: expected seeds only, no business data, legacy never shrinks
const legacy = ['daily_reports', 'entry_history', 'shift_schedule', 'cashiers', 'targets', 'achievements', 'admins', 'daily_revenue']
for (const k of new Set([...Object.keys(pre.row_counts), ...Object.keys(post.row_counts)])) {
  const before = pre.row_counts[k] ?? null
  const after = post.row_counts[k] ?? null
  if (legacy.includes(k)) {
    check(before !== null && after !== null && after >= before, `legacy rows of ${k} did not shrink`, `${before} -> ${after}`)
    continue
  }
  const e = exp.row_counts_delta[k]
  if (e) check(before === e.from && after === e.to, `row count ${k} = expected seed`, `${before} -> ${after} (expected ${e.from} -> ${e.to})`)
  else check(before === after, `row count ${k} unchanged`, `${before} -> ${after}`)
}

// untouched domains
check(eq(pre.auth, post.auth) && post.auth.users === 0 && post.auth.identities === 0 && post.auth.sessions === 0, 'Auth unchanged and still empty')
check(eq(pre.storage, post.storage), 'storage (buckets, object counts) unchanged')
check(eq(pre.extensions, post.extensions), 'extensions unchanged')
check(eq(pre.authenticator_settings, post.authenticator_settings), 'authenticator (PostgREST) role settings unchanged')
check(post.counts.storage_policies === pre.counts.storage_policies, 'storage policies unchanged')

console.log(`passed=${passed} failed=${failures.length}`)
for (const f of failures) console.log(`FAIL ${f}`)
process.exit(failures.length === 0 ? 0 : 1)
