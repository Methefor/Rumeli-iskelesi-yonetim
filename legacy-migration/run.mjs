import fs from "node:fs";
import { auditLegacyRows, stableRows } from "./lib.mjs";
import { readLegacySnapshot } from "./source.mjs";

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const allowHosted = args.has("--allow-hosted-target");
const valueOf = (prefix) =>
  process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
const mapPath = valueOf("--cashier-map=");
const actor = valueOf("--actor=")?.trim();
if (!mapPath) throw new Error("--cashier-map=<path> zorunludur.");
if (!actor) throw new Error("--actor=<owner employee code> zorunludur.");

const targetUrl = process.env.TARGET_SUPABASE_URL;
const serviceKey = process.env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
if (!targetUrl || !serviceKey)
  throw new Error("Target Supabase environment is missing.");
const target = new URL(targetUrl);
const local = target.protocol === "http:" && target.hostname === "127.0.0.1";
if (!local && !allowHosted)
  throw new Error("Hosted target refused without --allow-hosted-target.");
if (!local && apply)
  throw new Error(
    "Hosted apply is intentionally disabled; use the reviewed production runbook.",
  );

const cashierMap = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const { rows, cashierIds } = await readLegacySnapshot();
const audit = auditLegacyRows(rows, cashierIds);
const expected = valueOf("--confirm-fingerprint=");
if (apply && expected !== audit.fingerprint) {
  throw new Error(
    "Apply requires the exact audited --confirm-fingerprint value.",
  );
}

const response = await fetch(
  new URL("/rest/v1/rpc/internal_run_legacy_sales_import", target),
  {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_actor_code: actor,
      p_rows: stableRows(rows),
      p_cashier_map: cashierMap,
      p_source_fingerprint: audit.fingerprint,
      p_reason: "Approved legacy sales migration rehearsal",
      p_commit: apply,
    }),
  },
);
const text = await response.text();
if (!response.ok)
  throw new Error(
    `Target import failed (${response.status}): ${text.slice(0, 500)}`,
  );
console.log(
  JSON.stringify(
    { mode: apply ? "apply" : "dry-run", audit, result: JSON.parse(text) },
    null,
    2,
  ),
);
