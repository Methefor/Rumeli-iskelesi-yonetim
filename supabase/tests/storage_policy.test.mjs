/** Disposable LOCAL ONLY Storage (avatars-v4) security regression.
 * Exercises the REAL local Supabase Storage API with real Auth JWTs — not a
 * SQL policy inspection. service_role is used ONLY to create auth users
 * (the admin API has no other way to do this) — every storage call below
 * uses a real per-role user's own JWT, never service_role.
 *
 * node supabase/tests/storage_policy.test.mjs
 * Optional SUPABASE_CLI executable path; requires a fresh local reset first
 * (007_storage_policies.sql's avatars-v4 bucket/policies and 001-015 must
 * be applied). Keys read directly from CLI status, never logged.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const cli = process.env.SUPABASE_CLI || "supabase";
const status = JSON.parse(
  execFileSync(cli, ["status", "-o", "json"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }),
);
const base = new URL(status.API_URL);
if (
  base.protocol !== "http:" ||
  base.hostname !== "127.0.0.1" ||
  base.port !== "54321"
)
  throw Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const anon = status.ANON_KEY,
  service = status.SERVICE_ROLE_KEY;
if (!anon || !service) throw Error("Local CLI status keys missing");

let passed = 0;
function check(ok, label) {
  if (!ok) throw Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}

async function req(path, token, method = "GET", body, contentType) {
  const headers = { apikey: anon };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = contentType ?? "application/json";
  const r = await fetch(new URL(path, base), { method, headers, body });
  const raw = await r.text();
  let data;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = raw;
  }
  return { ok: r.ok, status: r.status, data };
}
async function good(p, label) {
  const r = await p;
  check(r.ok, `${label}${r.ok ? "" : ` (${r.status}: ${JSON.stringify(r.data)})`}`);
  return r.data;
}
async function deny(p, label, expectStatuses = [400, 401, 403]) {
  const r = await p;
  check(!r.ok && expectStatuses.includes(r.status), `${label} (got ${r.status})`);
}

// ---------------------------------------------------------------------------
// Real Auth users, one per role, real password sign-in (matches
// local_inventory_api.mjs's proven pattern).
// ---------------------------------------------------------------------------
const users = {},
  suffix = Date.now();
for (const role of ["employee", "cashier", "branch_manager", "manager", "owner"]) {
  const email = `storage-${role}-${suffix}@storage-test.invalid`,
    password = `Local-${randomUUID()}!`;
  const u = await good(
    req("/auth/v1/admin/users", service, "POST", JSON.stringify({ email, password, email_confirm: true })),
    `Auth creates ${role}`,
  );
  const sql = (text) =>
    execFileSync(process.env.DOCKER_CLI || "docker", [
      "exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres",
      "-v", "ON_ERROR_STOP=1", "-At",
    ], { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  sql(
    `insert into public.profiles(id,full_name) values ('${u.id}','Storage Test ${role}'); insert into public.user_roles(user_id,role_id) select '${u.id}',id from public.roles where key='${role}';`,
  );
  const auth = await good(
    req("/auth/v1/token?grant_type=password", anon, "POST", JSON.stringify({ email, password })),
    `Auth password sign-in ${role}`,
  );
  users[role] = { id: u.id, token: auth.access_token };
}
const token = (role) => users[role].token;

// ---------------------------------------------------------------------------
// Storage REST calls: avatars-v4 is a PUBLIC-READ bucket (see
// 007_storage_policies.sql) — reads are intentionally open to everyone,
// including anon, via the public object URL, which bypasses RLS by design
// for any bucket with public=true. Writes (insert/update/delete) are
// RLS-gated: own-path only, or employee.manage (manager/owner) for anyone's.
// ---------------------------------------------------------------------------
const bucket = "avatars-v4";
const objectUrl = (uid, ext = "png") => `/storage/v1/object/${bucket}/${uid}/avatar.${ext}`;
const publicUrl = (uid, ext = "png") => `/storage/v1/object/public/${bucket}/${uid}/avatar.${ext}`;
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG magic bytes only — small, valid enough for a policy test, not a real image

const upload = (role, uid, ext = "png") =>
  req(objectUrl(uid, ext), token(role), "POST", png, "image/png");
const replace = (role, uid, ext = "png") =>
  req(objectUrl(uid, ext), token(role), "PUT", png, "image/png");
const remove = (role, uid, ext = "png") => req(objectUrl(uid, ext), token(role), "DELETE");
const readPublic = (uid, ext = "png") => req(publicUrl(uid, ext), null, "GET");
const readAuthed = (role, uid, ext = "png") =>
  req(`/storage/v1/object/authenticated/${bucket}/${uid}/avatar.${ext}`, token(role), "GET");

// --- bucket visibility: FINDING (not fixed here, see docs/LOCAL_VALIDATION —
// out of 007's stated scope, and fails SAFE not open — flagging, not
// silently "fixing" an unrequested migration change). storage.buckets ships
// with RLS enabled and ZERO policies by default; 007_storage_policies.sql
// only added policies to storage.objects, never to storage.buckets. Result:
// the /storage/v1/bucket/:id metadata endpoint 404s for EVERY role,
// including service_role-created-but-authenticated users and even the
// bucket's own public flag holder — this is a Supabase Storage default, not
// something 007 introduced, and it does not affect object read/write below
// (those policies check bucket_id as a literal string, not via a
// storage.buckets RLS join). Confirmed both ways so this isn't mistaken for
// an object-policy bug:
await deny(req(`/storage/v1/bucket/${bucket}`, token("employee"), "GET"), "bucket metadata endpoint 404s for every role incl. authenticated (storage.buckets has RLS enabled, zero policies — a Supabase Storage default, not introduced by 007; does not affect object access)", [400]);
await deny(req(`/storage/v1/bucket/${bucket}`, null, "GET"), "...and for anon too, consistently");

// --- own-path upload for every role, then read it back both ways.
for (const role of Object.keys(users)) {
  await good(upload(role, users[role].id), `${role} uploads to own path`);
  await good(readPublic(users[role].id), `${role}'s avatar readable via the public URL`);
  await good(readAuthed(role, users[role].id), `${role}'s avatar readable via the authenticated URL too`);
}

// --- anon: read succeeds (public bucket); anon cannot upload/replace/delete
// anything (no session at all — auth.role() is 'anon', the insert policy
// requires 'authenticated').
await good(readPublic(users.employee.id), "anon can read any avatar via the public URL");
await deny(req(objectUrl(users.employee.id, "anon-attempt"), null, "POST", png, "image/png"), "anon cannot upload");
await deny(req(objectUrl(users.employee.id), null, "PUT", png, "image/png"), "anon cannot replace an existing avatar");
await deny(req(objectUrl(users.employee.id), null, "DELETE"), "anon cannot delete an avatar");

// --- ownership: nobody may write into another user's path unless they hold
// employee.manage (manager/owner only — this bucket has NO branch scope at
// all, by design; see 007_storage_policies.sql, so branch_manager gets no
// special access here despite holding employee.manage_branch).
// "manager" is the fixed target throughout — it already has an avatar.png
// from the own-path upload loop above, and none of these three acting roles
// IS manager, so every case below is a genuine cross-user attempt.
for (const role of ["employee", "cashier", "branch_manager"]) {
  await deny(upload(role, users.manager.id, "steal"), `${role} cannot upload into another user's path`);
  await deny(replace(role, users.manager.id), `${role} cannot replace another user's avatar`);
  await deny(remove(role, users.manager.id), `${role} cannot delete another user's avatar`);
}

// --- manager/owner override: employee.manage lets them replace/delete
// (but NOT the ownership check itself — they still upload under their OWN
// path for a fresh object; the override only applies to update/delete of an
// EXISTING object per the policy's USING clause).
for (const role of ["manager", "owner"]) {
  await good(replace(role, users.employee.id), `${role} (employee.manage) can replace another user's avatar`);
}
// re-upload the employee's avatar (replaced away above) before the delete
// check, so this doesn't depend on ordering between manager/owner.
await good(upload("employee", users.employee.id, "restored"), "fixture: employee re-uploads a fresh avatar for the delete check");
await good(remove("manager", users.employee.id, "restored"), "manager (employee.manage) can delete another user's avatar");

// --- MIME/size enforcement is bucket-level (allowed_mime_types,
// file_size_limit in 007), applied before RLS even runs.
await deny(
  req(objectUrl(users.cashier.id, "txt"), token("cashier"), "POST", "not an image", "text/plain"),
  "disallowed MIME type rejected at the bucket level",
  [400, 415, 422],
);

// --- cross-role sanity: a cashier can still manage their OWN avatar fully
// (upload/replace/delete), proving the earlier denials were ownership-based,
// not a blanket cashier restriction.
await good(upload("cashier", users.cashier.id, "own2"), "cashier uploads own second avatar file");
await good(replace("cashier", users.cashier.id, "own2"), "cashier replaces their own avatar");
await good(remove("cashier", users.cashier.id, "own2"), "cashier deletes their own avatar");

console.log(`LOCAL STORAGE PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`);
