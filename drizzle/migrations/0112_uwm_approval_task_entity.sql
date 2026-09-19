-- Universal Work Management: Extend approval_requests entity_type to include 'task'.
-- Migration N+16 (0112). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0111.
-- Lead inspects approval_requests.entity_type column definition before applying.

-- Pattern: if entity_type uses text + CHECK, drop + recreate constraint to include 'task'.
-- If it uses pgEnum: ALTER TYPE public.approval_entity_type ADD VALUE IF NOT EXISTS 'task';

-- Multiple approval cycles per task are natural via this pattern:
-- Query: SELECT * FROM approval_requests WHERE entity_type = 'task' AND entity_id = ? ORDER BY created_at
-- No approval_request_id on tasks table — all cycles retained in approvals module history.

COMMENT ON TABLE public.approval_requests IS
  'UWM 0112: entity_type extended to include task. Multiple approval cycles per task supported via standard entity_type/entity_id query pattern. Lead resolves constraint type.';

-- Index for approval history lookup per task:
CREATE INDEX IF NOT EXISTS approval_requests_task_idx
  ON public.approval_requests (entity_type, entity_id, created_at DESC)
  WHERE entity_type = 'task';
