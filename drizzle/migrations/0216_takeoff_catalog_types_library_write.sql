-- 0216_takeoff_catalog_types_library_write.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- SCHEMA: app.normalize_takeoff_catalog_name; takeoff_catalog_types.name_norm;
--   unique active-name index; RLS INSERT+UPDATE → takeoff.library.manage.
--   SELECT policy (takeoff.view) and service_role policy are unchanged. No DELETE policy.
-- DATA MUTATION: backfill name_norm from payload nameHe (display names unchanged).
--   NO DELETE. NO archive. NO payload / nameHe rewrite.
-- FAIL-CLOSED: if two ACTIVE rows in the same org share the same normalized name,
--   this file raises 0216_preflight_duplicates, reports every colliding row, and
--   rolls back so no column, index, function, or RLS change remains.
--
-- Transactional path: the entire apply is one DO block (one statement). Under
-- autocommit it is one transaction; Drizzle migrate() also wraps the file.
-- A RAISE inside the DO aborts every change in this file.

-- =============================================================================
-- READ-ONLY PREFLIGHT — copy into a READ ONLY transaction BEFORE applying 0216.
-- Does not require name_norm. Does not write. Resolve duplicates by Owner decision;
-- this migration will not pick a surviving row.
-- =============================================================================
-- BEGIN TRANSACTION READ ONLY;
--
-- WITH computed AS (
--   SELECT
--     t.id,
--     t.organization_id,
--     t.key,
--     t.archived,
--     t.created_at,
--     t.updated_at,
--     t.payload->>'nameHe' AS name_he,
--     jsonb_typeof(t.payload) AS payload_kind,
--     btrim(
--       regexp_replace(
--         normalize(coalesce(t.payload->>'nameHe', ''), NFC),
--         U&'[\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
--         ' ',
--         'g'
--       )
--     ) AS name_norm_computed
--   FROM public.takeoff_catalog_types AS t
-- ),
-- duplicate_keys AS (
--   SELECT organization_id, name_norm_computed
--   FROM computed
--   WHERE archived = false AND name_norm_computed <> ''
--   GROUP BY 1, 2
--   HAVING count(*) > 1
-- )
-- SELECT
--   'duplicate_active_name'::text AS issue,
--   c.organization_id,
--   c.id,
--   c.key,
--   c.archived,
--   c.name_he,
--   c.name_norm_computed,
--   c.created_at
-- FROM computed AS c
-- JOIN duplicate_keys AS d
--   ON d.organization_id = c.organization_id
--  AND d.name_norm_computed = c.name_norm_computed
-- WHERE c.archived = false
-- UNION ALL
-- SELECT
--   'empty_active_name',
--   organization_id,
--   id,
--   key,
--   archived,
--   name_he,
--   name_norm_computed,
--   created_at
-- FROM computed
-- WHERE archived = false AND name_norm_computed = ''
-- UNION ALL
-- SELECT
--   'payload_not_object',
--   organization_id,
--   id,
--   key,
--   archived,
--   name_he,
--   name_norm_computed,
--   created_at
-- FROM computed
-- WHERE payload_kind IS DISTINCT FROM 'object'
-- ORDER BY 1, 2, 8, 3;
--
-- ROLLBACK;

DO $takeoff_0216$
DECLARE
  v_dup_report text;
  v_dup_count integer;
  v_empty_report text;
  v_anomaly_report text;
