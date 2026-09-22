/** Disposable LOCAL ONLY Auth + PostgREST security regression.
 * node supabase/tests/local_inventory_api.mjs
 * Optional SUPABASE_CLI and DOCKER_CLI executable paths; requires fresh local reset.
 * Keys read directly from CLI status, never logged. Fixtures persist until local reset.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const cli = process.env.SUPABASE_CLI || "supabase";
const docker = process.env.DOCKER_CLI || "docker";
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
const container = "supabase_db_Rumeli-iskelesi-yonetim";
const sql = (text) =>
  execFileSync(
    docker,
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-At",
    ],
    { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
let passed = 0;
function check(ok, label) {
  if (!ok) throw Error(`FAIL ${label}`);
  passed++;
  console.log(`PASS ${label}`);
}
async function req(path, token = anon, method = "GET", body, admin = false) {
  const r = await fetch(new URL(path, base), {
    method,
    headers: {
      apikey: admin ? service : anon,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const raw = await r.text();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    data = raw;
  }
  return { ok: r.ok, status: r.status, data };
}
const rpc = (token, name, args) =>
  req(`/rest/v1/rpc/${name}`, token, "POST", args);
async function good(p, label) {
  const r = await p;
  check(
    r.ok,
    `${label}${r.ok ? "" : ` (${r.status} ${r.data?.code}: ${r.data?.message})`}`,
  );
  return r.data;
}
async function deny(p, label, code = "42501") {
  const r = await p;
  check(!r.ok && r.data?.code === code, label);
}
const users = {},
  suffix = Date.now();
for (const role of [
  "owner",
  "manager",
  "branch_manager",
  "cashier",
  "employee",
  "viewer",
]) {
  const email = `api-${role}-${suffix}@inventory-test.invalid`,
    password = `Local-${randomUUID()}!`;
  const u = await good(
    req(
      "/auth/v1/admin/users",
      service,
      "POST",
      { email, password, email_confirm: true },
      true,
    ),
    `Auth creates ${role}`,
  );
  sql(
    `insert into public.profiles(id,full_name) values ('${u.id}','Local API ${role}'); insert into public.user_roles(user_id,role_id) select '${u.id}',id from public.roles where key='${role}'; insert into public.branch_memberships(user_id,branch_id) select '${u.id}',id from public.branches where key='iskele_dondurma';`,
  );
  const auth = await good(
    req("/auth/v1/token?grant_type=password", anon, "POST", {
      email,
      password,
    }),
    `Auth password sign-in ${role}`,
  );
  check(
    !!auth.access_token && auth.user.id === u.id,
    `real JWT identity ${role}`,
  );
  users[role] = { id: u.id, token: auth.access_token };
}
const branch = sql(
    "select id from public.branches where key='iskele_dondurma'",
  ),
  other = sql("select id from public.branches where key='rumeli_iskelesi'");
const token = (role) => users[role].token;
const create = (b, code) =>
  rpc(token("manager"), "upsert_inventory_item", {
    p_item_id: null,
    p_branch_id: b,
    p_code: code,
    p_name: "API fixture",
    p_unit: "kg",
  });
const item = await good(
  create(branch, `API${suffix}`),
  "manager creates own item",
);
const otherItem = await good(
  create(other, `API${suffix}`),
  "manager creates cross-branch item",
);
await good(
  rpc(token("owner"), "set_inventory_item_cost", {
    p_item_id: item,
    p_unit_cost: 17,
    p_reason: "local cost fixture",
  }),
  "owner sets cost",
);
for (const role of Object.keys(users)) {
  const rows = await good(
    req(
      `/rest/v1/inventory_items?select=id&id=in.(${item},${otherItem})`,
      token(role),
    ),
    `${role} item read`,
  );
  check(
    rows.length ===
      (["owner", "manager"].includes(role) ? 2 : role === "viewer" ? 0 : 1),
    `${role} branch isolation`,
  );
  for (const method of ["PATCH", "DELETE"])
    await deny(
      req(
        `/rest/v1/inventory_items?id=eq.${item}`,
        token(role),
        method,
        method === "PATCH" ? { name: "illegal" } : undefined,
      ),
      `${role} raw ${method} denied`,
    );
}
await deny(
  req("/rest/v1/inventory_items?select=id"),
  "anon inventory read denied",
);
for (const role of Object.keys(users)) {
  await deny(
    req("/rest/v1/inventory_movements", token(role), "POST", {
      branch_id: branch,
      inventory_item_id: item,
      movement_type: "ADJUSTMENT_IN",
      quantity: 99,
      stock_delta: 99,
      reason: "forged",
      created_by: users[role].id,
    }),
    `${role} raw ledger INSERT denied`,
  );
  await deny(
    req(
      "/rest/v1/inventory_counts?id=eq.00000000-0000-0000-0000-000000000000",
      token(role),
      "PATCH",
      { status: "voided" },
    ),
    `${role} raw count mutation denied`,
  );
}

const adjust = (role, id = item, reason = "API correction") =>
  rpc(token(role), "record_inventory_adjustment", {
    p_item_id: id,
    p_direction: "IN",
    p_quantity: 4,
    p_reason: reason,
  });
// Rollback: cashier has NO inventory.adjust at all, even in their own branch
// (not just cross-branch, unlike branch_manager who is denied ONLY cross-branch).
for (const role of ["viewer", "employee", "cashier"])
  await deny(adjust(role), `${role} cannot adjust (no inventory.adjust)`);
await deny(
  adjust("branch_manager", otherItem),
  "branch_manager cannot adjust cross branch",
);
for (const role of ["owner", "manager", "branch_manager"])
  await good(adjust(role), `${role} own-branch adjust`);
await deny(
  adjust("branch_manager", item, "  "),
  "adjustment requires reason",
  "22023",
);
for (const role of ["cashier", "employee", "viewer"]) {
  const costs = await good(
    req("/rest/v1/inventory_item_costs?select=*", token(role)),
    `${role} costs read filtered`,
  );
  check(costs.length === 0, `${role} cost confidentiality`);
  await deny(
    req("/rest/v1/inventory_movements?select=unit_cost_snapshot", token(role)),
    `${role} cannot read cost snapshot column`,
  );
  await deny(
    rpc(token(role), "get_inventory_gross_profit", {
      p_branch_id: branch,
      p_from: "2020-01-01T00:00:00Z",
      p_to: "2030-01-01T00:00:00Z",
    }),
    `${role} cannot call gross profit`,
  );
}
const move = await good(
  adjust("branch_manager"),
  "branch manager correction for reversal",
);
const reverse = (role, id, reason = "API reverse") =>
  rpc(token(role), "reverse_inventory_movement", {
    p_movement_id: id,
    p_reason: reason,
  });
// Rollback: movement reversal is owner/manager ONLY. branch_manager keeps
// inventory.adjust (can create the movement above) but cannot reverse it;
// cashier was never in scope for this at all.
await deny(reverse("cashier", move), "cashier cannot reverse a movement");
await deny(
  reverse("branch_manager", move),
  "branch_manager cannot reverse a movement (owner/manager only)",
);
await deny(reverse("manager", move, ""), "reversal reason required", "22023");
const reversalId = await good(
  reverse("manager", move),
  "manager reverses a non-sale movement",
);
await deny(reverse("manager", move), "duplicate reversal rejected", "23505");
const crossMove = await good(
  adjust("manager", otherItem),
  "manager cross fixture adjustment",
);
await deny(
  reverse("branch_manager", crossMove),
  "branch manager cannot reverse cross-branch (also owner/manager-only)",
);
await deny(
  reverse("cashier", crossMove),
  "cashier cannot reverse a cross-branch movement either",
);
await good(
  reverse("owner", crossMove),
  "owner reverses a movement in another branch",
);
const bmCount = await good(
  rpc(token("branch_manager"), "submit_inventory_count", {
    p_branch_id: branch,
    p_shift_id: null,
    p_items: [{ inventory_item_id: item, physical_quantity: 16 }],
  }),
  "branch manager own count",
);
await good(
  rpc(token("branch_manager"), "void_inventory_count", {
    p_count_id: bmCount,
    p_reason: "BM count void",
  }),
  "branch manager own count void",
);
const count = await good(
  rpc(token("cashier"), "submit_inventory_count", {
    p_branch_id: branch,
    p_shift_id: null,
    p_items: [{ inventory_item_id: item, physical_quantity: 12 }],
  }),
  "cashier submits count (inventory.count unaffected by the rollback)",
);
const linked = await good(
  rpc(token("branch_manager"), "record_inventory_adjustment", {
    p_item_id: item,
    p_direction: "OUT",
    p_quantity: 2,
    p_reason: "API count correction",
    p_count_id: count,
  }),
  "branch manager count-linked adjustment",
);
const stock = () =>
  Number(
    sql(
      `select coalesce(sum(stock_delta),0) from public.inventory_movements where inventory_item_id='${item}'`,
    ),
  );
const before = stock();
check(
  before === 10,
  "ledger expected stock after adjustments, reversal and linked correction",
);
// Rollback: cashier cannot void a count at all, not even one they submitted
// themselves. branch_manager keeps count-void in their own branch.
await deny(
  rpc(token("cashier"), "void_inventory_count", {
    p_count_id: count,
    p_reason: "attempt",
  }),
  "cashier cannot void a count (no inventory.adjust)",
);
await deny(
  rpc(token("branch_manager"), "void_inventory_count", {
    p_count_id: count,
    p_reason: "",
  }),
  "count void reason required",
  "22023",
);
await good(
  rpc(token("branch_manager"), "void_inventory_count", {
    p_count_id: count,
    p_reason: "API count void",
  }),
  "branch manager voids the cashier-submitted count",
);
check(stock() === before, "count void does not silently change stock");
check(
  sql(`select status from public.inventory_counts where id='${count}'`) ===
    "voided",
  "count status voided",
);
const shift = randomUUID();
sql(
  `insert into public.shifts(id,branch_id,shift_definition_id,business_date) select '${shift}','${branch}',id,(now() at time zone 'Europe/Istanbul')::date+10 from public.shift_definitions where branch_id='${branch}' and key='evening';`,
);
await deny(
  rpc(token("cashier"), "submit_inventory_count", {
    p_branch_id: branch,
    p_shift_id: shift,
    p_items: [{ inventory_item_id: item, physical_quantity: 1 }],
  }),
  "cashier without inventory.adjust must be assigned to the shift to count against it",
);
sql(
  `insert into public.shift_assignments(shift_id,user_id) values('${shift}','${users.cashier.id}');`,
);
await good(
  rpc(token("cashier"), "submit_inventory_count", {
    p_branch_id: branch,
    p_shift_id: shift,
    p_items: [{ inventory_item_id: item, physical_quantity: 14 }],
  }),
  "cashier assigned shift count succeeds",
);
for (const role of ["cashier", "branch_manager"])
  await deny(
    rpc(token(role), "set_inventory_item_cost", {
      p_item_id: item,
      p_unit_cost: 999,
      p_reason: "must fail",
    }),
    `${role} cost management denied`,
  );
const sale = randomUUID(),
  report = randomUUID();
sql(
  `insert into public.sales_reports(id,branch_id,shift_id,submitted_by,report_type,gross_revenue) values('${report}','${branch}','${shift}','${users.manager.id}','X',10); insert into public.inventory_movements(id,branch_id,inventory_item_id,movement_type,quantity,stock_delta,sales_report_id,created_by) values('${sale}','${branch}','${item}','SALE',1,-1,'${report}','${users.manager.id}');`,
);
await deny(
  reverse("cashier", sale),
  "cashier cannot reverse a sale-linked movement (not authorized at all)",
);
await deny(
  reverse("manager", sale),
  "even a manager cannot directly reverse a sale-linked movement",
  "22023",
);
const crossCount = await good(
  rpc(token("manager"), "submit_inventory_count", {
    p_branch_id: other,
    p_shift_id: null,
    p_items: [{ inventory_item_id: otherItem, physical_quantity: 4 }],
  }),
  "manager creates cross-branch count",
);
await deny(
  rpc(token("cashier"), "void_inventory_count", {
    p_count_id: crossCount,
    p_reason: "cross branch attempt",
  }),
  "cashier cannot void this (or any) count",
);
await deny(
  rpc(token("branch_manager"), "void_inventory_count", {
    p_count_id: crossCount,
    p_reason: "cross branch",
  }),
  "branch manager cross-branch count void denied",
);
await deny(
  rpc(token("cashier"), "write_audit_log", {
    p_action: "inventory_adjustment",
    p_entity_type: "inventory_movements",
    p_entity_id: move,
    p_new_values: { forged: true },
  }),
  "cashier cannot forge audit via helper RPC",
);
for (const role of ["cashier", "viewer"]) {
  const logs = await good(
    req(
      "/rest/v1/audit_logs?select=old_values,new_values&action=eq.inventory_cost_change",
      token(role),
    ),
    `${role} audit confidentiality read`,
  );
  check(logs.length === 0, `${role} cannot extract cost through audit`);
}
// Actors now span branch_manager (adjustment, count-void) and manager/owner
// (reversal) rather than a single role, so the four rows we care about are
// pulled by their own ids instead of by one common actor.
const audit = await good(
  req(
    `/rest/v1/audit_logs?select=id,entity_id,actor_user_id,reason,old_values,new_values,created_at,action&action=in.(inventory_adjustment,inventory_movement_reversal,inventory_count_void)&entity_id=in.(${move},${reversalId},${linked},${count})`,
    token("owner"),
  ),
  "owner can review inventory audit across actors",
);
check(audit.length === 4, "the four privileged actions are audited");
check(
  audit.every((r) => r.reason?.trim() && r.created_at && r.new_values),
  "audit actor reason timestamp new values present",
);
for (const action of [
  "inventory_adjustment",
  "inventory_movement_reversal",
  "inventory_count_void",
]) {
  const rows = audit.filter((r) => r.action === action);
  check(rows.length > 0, `${action} audit present`);
  check(
    rows.every((r) => r.old_values !== null && r.new_values !== null),
    `${action} before and after values present`,
  );
}
const moveAudit = audit.find((r) => r.entity_id === move);
check(
  moveAudit?.old_values.theoretical_quantity === 12 &&
    moveAudit?.new_values.theoretical_quantity === 16,
  "branch manager adjustment audit stock 12 to 16",
);
const linkedAudit = audit.find((r) => r.entity_id === linked);
check(
  linkedAudit?.old_values.theoretical_quantity === 12 &&
    linkedAudit?.new_values.theoretical_quantity === 10,
  "branch manager linked correction audit stock 12 to 10",
);
const reversalAudit = audit.find(
  (r) => r.action === "inventory_movement_reversal",
);
check(
  reversalAudit?.old_values.theoretical_quantity === 16 &&
    reversalAudit?.new_values.theoretical_quantity === 12,
  "manager reversal audit stock 16 to 12",
);
const voidAudit = audit.find((r) => r.action === "inventory_count_void");
check(
  voidAudit?.old_values.status === "submitted" &&
    voidAudit?.new_values.status === "voided",
  "count void audit status transition",
);
for (const role of ["cashier", "owner"]) {
  for (const method of ["PATCH", "DELETE"]) {
    const result = await req(
      `/rest/v1/audit_logs?id=eq.${moveAudit.id}`,
      token(role),
      method,
      method === "PATCH" ? { reason: "tampered" } : undefined,
    );
    check(
      result.ok || result.data?.code === "42501",
      `${role} audit ${method} safely handled`,
    );
    const remaining = await good(
      req(
        `/rest/v1/audit_logs?select=reason&id=eq.${moveAudit.id}`,
        token("owner"),
      ),
      `${role} audit ${method} verification read`,
    );
    check(
      remaining.length === 1 && remaining[0].reason === moveAudit.reason,
      `${role} audit ${method} cannot mutate history`,
    );
  }
}
console.log(
  `LOCAL AUTH/POSTGREST PASSED: ${passed} assertions. Local fixtures persist until next fresh reset.`,
);
