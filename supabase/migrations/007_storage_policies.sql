-- =============================================================================
-- 007_storage_policies.sql
-- =============================================================================
-- STATUS: NOT APPLIED. Prepared for review only — see MIGRATION_PLAN.md.
--
-- Purpose:
--   Secure avatar storage for V4, WITHOUT touching the legacy `avatars`
--   bucket the current production app writes to.
--
-- Why a NEW bucket (`avatars-v4`), not tightening the existing `avatars`
-- bucket in place:
--   The Phase A/C audit confirmed `avatars` is currently public with anon
--   SELECT and INSERT, and the legacy app depends on exactly that (anon
--   uploads via cashier-dashboard.html, no auth session to scope an
--   ownership check to). Changing its policies now would break legacy
--   uploads before cutover — explicitly prohibited by this phase's brief
--   ("legacy policies remain untouched initially... both systems may
--   coexist temporarily"). A separate bucket lets V4 have real security
--   from day one without any legacy risk; the old bucket's data is migrated
--   or left as historical read-only storage at cutover (Phase L).
--
-- Depends on: 001 (profiles), 002 (permissions).
--
-- Rollback:
--   drop policy avatars_v4_delete on storage.objects;
--   drop policy avatars_v4_update on storage.objects;
--   drop policy avatars_v4_insert on storage.objects;
--   drop policy avatars_v4_select on storage.objects;
--   delete from storage.buckets where id = 'avatars-v4';
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars-v4',
  'avatars-v4',
  true, -- read stays public: avatars are not sensitive; only writes are restricted
  2097152, -- 2 MiB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Path convention: `${auth.uid()}/avatar.<ext>` — the folder name IS the
-- owning user's id, so ownership is a straightforward path check.

create policy avatars_v4_select on storage.objects
  for select
  using (bucket_id = 'avatars-v4');

create policy avatars_v4_insert on storage.objects
  for insert
  with check (
    bucket_id = 'avatars-v4'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy avatars_v4_update on storage.objects
  for update
  using (
    bucket_id = 'avatars-v4'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage') -- manager override
    )
  )
  with check (
    bucket_id = 'avatars-v4'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  );

create policy avatars_v4_delete on storage.objects
  for delete
  using (
    bucket_id = 'avatars-v4'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.current_user_has_permission('employee.manage')
    )
  );

-- MIME type and size limit are enforced at the bucket level above
-- (allowed_mime_types, file_size_limit) — Supabase Storage rejects
-- non-matching uploads before they reach these RLS policies at all.
