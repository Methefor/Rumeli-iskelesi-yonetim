// Refuses to continue unless the Supabase URL the app would actually use is a
// local one. Resolves it exactly like Vite does (process env first, then the
// .env files in Vite's priority order for the given mode), so a stray
// production value in a lower-priority file cannot slip through.
//
//   node scripts/assert-local-supabase.mjs <mode>     (default: development)
//
// Prints only the host, never a key. Exit code 1 = not local (do not start).
import { loadEnv } from 'vite'

const mode = process.argv[2] ?? 'development'
const env = loadEnv(mode, process.cwd(), 'VITE_')
const raw = process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL ?? ''
const demo = (process.env.VITE_DEMO_MODE ?? env.VITE_DEMO_MODE) === 'true'

let host = ''
try {
  host = new URL(raw).hostname
} catch {
  // handled below
}

const local = host === '127.0.0.1' || host === 'localhost' || host === '[::1]'
if (!local && !demo) {
  console.error(
    `ABORT: effective VITE_SUPABASE_URL host "${host || '(missing)'}" is not local (127.0.0.1/localhost).`,
  )
  process.exit(1)
}
console.log(`OK: mode=${mode} supabase host=${host || '(demo, unused)'} demo=${demo}`)
