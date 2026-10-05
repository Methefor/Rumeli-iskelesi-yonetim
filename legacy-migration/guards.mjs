/**
 * Fail-closed guards for the legacy sales importer (run.mjs).
 *
 * Every function here is pure and throws GuardError with a stable `code`, so
 * the refusal reasons are unit-tested (guards.test.mjs) and the importer can
 * never reach the network unless every guard passes. Nothing here prints or
 * returns a credential.
 *
 * Hosted (production) apply stays REFUSED unless ALL of these hold:
 *   --target-ref=<ref> equals the ref in the target URL AND the approved
 *   production ref, --allow-hosted-target, --allow-hosted-apply,
 *   --expect-fingerprint equals the freshly audited source fingerprint,
 *   --ack-dry-run equals the locally recomputed planned report count, and
 *   the operator shell carries LEGACY_IMPORT_OWNER_APPROVAL with the exact
 *   per-run phrase approve:<ref>:<first 12 chars of the fingerprint>.
 * Running that is a production write: it REQUIRES EXPLICIT OWNER APPROVAL.
 */
import { LEGACY_FIELDS, toKurus } from "./lib.mjs";

/** The only hosted project this importer may ever be pointed at. */
export const APPROVED_PRODUCTION_REF = "iwikwbjsznjuefvuemdb";

export class GuardError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
const fail = (code, message) => {
  throw new GuardError(code, message);
};

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const EMPLOYEE_CODE = /^[A-Z][0-9]{2,4}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Legacy columns that must never be read (plaintext PINs, personal names). */
const FORBIDDEN_FIELDS = /(^|_)(pin|password|passwd|secret|token|name|email|phone)($|_)/i;

export function assertSourceFieldsSafe(fields = LEGACY_FIELDS) {
  const bad = fields.filter((f) => FORBIDDEN_FIELDS.test(f));
  if (bad.length)
    fail("legacy_pii_field", `Source field list contains forbidden columns: ${bad.join(", ")}`);
  return true;
}

/** Decodes a JWT role claim without verifying or logging anything. */
function jwtRole(key) {
  try {
    const payload = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"));
    return payload.role ?? null;
  } catch {
    return null;
  }
}

export function resolveTarget({ url, targetRef, allowHostedTarget = false }) {
  if (!targetRef) fail("target_ref_required", "--target-ref=<ref> is required (use 'local' for a local stack).");
  let parsed;
  try {
    parsed = new URL(url ?? "");
  } catch {
    fail("target_url_invalid", "TARGET_SUPABASE_URL is missing or invalid.");
  }
  if (LOCAL_HOSTS.has(parsed.hostname)) {
    if (parsed.protocol !== "http:") fail("target_url_invalid", "A local target must use http://.");
    if (targetRef !== "local")
      fail("target_ref_mismatch", "A local URL requires --target-ref=local.");
    return { kind: "local", ref: "local" };
  }
  const match = /^([a-z0-9]{20})\.supabase\.co$/.exec(parsed.hostname);
  if (parsed.protocol !== "https:" || !match)
    fail("target_host_refused", "Only 127.0.0.1/localhost or https://<ref>.supabase.co targets are accepted.");
  if (match[1] !== targetRef)
    fail("target_ref_mismatch", "--target-ref does not match the target URL project ref.");
  if (targetRef !== APPROVED_PRODUCTION_REF)
    fail("target_ref_not_approved", "This hosted project is not the approved production project.");
  if (!allowHostedTarget)
    fail("hosted_target_refused", "Hosted target refused without --allow-hosted-target.");
  return { kind: "hosted", ref: targetRef };
}

export function assertServiceKey(key) {
  if (!key) fail("service_key_missing", "Target service-role key is missing from the operator shell.");
  if (key.startsWith("sb_secret_")) return true;
  if (jwtRole(key) !== "service_role")
    fail("service_key_wrong_role", "The target key is not a service-role key (anon/other keys are refused).");
  return true;
}

export function plannedReportCount(rows) {
  const z = rows.filter((r) => r.shift === "aksam");
  return (
    rows.length +
    z.filter((r) => toKurus(r.balik_ekmek) > 0).length +
    z.filter((r) => toKurus(r.dondurma) > 0).length
  );
}

export function assertFingerprint({ expected, actual }) {
  if (!expected)
    fail("fingerprint_required", "--expect-fingerprint=<sha256> is required in every mode.");
  if (expected !== actual)
    fail(
      "source_drift",
      "Source fingerprint differs from the audited value: DATA APPLY BLOCKED until the new audit is reviewed.",
    );
}

export function assertCashierMap(map, knownCashierIds = []) {
  if (!map || typeof map !== "object" || Array.isArray(map))
    fail("cashier_map_invalid", "The cashier map must be a JSON object of legacy UUID to employee code.");
  const entries = Object.entries(map);
  if (entries.length === 0) fail("cashier_map_invalid", "The cashier map is empty.");
  const seenCodes = new Set();
  for (const [legacyId, code] of entries) {
    if (!UUID.test(legacyId))
      fail("cashier_map_invalid", "Every cashier map key must be a legacy UUID (PIN-like keys are refused).");
    if (typeof code !== "string" || !EMPLOYEE_CODE.test(code))
      fail("cashier_map_invalid", "Every cashier map value must be an employee code such as K001 or H001.");
    if (seenCodes.has(code))
      fail("cashier_map_duplicate", "Two legacy identities map to the same V4 profile.");
    seenCodes.add(code);
  }
  if (knownCashierIds.length > 0) {
    const known = new Set(knownCashierIds);
    const missing = knownCashierIds.filter((id) => !(id in map));
    const extra = Object.keys(map).filter((id) => !known.has(id));
    if (missing.length || extra.length)
      fail(
        "cashier_map_coverage",
        `The cashier map must cover exactly the source cashiers (missing ${missing.length}, unknown ${extra.length}).`,
      );
  }
  return true;
}

export function approvalPhrase(ref, fingerprint) {
  return `approve:${ref}:${fingerprint.slice(0, 12)}`;
}

/**
 * Single entry point used by run.mjs before any network write. Returns the
 * resolved target; throws GuardError otherwise.
 */
export function assertImportAllowed({ opts, env, rows, audit, cashierMap, cashierIds }) {
  assertSourceFieldsSafe();
  const target = resolveTarget({
    url: env.TARGET_SUPABASE_URL,
    targetRef: opts.targetRef,
    allowHostedTarget: opts.allowHostedTarget,
  });
  assertServiceKey(env.TARGET_SUPABASE_SERVICE_ROLE_KEY);
  assertFingerprint({ expected: opts.expectFingerprint, actual: audit.fingerprint });
  assertCashierMap(cashierMap, cashierIds);
  if (opts.apply) {
    const planned = plannedReportCount(rows);
    if (!opts.ackDryRun || Number(opts.ackDryRun) !== planned)
      fail(
        "dry_run_ack_required",
        `Apply requires --ack-dry-run=<planned report count> from a reviewed dry run (current plan: ${planned}).`,
      );
    if (target.kind === "hosted") {
      if (!opts.allowHostedApply)
        fail("hosted_apply_refused", "Hosted apply is refused without --allow-hosted-apply.");
      if (env.LEGACY_IMPORT_OWNER_APPROVAL !== approvalPhrase(target.ref, audit.fingerprint))
        fail(
          "owner_approval_missing",
          "Hosted apply requires the per-run owner approval phrase in LEGACY_IMPORT_OWNER_APPROVAL.",
        );
    }
  }
  return target;
}
