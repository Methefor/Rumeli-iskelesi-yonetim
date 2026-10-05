import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { APPROVED_PRODUCTION_REF, distProblems, pilotEnvProblems } from './assert-pilot-build.mjs'

const jwt = (role) =>
  `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.sig`
const good = () => ({
  VITE_DEMO_MODE: 'false',
  VITE_SUPABASE_URL: `https://${APPROVED_PRODUCTION_REF}.supabase.co`,
  VITE_SUPABASE_ANON_KEY: jwt('anon'),
})

test('a correct pilot environment passes', () => {
  assert.deepEqual(pilotEnvProblems(good()), [])
})

test('demo mode, a wrong project, a missing or service key and secret-named variables are all refused', () => {
  assert.match(pilotEnvProblems({ ...good(), VITE_DEMO_MODE: 'true' }).join(), /DEMO_MODE/)
  assert.match(pilotEnvProblems({ ...good(), VITE_DEMO_MODE: undefined }).join(), /DEMO_MODE/)
  assert.match(pilotEnvProblems({ ...good(), VITE_SUPABASE_URL: 'http://127.0.0.1:54321' }).join(), /approved production/)
  assert.match(pilotEnvProblems({ ...good(), VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' }).join(), /approved production/)
  assert.match(pilotEnvProblems({ ...good(), VITE_SUPABASE_ANON_KEY: jwt('service_role') }).join(), /anon/)
  assert.match(pilotEnvProblems({ ...good(), VITE_SUPABASE_ANON_KEY: '' }).join(), /missing/)
  assert.match(pilotEnvProblems({ ...good(), VITE_SERVICE_ROLE_KEY: 'x' }).join(), /never carry a secret/)
})

test('a built bundle containing a service-role marker or a demo placeholder is refused', () => {
  const clean = mkdtempSync(join(tmpdir(), 'dist-ok-'))
  writeFileSync(join(clean, 'a.js'), 'console.log("hello")')
  assert.deepEqual(distProblems(clean), [])
  const bad = mkdtempSync(join(tmpdir(), 'dist-bad-'))
  writeFileSync(join(bad, 'a.js'), 'const k="service_role"')
  writeFileSync(join(bad, 'b.js'), 'x="demo-mode-must-not-call-this"')
  assert.equal(distProblems(bad).length, 2)
})
