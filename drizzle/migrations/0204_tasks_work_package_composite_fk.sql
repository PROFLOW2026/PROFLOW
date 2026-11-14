-- 0204_tasks_work_package_composite_fk.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
-- BUG-008: enforce same organization + project for tasks.work_package_id (DG composite FK pattern).
--
-- Does NOT modify already-applied 0203. Additive constraint change only.
--
-- DATA MUTATION: NONE. Incompatible task↔work_package rows are NOT cleared.
--   If any exist, this migration aborts with a clear exception and applies no changes.
-- SCHEMA MUTATION: drop single-column FK; add CHECK + composite FK ON DELETE SET NULL (work_package_id).
--
-- Atomicity: entire body runs in one DO block so a mid-flight failure rolls back all DDL
-- in this statement (and in the migrator transaction when applied via Drizzle).
-- Idempotent: safe to re-run after success (constraints already present → no-op).

DO $$
DECLARE
  bad_count integer;
  sample_ids text;
BEGIN
  -- 1. Preflight — fail closed if any attribution would violate the new FK.
  SELECT count(*)::integer
  INTO bad_count
  FROM public.tasks AS t
  WHERE t.work_package_id IS NOT NULL
    AND (
      t.project_id IS NULL
      OR NOT EXISTS (
        SELECT 1
        FROM public.work_packages AS wp
        WHERE wp.id = t.work_package_id
          AND wp.organization_id = t.organization_id
          AND wp.project_id = t.project_id
      )
    );

  IF bad_count > 0 THEN
    SELECT string_agg(x.id::text, ', ' ORDER BY x.id::text)
    INTO sample_ids
    FROM (
      SELECT t.id
      FROM public.tasks AS t
      WHERE t.work_package_id IS NOT NULL
        AND (
          t.project_id IS NULL
          OR NOT EXISTS (
            SELECT 1
            FROM public.work_packages AS wp
            WHERE wp.id = t.work_package_id
              AND wp.organization_id = t.organization_id
              AND wp.project_id = t.project_id
          )
        )
      ORDER BY t.id
      LIMIT 10
    ) AS x;

    RAISE EXCEPTION
      '0204_tasks_work_package_composite_fk aborted: % task row(s) have work_package_id incompatible with organization_id+project_id. No schema or data changes were applied. Sample task id(s): %. Resolve attributions manually, then re-run.',
      bad_count,
      COALESCE(sample_ids, '(none)');
  END IF;

  -- 2. Close MATCH SIMPLE NULL bypass: a work package always requires project attribution.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_work_package_requires_project'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_work_package_requires_project
      CHECK (work_package_id IS NULL OR project_id IS NOT NULL);
  END IF;

  -- 3. Replace weak id-only FK with (work_package_id, organization_id, project_id).
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_work_package_id_work_packages_id_fk'
  ) THEN
    ALTER TABLE public.tasks
      DROP CONSTRAINT tasks_work_package_id_work_packages_id_fk;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_work_package_org_project_fk'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_work_package_org_project_fk
      FOREIGN KEY (work_package_id, organization_id, project_id)
      REFERENCES public.work_packages (id, organization_id, project_id)
      ON DELETE SET NULL (work_package_id);
  END IF;
END $$;
