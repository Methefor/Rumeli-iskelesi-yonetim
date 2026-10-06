-- =============================================================================
-- Phase 1B (3/3): branch location foundation (no weather provider, no geocoding)
-- =============================================================================
-- LOCAL DEVELOPMENT ONLY - not applied to production.
--
-- Design (least disruptive, reviewed): public.branches keeps EVERY existing column, grant and policy, so every
-- current consumer (select('*'), embeds such as branches(name), the operating-data and import tools) is untouched.
-- Two things are added:
--   * branches.timezone   non-sensitive, default 'Europe/Istanbul' (existing rows get the default; an explicit value is never
--                         overwritten); validated against the IANA zone list by a trigger on every write path.
--   * public.branch_locations  management-only detail (latitude, longitude, address, location_label) in ONE row per branch.
--                         No row = no location. Nothing is invented: no row is seeded.
-- Why a side table and not a column-level revoke on branches: a column-level SELECT grant makes `select *` fail for every
-- authenticated user, which would break existing flows. A side table with its own RLS hides the detail without touching them.
--
-- Access: reads need permission branch.location.read (owner, manager org-wide; branch_manager only own branches) via
-- RLS or list_branch_locations(); cashier/employee/viewer see 0 rows. Writes only through update_branch_location
-- (branch.manage = owner + manager, mandatory reason, audited). No direct INSERT/UPDATE/DELETE grant exists.
-- =============================================================================

insert into public.permissions (key, description) values
  ('branch.location.read', 'View branch coordinates, address and location label for permitted branches.')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key = 'branch.location.read'
where r.key in ('owner', 'manager', 'branch_manager')
on conflict do nothing;

alter table public.branches add column if not exists timezone text not null default 'Europe/Istanbul';
alter table public.branches add constraint branches_timezone_nonempty check (length(trim(timezone)) > 0);
comment on column public.branches.timezone is 'IANA time zone of the branch (default Europe/Istanbul), validated by trigger on every write.';

create or replace function public.branches_validate_timezone()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger branches_validate_timezone before insert or update of timezone on public.branches
  for each row execute function public.branches_validate_timezone();

create table if not exists public.branch_locations (
  branch_id uuid primary key references public.branches (id) on delete cascade,
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  address text check (address is null or length(address) <= 300),
  location_label text check (location_label is null or length(location_label) <= 80),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id),
  constraint branch_locations_latitude_range check (latitude is null or latitude between -90 and 90),
  constraint branch_locations_longitude_range check (longitude is null or longitude between -180 and 180),
  constraint branch_locations_coordinates_pair check ((latitude is null) = (longitude is null))
);
comment on table public.branch_locations is
  'Management-only branch location detail (optional coordinates, address, label). One row per branch, none seeded. Written only through update_branch_location (audited); read through RLS (branch.location.read + branch scope) or list_branch_locations().';
comment on column public.branch_locations.latitude is 'Optional WGS84 latitude (-90..90). NULL until a manager enters it; never guessed or geocoded.';

alter table public.branch_locations enable row level security;
revoke all on public.branch_locations from anon, authenticated;
grant select on public.branch_locations to authenticated;
create policy branch_locations_select on public.branch_locations
  for select to authenticated
  using (public.current_user_can_inventory('branch.location.read', branch_id));  -- permission + (org-wide or own branch)

create or replace function public.update_branch_location(
  p_branch_id uuid,
  p_latitude numeric,
  p_longitude numeric,
  p_timezone text,
  p_address text,
  p_location_label text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old record;
  v_old_loc record;
  v_tz text := nullif(trim(coalesce(p_timezone, '')), '');
begin
  if not public.current_user_has_permission('branch.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'a reason of at least 5 characters is required' using errcode = '22023';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'latitude and longitude must be set together' using errcode = '22023';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90 or p_longitude < -180 or p_longitude > 180) then
    raise exception 'coordinates out of range' using errcode = '22023';
  end if;
  select * into v_old from public.branches where id = p_branch_id for update;
  if not found then
    raise exception 'branch not found' using errcode = '22023';
  end if;
  select * into v_old_loc from public.branch_locations where branch_id = p_branch_id;
  if v_tz is null then
    v_tz := v_old.timezone;
  elsif not exists (select 1 from pg_catalog.pg_timezone_names where name = v_tz) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  update public.branches set timezone = v_tz where id = p_branch_id and timezone is distinct from v_tz;
  insert into public.branch_locations (branch_id, latitude, longitude, address, location_label, updated_by)
  values (p_branch_id, p_latitude, p_longitude, nullif(trim(p_address), ''), nullif(trim(p_location_label), ''), auth.uid())
  on conflict (branch_id) do update
    set latitude = excluded.latitude, longitude = excluded.longitude, address = excluded.address,
        location_label = excluded.location_label, updated_at = now(), updated_by = excluded.updated_by;

  perform public.write_audit_log('branch_location_update', 'branches', p_branch_id::text,
    jsonb_build_object('latitude', v_old_loc.latitude, 'longitude', v_old_loc.longitude, 'timezone', v_old.timezone, 'address', v_old_loc.address, 'location_label', v_old_loc.location_label),
    jsonb_build_object('latitude', p_latitude, 'longitude', p_longitude, 'timezone', v_tz, 'address', nullif(trim(p_address), ''), 'location_label', nullif(trim(p_location_label), '')),
    trim(p_reason));
end;
$$;
comment on function public.update_branch_location(uuid, numeric, numeric, text, text, text, text) is
  'Sets a branch''s coordinates (both or neither, validated ranges), IANA time zone, address and label. branch.manage only; mandatory reason; audited. No geocoding, no weather lookup.';
revoke all on function public.update_branch_location(uuid, numeric, numeric, text, text, text, text) from public, anon;
grant execute on function public.update_branch_location(uuid, numeric, numeric, text, text, text, text) to authenticated;

-- management read of the full location, branch-scoped; branches without a row are listed with NULL coordinates
create or replace function public.list_branch_locations()
returns table (id uuid, key text, name text, is_active boolean, latitude numeric, longitude numeric,
               timezone text, address text, location_label text, has_coordinates boolean)
language sql
stable
security definer
set search_path = public
as $$
  select b.id, b.key, b.name, b.is_active, l.latitude, l.longitude, b.timezone, l.address, l.location_label,
         (l.latitude is not null and l.longitude is not null)
  from public.branches b
  left join public.branch_locations l on l.branch_id = b.id
  where public.current_user_can_inventory('branch.location.read', b.id)
  order by b.name;
$$;
comment on function public.list_branch_locations() is
  'Management read of branch location fields. branch.location.read: owner/manager see all branches, branch_manager only their own; other roles get no rows.';
revoke all on function public.list_branch_locations() from public, anon;
grant execute on function public.list_branch_locations() to authenticated;
