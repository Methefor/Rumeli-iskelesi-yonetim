import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import {
  APPROVED_PRODUCTION_REF,
  GuardError,
  approvalPhrase,
  assertCashierMap,
  assertFingerprint,
  assertImportAllowed,
  assertServiceKey,
  assertSourceFieldsSafe,
  plannedReportCount,
  resolveTarget,
} from "./guards.mjs";
import { LEGACY_FIELDS } from "./lib.mjs";

const code = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof GuardError, `unexpected error ${e}`);
    return e.code;
  }
  return "NO_ERROR";
};
const jwt = (role) =>
  `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.sig`;
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const FP = "a".repeat(64);
const rows = [
  { id: "1", shift: "sabah", balik_ekmek: 0, dondurma: 0 },
  { id: "2", shift: "aksam", balik_ekmek: 10, dondurma: 0 },
  { id: "3", shift: "aksam", balik_ekmek: 5, dondurma: 7 },
];
const audit = { fingerprint: FP };
const base = () => ({
  opts: { apply: false, targetRef: "local", expectFingerprint: FP },
  env: { TARGET_SUPABASE_URL: "http://127.0.0.1:54321", TARGET_SUPABASE_SERVICE_ROLE_KEY: jwt("service_role") },
  rows,
  audit,
  cashierMap: { [U1]: "K001", [U2]: "H001" },
  cashierIds: [U1, U2],
});

test("target: an explicit ref is mandatory and must match the URL", () => {
  assert.equal(code(() => resolveTarget({ url: "http://127.0.0.1:54321" })), "target_ref_required");
  assert.equal(code(() => resolveTarget({ url: "http://127.0.0.1:54321", targetRef: APPROVED_PRODUCTION_REF })), "target_ref_mismatch");
  assert.deepEqual(resolveTarget({ url: "http://localhost:54321", targetRef: "local" }), { kind: "local", ref: "local" });
});

test("target: wrong project, wrong host and missing hosted flag are all refused", () => {
  const other = "abcdefghijklmnopqrst";
  assert.equal(code(() => resolveTarget({ url: `https://${other}.supabase.co`, targetRef: other, allowHostedTarget: true })), "target_ref_not_approved");
  assert.equal(code(() => resolveTarget({ url: `https://${APPROVED_PRODUCTION_REF}.supabase.co`, targetRef: other })), "target_ref_mismatch");
  assert.equal(code(() => resolveTarget({ url: `https://${APPROVED_PRODUCTION_REF}.supabase.co`, targetRef: APPROVED_PRODUCTION_REF })), "hosted_target_refused");
  assert.equal(code(() => resolveTarget({ url: "https://example.com", targetRef: "x", allowHostedTarget: true })), "target_host_refused");
  assert.equal(code(() => resolveTarget({ url: "https://127.0.0.1", targetRef: "local" })), "target_url_invalid");
  assert.equal(code(() => resolveTarget({ url: "", targetRef: "local" })), "target_url_invalid");
  assert.equal(resolveTarget({ url: `https://${APPROVED_PRODUCTION_REF}.supabase.co`, targetRef: APPROVED_PRODUCTION_REF, allowHostedTarget: true }).kind, "hosted");
});

test("service key: only service-role keys are accepted", () => {
  assert.equal(code(() => assertServiceKey("")), "service_key_missing");
  assert.equal(code(() => assertServiceKey(jwt("anon"))), "service_key_wrong_role");
  assert.equal(code(() => assertServiceKey("not-a-jwt")), "service_key_wrong_role");
  assert.equal(assertServiceKey(jwt("service_role")), true);
  assert.equal(assertServiceKey("sb_secret_x"), true);
});

test("fingerprint is required in every mode and drift blocks the run", () => {
  assert.equal(code(() => assertFingerprint({ expected: undefined, actual: FP })), "fingerprint_required");
  assert.equal(code(() => assertFingerprint({ expected: "b".repeat(64), actual: FP })), "source_drift");
  assert.doesNotThrow(() => assertFingerprint({ expected: FP, actual: FP }));
  const noFp = base();
  delete noFp.opts.expectFingerprint;
  assert.equal(code(() => assertImportAllowed(noFp)), "fingerprint_required");
});

test("legacy PINs and personal names can never enter the source field list", () => {
  assert.equal(assertSourceFieldsSafe(LEGACY_FIELDS), true);
  assert.equal(code(() => assertSourceFieldsSafe([...LEGACY_FIELDS, "pin"])), "legacy_pii_field");
  assert.equal(code(() => assertSourceFieldsSafe([...LEGACY_FIELDS, "cashier_name"])), "legacy_pii_field");
  const source = fs.readFileSync(new URL("./source.mjs", import.meta.url), "utf8");
  assert.match(source, /cashiers\?select=id&/, "cashiers are read by id only");
  assert.doesNotMatch(source, /method\s*:/i, "the legacy source is only ever read with GET");
  assert.doesNotMatch(source, /\b(POST|PATCH|PUT|DELETE)\b/);
});

