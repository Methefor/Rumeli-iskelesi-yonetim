/** LOCAL ONLY: reproducible fake identities for real-login browser checks.
 * node supabase/tests/local_login_fixtures.mjs   (needs a fresh local reset)
 * Creates six fake users (codes L001-L006, throwaway PIN 2027, .invalid
 * emails) through the local Auth admin API + local psql. Refuses anything
 * but http://127.0.0.1:54321. Prints codes only — never keys.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const cli = process.env.SUPABASE_CLI || "supabase";
const status = JSON.parse(
  execFileSync(cli, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
const base = new URL(status.API_URL);
if (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.port !== "54321")
  throw Error("LOCAL ONLY: expected http://127.0.0.1:54321");
const service = status.SERVICE_ROLE_KEY;

const sql = (text) =>
  execFileSync(
    process.env.DOCKER_CLI || "docker",
    ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();

const PIN = "2027"; // fake, local only
const users = [
  { code: "L001", role: "owner", branches: [], active: true },
  { code: "L002", role: "manager", branches: [], active: true },
  { code: "L003", role: "branch_manager", branches: ["iskele_dondurma"], active: true },
  { code: "L004", role: "cashier", branches: ["iskele_dondurma"], active: true },
  { code: "L005", role: "employee", branches: ["iskele_dondurma"], active: true },
  { code: "L006", role: "employee", branches: ["iskele_dondurma"], active: false }, // inactive
  { code: "L007", role: "employee", branches: ["iskele_dondurma"], active: true }, // lockout target
];

for (const u of users) {
  const r = await fetch(new URL("/auth/v1/admin/users", base), {
    method: "POST",
    headers: { apikey: service, Authorization: `Bearer ${service}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${u.code.toLowerCase()}@local-login.invalid`, email_confirm: true, password: randomUUID() }),
  });
  const created = await r.json();
  if (!r.ok) throw Error(`create ${u.code} failed (${r.status})`);
  const memberships = u.branches
    .map((b) => `insert into public.branch_memberships(user_id,branch_id) select '${created.id}',id from public.branches where key='${b}';`)
    .join("");
  sql(
    `insert into public.profiles(id,full_name,employee_code,is_active) values ('${created.id}','Yerel Test ${u.code}','${u.code}',${u.active});` +
      `insert into public.user_roles(user_id,role_id) select '${created.id}',id from public.roles where key='${u.role}';` +
      memberships +
      `insert into public.pin_credentials(user_id,pin_hash) values ('${created.id}', extensions.crypt('${PIN}', extensions.gen_salt('bf')));`,
  );
  console.log(`created ${u.code} (${u.role}${u.active ? "" : ", INACTIVE"})`);
}
console.log("Fixtures ready. Fake PIN for all: 2027. Local only.");
