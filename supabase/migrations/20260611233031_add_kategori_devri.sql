-- =============================================================================
-- 20260611233031_add_kategori_devri.sql  (history mirror of a PRODUCTION-ONLY migration)
-- =============================================================================
-- This exact version is already recorded in the production project's
-- supabase_migrations.schema_migrations (name `add_kategori_devri`; it was
-- applied before V4 existed and added one column to the LEGACY table
-- daily_reports). Without a local file with the same version, `supabase db push`
-- refuses to run ("Remote migration versions not found in local migrations
-- directory") and the only workaround would be rewriting production migration
-- history with `migration repair`.
--
-- This file mirrors the remote statement defensively:
--   * production: the column already exists -> no change (IF NOT EXISTS);
--   * local/disposable databases have no legacy table -> complete no-op.
-- It never creates, alters or drops anything else, and never touches V4 objects.
-- Because its version sorts before the V4 timestamped migrations but after the
-- 001-018 chain, an initial production apply must use `db push --include-all`.
-- =============================================================================
do $$
begin
  if to_regclass('public.daily_reports') is not null then
    alter table public.daily_reports add column if not exists kategori_devri numeric default 0;
  end if;
end
$$;
