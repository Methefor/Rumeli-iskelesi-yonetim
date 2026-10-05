-- =============================================================================
-- Final production-readiness hardening
--   1. internal_rotate_owner_pin  - break-glass owner PIN rotation (service_role only)
--   2. internal_run_legacy_sales_import - ONE import-level audit event per live import
--   3. override_reconciliation - historical imported findings are evidence
-- Nothing here changes admin_reset_pin, roles, memberships or any stored status.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Owner PIN rotation
-- -----------------------------------------------------------------------------
-- admin_reset_pin deliberately cannot modify an owner and bootstrap closes once an
-- owner exists, so rotating the owner PIN needs its own narrow door. It is NOT
-- client-callable (service_role only), updates ONLY the PIN credential of an
-- existing, ACTIVE, not-banned owner and never creates an owner, changes a role or
-- membership, activates anyone, or touches the Auth email/password.
--
-- Audit semantics (service_role has no auth.uid(), so none is pretended):
--   actor_user_id = NULL            -> no authenticated human session performed this
--   entity_type/id = profiles/<uuid of the target owner>   (the SUBJECT)
--   new_values.executed_via = 'service_role' (break-glass), executor_label = the
--   operator's free-text label (UNVERIFIED, recorded as typed), employee_code.
--   reason = mandatory. The PIN and its hash are never recorded.
create or replace function public.internal_rotate_owner_pin(
  p_employee_code text,
  p_pin text,
  p_reason text,
  p_executor_label text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_employee_code, '')));
  v_id uuid;
  v_active boolean;
  v_banned timestamptz;
begin
  if v_code !~ '^[A-Z][0-9]{2,4}$' or p_pin !~ '^[0-9]{4,6}$'
     or p_reason is null or length(trim(p_reason)) < 5 then
    raise exception 'invalid rotation data' using errcode = '22023';
  end if;
  select p.id, p.is_active, u.banned_until into v_id, v_active, v_banned
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.employee_code = v_code;
  if v_id is null
     or not exists (select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
                    where ur.user_id = v_id and r.key = 'owner') then
    raise exception 'target is not an owner' using errcode = '42501';
  end if;
  if not v_active or (v_banned is not null and v_banned > now()) then
    raise exception 'target owner is inactive or banned' using errcode = '42501';
  end if;
  if not exists (select 1 from public.pin_credentials where user_id = v_id) then
    raise exception 'target owner has no PIN credential (rotation never creates one)' using errcode = '22023';
  end if;

  update public.pin_credentials
     set pin_hash = extensions.crypt(p_pin, extensions.gen_salt('bf')),
         failed_attempts = 0,
         locked_until = null,
         last_attempt_at = null,
         updated_at = now()
   where user_id = v_id;

  insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, reason)
  values (
    null, 'owner_pin_rotated', 'profiles', v_id::text, null,
    jsonb_build_object(
      'employee_code', v_code,
      'executed_via', 'service_role',
      'executor_label', left(coalesce(p_executor_label, 'unspecified'), 60),
      'executor_verified', false
    ),
    trim(p_reason)
  );
end;
$$;

revoke all on function public.internal_rotate_owner_pin(text, text, text, text) from public, anon, authenticated;
grant execute on function public.internal_rotate_owner_pin(text, text, text, text) to service_role;
comment on function public.internal_rotate_owner_pin(text, text, text, text) is
  'Break-glass, service-role-only PIN rotation for an existing ACTIVE owner. Changes only the PIN credential, resets lockout, writes one owner_pin_rotated audit row with actor NULL (executor label is unverified metadata). Never records the PIN or hash.';

