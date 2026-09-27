-- Migration 0140: Tasks forms, search enums, and custom fields expansion
--
-- 1. form_submissions: Add 'task' to the owner_known CHECK constraint
-- 2. custom_field_definitions: Add 'task' and 'work_order' to the entity_known CHECK constraint
--
-- PostgreSQL does not support altering CHECK constraints directly.
-- We drop the old constraint and recreate it with the expanded value set.
-- Each ALTER TABLE is its own DDL and auto-committed; no manual COMMIT needed.

-- ─── 1. form_submissions: expand owner_known ─────────────────────────────────

ALTER TABLE form_submissions
  DROP CONSTRAINT IF EXISTS form_submissions_owner_known;

ALTER TABLE form_submissions
  ADD CONSTRAINT form_submissions_owner_known
  CHECK (owner_type IN (
    'project',
    'job',
    'work_order',
    'planning_task',
    'maintenance',
    'field_log',
    'inspection',
    'task'
  ));

-- ─── 2. custom_field_definitions: expand entity_known ────────────────────────

ALTER TABLE custom_field_definitions
  DROP CONSTRAINT IF EXISTS custom_field_definitions_entity_known;

ALTER TABLE custom_field_definitions
  ADD CONSTRAINT custom_field_definitions_entity_known
  CHECK (entity_type IN (
    'client',
    'project',
    'vendor',
    'employee',
    'opportunity',
    'expense',
    'task',
    'work_order'
  ));