test("the importer RPC and the target function never write legacy tables or accept PINs", () => {
  const sql = fs.readFileSync(new URL("../supabase/migrations/20261001204651_legacy_sales_import.sql", import.meta.url), "utf8");
  assert.doesNotMatch(sql, /\b(insert\s+into|update|delete\s+from)\s+(public\.)?(daily_reports|cashiers|admins|entry_history)\b/i);
  assert.doesNotMatch(sql, /\bpin_credentials\b/i, "the importer never creates or reads PIN credentials");
  const run = fs.readFileSync(new URL("./run.mjs", import.meta.url), "utf8");
  assert.equal((run.match(/rest\/v1\/rpc\//g) ?? []).length, 1, "exactly one target call");
  assert.match(run, /rpc\/internal_run_legacy_sales_import/);
});

test("cashier map: UUID keys, employee-code values, no duplicates, exact coverage", () => {
  assert.equal(assertCashierMap({ [U1]: "K001", [U2]: "H001" }, [U1, U2]), true);
  assert.equal(code(() => assertCashierMap({ "1234": "K001" })), "cashier_map_invalid");
  assert.equal(code(() => assertCashierMap({ [U1]: "1234" })), "cashier_map_invalid");
  assert.equal(code(() => assertCashierMap({ [U1]: "K001", [U2]: "K001" })), "cashier_map_duplicate");
  assert.equal(code(() => assertCashierMap({ [U1]: "K001" }, [U1, U2])), "cashier_map_coverage");
  assert.equal(code(() => assertCashierMap({ [U1]: "K001", [U2]: "H001" }, [U1])), "cashier_map_coverage");
  assert.equal(code(() => assertCashierMap({})), "cashier_map_invalid");
  assert.equal(code(() => assertCashierMap([])), "cashier_map_invalid");
});

test("apply needs a dry-run acknowledgement equal to the recomputed plan", () => {
  assert.equal(plannedReportCount(rows), 3 + 2 + 1);
  const ok = base();
  ok.opts.apply = true;
  assert.equal(code(() => assertImportAllowed(ok)), "dry_run_ack_required");
  ok.opts.ackDryRun = "5";
  assert.equal(code(() => assertImportAllowed(ok)), "dry_run_ack_required");
  ok.opts.ackDryRun = "6";
  assert.equal(assertImportAllowed(ok).kind, "local");
});

test("hosted apply is refused unless every explicit approval is present", () => {
  const hosted = () => {
    const c = base();
    c.opts = { apply: true, targetRef: APPROVED_PRODUCTION_REF, allowHostedTarget: true, expectFingerprint: FP, ackDryRun: "6" };
    c.env.TARGET_SUPABASE_URL = `https://${APPROVED_PRODUCTION_REF}.supabase.co`;
    return c;
  };
  assert.equal(code(() => assertImportAllowed(hosted())), "hosted_apply_refused");
  const withFlag = hosted();
  withFlag.opts.allowHostedApply = true;
  assert.equal(code(() => assertImportAllowed(withFlag)), "owner_approval_missing");
  withFlag.env.LEGACY_IMPORT_OWNER_APPROVAL = "approve:wrong";
  assert.equal(code(() => assertImportAllowed(withFlag)), "owner_approval_missing");
  withFlag.env.LEGACY_IMPORT_OWNER_APPROVAL = approvalPhrase(APPROVED_PRODUCTION_REF, "b".repeat(64));
  assert.equal(code(() => assertImportAllowed(withFlag)), "owner_approval_missing", "approval is bound to the fingerprint");
  withFlag.env.LEGACY_IMPORT_OWNER_APPROVAL = approvalPhrase(APPROVED_PRODUCTION_REF, FP);
  assert.equal(assertImportAllowed(withFlag).kind, "hosted");
  // a hosted DRY RUN needs no approval phrase but still needs every other guard
  const dry = hosted();
  dry.opts.apply = false;
  assert.equal(assertImportAllowed(dry).kind, "hosted");
});

test("run.mjs refuses to start without a target ref, before any network access", () => {
  const result = spawnSync(process.execPath, ["legacy-migration/run.mjs", "--actor=M001", "--cashier-map=missing.json"], {
    cwd: new URL("..", import.meta.url),
    encoding: "utf8",
    env: { ...process.env, TARGET_SUPABASE_URL: "http://127.0.0.1:1", TARGET_SUPABASE_SERVICE_ROLE_KEY: "" },
  });
  assert.equal(result.status, 3);
  assert.match(result.stderr, /REFUSED \[target_ref_required\]/);
});
