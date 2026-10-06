/**
 * LOCAL ONLY concurrency test of receive_purchase_order (fresh reset first):
 *   node supabase/tests/procurement_concurrency.test.mjs
 *
 * Two REAL database sessions call the RPC at the same time. The first one holds its transaction open (pg_sleep) so the
 * second must wait on the order row lock and then re-read the open quantity: the same remaining quantity can never be
 * received twice. Fixtures are committed (synthetic); reset the local database afterwards.
 */
import { spawn, execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";

const DOCKER = process.env.DOCKER_CLI || "docker";
const CONTAINER = "supabase_db_Rumeli-iskelesi-yonetim";
const psqlArgs = ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"];
const sql = (text) => execFileSync(DOCKER, psqlArgs, { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
const session = (text) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(DOCKER, psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err, ms: Date.now() - started }));
    child.stdin.end(text);
  });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const check = (ok, label) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
};

const uid = randomUUID();
sql(`
  insert into auth.users (id, email) values ('${uid}', 'concurrency@proc-test.invalid');
  insert into public.profiles (id, full_name, employee_code) values ('${uid}', 'Concurrency Manager', 'C777');
  insert into public.user_roles (user_id, role_id) select '${uid}', id from public.roles where key = 'manager';
  insert into public.inventory_items (branch_id, code, name, unit) select id, 'CC1', 'Concurrency Item', 'kg' from public.branches where key = 'rumeli_iskelesi';
  insert into public.suppliers (code, name, supplier_type) values ('CC-SUP', 'Sentetik Eşzamanlılık', 'COMPANY');
`);
const supplier = sql("select id from public.suppliers where code = 'CC-SUP'");
const item = sql("select id from public.inventory_items where code = 'CC1'");
const branch = sql("select id from public.branches where key = 'rumeli_iskelesi'");

function makeOrder(quantity) {
  const order = sql(`insert into public.purchase_orders (branch_id, supplier_id, created_by) values ('${branch}', '${supplier}', '${uid}') returning id;`).split("\n")[0];
  const line = sql(`insert into public.purchase_order_lines (purchase_order_id, inventory_item_id, ordered_quantity) values ('${order}', '${item}', ${quantity}) returning id;`).split("\n")[0];
  sql(`update public.purchase_orders set status = 'SUBMITTED' where id = '${order}'; update public.purchase_orders set status = 'APPROVED' where id = '${order}';`);
  return { order, line };
}
const receiveSql = (order, line, qty, holdSeconds) => `
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '${uid}', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select public.receive_purchase_order('${order}', '[{"line_id":"${line}","quantity":${qty}}]'::jsonb, 'concurrency test');
${holdSeconds ? `select pg_sleep(${holdSeconds});` : ""}
commit;
`;
const stockOf = () => Number(sql(`select coalesce(sum(stock_delta), 0) from public.inventory_movements where inventory_item_id = '${item}'`));

// Case 1: the same full quantity from two sessions at once
{
  const { order, line } = makeOrder(10);
  const first = session(receiveSql(order, line, 10, 4));
  await wait(1500);
  const second = session(receiveSql(order, line, 10, 0));
  const [a, b] = await Promise.all([first, second]);
  check(a.code === 0, "session 1 receives the whole order");
  check(b.code !== 0 && /cannot be received|exceeds/.test(b.err), "session 2 is refused after waiting for the lock (nothing left to receive)");
  check(b.ms > 2000, "session 2 really waited for session 1's row lock");
  check(sql(`select count(*) from public.purchase_order_receipts where purchase_order_id = '${order}'`) === "1", "exactly one receipt link exists");
  check(sql(`select received_quantity from public.purchase_order_lines where id = '${line}'`) === "10.000", "received_quantity is 10, not 20");
  check(stockOf() === 10, "the ledger gained exactly 10");
}

// Case 2: two partial receipts that together exceed the order (6 + 6 of 10)
{
  const before = stockOf();
  const { order, line } = makeOrder(10);
  const first = session(receiveSql(order, line, 6, 4));
  await wait(1500);
  const second = session(receiveSql(order, line, 6, 0));
  const [a, b] = await Promise.all([first, second]);
  check(a.code === 0, "the first partial receipt (6) succeeds");
  check(b.code !== 0 && /exceeds what is still open/.test(b.err), "the second 6 is refused: only 4 are still open");
  check(sql(`select status from public.purchase_orders where id = '${order}'`) === "PARTIALLY_RECEIVED", "the order is PARTIALLY_RECEIVED");
  check(sql(`select received_quantity from public.purchase_order_lines where id = '${line}'`) === "6.000", "received_quantity is 6");
  check(stockOf() === before + 6, "the ledger gained exactly 6");
  check(sql(`select count(*) from public.inventory_movements where reference = (select order_number from public.purchase_orders where id = '${order}')`) === "1", "no orphan movement from the refused session");
}

// Case 3: two sessions receive DIFFERENT remaining parts that fit (4 + 6 of 10) and both succeed, in order
{
  const before = stockOf();
  const { order, line } = makeOrder(10);
  const first = session(receiveSql(order, line, 4, 3));
  await wait(1000);
  const second = session(receiveSql(order, line, 6, 0));
  const [a, b] = await Promise.all([first, second]);
  check(a.code === 0 && b.code === 0, "two concurrent receipts that fit both succeed (serialised)");
  check(sql(`select status from public.purchase_orders where id = '${order}'`) === "RECEIVED", "together they close the order");
  check(sql(`select received_quantity from public.purchase_order_lines where id = '${line}'`) === "10.000" && stockOf() === before + 10, "received 10, ledger +10");
}

console.log(`\nPROCUREMENT CONCURRENCY PASSED: ${passed} assertions. Reset the local database now (committed fixtures).`);
