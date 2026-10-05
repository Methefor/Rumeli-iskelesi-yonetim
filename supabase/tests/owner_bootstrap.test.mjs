/**
 * LOCAL ONLY test of identity-data/bootstrap-owner.mjs (fresh reset first):
 *   node supabase/tests/owner_bootstrap.test.mjs
 * Never contacts a hosted project: every hosted-target case is refused before any
 * network call. The PIN used here is random and is asserted never to be printed.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomInt } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { bootstrapOwner } from "../../identity-data/bootstrap-owner.mjs";

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
const sql = (t) =>
  execFileSync(process.env.DOCKER_CLI || "docker", ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: t, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
let passed = 0;
const check = (ok, label) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
};
const URL_LOCAL = base.toString().replace(/\/$/, "");
const cli = (args, { input, env = {} } = {}) =>
  spawnSync(process.execPath, [path.join(root, "identity-data/bootstrap-owner.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    input,
    env: { ...process.env, TARGET_SUPABASE_URL: URL_LOCAL, TARGET_SUPABASE_SERVICE_ROLE_KEY: service, ...env },
  });
const counts = () => sql("select (select count(*) from public.profiles)||','||(select count(*) from auth.users)||','||(select count(*) from public.user_roles)||','||(select count(*) from public.pin_credentials)||','||(select count(*) from public.audit_logs)");
const PIN = String(randomInt(100000, 999999));
const COMMON = ["--target-ref=local", '--full-name=Bootstrap Test Owner'];

const before = counts();
check(before.startsWith("0,0,0,0,"), "fresh database has no identity");

// ---------------------------------------------------------------- refusals --
const dry = cli(COMMON);
check(dry.status === 0 && JSON.parse(dry.stdout).written === false && counts() === before, "dry run writes nothing and reads no PIN");
const noRef = cli(["--full-name=X"]);
check(noRef.status === 3 && /target_ref_required/.test(noRef.stderr), "missing --target-ref is rejected");
const wrongRef = cli(["--target-ref=iwikwbjsznjuefvuemdb", '--full-name=X']);
check(wrongRef.status === 3 && /target_ref_mismatch/.test(wrongRef.stderr), "a local URL with a production ref is rejected");
const wrongProject = cli(["--target-ref=abcdefghijklmnopqrst", "--allow-hosted-target", '--full-name=X'], { env: { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co" } });
check(wrongProject.status === 3 && /target_ref_mismatch/.test(wrongProject.stderr), "a target ref that does not match the URL (wrong project) is rejected");
const otherProject = cli(["--target-ref=abcdefghijklmnopqrst", "--allow-hosted-target", '--full-name=X'], { env: { TARGET_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" } });
check(otherProject.status === 3 && /target_ref_not_approved/.test(otherProject.stderr), "a hosted project other than the approved production ref is rejected");
const anonKey = cli(COMMON, { env: { TARGET_SUPABASE_SERVICE_ROLE_KEY: anon } });
check(anonKey.status === 3 && /service_key_wrong_role/.test(anonKey.stderr), "an anon key is rejected");
const prodNoFlags = cli(["--target-ref=iwikwbjsznjuefvuemdb", '--full-name=X', "--apply"], { env: { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co" } });
check(prodNoFlags.status === 3 && /hosted_target_refused/.test(prodNoFlags.stderr), "hosted apply without --allow-hosted-target is rejected before any network call");
const prodNoApply = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--allow-hosted-target", '--full-name=X', "--apply"], { env: { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co" } });
check(prodNoApply.status === 3 && /hosted_apply_refused/.test(prodNoApply.stderr), "hosted apply without --allow-hosted-apply is rejected");
const prodNoPhrase = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--allow-hosted-target", "--allow-hosted-apply", '--full-name=X', "--apply"], { env: { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co", OWNER_BOOTSTRAP_APPROVAL: "approve-owner-bootstrap:wrong:M001" } });
check(prodNoPhrase.status === 3 && /owner_approval_missing/.test(prodNoPhrase.stderr), "hosted apply without the run-specific owner phrase is rejected");

// M001 collision (another identity already holds the code, not an owner)
sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','decoy@x.invalid','x',now(),now(),now(),'{}','{}'); insert into public.profiles(id,full_name,employee_code) values ('00000000-0000-0000-0000-0000000000b1','Decoy','M001');`);
const collisionBefore = counts();
const collision = cli([...COMMON, "--apply", "--pin-stdin"], { input: `${PIN}\n` });
check(collision.status === 3 && /code_conflict/.test(collision.stderr) && counts() === collisionBefore, "an M001 collision with another identity is rejected and creates nothing");
sql("delete from public.profiles where employee_code='M001'; delete from auth.users where email='decoy@x.invalid';");

// an owner already exists
sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-000000000000','authenticated','authenticated','decoyowner@x.invalid','x',now(),now(),now(),'{}','{}'); insert into public.profiles(id,full_name,employee_code) values ('00000000-0000-0000-0000-0000000000b2','Decoy owner','M777'); insert into public.user_roles(user_id,role_id) select '00000000-0000-0000-0000-0000000000b2', id from public.roles where key='owner';`);
const ownerBefore = counts();
const ownerExists = cli([...COMMON, "--apply", "--pin-stdin"], { input: `${PIN}\n` });
check(ownerExists.status === 3 && /owner_exists/.test(ownerExists.stderr) && counts() === ownerBefore, "bootstrap is refused when any owner already exists");
sql("delete from public.user_roles where user_id='00000000-0000-0000-0000-0000000000b2'; delete from public.profiles where employee_code='M777'; delete from auth.users where email='decoyowner@x.invalid';");
check(counts() === before, "decoys removed: identity tables are empty again");

// ------------------------------------------- partial failure is compensated --
{
  const stub = (url, init) => {
    if (String(url).includes("/rpc/internal_bootstrap_owner")) {
      const body = JSON.parse(init.body);
      init = { ...init, body: JSON.stringify({ ...body, p_reason: "x" }) }; // DB rejects: reason too short
    }
    return fetch(url, init);
  };
  let message = "";
  try {
    await bootstrapOwner({ argv: [...COMMON, "--apply"], env: { TARGET_SUPABASE_URL: URL_LOCAL, TARGET_SUPABASE_SERVICE_ROLE_KEY: service }, fetchImpl: stub, readPin: async () => PIN });
  } catch (e) {
    message = String(e.message);
  }
  check(/bootstrap_refused|refused the bootstrap/.test(message) && !message.includes(PIN), "a failing database step is reported without echoing the PIN");
  check(counts() === before, "no half-provisioned identity: the Auth user created for the failed attempt was removed");
}
const badPin = cli([...COMMON, "--apply", "--pin-stdin"], { input: "12ab\n" });
check(badPin.status === 3 && /pin_invalid/.test(badPin.stderr) && counts() === before, "an invalid PIN is rejected before anything is created");
const noTty = cli([...COMMON, "--apply"]);
check(noTty.status === 3 && /pin_input_refused/.test(noTty.stderr) && counts() === before, "without a terminal or --pin-stdin the PIN cannot be supplied (never from argv/env)");

// ---------------------------------------------------------------- success ---
const ok = cli([...COMMON, "--apply", "--pin-stdin"], { input: `${PIN}\n` });
check(ok.status === 0 && JSON.parse(ok.stdout).written === true, "local bootstrap succeeds");
const leak = `${ok.stdout}\n${ok.stderr}\n${dry.stdout}${dry.stderr}${collision.stderr}${ownerExists.stderr}`;
check(!leak.includes(PIN) && !/\$2[aby]\$/.test(leak) && !leak.includes(service), "the PIN, its hash and the service key never appear in stdout/stderr");
check(sql("select count(*) from public.profiles where employee_code='M001' and is_active") === "1" && sql("select count(*) from public.user_roles ur join public.roles r on r.id=ur.role_id where r.key='owner'") === "1", "exactly one active M001 owner exists");
check(sql("select count(*) from public.user_roles") === "1" && sql("select count(*) from public.branch_memberships") === "0", "the owner has only the owner role and no branch membership (organization-wide)");
check(sql("select count(*) from public.pin_credentials pc join public.profiles p on p.id=pc.user_id where p.employee_code='M001' and pc.pin_hash like '$2%'") === "1", "a bcrypt PIN credential exists for the owner");
check(sql("select count(*) from public.audit_logs where action='owner_bootstrap' and actor_user_id=entity_id::uuid") === "1", "one audit row records the bootstrap with the new owner as actor and subject");
const afterOk = counts();
const again = cli([...COMMON, "--apply", "--pin-stdin"], { input: `${PIN}\n` });
check(again.status === 3 && /owner_exists/.test(again.stderr) && counts() === afterOk, "a second invocation is rejected and changes nothing");

// the database function itself is closed to everyone but service_role and closes after the first owner
for (const [who, key] of [["anon", anon]]) {
  const r = await fetch(new URL("/rest/v1/rpc/internal_bootstrap_owner", base), { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000001", p_employee_code: "M002", p_full_name: "x", p_pin: "123456", p_reason: "attack" }) });
  check(!r.ok, `${who} cannot call the bootstrap function`);
}
const svc = await fetch(new URL("/rest/v1/rpc/internal_bootstrap_owner", base), { method: "POST", headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_user_id: "00000000-0000-0000-0000-000000000001", p_employee_code: "M002", p_full_name: "x", p_pin: "123456", p_reason: "attack attempt" }) });
check(!svc.ok && /owner already exists/.test(await svc.text()), "even the service role cannot bootstrap a second owner through the database function");

// ------------------------------------- the new owner uses the normal flows ---
const login = await fetch(new URL("/functions/v1/pin-login", base), { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "M001", pin: PIN }) });
const session = await login.json();
check(login.status === 200 && !!session.access_token, "the bootstrapped owner signs in through the normal PIN login");
const wrong = await fetch(new URL("/functions/v1/pin-login", base), { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ employeeCode: "M001", pin: PIN === "000000" ? "111111" : "000000" }) });
check(wrong.status === 401, "a wrong PIN is still refused");
const dondurma = sql("select id from public.branches where key='iskele_dondurma'");
const prov = await fetch(new URL("/functions/v1/employee-provision", base), {
  method: "POST",
  headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ employeeCode: "D901", fullName: "Provision Probe", pin: String(randomInt(1000, 9999)), roleKey: "cashier", branchIds: [dondurma], reason: "bootstrap flow probe" }),
});
check(prov.status === 201, "the new owner provisions an employee through the normal management flow");
check(sql("select count(*) from public.profiles where employee_code='D901' and is_active") === "1", "the provisioned cashier exists and is active");

console.log(`\nOWNER BOOTSTRAP PASSED: ${passed} assertions. Reset the local database now.`);
