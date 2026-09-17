// =============================================================================
// pin-login Edge Function
// =============================================================================
// STATUS: NOT DEPLOYED. Prepared source for review only — see
// AUTH_ARCHITECTURE.md "PIN login flow" and MIGRATION_PLAN.md.
//
// Security review (2026-09-17): the original design depended on a
// `service_credentials` table (a per-profile, randomly generated, readable
// password) to mint a session via `signInWithPassword`. REJECTED — see
// DECISIONS.md "service_credentials rejected". That table is never created
// and this file no longer references it.
//
// Replacement design: `supabase.auth.admin.generateLink({ type: 'magiclink' })`
// followed by `supabase.auth.verifyOtp({ type: 'magiclink', token_hash })`,
// both called from THIS server-side function. `generateLink` does not send
// any email itself (it is documented as returning the link/token for the
// caller to deliver, precisely so custom flows like this one don't have to
// touch email delivery) — the browser never sees the token_hash, and no
// email/SMS is ever sent to the employee. The result of `verifyOtp` is a
// normal, refreshable Supabase session, identical in shape to any other
// sign-in method.
//
// NOT LIVE-VERIFIED: this relies on documented GoTrue/Supabase Auth admin
// behavior that has not been exercised against a real Supabase project in
// this session (no DB/project access available here). Before deployment,
// run one manual smoke test against a staging project confirming:
//   (a) generateLink({ type: 'magiclink' }) does not dispatch an email when
//       no SMTP "Confirm email" trigger fires for an already-verified user,
//       and
//   (b) verifyOtp returns a session whose access/refresh tokens work with
//       supabase.auth.setSession() on the client exactly like a normal login.
// Until that smoke test passes, treat deployment as BLOCKED — see
// BACKLOG.md.
//
// Purpose: the only place PIN verification and session issuance happen. The
// browser never sees a PIN hash, a service-role key, or a token_hash.
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

  // 1. Resolve employee_code -> profile id + the auth.users email needed for
  //    step 3. `employee_code` is the resolved login handle as of the
  //    security review (see DECISIONS.md) — no longer legacy_cashier_id.
  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id')
    .eq('employee_code', employeeCode.trim().toUpperCase())
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

  // 3. Mint a real session without ever storing or handling a password.
  //    getUserById needs the service-role client; generateLink/verifyOtp are
  //    plain (documented, public) GoTrue Auth Admin/Auth API calls.
  const { data: authUser, error: getUserError } = await adminClient.auth.admin.getUserById(
    profile.id,
  )

  if (getUserError || !authUser.user?.email) {
    return new Response(JSON.stringify({ error: 'account_not_provisioned' }), { status: 500 })
  }

  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: 'magiclink',
    email: authUser.user.email,
  })

  if (linkError || !linkData.properties?.hashed_token) {
    return new Response(JSON.stringify({ error: 'sign_in_failed' }), { status: 500 })
  }

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
  )

  const { data: verifyData, error: verifyOtpError } = await anonClient.auth.verifyOtp({
    type: 'magiclink',
    token_hash: linkData.properties.hashed_token,
    email: authUser.user.email,
  })

  if (verifyOtpError || !verifyData.session) {
    return new Response(JSON.stringify({ error: 'sign_in_failed' }), { status: 500 })
  }

  return new Response(
    JSON.stringify({
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  )
})
