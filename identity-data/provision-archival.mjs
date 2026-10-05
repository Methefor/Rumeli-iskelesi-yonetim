#!/usr/bin/env node
/**
 * Creates INACTIVE, NO-LOGIN archival profiles (H001, H002, ...) that preserve
 * authorship of historical legacy reports. They are not people on the current
 * roster: no PIN credential, no role, no branch membership, banned Auth user
 * with a random unusable password, and a neutral placeholder name (legacy
 * cashier names are never read or copied).
 *
 *   node identity-data/provision-archival.mjs --target-ref=<local|ref> --count=3 \
 *        [--apply] [--allow-hosted-target --allow-hosted-apply]
 *
 * Dry run by default. The service-role key is read ONLY from the operator
 * shell (TARGET_SUPABASE_SERVICE_ROLE_KEY). Hosted use is a production WRITE:
 * it REQUIRES EXPLICIT OWNER APPROVAL, enforced by the same fail-closed target
 * guards as the legacy importer plus LEGACY_ARCHIVAL_OWNER_APPROVAL
 * (`approve-archival:<ref>:<count>`). Idempotent: existing codes are skipped.
 */
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  GuardError,
  assertServiceKey,
  resolveTarget,
} from "../legacy-migration/guards.mjs";

export function archivalCodes(count) {
  if (!Number.isInteger(count) || count < 1 || count > 20)
    throw new GuardError("count_invalid", "--count must be an integer from 1 to 20.");
  return Array.from({ length: count }, (_, i) => `H${String(i + 1).padStart(3, "0")}`);
}

export async function provisionArchival({ argv, env, fetchImpl = fetch }) {
  const flag = (n) => argv.includes(n);
  const value = (p) => argv.find((a) => a.startsWith(p))?.slice(p.length);
  const apply = flag("--apply");
  const targetRef = value("--target-ref=");
  const count = Number(value("--count=") ?? "0");

  const target = resolveTarget({
    url: env.TARGET_SUPABASE_URL,
    targetRef,
    allowHostedTarget: flag("--allow-hosted-target"),
  });
  assertServiceKey(env.TARGET_SUPABASE_SERVICE_ROLE_KEY);
  const codes = archivalCodes(count);
  if (apply && target.kind === "hosted") {
    if (!flag("--allow-hosted-apply"))
      throw new GuardError("hosted_apply_refused", "Hosted apply is refused without --allow-hosted-apply.");
    if (env.LEGACY_ARCHIVAL_OWNER_APPROVAL !== `approve-archival:${target.ref}:${count}`)
      throw new GuardError("owner_approval_missing", "Hosted apply requires LEGACY_ARCHIVAL_OWNER_APPROVAL.");
  }

  const base = env.TARGET_SUPABASE_URL;
  const key = env.TARGET_SUPABASE_SERVICE_ROLE_KEY;
  const call = async (path, init = {}) => {
    const response = await fetchImpl(new URL(path, base), {
      ...init,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers },
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, data: text ? JSON.parse(text) : null };
  };

  const existing = await call(`/rest/v1/profiles?select=employee_code,is_active&employee_code=in.(${codes.join(",")})`);
  if (!existing.ok) throw new Error(`profile lookup failed (${existing.status})`);
  const have = new Map(existing.data.map((p) => [p.employee_code, p.is_active]));
  const report = { mode: apply ? "apply" : "dry-run", target: target.ref, created: [], unchanged: [], refused: [] };
  for (const code of codes) {
    if (have.has(code)) {
      // Never "repair" an existing profile: an active H### would be an incident.
      (have.get(code) === false ? report.unchanged : report.refused).push(code);
      continue;
    }
    if (!apply) {
      report.created.push(code);
      continue;
    }
    const user = await call("/auth/v1/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: `archive-${code.toLowerCase()}-${randomBytes(6).toString("hex")}@archive.invalid`,
        password: randomBytes(32).toString("base64url"),
        email_confirm: true,
        ban_duration: "876000h",
      }),
    });
    if (!user.ok) throw new Error(`auth user creation failed (${user.status})`);
    const profile = await call("/rest/v1/profiles", {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        id: user.data.id,
        full_name: `Arşiv Kasiyer ${Number(code.slice(1))}`,
        employee_code: code,
        is_active: false,
      }),
    });
    if (!profile.ok) {
      // Compensate: never leave an orphan Auth user behind.
      await call(`/auth/v1/admin/users/${user.data.id}`, { method: "DELETE" });
      throw new Error(`profile creation failed (${profile.status}); the Auth user was removed`);
    }
    report.created.push(code);
  }
  if (report.refused.length)
    throw new GuardError("archival_profile_active", `Profiles already exist and are ACTIVE: ${report.refused.join(", ")}`);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(JSON.stringify(await provisionArchival({ argv: process.argv.slice(2), env: process.env }), null, 2));
  } catch (error) {
    console.error(error instanceof GuardError ? `REFUSED [${error.code}]: ${error.message}` : `FAILED: ${error.message}`);
    process.exitCode = error instanceof GuardError ? 3 : 1;
  }
}
