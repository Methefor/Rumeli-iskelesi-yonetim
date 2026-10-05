#!/usr/bin/env node
/**
 * BREAK-GLASS owner PIN rotation. Changes ONLY the PIN credential of an existing,
 * active, not-banned owner. It never creates an owner, changes a role or branch
 * membership, activates a user, or touches the Auth email/password. The normal
 * admin_reset_pin hierarchy is unchanged: no manager can reset an owner.
 *
 *   node identity-data/rotate-owner-pin.mjs --target-ref=<local|ref> --reason="<why>" \
 *        [--employee-code=M001] [--operator-label="<who runs this>"] \
 *        [--apply --pin-stdin] [--allow-hosted-target --allow-hosted-apply]
 *
 * - Dry run by default (no PIN is read, nothing is written).
 * - Service-role key only (TARGET_SUPABASE_SERVICE_ROLE_KEY, operator shell); anon refused.
 * - The PIN is typed at a hidden prompt or piped with --pin-stdin: never an argument, env
 *   var or file, and never printed together with its hash.
 * - Without --employee-code the script rotates the only active owner and refuses when more
 *   than one active owner exists (explicit code required).
 * - Hosted apply is a production WRITE: it REQUIRES EXPLICIT OWNER APPROVAL BEFORE
 *   EXECUTION plus OWNER_PIN_ROTATION_APPROVAL=approve-owner-pin-rotation:<ref>:<code>.
 * - Exactly one audit row owner_pin_rotated is written (actor NULL: no authenticated
 *   session; the operator label is unverified metadata; the PIN/hash are never recorded).
 */
import { pathToFileURL } from "node:url";
import { GuardError, assertServiceKey, resolveTarget } from "../legacy-migration/guards.mjs";
import { readHiddenPin, readStdinLine } from "./bootstrap-owner.mjs";

const CODE = /^[A-Z][0-9]{2,4}$/;
const PIN = /^[0-9]{4,6}$/;
export const approvalFor = (ref, code) => `approve-owner-pin-rotation:${ref}:${code}`;

export async function rotateOwnerPin({ argv, env, fetchImpl = fetch, readPin }) {
  const flag = (n) => argv.includes(n);
  const value = (p) => argv.find((a) => a.startsWith(p))?.slice(p.length);
  const apply = flag("--apply");
  const explicitCode = value("--employee-code=")?.toUpperCase();
  const reason = value("--reason=")?.trim() ?? "";
  const label = value("--operator-label=")?.trim() ?? "";

  const target = resolveTarget({
    url: env.TARGET_SUPABASE_URL,
    targetRef: value("--target-ref="),
    allowHostedTarget: flag("--allow-hosted-target"),
  });
  assertServiceKey(env.TARGET_SUPABASE_SERVICE_ROLE_KEY);
  if (explicitCode && !CODE.test(explicitCode)) throw new GuardError("code_invalid", "--employee-code must look like M001.");
  if (reason.length < 5 || reason.length > 200) throw new GuardError("reason_required", '--reason="<why>" is required (5-200 characters).');
  if (label.length > 60) throw new GuardError("label_invalid", "--operator-label is at most 60 characters.");

  // Hosted apply gates run BEFORE any network call and need an explicit employee code.
  if (apply && target.kind === "hosted") {
    if (!explicitCode) throw new GuardError("employee_code_required", "Hosted apply requires an explicit --employee-code.");
    if (!flag("--allow-hosted-apply")) throw new GuardError("hosted_apply_refused", "Hosted apply is refused without --allow-hosted-apply.");
    if (env.OWNER_PIN_ROTATION_APPROVAL !== approvalFor(target.ref, explicitCode))
      throw new GuardError("owner_approval_missing", "Hosted apply requires the run-specific OWNER_PIN_ROTATION_APPROVAL phrase.");
  }

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

  const roles = await call("/rest/v1/user_roles?select=user_id,roles!inner(key)&roles.key=eq.owner");
  if (!roles.ok) throw new Error(`owner lookup failed (${roles.status})`);
  const ids = roles.data.map((r) => r.user_id);
  const profiles = ids.length
    ? await call(`/rest/v1/profiles?select=id,employee_code,is_active&id=in.(${ids.join(",")})`)
    : { ok: true, data: [] };
  if (!profiles.ok) throw new Error(`profile lookup failed (${profiles.status})`);
  const owners = profiles.data;
  let chosen;
  if (explicitCode) chosen = owners.find((o) => o.employee_code === explicitCode);
  else {
    const active = owners.filter((o) => o.is_active);
    if (active.length > 1) throw new GuardError("owner_ambiguous", "More than one active owner exists: pass --employee-code explicitly.");
    chosen = active[0];
  }
  if (!chosen) throw new GuardError("not_an_owner", "The target is not an existing owner (rotation never creates one).");
  if (!chosen.is_active) throw new GuardError("owner_inactive", "The target owner is inactive (rotation never activates anyone).");
  const code = chosen.employee_code;

  const plan = { mode: apply ? "apply" : "dry-run", target: target.ref, employeeCode: code, changes: "PIN credential only (+ lockout reset); role, memberships, Auth credentials untouched", audit: "one owner_pin_rotated row, actor NULL" };
  if (!apply) return { ...plan, written: false };

  const pin = (await readPin()).trim();
  if (!PIN.test(pin)) throw new GuardError("pin_invalid", "The PIN must be 4-6 digits.");
  const rpc = await call("/rest/v1/rpc/internal_rotate_owner_pin", {
    method: "POST",
    body: JSON.stringify({ p_employee_code: code, p_pin: pin, p_reason: reason, p_executor_label: label || null }),
  });
  if (!rpc.ok) throw new GuardError("rotation_refused", `The database refused the rotation (${rpc.status}); nothing changed.`);
  return { ...plan, written: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const argv = process.argv.slice(2);
    const readPin = async () => {
      if (argv.includes("--pin-stdin")) return await readStdinLine();
      const first = await readHiddenPin("New owner PIN (hidden): ");
      const second = await readHiddenPin("Repeat PIN: ");
      if (first !== second) throw new GuardError("pin_mismatch", "The two PIN entries differ.");
      return first;
    };
    console.log(JSON.stringify(await rotateOwnerPin({ argv, env: process.env, readPin }), null, 2));
  } catch (error) {
    console.error(error instanceof GuardError ? `REFUSED [${error.code}]: ${error.message}` : `FAILED: ${error.message}`);
    process.exitCode = error instanceof GuardError ? 3 : 1;
  }
}
