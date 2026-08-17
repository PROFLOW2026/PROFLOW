-- 0057_communications_calendar
-- Additive only. Does NOT modify 0000–0056.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Outbound communications (never "sent" without provider confirmation)
-- and native calendar events. External calendar connections live on the
-- single organization_integrations foundation in 0058 — this file does not
-- create a second connection table.
-- Reuses EmailPort. No live Google/Microsoft auth in this execution.

--------------------------------------------------------------------------------
-- Communications
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.outbound_communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  related_entity_type text NOT NULL,
  related_entity_id uuid,
  project_id uuid,
  client_id uuid,
  vendor_id uuid,
  recipient_email text NOT NULL,
  recipient_name text,
  subject text NOT NULL,
  body_text text NOT NULL,
  body_html text,
  status text NOT NULL DEFAULT 'draft',
  provider_key text,
  provider_message_id text,
  last_error text,
  sent_at timestamptz,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_communications_status_known CHECK (
    status IN ('draft', 'queued', 'sending', 'sent', 'failed', 'cancelled')
  ),
  CONSTRAINT outbound_communications_sent_requires_provider CHECK (
    status <> 'sent' OR (
      provider_message_id IS NOT NULL AND length(btrim(provider_message_id)) > 0
      AND provider_key IS NOT NULL AND length(btrim(provider_key)) > 0
      AND sent_at IS NOT NULL
    )
  ),
  CONSTRAINT outbound_communications_provider_key_nonblank CHECK (
    provider_key IS NULL OR length(btrim(provider_key)) > 0
  ),
  CONSTRAINT outbound_communications_provider_id_nonblank CHECK (
    provider_message_id IS NULL OR length(btrim(provider_message_id)) > 0
  ),
  CONSTRAINT outbound_communications_entity_known CHECK (
    related_entity_type IN (
      'quote', 'purchase_order', 'report', 'project_summary', 'billing_record',
      'payment_reminder', 'vendor', 'closeout', 'warranty', 'other'
    )
  ),
  CONSTRAINT outbound_communications_recipient_nonblank CHECK (length(btrim(recipient_email)) > 0),
  CONSTRAINT outbound_communications_subject_nonblank CHECK (length(btrim(subject)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_communications_id_organization_id_uq
  ON public.outbound_communications (id, organization_id);
CREATE INDEX IF NOT EXISTS outbound_communications_org_status_idx
  ON public.outbound_communications (organization_id, status);
CREATE INDEX IF NOT EXISTS outbound_communications_org_entity_idx
  ON public.outbound_communications (organization_id, related_entity_type, related_entity_id);

ALTER TABLE public.outbound_communications
  DROP CONSTRAINT IF EXISTS outbound_communications_project_org_fk;
ALTER TABLE public.outbound_communications
  ADD CONSTRAINT outbound_communications_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE SET NULL (project_id);

ALTER TABLE public.outbound_communications
  DROP CONSTRAINT IF EXISTS outbound_communications_client_org_fk;
ALTER TABLE public.outbound_communications
  ADD CONSTRAINT outbound_communications_client_org_fk
  FOREIGN KEY (client_id, organization_id)
  REFERENCES public.clients (id, organization_id)
  ON DELETE SET NULL (client_id);

ALTER TABLE public.outbound_communications
  DROP CONSTRAINT IF EXISTS outbound_communications_vendor_org_fk;
ALTER TABLE public.outbound_communications
  ADD CONSTRAINT outbound_communications_vendor_org_fk
  FOREIGN KEY (vendor_id, organization_id)
  REFERENCES public.vendors (id, organization_id)
  ON DELETE SET NULL (vendor_id);

CREATE TABLE IF NOT EXISTS public.outbound_communication_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  communication_id uuid NOT NULL,
  result text NOT NULL,
  provider_message_id text,
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outbound_communication_attempts_result_known CHECK (
    result IN ('not_configured', 'failed', 'delivered')
  ),
  CONSTRAINT outbound_communication_attempts_delivered_id CHECK (
    result <> 'delivered' OR (
      provider_message_id IS NOT NULL AND length(btrim(provider_message_id)) > 0
    )
  ),
  CONSTRAINT outbound_communication_attempts_provider_id_nonblank CHECK (
    provider_message_id IS NULL OR length(btrim(provider_message_id)) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_communication_attempts_id_org_uq
  ON public.outbound_communication_attempts (id, organization_id);
CREATE INDEX IF NOT EXISTS outbound_communication_attempts_comm_idx
  ON public.outbound_communication_attempts (organization_id, communication_id);

ALTER TABLE public.outbound_communication_attempts
  DROP CONSTRAINT IF EXISTS outbound_communication_attempts_comm_org_fk;
ALTER TABLE public.outbound_communication_attempts
  ADD CONSTRAINT outbound_communication_attempts_comm_org_fk
  FOREIGN KEY (communication_id, organization_id)
  REFERENCES public.outbound_communications (id, organization_id)
  ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS public.outbound_communication_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  communication_id uuid NOT NULL,
  document_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS outbound_communication_attachments_id_org_uq
  ON public.outbound_communication_attachments (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_communication_attachments_doc_uq
  ON public.outbound_communication_attachments (organization_id, communication_id, document_id);

ALTER TABLE public.outbound_communication_attachments
  DROP CONSTRAINT IF EXISTS outbound_communication_attachments_comm_org_fk;
ALTER TABLE public.outbound_communication_attachments
  ADD CONSTRAINT outbound_communication_attachments_comm_org_fk
  FOREIGN KEY (communication_id, organization_id)
  REFERENCES public.outbound_communications (id, organization_id)
  ON DELETE CASCADE;

ALTER TABLE public.outbound_communication_attachments
  DROP CONSTRAINT IF EXISTS outbound_communication_attachments_doc_org_fk;
ALTER TABLE public.outbound_communication_attachments
  ADD CONSTRAINT outbound_communication_attachments_doc_org_fk
  FOREIGN KEY (document_id, organization_id)
  REFERENCES public.documents (id, organization_id)
  ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- Calendar (native events only — no duplicate provider connection table)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  title text NOT NULL,
  notes text,
  event_kind text NOT NULL DEFAULT 'meeting',
  event_date date NOT NULL,
  starts_at timestamptz,
  ends_at timestamptz,
  all_day boolean NOT NULL DEFAULT true,
  project_id uuid,
  client_id uuid,
  employee_id uuid,
  related_entity_type text,
  related_entity_id uuid,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT calendar_events_kind_known CHECK (
    event_kind IN ('meeting', 'site_visit', 'other')
  ),
  CONSTRAINT calendar_events_related_type_known CHECK (
    related_entity_type IS NULL OR related_entity_type IN (
      'quote', 'purchase_order', 'report', 'project_summary', 'billing_record',
      'payment_reminder', 'vendor', 'closeout', 'warranty', 'other',
      'meeting', 'site_visit', 'project'
    )
  ),
  CONSTRAINT calendar_events_title_nonblank CHECK (length(btrim(title)) > 0),
  CONSTRAINT calendar_events_time_order CHECK (
    ends_at IS NULL OR starts_at IS NULL OR ends_at >= starts_at
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS calendar_events_id_organization_id_uq
  ON public.calendar_events (id, organization_id);
CREATE INDEX IF NOT EXISTS calendar_events_org_date_idx
  ON public.calendar_events (organization_id, event_date);
CREATE INDEX IF NOT EXISTS calendar_events_org_project_idx
  ON public.calendar_events (organization_id, project_id);

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_project_org_fk;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id)
  ON DELETE SET NULL (project_id);

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_client_org_fk;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_client_org_fk
  FOREIGN KEY (client_id, organization_id)
  REFERENCES public.clients (id, organization_id)
  ON DELETE SET NULL (client_id);

ALTER TABLE public.calendar_events
  DROP CONSTRAINT IF EXISTS calendar_events_employee_org_fk;
ALTER TABLE public.calendar_events
  ADD CONSTRAINT calendar_events_employee_org_fk
  FOREIGN KEY (employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE SET NULL (employee_id);

--------------------------------------------------------------------------------
-- Sent communication is truthful and immutable
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.next_gen_related_project_id(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid
) RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
  v_known boolean;
BEGIN
  v_known := p_entity_type IN (
    'quote', 'purchase_order', 'report', 'project_summary', 'billing_record',
    'payment_reminder', 'vendor', 'closeout', 'warranty', 'other',
    'meeting', 'site_visit', 'project'
  );

  IF p_entity_type IS NULL THEN
    IF p_entity_id IS NULL THEN
      RETURN NULL;
    END IF;
    RAISE EXCEPTION 'related entity: type is required when related_entity_id is set'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT v_known THEN
    RAISE EXCEPTION 'related entity: unknown type'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_entity_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF p_entity_type = 'quote' THEN
    SELECT project_id INTO v_project
    FROM public.quotes
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: quote missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type = 'purchase_order' THEN
    SELECT project_id INTO v_project
    FROM public.purchase_orders
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: purchase order missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type IN ('billing_record', 'payment_reminder') THEN
    SELECT project_id INTO v_project
    FROM public.billing_records
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: billing record missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type IN ('project_summary', 'project') THEN
    SELECT id INTO v_project
    FROM public.projects
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: project missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type = 'closeout' THEN
    SELECT project_id INTO v_project
    FROM public.project_closeouts
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: closeout missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type = 'warranty' THEN
    SELECT project_id INTO v_project
    FROM public.warranty_coverages
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN
      RETURN v_project;
    END IF;
    SELECT project_id INTO v_project
    FROM public.warranty_issues
    WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'related entity: warranty missing in organization'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN v_project;
  END IF;

  IF p_entity_type IN ('vendor', 'report', 'other', 'meeting', 'site_visit')
     OR p_entity_type IS NULL THEN
    SELECT project_id INTO v_project FROM public.quotes
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT project_id INTO v_project FROM public.purchase_orders
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT project_id INTO v_project FROM public.billing_records
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT project_id INTO v_project FROM public.project_closeouts
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT project_id INTO v_project FROM public.warranty_coverages
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT project_id INTO v_project FROM public.warranty_issues
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    SELECT id INTO v_project FROM public.projects
      WHERE id = p_entity_id AND organization_id = p_organization_id;
    IF FOUND THEN RETURN v_project; END IF;
    RETURN NULL;
  END IF;

  RAISE EXCEPTION 'related entity: unknown type'
    USING ERRCODE = 'check_violation';
END;
$fn$;

REVOKE ALL ON FUNCTION app.next_gen_related_project_id(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.next_gen_related_project_id(uuid, text, uuid) FROM authenticated;
REVOKE ALL ON FUNCTION app.next_gen_related_project_id(uuid, text, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION app.next_gen_related_project_id(uuid, text, uuid) TO service_role;

CREATE OR REPLACE FUNCTION app.next_gen_related_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  v_project := app.next_gen_related_project_id(
    NEW.organization_id,
    NEW.related_entity_type,
    NEW.related_entity_id
  );
  IF v_project IS NOT NULL AND NEW.project_id IS DISTINCT FROM v_project THEN
    RAISE EXCEPTION 'related entity: project_id must match the related record project'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION app.next_gen_related_scope_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.next_gen_related_scope_guard() TO service_role;

CREATE OR REPLACE FUNCTION app.user_can_read_document(p_organization_id uuid, p_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
    AND app.has_org_permission(p_organization_id, 'documents.read')
    AND EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = p_document_id AND d.organization_id = p_organization_id
    )
    AND app.document_visible_to_current_user(p_organization_id, p_document_id);
$fn$;

REVOKE ALL ON FUNCTION app.user_can_read_document(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.user_can_read_document(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.outbound_communications_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_delivery boolean;
BEGIN
  v_delivery := app.next_gen_latch_held('outbound_delivery');

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('sent', 'sending') THEN
      RAISE EXCEPTION 'outbound_communications: tenant insert cannot start sent or sending'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IS DISTINCT FROM 'draft' AND NEW.status IS DISTINCT FROM 'queued' THEN
      RAISE EXCEPTION 'outbound_communications: new rows must start draft or queued'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.provider_key IS NOT NULL
       OR NEW.provider_message_id IS NOT NULL
       OR NEW.sent_at IS NOT NULL THEN
      RAISE EXCEPTION 'outbound_communications: provider identity must be empty on insert'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'outbound_communications: identity history cannot be rewritten'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    IF NOT v_delivery THEN
      RAISE EXCEPTION 'outbound_communications: sent requires confirmed provider delivery'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status IS DISTINCT FROM 'sending' THEN
      RAISE EXCEPTION 'outbound_communications: sent requires an in-flight send'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.provider_key IS NULL OR length(btrim(NEW.provider_key)) = 0
       OR NEW.provider_message_id IS NULL OR length(btrim(NEW.provider_message_id)) = 0
       OR NEW.sent_at IS NULL THEN
      RAISE EXCEPTION 'outbound_communications: sent requires provider identity, message id, and sent_at'
        USING ERRCODE = 'check_violation';
    END IF;
    NEW.sent_at := clock_timestamp();
  END IF;

  IF OLD.status IN ('sending', 'sent') THEN
    IF NEW.recipient_email IS DISTINCT FROM OLD.recipient_email
       OR NEW.recipient_name IS DISTINCT FROM OLD.recipient_name
       OR NEW.subject IS DISTINCT FROM OLD.subject
       OR NEW.body_text IS DISTINCT FROM OLD.body_text
       OR NEW.body_html IS DISTINCT FROM OLD.body_html
       OR NEW.related_entity_type IS DISTINCT FROM OLD.related_entity_type
       OR NEW.related_entity_id IS DISTINCT FROM OLD.related_entity_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id THEN
      RAISE EXCEPTION 'outbound_communications: in-flight and sent content cannot be rewritten'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'sent' THEN
    IF NEW.status IS DISTINCT FROM 'sent'
       OR NEW.provider_key IS DISTINCT FROM OLD.provider_key
       OR NEW.provider_message_id IS DISTINCT FROM OLD.provider_message_id
       OR NEW.sent_at IS DISTINCT FROM OLD.sent_at THEN
      RAISE EXCEPTION 'outbound_communications: sent history cannot be rewritten'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF OLD.status = 'sending' AND NEW.status IS DISTINCT FROM 'sending' THEN
    IF NEW.status = 'sent' AND NOT v_delivery THEN
      RAISE EXCEPTION 'outbound_communications: sent requires confirmed provider delivery'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status NOT IN ('sent', 'failed', 'draft') THEN
      RAISE EXCEPTION 'outbound_communications: invalid send outcome'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.status IN ('failed', 'draft') AND NOT v_delivery THEN
      RAISE EXCEPTION 'outbound_communications: send failure is recorded by the trusted path'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF NEW.status = 'sending' AND OLD.status IS DISTINCT FROM 'sending' THEN
    IF NOT app.next_gen_latch_held('outbound_request') THEN
      RAISE EXCEPTION 'outbound_communications: send must be requested through the trusted path'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF OLD.status NOT IN ('draft', 'queued', 'failed') THEN
      RAISE EXCEPTION 'outbound_communications: invalid send request'
        USING ERRCODE = 'restrict_violation';
    END IF;
    NEW.provider_key := NULL;
    NEW.provider_message_id := NULL;
    NEW.sent_at := NULL;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS outbound_communications_lifecycle_guard ON public.outbound_communications;
CREATE TRIGGER outbound_communications_lifecycle_guard
  BEFORE INSERT OR UPDATE ON public.outbound_communications
  FOR EACH ROW
  EXECUTE FUNCTION app.outbound_communications_lifecycle_guard();

REVOKE ALL ON FUNCTION app.outbound_communications_lifecycle_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbound_communications_lifecycle_guard() TO service_role;

CREATE OR REPLACE FUNCTION app.outbound_communications_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row_security text;
BEGIN
  IF OLD.status IN ('sent', 'sending') THEN
    RAISE EXCEPTION 'outbound_communications: sent and sending messages cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  v_row_security := current_setting('row_security', true);
  PERFORM set_config('row_security', 'off', true);
  IF EXISTS (
    SELECT 1 FROM public.outbound_communication_attempts a
    WHERE a.communication_id = OLD.id
      AND a.organization_id = OLD.organization_id
  ) THEN
    PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
    RAISE EXCEPTION 'outbound_communications: provider history cannot be erased'
      USING ERRCODE = 'restrict_violation';
  END IF;
  PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS outbound_communications_delete_guard ON public.outbound_communications;
CREATE TRIGGER outbound_communications_delete_guard
  BEFORE DELETE ON public.outbound_communications
  FOR EACH ROW
  EXECUTE FUNCTION app.outbound_communications_delete_guard();

REVOKE ALL ON FUNCTION app.outbound_communications_delete_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbound_communications_delete_guard() TO service_role;

DROP TRIGGER IF EXISTS outbound_communications_related_scope ON public.outbound_communications;
CREATE TRIGGER outbound_communications_related_scope
  BEFORE INSERT OR UPDATE OF related_entity_type, related_entity_id, project_id, organization_id
  ON public.outbound_communications
  FOR EACH ROW
  EXECUTE FUNCTION app.next_gen_related_scope_guard();

DROP TRIGGER IF EXISTS calendar_events_related_scope ON public.calendar_events;
CREATE TRIGGER calendar_events_related_scope
  BEFORE INSERT OR UPDATE OF related_entity_type, related_entity_id, project_id, organization_id
  ON public.calendar_events
  FOR EACH ROW
  EXECUTE FUNCTION app.next_gen_related_scope_guard();

-- Class B tenant RPC: request in-flight send. Final SENT stays service-only.
CREATE OR REPLACE FUNCTION app.request_outbound_communication_send(
  p_organization_id uuid,
  p_communication_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_project uuid;
  v_status text;
BEGIN
  IF NOT app.is_org_member(p_organization_id)
     OR NOT app.has_org_permission(p_organization_id, 'communications.manage') THEN
    RAISE EXCEPTION 'outbound_communications: send request denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT id, project_id, status INTO v_id, v_project, v_status
  FROM public.outbound_communications
  WHERE id = p_communication_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'outbound_communications: missing'
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_project IS NOT NULL AND NOT app.can_access_project(p_organization_id, v_project) THEN
    RAISE EXCEPTION 'outbound_communications: send request denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_status NOT IN ('draft', 'queued', 'failed') THEN
    RAISE EXCEPTION 'outbound_communications: this message cannot be sent'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.outbound_communication_attachments a
    WHERE a.communication_id = v_id
      AND a.organization_id = p_organization_id
      AND NOT app.user_can_read_document(p_organization_id, a.document_id)
  ) THEN
    RAISE EXCEPTION 'outbound_communications: an attachment is no longer accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM app.next_gen_latch_acquire('outbound_request');
  BEGIN
    UPDATE public.outbound_communications
    SET status = 'sending', last_error = NULL, updated_at = clock_timestamp()
    WHERE id = v_id AND organization_id = p_organization_id;
    PERFORM app.next_gen_latch_release('outbound_request');
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('outbound_request');
    RAISE;
  END;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.request_outbound_communication_send(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.request_outbound_communication_send(uuid, uuid)
  TO authenticated, service_role;

-- Class B service-only: provider confirmation. Not a tenant RPC.
CREATE OR REPLACE FUNCTION app.confirm_outbound_communication_delivery(
  p_organization_id uuid,
  p_communication_id uuid,
  p_provider_key text,
  p_provider_message_id text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_provider_key IS NULL OR length(btrim(p_provider_key)) = 0
     OR p_provider_message_id IS NULL OR length(btrim(p_provider_message_id)) = 0 THEN
    RAISE EXCEPTION 'outbound_communications: delivery confirmation requires provider identity and message id'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.next_gen_latch_acquire('outbound_delivery');
  BEGIN
    UPDATE public.outbound_communications
    SET
      status = 'sent',
      provider_key = btrim(p_provider_key),
      provider_message_id = btrim(p_provider_message_id),
      sent_at = clock_timestamp(),
      last_error = NULL,
      updated_at = clock_timestamp()
    WHERE id = p_communication_id
      AND organization_id = p_organization_id
      AND status = 'sending'
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'outbound_communications: delivery confirmation target is missing or already sent'
        USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO public.outbound_communication_attempts (
      organization_id, communication_id, result, provider_message_id
    ) VALUES (
      p_organization_id, v_id, 'delivered', btrim(p_provider_message_id)
    );

    PERFORM app.next_gen_latch_release('outbound_delivery');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('outbound_delivery');
    RAISE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.confirm_outbound_communication_delivery(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.confirm_outbound_communication_delivery(uuid, uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION app.confirm_outbound_communication_delivery(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION app.confirm_outbound_communication_delivery(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION app.record_outbound_communication_failure(
  p_organization_id uuid,
  p_communication_id uuid,
  p_result text,
  p_error text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_result IS NULL OR p_result NOT IN ('failed', 'not_configured') THEN
    RAISE EXCEPTION 'outbound_communications: failure result is invalid'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM app.next_gen_latch_acquire('outbound_delivery');
  BEGIN
    UPDATE public.outbound_communications
    SET
      status = 'failed',
      provider_key = NULL,
      provider_message_id = NULL,
      sent_at = NULL,
      last_error = p_error,
      updated_at = clock_timestamp()
    WHERE id = p_communication_id
      AND organization_id = p_organization_id
      AND status = 'sending'
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'outbound_communications: failure target is missing or not sending'
        USING ERRCODE = 'no_data_found';
    END IF;

    INSERT INTO public.outbound_communication_attempts (
      organization_id, communication_id, result, error_message
    ) VALUES (
      p_organization_id, v_id, p_result, p_error
    );

    PERFORM app.next_gen_latch_release('outbound_delivery');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('outbound_delivery');
    RAISE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.record_outbound_communication_failure(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_outbound_communication_failure(uuid, uuid, text, text) FROM authenticated;
REVOKE ALL ON FUNCTION app.record_outbound_communication_failure(uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION app.record_outbound_communication_failure(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION app.outbound_communication_attempts_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT app.next_gen_latch_held('outbound_delivery') THEN
    RAISE EXCEPTION 'outbound_communication_attempts: provider attempts are trusted history'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS outbound_communication_attempts_guard ON public.outbound_communication_attempts;
CREATE TRIGGER outbound_communication_attempts_guard
  BEFORE INSERT ON public.outbound_communication_attempts
  FOR EACH ROW
  EXECUTE FUNCTION app.outbound_communication_attempts_guard();

DROP TRIGGER IF EXISTS outbound_communication_attempts_append_only ON public.outbound_communication_attempts;
CREATE TRIGGER outbound_communication_attempts_append_only
  BEFORE UPDATE OR DELETE ON public.outbound_communication_attempts
  FOR EACH ROW
  EXECUTE FUNCTION app.append_only_guard();

REVOKE ALL ON FUNCTION app.outbound_communication_attempts_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbound_communication_attempts_guard() TO service_role;

CREATE OR REPLACE FUNCTION app.outbound_communication_attachments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_old_status text;
  v_new_status text;
  v_row_security text;
BEGIN
  v_row_security := current_setting('row_security', true);
  IF TG_OP = 'DELETE' THEN
    PERFORM set_config('row_security', 'off', true);
    SELECT status INTO v_old_status
    FROM public.outbound_communications
    WHERE id = OLD.communication_id
      AND organization_id = OLD.organization_id;
    PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
    IF v_old_status IN ('sent', 'sending') THEN
      RAISE EXCEPTION 'outbound_communication_attachments: locked attachments cannot be changed'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.communication_id IS DISTINCT FROM OLD.communication_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
      RAISE EXCEPTION 'outbound_communication_attachments: identity cannot be reparented'
        USING ERRCODE = 'restrict_violation';
    END IF;
    PERFORM set_config('row_security', 'off', true);
    SELECT status INTO v_old_status
    FROM public.outbound_communications
    WHERE id = OLD.communication_id
      AND organization_id = OLD.organization_id;
    PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
    IF v_old_status IN ('sent', 'sending') THEN
      RAISE EXCEPTION 'outbound_communication_attachments: locked attachments cannot be changed'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  PERFORM set_config('row_security', 'off', true);
  SELECT status INTO v_new_status
  FROM public.outbound_communications
  WHERE id = NEW.communication_id
    AND organization_id = NEW.organization_id;
  PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
  IF v_new_status IN ('sent', 'sending') THEN
    RAISE EXCEPTION 'outbound_communication_attachments: locked attachments cannot be changed'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT app.user_can_read_document(NEW.organization_id, NEW.document_id) THEN
    RAISE EXCEPTION 'outbound_communication_attachments: document is not accessible'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS outbound_communication_attachments_guard ON public.outbound_communication_attachments;
CREATE TRIGGER outbound_communication_attachments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.outbound_communication_attachments
  FOR EACH ROW
  EXECUTE FUNCTION app.outbound_communication_attachments_guard();

REVOKE ALL ON FUNCTION app.outbound_communication_attachments_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.outbound_communication_attachments_guard() TO service_role;

--------------------------------------------------------------------------------
-- Document owner access for communications / calendar
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.can_access_next_gen_document_owner(
  p_organization_id uuid,
  p_owner_type text,
  p_owner_id uuid
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF p_owner_type = 'warranty_coverage' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_coverages w
      WHERE w.id = p_owner_id
        AND w.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, w.project_id)
    );
  END IF;
  IF p_owner_type = 'warranty_issue' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.warranty_issues i
      WHERE i.id = p_owner_id
        AND i.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, i.project_id)
    );
  END IF;
  IF p_owner_type = 'closeout' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.project_closeouts c
      WHERE c.id = p_owner_id
        AND c.organization_id = p_organization_id
        AND app.can_access_project(p_organization_id, c.project_id)
    );
  END IF;
  IF p_owner_type = 'outbound_communication' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.outbound_communications o
      WHERE o.id = p_owner_id
        AND o.organization_id = p_organization_id
        AND app.has_org_permission(p_organization_id, 'communications.read')
        AND o.project_id IS NOT NULL
        AND app.can_access_project(p_organization_id, o.project_id)
    );
  END IF;
  IF p_owner_type = 'calendar_event' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.calendar_events e
      WHERE e.id = p_owner_id
        AND e.organization_id = p_organization_id
        AND app.has_org_permission(p_organization_id, 'scheduling.read')
        AND e.project_id IS NOT NULL
        AND app.can_access_project(p_organization_id, e.project_id)
    );
  END IF;
  RETURN false;
END;
$fn$;

REVOKE ALL ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.can_access_next_gen_document_owner(uuid, text, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls(
  'outbound_communications', 'communications.read', 'communications.manage', 'project_id'
);
SELECT app.install_org_parent_table_rls(
  'outbound_communication_attempts',
  'outbound_communications',
  'communication_id',
  'communications.read',
  'communications.manage',
  'project_id'
);
SELECT app.install_org_parent_table_rls(
  'outbound_communication_attachments',
  'outbound_communications',
  'communication_id',
  'communications.read',
  'communications.manage',
  'project_id'
);
SELECT app.install_org_table_rls(
  'calendar_events', 'scheduling.read', 'scheduling.manage', 'project_id'
);

DROP POLICY IF EXISTS outbound_communication_attempts_tenant_insert ON public.outbound_communication_attempts;
CREATE POLICY outbound_communication_attempts_tenant_insert ON public.outbound_communication_attempts
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS outbound_communication_attempts_tenant_update ON public.outbound_communication_attempts;
CREATE POLICY outbound_communication_attempts_tenant_update ON public.outbound_communication_attempts
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS outbound_communication_attempts_tenant_delete ON public.outbound_communication_attempts;
CREATE POLICY outbound_communication_attempts_tenant_delete ON public.outbound_communication_attempts
  FOR DELETE TO authenticated
  USING (false);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_communications TO authenticated;
GRANT SELECT ON public.outbound_communication_attempts TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.outbound_communication_attempts FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.outbound_communication_attachments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.calendar_events TO authenticated;
