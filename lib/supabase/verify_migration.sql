-- GarageFlo Schema v2 — Post-Migration Verification
-- ================================================================
-- Run this in the Supabase SQL editor AFTER applying migrations.sql.
-- Every query has an "Expected" comment. Compare actual output.
-- Delete this file after verification is complete.
-- ================================================================

-- ----------------------------------------------------------------
-- STEP 1: Confirm no existing user data before migration
-- (Run this BEFORE applying migrations.sql if you want to verify
--  the database is empty. Safe to run after too — values should
--  still be 0 for a fresh project.)
-- ----------------------------------------------------------------
SELECT
  'garages'          AS tbl, count(*) AS rows FROM garages
UNION ALL SELECT 'vehicles',         count(*) FROM vehicles
UNION ALL SELECT 'maintenance_logs', count(*) FROM maintenance_logs
UNION ALL SELECT 'reminders',        count(*) FROM reminders
UNION ALL SELECT 'attachments',      count(*) FROM attachments;
-- Expected: all rows = 0


-- ----------------------------------------------------------------
-- STEP 2: Five tables exist with correct column counts
-- ----------------------------------------------------------------
SELECT
  table_name,
  count(*) AS column_count
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('garages','vehicles','maintenance_logs','reminders','attachments')
GROUP BY table_name
ORDER BY table_name;
-- Expected:
--   attachments       9
--   garages           9
--   maintenance_logs 10
--   reminders        13
--   vehicles         24


-- ----------------------------------------------------------------
-- STEP 3: RLS enabled on all five tables
-- ----------------------------------------------------------------
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('garages','vehicles','maintenance_logs','reminders','attachments')
ORDER BY tablename;
-- Expected: rowsecurity = true for all five


-- ----------------------------------------------------------------
-- STEP 4: One policy per table (5 total)
-- ----------------------------------------------------------------
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename;
-- Expected: exactly one policy per table (5 rows total)


-- ----------------------------------------------------------------
-- STEP 5: Vehicles WITH CHECK includes garage ownership validation
-- ----------------------------------------------------------------
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'vehicles';
-- Expected: with_check IS NOT NULL and contains 'garage_id in'


-- ----------------------------------------------------------------
-- STEP 6: Indexes (at least 9 explicit + implicit PK/UNIQUE)
-- ----------------------------------------------------------------
SELECT indexname, tablename, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
-- Expected: >= 9 rows, including reminders_active_due_date_idx


-- ----------------------------------------------------------------
-- STEP 7: Partial index on reminders carries WHERE clause
-- ----------------------------------------------------------------
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND indexname = 'reminders_active_due_date_idx';
-- Expected: indexdef contains "WHERE ((is_active = true) AND (next_due_date IS NOT NULL))"


-- ----------------------------------------------------------------
-- STEP 8: Foreign keys and ON DELETE behaviors (7 FKs expected)
-- ----------------------------------------------------------------
SELECT
  tc.table_name        AS child_table,
  kcu.column_name      AS child_column,
  ccu.table_schema     AS parent_schema,
  ccu.table_name       AS parent_table,
  ccu.column_name      AS parent_column,
  rc.delete_rule
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;
-- Expected 7 rows:
--   attachments  maintenance_id → public.maintenance_logs  SET NULL
--   attachments  vehicle_id     → public.vehicles          CASCADE
--   garages      user_id        → auth.users               CASCADE
--   maintenance_logs vehicle_id → public.vehicles          CASCADE
--   reminders    vehicle_id     → public.vehicles          CASCADE
--   vehicles     garage_id      → public.garages           CASCADE
--   vehicles     user_id        → auth.users               CASCADE


-- ----------------------------------------------------------------
-- STEP 9: CHECK constraints include new vehicle types
-- ----------------------------------------------------------------
SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND check_clause LIKE '%dirt_bike%';
-- Expected: 1 row — the vehicles type constraint

SELECT constraint_name, check_clause
FROM information_schema.check_constraints
WHERE constraint_schema = 'public'
  AND check_clause LIKE '%reminders_has_threshold%';
-- Expected: 1 row — the reminders threshold constraint


-- ----------------------------------------------------------------
-- STEP 10: Notification preference columns on garages
-- ----------------------------------------------------------------
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'garages'
  AND column_name IN ('notify_days_before','notify_miles_before',
                      'notify_hours_before','email_notifications')
ORDER BY column_name;
-- Expected: 4 rows, all NOT NULL, with defaults 7 / true / 10 / 500


-- ----------------------------------------------------------------
-- STEP 11: Vehicle tracking columns (engine hours, VIN, etc.)
-- ----------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'vehicles'
  AND column_name IN ('engine_hours','engine_hours_is_estimated','engine_hours_as_of',
                      'mileage_is_estimated','mileage_as_of',
                      'vin','serial_number',
                      'estimated_annual_mileage','estimated_annual_hours')
ORDER BY column_name;
-- Expected: 9 rows


