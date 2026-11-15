-- GarageFlo Migration: Milestone 4 — Everything Tracking
-- ================================================================
-- All changes are additive. Existing rows, data, and v1 RPC unaffected.
-- Uses IF NOT EXISTS / CREATE OR REPLACE — safe to re-run.
--
-- DEPLOYMENT ORDER:
--   1. Run this file in the Supabase SQL editor
--   2. Confirm log_service_v2 appears under Database → Functions
--   3. Confirm tracking_method column is populated on all vehicles
--   4. Deploy the Next.js app (LogForm now calls log_service_v2)
--
-- POST-DEPLOY VERIFICATION:
--   1. Add a generator — confirm tracking method defaults to "Engine Hours"
--   2. Log a service with engine-hour reading → confirm vehicle hours update
--   3. Log the same form twice → confirm no duplicate (idempotency)
--   4. Add a date-only reminder for a trailer → confirm it shows correct status
--   5. Check Supabase Logs for any unexpected RPC errors
--
-- ROLLBACK (non-destructive):
--   Step 1: Redeploy previous app version (calls log_service v1; v2 coexists harmlessly).
--   Step 2 (optional): Revoke v2 access:
--     REVOKE EXECUTE ON FUNCTION log_service_v2(uuid,text,date,integer,numeric,text,uuid,integer,integer,uuid,numeric,numeric,numeric,integer) FROM authenticated;
--   Step 3 (clean re-run only — verify no production data first):
--     DROP FUNCTION IF EXISTS log_service_v2(uuid,text,date,integer,numeric,text,uuid,integer,integer,uuid,numeric,numeric,numeric,integer);
--     ALTER TABLE vehicles  DROP COLUMN IF EXISTS tracking_method;
--     ALTER TABLE reminders DROP COLUMN IF EXISTS notify_hours_before;
-- ================================================================

-- ----------------------------------------------------------------
-- 1. Equipment tracking method
--    mileage | hours | both | date
--    Default is 'mileage' for new rows; back-fill sets type-based values.
-- ----------------------------------------------------------------

-- Single atomic block: the IF NOT EXISTS guard makes this a true no-op on
-- re-run — the column addition and backfill either both happen or neither
-- does, with no cross-statement state sharing. EXECUTE is used for the UPDATE
-- so the query is planned after the column exists, not at parse time.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'vehicles'
      AND column_name  = 'tracking_method'
  ) THEN

    ALTER TABLE public.vehicles
      ADD COLUMN tracking_method text NOT NULL DEFAULT 'mileage'
        CHECK (tracking_method IN ('mileage', 'hours', 'both', 'date'));

    -- EXECUTE defers query planning until after the column exists above,
    -- ensuring the UPDATE sees the correct catalog state.
    EXECUTE $sql$
      UPDATE public.vehicles
      SET tracking_method = CASE
        WHEN type IN ('generator', 'riding_mower', 'push_mower')    THEN 'hours'
        WHEN type IN ('trailer', 'camp_trailer')                     THEN 'date'
        WHEN type IN ('boat', 'personal_watercraft', 'utv', 'atv',
                      'snowmobile', 'dirt_bike')                     THEN 'both'
        ELSE 'mileage'
      END
      WHERE type IN (
        'generator', 'riding_mower', 'push_mower',
        'trailer', 'camp_trailer',
        'boat', 'personal_watercraft', 'utv', 'atv', 'snowmobile', 'dirt_bike'
      )
    $sql$;

  END IF;
END;
$$;

-- ----------------------------------------------------------------
-- 2. Per-reminder early-warning threshold for engine hours
--    null → getReminderStatus falls back to 10-hour default
-- ----------------------------------------------------------------
ALTER TABLE reminders
  ADD COLUMN IF NOT EXISTS notify_hours_before numeric(6,1)
    CHECK (notify_hours_before >= 0);

-- ================================================================
-- RPC: log_service_v2
-- ================================================================
-- Extends log_service (v1) with:
--   • Engine-hour reading sync (same 3-branch safety rules as mileage)
--   • Hour-based reminder intervals (advance/create with next_due_hours)
--   • Calendar-based reminder intervals (advance/create with next_due_date)
--   • Combined thresholds: any mix of mileage, hours, and/or date per reminder
--
-- v1 (10-param) is preserved unchanged — not dropped, not replaced.
-- LogForm migrates to calling v2; v1 remains available for rollback.
--
-- SECURITY INVOKER: RLS applies to every DML statement.
-- auth.uid() read from PostgREST JWT session-local settings.
-- ================================================================

