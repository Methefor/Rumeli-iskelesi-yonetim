/**
 * Production-import REHEARSAL on a disposable LOCAL Supabase (fresh reset first).
 *   node supabase/tests/legacy_import_rehearsal.test.mjs
 *
 * Reads the hosted legacy source READ-ONLY (GET, public path) and writes only to
 * http://127.0.0.1:54321. Drives the real CLI entry points (run.mjs,
 * provision-archival.mjs) so the production guards are exercised exactly as an
 * operator would hit them, then runs legacy-migration/post_apply_checks.sql.
 * Prints counts only: no names, PINs, UUIDs or keys.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readLegacySnapshot } from "../../legacy-migration/source.mjs";
import { auditLegacyRows, stableRows, toKurus } from "../../legacy-migration/lib.mjs";
import { plannedReportCount } from "../../legacy-migration/guards.mjs";
import { runLoader } from "../../operating-data/load.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
const status = JSON.parse(
  process.env.SUPABASE_CLI
    ? execFileSync(process.env.SUPABASE_CLI, ["status", "-o", "json"], commandOptions)
    : execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx supabase status -o json"], commandOptions),
);
const base = new URL(status.API_URL);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "54321")
  throw new Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const anon = status.ANON_KEY;
const service = status.SERVICE_ROLE_KEY;

const psql = (text, flags = []) =>
  execFileSync(
    process.env.DOCKER_CLI || "docker",
    ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At", ...flags],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const sql = (text) => psql(text);

let passed = 0;
const check = (ok, label) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
};
async function http(pathname, token, body, method = "POST") {
  const response = await fetch(new URL(pathname, base), {
    method,
    headers: { apikey: token, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}
const cli = (script, args, extraEnv = {}) =>
  spawnSync(process.execPath, [path.join(root, script), ...args], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      TARGET_SUPABASE_URL: base.toString().replace(/\/$/, ""),
      TARGET_SUPABASE_SERVICE_ROLE_KEY: service,
      ...extraEnv,
    },
  });

// ---------------------------------------------------------------- fixtures --
const credentials = {};
async function makeUser(code, role, branchKey, { pin = true } = {}) {
  const email = `rehearsal-${code.toLowerCase()}-${randomUUID()}@migration.invalid`;
  const password = `Local-${randomUUID()}!`;
  const response = await http("/auth/v1/admin/users", service, { email, password, email_confirm: true });
  if (!response.ok) throw new Error(`local auth fixture failed: ${response.status}`);
  credentials[code] = { email, password };
  const id = response.data.id;
  sql(
    `insert into public.profiles(id,full_name,employee_code,is_active) values ('${id}','Rehearsal ${code}','${code}',true);` +
      `insert into public.user_roles(user_id,role_id) select '${id}',id from public.roles where key='${role}';` +
      (branchKey ? `insert into public.branch_memberships(user_id,branch_id) select '${id}',id from public.branches where key='${branchKey}';` : "") +
      (pin ? `insert into public.pin_credentials(user_id,pin_hash) values ('${id}', extensions.crypt('${Math.floor(1000 + Math.random() * 8999)}', extensions.gen_salt('bf')));` : ""),
  );
  return id;
}
await makeUser("M001", "owner", null);
for (const code of ["K001", "K002", "K003"]) await makeUser(code, "cashier", "rumeli_iskelesi");
for (const code of ["D001", "D002"]) await makeUser(code, "cashier", "iskele_dondurma");
check(sql("select count(*) from public.profiles where is_active") === "6", "active roster fixtures: owner + 5 approved cashiers");

// -------------------------------- archival profiles through the real CLI -----
const dryArchival = cli("identity-data/provision-archival.mjs", ["--target-ref=local", "--count=3"]);
check(dryArchival.status === 0 && JSON.parse(dryArchival.stdout).created.length === 3, "archival provisioning dry run lists H001-H003");
check(sql("select count(*) from public.profiles where employee_code like 'H%'") === "0", "archival dry run wrote nothing");
const refuseHosted = cli("identity-data/provision-archival.mjs", ["--target-ref=iwikwbjsznjuefvuemdb", "--count=3", "--apply"], {
  TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co",
});
check(refuseHosted.status === 3 && /hosted_target_refused/.test(refuseHosted.stderr), "archival provisioning refuses a hosted target without explicit flags");
const applyArchival = cli("identity-data/provision-archival.mjs", ["--target-ref=local", "--count=3", "--apply"]);
check(applyArchival.status === 0 && JSON.parse(applyArchival.stdout).created.length === 3, "archival apply creates H001-H003");
check(
  sql("select count(*) from public.profiles where employee_code like 'H%' and not is_active") === "3" &&
    sql("select count(*) from public.pin_credentials pc join public.profiles p on p.id=pc.user_id where p.employee_code like 'H%'") === "0" &&
    sql("select count(*) from public.user_roles ur join public.profiles p on p.id=ur.user_id where p.employee_code like 'H%'") === "0" &&
    sql("select count(*) from public.branch_memberships bm join public.profiles p on p.id=bm.user_id where p.employee_code like 'H%'") === "0",
  "archival profiles are inactive with no PIN, no role and no branch membership",
);
check(
  sql("select count(*) from auth.users u join public.profiles p on p.id=u.id where p.employee_code like 'H%' and u.banned_until is not null and u.banned_until > now() + interval '50 years'") === "3",
  "archival Auth users are banned (no-login guarantee at the Auth layer)",
);
const again = cli("identity-data/provision-archival.mjs", ["--target-ref=local", "--count=3", "--apply"]);
check(again.status === 0 && JSON.parse(again.stdout).unchanged.length === 3, "archival provisioning is idempotent");
sql("update public.profiles set is_active = true where employee_code = 'H003'");
const incident = cli("identity-data/provision-archival.mjs", ["--target-ref=local", "--count=3"]);
check(incident.status === 3 && /archival_profile_active/.test(incident.stderr), "an ACTIVE archival profile is refused as an incident, never repaired");
sql("update public.profiles set is_active = false where employee_code = 'H003'");

// ------------------------------------------------------- operating data -----
const loader = await runLoader({
  argv: ["--apply"],
  env: { SUPABASE_URL: base.toString(), SUPABASE_SERVICE_ROLE_KEY: service, OPERATING_DATA_ACTOR_CODE: "M001" },
});
check(loader.exitCode === 0 && loader.report.applied === true, "owner-approved operating data is loaded locally");

// ------------------------------------------------------------ the source ----
const { rows, cashierIds } = await readLegacySnapshot();
const audit = auditLegacyRows(rows, cashierIds);
const expRumeli = rows.length;
const zRows = rows.filter((r) => r.shift === "aksam");
const expBalik = zRows.filter((r) => toKurus(r.balik_ekmek) > 0).length;
const expDondurma = zRows.filter((r) => toKurus(r.dondurma) > 0).length;
const expTotal = expRumeli + expBalik + expDondurma;
check(plannedReportCount(rows) === expTotal && audit.rumeliReports === expRumeli && audit.balikReports === expBalik && audit.dondurmaReports === expDondurma,
  "guard plan, audit plan and independent count agree");
console.log(`SOURCE rows=${rows.length} x=${audit.xRows} z=${audit.zRows} cashiers=${cashierIds.length} first=${audit.firstDate} last=${audit.lastDate} fp=${audit.fingerprint.slice(0, 12)}…`);
console.log(`PLAN rumeli=${expRumeli} balik=${expBalik} dondurma=${expDondurma} total=${expTotal}`);

// Private map: the real one when present and complete, else a deterministic synthetic one.
const privateMapPath = path.join(root, "legacy-migration/private/cashier-map.json");
let mapPath = privateMapPath;
let mapKind = "private (real UUIDs, never printed)";
const mapOk = (() => {
  try {
    const m = JSON.parse(fs.readFileSync(privateMapPath, "utf8"));
    return cashierIds.every((id) => id in m) && Object.keys(m).length === cashierIds.length;
  } catch {
    return false;
  }
})();
if (!mapOk) {
  const synthetic = {};
  [...cashierIds].sort().forEach((id, i) => (synthetic[id] = i < 2 ? `K00${i + 1}` : `H00${i - 1}`));
  mapPath = path.join(root, "legacy-migration/private/.rehearsal-synthetic-map.json");
  fs.writeFileSync(mapPath, JSON.stringify(synthetic));
  mapKind = "synthetic (private map absent or incomplete)";
}
console.log(`MAP ${mapKind}`);
const cashierMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const COMMON = [`--target-ref=local`, `--actor=M001`, `--cashier-map=${mapPath}`];
const countsSql =
  "select (select count(*) from public.sales_reports)||','||(select count(*) from public.legacy_sales_report_links)||','||(select count(*) from public.legacy_sales_import_runs)||','||(select count(*) from public.legacy_cashier_profile_map)||','||(select count(*) from public.shifts)||','||(select count(*) from public.registers)";
const emptyCounts = sql(countsSql);
const importAudit = () => sql("select count(*) from public.audit_logs where action='legacy_sales_import_applied'");
const totalAudit = () => sql("select count(*) from public.audit_logs");
check(importAudit() === "0", "no import audit event exists before any import");

// ------------------------------------------------- injected failure rollback -
const corrupted = stableRows(rows);
corrupted[corrupted.length - 1] = { ...corrupted[corrupted.length - 1], shift: "gece" };
const injected = await http("/rest/v1/rpc/internal_run_legacy_sales_import", service, {
  p_actor_code: "M001",
  p_rows: corrupted,
  p_cashier_map: cashierMap,
  p_source_fingerprint: `${audit.fingerprint}-injected`,
  p_reason: "Rehearsal injected failure",
  p_commit: true,
});
check(!injected.ok && JSON.stringify(injected.data).includes("unsupported legacy shift"), "an injected bad row fails the whole COMMIT run");
check(sql(countsSql) === emptyCounts, "injected failure rolled back every write (reports, lineage, runs, map, shifts, registers)");
check(importAudit() === "0", "an injected failure leaves no committed import-success audit event");
const unmapped = await http("/rest/v1/rpc/internal_run_legacy_sales_import", service, {
  p_actor_code: "M001",
  p_rows: stableRows(rows),
  p_cashier_map: Object.fromEntries(Object.entries(cashierMap).slice(1)),
  p_source_fingerprint: `${audit.fingerprint}-unmapped`,
  p_reason: "Rehearsal unmapped cashier",
  p_commit: true,
});
check(!unmapped.ok && JSON.stringify(unmapped.data).includes("is not mapped") && sql(countsSql) === emptyCounts, "an unmapped legacy cashier aborts and rolls back");
const anonCall = await http("/rest/v1/rpc/internal_run_legacy_sales_import", anon, { p_actor_code: "M001", p_rows: [], p_cashier_map: {}, p_source_fingerprint: "x".repeat(20), p_reason: "x" });
check(!anonCall.ok, "anon cannot call the importer");

// ------------------------------------------------------------ CLI guards ----
const noRef = cli("legacy-migration/run.mjs", ["--actor=M001", `--cashier-map=${mapPath}`, `--expect-fingerprint=${audit.fingerprint}`]);
check(noRef.status === 3 && /target_ref_required/.test(noRef.stderr), "importer refuses to run without --target-ref");
const noFp = cli("legacy-migration/run.mjs", COMMON);
check(noFp.status === 3 && /fingerprint_required/.test(noFp.stderr), "importer refuses to run without --expect-fingerprint (even a dry run)");
const driftRun = cli("legacy-migration/run.mjs", [...COMMON, `--expect-fingerprint=${"0".repeat(64)}`]);
check(driftRun.status === 3 && /source_drift/.test(driftRun.stderr) && sql(countsSql) === emptyCounts, "a stale fingerprint is refused before any target call");
const anonKeyRun = cli("legacy-migration/run.mjs", [...COMMON, `--expect-fingerprint=${audit.fingerprint}`], { TARGET_SUPABASE_SERVICE_ROLE_KEY: anon });
check(anonKeyRun.status === 3 && /service_key_wrong_role/.test(anonKeyRun.stderr), "importer refuses an anon key");
const hostedRun = cli("legacy-migration/run.mjs", ["--target-ref=iwikwbjsznjuefvuemdb", "--actor=M001", `--cashier-map=${mapPath}`, `--expect-fingerprint=${audit.fingerprint}`], {
  TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co",
});
check(hostedRun.status === 3 && /hosted_target_refused/.test(hostedRun.stderr), "importer refuses the hosted production target without --allow-hosted-target");
const wrongRef = cli("legacy-migration/run.mjs", ["--target-ref=abcdefghijklmnopqrst", "--allow-hosted-target", "--actor=M001", `--cashier-map=${mapPath}`, `--expect-fingerprint=${audit.fingerprint}`], {
  TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co",
});
check(wrongRef.status === 3 && /target_ref_mismatch/.test(wrongRef.stderr), "importer refuses a --target-ref that does not match the URL (wrong-project guard)");

// -------------------------------------------------------------- dry run -----
const FP = `--expect-fingerprint=${audit.fingerprint}`;
const dry = cli("legacy-migration/run.mjs", [...COMMON, FP]);
check(dry.status === 0, "importer dry run succeeds through the real CLI");
const dryResult = JSON.parse(dry.stdout);
check(dryResult.mode === "dry-run" && dryResult.result.applied === false && dryResult.result.result.createdReports === expTotal, "dry run plans exactly the independently counted reports");
check(
  dryResult.result.result.rumeliReports === expRumeli && dryResult.result.result.balikReports === expBalik && dryResult.result.result.dondurmaReports === expDondurma,
  "dry run branch split is Rumeli / Balık Ekmek / İskele Dondurma, kept separate",
);
check(sql(countsSql) === emptyCounts, "dry run left zero rows behind");
check(importAudit() === "0", "a dry run creates no persistent audit row");
console.log(`DRY-RUN created=${dryResult.result.result.createdReports} rumeli=${dryResult.result.result.rumeliReports} balik=${dryResult.result.result.balikReports} dondurma=${dryResult.result.result.dondurmaReports}`);

// ----------------------------------------------------------------- apply ----
const noAck = cli("legacy-migration/run.mjs", [...COMMON, FP, "--apply"]);
check(noAck.status === 3 && /dry_run_ack_required/.test(noAck.stderr) && sql(countsSql) === emptyCounts, "apply without the dry-run acknowledgement is refused");
const badAck = cli("legacy-migration/run.mjs", [...COMMON, FP, "--apply", `--ack-dry-run=${expTotal + 1}`]);
check(badAck.status === 3 && /dry_run_ack_required/.test(badAck.stderr), "apply with a wrong acknowledgement is refused");
const auditTotalBefore = totalAudit();
const applied = cli("legacy-migration/run.mjs", [...COMMON, FP, "--apply", `--ack-dry-run=${expTotal}`]);
check(applied.status === 0 && JSON.parse(applied.stdout).result.applied === true, "apply through the real CLI commits");
const links = sql("select count(*) from public.legacy_sales_report_links");
check(links === String(expTotal) && sql("select count(*) from public.sales_reports") === String(expTotal), "generated V4 reports equal the plan; every report has lineage");
check(sql("select count(*) from public.legacy_sales_import_runs") === "1", "exactly one immutable import run is recorded");
check(importAudit() === "1" && Number(totalAudit()) === Number(auditTotalBefore) + 1, "a successful live import writes exactly ONE audit event (not one per report)");
{
  const row = JSON.parse(sql("select row_to_json(a)::text from public.audit_logs a where action='legacy_sales_import_applied'"));
  const nv = row.new_values;
  const runId = sql("select id from public.legacy_sales_import_runs");
  check(nv.sourceFingerprint === audit.fingerprint && nv.sourceRows === rows.length && nv.createdReports === expTotal && nv.lineageLinks === expTotal && nv.importRunId === runId && row.entity_id === runId, "audit metadata matches the import result: fingerprint, source rows, created reports, lineage count and run id");
  check(nv.branchReports.rumeli_iskelesi === expRumeli && nv.branchReports.balik_ekmek === expBalik && nv.branchReports.iskele_dondurma === expDondurma && nv.mappedProfiles === 5 && /^[0-9a-f]{32}$/.test(nv.mappingCodesDigest), "audit metadata carries per-branch report counts and a non-secret mapping digest");
  const text = JSON.stringify(row);
  check(!cashierIds.some((id) => text.includes(id)) && !/"pin|pin_hash|\$2[aby]\$|eyJ|sb_secret/i.test(text), "the audit event leaks no legacy identity ids, PINs, hashes or keys");
  check(nv.completedAt >= nv.startedAt && row.actor_user_id !== null && /service role/.test(nv.actorSemantics), "audit semantics are explicit: named owner, executed by the service role");
}
const second = cli("legacy-migration/run.mjs", [...COMMON, FP, "--apply", `--ack-dry-run=${expTotal}`]);
check(second.status === 0 && JSON.parse(second.stdout).result.alreadyImported === true && sql("select count(*) from public.sales_reports") === String(expTotal), "second apply is a no-op (already imported)");
check(importAudit() === "1", "the no-op repeat fabricates no second success audit event");

// ------------------------------------------------------ business assertions -
const tl = (v) => toKurus(v);
const sumKurus = (list, f) => list.reduce((t, r) => t + f(r), 0);
const rumeliZ = sumKurus(zRows, (r) => tl(r.rumeli_z1) + tl(r.rumeli_z2));
const rumeliX = sumKurus(rows.filter((r) => r.shift === "sabah"), (r) => tl(r.rumeli_z1) + tl(r.rumeli_z2));
const balikZ = sumKurus(zRows, (r) => tl(r.balik_ekmek));
const dondurmaZ = sumKurus(zRows, (r) => tl(r.dondurma));
const dbSum = (branch, type) =>
  Number(sql(`select coalesce(round(sum(sr.gross_revenue)*100),0)::bigint from public.sales_reports sr join public.branches b on b.id=sr.branch_id where b.key='${branch}' and sr.report_type='${type}'`));
check(dbSum("rumeli_iskelesi", "Z") === rumeliZ && dbSum("rumeli_iskelesi", "X") === rumeliX, "Rumeli Z and X totals equal rumeli_z1+rumeli_z2 per shift type (X and Z kept separate, never added)");
check(dbSum("balik_ekmek", "Z") === balikZ && dbSum("iskele_dondurma", "Z") === dondurmaZ, "Balık Ekmek and İskele Dondurma totals equal their own source columns");
check(sql("select count(*) from public.sales_reports sr join public.branches b on b.id=sr.branch_id where b.key in ('balik_ekmek','iskele_dondurma') and sr.report_type<>'Z'") === "0", "no X report is ever generated for Balık Ekmek or Dondurma");
const allZ = rumeliZ + balikZ + dondurmaZ;
check(Number(sql("select coalesce(round(sum(gross_revenue)*100),0)::bigint from public.sales_reports where report_type='Z'")) === allZ, "organization Z revenue equals the three branch columns exactly, to the kuruş");
for (const [month, m] of Object.entries(audit.months)) {
  const v4 = Number(sql(`select coalesce(round(sum(sr.gross_revenue)*100),0)::bigint from public.sales_reports sr join public.shifts sh on sh.id=sr.shift_id where sr.report_type='Z' and to_char(sh.business_date,'YYYY-MM')='${month}'`));
  check(v4 === m.currentKurus, `V4 ${month} equals the audited current component total (variance vs frozen reference ${m.differenceKurus} kuruş is disclosed, not balanced)`);
}
check(sql("select count(*) from public.legacy_reference_totals") === "7", "frozen reference totals are retained separately");
check(sql("select count(*) from public.sales_reports sr where sr.notes ilike '%denge%' or sr.notes ilike '%balanc%' or sr.notes ilike '%düzeltme%'") === "0", "no balancing or correction rows exist");

// authorship: per-person counts equal what the source says through the private map
const expectedByCode = {};
for (const r of rows) {
  const code = cashierMap[r.cashier_id];
  const n = 1 + (r.shift === "aksam" && tl(r.balik_ekmek) > 0 ? 1 : 0) + (r.shift === "aksam" && tl(r.dondurma) > 0 ? 1 : 0);
  expectedByCode[code] = (expectedByCode[code] ?? 0) + n;
}
const actualByCode = Object.fromEntries(
  sql("select p.employee_code||':'||count(*) from public.sales_reports sr join public.profiles p on p.id=sr.submitted_by group by p.employee_code order by 1")
    .split("\n").filter(Boolean).map((l) => l.split(":")),
);
check(
  Object.keys(expectedByCode).length === Object.keys(actualByCode).length &&
    Object.entries(expectedByCode).every(([c, n]) => Number(actualByCode[c]) === n),
  "every report is attributed to exactly the mapped profile (authorship preserved per person)",
);
console.log(`AUTHORSHIP ${Object.entries(expectedByCode).sort().map(([c, n]) => `${c}=${n}`).join(" ")}`);
check(sql("select count(*) from public.sales_reports sr join public.profiles p on p.id=sr.submitted_by where p.employee_code like 'H%' and p.is_active") === "0", "no report is attributed to an active archival profile");
check(sql("select count(*) from public.pin_credentials") === "6", "no PIN credential was created or migrated by the import (still only the 6 fixture accounts)");
check(sql("select count(*) from public.profiles where is_active and employee_code like 'H%'") === "0", "no active account exists for an archival user after import");

// ---------------------------------------------------- source drift guard ----
const drifted = stableRows(rows);
drifted[0] = { ...drifted[0], rumeli_z1: Number(drifted[0].rumeli_z1) + 1 };
const drift = await http("/rest/v1/rpc/internal_run_legacy_sales_import", service, {
  p_actor_code: "M001", p_rows: drifted, p_cashier_map: cashierMap,
  p_source_fingerprint: `${audit.fingerprint}-edited`, p_reason: "Rehearsal drift", p_commit: true,
});
check(!drift.ok && JSON.stringify(drift.data).includes("source drift") && sql("select count(*) from public.sales_reports") === String(expTotal),
  "an edited legacy row after import is rejected as drift and never overwrites imported history");

// ------------------------------------------------- post-apply SQL pack -----
const pack = fs.readFileSync(path.join(root, "legacy-migration/post_apply_checks.sql"), "utf8");
check(!/\b(insert|update|delete|drop|alter|create|truncate|grant)\b/i.test(pack.replace(/--.*$/gm, "").replace(/'[^']*'/g, "''")), "post-apply pack contains read-only SQL only");
const filled = pack
  .replace("null::text    as expected_fingerprint", `'${audit.fingerprint}'::text as expected_fingerprint`)
  .replace("null::integer as expected_source_rows", `${rows.length}::integer as expected_source_rows`)
  .replace("null::integer as expected_reports", `${expTotal}::integer as expected_reports`)
  .replace("null::integer as expected_rumeli_x", `${audit.xRows}::integer as expected_rumeli_x`)
  .replace("null::integer as expected_rumeli_z", `${audit.zRows}::integer as expected_rumeli_z`)
  .replace("null::integer as expected_balik", `${expBalik}::integer as expected_balik`)
  .replace("null::integer as expected_dondurma", `${expDondurma}::integer as expected_dondurma`)
  .replace("null::date    as expected_first_date", `'${audit.firstDate}'::date as expected_first_date`)
  .replace("null::date    as expected_last_date", `'${audit.lastDate}'::date as expected_last_date`);
const packOut = psql(filled, ["-F", "|"]).split("\n").filter(Boolean).map((l) => l.split("|"));
const statuses = packOut.map((r) => r[r.length - 1]);
check(packOut.length >= 40 && statuses.every((s) => ["PASS", "INFO"].includes(s)), `post-apply pack: ${statuses.filter((s) => s === "PASS").length} PASS, ${statuses.filter((s) => s === "INFO").length} INFO, 0 FAIL`);
console.log(`POST-APPLY pass=${statuses.filter((s) => s === "PASS").length} info=${statuses.filter((s) => s === "INFO").length} fail=${statuses.filter((s) => s === "FAIL").length}`);

// the pack must FAIL when something is wrong (negative control)
sql("update public.profiles set is_active = true where employee_code = 'H002'");
const broken = psql(filled, ["-F", "|"]);
check(/archival \(H###\) profiles are inactive\|0 active\|1 active\|FAIL/.test(broken), "post-apply pack detects an active archival profile (negative control)");
sql("update public.profiles set is_active = false where employee_code = 'H002'");

// ---------------------------- historical reconciliation findings policy ------
{
  const login = await fetch(new URL("/auth/v1/token?grant_type=password", base), {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify(credentials.M001),
  });
  const ownerToken = (await login.json()).access_token;
  const view = async (query, token = ownerToken) => {
    const r = await fetch(new URL(`/rest/v1/sales_reports_with_origin?${query}`, base), { headers: { apikey: anon, Authorization: `Bearer ${token}` } });
    return { ok: r.ok, data: r.ok ? await r.json() : null, status: r.status };
  };
  const flagged = "reconciliation_status=in.(WARNING,ERROR)&status=neq.cancelled";
  const importedFlagged = Number(sql("select count(*) from public.sales_reports sr join public.legacy_sales_report_links l on l.sales_report_id=sr.id where sr.reconciliation_status in ('WARNING','ERROR') and sr.status<>'cancelled'"));
  check(importedFlagged > 0, `the import carries historical findings (${importedFlagged} flagged reports)`);

  // one NATIVE V4 report with ERROR (no lineage), created directly for the test
  sql(`
    insert into public.shifts(branch_id,shift_definition_id,business_date,status)
      select sd.branch_id, sd.id, date '2030-01-01', 'in_progress' from public.shift_definitions sd join public.branches b on b.id=sd.branch_id where b.key='rumeli_iskelesi' and sd.key='morning';
    insert into public.sales_reports(branch_id,shift_id,submitted_by,report_type,gross_revenue,status,reconciliation_status)
      select sh.branch_id, sh.id, (select id from public.profiles where employee_code='K001'), 'X', 1000, 'submitted', 'ERROR' from public.shifts sh where sh.business_date = date '2030-01-01';
  `);
  const auditBefore = sql("select count(*) from public.audit_logs");
  const overridesBefore = sql("select count(*) from public.sales_report_overrides");
  const storedBefore = sql("select reconciliation_status||':'||count(*) from public.sales_reports group by reconciliation_status order by 1");

  const active = await view(`select=id,reconciliation_status,origin&${flagged}&origin=eq.native`);
  check(active.ok && active.data.length === 1 && active.data[0].reconciliation_status === "ERROR", "a current native V4 ERROR appears in the ACTIVE queue (and is the only entry)");
  const historical = await view(`select=id,reconciliation_status,origin&${flagged}&origin=eq.legacy_import&limit=2000`);
  check(historical.ok && historical.data.length === importedFlagged, "all imported historical findings are retrievable through the historical filter");
  check(historical.data.every((r) => ["WARNING", "ERROR"].includes(r.reconciliation_status)), "imported findings keep their stored ERROR/WARNING status (never converted to OK)");
  check(!active.data.some((r) => historical.data.some((h) => h.id === r.id)), "no report is in both queues");
  check(sql("select reconciliation_status||':'||count(*) from public.sales_reports group by reconciliation_status order by 1") === storedBefore && sql("select count(*) from public.audit_logs") === auditBefore && sql("select count(*) from public.sales_report_overrides") === overridesBefore, "reading the queues changed no stored status, override or audit row");
  const anonView = await fetch(new URL("/rest/v1/sales_reports_with_origin?select=id", base), { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  check(!anonView.ok || (await anonView.json()).length === 0, "anonymous callers see no report origins");
  const cashierLogin = await fetch(new URL("/auth/v1/token?grant_type=password", base), { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify(credentials.D001) });
  const dondurmaToken = (await cashierLogin.json()).access_token;
  const dview = await view("select=id,branch_id&limit=5", dondurmaToken);
  const rumeliId = sql("select id from public.branches where key='rumeli_iskelesi'");
  check(dview.ok && dview.data.every((r) => r.branch_id !== rumeliId), "the view obeys the caller's own report visibility (a Dondurma cashier sees no Rumeli reports)");
  // ---- server-side: the operational override RPC vs imported historical evidence
  const callOverride = async (id, status = "OK", reason = "rehearsal override") =>
    fetch(new URL("/rest/v1/rpc/override_reconciliation", base), { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${ownerToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_report_id: id, p_new_status: status, p_reason: reason }) });
  const histId = historical.data[0].id;
  const histStatus = historical.data[0].reconciliation_status;
  const ovBefore = sql("select count(*) from public.sales_report_overrides");
  const audBefore = totalAudit();
  const denied = await callOverride(histId);
  const deniedText = await denied.text();
  check(!denied.ok && /historical imported reconciliation findings are evidence/.test(deniedText), "the operational override RPC refuses an imported historical report server-side");
  check(sql(`select reconciliation_status from public.sales_reports where id='${histId}'`) === histStatus && sql("select count(*) from public.sales_report_overrides") === ovBefore && totalAudit() === audBefore, "the refused call leaves the status, the overrides table and the audit log untouched");
  check(sql(`select count(*) from public.legacy_sales_report_links where sales_report_id='${histId}'`) === "1", "lineage of the historical report is intact");
  const stillThere = await view(`select=id,reconciliation_status&id=eq.${histId}&origin=eq.legacy_import`);
  check(stillThere.ok && stillThere.data.length === 1 && stillThere.data[0].reconciliation_status === histStatus, "the historical report is still readable through the historical filter");
  const nativeId = active.data[0].id;
  const okOverride = await callOverride(nativeId, "OK", "rehearsal native override");
  check(okOverride.ok && sql(`select reconciliation_status from public.sales_reports where id='${nativeId}'`) === "OK" && sql("select count(*) from public.sales_report_overrides") === String(Number(ovBefore) + 1) && totalAudit() === String(Number(audBefore) + 1), "a native V4 ERROR is still overridable by an owner exactly as before (one override row, one audit row)");
  const anonOverride = await fetch(new URL("/rest/v1/rpc/override_reconciliation", base), { method: "POST", headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_report_id: nativeId, p_new_status: "OK", p_reason: "x" }) });
  check(!anonOverride.ok, "anonymous callers cannot override");
  sql("delete from public.sales_report_overrides where sales_report_id in (select id from public.sales_reports where shift_id in (select id from public.shifts where business_date = date '2030-01-01')); delete from public.sales_reports where shift_id in (select id from public.shifts where business_date = date '2030-01-01'); delete from public.shifts where business_date = date '2030-01-01';");
}

// ------------------------------------- data-import rollback (cleanup script) --
const cleanup = fs.readFileSync(path.join(root, "supabase/rollback/v4_legacy_import_cleanup.sql"), "utf8");
const lockedCleanup = (() => {
  try {
    psql(cleanup);
    return "ran";
  } catch (e) {
    return String(e.stderr);
  }
})();
check(/locked/.test(lockedCleanup) && sql("select count(*) from public.sales_reports") === String(expTotal), "the import cleanup ships locked and deletes nothing when run as-is");
const profilesBefore = sql("select count(*) from public.profiles");
psql(cleanup.replace(/-- >>> LOCK GUARD[\s\S]*?-- <<< LOCK GUARD <<</, ""));
check(sql(countsSql) === emptyCounts, "import cleanup returns reports, lineage, runs, map, shifts and registers to the pre-import baseline");
check(sql("select count(*) from public.shift_assignments") === "0" && sql("select count(*) from public.profiles") === profilesBefore && sql("select count(*) from public.pin_credentials") === "6", "cleanup leaves identities, PINs and assignments of other origin untouched");
check(sql("select count(*) from public.legacy_reference_totals") === "7" && sql("select count(*) from public.branches") === "3", "cleanup leaves frozen references and operating data untouched");
const reapplied = cli("legacy-migration/run.mjs", [...COMMON, FP, "--apply", `--ack-dry-run=${expTotal}`]);
check(reapplied.status === 0 && JSON.parse(reapplied.stdout).result.applied === true && sql("select count(*) from public.sales_reports") === String(expTotal), "after a cleanup the same fingerprint can be imported again from scratch");
const packAgain = psql(filled, ["-F", "|"]).split("\n").filter(Boolean).map((l) => l.split("|"));
check(packAgain.every((r) => ["PASS", "INFO"].includes(r[r.length - 1])), "post-apply pack is green again after cleanup + re-import");

if (!mapOk) fs.rmSync(mapPath, { force: true });
console.log(`\nLEGACY IMPORT REHEARSAL PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`);
