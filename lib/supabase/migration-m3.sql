-- GarageFlo Migration: Milestone 3 — Odometer Sync & Smart Reminders
-- ================================================================
-- All changes are additive. Existing rows are unaffected.
-- Uses IF NOT EXISTS / CREATE OR REPLACE — safe to re-run.
--
-- DEPLOYMENT ORDER (must run in this order before deploying new code):
--   1. Run this file in the Supabase SQL editor (dashboard > SQL editor)
--   2. Confirm log_service appears under Database → Functions
--   3. Deploy the Next.js app
--
-- POST-DEPLOY VERIFICATION:
--   1. Log a service with a mileage reading → confirm vehicles.mileage updates
--   2. Log the same service again (same form submit) → confirm no duplicate
--   3. Log a service with an interval → confirm reminder created/advanced
--   4. Check Supabase Logs for any unexpected RPC errors
--
-- ROLLBACK (non-destructive — columns are all nullable, old code ignores them):
--   Step 1: Redeploy the previous app version. The new nullable columns
--           do not interfere with direct-insert code paths.
--   Step 2 (optional): Revoke RPC access to prevent new submissions:
--     REVOKE EXECUTE ON FUNCTION log_service(uuid, text, date, integer, numeric, text, uuid, integer, integer, uuid) FROM authenticated;
--   Step 3 (only if a full clean re-run is needed AND no production data
--           exists in the new columns — verify before running):
--     DROP FUNCTION IF EXISTS log_service(uuid, text, date, integer, numeric, text, uuid, integer, integer, uuid);
--     ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS idempotency_key;
--     ALTER TABLE maintenance_logs DROP COLUMN IF EXISTS reminder_id;
--     ALTER TABLE reminders       DROP COLUMN IF EXISTS notify_miles_before;
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Per-reminder early-warning threshold
--    null → getReminderStatus falls back to 500-mile default
-- ----------------------------------------------------------------
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS notify_miles_before integer
    CHECK (notify_miles_before >= 0);

-- ----------------------------------------------------------------
-- 2. Idempotency key on maintenance logs
--    Full UNIQUE constraint allows multiple NULLs (old rows) while
--    enforcing uniqueness for non-null UUIDs from new submissions.
--    ON CONFLICT (idempotency_key) DO NOTHING resolves against
--    this constraint without requiring a partial index predicate.
-- ----------------------------------------------------------------
ALTER TABLE maintenance_logs
  ADD COLUMN IF NOT EXISTS idempotency_key uuid UNIQUE;

-- ----------------------------------------------------------------
-- 3. Explicit reminder association
--    null → this log was not associated with a reminder
--    ON DELETE SET NULL → reminder deletion does not orphan the log
-- ----------------------------------------------------------------
ALTER TABLE maintenance_logs
  ADD COLUMN IF NOT EXISTS reminder_id uuid
    REFERENCES reminders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS maintenance_logs_reminder_id_idx
  ON maintenance_logs (reminder_id)
  WHERE reminder_id IS NOT NULL;

-- ================================================================
-- RPC: log_service
-- Atomic: maintenance log INSERT + odometer sync + reminder
--         advance-or-create, all in one transaction.
--
-- SECURITY INVOKER: runs with the calling user's RLS context.
-- auth.uid() available via Supabase PostgREST JWT session settings.
-- ================================================================

