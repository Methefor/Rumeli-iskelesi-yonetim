/**
 * Proves supabase/rollback/v4_schema_teardown.sql removes exactly the V4 schema and
 * leaves LEGACY-named decoy objects (with data) untouched. LOCAL ONLY, fresh reset
 * first:  node supabase/tests/schema_teardown.test.mjs
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const status = JSON.parse(
  process.env.SUPABASE_CLI
    ? execFileSync(process.env.SUPABASE_CLI, ["status", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
    : execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npx supabase status -o json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }),
);
if (new URL(status.API_URL).hostname !== "127.0.0.1") throw new Error("LOCAL ONLY");
const psql = (text, expectFailure = false) => {
  try {
    return execFileSync(
      process.env.DOCKER_CLI || "docker",
      ["exec", "-i", "supabase_db_Rumeli-iskelesi-yonetim", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
      { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
    ).trim();
  } catch (e) {
    if (expectFailure) return `ERROR:${e.stderr}`;
    throw e;
  }
};
let passed = 0;
const check = (ok, label) => {
  if (!ok) throw new Error(`FAIL ${label}`);
  passed += 1;
  console.log(`PASS ${label}`);
};

const teardown = fs.readFileSync(path.join(root, "supabase/rollback/v4_schema_teardown.sql"), "utf8");
check(/LOCK GUARD/.test(teardown), "the teardown script ships locked");

// Decoys named exactly like production's legacy objects.
psql(`
create table public.daily_reports (id uuid primary key default gen_random_uuid(), total numeric);
insert into public.daily_reports(total) values (10.5), (20.25);
create table public.cashiers (id uuid primary key default gen_random_uuid(), pin text);
insert into public.cashiers(pin) values ('0000');
create function public.calculate_points(p_is_on_time boolean, p_is_complete boolean) returns integer language sql as 'select 1';
create function public.update_updated_at() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger trg_decoy before update on public.daily_reports for each row execute function public.update_updated_at();
create policy "Public read access on daily_reports" on public.daily_reports for select using (true);
`);
const v4Tables = () => psql("select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','v') and c.relname not in ('daily_reports','cashiers')");
check(v4Tables() === "51", "fresh database holds the 46 V4 tables + 5 views next to the decoys");

const locked = psql(teardown, true);
check(locked.startsWith("ERROR:") && /locked/.test(locked) && v4Tables() === "51", "the locked script refuses to run and drops nothing");

const unlocked = teardown.replace(/-- >>> LOCK GUARD[\s\S]*?-- <<< LOCK GUARD <<</, "");
psql(unlocked);
check(v4Tables() === "0", "unlocked teardown removes all 51 V4 relations");
check(psql("select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'") === "2", "only the two decoy functions remain (all 146 V4 functions removed)");
check(psql("select count(*) from public.daily_reports") === "2" && psql("select count(*) from public.cashiers") === "1", "decoy legacy tables keep every row");
check(psql("select count(*) from pg_trigger where tgname='trg_decoy'") === "1" && psql("select count(*) from pg_policies where tablename='daily_reports'") === "1", "decoy legacy trigger and policy survive");
check(psql("select count(*) from pg_policies where schemaname='storage' and policyname like 'avatars_v4%'") === "0", "avatars_v4 storage policies are gone");
check(psql("select count(*) from pg_roles r, unnest(r.rolconfig) s where r.rolname='authenticator' and s like 'pgrst.db_pre_request%'") === "0", "the PostgREST pre-request hook is removed");
psql(unlocked);
check(v4Tables() === "0", "the teardown is idempotent");
console.log(`\nSCHEMA TEARDOWN PASSED: ${passed} assertions. Reset the local database now (fixtures dropped, decoys remain).`);
