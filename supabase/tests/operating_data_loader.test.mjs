/** Disposable LOCAL ONLY test of the operating-data loader and of the full
 * daily operation on the SYNTHETIC test-only catalog.
 *   node supabase/tests/operating_data_loader.test.mjs   (fresh local reset first)
 * Refuses anything but http://127.0.0.1:54321. Never prints keys. The
 * synthetic catalog proves the technical flow only; it is not business data.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { formatReport, runLoader } from "../../operating-data/load.mjs";

const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
const statusOutput = process.env.SUPABASE_CLI
  ? execFileSync(process.env.SUPABASE_CLI, ["status", "-o", "json"], commandOptions)
  : execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx supabase status -o json"], commandOptions);
const status = JSON.parse(statusOutput);
const base = new URL(status.API_URL);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "54321")
  throw Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const anon = status.ANON_KEY, service = status.SERVICE_ROLE_KEY;

const sql = (t) =>
  execFileSync(process.env.DOCKER_CLI || "docker", ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"], { input: t, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();

let passed = 0;
const check = (ok, label) => { if (!ok) throw Error(`FAIL ${label}`); passed++; console.log(`PASS ${label}`); };

async function req(path, { token = anon, method = "GET", body, admin = false } = {}) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: { apikey: admin ? service : anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data; try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { ok: r.ok, status: r.status, data };
}
const rpc = (token, name, args) => req(`/rest/v1/rpc/${name}`, { token, method: "POST", body: args });

// ---- users ---------------------------------------------------------------
const suffix = Date.now();
const users = {};
const branchOf = (key) => sql(`select id from public.branches where key='${key}'`);
const dondurma = branchOf("iskele_dondurma"), rumeli = branchOf("rumeli_iskelesi");
async function makeUser(role, code, branches) {
  const email = `od-${code.toLowerCase()}-${suffix}@operating-data.invalid`, password = `Local-${randomUUID()}!`;
  const u = (await req("/auth/v1/admin/users", { token: service, method: "POST", admin: true, body: { email, password, email_confirm: true } })).data;
  sql(`insert into public.profiles(id,full_name,employee_code) values ('${u.id}','OD ${code}','${code}'); insert into public.user_roles(user_id,role_id) select '${u.id}',id from public.roles where key='${role}';` +
    branches.map((b) => `insert into public.branch_memberships(user_id,branch_id) values ('${u.id}','${b}');`).join(""));
  const login = (await req("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password } })).data;
  users[code] = { id: u.id, token: login.access_token };
}
await makeUser("owner", "P01", []);
await makeUser("manager", "P02", []);
await makeUser("branch_manager", "P03", [dondurma]);
await makeUser("cashier", "P04", [dondurma]);
await makeUser("cashier", "P05", [rumeli]);

const env = { SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SERVICE_ROLE_KEY: service, OPERATING_DATA_ACTOR_CODE: "P01" };
const load = (argv, extraEnv = {}) => runLoader({ argv, env: { ...env, ...extraEnv } });
const counts = () => sql(`select (select count(*) from public.inventory_items)||','||(select count(*) from public.sales_categories)||','||(select count(*) from public.registers)||','||(select count(*) from public.operating_data_provenance)||','||(select count(*) from public.audit_logs)||','||(select count(*) from public.inventory_movements)`);
const shiftDump = () => sql(`select string_agg(key||start_hour||':'||start_minute||'-'||cutoff_hour||':'||cutoff_minute, ',' order by key) from public.shift_definitions sd where branch_id='${rumeli}'`);

const EXP_CREATED = 20, EXP_UPDATED = 6, EXP_UNCHANGED = 25; // confirmed by a real dry run (see docs)
// ---- 1. real dataset: dry run changes nothing ---------------------------------
{
  const before = counts();
  const { report, exitCode } = await load([]);
  check(exitCode === 0 && report.mode === "dry-run" && report.applied === false, "default run is a dry run and reports applied:false");
  check(counts() === before, "dry run changed no data at all (rows, provenance, audit, ledger)");
  check(report.totals.unchanged === EXP_UNCHANGED && report.totals.created === EXP_CREATED && report.totals.updated === EXP_UPDATED,
    "dry run reports the exact owner-approved Rumeli create/update/unchanged plan");
  check(report.totals.skipped === 0, "dry run has no remaining rows awaiting approval in the committed real dataset");
  check(!JSON.stringify(report).includes(service) && !formatReport(report).includes(service), "the report never contains the service-role key");
}

// ---- 2. real apply: owner-approved legacy configuration -----------------------
{
  const shiftsBefore = shiftDump();
  const { report, exitCode } = await load(["--apply"]);
  check(exitCode === 0 && report.applied === true, "apply of the real dataset succeeds");
  check(shiftDump() !== shiftsBefore && shiftDump() === "evening16:0-1:0,morning9:0-17:30",
    "owner-approved Istanbul shift times replace the generic seed");
  check(sql("select string_agg(key||':'||name, ',' order by key) from public.registers where branch_id='" + rumeli + "'") === "ana_kasa:Ana Kasa,iki_kasa:2. Kasa",
    "owner-approved Rumeli registers are created");
  const branchProv = sql("select string_agg(classification||'/'||approval_status, ',') from public.operating_data_provenance where entity_type='branch'");
  check(branchProv === "confirmed/approved,confirmed/approved,confirmed/approved", "branches are recorded as confirmed + approved");
  const approvedShift = sql("select classification||'/'||approval_status from public.operating_data_provenance where entity_key='rumeli_iskelesi/morning'");
  check(approvedShift === "legacy_observed/approved", "the Rumeli morning shift is recorded as legacy-observed and owner-approved");
  check(sql("select count(*) from public.reconciliation_thresholds where warning_percentage=2 and error_percentage=5") === "3",
    "owner-approved 2/5 reconciliation thresholds exist for all three branches");
  check(sql("select count(*) from public.operating_data_provenance where entity_type='waste_reason' and classification='confirmed' and approval_status='approved'") === "6",
    "all six owner-approved waste reasons are recorded as trusted configuration");
  check(sql("select string_agg(key||':'||is_active, ',' order by key) from public.shift_definitions where branch_id='" + dondurma + "'") === "evening:false,morning:false,summer:false,winter:true",
    "Dondurma has only the current winter seasonal shift active");
  check(sql("select key||':'||name from public.registers where branch_id='" + dondurma + "'") === "s900:S900",
    "Dondurma has the owner-confirmed current S900 register");
  check(sql("select string_agg(c.key, ',' order by c.key) from public.sales_category_branches scb join public.sales_categories c on c.id=scb.category_id where scb.branch_id='" + dondurma + "'") === "dondurma,su",
    "Dondurma reports exactly dondurma and su");
  check(sql("select count(*) from public.sales_category_branches scb join public.sales_categories c on c.id=scb.category_id where scb.branch_id='" + dondurma + "' and c.key in ('sicak_icecek','soguk_icecek')") === "0",
    "Dondurma no longer has sicak_icecek or soguk_icecek");
  check(sql("select count(*) from public.sales_categories where key in ('sicak_icecek','soguk_icecek','su') and is_active") === "3",
    "the global Sicak/Soguk Icecek categories still exist (and su was added)");
  check(sql("select count(*) from public.operating_data_provenance where entity_type='category_branch' and entity_key like 'iskele_dondurma/%' and classification='confirmed' and approval_status='approved'") === "2",
    "the two Dondurma mappings are confirmed + approved");
  check(sql("select count(*) from public.operating_data_provenance where entity_type='category_branch' and entity_key in ('iskele_dondurma/sicak_icecek','iskele_dondurma/soguk_icecek')") === "0",
    "provenance of the removed mappings is gone");
  check(sql("select count(*) from public.operating_data_provenance where entity_type='category_branch_removal' and classification='confirmed' and approval_status='approved' and note like '%Dondurma + Su%'") === "2",
    "removal provenance is recorded (confirmed, approved, with the reason)");
  check(sql("select count(*) from public.audit_logs a join public.profiles p on p.id=a.actor_user_id where a.action='operating_data_mapping_removal' and p.employee_code='P01' and a.entity_type='sales_category_branches' and a.reason like '%Dondurma + Su%' and a.old_values ->> 'branch'='iskele_dondurma' and a.old_values ->> 'category' in ('sicak_icecek','soguk_icecek') and a.created_at > now() - interval '1 hour'") === "2",
    "each removal is audited with actor, branch, category, reason and server time");
  check(sql("select count(*) from public.sales_category_branches where branch_id='" + rumeli + "'") === "10" && sql("select count(*) from public.sales_category_branches scb join public.sales_categories c on c.id=scb.category_id where scb.branch_id='" + rumeli + "' and c.key in ('sicak_icecek','soguk_icecek')") === "2",
    "Rumeli's ten mappings are unchanged");
  const balik = sql("select id from public.branches where key='balik_ekmek'");
  check(sql("select string_agg(c.key, ',' order by c.key) from public.sales_category_branches scb join public.sales_categories c on c.id=scb.category_id where scb.branch_id='" + balik + "'") === "balik_ekmek,soguk_icecek",
    "Balik Ekmek reports exactly balik_ekmek and soguk_icecek");
  check(sql("select count(*) from public.operating_data_provenance where entity_type='category_branch' and entity_key like 'balik_ekmek/%' and classification='confirmed' and approval_status='approved'") === "2",
    "both Balik Ekmek category mappings are confirmed + approved");
  check(sql("select string_agg(key||':'||name||':'||is_active, ',') from public.registers where branch_id='" + balik + "'") === "s900:S900:true",
    "S900 is the only Balik Ekmek register");
  check(sql("select key||':'||name||':'||start_hour||':'||start_minute||'-'||end_hour||':'||end_minute||' cutoff '||cutoff_hour||':'||cutoff_minute||'+'||cutoff_day_offset||':'||is_active from public.shift_definitions where branch_id='" + balik + "'") === "daily:Tek vardiya:14:0-0:0 cutoff 0:0+1:true",
    "Balik Ekmek has one active daily shift 14:00-00:00 with a next-day 00:00 cutoff");
  check(sql("select count(*) from public.shift_definitions where branch_id='" + balik + "'") === "1", "Balik Ekmek has no other shift");
  check(sql("select string_agg(key||':'||is_active, ',' order by key) from public.shift_definitions where branch_id='" + rumeli + "'") === "evening:true,morning:true" && shiftDump() === "evening16:0-1:0,morning9:0-17:30",
    "Rumeli shifts are unchanged");
  check(sql("select count(*) from public.sales_category_branches where branch_id='" + rumeli + "'") === "10", "Rumeli still reports its 10 categories");
  check(sql("select count(*) from public.registers where lower(key) like '%pavo%' or lower(name) like '%pavo%'") === "0", "Pavo is absent (future transition, not activated)");
  const again = await load(["--apply"]);
  check(again.report.totals.created === 0 && again.report.totals.updated === 0, "second apply of the real dataset creates and updates nothing");
  check(again.report.details.filter((x) => x.group === "category_branch_removals").every((x) => x.status === "unchanged") && again.report.details.filter((x) => x.group === "category_branch_removals").length === 2,
    "second apply: both removals are idempotent (already absent -> unchanged)");
}

// ---- 3. approved legacy row: created, unchanged, updated, audited -------------
const tmp = (name, files) => {
  const dir = mkdtempSync(join(tmpdir(), `od-${name}-`));
  for (const [g, text] of Object.entries(files)) writeFileSync(join(dir, `${g}.csv`), text);
  return dir;
};
const M = "provenance,approval_status,source";
const regs = (name) => `branch_key,register_key,name,is_active,${M}\nrumeli_iskelesi,gecici_kasa,${name},true,legacy_observed,approved,owner said yes\n`;
const branchesCsv = `branch_key,name,is_active,${M}\nrumeli_iskelesi,Rumeli İskelesi,true,confirmed,approved,BACKLOG\n`;
{
  const dir = tmp("reg", { branches: branchesCsv, registers: regs("Ana Kasa") });
  let r = await load(["--apply", "--dir", dir]);
  check(r.report.totals.created === 1 && r.report.applied, "an owner-approved legacy register is created");
  r = await load(["--apply", "--dir", dir]);
  check(r.report.totals.unchanged === 2 && r.report.totals.created === 0, "re-applying creates no duplicate (unchanged)");
  check(sql("select count(*) from public.registers where key='gecici_kasa'") === "1", "exactly one temporary register row exists");
  r = await load(["--apply", "--dir", tmp("reg2", { branches: branchesCsv, registers: regs("Ana Kasa 1") })]);
  check(r.report.totals.updated === 1, "a changed name is a controlled update");
  const audit = sql("select count(*) from public.audit_logs a join public.profiles p on p.id=a.actor_user_id where a.action='operating_data_load' and a.entity_type='registers' and a.entity_id='rumeli_iskelesi/gecici_kasa' and p.employee_code='P01'");
  check(Number(audit) === 2, "create + update are audited with the verified owner as actor");
  const prov = sql("select classification||'/'||approval_status from public.operating_data_provenance where entity_type='register' and entity_key='rumeli_iskelesi/gecici_kasa'");
  check(prov === "legacy_observed/approved", "provenance records legacy_observed + owner-approved");
}

// ---- 4. atomicity: a database-level rejection rolls back the whole load --------
{
  // baseline synthetic catalogue first (also proves idempotency below)
  const first = await load(["--dataset", "test-only", "--allow-test-data", "--apply"]);
  check(first.exitCode === 0 && first.report.applied && first.report.totals.created >= 12, "test-only synthetic catalogue applies (created rows reported)");
  const second = await load(["--dataset", "test-only", "--allow-test-data", "--apply"]);
  check(second.report.totals.created === 0 && second.report.totals.updated === 0 && second.report.totals.unchanged === first.report.totals.created + first.report.totals.unchanged + first.report.totals.updated, "second apply of the catalogue: everything unchanged, no duplicates");
  check(sql("select count(*) from public.inventory_items where code like 'TEST-%'") === "2", "no duplicate inventory items");
  check(sql("select count(*) from public.inventory_movements where reference like 'OPENING-STOCK%'") === "2", "no duplicate opening-stock movements");
  check(sql("select string_agg(distinct classification, ',') from public.operating_data_provenance where entity_key like '%TEST-%'") === "demo_only", "synthetic rows are recorded as demo_only");

  const costHead = `branch_key,item_code,unit_cost,effective_from,${M}\n`;
  const T = "demo_only,approved,synthetic";
  const before = counts();
  const dir = tmp("atomic", {
    sales_categories: `category_key,name,is_active,${M}\ntest_yeni,TEST Yeni,true,${T}\n`,
    inventory_items: `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\niskele_dondurma,TEST-A01,TEST Ürün A (adet),adet,false,true,${T}\niskele_dondurma,TEST-N01,TEST Yeni Ürün,adet,false,true,${T}\n`,
    item_costs: costHead + `iskele_dondurma,TEST-A01,9.0000,2026-08-01,${T}\n`,
  });
  const r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dir]);
  check(r.exitCode === 2 && r.report.applied === false, "a row the database rejects (back-dated cost) makes the load exit 2 / applied:false");
  check(r.report.rows.some((x) => x.group === "item_costs" && /earlier than the latest recorded cost/.test(x.message)), "the rejected row is named with a clear reason");
  check(counts() === before, "the valid rows of the same file were rolled back too: no partial load");
}

// ---- 4b. removal conflict, rollback, and no direct access -------------------
{
  const T = "demo_only,approved,synthetic";
  const before = counts();
  const mapBefore = sql("select count(*) from public.sales_category_branches");
  const dir = tmp("rmconflict", {
    sales_categories: `category_key,name,is_active,${M}\ntest_grup_a,TEST Ürün Grubu A,true,${T}\n`,
    registers: `branch_key,register_key,name,is_active,${M}\niskele_dondurma,test_kasa,TEST Kasa,true,${T}\n`,
    category_branch_removals: `branch_key,category_key,reason,${M}\niskele_dondurma,test_grup_a,conflict rehearsal,${T}\n`,
  });
  const r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dir]);
  check(r.exitCode === 2 && r.report.applied === false && r.report.rows.some((x) => x.group === "category_branch_removals" && /still use the category/.test(x.message)),
    "a removal that would orphan an item's category is rejected with a clear reason");
  check(counts() === before && sql("select count(*) from public.sales_category_branches") === mapBefore && sql("select count(*) from public.registers where key='test_kasa'") === "0",
    "the rejected removal rolled back the valid register create in the same load");
  for (const fn of ["internal_od_remove_mappings", "internal_od_apply", "internal_od_apply_core", "internal_run_operating_data"]) {
    for (const [who, tok] of [["anon", anon], ["owner JWT", users.P01.token], ["manager JWT", users.P02.token], ["branch manager JWT", users.P03.token], ["cashier JWT", users.P04.token]]) {
      const x = await req(`/rest/v1/rpc/${fn}`, { token: tok, method: "POST", body: { p_actor: users.P01.id, p_actor_code: "P01", p_payload: {}, p_dataset: "real", p_commit: false } });
      check(x.status === 401 || x.status === 403 || x.status === 404, `${who} cannot call ${fn} through the Data API`);
    }
  }
  const raw = await req(`/rest/v1/sales_category_branches?branch_id=eq.${dondurma}`, { token: users.P01.token, method: "DELETE" });
  check(sql("select count(*) from public.sales_category_branches") === mapBefore, "a raw DELETE by an owner JWT removes no mapping (status " + raw.status + ")");
}

// ---- 5. append-only rules and controlled changes -----------------------------
{
  const T = "demo_only,approved,synthetic";
  const ITEMS = `branch_key,item_code,name,unit,allows_decimal,is_active,${M}
iskele_dondurma,TEST-A01,TEST Ürün A (adet),adet,false,true,${T}
iskele_dondurma,TEST-B01,TEST Ürün B (kg),kg,true,true,${T}
`;
  const dirCost = tmp("cost", { inventory_items: ITEMS, item_costs: `branch_key,item_code,unit_cost,effective_from,${M}\niskele_dondurma,TEST-A01,11.0000,2026-09-01,${T}\n` });
  let r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirCost]);
  check(r.exitCode === 2 && /append-only/.test(JSON.stringify(r.report.rows)), "a different cost for an existing effective date is rejected (append-only)");
  const dirNew = tmp("cost2", { inventory_items: ITEMS, item_costs: `branch_key,item_code,unit_cost,effective_from,${M}\niskele_dondurma,TEST-A01,12.0000,2026-09-10,${T}\n` });
  r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirNew]);
  check(r.exitCode === 0 && r.report.totals.created === 1, "a later cost is appended as a new row");
  check(sql("select count(*) from public.inventory_item_costs c join public.inventory_items i on i.id=c.inventory_item_id where i.code='TEST-A01'") === "2", "cost history keeps both rows");
  const dirStock = tmp("stock", { inventory_items: ITEMS, opening_stock: `branch_key,item_code,quantity,as_of_date,${M}\niskele_dondurma,TEST-A01,99,2026-09-25,${T}\n` });
  r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirStock]);
  check(r.exitCode === 2 && /already loaded/.test(JSON.stringify(r.report.rows)), "a different opening quantity for a loaded item is rejected (ledger is append-only)");
  const dirUnit = tmp("unit", { inventory_items: `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\niskele_dondurma,TEST-A01,TEST Ürün A (adet),kg,true,true,${T}\n` });
  r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirUnit]);
  check(r.exitCode === 2 && /cannot change once the item has stock movements/.test(JSON.stringify(r.report.rows)), "unit/decimal cannot change once stock movements exist");
  const dirName = tmp("name", { inventory_items: `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\niskele_dondurma,TEST-A01,TEST Ürün A yeni ad,adet,false,true,${T}\n` });
  r = await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirName]);
  check(r.exitCode === 0 && r.report.totals.updated === 1, "renaming an item is a controlled update");
  check(sql("select sales_category_id is not null from public.inventory_items where code='TEST-A01'") === "t", "the category mapping survives an item update");
  // put the name back so later assertions read the canonical fixture
  const dirBack = tmp("name2", { inventory_items: `branch_key,item_code,name,unit,allows_decimal,is_active,${M}\niskele_dondurma,TEST-A01,TEST Ürün A (adet),adet,false,true,${T}\n` });
  await load(["--dataset", "test-only", "--allow-test-data", "--apply", "--dir", dirBack]);
}

// ---- 6. authority: only an active owner via service role -----------------------
{
  await load(["--apply"], { OPERATING_DATA_ACTOR_CODE: "P02" }).then(
    () => check(false, "manager actor must be refused"),
    (e) => check(/database refused|owner/.test(e.message), "a manager cannot be the loader actor (owner only)"),
  );
  const payload = { p_actor_code: "P01", p_payload: { dataset: "real" }, p_commit: false };
  for (const [who, tok] of [["anon", anon], ["owner JWT", users.P01.token], ["cashier JWT", users.P04.token]]) {
    const r = await req("/rest/v1/rpc/internal_run_operating_data", { token: tok, method: "POST", body: payload });
    check(r.status === 401 || r.status === 403 || r.status === 404, `${who} cannot call the loader function through the Data API`);
  }
  const prov = (t) => req("/rest/v1/operating_data_provenance?select=entity_key", { token: t });
  check((await prov(users.P02.token)).data.length > 0, "manager can read provenance");
  check((await prov(users.P04.token)).data.length === 0, "cashier reads no provenance rows");
  check((await prov(users.P03.token)).data.length === 0, "branch_manager reads no provenance rows");
  const w = await req("/rest/v1/operating_data_provenance", { token: users.P01.token, method: "POST", body: { entity_type: "x", entity_key: "y", classification: "confirmed", approval_status: "approved", dataset: "real" } });
  check(!w.ok, "even an owner cannot write provenance directly (loader only)");
  const badActor = await req("/rest/v1/rpc/internal_run_operating_data", { token: service, admin: true, method: "POST", body: { p_actor_code: "NOPE", p_payload: { dataset: "real" }, p_commit: true } });
  check(!badActor.ok, "unknown actor code is refused");
}

// ---- 7. complete daily operation on the synthetic catalogue -------------------
{
  const item = (code) => sql(`select id from public.inventory_items where code='${code}'`);
  const A = item("TEST-A01"), B = item("TEST-B01");
  const catA = sql("select id from public.sales_categories where key='test_grup_a'");
  const defId = sql(`select id from public.shift_definitions where branch_id='${dondurma}' and key='winter' and is_active`);
  const stockOf = (id) => sql(`select coalesce(sum(stock_delta),0) from public.inventory_movements where inventory_item_id='${id}'`);
  const today = sql("select (now() at time zone 'Europe/Istanbul')::date");
  const mgr = users.P02.token, cashier = users.P04.token, bm = users.P03.token, owner = users.P01.token;

  check(Number(stockOf(A)) === 20 && Number(stockOf(B)) === 10.5, "1. opening stock from the loader is on the ledger (20 / 10.5)");

  // user + branch assignment
  check(sql(`select count(*) from public.branch_memberships where user_id='${users.P04.id}' and branch_id='${dondurma}'`) === "1", "2. cashier is assigned to the branch");
  check((await rpc(users.P05.token, "schedule_shift", { p_branch_id: dondurma, p_shift_definition_id: defId, p_business_date: today })).status === 403 ||
        !(await rpc(users.P05.token, "schedule_shift", { p_branch_id: dondurma, p_shift_definition_id: defId, p_business_date: today })).ok, "cross-branch cashier cannot schedule a shift in this branch");

  // shift selection
  const shiftRes = await rpc(bm, "schedule_shift", { p_branch_id: dondurma, p_shift_definition_id: defId, p_business_date: today, p_reason: "daily rehearsal" });
  check(shiftRes.ok, "3. branch manager schedules the active winter shift");
  const shiftId = shiftRes.data;
  check((await rpc(bm, "assign_shift", { p_shift_id: shiftId, p_user_id: users.P04.id })).ok, "the cashier is assigned to the shift");
  const mine = await req(`/rest/v1/shifts?select=id,status,business_date&id=eq.${shiftId}`, { token: cashier });
  check(mine.ok && mine.data.length === 1, "the assigned cashier sees and selects the shift");
  check((await req(`/rest/v1/shifts?select=id&id=eq.${shiftId}`, { token: users.P05.token })).data.length === 0, "a cashier of another branch cannot see the shift");

  // sales report with product quantities
  const items = [
    { inventory_item_id: A, inventory_quantity: 5, amount: 150 },
    { inventory_item_id: B, inventory_quantity: 2.5, amount: 310 },
  ];
  const rep = await rpc(cashier, "create_sales_report", { p_shift_id: shiftId, p_register_id: null, p_report_type: "Z", p_gross_revenue: 460, p_transaction_count: 12, p_average_basket: null, p_notes: "daily rehearsal", p_items: items });
  check(rep.ok, "4. cashier submits a Z report with product-level lines");
  check(Number(stockOf(A)) === 15 && Number(stockOf(B)) === 8, "product quantities reduced stock (20-5, 10.5-2.5)");
  check((await rpc(cashier, "create_sales_report", { p_shift_id: shiftId, p_register_id: null, p_report_type: "Z", p_gross_revenue: 1, p_transaction_count: 1, p_average_basket: null, p_notes: null, p_items: [] })).status >= 400, "a duplicate Z report for the shift is refused");
  const wholeUnits = await rpc(mgr, "create_sales_report", { p_shift_id: shiftId, p_register_id: null, p_report_type: "X", p_gross_revenue: 15, p_transaction_count: 1, p_average_basket: null, p_notes: null, p_items: [{ inventory_item_id: A, inventory_quantity: 1.5, amount: 15 }] });
  check(!wholeUnits.ok, "a fractional quantity for a whole-unit item is refused server-side");

  // stock receipt (branch_manager may receive; cost line is manager only)
  check((await rpc(bm, "record_inventory_receipt", { p_branch_id: dondurma, p_lines: [{ inventory_item_id: A, quantity: 10 }], p_reference: "TEST-DELIVERY" })).ok, "5. stock receipt recorded (+10)");
  check(Number(stockOf(A)) === 25, "receipt increased stock");
  check(!(await rpc(cashier, "record_inventory_receipt", { p_branch_id: dondurma, p_lines: [{ inventory_item_id: A, quantity: 1 }] })).ok, "a cashier cannot receive stock");

  // waste
  check((await rpc(cashier, "record_inventory_waste", { p_branch_id: dondurma, p_lines: [{ inventory_item_id: A, quantity: 1 }], p_reason_code: "expired", p_shift_id: shiftId })).ok, "6. waste with a reason code is recorded");
  check(!(await rpc(cashier, "record_inventory_waste", { p_branch_id: dondurma, p_lines: [{ inventory_item_id: A, quantity: 1 }], p_reason_code: "invented" })).ok, "an unsupported waste reason is refused");
  check(Number(stockOf(A)) === 24, "waste reduced stock");

  // count + variance
  const cnt = await rpc(cashier, "submit_inventory_count", { p_branch_id: dondurma, p_shift_id: shiftId, p_items: [{ inventory_item_id: A, physical_quantity: 23 }, { inventory_item_id: B, physical_quantity: 8 }] });
  check(cnt.ok, "7. closing count submitted");
  const cItems = await req(`/rest/v1/inventory_count_items?select=inventory_item_id,physical_quantity,theoretical_quantity,variance_quantity&inventory_count_id=eq.${cnt.data}`, { token: mgr });
  const vA = cItems.data.find((x) => x.inventory_item_id === A), vB = cItems.data.find((x) => x.inventory_item_id === B);
  check(Number(vA.theoretical_quantity) === 24 && Number(vA.variance_quantity) === -1, "8. stock difference: A theoretical 24, physical 23, variance -1");
  check(Number(vB.variance_quantity) === 0, "B has no variance");
  check(Number(stockOf(A)) === 24, "the count did not rewrite the ledger");

  // cost and gross profit
  const from = new Date(Date.now() - 6 * 3600e3).toISOString(), to = new Date(Date.now() + 3600e3).toISOString();
  const gp = await rpc(mgr, "get_inventory_gross_profit", { p_branch_id: dondurma, p_from: from, p_to: to });
  check(gp.ok, "9. manager reads gross-profit inputs");
  const lineA = gp.data.lines.find((l) => l.code === "TEST-A01"), lineB = gp.data.lines.find((l) => l.code === "TEST-B01");
  check(Number(lineA.cogs) === 60 && Number(lineB.cogs) === 125, "COGS uses the effective cost snapshot (5 x 12.00, 2.5 x 50.00)");
  const revenue = Number(lineA.product_revenue) + Number(lineB.product_revenue), cogs = Number(lineA.cogs) + Number(lineB.cogs);
  check(revenue === 460 && revenue - cogs === 275, "gross profit = 460 - 185 = 275 (gross, not net)");
  check(Number(lineA.uncosted_quantity) === 0, "no uncosted quantity: every sold item had a loaded cost");
  check(!(await rpc(cashier, "get_inventory_gross_profit", { p_branch_id: dondurma, p_from: from, p_to: to })).ok, "cashier cannot read costs or gross profit");

  // reconciliation
  const rec = await req(`/rest/v1/sales_reports?select=reconciliation_status&id=eq.${rep.data}`, { token: mgr });
  check(rec.data[0].reconciliation_status === "OK", "10. reconciliation: declared 460 equals the item total -> OK");
  const bad = await rpc(mgr, "create_sales_report", { p_shift_id: shiftId, p_register_id: null, p_report_type: "X", p_gross_revenue: 1000, p_transaction_count: 3, p_average_basket: null, p_notes: null, p_items: [{ category_id: catA, amount: 100 }] });
  check(bad.ok, "a category-level X report is accepted");
  const recBad = await req(`/rest/v1/sales_reports?select=reconciliation_status&id=eq.${bad.data}`, { token: mgr });
  check(recBad.data[0].reconciliation_status === "ERROR", "a large mismatch (1000 vs 100) is ERROR under the owner-approved 2/5 thresholds");

  // audit
  const audits = await req(`/rest/v1/audit_logs?select=action,actor_user_id&order=created_at.desc&limit=400`, { token: owner });
  const has = (a, u) => audits.data.some((x) => x.action === a && (!u || x.actor_user_id === u));
  check(has("operating_data_load", users.P01.id), "11. audit: operating-data load by the owner");
  check(has("report_edit", users.P04.id), "audit: report submitted by the cashier");
  check(has("inventory_receipt", users.P03.id), "audit: receipt by the branch manager");
  check(audits.data.some((x) => x.action.startsWith("inventory_") && x.actor_user_id === users.P04.id), "audit: cashier waste/count recorded");
  check(!JSON.stringify(audits.data).includes(service), "audit rows hold no secret");
}

console.log(`\nLOCAL OPERATING-DATA LOADER PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`);
