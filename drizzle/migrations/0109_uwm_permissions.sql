-- Universal Work Management: Seed new permission keys into permissions catalog.
-- Migration N+13 (0109). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0108.
-- Lead must inspect permissions table seeding mechanism before applying.

-- New permission keys to seed (matching catalog.ts additions):
-- tasks.read, tasks.create, tasks.update, tasks.delete, tasks.assign,
-- tasks.manage_all, tasks.comment, tasks.approve,
-- portfolio.read, workload.read, operations.read,
-- workspaces.manage, stages.manage, modules.manage, labels.manage,
-- task_templates.manage, project_templates.manage,
-- meetings.read, meetings.manage

-- Pattern: INSERT ... ON CONFLICT DO NOTHING (if permissions table has unique key on key string).
-- Lead inspects seed/system.ts and replicates pattern for new keys.

COMMENT ON TABLE public.permissions IS
  'UWM 0109: 19 new permission keys seeded. Lead uses seed/system.ts pattern to insert.';

-- Placeholder INSERT pattern (Lead replaces with actual column names from permissions table):
-- INSERT INTO public.permissions (key, category, description) VALUES
--   ('tasks.read', 'projects', 'View tasks and boards'),
--   ('tasks.create', 'projects', 'Create tasks'),
--   ...
-- ON CONFLICT (key) DO NOTHING;
