-- M5: Garage organization — sort_order column + atomic reorder RPC
-- Safe to re-run: IF NOT EXISTS guards and backfill only targets NULL rows.

-- 1. Add sort_order column ─────────────────────────────────────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS sort_order integer;

-- 2. Idempotent backfill ───────────────────────────────────────────────────────
-- Rules:
--   • Items that already have a sort_order are NEVER touched (preserves manual order).
--   • NULL items are assigned positions immediately AFTER the current section maximum,
--     so re-running can never produce a conflict with existing positions.
--   • On first run (all NULL): section max is 0, so positions start at 1.
--   • Within the NULL batch, ordering follows created_at DESC (preserves the visual
--     order users currently see on the dashboard).
--
-- Why a CTE rather than a plain subquery:
--   The old approach used ROW_NUMBER() inside a subquery filtered to WHERE sort_order IS NULL.
--   That window only sees the NULL rows, so ROW_NUMBER() always starts at 1 and conflicts
--   with existing positions on re-run. The CTE computes the per-section maximum across ALL
--   rows first, then uses it as an offset when numbering the NULL batch.

WITH section_max AS (
  -- Max existing sort_order per user+section across ALL rows (MAX ignores NULLs).
  SELECT
    user_id,
    CASE WHEN type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
      THEN 'vehicles' ELSE 'equipment' END AS section,
    COALESCE(MAX(sort_order), 0)           AS max_order
  FROM public.vehicles
  GROUP BY user_id, section
),
null_ranked AS (
  -- Number only the NULL-position items; offset by the section max so no conflicts.
  SELECT
    v.id,
    COALESCE(sm.max_order, 0) + ROW_NUMBER() OVER (
      PARTITION BY
        v.user_id,
        CASE WHEN v.type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
          THEN 'vehicles' ELSE 'equipment' END
      ORDER BY v.created_at DESC
    ) AS new_order
  FROM public.vehicles v
  LEFT JOIN section_max sm
    ON  sm.user_id = v.user_id
    AND sm.section = CASE WHEN v.type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
                       THEN 'vehicles' ELSE 'equipment' END
  WHERE v.sort_order IS NULL
)
UPDATE public.vehicles
SET sort_order = nr.new_order
FROM null_ranked nr
WHERE public.vehicles.id = nr.id;

-- 3. Index for dashboard query (ORDER BY sort_order ASC NULLS LAST) ───────────
CREATE INDEX IF NOT EXISTS vehicles_user_sort_idx
  ON public.vehicles (user_id, sort_order);

-- 4. Atomic section-aware reorder RPC ─────────────────────────────────────────
-- Security model:
--   • SECURITY INVOKER: runs as the calling user, fully subject to RLS.
--   • Ownership validated before any writes (guards 1–4 below).
--   • Row-level lock (guard 5) serialises concurrent saves for the same section,
--     preventing two simultaneous requests from producing inconsistent positions.
--   • GRANT/REVOKE limits execution to the authenticated role only.
--
-- Section classification exactly mirrors lib/garage-utils.ts VEHICLE_SECTION_MAP:
--   vehicles  → car, truck, suv, motorcycle, dirt_bike
--   equipment → everything else (utv, atv, boat, personal_watercraft, snowmobile,
--               riding_mower, push_mower, generator, trailer, camp_trailer, other)

CREATE OR REPLACE FUNCTION public.reorder_vehicles(p_section_ids uuid[])
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid            uuid;
  v_section        text;
  v_count          integer;
  v_array_len      integer;
  v_distinct_sects integer;
BEGIN
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = 'P0001';
  END IF;

  v_array_len := array_length(p_section_ids, 1);
  IF p_section_ids IS NULL OR v_array_len IS NULL OR v_array_len = 0 THEN
    RETURN;
  END IF;

  -- Guard 1: No duplicate IDs in the submitted array.
  IF v_array_len <> (SELECT COUNT(DISTINCT x) FROM unnest(p_section_ids) AS x) THEN
    RAISE EXCEPTION 'duplicate_vehicle_ids' USING ERRCODE = 'P0001';
  END IF;

  -- Guard 2: All IDs must exist and belong to the authenticated user.
  SELECT COUNT(*) INTO v_count
  FROM public.vehicles
  WHERE id = ANY(p_section_ids)
    AND user_id = v_uid;

  IF v_count <> v_array_len THEN
    RAISE EXCEPTION 'vehicle_not_found_or_unauthorized' USING ERRCODE = 'P0001';
  END IF;

  -- Guard 3: All submitted IDs must belong to the same section.
  --          Mixed sections are rejected atomically before any write.
  SELECT COUNT(DISTINCT
    CASE WHEN type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
      THEN 'vehicles' ELSE 'equipment' END
  ) INTO v_distinct_sects
  FROM public.vehicles
  WHERE id = ANY(p_section_ids)
    AND user_id = v_uid;

  IF v_distinct_sects <> 1 THEN
    RAISE EXCEPTION 'mixed_sections_in_reorder' USING ERRCODE = 'P0001';
  END IF;

  -- Determine the section name (safe after guard 3 confirms exactly one).
  SELECT DISTINCT
    CASE WHEN type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
      THEN 'vehicles' ELSE 'equipment' END
  INTO v_section
  FROM public.vehicles
  WHERE id = ANY(p_section_ids)
    AND user_id = v_uid;

  -- Guard 4: Submitted set must be the COMPLETE membership of the section.
  --          Prevents partial reorders that would leave some items un-renumbered.
  SELECT COUNT(*) INTO v_count
  FROM public.vehicles
  WHERE user_id = v_uid
    AND CASE WHEN type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
      THEN 'vehicles' ELSE 'equipment' END = v_section;

  IF v_count <> v_array_len THEN
    RAISE EXCEPTION 'incomplete_section_reorder' USING ERRCODE = 'P0001';
  END IF;

  -- Guard 5: Acquire row-level locks on ALL section rows before writing.
  --          ORDER BY id gives every concurrent call the same acquisition order,
  --          which prevents deadlocks while still serialising the final UPDATE.
  PERFORM id
  FROM public.vehicles
  WHERE user_id = v_uid
    AND CASE WHEN type IN ('car', 'truck', 'suv', 'motorcycle', 'dirt_bike')
      THEN 'vehicles' ELSE 'equipment' END = v_section
  ORDER BY id
  FOR UPDATE;

  -- Atomic single-statement update: position is the 1-based array index.
  UPDATE public.vehicles
  SET
    sort_order = ordering.position,
    updated_at = now()
  FROM (
    SELECT
      p_section_ids[gs] AS vehicle_id,
      gs               AS position
    FROM generate_series(1, v_array_len) AS gs
  ) AS ordering
  WHERE public.vehicles.id      = ordering.vehicle_id
    AND public.vehicles.user_id = v_uid;
END;
$$;

-- Restrict execution to the authenticated role only.
REVOKE EXECUTE ON FUNCTION public.reorder_vehicles(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reorder_vehicles(uuid[]) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reorder_vehicles(uuid[]) TO authenticated;
