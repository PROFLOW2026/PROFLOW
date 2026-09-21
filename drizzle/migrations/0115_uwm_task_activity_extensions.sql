-- Universal Work Management: extend task_activity_event_type for subtask/duplicate/template actions.
-- Migration 0115. Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0114.

ALTER TYPE public.task_activity_event_type ADD VALUE IF NOT EXISTS 'subtask_added';
ALTER TYPE public.task_activity_event_type ADD VALUE IF NOT EXISTS 'task_duplicated';
ALTER TYPE public.task_activity_event_type ADD VALUE IF NOT EXISTS 'template_saved';
ALTER TYPE public.task_activity_event_type ADD VALUE IF NOT EXISTS 'task_from_template';
