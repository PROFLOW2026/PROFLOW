-- Universal Work Management: Optional link from planning_work_items to PM tasks.
-- Migration N+14 (0110). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0109.

ALTER TABLE public.planning_work_items
  ADD COLUMN IF NOT EXISTS task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS planning_work_items_task_idx
  ON public.planning_work_items (task_id) WHERE task_id IS NOT NULL;

COMMENT ON COLUMN public.planning_work_items.task_id IS
  'Optional link to a PM task (UWM). When set, task status may optionally reflect on planning item progress (opt-in, not automatic). planning_work_items remains the Gantt/schedule layer.';
