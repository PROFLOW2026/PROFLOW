-- Universal Work Management: Meeting Records, Attendees, Decisions, Action Items.
-- Migration N+10 (0106). Owner applies via npm run db:migrate.
-- Do not modify migrations 0000–0105.

--------------------------------------------------------------------------------
-- 1. meeting_records
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects (id) ON DELETE SET NULL,
  workspace_id uuid REFERENCES public.workspaces (id) ON DELETE SET NULL,
  title text NOT NULL,
  scheduled_at timestamptz NOT NULL,
  location text,
  notes text,
  created_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_records_org_idx ON public.meeting_records (organization_id, scheduled_at);
CREATE INDEX IF NOT EXISTS meeting_records_project_idx ON public.meeting_records (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS meeting_records_workspace_idx ON public.meeting_records (workspace_id) WHERE workspace_id IS NOT NULL;

ALTER TABLE public.meeting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_records_select ON public.meeting_records;
CREATE POLICY meeting_records_select ON public.meeting_records
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_records_insert ON public.meeting_records;
CREATE POLICY meeting_records_insert ON public.meeting_records
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_records_update ON public.meeting_records;
CREATE POLICY meeting_records_update ON public.meeting_records
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_records_service_all ON public.meeting_records;
CREATE POLICY meeting_records_service_all ON public.meeting_records AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 2. meeting_attendees (structured; at least one identity field)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_attendees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees (id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.client_contacts (id) ON DELETE SET NULL,
  display_name text,
  CONSTRAINT meeting_attendees_at_least_one CHECK (
    (org_member_id IS NOT NULL)::int
    + (employee_id IS NOT NULL)::int
    + (contact_id IS NOT NULL)::int
    + (display_name IS NOT NULL)::int >= 1
  )
);

CREATE INDEX IF NOT EXISTS meeting_attendees_meeting_idx ON public.meeting_attendees (meeting_id);

ALTER TABLE public.meeting_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_attendees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_attendees_select ON public.meeting_attendees;
CREATE POLICY meeting_attendees_select ON public.meeting_attendees
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_attendees_insert ON public.meeting_attendees;
CREATE POLICY meeting_attendees_insert ON public.meeting_attendees
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_attendees_update ON public.meeting_attendees;
CREATE POLICY meeting_attendees_update ON public.meeting_attendees
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_attendees_delete ON public.meeting_attendees;
CREATE POLICY meeting_attendees_delete ON public.meeting_attendees
  FOR DELETE TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_attendees_service_all ON public.meeting_attendees;
CREATE POLICY meeting_attendees_service_all ON public.meeting_attendees AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 3. meeting_decisions (canonical — distinct from tasks)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  decided_at timestamptz,
  decided_by_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  decided_by_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_decisions_meeting_idx ON public.meeting_decisions (meeting_id);

ALTER TABLE public.meeting_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_decisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_decisions_select ON public.meeting_decisions;
CREATE POLICY meeting_decisions_select ON public.meeting_decisions
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_decisions_insert ON public.meeting_decisions;
CREATE POLICY meeting_decisions_insert ON public.meeting_decisions
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_decisions_update ON public.meeting_decisions;
CREATE POLICY meeting_decisions_update ON public.meeting_decisions
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_decisions_service_all ON public.meeting_decisions;
CREATE POLICY meeting_decisions_service_all ON public.meeting_decisions AS PERMISSIVE
  FOR ALL TO service_role USING (true);

--------------------------------------------------------------------------------
-- 4. meeting_action_items (may link/create tasks; decision ≠ task)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  meeting_id uuid NOT NULL REFERENCES public.meeting_records (id) ON DELETE CASCADE,
  decision_id uuid REFERENCES public.meeting_decisions (id) ON DELETE SET NULL,
  title text NOT NULL,
  assigned_to_org_member_id uuid REFERENCES public.organization_memberships (id) ON DELETE SET NULL,
  assigned_to_employee_id uuid REFERENCES public.employees (id) ON DELETE SET NULL,
  due_date date,
  task_id uuid REFERENCES public.tasks (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT meeting_action_items_status_known CHECK (status IN ('open', 'done', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS meeting_action_items_meeting_idx ON public.meeting_action_items (meeting_id);

ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_action_items FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS meeting_action_items_select ON public.meeting_action_items;
CREATE POLICY meeting_action_items_select ON public.meeting_action_items
  FOR SELECT TO authenticated USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_action_items_insert ON public.meeting_action_items;
CREATE POLICY meeting_action_items_insert ON public.meeting_action_items
  FOR INSERT TO authenticated WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_action_items_update ON public.meeting_action_items;
CREATE POLICY meeting_action_items_update ON public.meeting_action_items
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)) WITH CHECK (app.is_org_member(organization_id));

DROP POLICY IF EXISTS meeting_action_items_service_all ON public.meeting_action_items;
CREATE POLICY meeting_action_items_service_all ON public.meeting_action_items AS PERMISSIVE
  FOR ALL TO service_role USING (true);
