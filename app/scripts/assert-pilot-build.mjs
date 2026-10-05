// Fail-closed guard for the restricted REAL-BACKEND pilot build (docs/PRODUCTION_PILOT_FRONTEND.md).
//
//   node scripts/assert-pilot-build.mjs            (checks the shell environment)
//   node scripts/assert-pilot-build.mjs --dist     (also scans ./dist after the build)
//
// The pilot bundle must talk to the approved production project with the PUBLIC anon key
// only, with demo mode OFF. Values must come from the operator SHELL (not from .env files:
// a developer .env.local may hold other values). Never prints a key.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const APPROVED_PRODUCTION_REF = 'iwikwbjsznjuefvuemdb'

function jwtRole(token) {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')).role ?? null
  } catch {
    return null
  }
}

/** Returns a list of problems; empty = the environment is acceptable for the pilot build. */
export function pilotEnvProblems(env) {
  const problems = []
  if (env.VITE_DEMO_MODE !== 'false') problems.push('VITE_DEMO_MODE must be explicitly "false" in the shell')
  if ((env.VITE_DEMO_FIXTURES ?? 'false') !== 'false') problems.push('VITE_DEMO_FIXTURES must be "false"')
  let host = ''
  try {
    host = new URL(env.VITE_SUPABASE_URL ?? '').hostname
  } catch {
    problems.push('VITE_SUPABASE_URL is missing or invalid')
  }
  if (host && host !== `${APPROVED_PRODUCTION_REF}.supabase.co`)
    problems.push('VITE_SUPABASE_URL is not the approved production project')
  const anon = env.VITE_SUPABASE_ANON_KEY ?? ''
  if (!anon) problems.push('VITE_SUPABASE_ANON_KEY is missing')
  else if (jwtRole(anon) !== 'anon' && !anon.startsWith('sb_publishable_'))
    problems.push('VITE_SUPABASE_ANON_KEY is not an anon/publishable key')
  for (const name of Object.keys(env))
    if (name.startsWith('VITE_') && /service|secret|private|password|pin/i.test(name))
      problems.push(`${name}: a VITE_* variable must never carry a secret`)
  return problems
}

const MARKERS = [/service_role/, /sb_secret_/, /"role"\s*:\s*"service_role"/]
export function distProblems(dir) {
  const problems = []
  const walk = (d) => {
    for (const entry of readdirSync(d)) {
      const p = join(d, entry)
      if (statSync(p).isDirectory()) walk(p)
      else if (/\.(js|html|css|json|map)$/.test(entry)) {
        const text = readFileSync(p, 'utf8')
        for (const m of MARKERS) if (m.test(text)) problems.push(`${entry}: secret marker ${m}`)
        if (text.includes('demo-mode-must-not-call-this')) problems.push(`${entry}: demo placeholder found`)
      }
    }
  }
  walk(dir)
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = [
    ...pilotEnvProblems(process.env),
    ...(process.argv.includes('--dist') ? distProblems('dist') : []),
  ]
  if (problems.length) {
    console.error(`ABORT pilot build guard:\n - ${problems.join('\n - ')}`)
    process.exit(1)
  }
  console.log('OK: pilot build environment is valid (demo off, approved project, public key only).')
}
