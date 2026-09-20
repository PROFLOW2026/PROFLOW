-- Universal Work Management: Seed new permission keys into permissions catalog.
-- Migration N+13 (0109). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0108.
--
-- permissions table schema (confirmed: 0000):
--   key         text  PRIMARY KEY
--   category    text  NOT NULL
--   description text  NOT NULL
--
-- Seed pattern matches 0055 (ON CONFLICT DO UPDATE so re-runs are idempotent).
-- 19 new keys added for UWM: tasks (8), portfolio/workload/ops (3), admin (8).

INSERT INTO public.permissions (key, category, description) VALUES
  ('tasks.read',               'projects',      'View tasks, boards, buckets, and task details'),
  ('tasks.create',             'projects',      'Create new tasks in any accessible workspace'),
  ('tasks.update',             'projects',      'Edit task fields, status, priority, and dates'),
  ('tasks.delete',             'projects',      'Delete tasks'),
  ('tasks.assign',             'projects',      'Assign tasks to org members and employees'),
  ('tasks.manage_all',         'projects',      'Manage all tasks across the organization regardless of assignment'),
  ('tasks.comment',            'projects',      'Add and edit comments on tasks'),
  ('tasks.approve',            'projects',      'Approve or reject tasks that require approval'),
  ('portfolio.read',           'projects',      'View portfolio overview and rollups across all workspaces'),
  ('workload.read',            'projects',      'View team workload, capacity, and assignment distribution'),
  ('operations.read',          'projects',      'View operational dashboards and cross-workspace work summaries'),
  ('workspaces.manage',        'projects',      'Create, configure, and archive workspaces and teams'),
  ('stages.manage',            'projects',      'Create and configure project stage definitions'),
  ('modules.manage',           'organization',  'Enable and disable product modules for the organization'),
  ('labels.manage',            'projects',      'Create, edit, and archive task labels'),
  ('task_templates.manage',    'projects',      'Create and manage reusable task templates'),
  ('project_templates.manage', 'projects',      'Create and manage project templates including stages and tasks'),
  ('meetings.read',            'projects',      'View meeting records, decisions, and action items'),
  ('meetings.manage',          'projects',      'Create and manage meeting records, decisions, and action items')
ON CONFLICT (key) DO UPDATE SET
  category    = EXCLUDED.category,
  description = EXCLUDED.description;
