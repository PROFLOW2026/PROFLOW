-- 0203_tasks_work_package_id.sql
-- Optional work-package attribution on workspace tasks (sprint work-lens filter).

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS work_package_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tasks_work_package_id_work_packages_id_fk'
  ) THEN
    ALTER TABLE public.tasks
      ADD CONSTRAINT tasks_work_package_id_work_packages_id_fk
      FOREIGN KEY (work_package_id)
      REFERENCES public.work_packages (id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tasks_work_package_idx
  ON public.tasks (organization_id, project_id, work_package_id)
  WHERE work_package_id IS NOT NULL;