-- -----------------------------------------------------------------------------
-- 2. Import-level audit event (same transaction as reports + lineage + run record)
-- -----------------------------------------------------------------------------
create or replace function public.internal_run_legacy_sales_import(
  p_actor_code text,
  p_rows jsonb,
  p_cashier_map jsonb,
  p_source_fingerprint text,
  p_reason text,
  p_commit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid;
  v_result jsonb;
  v_detail text;
  v_started timestamptz := clock_timestamp();
  v_run uuid;
  v_links integer;
  v_digest text;
begin
  select id into v_actor from public.profiles
    where employee_code = upper(trim(p_actor_code)) and is_active;
  if v_actor is null or public.user_rank(v_actor) < 4 then
    raise exception 'an active owner actor is required' using errcode = '42501';
  end if;
  if exists (select 1 from public.legacy_sales_import_runs where source_fingerprint = p_source_fingerprint) then
    -- repeat / no-op: no second success event is fabricated
    return jsonb_build_object('applied', false, 'alreadyImported', true, 'sourceFingerprint', p_source_fingerprint);
  end if;
  begin
    v_result := public.internal_apply_legacy_sales(v_actor, p_rows, p_cashier_map, p_source_fingerprint, p_reason);
    if p_commit then
      insert into public.legacy_sales_import_runs (source_fingerprint, source_row_count, result, imported_by, reason)
      values (p_source_fingerprint, jsonb_array_length(p_rows), v_result, v_actor, p_reason)
      returning id into v_run;
      select count(*) into v_links from public.legacy_sales_report_links;
      -- non-secret digest of WHICH profile codes were mapped (never the legacy ids)
      select md5(coalesce(string_agg(p.employee_code, ',' order by p.employee_code), ''))
        into v_digest
      from public.legacy_cashier_profile_map m join public.profiles p on p.id = m.profile_id;
      -- ONE audit event for the whole import, in this same transaction (commit or roll back together).
      -- actor_user_id = the owner named for this run; the service role executed it (no auth.uid()).
      insert into public.audit_logs (actor_user_id, action, entity_type, entity_id, old_values, new_values, reason)
      values (
        v_actor, 'legacy_sales_import_applied', 'legacy_sales_import_runs', v_run::text, null,
        jsonb_build_object(
          'sourceFingerprint', p_source_fingerprint,
          'sourceRows', jsonb_array_length(p_rows),
          'createdReports', v_result -> 'createdReports',
          'unchangedReports', v_result -> 'unchangedReports',
          'branchReports', jsonb_build_object(
            'rumeli_iskelesi', v_result -> 'rumeliReports',
            'iskele_dondurma', v_result -> 'dondurmaReports',
            'balik_ekmek', v_result -> 'balikReports'),
          'lineageLinks', v_links,
          'importRunId', v_run,
          'mappedProfiles', (select count(*) from public.legacy_cashier_profile_map),
          'mappingCodesDigest', v_digest,
          'startedAt', v_started,
          'completedAt', clock_timestamp(),
          'executedVia', 'service_role',
          'actorSemantics', 'owner named for this run; executed by the service role, not an authenticated session'
        ),
        p_reason
      );
      return jsonb_build_object('applied', true, 'alreadyImported', false, 'result', v_result);
    end if;
    raise exception 'legacy_import_rollback' using errcode = 'LI001',
      detail = jsonb_build_object('applied', false, 'alreadyImported', false, 'result', v_result)::text;
  exception when sqlstate 'LI001' then
    get stacked diagnostics v_detail = pg_exception_detail;
    return v_detail::jsonb;
  end;
end;
$$;

revoke all on function public.internal_run_legacy_sales_import(text, jsonb, jsonb, text, text, boolean) from public, anon, authenticated;
grant execute on function public.internal_run_legacy_sales_import(text, jsonb, jsonb, text, text, boolean) to service_role;

-- -----------------------------------------------------------------------------
-- 3. Historical imported findings are evidence, not operational work
-- -----------------------------------------------------------------------------
-- override_reconciliation refuses a report that has legacy import lineage. The
-- check runs AFTER authorization (an unauthorized caller still gets 42501) and
-- BEFORE any write, so a refused call creates no override row and no audit row.
-- Status, lineage and read/filter access are untouched. A future annotation of
-- historical findings must be a separate mechanism.
create or replace function public.override_reconciliation(
  p_report_id uuid,
  p_new_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report record;
begin
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to override a reconciliation status' using errcode = '22023';
  end if;
  if p_new_status not in ('OK', 'WARNING', 'ERROR') then
    raise exception 'invalid status %', p_new_status using errcode = '22023';
  end if;

  select * into v_report from public.sales_reports where id = p_report_id;
  if not found then
    raise exception 'sales report % not found', p_report_id using errcode = '22023';
  end if;

  if not (
    public.current_user_is_owner_or_manager()
    or (public.current_user_has_permission('sales.edit_all') and v_report.branch_id in (select public.current_user_branch_ids()))
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if exists (select 1 from public.legacy_sales_report_links l where l.sales_report_id = p_report_id) then
    raise exception 'historical imported reconciliation findings are evidence and cannot be overridden' using errcode = '22023';
  end if;

  insert into public.sales_report_overrides (sales_report_id, previous_status, new_status, reason, overridden_by)
  values (p_report_id, v_report.reconciliation_status, p_new_status, p_reason, auth.uid());

  update public.sales_reports set reconciliation_status = p_new_status where id = p_report_id;

  perform public.write_audit_log(
    'reconciliation_override', 'sales_reports', p_report_id::text,
    jsonb_build_object('reconciliation_status', v_report.reconciliation_status),
    jsonb_build_object('reconciliation_status', p_new_status),
    p_reason
  );
end;
$$;

revoke all on function public.override_reconciliation(uuid, text, text) from public, anon;
grant execute on function public.override_reconciliation(uuid, text, text) to authenticated;
