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
--    entity_type is a text column with a named CHECK constraint (confirmed: 0009).
--    Constraint name: custom_field_definitions_entity_known
--    Original values: 'client','project','vendor','employee','opportunity','expense'
--------------------------------------------------------------------------------

ALTER TABLE public.custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_entity_known;

ALTER TABLE public.custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_entity_known CHECK (
    entity_type IN ('client', 'project', 'vendor', 'employee', 'opportunity', 'expense', 'task')
  );

--------------------------------------------------------------------------------
-- 3. saved_list_views: add scope column + extend list_key CHECK
--
--    Existing constraint name (confirmed from schema): saved_list_views_key_known
--    Existing allowed values (10): projects, jobs, work_orders, clients, vendors,
--      expenses, ap_bills, quotes, punch, inventory
--    New UWM values (+4): tasks, portfolio, workload, operations
--
--    Scope values: 'private' (per-user default) | 'organization' (shared with org)
--------------------------------------------------------------------------------

-- 3a. Add scope enum type
CREATE TYPE public.saved_list_view_scope AS ENUM ('private', 'organization');

-- 3b. Add scope column (default 'private' preserves all existing rows as private)
ALTER TABLE public.saved_list_views
  ADD COLUMN IF NOT EXISTS scope public.saved_list_view_scope NOT NULL DEFAULT 'private';

COMMENT ON COLUMN public.saved_list_views.scope IS
  'private = visible to creator only; organization = visible to all org members with list permission.';

-- 3c. Extend list_key CHECK to include UWM list keys
ALTER TABLE public.saved_list_views
  DROP CONSTRAINT IF EXISTS saved_list_views_key_known;

ALTER TABLE public.saved_list_views
  ADD CONSTRAINT saved_list_views_key_known CHECK (
    list_key IN (
      -- Existing list keys (preserved)
      'projects', 'jobs', 'work_orders', 'clients', 'vendors',
      'expenses', 'ap_bills', 'quotes', 'punch', 'inventory',
      -- UWM additions (0107)
      'tasks', 'portfolio', 'workload', 'operations'
    )
  );

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
