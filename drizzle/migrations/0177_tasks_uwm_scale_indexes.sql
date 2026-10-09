-- Migration 0177: UWM task list scale indexes (My Work JOINs, board lens, title search)
--
-- PREPARED ONLY — do not apply to Production without separate Owner approval.

-- Board-scoped task lists: org + board + sort_key for active tasks
CREATE INDEX IF NOT EXISTS tasks_org_board_active_idx
  ON tasks (organization_id, board_id, sort_key)
  WHERE is_archived = false AND board_id IS NOT NULL;

-- Following / My Work follower lookups
CREATE INDEX IF NOT EXISTS task_followers_org_member_idx
  ON task_followers (organization_id, org_member_id, task_id);

-- assigned_to_me JOIN path (optional; validate with EXPLAIN on staging)
CREATE INDEX IF NOT EXISTS task_assignees_org_member_task_idx
  ON task_assignees (organization_id, org_member_id, task_id);

-- Title ILIKE search (requires pg_trgm; safe when extension missing)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'pg_trgm'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_tasks_title_trgm
               ON tasks USING gin (title gin_trgm_ops)';
  END IF;
END $$;
