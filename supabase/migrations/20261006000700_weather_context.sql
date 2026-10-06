-- =============================================================================
-- Phase 1D (1/2): weather context - forecast snapshots, observed daily context, read RPC
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production. No provider is called from SQL.
--
-- Two DIFFERENT concepts, deliberately stored apart:
--   * HISTORICAL daily context             -> public.external_context_daily (existing, analytics input). Written only for COMPLETED
--     business dates, only from an explicitly HISTORICAL-capable source (Open-Meteo's archive/reanalysis API), never from a forecast or a
--     "current" payload, and with PROVENANCE: manual | observed | reanalysis | provider_historical. Open-Meteo archive data is model
--     REANALYSIS, so it is stored as 'reanalysis' and never labelled "observed". A manual row is never overwritten automatically.
--     Analytics snapshots stay reproducible: they are immutable versions and a changed context only shows up when a new version is generated.
--   * FORECAST (mutable by nature)         -> public.weather_forecast_snapshots (append-only, one row per fetch, with fetched_at,
--     valid_until and the location used). A new forecast never rewrites a historical context row or an old snapshot.
--
-- The provider (Open-Meteo in V1) is an ADAPTER outside the database (weather-loader/): it normalises the provider response and calls
-- the service-role-only internal_store_weather_forecast. SQL and the app only ever see the normalised payload:
--   {"current": {"time","temperatureC","apparentTemperatureC","weatherCode","precipitationMm","windKmh","windGustKmh"},
--    "hourly": [{"time","temperatureC","apparentTemperatureC","precipitationProbability","precipitationMm","weatherCode","windKmh","windGustKmh"}],
--    "daily":  [{"date","temperatureMinC","temperatureMaxC","precipitationProbabilityMax","precipitationSumMm","windMaxKmh","windGustMaxKmh","weatherCode","sunrise","sunset"}]}
--
-- Weather is branch-specific: it uses branch_locations (coordinates) and branches.timezone. No coordinates = status unavailable
-- (missing_branch_location). Nothing guesses a location and nothing uses device location.
-- =============================================================================

insert into public.permissions (key, description) values
  ('weather.read', 'View the weather forecast/context of permitted branches.')
on conflict (key) do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'weather.read'
where r.key in ('owner', 'manager', 'branch_manager')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Historical context: richer observed daily fields (all nullable; missing = unknown, never "normal")
-- ---------------------------------------------------------------------------
alter table public.external_context_daily
  add column if not exists temperature_min_c numeric(5, 2) check (temperature_min_c is null or temperature_min_c between -60 and 60),
  add column if not exists temperature_max_c numeric(5, 2) check (temperature_max_c is null or temperature_max_c between -60 and 60),
  add column if not exists wind_gust_kmh numeric(6, 2) check (wind_gust_kmh is null or wind_gust_kmh >= 0),
  add column if not exists weather_code smallint check (weather_code is null or weather_code between 0 and 99),
  -- HOW the row came to exist: manual (a person, via the audited RPC), observed (direct station/measurement source), reanalysis (modelled
  -- historical re-computation, e.g. ERA5 through Open-Meteo archive), provider_historical (another provider-supported historical source)
  add column if not exists provenance text not null default 'manual' check (provenance in ('manual', 'observed', 'reanalysis', 'provider_historical')),
  add column if not exists source_retrieved_at timestamptz;
comment on column public.external_context_daily.provenance is
  'manual | observed | reanalysis | provider_historical. A forecast or current payload is never a provenance: it never becomes historical context. Open-Meteo archive = reanalysis (modelled), not direct observation.';
comment on column public.external_context_daily.temperature_c is 'Daily MEAN temperature (observed/historical). Min/max are separate columns.';
comment on column public.external_context_daily.weather_code is 'WMO weather interpretation code (0..99) of the day, when the source provides one.';

-- a row whose source is 'manual' always has manual provenance (also when a person edits a loader row through the audited RPC)
create or replace function public.external_context_provenance_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.source = 'manual' then
    new.provenance := 'manual';
    new.source_retrieved_at := null;
  end if;
  return new;
end;
$$;
create trigger external_context_provenance before insert or update on public.external_context_daily
  for each row execute function public.external_context_provenance_guard();

-- the analytics context payload now also carries min/max temperature, gust, the weather code and the PROVENANCE of the row
create or replace function public.analytics_context_for(p_branch_id uuid, p_date date)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select jsonb_strip_nulls(jsonb_build_object(
      'state', 'present',
      'temperatureC', c.temperature_c, 'temperatureMinC', c.temperature_min_c, 'temperatureMaxC', c.temperature_max_c,
      'apparentTemperatureC', c.apparent_temperature_c,
      'precipitationMm', c.precipitation_mm, 'windKmh', c.wind_kmh, 'windGustKmh', c.wind_gust_kmh, 'weatherCode', c.weather_code,
      'isWeekend', c.is_weekend, 'isPublicHoliday', c.is_public_holiday, 'holidayName', c.holiday_name,
      'payPeriodTag', c.pay_period_tag, 'specialEvent', c.special_event, 'source', c.source, 'provenance', c.provenance))
    from public.external_context_daily c
    where c.context_date = p_date and (c.branch_id = p_branch_id or c.branch_id is null)
    order by (c.branch_id is not null) desc
    limit 1
  ), jsonb_build_object('state', 'missing', 'isWeekend', extract(isodow from p_date) in (6, 7)));
