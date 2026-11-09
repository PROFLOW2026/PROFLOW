-- 0200_exlfy_evolution_local.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without a separate Owner approval.
-- Additive tables for the approved product plan.
-- Access uses the existing helpers: app.can_access_project, app.has_project_capability,
-- app.has_org_permission, and external_access_grants. Org membership alone is not enough.
-- No updates to money tables. No backfill of business rows.

CREATE TABLE IF NOT EXISTS public.drawing_sheet_marks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  drawing_revision_id uuid NOT NULL,
  page_index integer NOT NULL DEFAULT 0,
  kind text NOT NULL,
  geometry jsonb NOT NULL DEFAULT '{}'::jsonb,
  note text,
  linked_entity_type text,
  linked_entity_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT drawing_sheet_marks_kind_known CHECK (kind IN ('pin', 'note', 'measure')),
  CONSTRAINT drawing_sheet_marks_page_nonneg CHECK (page_index >= 0)
);

CREATE INDEX IF NOT EXISTS drawing_sheet_marks_revision_idx
  ON public.drawing_sheet_marks (organization_id, drawing_revision_id, page_index);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drawing_sheet_marks_project_org_fk'
  ) THEN
    ALTER TABLE public.drawing_sheet_marks
      ADD CONSTRAINT drawing_sheet_marks_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'drawing_sheet_marks_revision_org_fk'
  ) THEN
    ALTER TABLE public.drawing_sheet_marks
      ADD CONSTRAINT drawing_sheet_marks_revision_org_fk
      FOREIGN KEY (drawing_revision_id, organization_id)
      REFERENCES public.drawing_revisions (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.drawing_sheet_marks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_sheet_marks FORCE ROW LEVEL SECURITY;

-- Marks follow the drawing: documents.view to read, documents.share to write.
-- The revision must belong to the same project. Internal drawings stay internal
-- because contractors are not granted documents.view.
DROP POLICY IF EXISTS drawing_sheet_marks_member ON public.drawing_sheet_marks;
DROP POLICY IF EXISTS drawing_sheet_marks_select ON public.drawing_sheet_marks;
CREATE POLICY drawing_sheet_marks_select ON public.drawing_sheet_marks
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.view')
    AND EXISTS (
      SELECT 1
      FROM public.drawing_revisions r
      JOIN public.drawings d
        ON d.id = r.drawing_id
       AND d.organization_id = r.organization_id
       AND d.project_id = r.project_id
      WHERE r.id = drawing_sheet_marks.drawing_revision_id
        AND r.organization_id = drawing_sheet_marks.organization_id
        AND r.project_id = drawing_sheet_marks.project_id
    )
  );

DROP POLICY IF EXISTS drawing_sheet_marks_insert ON public.drawing_sheet_marks;
CREATE POLICY drawing_sheet_marks_insert ON public.drawing_sheet_marks
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
    AND created_by_user_id = app.current_user_id()
    AND EXISTS (
      SELECT 1
      FROM public.drawing_revisions r
      WHERE r.id = drawing_revision_id
        AND r.organization_id = drawing_sheet_marks.organization_id
        AND r.project_id = drawing_sheet_marks.project_id
    )
  );

DROP POLICY IF EXISTS drawing_sheet_marks_update ON public.drawing_sheet_marks;
CREATE POLICY drawing_sheet_marks_update ON public.drawing_sheet_marks
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
  );

DROP POLICY IF EXISTS drawing_sheet_marks_delete ON public.drawing_sheet_marks;
CREATE POLICY drawing_sheet_marks_delete ON public.drawing_sheet_marks
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'documents.share')
  );

DROP POLICY IF EXISTS drawing_sheet_marks_service_all ON public.drawing_sheet_marks;
CREATE POLICY drawing_sheet_marks_service_all ON public.drawing_sheet_marks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.project_risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  description text NOT NULL,
  probability integer NOT NULL,
  impact integer NOT NULL,
  owner_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  treatment text,
  status text NOT NULL DEFAULT 'open',
  review_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_risks_probability_range CHECK (probability BETWEEN 1 AND 5),
  CONSTRAINT project_risks_impact_range CHECK (impact BETWEEN 1 AND 5),
  CONSTRAINT project_risks_status_known CHECK (status IN ('open', 'mitigating', 'closed'))
);

CREATE INDEX IF NOT EXISTS project_risks_project_idx
  ON public.project_risks (organization_id, project_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'project_risks_project_org_fk'
  ) THEN
    ALTER TABLE public.project_risks
      ADD CONSTRAINT project_risks_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.project_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_risks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_risks_member ON public.project_risks;
