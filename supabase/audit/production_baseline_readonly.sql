-- =============================================================================
-- supabase/audit/production_baseline_readonly.sql
-- =============================================================================
-- READ-ONLY baseline of a Supabase database (production or local). ONE SELECT statement that returns ONE jsonb document.
-- It reads catalogs, supabase_migrations, auth/storage COUNTS and the row counts of known tables. It writes nothing, takes no lock beyond the
-- default catalog/table read locks of a SELECT, and calls no volatile function (the legacy row counts use query_to_xml over a plain
-- `select count(*)`).
--
--   production (read-only through the Management API; the document is printed, nothing is stored remotely):
--     supabase db query --linked -f supabase/audit/production_baseline_readonly.sql --output-format json > baseline.json
--   local:
--     docker exec -i supabase_db_Rumeli-iskelesi-yonetim psql -U postgres -At -f - < supabase/audit/production_baseline_readonly.sql
--
-- Compare two baselines with supabase/audit/compare_baselines.mjs. The document contains NO row contents, no secrets, no keys, no PINs.
-- =============================================================================
with
fn as (
  select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args, p.prosecdef as definer,
         coalesce(p.proconfig::text, '') like '%search_path=%' as search_path_locked,
         has_function_privilege('public', p.oid, 'execute') as public_exec,
         has_function_privilege('anon', p.oid, 'execute') as anon_exec,
         has_function_privilege('authenticated', p.oid, 'execute') as authenticated_exec,
         has_function_privilege('service_role', p.oid, 'execute') as service_exec,
         md5(pg_get_functiondef(p.oid)) as def_md5, md5(coalesce(p.proacl::text, '')) as acl_md5
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity as rls,
         md5(coalesce((select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull::text || ':' || coalesce(pg_get_expr(d.adbin, d.adrelid), ''), '|' order by a.attnum)
                         from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
                        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped), '')) as columns_md5,
         md5(coalesce((select string_agg(k.conname || ':' || pg_get_constraintdef(k.oid), '|' order by k.conname) from pg_constraint k where k.conrelid = c.oid), '')) as constraints_md5,
         md5(coalesce((select string_agg(pg_get_triggerdef(t.oid), '|' order by t.tgname) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal), '')) as triggers_md5,
         md5(coalesce((select string_agg(pg_get_indexdef(i.indexrelid), '|' order by pg_get_indexdef(i.indexrelid)) from pg_index i where i.indrelid = c.oid), '')) as indexes_md5,
         md5(case when c.relkind = 'v' then pg_get_viewdef(c.oid) else '' end) as view_md5,
         md5(coalesce(c.relacl::text, '')) as acl_md5
    from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p', 'v', 'm', 'S')
     and not exists (select 1 from pg_depend d where d.objid = c.oid and d.deptype = 'e')
),
cnt as (
  select 'daily_reports' k, to_regclass('public.daily_reports') r union all select 'entry_history', to_regclass('public.entry_history')
  union all select 'shift_schedule', to_regclass('public.shift_schedule') union all select 'cashiers', to_regclass('public.cashiers')
  union all select 'targets', to_regclass('public.targets') union all select 'achievements', to_regclass('public.achievements')
  union all select 'admins', to_regclass('public.admins') union all select 'daily_revenue', to_regclass('public.daily_revenue')
  union all select 'weekly_performance', to_regclass('public.weekly_performance') union all select 'daily_performance', to_regclass('public.daily_performance')
  union all select 'branches', to_regclass('public.branches') union all select 'shift_definitions', to_regclass('public.shift_definitions')
  union all select 'sales_categories', to_regclass('public.sales_categories') union all select 'roles', to_regclass('public.roles')
  union all select 'permissions', to_regclass('public.permissions') union all select 'role_permissions', to_regclass('public.role_permissions')
  union all select 'profiles', to_regclass('public.profiles') union all select 'user_roles', to_regclass('public.user_roles')
  union all select 'pin_credentials', to_regclass('public.pin_credentials') union all select 'branch_memberships', to_regclass('public.branch_memberships')
  union all select 'shifts', to_regclass('public.shifts') union all select 'sales_reports', to_regclass('public.sales_reports')
  union all select 'registers', to_regclass('public.registers') union all select 'inventory_items', to_regclass('public.inventory_items')
  union all select 'inventory_movements', to_regclass('public.inventory_movements') union all select 'audit_logs', to_regclass('public.audit_logs')
  union all select 'legacy_sales_import_runs', to_regclass('public.legacy_sales_import_runs')
  union all select 'analytics_settings', to_regclass('public.analytics_settings') union all select 'waste_reasons', to_regclass('public.waste_reasons')
  union all select 'branch_locations', to_regclass('public.branch_locations') union all select 'suppliers', to_regclass('public.suppliers')
  union all select 'item_supply_params', to_regclass('public.item_supply_params') union all select 'purchase_orders', to_regclass('public.purchase_orders')
  union all select 'weather_settings', to_regclass('public.weather_settings') union all select 'weather_forecast_snapshots', to_regclass('public.weather_forecast_snapshots')
  union all select 'external_context_daily', to_regclass('public.external_context_daily')
  union all select 'daily_analytics_snapshots', to_regclass('public.daily_analytics_snapshots')
  union all select 'weekly_analytics_snapshots', to_regclass('public.weekly_analytics_snapshots')
)
select jsonb_pretty(jsonb_build_object(
  'server_version', current_setting('server_version'),
  'migrations', (select coalesce(jsonb_agg(version order by version), '[]'::jsonb) from supabase_migrations.schema_migrations),
  'counts', jsonb_build_object(
    'public_tables', (select count(*) from rel where relkind in ('r', 'p')),
    'public_views', (select count(*) from rel where relkind = 'v'),
    'public_matviews', (select count(*) from rel where relkind = 'm'),
    'public_sequences', (select count(*) from rel where relkind = 'S'),
    'public_relations', (select count(*) from rel where relkind in ('r', 'p', 'v', 'm')),
    'public_functions', (select count(*) from fn),
    'public_definer_functions', (select count(*) from fn where definer),
    'public_triggers', (select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relnamespace = 'public'::regnamespace and not t.tgisinternal),
    'public_policies', (select count(*) from pg_policies where schemaname = 'public'),
    'storage_policies', (select count(*) from pg_policies where schemaname = 'storage'),
    'public_indexes', (select count(*) from pg_indexes where schemaname = 'public'),
    'tables_without_rls', (select count(*) from rel where relkind in ('r', 'p') and not rls)),
  'hygiene', jsonb_build_object(
    'definer_without_locked_search_path', (select coalesce(jsonb_agg(proname || '(' || args || ')' order by proname), '[]'::jsonb) from fn where definer and not search_path_locked),
    'definer_executable_by_public', (select coalesce(jsonb_agg(proname || '(' || args || ')' order by proname), '[]'::jsonb) from fn where definer and public_exec),
    'internal_functions_not_service_only', (select coalesce(jsonb_agg(proname || '(' || args || ')' order by proname), '[]'::jsonb) from fn where proname like 'internal\_%' and (public_exec or anon_exec or authenticated_exec or not service_exec)),
    'functions_executable_by_anon', (select coalesce(jsonb_agg(proname || '(' || args || ')' order by proname), '[]'::jsonb) from fn where anon_exec)),
  'relations', (select coalesce(jsonb_agg(jsonb_build_object('name', relname, 'kind', relkind, 'rls', rls, 'columns_md5', columns_md5, 'constraints_md5', constraints_md5, 'triggers_md5', triggers_md5, 'indexes_md5', indexes_md5, 'view_md5', view_md5, 'acl_md5', acl_md5) order by relname), '[]'::jsonb) from rel),
  'functions', (select coalesce(jsonb_agg(jsonb_build_object('name', proname, 'args', args, 'definer', definer, 'search_path_locked', search_path_locked, 'public', public_exec, 'anon', anon_exec, 'authenticated', authenticated_exec, 'service_role', service_exec, 'def_md5', def_md5, 'acl_md5', acl_md5) order by proname, args), '[]'::jsonb) from fn),
  'policies', (select coalesce(jsonb_agg(jsonb_build_object('schema', schemaname, 'table', tablename, 'name', policyname, 'cmd', cmd, 'def_md5', md5(coalesce(qual, '') || '|' || coalesce(with_check, '') || '|' || roles::text)) order by schemaname, tablename, policyname), '[]'::jsonb) from pg_policies where schemaname in ('public', 'storage')),
  'anon_table_privileges', (select coalesce(jsonb_agg(distinct table_name || ':' || privilege_type), '[]'::jsonb) from information_schema.role_table_grants where grantee = 'anon' and table_schema = 'public'),
  'storage', jsonb_build_object(
    'buckets', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'public', public, 'file_size_limit', file_size_limit, 'allowed_mime_types', allowed_mime_types) order by id), '[]'::jsonb) from storage.buckets),
    'object_counts', (select coalesce(jsonb_agg(jsonb_build_object('bucket', bucket_id, 'objects', n) order by bucket_id), '[]'::jsonb) from (select bucket_id, count(*) n from storage.objects group by bucket_id) s)),
  'auth', jsonb_build_object('users', (select count(*) from auth.users), 'identities', (select count(*) from auth.identities), 'sessions', (select count(*) from auth.sessions)),
  'extensions', (select coalesce(jsonb_agg(extname order by extname), '[]'::jsonb) from pg_extension),
  'authenticator_settings', (select coalesce(jsonb_agg(s order by s), '[]'::jsonb) from (select unnest(rolconfig) s from pg_roles where rolname = 'authenticator') x),
  'row_counts', (select coalesce(jsonb_object_agg(k, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %s', r), false, true, '')))[1]::text::bigint order by k), '{}'::jsonb) from cnt where r is not null)
)) as baseline;