$$;
revoke all on function public.analytics_context_for(uuid, date) from public, anon, authenticated;
grant execute on function public.analytics_context_for(uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Technical default: forecast validity (NOT a business-risk threshold)
-- ---------------------------------------------------------------------------
-- How long a fetched forecast counts as "fresh" is one centrally configurable TECHNICAL setting. It says nothing about weather risk.
-- Stale rule everywhere: stale = now > valid_until, where valid_until = fetched_at + this TTL (stored on the snapshot at fetch time).
create table if not exists public.weather_settings (
  singleton boolean primary key default true check (singleton),
  forecast_ttl_minutes integer not null default 60 check (forecast_ttl_minutes between 5 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
comment on table public.weather_settings is
  'Single-row technical settings of the weather cache. forecast_ttl_minutes (default 60, 5..1440) = how long a fetched forecast is fresh; a technical default, not a business threshold. Changed only through update_weather_settings (audited).';
insert into public.weather_settings (singleton) values (true) on conflict do nothing;
alter table public.weather_settings enable row level security;
revoke all on public.weather_settings from anon, authenticated;
grant select on public.weather_settings to authenticated;
create policy weather_settings_select on public.weather_settings for select to authenticated using (public.current_user_has_permission('weather.read'));

create or replace function public.internal_weather_ttl_minutes()
returns integer
language sql
stable
security definer
set search_path = public
as $$ select coalesce((select forecast_ttl_minutes from public.weather_settings where singleton), 60) $$;
revoke all on function public.internal_weather_ttl_minutes() from public, anon, authenticated;
grant execute on function public.internal_weather_ttl_minutes() to service_role;

create or replace function public.update_weather_settings(p_forecast_ttl_minutes integer, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old integer;
begin
  if not public.current_user_is_owner_or_manager() then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if p_forecast_ttl_minutes is null or p_forecast_ttl_minutes < 5 or p_forecast_ttl_minutes > 1440 then
    raise exception 'forecast_ttl_minutes must be between 5 and 1440' using errcode = '22023';
  end if;
  select forecast_ttl_minutes into v_old from public.weather_settings where singleton for update;
  update public.weather_settings set forecast_ttl_minutes = p_forecast_ttl_minutes, updated_at = now(), updated_by = auth.uid() where singleton;
  perform public.write_audit_log('weather_settings_update', 'weather_settings', 'singleton', jsonb_build_object('forecast_ttl_minutes', v_old),
    jsonb_build_object('forecast_ttl_minutes', p_forecast_ttl_minutes), trim(p_reason));
end;
$$;
comment on function public.update_weather_settings(integer, text) is
  'Owner/manager only, mandatory reason, audited. Changes the technical forecast TTL; it applies to FORECASTS FETCHED AFTERWARDS (stored valid_until is never rewritten).';
revoke all on function public.update_weather_settings(integer, text) from public, anon;
grant execute on function public.update_weather_settings(integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Historical daily weather loader (service role only): completed days, historical-capable sources only, with provenance
-- ---------------------------------------------------------------------------
create or replace function public.internal_upsert_observed_weather(p_branch_id uuid, p_date date, p_values jsonb, p_source text, p_provenance text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Europe/Istanbul')::date;
  v_existing record;
begin
  if p_source is null or p_source !~ '^[a-z][a-z0-9_.-]{1,39}$' or p_source = 'manual' then
    raise exception 'a provider source name (not manual) is required' using errcode = '22023';
  end if;
  -- a forecast or a current payload is never a provenance: only historical-capable sources may write history
  if p_provenance is null or p_provenance not in ('observed', 'reanalysis', 'provider_historical') then
    raise exception 'provenance must be observed, reanalysis or provider_historical' using errcode = '22023';
  end if;
  if p_date >= v_today then
    raise exception 'historical context is written only for completed days (forecasts live in weather_forecast_snapshots)' using errcode = '22023';
  end if;
  if not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'branch not found' using errcode = '22023';
  end if;
  select * into v_existing from public.external_context_daily where context_date = p_date and branch_id = p_branch_id;
  -- a manual row (or a row of another source) is never overwritten automatically
  if found and (v_existing.source <> p_source or v_existing.provenance = 'manual') then
    return 'skipped_other_source';
  end if;
  insert into public.external_context_daily (context_date, branch_id, temperature_c, temperature_min_c, temperature_max_c, apparent_temperature_c,
    precipitation_mm, wind_kmh, wind_gust_kmh, weather_code, source, provenance, source_retrieved_at)
  values (p_date, p_branch_id, (p_values ->> 'temperatureC')::numeric, (p_values ->> 'temperatureMinC')::numeric, (p_values ->> 'temperatureMaxC')::numeric,
    (p_values ->> 'apparentTemperatureC')::numeric, (p_values ->> 'precipitationMm')::numeric, (p_values ->> 'windKmh')::numeric,
    (p_values ->> 'windGustKmh')::numeric, (p_values ->> 'weatherCode')::smallint, p_source, p_provenance, now())
  on conflict (context_date, coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)) do update set
    temperature_c = excluded.temperature_c, temperature_min_c = excluded.temperature_min_c, temperature_max_c = excluded.temperature_max_c,
    apparent_temperature_c = excluded.apparent_temperature_c, precipitation_mm = excluded.precipitation_mm, wind_kmh = excluded.wind_kmh,
    wind_gust_kmh = excluded.wind_gust_kmh, weather_code = excluded.weather_code, provenance = excluded.provenance, source_retrieved_at = excluded.source_retrieved_at
   where public.external_context_daily.source = p_source and public.external_context_daily.provenance <> 'manual';
  return case when v_existing.id is null then 'inserted' else 'updated' end;
end;
$$;
comment on function public.internal_upsert_observed_weather(uuid, date, jsonb, text, text) is
  'INTERNAL (service role). Writes HISTORICAL daily context for a completed Istanbul date from a historical-capable source, with provenance (observed | reanalysis | provider_historical). Never accepts a forecast/current provenance, never touches today/future, never overwrites a manual row or a row of another source.';
revoke all on function public.internal_upsert_observed_weather(uuid, date, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.internal_upsert_observed_weather(uuid, date, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Forecast snapshots (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.weather_forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references public.branches (id),
  provider text not null check (provider ~ '^[a-z][a-z0-9_.-]{1,39}$'),
  fetched_at timestamptz not null,
  generated_at timestamptz,
  valid_until timestamptz not null,
  timezone text not null,
  -- the location the forecast was fetched for (snapshot of branch_locations at fetch time); not selectable by clients
  latitude numeric(9, 6) not null,
  longitude numeric(9, 6) not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (branch_id, provider, fetched_at),
  constraint weather_valid_until_after_fetch check (valid_until > fetched_at and valid_until <= fetched_at + interval '24 hours'),
  constraint weather_payload_shape check (
    jsonb_typeof(payload -> 'current') = 'object' and jsonb_typeof(payload -> 'hourly') = 'array' and jsonb_typeof(payload -> 'daily') = 'array'
    and jsonb_array_length(payload -> 'hourly') <= 240 and jsonb_array_length(payload -> 'daily') <= 16)
);
comment on table public.weather_forecast_snapshots is
  'Normalised weather FORECAST per fetch (append-only). A forecast is a forecast, not measured fact; it never rewrites external_context_daily. Freshness: fresh while now <= valid_until (= fetched_at + the central technical TTL in weather_settings), otherwise stale (still shown with its timestamp). Retention/cleanup is an open operational item.';
create index if not exists idx_weather_snapshots_branch on public.weather_forecast_snapshots (branch_id, fetched_at desc);

create or replace function public.weather_prevent_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'weather_forecast_snapshots is append-only' using errcode = '42501';
end;
$$;
create trigger weather_snapshots_append_only before update or delete on public.weather_forecast_snapshots
  for each row execute function public.weather_prevent_mutation();

alter table public.weather_forecast_snapshots enable row level security;
revoke all on public.weather_forecast_snapshots from anon, authenticated;
-- coordinates stay private: clients may select everything except latitude/longitude
grant select (id, branch_id, provider, fetched_at, generated_at, valid_until, timezone, payload, created_at) on public.weather_forecast_snapshots to authenticated;
create policy weather_snapshots_select on public.weather_forecast_snapshots
  for select to authenticated using (public.current_user_can_inventory('weather.read', branch_id));

create or replace function public.internal_store_weather_forecast(
  p_branch_id uuid, p_provider text, p_fetched_at timestamptz, p_generated_at timestamptz, p_valid_until timestamptz, p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_branch record;
  v_loc record;
  v_id uuid;
begin
  select id, timezone into v_branch from public.branches where id = p_branch_id;
  if not found then raise exception 'branch not found' using errcode = '22023'; end if;
  select * into v_loc from public.branch_locations where branch_id = p_branch_id;
  if not found or v_loc.latitude is null or v_loc.longitude is null then
    raise exception 'missing_branch_location' using errcode = '22023';
  end if;
  -- validity: an explicit p_valid_until (override) or fetched_at + the central technical TTL (weather_settings)
  insert into public.weather_forecast_snapshots (branch_id, provider, fetched_at, generated_at, valid_until, timezone, latitude, longitude, payload)
  values (p_branch_id, p_provider, p_fetched_at, p_generated_at,
          coalesce(p_valid_until, p_fetched_at + make_interval(mins => public.internal_weather_ttl_minutes())), v_branch.timezone, v_loc.latitude, v_loc.longitude, p_payload)
  on conflict (branch_id, provider, fetched_at) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
comment on function public.internal_store_weather_forecast(uuid, text, timestamptz, timestamptz, timestamptz, jsonb) is
  'INTERNAL (service role, called by the weather loader). Stores one normalised forecast for a branch that HAS coordinates; the location used is snapshotted. p_valid_until NULL = fetched_at + the central technical TTL (weather_settings.forecast_ttl_minutes). Idempotent per (branch, provider, fetched_at).';
revoke all on function public.internal_store_weather_forecast(uuid, text, timestamptz, timestamptz, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.internal_store_weather_forecast(uuid, text, timestamptz, timestamptz, timestamptz, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Read model: fresh | stale | unavailable (never a fake zero)
-- ---------------------------------------------------------------------------
create or replace function public.get_branch_weather(p_branch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_loc record;
  v_snap record;
  v_stale_reason text;
begin
  if not public.current_user_can_inventory('weather.read', p_branch_id) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  select timezone into v_tz from public.branches where id = p_branch_id;
  if not found then raise exception 'not authorized' using errcode = '42501'; end if;
  select * into v_loc from public.branch_locations where branch_id = p_branch_id;
  if not found or v_loc.latitude is null or v_loc.longitude is null then
    return jsonb_build_object('status', 'unavailable', 'reason', 'missing_branch_location', 'timezone', v_tz);
  end if;
  select * into v_snap from public.weather_forecast_snapshots where branch_id = p_branch_id order by fetched_at desc limit 1;
  if not found then
    return jsonb_build_object('status', 'unavailable', 'reason', 'no_forecast_loaded', 'timezone', v_tz, 'location', jsonb_build_object('label', v_loc.location_label));
  end if;
  if now() > v_snap.valid_until then v_stale_reason := 'expired'; end if;
  -- the branch moved after the forecast was fetched: the old forecast describes another place
  if abs(v_snap.latitude - v_loc.latitude) > 0.001 or abs(v_snap.longitude - v_loc.longitude) > 0.001 then v_stale_reason := 'location_changed'; end if;
  return jsonb_build_object(
    'status', case when v_stale_reason is null then 'fresh' else 'stale' end,
    'staleReason', v_stale_reason,
    'isForecast', true,
    'provider', v_snap.provider, 'timezone', v_snap.timezone,
    'fetchedAt', v_snap.fetched_at, 'generatedAt', v_snap.generated_at, 'validUntil', v_snap.valid_until,
    'ageMinutes', floor(extract(epoch from (now() - v_snap.fetched_at)) / 60),
    'location', jsonb_build_object('label', v_loc.location_label),
    'current', v_snap.payload -> 'current',
    'hourly', coalesce((select jsonb_agg(h order by h ->> 'time') from jsonb_array_elements(v_snap.payload -> 'hourly') h
                         where (h ->> 'time')::timestamptz >= now() - interval '1 hour' and (h ->> 'time')::timestamptz < now() + interval '48 hours'), '[]'::jsonb),
    'daily', v_snap.payload -> 'daily');
end;
$$;
comment on function public.get_branch_weather(uuid) is
  'Latest normalised forecast of a branch: status fresh (now <= valid_until) | stale (expired or the branch location changed; still returned with its fetchedAt) | unavailable (missing_branch_location | no_forecast_loaded). Labelled isForecast. weather.read + branch scope; coordinates are never returned.';
revoke all on function public.get_branch_weather(uuid) from public, anon;
grant execute on function public.get_branch_weather(uuid) to authenticated;