CREATE OR REPLACE FUNCTION log_service_v2(
  -- ── Shared with v1 ──────────────────────────────────────────
  p_vehicle_id          uuid,
  p_service_type        text,
  p_performed_at        date,
  p_mileage_at_service  integer,       -- null = no odometer reading
  p_cost                numeric,       -- null = no cost recorded
  p_notes               text,          -- null = no notes
  p_reminder_id         uuid,          -- null = create new; non-null = advance existing
  p_interval_miles      integer,       -- null = no mile-interval reminder
  p_notify_miles_before integer,       -- null = use client default (500)
  p_idempotency_key     uuid,          -- required; never null for new submissions
  -- ── New in v2 ───────────────────────────────────────────────
  p_hours_at_service    numeric,       -- null = no engine-hour reading
  p_interval_hours      numeric,       -- null = no hour-interval reminder
  p_notify_hours_before numeric,       -- null = use client default (10)
  p_interval_months     integer        -- null = no calendar-interval reminder
)
RETURNS json
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_log_id                uuid;
  v_reminder_id           uuid;
  -- Current vehicle readings (fetched under FOR UPDATE lock)
  v_cur_mileage           integer;
  v_cur_mileage_as_of     date;
  v_cur_mileage_est       boolean;
  v_cur_hours             numeric;
  v_cur_hours_as_of       date;
  v_cur_hours_est         boolean;
  -- Computed next-due thresholds
  v_next_due_mileage      integer;
  v_next_due_hours        numeric;
  v_next_due_date         date;
  -- Existing reminder thresholds (regression check)
  v_existing_due_mileage  integer;
  v_existing_due_hours    numeric;
  -- At least one interval must be set to enter the reminder section
  v_has_interval          boolean;
  -- Idempotency retry: compared against incoming params to detect key misuse
  v_retry_vehicle_id      uuid;
  v_retry_service_type    text;
  v_retry_performed_at    date;
  v_retry_mileage         integer;
  v_retry_hours           numeric;
  v_retry_cost            numeric;
  v_retry_notes           text;
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
  IF p_hours_at_service IS NOT NULL AND p_hours_at_service < 0 THEN
    RAISE EXCEPTION 'invalid_hours' USING ERRCODE = 'P0001';
  END IF;
  IF p_cost IS NOT NULL AND p_cost < 0 THEN
    RAISE EXCEPTION 'invalid_cost' USING ERRCODE = 'P0001';
  END IF;
  IF p_interval_miles IS NOT NULL AND p_interval_miles <= 0 THEN
    RAISE EXCEPTION 'invalid_interval' USING ERRCODE = 'P0001';
  END IF;
  IF p_interval_hours IS NOT NULL AND p_interval_hours <= 0 THEN
    RAISE EXCEPTION 'invalid_interval_hours' USING ERRCODE = 'P0001';
  END IF;
  IF p_interval_months IS NOT NULL AND p_interval_months <= 0 THEN
    RAISE EXCEPTION 'invalid_interval_months' USING ERRCODE = 'P0001';
  END IF;
  IF p_notify_miles_before IS NOT NULL AND p_notify_miles_before < 0 THEN
    RAISE EXCEPTION 'invalid_notify_threshold' USING ERRCODE = 'P0001';
  END IF;
  IF p_notify_hours_before IS NOT NULL AND p_notify_hours_before < 0 THEN
    RAISE EXCEPTION 'invalid_notify_hours_threshold' USING ERRCODE = 'P0001';
  END IF;

  -- ── Ownership check ───────────────────────────────────────────
  IF NOT EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id = p_vehicle_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_owner' USING ERRCODE = 'P0001';
  END IF;

  -- ── Idempotency ───────────────────────────────────────────────
  -- v2 also stores hours_at_service in the initial INSERT.
  INSERT INTO public.maintenance_logs (
    vehicle_id, service_type, performed_at,
    mileage_at_service, hours_at_service, cost, notes,
    idempotency_key
  ) VALUES (
    p_vehicle_id, p_service_type, p_performed_at,
    p_mileage_at_service, p_hours_at_service, p_cost, p_notes,
    p_idempotency_key
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_log_id;

  -- Retry path: conflict fired → fetch the existing log.
  -- RLS ensures only the caller's own logs are visible.
  IF v_log_id IS NULL THEN
    SELECT id, vehicle_id, service_type, performed_at,
           mileage_at_service, hours_at_service, cost, notes
    INTO   v_log_id, v_retry_vehicle_id, v_retry_service_type,
           v_retry_performed_at, v_retry_mileage,
           v_retry_hours, v_retry_cost, v_retry_notes
    FROM   public.maintenance_logs
    WHERE  idempotency_key = p_idempotency_key;

    IF v_log_id IS NULL THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = 'P0001';
    END IF;

    -- Reject if the existing log was written for a different operation.
    -- IS DISTINCT FROM handles NULLs correctly: two NULLs are considered equal.
    IF v_retry_vehicle_id   IS DISTINCT FROM p_vehicle_id         OR
       v_retry_service_type IS DISTINCT FROM p_service_type       OR
       v_retry_performed_at IS DISTINCT FROM p_performed_at       OR
       v_retry_mileage      IS DISTINCT FROM p_mileage_at_service OR
       v_retry_hours        IS DISTINCT FROM p_hours_at_service   OR
       v_retry_cost         IS DISTINCT FROM p_cost               OR
       v_retry_notes        IS DISTINCT FROM p_notes              THEN
      RAISE EXCEPTION 'idempotency_key_mismatch' USING ERRCODE = 'P0001';
    END IF;

    RETURN json_build_object(
      'log_id',      v_log_id,
      'reminder_id', null,
      'retry',       true
    );
  END IF;

  -- ── Vehicle row lock ──────────────────────────────────────────
  -- Serializes concurrent odometer/hours updates and reminder existence checks.
  SELECT mileage,        mileage_as_of,       mileage_is_estimated,
         engine_hours,   engine_hours_as_of,  engine_hours_is_estimated
  INTO   v_cur_mileage,  v_cur_mileage_as_of, v_cur_mileage_est,
         v_cur_hours,    v_cur_hours_as_of,   v_cur_hours_est
  FROM   public.vehicles
  WHERE  id = p_vehicle_id
  FOR UPDATE;

  -- ── Mileage sync ─────────────────────────────────────────────
  -- Future-dated logs are stored but do not advance the confirmed odometer.
  IF p_mileage_at_service IS NOT NULL
     AND p_performed_at <= CURRENT_DATE
  THEN
    IF v_cur_mileage IS NULL THEN
      -- Branch 1: first reading ever — accept unconditionally.
      UPDATE public.vehicles SET
        mileage              = p_mileage_at_service,
        mileage_as_of        = p_performed_at,
        mileage_is_estimated = false,
        updated_at           = now()
      WHERE id = p_vehicle_id;
    ELSIF v_cur_mileage_est THEN
      -- Branch 2: estimated current — newer confirmed replaces at any value.
      IF v_cur_mileage_as_of IS NULL OR p_performed_at >= v_cur_mileage_as_of THEN
        UPDATE public.vehicles SET
          mileage              = p_mileage_at_service,
          mileage_as_of        = p_performed_at,
          mileage_is_estimated = false,
          updated_at           = now()
        WHERE id = p_vehicle_id;
      END IF;
    ELSE
      -- Branch 3: confirmed current — only increase, only if more recent.
      IF p_mileage_at_service > v_cur_mileage
         AND (v_cur_mileage_as_of IS NULL OR p_performed_at >= v_cur_mileage_as_of)
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

  -- ── Engine-hour sync ─────────────────────────────────────────
  -- Identical 3-branch safety rules as mileage sync.
  IF p_hours_at_service IS NOT NULL
     AND p_performed_at <= CURRENT_DATE
  THEN
    IF v_cur_hours IS NULL THEN
      -- Branch 1: first hours reading ever.
      UPDATE public.vehicles SET
        engine_hours              = p_hours_at_service,
        engine_hours_as_of        = p_performed_at,
        engine_hours_is_estimated = false,
        updated_at                = now()
      WHERE id = p_vehicle_id;
    ELSIF v_cur_hours_est THEN
      -- Branch 2: estimated current — newer confirmed replaces at any value.
      IF v_cur_hours_as_of IS NULL OR p_performed_at >= v_cur_hours_as_of THEN
        UPDATE public.vehicles SET
          engine_hours              = p_hours_at_service,
          engine_hours_as_of        = p_performed_at,
          engine_hours_is_estimated = false,
          updated_at                = now()
        WHERE id = p_vehicle_id;
      END IF;
    ELSE
      -- Branch 3: confirmed current — only increase, only if more recent.
      IF p_hours_at_service > v_cur_hours
         AND (v_cur_hours_as_of IS NULL OR p_performed_at >= v_cur_hours_as_of)
      THEN
        UPDATE public.vehicles SET
          engine_hours              = p_hours_at_service,
          engine_hours_as_of        = p_performed_at,
          engine_hours_is_estimated = false,
          updated_at                = now()
        WHERE id = p_vehicle_id;
      END IF;
    END IF;
  END IF;

  -- ── Reminder: advance existing or create new ──────────────────
  v_has_interval :=
    (p_interval_miles  IS NOT NULL AND p_mileage_at_service IS NOT NULL) OR
    (p_interval_hours  IS NOT NULL AND p_hours_at_service   IS NOT NULL) OR
    (p_interval_months IS NOT NULL);

  IF v_has_interval THEN

    -- Compute new due thresholds for each provided interval.
    IF p_interval_miles IS NOT NULL AND p_mileage_at_service IS NOT NULL THEN
      v_next_due_mileage := p_mileage_at_service + p_interval_miles;
    END IF;
    IF p_interval_hours IS NOT NULL AND p_hours_at_service IS NOT NULL THEN
      v_next_due_hours := p_hours_at_service + p_interval_hours;
    END IF;
    -- PostgreSQL interval arithmetic handles end-of-month correctly
    -- (Jan 31 + 1 month = Feb 28/29, etc.).
    IF p_interval_months IS NOT NULL THEN
      v_next_due_date := p_performed_at + (p_interval_months * INTERVAL '1 month');
    END IF;

    IF p_reminder_id IS NOT NULL THEN
      -- ── Path A: advance an explicitly identified active reminder ──
      SELECT id, next_due_mileage, next_due_hours
      INTO   v_reminder_id, v_existing_due_mileage, v_existing_due_hours
      FROM   public.reminders
      WHERE  id           = p_reminder_id
        AND  vehicle_id   = p_vehicle_id
        AND  service_type = p_service_type
        AND  is_active    = true
      FOR UPDATE;

      IF v_reminder_id IS NULL THEN
        RAISE EXCEPTION 'reminder_not_found' USING ERRCODE = 'P0001';
      END IF;

      -- Mileage regression safety rail: never move the schedule backward.
      IF v_next_due_mileage IS NOT NULL AND v_existing_due_mileage IS NOT NULL THEN
        IF v_next_due_mileage < v_existing_due_mileage THEN
          RAISE EXCEPTION 'reminder_regression_blocked'
            USING ERRCODE = 'P0001',
                  DETAIL  = 'computed=' || v_next_due_mileage
                            || ' current=' || v_existing_due_mileage;
        END IF;
      END IF;

      -- Hours regression safety rail.
      IF v_next_due_hours IS NOT NULL AND v_existing_due_hours IS NOT NULL THEN
        IF v_next_due_hours < v_existing_due_hours THEN
          RAISE EXCEPTION 'reminder_regression_blocked_hours'
            USING ERRCODE = 'P0001',
                  DETAIL  = 'computed=' || v_next_due_hours
                            || ' current=' || v_existing_due_hours;
        END IF;
      END IF;

      -- Advance only the thresholds we have new data for (COALESCE preserves the rest).
      UPDATE public.reminders SET
        next_due_mileage    = COALESCE(v_next_due_mileage, next_due_mileage),
        next_due_hours      = COALESCE(v_next_due_hours,   next_due_hours),
        next_due_date       = COALESCE(v_next_due_date,    next_due_date),
        interval_miles      = COALESCE(p_interval_miles,   interval_miles),
        interval_hours      = COALESCE(p_interval_hours,   interval_hours),
        interval_months     = COALESCE(p_interval_months,  interval_months),
        notify_miles_before = COALESCE(p_notify_miles_before, notify_miles_before),
        notify_hours_before = COALESCE(p_notify_hours_before, notify_hours_before),
        updated_at          = now()
      WHERE id = v_reminder_id;

    ELSE
      -- ── Path B: create a new reminder ────────────────────────
      -- Vehicle row is already locked, so this EXISTS check is serialized.
      IF EXISTS (
        SELECT 1 FROM public.reminders
        WHERE vehicle_id   = p_vehicle_id
          AND service_type = p_service_type
          AND is_active    = true
      ) THEN
        RAISE EXCEPTION 'conflicting_reminder_exists' USING ERRCODE = 'P0001';
      END IF;

      -- At least one of v_next_due_mileage, v_next_due_hours, v_next_due_date is
      -- non-null (enforced by v_has_interval), satisfying reminders_has_threshold.
      INSERT INTO public.reminders (
        vehicle_id, service_type,
        next_due_mileage, next_due_hours, next_due_date,
        interval_miles, interval_hours, interval_months,
        notify_miles_before, notify_hours_before,
        is_active
      ) VALUES (
        p_vehicle_id, p_service_type,
        v_next_due_mileage, v_next_due_hours, v_next_due_date,
        p_interval_miles, p_interval_hours, p_interval_months,
        p_notify_miles_before, p_notify_hours_before,
        true
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

REVOKE EXECUTE ON FUNCTION log_service_v2(uuid,text,date,integer,numeric,text,uuid,integer,integer,uuid,numeric,numeric,numeric,integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION log_service_v2(uuid,text,date,integer,numeric,text,uuid,integer,integer,uuid,numeric,numeric,numeric,integer) FROM anon;
GRANT  EXECUTE ON FUNCTION log_service_v2(uuid,text,date,integer,numeric,text,uuid,integer,integer,uuid,numeric,numeric,numeric,integer) TO   authenticated;