BEGIN
  EXECUTE $exec$
    CREATE OR REPLACE FUNCTION app.normalize_takeoff_catalog_name(p_name text)
    RETURNS text
    LANGUAGE sql
    IMMUTABLE
    PARALLEL SAFE
    AS $fn$
      SELECT btrim(
        regexp_replace(
          normalize(coalesce(p_name, ''), NFC),
          U&'[\0009\000A\000B\000C\000D\0020\0085\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]+',
          ' ',
          'g'
        )
      );
    $fn$;
  $exec$;

  COMMENT ON FUNCTION app.normalize_takeoff_catalog_name(text) IS
    'NFC + Unicode-whitespace collapse for takeoff catalog names; matches normalizeCatalogNameHe.';

  SELECT
    count(*)::integer,
    string_agg(
      format(
        'org=%s id=%s key=%s nameHe=%L name_norm=%L created_at=%s',
        c.organization_id,
        c.id,
        c.key,
        c.payload->>'nameHe',
        app.normalize_takeoff_catalog_name(c.payload->>'nameHe'),
        c.created_at
      ),
      E'\n'
      ORDER BY c.organization_id, app.normalize_takeoff_catalog_name(c.payload->>'nameHe'), c.created_at, c.id
    )
  INTO v_dup_count, v_dup_report
  FROM public.takeoff_catalog_types AS c
  WHERE c.archived = false
    AND app.normalize_takeoff_catalog_name(c.payload->>'nameHe') <> ''
    AND EXISTS (
      SELECT 1
      FROM public.takeoff_catalog_types AS other
      WHERE other.organization_id = c.organization_id
        AND other.archived = false
        AND other.id <> c.id
        AND app.normalize_takeoff_catalog_name(other.payload->>'nameHe')
          = app.normalize_takeoff_catalog_name(c.payload->>'nameHe')
    );

  SELECT string_agg(
    format('org=%s id=%s key=%s nameHe=%L', organization_id, id, key, payload->>'nameHe'),
    E'\n'
    ORDER BY organization_id, created_at, id
  )
  INTO v_empty_report
  FROM public.takeoff_catalog_types
  WHERE archived = false
    AND app.normalize_takeoff_catalog_name(payload->>'nameHe') = '';

  SELECT string_agg(
    format('org=%s id=%s key=%s jsonb_typeof=%s', organization_id, id, key, jsonb_typeof(payload)),
    E'\n'
    ORDER BY organization_id, created_at, id
  )
  INTO v_anomaly_report
  FROM public.takeoff_catalog_types
  WHERE jsonb_typeof(payload) IS DISTINCT FROM 'object';

  IF v_empty_report IS NOT NULL THEN
    RAISE NOTICE '0216_preflight_empty_names:%', E'\n' || v_empty_report;
  END IF;

  IF v_anomaly_report IS NOT NULL THEN
    RAISE NOTICE '0216_preflight_payload_not_object:%', E'\n' || v_anomaly_report;
  END IF;

  IF coalesce(v_dup_count, 0) > 0 THEN
    RAISE EXCEPTION
      '0216_preflight_duplicates: % active catalog row(s) share a normalized name. Owner must choose which row to keep; this migration will not archive or delete. Rows:%',
      v_dup_count,
      E'\n' || v_dup_report
      USING ERRCODE = 'P0001',
            HINT = 'Run the read-only PREFLIGHT SELECT in this file. Do not apply until duplicates are resolved by an explicit Owner decision.';
  END IF;

  ALTER TABLE public.takeoff_catalog_types
    ADD COLUMN IF NOT EXISTS name_norm text NOT NULL DEFAULT '';

  COMMENT ON COLUMN public.takeoff_catalog_types.name_norm IS
    'NFC-trimmed collapsed nameHe for active-row uniqueness; empty when archived or unnamed.';

  UPDATE public.takeoff_catalog_types
  SET name_norm = CASE
    WHEN archived THEN ''
    ELSE app.normalize_takeoff_catalog_name(payload->>'nameHe')
  END
  WHERE name_norm IS DISTINCT FROM CASE
    WHEN archived THEN ''
    ELSE app.normalize_takeoff_catalog_name(payload->>'nameHe')
  END;

  CREATE UNIQUE INDEX IF NOT EXISTS takeoff_catalog_types_org_name_active_uq
    ON public.takeoff_catalog_types (organization_id, name_norm)
    WHERE archived = false AND name_norm <> '';

  -- Write policies only. 0205 used FOR ALL on takeoff_catalog_types_write (which
  -- also covered SELECT/DELETE). 0216 splits that into INSERT+UPDATE so:
  --   SELECT stays takeoff.view (takeoff_catalog_types_select, unchanged)
  --   INSERT/UPDATE require takeoff.library.manage
  --   DELETE is not granted to authenticated (0205 GRANT has no DELETE; no DELETE policy)
  --   service_role policy is unchanged
  DROP POLICY IF EXISTS takeoff_catalog_types_write ON public.takeoff_catalog_types;
  DROP POLICY IF EXISTS takeoff_catalog_types_insert ON public.takeoff_catalog_types;
  DROP POLICY IF EXISTS takeoff_catalog_types_update ON public.takeoff_catalog_types;

  CREATE POLICY takeoff_catalog_types_insert ON public.takeoff_catalog_types
    FOR INSERT TO authenticated
    WITH CHECK (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, 'takeoff.library.manage')
    );

  CREATE POLICY takeoff_catalog_types_update ON public.takeoff_catalog_types
    FOR UPDATE TO authenticated
    USING (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, 'takeoff.library.manage')
    )
    WITH CHECK (
      app.is_org_member(organization_id)
      AND app.has_org_permission(organization_id, 'takeoff.library.manage')
    );
END;
$takeoff_0216$;
