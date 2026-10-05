/**
 * Real-source / local-target rehearsal.
 * Reads the hosted legacy source through its existing public read path, but
 * writes only to the disposable http://127.0.0.1 Supabase stack.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readLegacySnapshot } from "../../legacy-migration/source.mjs";
import {
  auditLegacyRows,
  stableRows,
  toKurus,
} from "../../legacy-migration/lib.mjs";
import { runLoader } from "../../operating-data/load.mjs";

const commandOptions = { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] };
const statusOutput = execFileSync(
  process.env.ComSpec || "cmd.exe",
  ["/d", "/s", "/c", "npx supabase status -o json"],
  commandOptions,
);
const status = JSON.parse(statusOutput);
const base = new URL(status.API_URL);
if (
  base.protocol !== "http:" ||
  base.hostname !== "127.0.0.1" ||
  base.port !== "54321"
) {
  throw new Error("LOCAL ONLY: expected http://127.0.0.1:54321");
}
const anon = status.ANON_KEY;
const service = status.SERVICE_ROLE_KEY;
const sql = (text) =>
  execFileSync(
    process.env.DOCKER_CLI || "docker",
    [
      "exec",
      "-i",
      "supabase_db_Rumeli-iskelesi-yonetim",
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();

let passed = 0;
function check(value, label) {
  if (!value) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
}
async function request(path, token, body) {
  const response = await fetch(new URL(path, base), {
    method: "POST",
    headers: {
      apikey: token,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { ok: response.ok, status: response.status, data };
}
async function makeUser(role, code, { active = true } = {}) {
  const response = await request("/auth/v1/admin/users", service, {
    email: `legacy-${code.toLowerCase()}-${Date.now()}-${randomUUID()}@migration.invalid`,
    password: `Local-${randomUUID()}!`,
    email_confirm: true,
  });
  if (!response.ok)
    throw new Error(`local auth fixture failed: ${response.status}`);
  sql(
    `insert into public.profiles(id,full_name,employee_code,is_active) values ('${response.data.id}','Legacy Test ${code}','${code}',${active}); insert into public.user_roles(user_id,role_id) select '${response.data.id}',id from public.roles where key='${role}';`,
  );
  return response.data.id;
}

await makeUser("owner", "M901");
const { rows, cashierIds } = await readLegacySnapshot();
const audit = auditLegacyRows(rows, cashierIds);
const cashierMap = {};
for (const [index, legacyId] of cashierIds.sort().entries()) {
  const active = index < 2;
  const code = active
    ? `K9${String(index + 1).padStart(2, "0")}`
    : `H9${String(index - 1).padStart(2, "0")}`;
  await makeUser("cashier", code, { active });
  cashierMap[legacyId] = code;
}
check(
  sql("select count(*) from public.profiles where employee_code like 'H9%' and not is_active") === "3" &&
    sql("select count(*) from public.pin_credentials pc join public.profiles p on p.id=pc.user_id where p.employee_code like 'H9%'") === "0",
  "former cashiers are inactive archival profiles with no PIN credentials",
);
// Expected counts are derived independently from the raw rows (never pinned):
// the live legacy app keeps adding reports, so any hard-coded total goes stale.
const expRumeli = rows.length;
const expBalik = rows.filter((r) => r.shift === "aksam" && toKurus(r.balik_ekmek) > 0).length;
const expDondurma = rows.filter((r) => r.shift === "aksam" && toKurus(r.dondurma) > 0).length;
const expTotal = expRumeli + expBalik + expDondurma;
const expTotalText = String(expTotal);
console.log(`source rows=${rows.length} plan=${expRumeli}+${expBalik}+${expDondurma}=${expTotal}`);
check(
  audit.sourceRows === rows.length && audit.unknownCashierRows === 0 &&
    audit.rumeliReports === expRumeli && audit.balikReports === expBalik && audit.dondurmaReports === expDondurma,
  "hosted legacy snapshot is complete, every report has a cashier, and the audit plan matches an independent count",
);

const loader = await runLoader({
  argv: ["--apply"],
  env: {
    SUPABASE_URL: base.toString(),
    SUPABASE_SERVICE_ROLE_KEY: service,
    OPERATING_DATA_ACTOR_CODE: "M901",
  },
});
check(
  loader.exitCode === 0 && loader.report.applied === true,
  "owner-approved operating data is loaded locally",
);

const payload = {
  p_actor_code: "M901",
  p_rows: stableRows(rows),
  p_cashier_map: cashierMap,
  p_source_fingerprint: audit.fingerprint,
  p_reason: "Local real-source migration rehearsal",
  p_commit: false,
};
const before = sql(
  `select (select count(*) from public.sales_reports)||','||(select count(*) from public.legacy_sales_report_links)||','||(select count(*) from public.legacy_sales_import_runs)`,
);
const denied = await request(
  "/rest/v1/rpc/internal_run_legacy_sales_import",
  anon,
  payload,
);
check(!denied.ok, "anon cannot call the importer");
const dry = await request(
  "/rest/v1/rpc/internal_run_legacy_sales_import",
  service,
  payload,
);
check(
  dry.ok &&
    dry.data.applied === false &&
    dry.data.result.createdReports === expTotal,
  "dry run plans exactly the independently counted Rumeli + Balık + Dondurma reports",
);
check(
  sql(
    `select (select count(*) from public.sales_reports)||','||(select count(*) from public.legacy_sales_report_links)||','||(select count(*) from public.legacy_sales_import_runs)`,
  ) === before,
  "dry run rolls back every target row",
);

payload.p_commit = true;
const applied = await request(
  "/rest/v1/rpc/internal_run_legacy_sales_import",
  service,
  payload,
);
check(
  applied.ok &&
    applied.data.applied === true &&
    applied.data.result.createdReports === expTotal,
  "apply imports the exact plan atomically",
);
check(
  sql("select count(*) from public.legacy_sales_report_links") === expTotalText,
  "every imported report has one lineage link",
);
check(
  sql("select count(*) from public.legacy_sales_import_runs") === "1",
  "one immutable import run is recorded",
);
check(
  sql(
    "select count(*) from public.registers where key in ('cafetarya','restoran') and not is_active",
  ) === "2",
  "historical register identities are preserved as inactive",
);

const zExpected = rows
  .filter((row) => row.shift === "aksam")
  .reduce(
    (total, row) =>
      total +
      toKurus(row.rumeli_z1) +
      toKurus(row.rumeli_z2) +
      toKurus(row.balik_ekmek) +
      toKurus(row.dondurma),
    0,
  );
const zActual = Number(
  sql(
    "select coalesce(round(sum(sr.gross_revenue)*100),0)::bigint from public.sales_reports sr where sr.report_type='Z'",
  ),
);
check(
  zActual === zExpected,
  "V4 Z revenue equals the current legacy Z components to the kuruş",
);
check(
  sql(
    "select count(*) from public.sales_reports where branch_id=(select id from public.branches where key='balik_ekmek') and reconciliation_status<>'ERROR'",
  ) === "0",
  "Balık reports disclose the missing historical category split",
);
check(
  sql(
    "select count(*) from public.sales_reports where branch_id=(select id from public.branches where key='iskele_dondurma') and reconciliation_status<>'ERROR'",
  ) === "0",
  "Dondurma reports disclose the missing historical category split",
);

const again = await request(
  "/rest/v1/rpc/internal_run_legacy_sales_import",
  service,
  payload,
);
check(
  again.ok &&
    again.data.alreadyImported === true &&
    sql("select count(*) from public.sales_reports") === expTotalText,
  "same fingerprint is idempotent and creates no duplicates",
);

const changedRows = stableRows(rows);
changedRows[0] = {
  ...changedRows[0],
  rumeli_z1: Number(changedRows[0].rumeli_z1) + 1,
};
const drift = await request(
  "/rest/v1/rpc/internal_run_legacy_sales_import",
  service,
  {
    ...payload,
    p_rows: changedRows,
    p_source_fingerprint: `${audit.fingerprint}-changed`,
    p_commit: false,
  },
);
check(
  !drift.ok && JSON.stringify(drift.data).includes("source drift"),
  "changed source rows are rejected instead of silently overwriting history",
);

console.log(`\n${passed} legacy import assertions passed.`);
