/** Disposable LOCAL ONLY management-center regression over real HTTP:
 * employee-provision Edge Function, management RPCs through PostgREST with
 * real JWTs, and the server-side block of a deactivated user's old JWT.
 * node supabase/tests/management_center.test.mjs   (fresh local reset first)
 * Refuses anything but http://127.0.0.1:54321. Never prints keys.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
let statusOutput;
if (process.env.SUPABASE_CLI) {
  statusOutput = execFileSync(process.env.SUPABASE_CLI, ["status", "-o", "json"], commandOptions);
} else if (process.platform === "win32") {
  statusOutput = execFileSync(
    process.env.ComSpec || "cmd.exe",
    ["/d", "/s", "/c", "npx supabase status -o json"],
    commandOptions,
  );
} else {
  statusOutput = execFileSync("npx", ["supabase", "status", "-o", "json"], commandOptions);
}
const status = JSON.parse(statusOutput);
const base = new URL(status.API_URL);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "54321")
  throw Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY;

const sql = (t) =>
  execFileSync(process.env.DOCKER_CLI || "docker", ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: t, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

let passed = 0;
const check = (ok, label) => { if (!ok) throw Error(`FAIL ${label}`); passed++; console.log(`PASS ${label}`); };

async function req(path, { token = anon, method = "GET", body, admin = false, raw = false } = {}) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: { apikey: admin ? service : anon, Authorization: `Bearer ${token}`, "Content-Type": raw ? "application/octet-stream" : "application/json" },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
const rpc = (token, name, args) => req(`/rest/v1/rpc/${name}`, { token, method: "POST", body: args });
const provision = (token, body) => req("/functions/v1/employee-provision", { token, method: "POST", body });
const pinLogin = (code, pin) => req("/functions/v1/pin-login", { method: "POST", body: { employeeCode: code, pin } });

const suffix = Date.now();
const branchDondurma = sql("select id from public.branches where key='iskele_dondurma'");
const branchRumeli = sql("select id from public.branches where key='rumeli_iskelesi'");
const users = {};
async function makeUser(role, code, branches, extra = {}) {
  const email = `mc-${code.toLowerCase()}-${suffix}@mgmt-test.invalid`, password = `Local-${randomUUID()}!`;
  const u = (await req("/auth/v1/admin/users", { token: service, method: "POST", admin: true, body: { email, password, email_confirm: true } })).data;
  sql(`insert into public.profiles(id,full_name,employee_code) values ('${u.id}','MC ${code}','${code}'); insert into public.user_roles(user_id,role_id) select '${u.id}',id from public.roles where key='${role}'; ` +
    branches.map((b) => `insert into public.branch_memberships(user_id,branch_id) values ('${u.id}','${b}');`).join("") +
    `insert into public.pin_credentials(user_id,pin_hash) values ('${u.id}', extensions.crypt('${extra.pin ?? "2027"}', extensions.gen_salt('bf')));`);
  const login = (await req("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } })).data;
  users[code] = { id: u.id, token: login.access_token, refresh: login.refresh_token, email, password };
  return users[code];
}
await makeUser("owner", "M901", []);
await makeUser("manager", "M902", []);
await makeUser("branch_manager", "M903", [branchDondurma]);
await makeUser("cashier", "M904", [branchDondurma]);
await makeUser("employee", "M905", [branchDondurma]);
await makeUser("cashier", "M906", [branchDondurma]); // the user we will deactivate
await makeUser("employee", "M907", [branchRumeli]);
check(true, "fixtures: six fake identities with real JWTs");

const good = { employeeCode: "N001", fullName: "Yeni Kasiyer", pin: "6543", roleKey: "cashier", branchIds: [branchDondurma], reason: "new hire" };
const authUsersWithPrefix = (code) => Number(sql(`select count(*) from auth.users where email like '${code.toLowerCase()}-%@employees.invalid'`));

// --- Edge Function: authentication and authorization ------------------------
{
  const r = await provision(anon, good);
  check(r.status === 401, "no user JWT (anon key only) -> 401");
  const bad = await provision("not-a-jwt", good);
  check(bad.status === 401, "garbage token -> 401");
  for (const code of ["M904", "M905"]) {
    const denied = await provision(users[code].token, good);
    check(denied.status === 403, `${code} (cashier/employee) is forbidden from provisioning`);
  }
  check(authUsersWithPrefix("N001") === 0, "forbidden callers created no auth user at all (pre-check)");
}

// --- Edge Function: success and hierarchy ------------------------------------
let newUser;
{
  const r = await provision(users.M902.token, good);
  check(r.status === 201 && !!r.data.userId && r.data.employeeCode === "N001", "manager provisions a cashier");
  newUser = r.data.userId;
  check(Object.keys(r.data).sort().join() === "employeeCode,userId", "response contains only userId + employeeCode (no PIN, token, key)");
  check(!JSON.stringify(r.data).includes("6543"), "response never echoes the PIN");
  check(authUsersWithPrefix("N001") === 1, "exactly one auth user exists for the new code");
  const login = await pinLogin("N001", "6543");
  check(login.status === 200 && !!login.data.access_token, "the new employee logs in through pin-login with the temporary PIN");
  const me = await req(`/rest/v1/profiles?select=full_name,is_active&id=eq.${newUser}`, { token: login.data.access_token });
  check(me.ok && me.data[0]?.full_name === "Yeni Kasiyer" && me.data[0]?.is_active === true, "new session reads its own profile");
  const audit = await req("/rest/v1/audit_logs?select=actor_user_id,reason,new_values&action=eq.employee_create&entity_id=eq." + newUser, { token: users.M901.token });
  check(audit.ok && audit.data.length === 1 && audit.data[0].actor_user_id === users.M902.id && audit.data[0].reason === "new hire", "owner sees the employee_create audit row with the VERIFIED actor + reason");
  check(!JSON.stringify(audit.data).includes("6543"), "audit row contains no PIN");
}
{
  const r = await provision(users.M902.token, { ...good, employeeCode: "N002", roleKey: "manager", branchIds: [] });
  check(r.status === 403, "manager cannot provision a manager");
  const o = await provision(users.M902.token, { ...good, employeeCode: "N002", roleKey: "owner", branchIds: [] });
  check(o.status === 403, "manager cannot provision an owner (client-chosen role is not trusted)");
  check(authUsersWithPrefix("N002") === 0, "denied hierarchy attempts left no orphan auth user (compensation ran)");
  const spoof = await provision(users.M905.token, { ...good, employeeCode: "N003", actorId: users.M901.id, actor: "M901", roleKey: "employee" });
  check(spoof.status === 403, "body-supplied actor/role fields cannot impersonate an owner");
  const bmOwn = await provision(users.M903.token, { ...good, employeeCode: "N004", roleKey: "employee" });
  check(bmOwn.status === 201, "branch_manager provisions an employee into their own branch");
  const bmCross = await provision(users.M903.token, { ...good, employeeCode: "N005", branchIds: [branchRumeli] });
  check(bmCross.status === 403, "branch_manager cannot provision into another branch");
  const bmRole = await provision(users.M903.token, { ...good, employeeCode: "N006", roleKey: "branch_manager" });
  check(bmRole.status === 403, "branch_manager cannot provision a branch_manager");
  const ownerMgr = await provision(users.M901.token, { ...good, employeeCode: "N007", roleKey: "manager", branchIds: [] });
  check(ownerMgr.status === 201, "owner provisions a manager");
  const ownerOwner = await provision(users.M901.token, { ...good, employeeCode: "N011", roleKey: "owner", branchIds: [] });
  check(ownerOwner.status === 403, "owner cannot provision another owner (actor must outrank the granted role)");
  check(authUsersWithPrefix("N011") === 0, "denied owner provisioning left no orphan auth user");
}

// --- Edge Function: validation and partial-failure handling ------------------
{
  const dup = await provision(users.M902.token, good);
  check(dup.status === 409 && dup.data.error === "code_taken" && dup.data.cleanup === "done", "duplicate code -> 409, and the auth user created for it was cleaned up");
  check(authUsersWithPrefix("N001") === 1, "still exactly one auth user for N001 after the duplicate attempt");
  const badPin = await provision(users.M902.token, { ...good, employeeCode: "N008", pin: "12" });
  check(badPin.status === 400 && authUsersWithPrefix("N008") === 0, "bad PIN -> 400, nothing created");
  const noReason = await provision(users.M902.token, { ...good, employeeCode: "N009", reason: "  " });
  check(noReason.status === 400 && authUsersWithPrefix("N009") === 0, "missing reason -> 400, nothing created");
  const fakeBranch = await provision(users.M902.token, { ...good, employeeCode: "N010", branchIds: [randomUUID()] });
  check(fakeBranch.status === 400 && fakeBranch.data.cleanup === "done", "DB-stage failure (unknown branch) -> 400 with cleanup done");
  check(authUsersWithPrefix("N010") === 0, "no orphan auth user after a mid-flow database failure");
  check(Number(sql("select count(*) from public.profiles where employee_code='N010'")) === 0, "no half-created profile after the failure (single transaction)");
  const text = JSON.stringify([dup.data, badPin.data, fakeBranch.data]);
  check(!/service_role|password|stack|postgres|violates/i.test(text), "error bodies carry no backend detail or secret");
}

// --- PIN reset invalidates the old PIN ---------------------------------------
{
  const before = await pinLogin("M905", "2027");
  check(before.status === 200, "before reset: employee logs in with the old PIN");
  const r = await rpc(users.M903.token, "admin_reset_pin", { p_user_id: users.M905.id, p_new_pin: "7788", p_reason: "forgot" });
  check(r.ok, "branch_manager resets the PIN of an own-branch employee via the RPC");
  check((await pinLogin("M905", "2027")).status === 401, "the OLD PIN is rejected after the reset");
  check((await pinLogin("M905", "7788")).status === 200, "the NEW PIN works");
  const cross = await rpc(users.M903.token, "admin_reset_pin", { p_user_id: users.M907.id, p_new_pin: "7788", p_reason: "x" });
  check(!cross.ok && cross.data?.code === "42501", "branch_manager cannot reset a PIN across branches");
  const up = await rpc(users.M903.token, "admin_reset_pin", { p_user_id: users.M902.id, p_new_pin: "7788", p_reason: "takeover" });
  check(!up.ok && up.data?.code === "42501", "branch_manager cannot take over a manager account");
  const self = await rpc(users.M902.token, "admin_reset_pin", { p_user_id: users.M902.id, p_new_pin: "7788", p_reason: "x" });
  check(!self.ok && self.data?.code === "42501", "a manager cannot reset their own PIN through the admin RPC");
}

// --- Deactivation: old JWT is dead server-side --------------------------------
{
  const victim = users.M906;
  const canRead = await req(`/rest/v1/profiles?select=id&id=eq.${victim.id}`, { token: victim.token });
  check(canRead.ok, "before: the cashier's JWT works");
  const deactivate = await rpc(users.M902.token, "admin_set_employee_active", { p_user_id: victim.id, p_is_active: false, p_reason: "left the company" });
  check(deactivate.ok, "manager deactivates the cashier");

  const tables = await req("/rest/v1/inventory_items?select=id", { token: victim.token });
  check(!tables.ok, "OLD JWT: a Data API table read is refused (pre-request hook)");
  const own = await req(`/rest/v1/profiles?select=id&id=eq.${victim.id}`, { token: victim.token });
  check(!own.ok, "OLD JWT: even the user's own profile read is refused");
  const call = await rpc(victim.token, "record_inventory_waste", { p_branch_id: branchDondurma, p_items: [], p_reason_code: "other" });
  check(!call.ok, "OLD JWT: a write RPC is refused");
  const direct = await rpc(victim.token, "create_sales_report", { p_shift_id: randomUUID(), p_register_id: null, p_report_type: "X", p_gross_revenue: 1, p_transaction_count: null, p_average_basket: null, p_notes: null, p_items: [] });
  check(!direct.ok && (direct.data?.code === "42501"), "OLD JWT: an RPC that reads auth.uid() directly is refused with 42501, not a business error");
  const refresh = await req("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: victim.refresh } });
  check(!refresh.ok, "the REFRESH token no longer works (sessions deleted / user banned)");
  const relogin = await req("/auth/v1/token?grant_type=password", { method: "POST", body: { email: victim.email, password: victim.password } });
  check(!relogin.ok, "a fresh password sign-in is refused (auth user banned)");
  check((await pinLogin("M906", "2027")).status === 401, "pin-login still rejects the inactive user, generically");
  const avatar = await fetch(new URL(`/storage/v1/object/avatars-v4/${victim.id}/avatar.png`, base), {
    method: "POST", headers: { apikey: anon, Authorization: `Bearer ${victim.token}`, "Content-Type": "image/png" }, body: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
  });
  check(!avatar.ok, "OLD JWT: an avatar upload to the user's own folder is refused (Storage policy checks activity)");

  const react = await rpc(users.M902.token, "admin_set_employee_active", { p_user_id: victim.id, p_is_active: true, p_reason: "returned" });
  check(react.ok, "manager reactivates the cashier");
  check((await pinLogin("M906", "2027")).status === 200, "after reactivation pin-login works again");
  const audit = await req(`/rest/v1/audit_logs?select=action,old_values,new_values,reason,created_at,actor_user_id&entity_id=eq.${victim.id}&action=in.(employee_deactivation,employee_activation)&order=created_at`, { token: users.M901.token });
  check(audit.ok && audit.data.length === 2 && audit.data[0].old_values.is_active === true && audit.data[0].new_values.is_active === false && audit.data[0].reason === "left the company" && audit.data[0].actor_user_id === users.M902.id && !!audit.data[0].created_at, "deactivate/activate audited: actor, server time, reason, before/after");
}

// --- Cashier/employee: every management RPC refused over HTTP -----------------
for (const code of ["M904", "M905"]) {
  const t = users[code].token;
  const calls = [
    ["assign_role", { p_user_id: users.M907.id, p_role_key: "employee", p_reason: "x" }],
    ["revoke_role", { p_user_id: users.M907.id, p_role_key: "employee", p_reason: "x" }],
    ["assign_branch_membership", { p_user_id: users.M907.id, p_branch_id: branchRumeli, p_is_primary: false, p_reason: "x" }],
    ["remove_branch_membership", { p_user_id: users.M907.id, p_branch_id: branchRumeli, p_reason: "x" }],
    ["admin_set_employee_active", { p_user_id: users.M907.id, p_is_active: false, p_reason: "x" }],
    ["admin_set_employee_code", { p_user_id: users.M907.id, p_employee_code: "Z999", p_reason: "x" }],
    ["admin_reset_pin", { p_user_id: users.M907.id, p_new_pin: "1234", p_reason: "x" }],
  ];
  for (const [name, args] of calls) {
    const r = await rpc(t, name, args);
    check(!r.ok && r.data?.code === "42501", `${code} denied ${name}`);
  }
}

// --- The exact employee-list select the Management Center uses -----------------
{
  const select = "id,full_name,employee_code,is_active,user_roles!user_id(roles(key)),branch_memberships!user_id(branch_id)";
  const asManager = await req(`/rest/v1/profiles?select=${encodeURIComponent(select)}&order=full_name.asc`, { token: users.M902.token });
  check(asManager.ok && asManager.data.length >= 7, "manager lists all employees with roles + branches (embed is unambiguous)");
  const row = asManager.data.find((r) => r.employee_code === "M904");
  check(row && row.user_roles[0].roles.key === "cashier" && row.branch_memberships.length === 1, "list rows carry roles and branch memberships");
  const asBm = await req(`/rest/v1/profiles?select=${encodeURIComponent(select)}`, { token: users.M903.token });
  check(asBm.ok && asBm.data.every((r) => r.id === users.M903.id || r.branch_memberships.some((b) => b.branch_id === branchDondurma)), "branch_manager list is limited to themselves and their own branch");
  check(!asBm.data.some((r) => r.employee_code === "M907"), "branch_manager does not see another branch's employee");
  const asCashier = await req(`/rest/v1/profiles?select=${encodeURIComponent(select)}`, { token: users.M904.token });
  check(asCashier.ok && asCashier.data.length === 1 && asCashier.data[0].id === users.M904.id, "a cashier only ever sees their own profile row");
}

// --- Raw table writes are not a bypass ----------------------------------------
{
  const t = users.M901.token; // even an owner
  const a = await req(`/rest/v1/profiles?id=eq.${users.M905.id}`, { token: t, method: "PATCH", body: { is_active: false } });
  check(!a.ok, "raw PATCH profiles.is_active refused for an owner");
  const b = await req("/rest/v1/user_roles", { token: t, method: "POST", body: { user_id: users.M905.id, role_id: randomUUID() } });
  check(!b.ok, "raw POST user_roles refused for an owner");
  const c = await req(`/rest/v1/reconciliation_thresholds?branch_id=eq.${branchDondurma}`, { token: t, method: "PATCH", body: { warning_percentage: 99 } });
  check(!c.ok, "raw PATCH reconciliation_thresholds refused");
  check(Number(sql("select count(*) from public.profiles where id='" + users.M905.id + "' and is_active")) === 1, "and nothing changed");
  const emp = await req("/rest/v1/audit_logs?select=id&action=eq.employee_create", { token: users.M904.token });
  check(emp.ok && emp.data.length === 0, "a cashier cannot read the management audit trail");
}

console.log(`LOCAL MANAGEMENT CENTER HTTP PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`);