CREATE OR REPLACE FUNCTION log_service(
  p_vehicle_id          uuid,
  p_service_type        text,
  p_performed_at        date,
  p_mileage_at_service  integer,       -- null = no odometer reading
  p_cost                numeric,       -- null = no cost recorded
  p_notes               text,          -- null = no notes
  p_reminder_id         uuid,          -- null = create new; non-null = advance existing
  p_interval_miles      integer,       -- null = no reminder action
  p_notify_miles_before integer,       -- null = use client default (500)
  p_idempotency_key     uuid           -- required; never null for new submissions
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_log_id              uuid;
  v_reminder_id         uuid;
  v_current_mileage     integer;
  v_current_as_of       date;
  v_current_estimated   boolean;
  v_next_due_mileage    integer;
  v_existing_due        integer;
BEGIN

  -- ── Required parameter validation ────────────────────────────
  IF p_vehicle_id IS NULL THEN
    RAISE EXCEPTION 'vehicle_id_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_service_type IS NULL OR trim(p_service_type) = '' THEN
    RAISE EXCEPTION 'service_type_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_performed_at IS NULL THEN
    RAISE EXCEPTION 'performed_at_required' USING ERRCODE = 'P0001';
  END IF;
  IF p_idempotency_key IS NULL THEN
    RAISE EXCEPTION 'idempotency_key_required' USING ERRCODE = 'P0001';
  END IF;

  -- ── Value range validation ────────────────────────────────────
  IF p_mileage_at_service IS NOT NULL AND p_mileage_at_service < 0 THEN
    RAISE EXCEPTION 'invalid_mileage' USING ERRCODE = 'P0001';
  END IF;
  IF p_cost IS NOT NULL AND p_cost < 0 THEN
    RAISE EXCEPTION 'invalid_cost' USING ERRCODE = 'P0001';
  END IF;
  IF p_interval_miles IS NOT NULL AND p_interval_miles <= 0 THEN
    RAISE EXCEPTION 'invalid_interval' USING ERRCODE = 'P0001';
  END IF;
  IF p_notify_miles_before IS NOT NULL AND p_notify_miles_before < 0 THEN
    RAISE EXCEPTION 'invalid_notify_threshold' USING ERRCODE = 'P0001';
  END IF;

  -- ── Ownership check ───────────────────────────────────────────
  -- RLS would also block unauthorized DML, but an explicit check
  -- gives a named error rather than an opaque policy violation.
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'P0001';
  END IF;

  -- ── Idempotency ───────────────────────────────────────────────
  -- UNIQUE constraint on idempotency_key (nullable, allows multiple NULLs).
  -- ON CONFLICT resolves against the constraint without a partial predicate.
  INSERT INTO public.maintenance_logs (
    vehicle_id, service_type, performed_at,
    mileage_at_service, cost, notes,
    idempotency_key
  ) VALUES (
    p_vehicle_id, p_service_type, p_performed_at,
    p_mileage_at_service, p_cost, p_notes,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_log_id;

  -- Retry path: conflict fired → fetch the existing log.
  -- RLS ensures only the user's own logs are visible, so a UUID
  -- consumed by another user's record returns NULL here.
  IF v_log_id IS NULL THEN
    SELECT id INTO v_log_id
    FROM public.maintenance_logs
    WHERE idempotency_key = p_idempotency_key;

    -- NULL after RLS filter = UUID consumed by another user (UUID collision,
    -- astronomically unlikely with 128-bit keys). Fail rather than continue.
    IF v_log_id IS NULL THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = 'P0001';
    END IF;

    -- Retry confirmed: return without side effects.
    RETURN json_build_object(
      'log_id',      v_log_id,
      'reminder_id', null,
      'retry',       true
    );
  END IF;

  -- ── Vehicle row lock ──────────────────────────────────────────
  -- Serializes concurrent odometer updates and reminder creation
  -- checks for the same vehicle.
  SELECT mileage, mileage_as_of, mileage_is_estimated
  INTO   v_current_mileage, v_current_as_of, v_current_estimated
  FROM   public.vehicles
  WHERE  id = p_vehicle_id
  FOR UPDATE;

  -- ── Odometer sync ─────────────────────────────────────────────
  -- Future-dated logs are stored but do not advance the confirmed odometer.
  IF p_mileage_at_service IS NOT NULL
     AND p_performed_at <= CURRENT_DATE
  THEN

    IF v_current_mileage IS NULL THEN
      -- Branch 1: first reading ever — accept unconditionally.
      UPDATE public.vehicles SET
        mileage              = p_mileage_at_service,
        mileage_as_of        = p_performed_at,
        mileage_is_estimated = false,
        updated_at           = now()
      WHERE id = p_vehicle_id;

    ELSIF v_current_estimated THEN
      -- Branch 2: current is estimated.
      -- A newer confirmed reading replaces it at any value (up or down).
      IF v_current_as_of IS NULL OR p_performed_at >= v_current_as_of THEN
        UPDATE public.vehicles SET
          mileage              = p_mileage_at_service,
          mileage_as_of        = p_performed_at,
          mileage_is_estimated = false,
          updated_at           = now()
        WHERE id = p_vehicle_id;
      END IF;

    ELSE
      -- Branch 3: current is confirmed.
      -- Never decrease a confirmed reading via the service log path.
      -- Manual downward corrections use Edit Vehicle.
      IF p_mileage_at_service > v_current_mileage
         AND (v_current_as_of IS NULL OR p_performed_at >= v_current_as_of)
      THEN
        UPDATE public.vehicles SET
          mileage              = p_mileage_at_service,
          mileage_as_of        = p_performed_at,
          mileage_is_estimated = false,
          updated_at           = now()
        WHERE id = p_vehicle_id;
      END IF;
    END IF;

  END IF;

  -- ── Reminder: advance existing or create new ──────────────────
  -- Requires both an interval and a service mileage to calculate
  -- the next due point.
  IF p_interval_miles IS NOT NULL AND p_mileage_at_service IS NOT NULL THEN

    v_next_due_mileage := p_mileage_at_service + p_interval_miles;

    IF p_reminder_id IS NOT NULL THEN
      -- Path A: advance an explicitly identified reminder.
      -- Lock the specific row; verify it belongs to this vehicle and is active.
      SELECT id, next_due_mileage
      INTO   v_reminder_id, v_existing_due
      FROM   public.reminders
      WHERE  id         = p_reminder_id
        AND  vehicle_id = p_vehicle_id
        AND  is_active  = true
      FOR UPDATE;

      IF v_reminder_id IS NULL THEN
        RAISE EXCEPTION 'reminder_not_found' USING ERRCODE = 'P0001';
      END IF;

      -- Safety rail: never regress the schedule even with explicit intent.
      IF v_next_due_mileage < v_existing_due THEN
        RAISE EXCEPTION 'reminder_regression_blocked'
          USING ERRCODE = 'P0001',
                DETAIL  = 'computed=' || v_next_due_mileage
                          || ' current=' || v_existing_due;
      END IF;

      UPDATE public.reminders SET
        next_due_mileage    = v_next_due_mileage,
        interval_miles      = p_interval_miles,
        notify_miles_before = p_notify_miles_before,
        updated_at          = now()
      WHERE id = v_reminder_id;

    ELSE
      -- Path B: create a new reminder.
      -- Vehicle row is already locked, so this EXISTS check is serialized —
      -- a concurrent Path B for the same vehicle will block until this
      -- transaction commits, then see the new reminder and raise the conflict.
      IF EXISTS (
        SELECT 1 FROM public.reminders
        WHERE vehicle_id   = p_vehicle_id
          AND service_type = p_service_type
          AND is_active    = true
      ) THEN
        RAISE EXCEPTION 'conflicting_reminder_exists' USING ERRCODE = 'P0001';
      END IF;

      INSERT INTO public.reminders (
        vehicle_id, service_type,
        next_due_mileage, interval_miles,
        notify_miles_before, is_active
      ) VALUES (
        p_vehicle_id, p_service_type,
        v_next_due_mileage, p_interval_miles,
        p_notify_miles_before, true
      )
      RETURNING id INTO v_reminder_id;
    END IF;

    -- Associate the log with the reminder it created or advanced.
    IF v_reminder_id IS NOT NULL THEN
      UPDATE public.maintenance_logs
      SET reminder_id = v_reminder_id,
          updated_at  = now()
      WHERE id = v_log_id;
    END IF;

  END IF;

  RETURN json_build_object(
    'log_id',      v_log_id,
    'reminder_id', v_reminder_id,
    'retry',       false
  );

END;
$$;

REVOKE EXECUTE ON FUNCTION log_service FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION log_service TO authenticated;
