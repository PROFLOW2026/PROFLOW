-- Universal Work Management: Project close/archive semantics.
-- Migration N+15 (0111). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0110.

-- Add close columns if not already present (projects may already have is_archived).
-- is_read_only on projects: when true, no new tasks with project_id = this project may be created.
-- closed_at: timestamp of explicit project close action.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS is_read_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

COMMENT ON COLUMN public.projects.is_read_only IS
  'When true, project is closed: tasks with project_id = this project become read-only. Workspace and workspace-wide tasks (project_id NULL) not affected.';
COMMENT ON COLUMN public.projects.closed_at IS
  'Timestamp of explicit project close action (UWM). NULL = project open.';
