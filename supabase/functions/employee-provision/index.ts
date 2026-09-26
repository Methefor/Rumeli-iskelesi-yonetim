// =============================================================================
// employee-provision Edge Function (Stage 2)
// =============================================================================
// STATUS: NOT DEPLOYED anywhere. Runs only on the local edge runtime.
//
// The ONLY place an employee is created. The service-role key exists solely in
// this function's runtime environment (a Supabase-provided secret) — never in
// the browser or any VITE_* variable.
//
// Trust model:
//   * The caller's identity comes from their JWT, verified server-side with
//     auth.getUser(token). Nothing about role, actor or branch scope is taken
//     from the request body.
//   * The caller's CURRENT authority is read from the database
//     (internal_actor_rank / internal_provision_employee re-check active flag,
//     rank, role hierarchy and branch scope inside one transaction).
//
// Flow: verify JWT -> cheap authority pre-check -> create auth user (random
// password nobody knows; login is PIN-only via pin-login, no email is sent) ->
// one transactional DB call creates profile + PIN hash + role + branches +
// audit row. If that call fails the auth user is deleted; if the delete also
// fails the response says cleanup is pending (an auth user with no profile
// cannot log in, so the state is safe and recoverable).
//
// Responses never contain the PIN, tokens, keys or backend error text.
// =============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2'

interface ProvisionRequest {
  employeeCode: string
  fullName: string
  pin: string
  roleKey: string
  branchIds: string[]
  reason: string
}

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const CODE = /^[A-Z][0-9]{2,4}$/
const PIN = /^\d{4,6}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return json({ error: 'unauthorized' }, 401)

  let body: ProvisionRequest
  try {
    body = await req.json()
  } catch {
    return json({ error: 'invalid_request' }, 400)
  }
  const code = String(body.employeeCode ?? '').trim().toUpperCase()
  const fullName = String(body.fullName ?? '').trim()
  const reason = String(body.reason ?? '').trim()
  const branchIds = Array.isArray(body.branchIds) ? body.branchIds : []
  if (
    !CODE.test(code) ||
    !PIN.test(String(body.pin ?? '')) ||
    !fullName ||
    fullName.length > 100 ||
    !reason ||
    typeof body.roleKey !== 'string' ||
    !branchIds.every((b) => typeof b === 'string' && UUID.test(b)) ||
    branchIds.length > 10
  ) {
    return json({ error: 'invalid_request' }, 400)
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )

  // 1. Who is calling? (JWT verified by the auth server, not decoded by us.)
  const { data: caller, error: callerError } = await admin.auth.getUser(token)
  if (callerError || !caller.user) return json({ error: 'unauthorized' }, 401)
  const actorId = caller.user.id

  // 2. Authority pre-check from the database (active + rank), so an
  //    unauthorized caller never creates anything.
  const { data: rank, error: rankError } = await admin.rpc('internal_actor_rank', {
    p_actor: actorId,
  })
  if (rankError) return json({ error: 'provision_failed', cleanup: 'not_needed' }, 500)
  if (typeof rank !== 'number' || rank < 2) return json({ error: 'forbidden' }, 403)

  // 3. Auth identity. The password is random and discarded: it is never
  //    stored, returned or logged; sign-in is PIN-only through pin-login.
  const email = `${code.toLowerCase()}-${crypto.randomUUID().slice(0, 8)}@employees.invalid`
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID() + crypto.randomUUID(),
  })
  if (createError || !created.user) {
    return json({ error: 'provision_failed', cleanup: 'not_needed' }, 500)
  }
  const newUserId = created.user.id

  // 4. Everything else in ONE database transaction.
  const { error: dbError } = await admin.rpc('internal_provision_employee', {
    p_actor: actorId,
    p_user_id: newUserId,
    p_employee_code: code,
    p_full_name: fullName,
    p_pin: body.pin,
    p_role_key: body.roleKey,
    p_branch_ids: branchIds,
    p_reason: reason,
  })

  if (dbError) {
    // Compensate: remove the auth user so no orphan identity is left.
    const { error: cleanupError } = await admin.auth.admin.deleteUser(newUserId)
    const cleanup = cleanupError ? 'pending' : 'done'
    if (dbError.code === '23505') return json({ error: 'code_taken', cleanup }, 409)
    if (dbError.code === '42501') return json({ error: 'forbidden', cleanup }, 403)
    if (dbError.code === '22023') return json({ error: 'invalid_request', cleanup }, 400)
    return json({ error: 'provision_failed', cleanup }, 500)
  }

  return json({ userId: newUserId, employeeCode: code }, 201)
})
