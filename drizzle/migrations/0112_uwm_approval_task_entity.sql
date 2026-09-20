-- Universal Work Management: Extend approval_requests entity_type to include 'task'.
-- Migration N+16 (0112). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0111.
--
-- SCHEMA NOTE (inspected 0027):
--   approval_requests.entity_type is `text NOT NULL` with NO CHECK constraint.
--   (approval_rules.entity_type has a CHECK; approval_requests does not.)
--   Inserting approval_requests rows with entity_type = 'task' is safe without
--   any schema change. This migration adds only a partial index for query performance.
--
-- Multiple approval cycles per task are supported via the standard pattern:
--   SELECT * FROM approval_requests
--   WHERE entity_type = 'task' AND entity_id = ? ORDER BY created_at
-- No approval_request_id on tasks table — all cycles retained in approvals history.

COMMENT ON TABLE public.approval_requests IS
  'UWM 0112: entity_type = ''task'' is supported (no CHECK constraint on this column). '
  'Multiple approval cycles per task are queried via entity_type/entity_id. '
  'Partial index approval_requests_task_idx added for performance.';

-- Partial index for approval history lookup per task:
CREATE INDEX IF NOT EXISTS approval_requests_task_idx
  ON public.approval_requests (entity_type, entity_id, created_at DESC)
  WHERE entity_type = 'task';
