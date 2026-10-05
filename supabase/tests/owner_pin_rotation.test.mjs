/**
 * LOCAL ONLY test of identity-data/rotate-owner-pin.mjs (fresh reset first):
 *   node supabase/tests/owner_pin_rotation.test.mjs
 * Hosted cases are refused before any network call. PINs are random and asserted
 * never to appear in any output or audit row.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const status = JSON.parse(
  process.env.SUPABASE_CLI
    ? execFileSync(process.env.SUPABASE_CLI, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    : execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx supabase status -o json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
const base = new URL(status.API_URL);
if (base.hostname !== "127.0.0.1" || base.port !== "54321") throw new Error("LOCAL ONLY");
const service = status.SERVICE_ROLE_KEY;
const anon = status.ANON_KEY;
const URL_LOCAL = base.toString().replace(/\/$/, "");
const sql = (t) =>
  execFileSync(process.env.DOCKER_CLI || "docker", ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: t, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
let passed = 0;
const check = (ok, label) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
};
const run = (script, args, { input, env = {} } = {}) =>
  spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    env: { ...process.env, TARGET_SUPABASE_URL: URL_LOCAL, TARGET_SUPABASE_SERVICE_ROLE_KEY: service, ...env },
  });
const pinLogin = (code, pin) =>
  fetch(new URL("/functions/v1/pin-login", base), { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: code, pin }) });
const newPin = () => String(randomInt(100000, 999999));

const PIN0 = newPin();
const boot = run("identity-data/bootstrap-owner.mjs", ["--target-ref=local", "--full-name=Rotation Owner", "--apply", "--pin-stdin"], { input: `${PIN0}\n` });
check(boot.status === 0, "owner M001 bootstrapped for the test");
const first = await (await pinLogin("M001", PIN0)).json();
check(!!first.access_token && !!first.refresh_token, "the original PIN signs in");

const snapshot = () => sql(`select (select row_to_json(p)::text from (select id, full_name, employee_code, is_active from public.profiles where employee_code='M001') p) || '|' || (select string_agg(r.key, ',') from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id=(select id from public.profiles where employee_code='M001')) || '|' || (select count(*) from public.branch_memberships) || '|' || (select u.email || u.encrypted_password from auth.users u join public.profiles p on p.id=u.id where p.employee_code='M001')`);
const pinState = () => sql("select pin_hash||failed_attempts||coalesce(locked_until::text,'-') from public.pin_credentials where user_id=(select id from public.profiles where employee_code='M001')");
const auditCount = () => sql("select count(*) from public.audit_logs where action='owner_pin_rotated'");
const base0 = snapshot();
const pin0 = pinState();
const COMMON = ["--target-ref=local", "--reason=Scheduled owner PIN rotation", "--operator-label=test operator"];

// ---------------------------------------------------------------- refusals ---
const dry = run("identity-data/rotate-owner-pin.mjs", COMMON);
check(dry.status === 0 && JSON.parse(dry.stdout).written === false && pinState() === pin0 && auditCount() === "0", "dry run writes nothing and reads no PIN");
const noRef = run("identity-data/rotate-owner-pin.mjs", ["--reason=Scheduled owner PIN rotation"]);
check(noRef.status === 3 && /target_ref_required/.test(noRef.stderr), "missing target ref is rejected");
const wrongRef = run("identity-data/rotate-owner-pin.mjs", ["--target-ref=iwikwbjsznjuefvuemdb", "--reason=Scheduled owner PIN rotation"]);
check(wrongRef.status === 3 && /target_ref_mismatch/.test(wrongRef.stderr), "wrong ref for the target URL is rejected");
const otherProject = run("identity-data/rotate-owner-pin.mjs", ["--target-ref=abcdefghijklmnopqrst", "--allow-hosted-target", "--reason=Scheduled owner PIN rotation"], { env: { TARGET_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" } });
check(otherProject.status === 3 && /target_ref_not_approved/.test(otherProject.stderr), "a hosted project other than production is rejected");
const anonKey = run("identity-data/rotate-owner-pin.mjs", COMMON, { env: { TARGET_SUPABASE_SERVICE_ROLE_KEY: anon } });
check(anonKey.status === 3 && /service_key_wrong_role/.test(anonKey.stderr), "an anon key is rejected");
const PROD = { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co" };
const HP = ["--target-ref=iwikwbjsznjuefvuemdb", "--reason=Scheduled owner PIN rotation", "--apply", "--employee-code=M001"];
const noHostedFlag = run("identity-data/rotate-owner-pin.mjs", HP, { env: PROD });
check(noHostedFlag.status === 3 && /hosted_target_refused/.test(noHostedFlag.stderr), "hosted apply without --allow-hosted-target is rejected (no network)");
const noApplyFlag = run("identity-data/rotate-owner-pin.mjs", [...HP, "--allow-hosted-target"], { env: PROD });
check(noApplyFlag.status === 3 && /hosted_apply_refused/.test(noApplyFlag.stderr), "hosted apply without --allow-hosted-apply is rejected (no network)");
const noPhrase = run("identity-data/rotate-owner-pin.mjs", [...HP, "--allow-hosted-target", "--allow-hosted-apply"], { env: { ...PROD, OWNER_PIN_ROTATION_APPROVAL: "approve-owner-pin-rotation:wrong:M001" } });
check(noPhrase.status === 3 && /owner_approval_missing/.test(noPhrase.stderr), "hosted apply without the run-specific owner phrase is rejected (no network)");
const noCode = run("identity-data/rotate-owner-pin.mjs", ["--target-ref=iwikwbjsznjuefvuemdb", "--reason=Scheduled owner PIN rotation", "--apply", "--allow-hosted-target", "--allow-hosted-apply"], { env: PROD });
check(noCode.status === 3 && /employee_code_required/.test(noCode.stderr), "hosted apply needs an explicit employee code (no network)");
check(pinState() === pin0 && auditCount() === "0", "none of the refusals changed the credential or the audit log");

// non-owner / inactive / banned / ambiguous
sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','cashier-k901@x.invalid','x',now(),now(),now(),'{}','{}'),
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-m902@x.invalid','x',now(),now(),now(),'{}','{}'),
 ('00000000-0000-0000-0000-0000000000d3','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner-m903@x.invalid','x',now(),now(),now(),'{}','{}');
 update auth.users set banned_until = now() + interval '100 years' where id='00000000-0000-0000-0000-0000000000d3';
 insert into public.profiles(id,full_name,employee_code,is_active) values ('00000000-0000-0000-0000-0000000000d1','Cashier','K901',true),('00000000-0000-0000-0000-0000000000d2','Inactive owner','M902',false),('00000000-0000-0000-0000-0000000000d3','Banned owner','M903',true);
 insert into public.user_roles(user_id,role_id) select '00000000-0000-0000-0000-0000000000d1', id from public.roles where key='cashier';
 insert into public.user_roles(user_id,role_id) select u, id from public.roles, (values ('00000000-0000-0000-0000-0000000000d2'::uuid),('00000000-0000-0000-0000-0000000000d3'::uuid)) v(u) where key='owner';
 insert into public.pin_credentials(user_id,pin_hash) select id, extensions.crypt('1234', extensions.gen_salt('bf')) from public.profiles where employee_code in ('K901','M902','M903');`);
const PINX = newPin();
const attempt = (code) => run("identity-data/rotate-owner-pin.mjs", [...COMMON, `--employee-code=${code}`, "--apply", "--pin-stdin"], { input: `${PINX}\n` });
const nonOwner = attempt("K901");
check(nonOwner.status === 3 && /not_an_owner/.test(nonOwner.stderr), "a non-owner target is denied");
const inactive = attempt("M902");
check(inactive.status === 3 && /owner_inactive/.test(inactive.stderr), "an inactive owner is denied");
const banned = attempt("M903");
check(banned.status === 3 && /rotation_refused/.test(banned.stderr), "a banned owner is denied by the database");
const direct = async (code) => {
  const r = await fetch(new URL("/rest/v1/rpc/internal_rotate_owner_pin", base), { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_employee_code: code, p_pin: "123456", p_reason: "direct probe", p_executor_label: "t" }) });
  return { ok: r.ok, text: await r.text() };
};
check(/not an owner/.test((await direct("K901")).text) && /inactive or banned/.test((await direct("M902")).text) && /inactive or banned/.test((await direct("M903")).text), "the database function itself refuses non-owner, inactive and banned targets");
sql("update public.profiles set is_active=true where employee_code='M902'; update auth.users set banned_until=null where id='00000000-0000-0000-0000-0000000000d3';");
const ambiguous = run("identity-data/rotate-owner-pin.mjs", [...COMMON, "--apply", "--pin-stdin"], { input: `${PINX}\n` });
check(ambiguous.status === 3 && /owner_ambiguous/.test(ambiguous.stderr), "several active owners without an explicit code are refused");
sql("delete from public.user_roles where user_id in ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3'); delete from public.profiles where employee_code in ('M902','M903','K901'); delete from auth.users where id in ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000d3');");
check(pinState() === pin0 && auditCount() === "0" && snapshot() === base0, "failed attempts changed nothing");
const noTty = run("identity-data/rotate-owner-pin.mjs", [...COMMON, "--apply"]);
check(noTty.status === 3 && /pin_input_refused/.test(noTty.stderr), "the PIN can only come from a hidden prompt or stdin, never argv/env");

// ---------------------------------------------------------------- success ----
sql("update public.pin_credentials set failed_attempts=4, locked_until=now()+interval '1 hour' where user_id=(select id from public.profiles where employee_code='M001')");
const locked = await pinLogin("M001", PIN0);
check(locked.status !== 200, "the account is locked before rotation (lockout state prepared)");
const PIN1 = newPin();
const rot = run("identity-data/rotate-owner-pin.mjs", [...COMMON, "--apply", "--pin-stdin"], { input: `${PIN1}\n` });
check(rot.status === 0 && JSON.parse(rot.stdout).written === true, "local rotation succeeds (single active owner picked automatically)");
const leaks = `${rot.stdout}${rot.stderr}${dry.stdout}${dry.stderr}${nonOwner.stderr}${banned.stderr}${ambiguous.stderr}`;
check(![PIN0, PIN1, PINX].some((p) => leaks.includes(p)) && !/\$2[aby]\$/.test(leaks) && !leaks.includes(service), "no PIN, hash or key appears in any output");
check(pinState().endsWith("0-") && pinState() !== pin0, "the credential changed and lockout was reset");
check((await pinLogin("M001", PIN0)).status === 401, "the OLD PIN fails afterwards");
const second = await pinLogin("M001", PIN1);
const secondSession = await second.json();
check(second.status === 200 && !!secondSession.access_token, "the NEW PIN signs in through the normal pin-login");
const refresh = async (token) => (await fetch(new URL("/auth/v1/token?grant_type=refresh_token", base), { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: token }) })).status;
check((await refresh(first.refresh_token)) === 200 && (await refresh(secondSession.refresh_token)) === 200, "session refresh behaves normally for old and new sessions (rotation does not touch Auth sessions)");
check(snapshot() === base0, "owner profile, role, memberships and Auth credentials are unchanged");
check(auditCount() === "1", "exactly one owner_pin_rotated audit row exists");
const auditRow = sql("select (actor_user_id is null)||'|'||entity_type||'|'||(entity_id=(select id::text from public.profiles where employee_code='M001'))||'|'||(new_values->>'executed_via')||'|'||(new_values->>'executor_verified')||'|'||reason||'|'||(old_values is null) from public.audit_logs where action='owner_pin_rotated'");
check(auditRow === "true|profiles|true|service_role|false|Scheduled owner PIN rotation|true", "the audit row has actor NULL, the owner as subject, service_role execution and an honest unverified executor label");
check(!sql("select row_to_json(a)::text from public.audit_logs a where action='owner_pin_rotated'").match(new RegExp(`${PIN1}|${PIN0}|\\$2[aby]\\$`)), "the audit row never contains the PIN or a hash");

const PIN2 = newPin();
const rot2 = run("identity-data/rotate-owner-pin.mjs", [...COMMON, "--employee-code=M001", "--apply", "--pin-stdin"], { input: `${PIN2}\n` });
check(rot2.status === 0 && (await pinLogin("M001", PIN2)).status === 200 && (await pinLogin("M001", PIN1)).status === 401, "a second rotation works normally");
check(auditCount() === "2" && snapshot() === base0, "each rotation wrote exactly one audit row and still changed nothing else");

for (const [who, key] of [["anon", anon]]) {
  const r = await fetch(new URL("/rest/v1/rpc/internal_rotate_owner_pin", base), { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_employee_code: "M001", p_pin: "123456", p_reason: "attack attempt" }) });
  check(!r.ok, `${who} cannot call the rotation function`);
}
const ownerJwt = secondSession.access_token;
const asOwner = await fetch(new URL("/rest/v1/rpc/internal_rotate_owner_pin", base), { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${(await (await pinLogin("M001", PIN2)).json()).access_token ?? ownerJwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_employee_code: "M001", p_pin: "123456", p_reason: "attack attempt" }) });
check(!asOwner.ok, "even an authenticated owner cannot call the rotation function (service_role only)");

// Bootstrap exposure review: privileged internal functions are service_role only.
for (const fn of ["internal_bootstrap_owner(uuid,text,text,text,text)", "internal_rotate_owner_pin(text,text,text,text)"]) {
  const acl = sql(`select has_function_privilege('anon','public.${fn}','execute') || ',' || has_function_privilege('authenticated','public.${fn}','execute') || ',' || has_function_privilege('service_role','public.${fn}','execute') || ',' || has_function_privilege('public','public.${fn}','execute')`);
  check(acl === "false,false,true,false", `${fn.split("(")[0]} is executable by service_role only`);
}
const lateBoot = await fetch(new URL("/rest/v1/rpc/internal_bootstrap_owner", base), { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000001", p_employee_code: "M777", p_full_name: "Late Owner", p_pin: "123456", p_reason: "attempt after bootstrap" }) });
check(!lateBoot.ok && sql("select count(*) from public.profiles where employee_code='M777'") === "0", "bootstrap stays closed for good once an owner exists, even for the service role");

console.log(`\nOWNER PIN ROTATION PASSED: ${passed} assertions. Reset the local database now.`);
