/**
 * LOCAL rehearsal of operating-data/run-production.mjs (fresh reset first):
 *   node supabase/tests/operating_data_production_runner.test.mjs
 * Hosted cases are refused before any network call; nothing here contacts production.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { datasetHash, runProduction } from "../../operating-data/run-production.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const realDir = path.join(root, "operating-data/real");
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
const cli = (args, env = {}) =>
  spawnSync(process.execPath, [path.join(root, "operating-data/run-production.mjs"), ...args], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, TARGET_SUPABASE_URL: URL_LOCAL, TARGET_SUPABASE_SERVICE_ROLE_KEY: service, ...env },
  });
const dataCounts = () =>
  sql("select (select count(*) from public.registers)||','||(select count(*) from public.sales_category_branches)||','||(select count(*) from public.operating_data_provenance)||','||(select count(*) from public.audit_logs)||','||(select string_agg(key||start_hour||end_hour||cutoff_hour||is_active, ',' order by branch_id, key) from public.shift_definitions)||','||(select count(*) from public.reconciliation_thresholds)");

// owner actor fixture (normal path would be bootstrap-owner.mjs)
sql(`insert into auth.users(id,instance_id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','runner-owner@x.invalid','x',now(),now(),now(),'{}','{}'); insert into public.profiles(id,full_name,employee_code) values ('00000000-0000-0000-0000-0000000000c1','Runner owner','M901'); insert into public.user_roles(user_id,role_id) select '00000000-0000-0000-0000-0000000000c1', id from public.roles where key='owner';`);

const HASH = datasetHash(realDir);
const ARGS = ["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${HASH}`];
const baseline = dataCounts();
const PROD = { TARGET_SUPABASE_URL: "https://iwikwbjsznjuefvuemdb.supabase.co" };

check(/^[0-9a-f]{64}$/.test(HASH), "the approved dataset has a stable SHA-256");
check(datasetHash(realDir) === HASH, "the dataset hash is deterministic");

// ----------------------------------------------------------------- refusals --
const noRef = cli(["--actor-code=M901", `--dataset-sha256=${HASH}`]);
check(noRef.status === 3 && /target_ref_required/.test(noRef.stderr), "missing target ref is rejected");
const wrongRef = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--actor-code=M901", `--dataset-sha256=${HASH}`]);
check(wrongRef.status === 3 && /target_ref_mismatch/.test(wrongRef.stderr), "wrong project (ref does not match the URL) is rejected");
const otherProj = cli(["--target-ref=abcdefghijklmnopqrst", "--allow-hosted-target", "--actor-code=M901", `--dataset-sha256=${HASH}`], { TARGET_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" });
check(otherProj.status === 3 && /target_ref_not_approved/.test(otherProj.stderr), "a hosted project other than the approved production ref is rejected");
const hostedNoFlag = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--actor-code=M901", `--dataset-sha256=${HASH}`], PROD);
check(hostedNoFlag.status === 3 && /hosted_target_refused/.test(hostedNoFlag.stderr), "a hosted target without --allow-hosted-target is rejected (no network)");
const anonKey = cli(ARGS, { TARGET_SUPABASE_SERVICE_ROLE_KEY: anon });
check(anonKey.status === 3 && /service_key_wrong_role/.test(anonKey.stderr), "an anon key is rejected");
const noHash = cli(["--target-ref=local", "--actor-code=M901"]);
check(noHash.status === 3 && /dataset_hash_required/.test(noHash.stderr), "a missing dataset hash is rejected");
const badHash = cli(["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${"0".repeat(64)}`]);
check(badHash.status === 3 && /dataset_hash_mismatch/.test(badHash.stderr) && dataCounts() === baseline, "a wrong dataset hash is rejected and nothing changes");
const hostedApplyNoFlag = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--allow-hosted-target", "--actor-code=M901", `--dataset-sha256=${HASH}`, "--apply", "--ack-plan=x"], PROD);
check(hostedApplyNoFlag.status === 3 && /hosted_apply_refused/.test(hostedApplyNoFlag.stderr), "hosted apply without --allow-hosted-apply is rejected (no network)");
const hostedNoPhrase = cli(["--target-ref=iwikwbjsznjuefvuemdb", "--allow-hosted-target", "--allow-hosted-apply", "--actor-code=M901", `--dataset-sha256=${HASH}`, "--apply", "--ack-plan=x"], { ...PROD, OPERATING_DATA_APPROVAL: "approve-operating-data:wrong" });
check(hostedNoPhrase.status === 3 && /owner_approval_missing/.test(hostedNoPhrase.stderr), "hosted apply without the run-specific owner phrase is rejected (no network)");

// unapproved / demo rows: build variants of the real dataset and pin THEIR hash
const variant = (mutate) => {
  const dir = mkdtempSync(path.join(tmpdir(), "od-prod-"));
  cpSync(realDir, dir, { recursive: true });
  mutate(dir);
  return dir;
};
const edit = (dir, file, fn) => writeFileSync(path.join(dir, file), fn(readFileSync(path.join(dir, file), "utf8")));
const pending = variant((d) => edit(d, "registers.csv", (t) => t.replace(/,approved,/, ",pending,")));
const rPending = cli(["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${datasetHash(pending)}`, `--dir=${pending}`]);
check(rPending.status === 3 && /dataset_not_fully_approved/.test(rPending.stderr) && dataCounts() === baseline, "a pending (unapproved) row refuses the whole run");
const demo = variant((d) => edit(d, "registers.csv", (t) => t.replace(/,(confirmed|legacy_observed),approved,/, ",demo_only,approved,")));
const rDemo = cli(["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${datasetHash(demo)}`, `--dir=${demo}`]);
check(rDemo.status === 3 && /dataset_invalid/.test(rDemo.stderr) && /demo_only/.test(rDemo.stderr), "demo-only data is refused");
const unknown = variant((d) => edit(d, "registers.csv", (t) => t.replace(/,(confirmed|legacy_observed),approved,/, ",unknown,approved,")));
const rUnknown = cli(["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${datasetHash(unknown)}`, `--dir=${unknown}`]);
check(rUnknown.status === 3 && /dataset_invalid/.test(rUnknown.stderr), "unknown-but-approved data is refused");
check(dataCounts() === baseline, "none of the refusals changed the database");

// ------------------------------------------------------------------ dry run --
const dry = cli(ARGS);
check(dry.status === 0, "dry run succeeds");
const dryOut = JSON.parse(dry.stdout);
check(dryOut.mode === "dry-run" && dryOut.applied === false && dryOut.datasetSha256 === HASH && /^[0-9a-f]{64}$/.test(dryOut.planDigest) && dryOut.proposed.length > 0, "dry run prints the proposed changes, the dataset hash and a plan digest");
check(dataCounts() === baseline, "dry run changed nothing");
check(!dry.stdout.includes(service) && !dry.stderr.includes(service), "the service key is never printed");

// -------------------------------------------------- apply is a second step ---
const noAck = cli([...ARGS, "--apply"]);
check(noAck.status === 3 && /plan_ack_required/.test(noAck.stderr) && dataCounts() === baseline, "apply without the reviewed plan digest is rejected");
const badAck = cli([...ARGS, "--apply", "--ack-plan=deadbeef"]);
check(badAck.status === 3 && /plan_ack_required/.test(badAck.stderr) && dataCounts() === baseline, "apply with a wrong plan digest is rejected");

// partial failure: the commit call is corrupted after the dry run passed -> all or nothing
{
  let calls = 0;
  const stub = (url, init) => {
    if (String(url).includes("/rpc/internal_run_operating_data")) {
      const body = JSON.parse(init.body);
      calls += 1;
      if (body.p_commit) {
        const row = body.p_payload.registers[0];
        body.p_payload.registers[0] = { ...row, branch_key: "no_such_branch" };
        init = { ...init, body: JSON.stringify(body) };
      }
    }
    return fetch(url, init);
  };
  let message = "";
  try {
    await runProduction({ argv: [...ARGS, "--apply", `--ack-plan=${dryOut.planDigest}`], env: { TARGET_SUPABASE_URL: URL_LOCAL, TARGET_SUPABASE_SERVICE_ROLE_KEY: service }, fetchImpl: stub });
  } catch (e) {
    message = String(e.code ?? e.message);
  }
  check(calls === 2 && /apply_failed/.test(message) && dataCounts() === baseline, "a partial failure rolls the whole run back (nothing applied)");
}

// ----------------------------------------------------------------- success --
const applied = cli([...ARGS, "--apply", `--ack-plan=${dryOut.planDigest}`]);
check(applied.status === 0 && JSON.parse(applied.stdout).applied === true, "local rehearsal apply succeeds with the reviewed plan digest");
const afterApply = dataCounts();
check(afterApply !== baseline, "the approved configuration is now loaded");
check(sql("select count(*) from public.operating_data_provenance where classification='confirmed' or classification='legacy_observed'") !== "0" && sql("select count(*) from public.audit_logs where action='operating_data_load'") !== "0", "provenance and audit rows were written by the audited database path");
const again = cli(ARGS);
const againOut = JSON.parse(again.stdout);
check(again.status === 0 && againOut.totals.created === 0 && againOut.totals.updated === 0, "a repeated approved dataset is a no-op plan (idempotent)");
const auditBefore = sql("select count(*) from public.audit_logs");
const applied2 = cli([...ARGS, "--apply", `--ack-plan=${againOut.planDigest}`]);
check(applied2.status === 0 && sql("select count(*) from public.audit_logs") === auditBefore && dataCounts() === afterApply, "re-applying the same dataset changes and audits nothing");

// ------------------------------------------- history keeps its meaning --------
sql("insert into public.shifts(branch_id,shift_definition_id,business_date,status) select sd.branch_id, sd.id, current_date, 'closed' from public.shift_definitions sd join public.branches b on b.id=sd.branch_id where b.key='rumeli_iskelesi' and sd.key='morning'");
const moved = variant((d) => edit(d, "shift_definitions.csv", (t) => t.replace(/(rumeli_iskelesi,morning,[^,]*,)09:00,17:30,17:30/, "$110:00,18:00,18:00")));
const rMoved = cli(["--target-ref=local", "--actor-code=M901", `--dataset-sha256=${datasetHash(moved)}`, `--dir=${moved}`]);
check(rMoved.status === 3 && /history_in_use/.test(rMoved.stderr) && dataCounts() === afterApply, "changing a shift definition that historical shifts use is refused");

// ------------------------------------------------------- no legacy writes ----
const src = readFileSync(path.join(root, "operating-data/run-production.mjs"), "utf8");
check(!/daily_reports|cashiers|entry_history|admins/.test(src.replace(/\/\*[\s\S]*?\*\//, "")), "the production runner never references a legacy table");
const loaderSrc = readFileSync(path.join(root, "operating-data/load.mjs"), "utf8");
check(/assertLocalUrl\(urlRaw\)/.test(loaderSrc) && /LOCAL ONLY/.test(loaderSrc), "the local loader keeps its localhost-only guard untouched");

console.log(`\nPRODUCTION OPERATING-DATA RUNNER PASSED: ${passed} assertions. Reset the local database now.`);
