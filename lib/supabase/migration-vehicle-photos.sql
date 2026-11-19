-- GarageFlo: vehicle-photos storage bucket and RLS policies
-- Apply ONCE in the Supabase SQL editor after the base migrations.sql has been run.
--
-- Idempotency: the bucket INSERT is idempotent (ON CONFLICT DO NOTHING).
-- The CREATE POLICY statements are NOT idempotent — re-running this file will
-- error with "policy already exists". Run it only once per environment.
--
-- Storage path format: {user_id}/{vehicle_id}/hero.jpg
--   [1] user_id   — first segment of storage.foldername()
--   [2] vehicle_id — second segment of storage.foldername()
--   filename      — storage.filename() = 'hero.jpg'
-- -------------------------------------------------------------------------

-- Create a private bucket. public = false means direct object URLs are
-- blocked; all reads go through signed URLs generated server-side.
insert into storage.buckets (id, name, public)
values ('vehicle-photos', 'vehicle-photos', false)
on conflict (id) do nothing;

-- ── INSERT ────────────────────────────────────────────────────────────────
-- WITH CHECK only (no existing row to filter for inserts).
-- Three conditions must all hold:
--   1. First path segment equals the caller's user ID.
--   2. Filename is exactly 'hero.jpg' (enforces the expected path structure).
--   3. Second path segment is a vehicle ID that exists in public.vehicles
--      and belongs to the caller — prevents writing to arbitrary UUIDs.
create policy "Users can upload own vehicle photos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and storage.filename(name) = 'hero.jpg'
    and exists (
      select 1 from public.vehicles
       where id::text    = (storage.foldername(name))[2]
         and user_id     = auth.uid()
    )
  );

-- ── SELECT ────────────────────────────────────────────────────────────────
-- USING only (filters which existing rows are visible to the caller).
-- Same three conditions as INSERT — user ID prefix, hero.jpg filename, and
-- vehicle ownership. Required for the client SDK to call createSignedUrl().
create policy "Users can read own vehicle photos"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and storage.filename(name) = 'hero.jpg'
    and exists (
      select 1 from public.vehicles
       where id::text    = (storage.foldername(name))[2]
         and user_id     = auth.uid()
    )
  );

-- ── UPDATE ────────────────────────────────────────────────────────────────
-- USING filters which existing objects are eligible for update.
-- WITH CHECK validates that the resulting object state also satisfies
-- ownership (guards against path-change attempts, even though Supabase
-- Storage upsert does not change the object path).
create policy "Users can update own vehicle photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and storage.filename(name) = 'hero.jpg'
    and exists (
      select 1 from public.vehicles
       where id::text    = (storage.foldername(name))[2]
         and user_id     = auth.uid()
    )
  )
  with check (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and storage.filename(name) = 'hero.jpg'
    and exists (
      select 1 from public.vehicles
       where id::text    = (storage.foldername(name))[2]
         and user_id     = auth.uid()
    )
  );

-- ── DELETE ────────────────────────────────────────────────────────────────
-- USING only (filters which existing objects can be deleted).
-- The vehicle-ownership EXISTS check is relaxed with an OR branch so that
-- orphaned storage objects can still be removed after the vehicle row is
-- deleted. The user-prefix check [1] = auth.uid() is strict in both branches.
--
-- Branch A (normal): vehicle exists in public.vehicles and belongs to caller.
--   This is the path taken by both VehiclePhotoEditor (Remove Photo) and
--   DeleteVehicleButton's pre-delete storage cleanup, while the row still
--   exists.
--
-- Branch B (cleanup): vehicle no longer exists in public.vehicles at all.
--   Allows removal of orphaned storage objects after a vehicle is deleted.
--   User-prefix still enforced — a user can only clean up objects under their
--   own {user_id}/ prefix. A user cannot delete objects under another user's
--   prefix even if neither has a matching vehicle row.
create policy "Users can delete own vehicle photos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'vehicle-photos'
    and auth.uid()::text = (storage.foldername(name))[1]
    and storage.filename(name) = 'hero.jpg'
    and (
      -- Branch A: vehicle exists and belongs to this user (normal delete)
      exists (
        select 1 from public.vehicles
         where id::text  = (storage.foldername(name))[2]
           and user_id   = auth.uid()
      )
      -- Branch B: vehicle was already deleted; permit orphan cleanup
      or not exists (
        select 1 from public.vehicles
         where id::text  = (storage.foldername(name))[2]
      )
    )
  );

-- ── ORPHAN NOTE ───────────────────────────────────────────────────────────
-- Storage objects are NOT automatically deleted when vehicle rows are deleted
-- (there is no DB-level cascade for storage). Application code in
-- DeleteVehicleButton attempts storage cleanup before deleting the vehicle
-- row (while the vehicle still exists, Branch A above passes). If that
-- cleanup fails, the orphaned object becomes eligible for Branch B cleanup.
--
-- A similar gap exists for the attachments bucket (documented in migrations.sql).
-- A future /api/account/delete route must clean both buckets on account deletion.
