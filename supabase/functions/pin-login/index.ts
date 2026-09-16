// =============================================================================
// pin-login Edge Function
// =============================================================================
// STATUS: NOT DEPLOYED. Prepared source for review only — see
// AUTH_ARCHITECTURE.md "PIN login flow" and MIGRATION_PLAN.md.
//
// Do not deploy this until:
//   - migrations 001-006 have been reviewed and applied,
//   - the service_credentials mechanism it depends on exists (see the
//     AUTH_ARCHITECTURE.md open item — not yet a migration in this phase),
//   - and this file itself has been reviewed.
//
// Purpose: the only place PIN verification and session issuance happen.
// The browser never sees a PIN hash, a service-role key, or the per-profile
// service password this function uses internally.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface PinLoginRequest {
  employeeCode: string
  pin: string
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: PinLoginRequest
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON body', { status: 400 })
  }

  const { employeeCode, pin } = body
  if (!employeeCode || !pin || !/^\d{4,6}$/.test(pin)) {
    return new Response('Invalid request', { status: 400 })
  }

  // Service-role client — this key exists ONLY in the Edge Function runtime
  // environment (a Supabase secret), never in any frontend bundle.
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Resolve employee_code -> profile id.
  //    NOTE: `employee_code` is not part of the 001-004 migrations as
  //    written — it needs a lookup column/table decision (e.g. a short code
  //    on profiles, or phone number) before this function can be finished.
  //    Left as an explicit TODO rather than guessed at here.
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('legacy_cashier_id', employeeCode) // TODO: replace with the real lookup column once decided
    .eq('is_active', true)
    .maybeSingle()

  if (profileError || !profile) {
    // Same generic response as a wrong PIN — do not reveal whether the
    // employee code exists.
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 })
  }

  // 2. Verify the PIN server-side via the SECURITY DEFINER RPC (005),
  //    which handles rate limiting/lockout internally.
  const { data: pinOk, error: verifyError } = await adminClient.rpc('verify_pin', {
    p_user_id: profile.id,
    p_pin: pin,
  })

  if (verifyError || !pinOk) {
    return new Response(JSON.stringify({ error: 'invalid_credentials' }), { status: 401 })
  }

  // 3. Mint a real session using the per-profile service password.
  //    TODO: this table/mechanism (`service_credentials`) is an open design
  //    item, not yet a migration — see AUTH_ARCHITECTURE.md. Do not deploy
  //    this function until it exists and has been reviewed.
  const { data: serviceCred } = await adminClient
    .from('service_credentials') // TODO: does not exist yet
    .select('service_email, service_password')
    .eq('user_id', profile.id)
    .maybeSingle()

  if (!serviceCred) {
    return new Response(JSON.stringify({ error: 'account_not_provisioned' }), { status: 500 })
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )

  const { data: signInData, error: signInError } = await anonClient.auth.signInWithPassword({
    email: serviceCred.service_email,
    password: serviceCred.service_password,
  })

  if (signInError || !signInData.session) {
    return new Response(JSON.stringify({ error: 'sign_in_failed' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      access_token: signInData.session.access_token,
      refresh_token: signInData.session.refresh_token,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