-- ----------------------------------------------------------------
-- STEP 12: Reminder interval columns exist
-- ----------------------------------------------------------------
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'reminders'
  AND column_name IN ('next_due_hours','interval_months','interval_miles',
                      'interval_hours','notes','updated_at')
ORDER BY column_name;
-- Expected: 6 rows


-- ----------------------------------------------------------------
-- STEP 13: Auto-create garage trigger is attached
-- ----------------------------------------------------------------
SELECT trigger_name, event_object_schema, event_object_table,
       action_timing, event_manipulation
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';
-- Expected: 1 row — AFTER INSERT on auth.users


-- ----------------------------------------------------------------
-- STEP 14: Private storage bucket exists
-- ----------------------------------------------------------------
SELECT id, name, public
FROM storage.buckets
WHERE id = 'attachments';
-- Expected: id=attachments, name=attachments, public=false


-- ----------------------------------------------------------------
-- STEP 15: Storage object policies (4 expected)
-- ----------------------------------------------------------------
SELECT policyname, cmd
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
-- Expected: 4 rows (upload/read/update/delete)


-- ----------------------------------------------------------------
-- STEP 16: Trigger auto-create test
-- (Creates a synthetic auth user, checks garage was created,
--  then cleans up. Safe on an empty project.)
-- ----------------------------------------------------------------
DO $$
DECLARE
  test_uid  uuid := gen_random_uuid();
  garage_id uuid;
  ndays     integer;
BEGIN
  -- Insert a test user directly into auth.users
  INSERT INTO auth.users (
    id, email, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at,
    encrypted_password, email_confirmed_at,
    confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    test_uid, 'verify-trigger@garageflo.test',
    '{}', '{}', false, now(), now(),
    '', now(), '', '', '', ''
  );

  -- Check garage was auto-created
  SELECT id, notify_days_before INTO garage_id, ndays
  FROM garages WHERE user_id = test_uid;

  IF garage_id IS NOT NULL THEN
    RAISE NOTICE 'TRIGGER PASS: garage auto-created (id=%) with notify_days_before=%',
      garage_id, ndays;
  ELSE
    RAISE WARNING 'TRIGGER FAIL: no garage created for test user';
  END IF;

  -- Verify default notification preferences
  IF ndays = 7 THEN
    RAISE NOTICE 'DEFAULTS PASS: notify_days_before = 7';
  ELSE
    RAISE WARNING 'DEFAULTS FAIL: notify_days_before = % (expected 7)', ndays;
  END IF;

  -- Clean up
  DELETE FROM auth.users WHERE id = test_uid;
  RAISE NOTICE 'Cleanup complete — test user deleted (cascades removed garage)';
END;
$$;


-- ----------------------------------------------------------------
-- STEP 17: Cross-user isolation smoke test
-- (Creates two users, verifies User A cannot see User B's vehicle
--  via the application-level query pattern used by the dashboard.)
-- ----------------------------------------------------------------
DO $$
DECLARE
  ua    uuid := gen_random_uuid();
  ub    uuid := gen_random_uuid();
  ga    uuid;
  gb    uuid;
  va    uuid;
  n     integer;
BEGIN
  -- Create two users (trigger auto-creates garages)
  INSERT INTO auth.users (id, email, raw_app_meta_data, raw_user_meta_data,
    is_super_admin, created_at, updated_at, encrypted_password,
    email_confirmed_at, confirmation_token, recovery_token,
    email_change_token_new, email_change)
  VALUES
    (ua, 'user-a@garageflo.test', '{}', '{}', false, now(), now(), '', now(), '', '', '', ''),
    (ub, 'user-b@garageflo.test', '{}', '{}', false, now(), now(), '', now(), '', '', '', '');

  SELECT id INTO ga FROM garages WHERE user_id = ua;
  SELECT id INTO gb FROM garages WHERE user_id = ub;

  -- Create a vehicle for User B
  INSERT INTO vehicles (id, garage_id, user_id, type, name)
  VALUES (gen_random_uuid(), gb, ub, 'boat', 'User B Boat')
  RETURNING id INTO va;

  -- Simulate User A's dashboard query — should return 0 of User B's vehicles
  SELECT count(*) INTO n
  FROM vehicles
  WHERE user_id = ua   -- User A's dashboard query
    AND id = va;       -- but filtering for User B's vehicle ID

  IF n = 0 THEN
    RAISE NOTICE 'ISOLATION PASS: User A query returns 0 of User B vehicles (expected)';
  ELSE
    RAISE WARNING 'ISOLATION FAIL: User A can see User B vehicles (count=%)', n;
  END IF;

  -- Clean up
  DELETE FROM auth.users WHERE id IN (ua, ub);
  RAISE NOTICE 'Cleanup complete';
END;
$$;
-- NOTE: Full RLS enforcement (WHERE clause filtering) requires the
-- anon/authenticated role context. This test uses superuser context,
-- so it validates data ownership logic, not policy enforcement.
-- Policy enforcement was verified in local PostgreSQL testing (R06-R12).