DROP POLICY IF EXISTS project_risks_select ON public.project_risks;
CREATE POLICY project_risks_select ON public.project_risks
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_project_capability(organization_id, project_id, 'project.view')
  );

DROP POLICY IF EXISTS project_risks_insert ON public.project_risks;
CREATE POLICY project_risks_insert ON public.project_risks
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'projects.update')
  );

DROP POLICY IF EXISTS project_risks_update ON public.project_risks;
CREATE POLICY project_risks_update ON public.project_risks
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'projects.update')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'projects.update')
  );

DROP POLICY IF EXISTS project_risks_delete ON public.project_risks;
CREATE POLICY project_risks_delete ON public.project_risks
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'projects.update')
  );

DROP POLICY IF EXISTS project_risks_service_all ON public.project_risks;
CREATE POLICY project_risks_service_all ON public.project_risks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.supplier_rfq_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rfq_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_rfq_access_tokens_hash_uq UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS supplier_rfq_access_tokens_rfq_idx
  ON public.supplier_rfq_access_tokens (organization_id, rfq_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'supplier_rfq_access_tokens_vendor_org_fk'
  ) THEN
    ALTER TABLE public.supplier_rfq_access_tokens
      ADD CONSTRAINT supplier_rfq_access_tokens_vendor_org_fk
      FOREIGN KEY (vendor_id, organization_id)
      REFERENCES public.vendors (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.supplier_rfq_access_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_rfq_access_tokens FORCE ROW LEVEL SECURITY;

-- Authenticated users never receive the hash unless they manage procurement.
-- The public supplier page reads through service_role, not this policy.
DROP POLICY IF EXISTS supplier_rfq_access_tokens_member ON public.supplier_rfq_access_tokens;
DROP POLICY IF EXISTS supplier_rfq_access_tokens_select ON public.supplier_rfq_access_tokens;
CREATE POLICY supplier_rfq_access_tokens_select ON public.supplier_rfq_access_tokens
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
  );

DROP POLICY IF EXISTS supplier_rfq_access_tokens_insert ON public.supplier_rfq_access_tokens;
CREATE POLICY supplier_rfq_access_tokens_insert ON public.supplier_rfq_access_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
    AND used_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.procurement_rfqs r
      WHERE r.id = rfq_id
        AND r.organization_id = supplier_rfq_access_tokens.organization_id
    )
    AND EXISTS (
      SELECT 1 FROM public.vendors v
      WHERE v.id = vendor_id
        AND v.organization_id = supplier_rfq_access_tokens.organization_id
    )
  );

DROP POLICY IF EXISTS supplier_rfq_access_tokens_update ON public.supplier_rfq_access_tokens;
CREATE POLICY supplier_rfq_access_tokens_update ON public.supplier_rfq_access_tokens
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'procurement.manage')
  );

DROP POLICY IF EXISTS supplier_rfq_access_tokens_service_all ON public.supplier_rfq_access_tokens;
CREATE POLICY supplier_rfq_access_tokens_service_all ON public.supplier_rfq_access_tokens
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.work_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  title text NOT NULL,
  permit_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  requested_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  decided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  valid_from date,
  valid_until date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_permits_status_known CHECK (
    status IN ('draft', 'submitted', 'approved', 'rejected', 'closed')
  )
);

CREATE INDEX IF NOT EXISTS work_permits_project_idx
  ON public.work_permits (organization_id, project_id, status);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'work_permits_project_org_fk'
  ) THEN
    ALTER TABLE public.work_permits
      ADD CONSTRAINT work_permits_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE public.work_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_permits FORCE ROW LEVEL SECURITY;

