/**
 * Validated environment access. Never import.meta.env directly elsewhere —
 * go through this module so a missing/misconfigured env fails loudly at
 * startup instead of producing a silently broken Supabase client.
 */

interface AppEnv {
  supabaseUrl: string
  supabaseAnonKey: string
}

function readEnv(): AppEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

  const missing: string[] = []
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env.local and fill in your Supabase project values.',
    )
  }

  return { supabaseUrl, supabaseAnonKey }
}

export const env: AppEnv = readEnv()

/**
 * Preview-only demo mode (see DECISIONS.md). Read independently of `env`
 * above so a Preview deployment can enable it without needing a real
 * Supabase project configured — the point of demo mode is to let the UI
 * boot and be navigated even when the backend is intentionally
 * unavailable. Never true unless explicitly set; there is no default-on
 * path, and nothing here inspects `import.meta.env.PROD` to guess intent —
 * an operator sets this flag explicitly per environment.
 */
export const isDemoModeEnabled: boolean = import.meta.env.VITE_DEMO_MODE === 'true'
