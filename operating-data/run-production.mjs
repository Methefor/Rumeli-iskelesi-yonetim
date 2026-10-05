#!/usr/bin/env node
/**
 * PRODUCTION operating-data runner. The local loader (load.mjs) stays local-only and
 * is untouched; this runner reuses its validator, dataset files and the SAME audited
 * database function (internal_run_operating_data: one transaction, owner actor,
 * provenance + audit) so no business logic is forked.
 *
 *   node operating-data/run-production.mjs --target-ref=<local|ref> --actor-code=M001 \
 *        --dataset-sha256=<hash> [--allow-hosted-target]                 # dry run
 *   ... --apply --ack-plan=<planDigest> [--allow-hosted-apply]           # second invocation
 *
 * Fail-closed rules: explicit target ref (the approved production ref only, for hosted);
 * service-role key only; the committed `real` dataset must hash to --dataset-sha256;
 * ANY pending/rejected/unknown/demo-only/skipped row refuses the whole run; the plan is
 * printed before any apply; apply must be a SECOND invocation that carries the digest of
 * the reviewed dry-run plan and re-derives it first; hosted apply also needs
 * --allow-hosted-apply and OPERATING_DATA_APPROVAL=approve-operating-data:<ref>:<hash12>
 * (a production WRITE: REQUIRES EXPLICIT OWNER APPROVAL BEFORE EXECUTION). No legacy table
 * is ever referenced. Changing a shift definition that historical shifts already use is
 * refused (it would rewrite the meaning of history).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { GuardError, assertServiceKey, resolveTarget } from "../legacy-migration/guards.mjs";
import { GROUPS } from "./contract.mjs";
import { buildPayload, validateDataset } from "./validate.mjs";
import { istanbulToday } from "./load.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/** Stable across CRLF/LF checkouts: group name + LF-normalised content, in contract order. */
export function datasetHash(dir) {
  const h = createHash("sha256");
  for (const g of GROUPS) {
    const p = join(dir, `${g}.csv`);
    h.update(`${g}\0`);
    if (existsSync(p)) h.update(readFileSync(p, "utf8").replace(/\r\n/g, "\n"));
    h.update("\0");
  }
  return h.digest("hex");
}

export const approvalFor = (ref, hash) => `approve-operating-data:${ref}:${hash.slice(0, 12)}`;

const fail = (code, message) => {
  throw new GuardError(code, message);
};

export async function runProduction({ argv, env, fetchImpl = fetch, now = new Date() }) {
  const flag = (n) => argv.includes(n);
  const value = (p) => argv.find((a) => a.startsWith(p))?.slice(p.length);
  const apply = flag("--apply");
  const dir = resolve(value("--dir=") ?? join(HERE, "real"));

  const target = resolveTarget({
    url: env.TARGET_SUPABASE_URL,
    targetRef: value("--target-ref="),
    allowHostedTarget: flag("--allow-hosted-target"),
  });
  assertServiceKey(env.TARGET_SUPABASE_SERVICE_ROLE_KEY);
  const actor = value("--actor-code=");
  if (!actor) fail("actor_required", "--actor-code=<owner employee code> is required.");

  const hash = datasetHash(dir);
  const expected = value("--dataset-sha256=");
  if (!expected) fail("dataset_hash_required", "--dataset-sha256=<hash> is required (pin the reviewed dataset).");
  if (expected !== hash) fail("dataset_hash_mismatch", "The dataset differs from the reviewed SHA-256: refusing to run.");

  if (apply && target.kind === "hosted") {
    if (!flag("--allow-hosted-apply")) fail("hosted_apply_refused", "Hosted apply is refused without --allow-hosted-apply.");
    if (env.OPERATING_DATA_APPROVAL !== approvalFor(target.ref, hash))
      fail("owner_approval_missing", "Hosted apply requires the run-specific OPERATING_DATA_APPROVAL phrase.");
  }

  // Dataset must be fully approved real data: nothing pending/rejected/unknown/demo/skipped.
  const files = {};
  for (const g of GROUPS) files[g] = existsSync(join(dir, `${g}.csv`)) ? readFileSync(join(dir, `${g}.csv`), "utf8") : null;
  const { entries, counts } = validateDataset({ dataset: "real", files, baseBranchKeys: [], today: istanbulToday(now) });
  if (counts.rejected > 0) {
    const first = entries.filter((e) => e.status === "rejected").slice(0, 5).map((e) => `${e.group} line ${e.row}: ${e.message}`);
    fail("dataset_invalid", `${counts.rejected} row(s) are invalid (demo-only, unknown-but-approved, malformed...): ${first.join(" | ")}`);
  }
  if (counts.skipped > 0)
    fail("dataset_not_fully_approved", `${counts.skipped} row(s) are pending/rejected: production runs only a fully approved dataset.`);
  const payload = buildPayload("real", entries);

  const base = env.TARGET_SUPABASE_URL;
  const key = env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
  const call = async (path, init = {}) => {
    const response = await fetchImpl(new URL(path, base), {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    });
    const text = await response.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  };
  const run = async (commit) => {
    const r = await call("/rest/v1/rpc/internal_run_operating_data", {
      method: "POST",
      body: JSON.stringify({ p_actor_code: actor, p_payload: payload, p_commit: commit }),
    });
    if (!r.ok) fail("database_refused", `The database refused the run (HTTP ${r.status}): ${r.data?.message ?? "no detail"}`);
    return r.data;
  };
  const plan = (db) => {
    const totals = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
    for (const r of db.results) totals[r.status] = (totals[r.status] ?? 0) + 1;
    const lines = db.results.filter((r) => r.status !== "unchanged").map((r) => `${r.status} ${r.group}#${r.row} ${r.key}${r.message ? `: ${r.message}` : ""}`);
    const digest = createHash("sha256").update(JSON.stringify(db.results.map((r) => [r.group, r.row, r.key, r.status]))).digest("hex");
    return { totals, lines, digest };
  };

  const dry = await run(false); // the database executes the exact apply path, then rolls it back
  const p = plan(dry);
  if (p.totals.rejected > 0) fail("plan_rejected", `The database would reject ${p.totals.rejected} row(s): ${p.lines.filter((l) => l.startsWith("rejected")).slice(0, 5).join(" | ")}`);
  // Never rewrite the meaning of history: shift definitions in use may not change.
  if (dry.results.some((r) => r.group === "shift_definitions" && r.status === "updated")) {
    const used = await call("/rest/v1/shifts?select=id&limit=1");
    if (used.ok && used.data.length > 0)
      fail("history_in_use", "A shift definition that existing shifts use would change: refusing (history must keep its meaning).");
  }
  const report = { mode: apply ? "apply" : "dry-run", target: target.ref, datasetSha256: hash, totals: p.totals, planDigest: p.digest, proposed: p.lines, applied: false };
  if (!apply) return report;

  const ack = value("--ack-plan=");
  if (!ack || ack !== p.digest)
    fail("plan_ack_required", "Apply is a second invocation: pass --ack-plan=<planDigest> from the reviewed dry run (the plan is re-derived and must match).");
  const committed = await run(true);
  if (!committed.applied) fail("apply_failed", "The database did not commit (everything was rolled back).");
  return { ...report, applied: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await runProduction({ argv: process.argv.slice(2), env: process.env }), null, 2));
  } catch (error) {
    console.error(error instanceof GuardError ? `REFUSED [${error.code}]: ${error.message}` : `FAILED: ${error.message}`);
    process.exitCode = error instanceof GuardError ? 3 : 1;
  }
}
