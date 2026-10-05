#!/usr/bin/env node
/**
 * ONE-TIME bootstrap of the first owner (default code M001).
 *
 *   node identity-data/bootstrap-owner.mjs --target-ref=<local|ref> --full-name="<name>" \
 *        [--employee-code=M001] [--apply --pin-stdin] [--allow-hosted-target --allow-hosted-apply]
 *
 * - Dry run by default: nothing is written and no PIN is read.
 * - Service-role key only, from the operator shell (TARGET_SUPABASE_SERVICE_ROLE_KEY);
 *   anon/other keys are refused. Same fail-closed target guards as the legacy importer.
 * - The PIN is NEVER a CLI argument, env var, file or output. It is typed at a hidden
 *   prompt, or piped on stdin with --pin-stdin (e.g. from a password manager), and is
 *   passed only to the database function that bcrypt-hashes it. Nothing prints it,
 *   its hash, a token or an id. A legacy PIN is never read or accepted.
 * - Refuses when ANY owner role already exists or the employee code is taken; the
 *   database function re-checks that atomically (it is service-role-only and closes
 *   itself once an owner exists). Auth user + profile + role + PIN + audit row are
 *   created together or not at all (the Auth user is removed if the DB step fails).
 * - Hosted apply is a production WRITE: it REQUIRES EXPLICIT OWNER APPROVAL BEFORE
 *   EXECUTION and the run-specific phrase OWNER_BOOTSTRAP_APPROVAL=
 *   approve-owner-bootstrap:<ref>:<code>.
 */
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  GuardError,
  assertServiceKey,
  resolveTarget,
} from "../legacy-migration/guards.mjs";

const CODE = /^[A-Z][0-9]{2,4}$/;
const PIN = /^[0-9]{4,6}$/;

export const approvalFor = (ref, code) => `approve-owner-bootstrap:${ref}:${code}`;

export async function readHiddenPin(promptText) {
  const { stdin, stderr } = process;
  if (!stdin.isTTY) throw new GuardError("pin_input_refused", "No terminal: pipe the PIN with --pin-stdin or run in an interactive terminal.");
  return await new Promise((resolve) => {
    stderr.write(promptText);
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stderr.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

export async function readStdinLine() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8").split(/\r?\n/)[0] ?? "";
}

export async function bootstrapOwner({ argv, env, fetchImpl = fetch, readPin }) {
  const flag = (n) => argv.includes(n);
  const value = (p) => argv.find((a) => a.startsWith(p))?.slice(p.length);
  const apply = flag("--apply");
  const code = (value("--employee-code=") ?? "M001").toUpperCase();
  const fullName = value("--full-name=")?.trim() ?? "";

  const target = resolveTarget({
    url: env.TARGET_SUPABASE_URL,
    targetRef: value("--target-ref="),
    allowHostedTarget: flag("--allow-hosted-target"),
  });
  assertServiceKey(env.TARGET_SUPABASE_SERVICE_ROLE_KEY);
  if (!CODE.test(code)) throw new GuardError("code_invalid", "--employee-code must look like M001.");
  if (!fullName || fullName.length > 100) throw new GuardError("name_invalid", '--full-name="<name>" is required (max 100 characters).');
  if (apply && target.kind === "hosted") {
    if (!flag("--allow-hosted-apply"))
      throw new GuardError("hosted_apply_refused", "Hosted apply is refused without --allow-hosted-apply.");
    if (env.OWNER_BOOTSTRAP_APPROVAL !== approvalFor(target.ref, code))
      throw new GuardError("owner_approval_missing", "Hosted apply requires the run-specific OWNER_BOOTSTRAP_APPROVAL phrase.");
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

  const owners = await call("/rest/v1/user_roles?select=user_id,roles!inner(key)&roles.key=eq.owner&limit=1");
  if (!owners.ok) throw new Error(`owner lookup failed (${owners.status})`);
  if (owners.data.length > 0)
    throw new GuardError("owner_exists", "An owner already exists: bootstrap is closed (never run twice).");
  const clash = await call(`/rest/v1/profiles?select=employee_code&employee_code=eq.${code}`);
  if (!clash.ok) throw new Error(`profile lookup failed (${clash.status})`);
  if (clash.data.length > 0)
    throw new GuardError("code_conflict", `Employee code ${code} already belongs to another identity.`);

  const plan = { mode: apply ? "apply" : "dry-run", target: target.ref, employeeCode: code, role: "owner", branchMemberships: "none (organization-wide)", wouldCreate: ["auth user", "profile", "owner role", "pin credential", "audit row"] };
  if (!apply) return { ...plan, written: false };

  const pin = (await readPin()).trim();
  if (!PIN.test(pin)) throw new GuardError("pin_invalid", "The PIN must be 4-6 digits.");

  const user = await call("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      email: `owner-${code.toLowerCase()}-${randomBytes(6).toString("hex")}@owner.invalid`,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
    }),
  });
  if (!user.ok) throw new Error(`auth user creation failed (${user.status})`);
  const rpc = await call("/rest/v1/rpc/internal_bootstrap_owner", {
    method: "POST",
    body: JSON.stringify({
      p_user_id: user.data.id,
      p_employee_code: code,
      p_full_name: fullName,
      p_pin: pin,
      p_reason: "One-time owner bootstrap",
    }),
  });
  if (!rpc.ok) {
    await call(`/auth/v1/admin/users/${user.data.id}`, { method: "DELETE" });
    // Only a safe, coarse reason is surfaced; the request body (PIN) is never echoed.
    throw new GuardError("bootstrap_refused", `The database refused the bootstrap (${rpc.status}); the Auth user was removed.`);
  }
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
    console.log(JSON.stringify(await bootstrapOwner({ argv, env: process.env, readPin }), null, 2));
  } catch (error) {
    console.error(error instanceof GuardError ? `REFUSED [${error.code}]: ${error.message}` : `FAILED: ${error.message}`);
    process.exitCode = error instanceof GuardError ? 3 : 1;
  }
}
