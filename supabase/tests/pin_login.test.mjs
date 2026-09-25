/** Disposable LOCAL ONLY pin-login Edge Function regression.
 * Runs the function as auto-served by the LOCAL edge runtime (part of
 * `supabase start`/`db reset` — nothing is deployed anywhere) and calls it
 * over real HTTP, exactly as a browser would. node
 * supabase/tests/pin_login.test.mjs
 * Optional SUPABASE_CLI/DOCKER_CLI executable paths; requires a fresh local
 * reset first. Keys read directly from CLI status, never logged. PINs used
 * here are throwaway local fixtures, never logged either.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const cli = process.env.SUPABASE_CLI || "supabase";
const status = JSON.parse(
  execFileSync(cli, ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const base = new URL(status.API_URL);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "54321")
  throw Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const anon = status.ANON_KEY,
  service = status.SERVICE_ROLE_KEY,
  mailpit = status.MAILPIT_URL || "http://127.0.0.1:54324";
if (!anon || !service) throw Error("Local CLI status keys missing");

const sql = (text) =>
  execFileSync(
    process.env.DOCKER_CLI || "docker",
    ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();

let passed = 0;
function check(ok, label) {
  if (!ok) throw Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

async function callLogin(employeeCode, pin) {
  const r = await fetch(new URL("/functions/v1/pin-login", base), {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anon, Authorization: `Bearer ${anon}` },
    body: JSON.stringify({ employeeCode, pin }),
  });
  const text = await r.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: r.status, data };
}

// ---------------------------------------------------------------------------
// Fixtures: real auth.users (admin API — the only legitimate use of
// service_role anywhere in this file), profiles, pin_credentials with a
// REAL pgcrypto hash (never a plaintext PIN column).
// ---------------------------------------------------------------------------
const suffix = Date.now();
async function createFixtureUser(code, opts = {}) {
  const email = `pinlogin-${code.toLowerCase()}-${suffix}@pin-test.invalid`;
  const r = await fetch(new URL("/auth/v1/admin/users", base), {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true, password: randomUUID() }),
  });
  const u = await r.json();
  check(r.ok, `Auth creates fixture user ${code}`);
  sql(
    `insert into public.profiles(id,full_name,employee_code,is_active) values ('${u.id}','Pin Test ${code}','${code}',${opts.isActive === false ? "false" : "true"});`,
  );
  if (opts.withPin !== false) {
    const pin = opts.pin ?? "2027";
    sql(
      `insert into public.pin_credentials(user_id,pin_hash) values ('${u.id}', extensions.crypt('${pin}', extensions.gen_salt('bf')));`,
    );
  }
  return { id: u.id, email, code };
}

const active = await createFixtureUser("P001");
const inactive = await createFixtureUser("P002", { isActive: false });
const noPinRow = await createFixtureUser("P003", { withPin: false });

const failedAttempts = (userId) =>
  Number(sql(`select failed_attempts from public.pin_credentials where user_id='${userId}'`));
const lockedUntil = (userId) =>
  sql(`select coalesce(locked_until::text,'') from public.pin_credentials where user_id='${userId}'`);
const auditCount = (userId, action) =>
  Number(sql(`select count(*) from public.audit_logs where action='${action}' and entity_id='${userId}'`));

// =============================================================================
// IDENTITY: employee_code is the login handle; a made-up/legacy id is not.
// =============================================================================
{
  const r = await callLogin(active.code, "2027");
  check(r.status === 200, "correct employeeCode + PIN succeeds");
  check(!!r.data.access_token && !!r.data.refresh_token, "success returns access_token + refresh_token");
}
{
  // legacy_cashier_id-shaped value (a bare small integer, as the old system
  // used) is not a valid employee_code and must not resolve to anyone.
  const r = await callLogin("7", "2027");
  check(r.status === 401 && r.data.error === "invalid_credentials", "a legacy_cashier_id-shaped value is not accepted as a login handle");
}

// =============================================================================
// PIN correctness / format / account state
// =============================================================================
{
  const r = await callLogin(active.code, "0000");
  check(r.status === 401 && r.data.error === "invalid_credentials", "wrong PIN fails generically");
}
{
  const r = await callLogin("NOSUCHCODE", "2027");
  check(r.status === 401 && r.data.error === "invalid_credentials", "wrong employeeCode fails generically, SAME shape as wrong PIN");
}
{
  const r = await callLogin(active.code, "12");
  check(r.status === 400, "server-side PIN format validation: too short rejected before any DB lookup");
}
{
  const r = await callLogin(active.code, "abcdef");
  check(r.status === 400, "server-side PIN format validation: non-numeric rejected");
}
{
  const r = await callLogin(inactive.code, "2027");
  check(r.status === 401 && r.data.error === "invalid_credentials", "inactive user rejected, generic message (no 'this user is disabled' leak)");
}
{
  const r = await callLogin(noPinRow.code, "2027");
  check(r.status === 401 && r.data.error === "invalid_credentials", "a profile with no pin_credentials row at all is rejected generically, same shape");
}

// =============================================================================
// RATE LIMIT / LOCKOUT
// =============================================================================
const lockTarget = await createFixtureUser("P004", { pin: "1357" });
{
  for (let i = 0; i < 4; i++) {
    const r = await callLogin(lockTarget.code, "0000");
    check(r.status === 401, `lockout sequence: failure ${i + 1}/4 rejected`);
  }
  check(failedAttempts(lockTarget.id) === 4, "failed_attempts incremented correctly (4 after 4 failures)");
  check(lockedUntil(lockTarget.id) === "", "not yet locked before the 5th failure");

  const fifth = await callLogin(lockTarget.code, "0000");
  check(fifth.status === 401, "5th failure also rejected (generic)");
  check(failedAttempts(lockTarget.id) === 5, "failed_attempts is exactly 5 after the 5th failure");
  check(lockedUntil(lockTarget.id) !== "", "locked_until is now set");
  check(auditCount(lockTarget.id, "pin_lockout") === 1, "exactly ONE lockout audit row after the 5th failure");

  const correctWhileLocked = await callLogin(lockTarget.code, "1357");
  check(correctWhileLocked.status === 401, "correct PIN while locked is STILL rejected");
  check(auditCount(lockTarget.id, "pin_lockout") === 1, "no audit flooding: still exactly one lockout row after a 6th attempt (correct or not)");

  const sixthWrong = await callLogin(lockTarget.code, "0000");
  check(sixthWrong.status === 401, "a 7th failed attempt while locked is also rejected");
  check(auditCount(lockTarget.id, "pin_lockout") === 1, "still exactly one lockout audit row — locked accounts do not keep incrementing/re-alerting");
}

// Concurrent failures on a fresh user: fire 5 wrong attempts in parallel and
// confirm the row lock (`select ... for update` in verify_pin) serializes
// them correctly — no lost updates, exactly 5 recorded, exactly one lockout.
const concurrentTarget = await createFixtureUser("P005", { pin: "9999" });
{
  const results = await Promise.all(Array.from({ length: 5 }, () => callLogin(concurrentTarget.code, "0000")));
  check(
    results.every((r) => r.status === 401),
    "5 concurrent wrong-PIN attempts all rejected",
  );
  check(failedAttempts(concurrentTarget.id) === 5, "concurrent failures still land on exactly 5 (no race lost an increment)");
  check(auditCount(concurrentTarget.id, "pin_lockout") === 1, "concurrent failures still produce exactly one lockout audit row, not five");
}

// Successful auth resets failure state.
const resetTarget = await createFixtureUser("P006", { pin: "4242" });
{
  await callLogin(resetTarget.code, "0000");
  await callLogin(resetTarget.code, "0000");
  check(failedAttempts(resetTarget.id) === 2, "two failures recorded before the reset check");
  const ok = await callLogin(resetTarget.code, "4242");
  check(ok.status === 200, "correct PIN succeeds after 2 (sub-lockout) failures");
  check(failedAttempts(resetTarget.id) === 0, "a successful login resets failed_attempts to 0");
  check(lockedUntil(resetTarget.id) === "", "a successful login clears locked_until (already null here, confirms it stays that way)");
}

// =============================================================================
// SESSION ISSUANCE
// =============================================================================
{
  const login = await callLogin(active.code, "2027");
  check(login.status === 200, "fixture: active user logs in for the session checks below");
  const { access_token, refresh_token } = login.data;

  const whoami = await fetch(new URL("/auth/v1/user", base), {
    headers: { apikey: anon, Authorization: `Bearer ${access_token}` },
  });
  const who = await whoami.json();
  check(whoami.ok && who.id === active.id, "the access_token resolves to the correct user via /auth/v1/user (auth.uid() would match)");

  // Session restore in a fresh client == presenting the same access_token to
  // a brand-new, stateless request; already exactly what /auth/v1/user above
  // does. Also prove a plain DB read authorizes under this token, matching
  // what auth.uid() sees inside RLS.
  const ownProfile = await fetch(new URL(`/rest/v1/profiles?select=id&id=eq.${active.id}`, base), {
    headers: { apikey: anon, Authorization: `Bearer ${access_token}` },
  });
  const rows = await ownProfile.json();
  check(ownProfile.ok && rows.length === 1 && rows[0].id === active.id, "the access_token also authorizes a real PostgREST read as that user (fresh client, session genuinely restored)");

  const refreshed = await fetch(new URL("/auth/v1/token?grant_type=refresh_token", base), {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token }),
  });
  const refreshedData = await refreshed.json();
  check(refreshed.ok && !!refreshedData.access_token && !!refreshedData.refresh_token, "the refresh_token flow works and issues a new access/refresh pair");
}

// =============================================================================
// SECURITY
// =============================================================================
{
  const tableCheck = sql(
    `select count(*) from information_schema.tables where table_schema='public' and table_name='service_credentials'`,
  );
  check(tableCheck === "0", "no service_credentials table exists anywhere in the schema (design was rejected, never reintroduced)");
}
{
  const login = await callLogin(active.code, "2027");
  const keys = Object.keys(login.data).sort();
  check(
    keys.length === 2 && keys[0] === "access_token" && keys[1] === "refresh_token",
    "success response contains ONLY access_token and refresh_token — no token_hash, no user object, no secret, no service key",
  );
}
{
  // The PIN hash itself must never be reachable by anon/authenticated via
  // PostgREST, only by the SECURITY DEFINER verify_pin RPC used internally.
  const r = await fetch(new URL("/rest/v1/pin_credentials?select=*", base), {
    headers: { apikey: anon, Authorization: `Bearer ${anon}` },
  });
  const body = await r.json();
  check(
    (Array.isArray(body) && body.length === 0) || r.status === 401 || r.status === 404,
    "pin_credentials (hash, failed_attempts, lockout state) is not readable via PostgREST at all",
  );
}
{
  // generateLink/verifyOtp must not dispatch any email — confirmed by
  // reading the local mail catcher (Mailpit) before/after a real login,
  // not just by reading the source comment.
  const before = await fetch(new URL(`/api/v1/messages?query=${encodeURIComponent(`to:${active.email}`)}`, mailpit)).then((r) => r.json());
  await callLogin(active.code, "2027");
  const after = await fetch(new URL(`/api/v1/messages?query=${encodeURIComponent(`to:${active.email}`)}`, mailpit)).then((r) => r.json());
  check((before.messages_count ?? before.total ?? 0) === (after.messages_count ?? after.total ?? 0), "no email was sent to the user's mailbox by a successful PIN login (generateLink/verifyOtp design confirmed, not just read from the source)");
}
{
  const r = await callLogin(active.code, "0000");
  const body = JSON.stringify(r.data);
  check(
    !/service_role|token_hash|pin_hash/i.test(body),
    "a failure response never leaks a service key, token_hash, or the pin hash",
  );
}

console.log(`LOCAL PIN-LOGIN EDGE FUNCTION PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`);
