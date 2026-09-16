import { createClient } from '@supabase/supabase-js'
import { env } from './env'

/**
 * Single shared Supabase client for the V4 app.
 *
 * IMPORTANT: this is intentionally the *only* place that constructs a
 * Supabase client. Feature/domain code must import `supabase` from here,
 * never call `createClient` itself.
 *
 * Auth is NOT implemented yet. The legacy plaintext-PIN-from-browser login
 * pattern is explicitly not being ported here — see DECISIONS.md and
 * features/auth/README.md. This client currently only supports anonymous,
 * RLS-gated access until Phase C introduces real Supabase Auth sessions.
 */
export const supabase = createClient(env.supabaseUrl, env.supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})