-- View: safety.read or projects.read, and the project must be visible.
-- Write, including submit and the existing approve/reject actions: safety.manage.
-- There is no separate approve permission in the catalog; safety.manage is the existing gate.
-- A contractor with ext.safety.report may read, not write.
DROP POLICY IF EXISTS work_permits_member ON public.work_permits;
DROP POLICY IF EXISTS work_permits_select ON public.work_permits;
CREATE POLICY work_permits_select ON public.work_permits
  FOR SELECT TO authenticated
  USING (
    (
      app.is_org_member(organization_id)
      AND app.can_access_project(organization_id, project_id)
      AND (
        app.has_org_permission(organization_id, 'safety.read')
        OR app.has_org_permission(organization_id, 'projects.read')
        OR app.has_org_permission(organization_id, 'safety.manage')
      )
    )
    OR EXISTS (
      SELECT 1
      FROM public.external_access_grants g
      WHERE g.principal_id = app.external_principal_id()
        AND g.organization_id = work_permits.organization_id
        AND g.portal_kind = 'contractor'
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND jsonb_exists(g.scopes, 'ext.safety.report')
        AND (
          g.project_id = work_permits.project_id
          OR EXISTS (
            SELECT 1 FROM public.subcontract_agreements a
            WHERE a.organization_id = g.organization_id
              AND a.vendor_id = g.vendor_id
              AND a.project_id = work_permits.project_id
              AND a.status <> 'cancelled'
              AND a.archived_at IS NULL
              AND (g.subcontract_agreement_id IS NULL OR g.subcontract_agreement_id = a.id)
          )
        )
    )
  );

DROP POLICY IF EXISTS work_permits_insert ON public.work_permits;
CREATE POLICY work_permits_insert ON public.work_permits
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'safety.manage')
    AND status = 'draft'
    AND requested_by_user_id = app.current_user_id()
    AND decided_by_user_id IS NULL
  );

DROP POLICY IF EXISTS work_permits_update ON public.work_permits;
CREATE POLICY work_permits_update ON public.work_permits
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'safety.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'safety.manage')
    AND (
      status IN ('draft', 'submitted', 'closed')
      OR (
        status IN ('approved', 'rejected')
        AND decided_by_user_id = app.current_user_id()
      )
    )
  );

DROP POLICY IF EXISTS work_permits_delete ON public.work_permits;
CREATE POLICY work_permits_delete ON public.work_permits
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.can_access_project(organization_id, project_id)
    AND app.has_org_permission(organization_id, 'safety.manage')
    AND status = 'draft'
  );

DROP POLICY IF EXISTS work_permits_service_all ON public.work_permits;
CREATE POLICY work_permits_service_all ON public.work_permits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.whatsapp_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  external_message_id text NOT NULL,
  from_phone text,
  status text NOT NULL DEFAULT 'rejected',
  capture_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_inbound_events_message_uq UNIQUE (organization_id, external_message_id),
  CONSTRAINT whatsapp_inbound_events_status_known CHECK (
    status IN ('rejected', 'drafted', 'duplicate')
  )
);

ALTER TABLE public.whatsapp_inbound_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_inbound_events FORCE ROW LEVEL SECURITY;

-- Phone numbers are not readable by every member. The webhook writes as service_role.
DROP POLICY IF EXISTS whatsapp_inbound_events_member ON public.whatsapp_inbound_events;
DROP POLICY IF EXISTS whatsapp_inbound_events_select ON public.whatsapp_inbound_events;
CREATE POLICY whatsapp_inbound_events_select ON public.whatsapp_inbound_events
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS whatsapp_inbound_events_service_all ON public.whatsapp_inbound_events;
CREATE POLICY whatsapp_inbound_events_service_all ON public.whatsapp_inbound_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.notification_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_log_dedupe_uq UNIQUE (organization_id, dedupe_key, recipient_email),
  CONSTRAINT notification_email_log_status_known CHECK (status IN ('sent', 'skipped', 'failed'))
);

ALTER TABLE public.notification_email_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_log FORCE ROW LEVEL SECURITY;

-- Recipient addresses stay with settings managers. Sends use service_role.
DROP POLICY IF EXISTS notification_email_log_member ON public.notification_email_log;
DROP POLICY IF EXISTS notification_email_log_select ON public.notification_email_log;
CREATE POLICY notification_email_log_select ON public.notification_email_log
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'settings.manage')
  );

DROP POLICY IF EXISTS notification_email_log_service_all ON public.notification_email_log;
CREATE POLICY notification_email_log_service_all ON public.notification_email_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawing_sheet_marks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_risks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.supplier_rfq_access_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_permits TO authenticated;
GRANT SELECT ON public.whatsapp_inbound_events TO authenticated;
GRANT SELECT ON public.notification_email_log TO authenticated;

GRANT ALL ON public.drawing_sheet_marks TO service_role;
GRANT ALL ON public.project_risks TO service_role;
GRANT ALL ON public.supplier_rfq_access_tokens TO service_role;
GRANT ALL ON public.work_permits TO service_role;
GRANT ALL ON public.whatsapp_inbound_events TO service_role;
GRANT ALL ON public.notification_email_log TO service_role;
