-- Universal Work Management: Extend existing enums + saved_list_views scope.
-- Migration N+11 (0107). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0106.

--------------------------------------------------------------------------------
-- 1. document_links.owner_type: add 'task' and 'task_comment'
--------------------------------------------------------------------------------

ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'task';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'task_comment';

--------------------------------------------------------------------------------
-- 2. custom_field_definitions.entity_type: add 'task'
--    (Uses text column in existing schema — verify actual column type before apply)
--------------------------------------------------------------------------------

-- If entity_type is a CHECK constraint (text column), extend the constraint:
-- Pattern: drop old constraint, add new one with 'task' included.
-- Lead must inspect the actual column definition before applying.

-- Placeholder: extend via application-layer validation if entity_type uses text + CHECK.
-- If it uses a pgEnum, run:
-- ALTER TYPE public.custom_field_entity_type ADD VALUE IF NOT EXISTS 'task';
-- Lead resolves this during Wave 0 before Owner applies migration.

COMMENT ON TABLE public.custom_field_definitions IS
  'entity_type extended to include task (UWM 0107) — Lead to verify constraint type before apply.';

--------------------------------------------------------------------------------
-- 3. saved_list_views: add scope column + new list keys
--------------------------------------------------------------------------------

CREATE TYPE public.saved_list_view_scope AS ENUM ('private', 'organization');

ALTER TABLE public.saved_list_views
  ADD COLUMN IF NOT EXISTS scope public.saved_list_view_scope NOT NULL DEFAULT 'private';

COMMENT ON COLUMN public.saved_list_views.scope IS
  'private = visible to creator only; organization = visible to all org members with list permission.';

--------------------------------------------------------------------------------
-- 4. time_entries: add optional task_id FK (operational context only)
--    Does NOT affect payroll/labor cost calculations.
--------------------------------------------------------------------------------

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS time_entries_task_idx
  ON public.time_entries (task_id) WHERE task_id IS NOT NULL;

COMMENT ON COLUMN public.time_entries.task_id IS
  'Optional PM task context. Payroll/labor costing unaffected — operational attribution only.';
