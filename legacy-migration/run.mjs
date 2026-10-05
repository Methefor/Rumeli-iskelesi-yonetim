import fs from "node:fs";
import { auditLegacyRows, stableRows } from "./lib.mjs";
import {
  GuardError,
  assertImportAllowed,
  assertServiceKey,
  assertSourceFieldsSafe,
  resolveTarget,
} from "./guards.mjs";
import { readLegacySnapshot } from "./source.mjs";

/**
 * Legacy sales importer. DRY RUN by default. Every guard in guards.mjs must
 * pass before any target write; see that file for the full list. The source
 * (legacy) tables are only ever read with GET (source.mjs) and the only
 * target call is the transactional internal_run_legacy_sales_import RPC,
 * which never touches legacy tables and never accepts PINs or names.
 *
 *   node legacy-migration/run.mjs --target-ref=<local|ref> --actor=<owner-code> \
 *        --cashier-map=<private-json> --expect-fingerprint=<sha256> \
 *        [--apply --ack-dry-run=<planned reports>] \
 *        [--allow-hosted-target --allow-hosted-apply]
 */
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const valueOf = (prefix) =>
  args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);

try {
  const opts = {
    apply: flag("--apply"),
    allowHostedTarget: flag("--allow-hosted-target"),
    allowHostedApply: flag("--allow-hosted-apply"),
    targetRef: valueOf("--target-ref="),
    expectFingerprint: valueOf("--expect-fingerprint="),
    ackDryRun: valueOf("--ack-dry-run="),
  };
  const mapPath = valueOf("--cashier-map=");
  const actor = valueOf("--actor=")?.trim();
  if (!mapPath) throw new GuardError("cashier_map_required", "--cashier-map=<path> is required.");
  if (!actor) throw new GuardError("actor_required", "--actor=<owner employee code> is required.");

  // Cheap guards first: nothing touches the network until the target is valid.
  assertSourceFieldsSafe();
  resolveTarget({
    url: process.env.TARGET_SUPABASE_URL,
    targetRef: opts.targetRef,
    allowHostedTarget: opts.allowHostedTarget,
  });
  assertServiceKey(process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY);

  const cashierMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const { rows, cashierIds } = await readLegacySnapshot(); // GET only
  const audit = auditLegacyRows(rows, cashierIds);
  const target = assertImportAllowed({
    opts,
    env: process.env,
    rows,
    audit,
    cashierMap,
    cashierIds,
  });

  const response = await fetch(
    new URL("/rest/v1/rpc/internal_run_legacy_sales_import", process.env.TARGET_SUPABASE_URL),
    {
      method: "POST",
      headers: {
        apikey: process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_actor_code: actor,
        p_rows: stableRows(rows),
        p_cashier_map: cashierMap,
        p_source_fingerprint: audit.fingerprint,
        p_reason: "Approved legacy sales migration",
        p_commit: opts.apply,
      }),
    },
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(`Target import failed (${response.status}): ${text.slice(0, 500)}`);
  console.log(
    JSON.stringify(
      { mode: opts.apply ? "apply" : "dry-run", target: target.ref, audit, result: JSON.parse(text) },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    error instanceof GuardError ? `REFUSED [${error.code}]: ${error.message}` : `FAILED: ${error.message}`,
  );
  process.exitCode = error instanceof GuardError ? 3 : 1;
}
