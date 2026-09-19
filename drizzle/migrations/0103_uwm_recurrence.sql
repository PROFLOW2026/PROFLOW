-- Universal Work Management: Task Recurrence Rules + Occurrences.
-- Migration N+7 (0103). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0102.

--------------------------------------------------------------------------------
-- 1. Enum: task_recurrence_occurrence_status
--------------------------------------------------------------------------------

CREATE TYPE public.task_recurrence_occurrence_status AS ENUM (
  'pending', 'generated', 'skipped', 'cancelled'
);

--------------------------------------------------------------------------------
-- 2. task_recurrence_rules
--    RRULE: RFC 5545 RRULE string (e.g. FREQ=WEEKLY;BYDAY=MO).
--    timezone: IANA zone (e.g. Asia/Jerusalem). DST-aware computation in domain.
--    template_task_id: master task definition for generated instances.
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_recurrence_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rrule text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Jerusalem',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  max_occurrences integer,
  template_task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_recurrence_rules_org_idx
  ON public.task_recurrence_rules (organization_id);

ALTER TABLE public.task_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_recurrence_rules FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_recurrence_rules_select ON public.task_recurrence_rules;
CREATE POLICY task_recurrence_rules_select ON public.task_recurrence_rules
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_rules_insert ON public.task_recurrence_rules;
CREATE POLICY task_recurrence_rules_insert ON public.task_recurrence_rules
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_rules_update ON public.task_recurrence_rules;
CREATE POLICY task_recurrence_rules_update ON public.task_recurrence_rules
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_rules_service_all ON public.task_recurrence_rules;
CREATE POLICY task_recurrence_rules_service_all ON public.task_recurrence_rules AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. task_recurrence_occurrences
--    UNIQUE(rule_id, occurrence_at): structural idempotency — no duplicate generation.
--    occurrence_at stored as timestamptz (DST-aware; computed in rule timezone).
--    generated_task_id: unique per occurrence (nullable until materialized).
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.task_recurrence_occurrences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id uuid NOT NULL REFERENCES public.task_recurrence_rules (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  occurrence_at timestamptz NOT NULL,
  status public.task_recurrence_occurrence_status NOT NULL DEFAULT 'pending',
  generated_task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  CONSTRAINT task_recurrence_occurrences_uq UNIQUE (rule_id, occurrence_at)
);

CREATE INDEX IF NOT EXISTS task_recurrence_occurrences_rule_idx
  ON public.task_recurrence_occurrences (rule_id, status);

ALTER TABLE public.task_recurrence_occurrences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_recurrence_occurrences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_recurrence_occurrences_select ON public.task_recurrence_occurrences;
CREATE POLICY task_recurrence_occurrences_select ON public.task_recurrence_occurrences
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_occurrences_insert ON public.task_recurrence_occurrences;
CREATE POLICY task_recurrence_occurrences_insert ON public.task_recurrence_occurrences
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_occurrences_update ON public.task_recurrence_occurrences;
CREATE POLICY task_recurrence_occurrences_update ON public.task_recurrence_occurrences
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS task_recurrence_occurrences_service_all ON public.task_recurrence_occurrences;
CREATE POLICY task_recurrence_occurrences_service_all ON public.task_recurrence_occurrences AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 4. Back-fill FK on tasks (recurrence_rule_id, generated_from_occurrence_id)
--    These FKs were deferred until both tables exist.
--------------------------------------------------------------------------------

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_recurrence_rule_fk
    FOREIGN KEY (recurrence_rule_id)
    REFERENCES public.task_recurrence_rules (id)
    ON DELETE SET NULL;

ALTER TABLE public.tasks
  ADD CONSTRAINT tasks_generated_from_occurrence_fk
    FOREIGN KEY (generated_from_occurrence_id)
    REFERENCES public.task_recurrence_occurrences (id)
    ON DELETE SET NULL;
