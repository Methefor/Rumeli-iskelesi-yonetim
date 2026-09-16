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
