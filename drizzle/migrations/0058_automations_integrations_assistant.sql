-- 0058_automations_integrations_assistant
-- Additive only. Does NOT modify 0000–0057.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Business automation presets (safe actions only).
-- Single provider-agnostic integration foundation (never connected here).
-- Assistant conversations + unconfigured model provider boundary.
-- Credential refs are service-only. No calendar/assistant duplicate connection tables.
-- No live accounting APIs. No statutory invoice issuance. No dummy secrets.

--------------------------------------------------------------------------------
-- Automations
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  preset_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_rules_preset_known CHECK (
    preset_key IN (
      'client_balance_overdue',
      'quote_no_followup',
      'vendor_bill_due',
      'timesheet_not_submitted',
      'timesheet_waiting_approval',
      'ocr_waiting_review',
      'forecast_over_budget',
      'forecast_margin_low',
      'warranty_expiring',
      'compliance_expiring',
      'asset_service_due',
      'retention_release_date',
      'closeout_has_blockers'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_rules_id_organization_id_uq
  ON public.automation_rules (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS automation_rules_org_preset_uq
  ON public.automation_rules (organization_id, preset_key);
CREATE INDEX IF NOT EXISTS automation_rules_org_enabled_idx
  ON public.automation_rules (organization_id, enabled);

CREATE TABLE IF NOT EXISTS public.automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  rule_id uuid NOT NULL,
  status text NOT NULL,
  actions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  access_scope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  ran_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT automation_runs_status_known CHECK (
    status IN ('ok', 'skipped', 'failed')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS automation_runs_id_organization_id_uq
  ON public.automation_runs (id, organization_id);
CREATE INDEX IF NOT EXISTS automation_runs_org_rule_idx
  ON public.automation_runs (organization_id, rule_id, ran_at);

ALTER TABLE public.automation_runs
  DROP CONSTRAINT IF EXISTS automation_runs_rule_org_fk;
ALTER TABLE public.automation_runs
  ADD CONSTRAINT automation_runs_rule_org_fk
  FOREIGN KEY (rule_id, organization_id)
  REFERENCES public.automation_rules (id, organization_id)
  ON DELETE CASCADE;

DROP TRIGGER IF EXISTS automation_runs_append_only ON public.automation_runs;
CREATE TRIGGER automation_runs_append_only
  BEFORE UPDATE OR DELETE ON public.automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.append_only_guard();

CREATE OR REPLACE FUNCTION app.automation_runs_insert_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NOT app.next_gen_latch_held('automation_run') THEN
    RAISE EXCEPTION 'automation_runs: execution history is trusted-writer only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS automation_runs_insert_guard ON public.automation_runs;
CREATE TRIGGER automation_runs_insert_guard
  BEFORE INSERT ON public.automation_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.automation_runs_insert_guard();

REVOKE ALL ON FUNCTION app.automation_runs_insert_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.automation_runs_insert_guard() TO service_role;

-- Class B service-only writer for automation execution history.
DROP FUNCTION IF EXISTS app.record_automation_run(uuid, uuid, text, jsonb, text);

CREATE OR REPLACE FUNCTION app.record_automation_run(
  p_organization_id uuid,
  p_rule_id uuid,
  p_status text,
  p_actions jsonb,
  p_error text,
  p_access_scope jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('ok', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'automation_runs: status is invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  PERFORM app.next_gen_latch_acquire('automation_run');
  BEGIN
    INSERT INTO public.automation_runs (
      organization_id, rule_id, status, actions_json, error_message, access_scope_json
    ) VALUES (
      p_organization_id,
      p_rule_id,
      p_status,
      COALESCE(p_actions, '[]'::jsonb),
      p_error,
      COALESCE(p_access_scope, '{}'::jsonb)
    )
    RETURNING id INTO v_id;
    PERFORM app.next_gen_latch_release('automation_run');
    RETURN v_id;
  EXCEPTION WHEN OTHERS THEN
    PERFORM app.next_gen_latch_release('automation_run');
    RAISE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION app.record_automation_run(uuid, uuid, text, jsonb, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.record_automation_run(uuid, uuid, text, jsonb, text, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION app.record_automation_run(uuid, uuid, text, jsonb, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION app.record_automation_run(uuid, uuid, text, jsonb, text, jsonb) TO service_role;

--------------------------------------------------------------------------------
-- Generic integrations (single connection model — unconfigured only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.organization_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  provider_key text NOT NULL,
  integration_kind text NOT NULL,
  status text NOT NULL DEFAULT 'unconfigured',
  capabilities_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  sync_direction text NOT NULL DEFAULT 'none',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_integrations_kind_known CHECK (
    integration_kind IN ('accounting', 'calendar', 'email', 'assistant', 'other')
  ),
  CONSTRAINT organization_integrations_status_known CHECK (
    status IN ('unconfigured', 'disconnected', 'error')
  ),
  CONSTRAINT organization_integrations_direction_known CHECK (
    sync_direction IN ('none', 'export', 'import', 'bidirectional')
  ),
  CONSTRAINT organization_integrations_provider_not_local CHECK (
    provider_key NOT IN ('local', 'projectflow-local')
  ),
  CONSTRAINT organization_integrations_provider_nonblank CHECK (
    length(btrim(provider_key)) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS organization_integrations_id_org_uq
  ON public.organization_integrations (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS organization_integrations_org_provider_uq
  ON public.organization_integrations (organization_id, provider_key, integration_kind);

-- Service-only credential pointers. Never granted to authenticated / anon.
CREATE TABLE IF NOT EXISTS app.integration_credential_refs (
  organization_id uuid NOT NULL,
  integration_id uuid NOT NULL,
  credentials_ref text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (integration_id),
  CONSTRAINT integration_credential_refs_nonblank CHECK (length(btrim(credentials_ref)) > 0),
  CONSTRAINT integration_credential_refs_integration_fk
    FOREIGN KEY (integration_id, organization_id)
    REFERENCES public.organization_integrations (id, organization_id)
    ON DELETE CASCADE
);

ALTER TABLE app.integration_credential_refs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.integration_credential_refs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS integration_credential_refs_service_all ON app.integration_credential_refs;
CREATE POLICY integration_credential_refs_service_all ON app.integration_credential_refs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE app.integration_credential_refs FROM PUBLIC;
REVOKE ALL ON TABLE app.integration_credential_refs FROM anon;
REVOKE ALL ON TABLE app.integration_credential_refs FROM authenticated;
GRANT ALL ON TABLE app.integration_credential_refs TO service_role;

CREATE TABLE IF NOT EXISTS public.integration_entity_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  external_id text NOT NULL,
  external_number text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_entity_mappings_entity_known CHECK (
    entity_type IN (
      'client', 'vendor', 'billing_record', 'ap_bill',
      'payment', 'ar_payment', 'ap_payment', 'project'
    )
  ),
  CONSTRAINT integration_entity_mappings_external_nonblank CHECK (
    length(btrim(external_id)) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_entity_mappings_id_org_uq
  ON public.integration_entity_mappings (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS integration_entity_mappings_ext_uq
  ON public.integration_entity_mappings (organization_id, integration_id, entity_type, external_id);
CREATE UNIQUE INDEX IF NOT EXISTS integration_entity_mappings_local_uq
  ON public.integration_entity_mappings (organization_id, integration_id, entity_type, entity_id);

ALTER TABLE public.integration_entity_mappings
  DROP CONSTRAINT IF EXISTS integration_entity_mappings_integration_org_fk;
ALTER TABLE public.integration_entity_mappings
  ADD CONSTRAINT integration_entity_mappings_integration_org_fk
  FOREIGN KEY (integration_id, organization_id)
  REFERENCES public.organization_integrations (id, organization_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION app.integration_entity_mapping_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_ok boolean := false;
BEGIN
  IF NEW.entity_type = 'client' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.clients t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type = 'vendor' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.vendors t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type = 'billing_record' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.billing_records t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type = 'ap_bill' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ap_bills t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type IN ('payment', 'ar_payment') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.payments t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type = 'ap_payment' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ap_payments t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSIF NEW.entity_type = 'project' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.projects t
      WHERE t.id = NEW.entity_id AND t.organization_id = NEW.organization_id
    ) INTO v_ok;
  ELSE
    v_ok := false;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'integration_entity_mappings: entity_id must exist as % in the same organization', NEW.entity_type
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS integration_entity_mapping_guard ON public.integration_entity_mappings;
CREATE TRIGGER integration_entity_mapping_guard
  BEFORE INSERT OR UPDATE OF entity_type, entity_id, organization_id
  ON public.integration_entity_mappings
  FOR EACH ROW
  EXECUTE FUNCTION app.integration_entity_mapping_guard();

REVOKE ALL ON FUNCTION app.integration_entity_mapping_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.integration_entity_mapping_guard() TO service_role;

CREATE TABLE IF NOT EXISTS public.integration_sync_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  integration_id uuid NOT NULL,
  job_kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  error_message text,
  stats_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_sync_jobs_status_known CHECK (
    status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')
  ),
  CONSTRAINT integration_sync_jobs_job_kind_nonblank CHECK (length(btrim(job_kind)) > 0),
  CONSTRAINT integration_sync_jobs_state_consistent CHECK (
    (status = 'queued' AND started_at IS NULL AND finished_at IS NULL)
    OR (status = 'running' AND started_at IS NOT NULL AND finished_at IS NULL)
    OR (
      status IN ('succeeded', 'failed')
      AND started_at IS NOT NULL
      AND finished_at IS NOT NULL
      AND finished_at >= started_at
    )
    OR (
      status = 'cancelled'
      AND finished_at IS NOT NULL
      AND (started_at IS NULL OR finished_at >= started_at)
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS integration_sync_jobs_id_org_uq
  ON public.integration_sync_jobs (id, organization_id);
CREATE INDEX IF NOT EXISTS integration_sync_jobs_org_integration_idx
  ON public.integration_sync_jobs (organization_id, integration_id, created_at);

ALTER TABLE public.integration_sync_jobs
  DROP CONSTRAINT IF EXISTS integration_sync_jobs_integration_org_fk;
ALTER TABLE public.integration_sync_jobs
  ADD CONSTRAINT integration_sync_jobs_integration_org_fk
  FOREIGN KEY (integration_id, organization_id)
  REFERENCES public.organization_integrations (id, organization_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION app.integration_sync_jobs_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NOT app.next_gen_latch_held('integration_sync') THEN
      RAISE EXCEPTION 'integration_sync_jobs: execution history is trusted-writer only'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'integration_sync_jobs: run history cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT app.next_gen_latch_held('integration_sync') THEN
    RAISE EXCEPTION 'integration_sync_jobs: execution history is trusted-writer only'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.status IN ('succeeded', 'failed', 'cancelled') THEN
    RAISE EXCEPTION 'integration_sync_jobs: finished runs are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.integration_id IS DISTINCT FROM OLD.integration_id
     OR NEW.job_kind IS DISTINCT FROM OLD.job_kind THEN
    RAISE EXCEPTION 'integration_sync_jobs: identity is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS integration_sync_jobs_guard ON public.integration_sync_jobs;
CREATE TRIGGER integration_sync_jobs_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.integration_sync_jobs
  FOR EACH ROW
  EXECUTE FUNCTION app.integration_sync_jobs_guard();

REVOKE ALL ON FUNCTION app.integration_sync_jobs_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.integration_sync_jobs_guard() TO service_role;

--------------------------------------------------------------------------------
-- Assistant
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  title text,
  status text NOT NULL DEFAULT 'active',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_conversations_status_known CHECK (
    status IN ('active', 'archived')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_conversations_id_org_uq
  ON public.assistant_conversations (id, organization_id);
CREATE INDEX IF NOT EXISTS assistant_conversations_org_user_idx
  ON public.assistant_conversations (organization_id, user_id);

CREATE TABLE IF NOT EXISTS public.assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  role text NOT NULL,
  content text NOT NULL,
  citations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  access_scope_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assistant_messages_role_known CHECK (
    role IN ('user', 'assistant', 'system')
  ),
  CONSTRAINT assistant_messages_content_nonblank CHECK (length(btrim(content)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS assistant_messages_id_org_uq
  ON public.assistant_messages (id, organization_id);
CREATE INDEX IF NOT EXISTS assistant_messages_conversation_idx
  ON public.assistant_messages (organization_id, conversation_id);

ALTER TABLE public.assistant_messages
  DROP CONSTRAINT IF EXISTS assistant_messages_conversation_org_fk;
ALTER TABLE public.assistant_messages
  ADD CONSTRAINT assistant_messages_conversation_org_fk
  FOREIGN KEY (conversation_id, organization_id)
  REFERENCES public.assistant_conversations (id, organization_id)
  ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION app.assistant_message_still_permitted(
  p_organization_id uuid,
  p_access_scope jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_perm text;
  v_project uuid;
  v_document uuid;
BEGIN
  IF p_access_scope IS NULL OR p_access_scope = '{}'::jsonb THEN
    RETURN true;
  END IF;

  FOR v_perm IN
    SELECT jsonb_array_elements_text(COALESCE(p_access_scope->'permissions', '[]'::jsonb))
  LOOP
    IF v_perm IS NULL OR length(btrim(v_perm)) = 0 THEN
      CONTINUE;
    END IF;
    IF NOT app.has_org_permission(p_organization_id, v_perm) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOR v_project IN
    SELECT CAST(jsonb_array_elements_text(COALESCE(p_access_scope->'projectIds', '[]'::jsonb)) AS uuid)
  LOOP
    IF NOT app.can_access_project(p_organization_id, v_project) THEN
      RETURN false;
    END IF;
  END LOOP;

  FOR v_document IN
    SELECT CAST(jsonb_array_elements_text(COALESCE(p_access_scope->'documentIds', '[]'::jsonb)) AS uuid)
  LOOP
    IF NOT app.user_can_read_document(p_organization_id, v_document) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION app.assistant_message_still_permitted(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assistant_message_still_permitted(uuid, jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.insert_assistant_trusted_message(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_role text,
  p_content text,
  p_citations jsonb DEFAULT '[]'::jsonb,
  p_access_scope jsonb DEFAULT '{}'::jsonb
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
  v_scope jsonb;
BEGIN
  IF p_role IS NULL OR p_role NOT IN ('assistant', 'system') THEN
    RAISE EXCEPTION 'assistant_messages: trusted insert is limited to assistant/system'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_content IS NULL OR length(btrim(p_content)) = 0 THEN
    RAISE EXCEPTION 'assistant_messages: content is required'
      USING ERRCODE = 'check_violation';
  END IF;
  v_scope := COALESCE(p_access_scope, '{}'::jsonb);
  IF p_role = 'assistant'
     AND (
       jsonb_typeof(v_scope -> 'permissions') IS DISTINCT FROM 'array'
       OR jsonb_array_length(v_scope -> 'permissions') < 1
     ) THEN
    RAISE EXCEPTION 'assistant_messages: sensitive assistant answers require access_scope permissions'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assistant_conversations
    WHERE id = p_conversation_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'assistant_messages: conversation not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.assistant_messages (
    organization_id, conversation_id, role, content, citations_json, access_scope_json
  ) VALUES (
    p_organization_id,
    p_conversation_id,
    p_role,
    p_content,
    COALESCE(p_citations, '[]'::jsonb),
    v_scope
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.insert_assistant_trusted_message(uuid, uuid, text, text, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.insert_assistant_trusted_message(uuid, uuid, text, text, jsonb, jsonb) FROM authenticated;
REVOKE ALL ON FUNCTION app.insert_assistant_trusted_message(uuid, uuid, text, text, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION app.insert_assistant_trusted_message(uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION app.assistant_messages_scope_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.role = 'assistant'
     AND (
       jsonb_typeof(NEW.access_scope_json -> 'permissions') IS DISTINCT FROM 'array'
       OR jsonb_array_length(NEW.access_scope_json -> 'permissions') < 1
     ) THEN
    RAISE EXCEPTION 'assistant_messages: sensitive assistant answers require access_scope permissions'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS assistant_messages_scope_guard ON public.assistant_messages;
CREATE TRIGGER assistant_messages_scope_guard
  BEFORE INSERT ON public.assistant_messages
  FOR EACH ROW
  EXECUTE FUNCTION app.assistant_messages_scope_guard();

REVOKE ALL ON FUNCTION app.assistant_messages_scope_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assistant_messages_scope_guard() TO service_role;

--------------------------------------------------------------------------------
-- RLS
--------------------------------------------------------------------------------

SELECT app.install_org_table_rls('automation_rules', 'automations.read', 'automations.manage', NULL);
SELECT app.install_org_table_rls('automation_runs', 'automations.read', 'automations.manage', NULL);
SELECT app.install_org_table_rls(
  'organization_integrations', 'integrations.read', 'settings.manage', NULL
);
SELECT app.install_org_table_rls(
  'integration_entity_mappings', 'integrations.read', 'settings.manage', NULL
);
SELECT app.install_org_table_rls(
  'integration_sync_jobs', 'integrations.read', 'settings.manage', NULL
);

CREATE OR REPLACE FUNCTION app.automation_run_visible_to_current_user(
  p_organization_id uuid,
  p_access_scope jsonb
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_project uuid;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RETURN false;
  END IF;
  IF p_access_scope IS NULL OR p_access_scope = '{}'::jsonb THEN
    RETURN true;
  END IF;
  IF COALESCE(jsonb_typeof(p_access_scope->'projectIds'), 'null') IS DISTINCT FROM 'array'
     OR jsonb_array_length(COALESCE(p_access_scope->'projectIds', '[]'::jsonb)) = 0 THEN
    RETURN true;
  END IF;
  FOR v_project IN
    SELECT CAST(jsonb_array_elements_text(p_access_scope->'projectIds') AS uuid)
  LOOP
    IF NOT app.can_access_project(p_organization_id, v_project) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION app.automation_run_visible_to_current_user(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.automation_run_visible_to_current_user(uuid, jsonb)
  TO authenticated, service_role;

SELECT app.and_authenticated_policy_predicate(
  'automation_runs',
  'app.automation_run_visible_to_current_user(organization_id, access_scope_json)'
);

DROP POLICY IF EXISTS automation_runs_tenant_insert ON public.automation_runs;
CREATE POLICY automation_runs_tenant_insert ON public.automation_runs
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS automation_runs_tenant_update ON public.automation_runs;
CREATE POLICY automation_runs_tenant_update ON public.automation_runs
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS automation_runs_tenant_delete ON public.automation_runs;
CREATE POLICY automation_runs_tenant_delete ON public.automation_runs
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS integration_sync_jobs_tenant_insert ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_tenant_insert ON public.integration_sync_jobs
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS integration_sync_jobs_tenant_update ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_tenant_update ON public.integration_sync_jobs
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS integration_sync_jobs_tenant_delete ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_tenant_delete ON public.integration_sync_jobs
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS integration_sync_jobs_tenant_select ON public.integration_sync_jobs;
CREATE POLICY integration_sync_jobs_tenant_select ON public.integration_sync_jobs
  FOR SELECT TO authenticated
  USING (false);

DROP POLICY IF EXISTS integration_entity_mappings_tenant_select ON public.integration_entity_mappings;
CREATE POLICY integration_entity_mappings_tenant_select ON public.integration_entity_mappings
  FOR SELECT TO authenticated
  USING (false);
DROP POLICY IF EXISTS integration_entity_mappings_tenant_insert ON public.integration_entity_mappings;
CREATE POLICY integration_entity_mappings_tenant_insert ON public.integration_entity_mappings
  FOR INSERT TO authenticated
  WITH CHECK (false);
DROP POLICY IF EXISTS integration_entity_mappings_tenant_update ON public.integration_entity_mappings;
CREATE POLICY integration_entity_mappings_tenant_update ON public.integration_entity_mappings
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);
DROP POLICY IF EXISTS integration_entity_mappings_tenant_delete ON public.integration_entity_mappings;
CREATE POLICY integration_entity_mappings_tenant_delete ON public.integration_entity_mappings
  FOR DELETE TO authenticated
  USING (false);

-- Assistant conversations: org member + assistant.use + own rows only.
ALTER TABLE public.assistant_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_conversations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_conversations_tenant_select ON public.assistant_conversations;
CREATE POLICY assistant_conversations_tenant_select ON public.assistant_conversations
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS assistant_conversations_tenant_insert ON public.assistant_conversations;
CREATE POLICY assistant_conversations_tenant_insert ON public.assistant_conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS assistant_conversations_tenant_update ON public.assistant_conversations;
CREATE POLICY assistant_conversations_tenant_update ON public.assistant_conversations
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND user_id = app.current_user_id()
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND user_id = app.current_user_id()
  );

DROP POLICY IF EXISTS assistant_conversations_tenant_delete ON public.assistant_conversations;
CREATE POLICY assistant_conversations_tenant_delete ON public.assistant_conversations
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND user_id = app.current_user_id()
  );

CREATE OR REPLACE FUNCTION app.assistant_conversations_history_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_row_security text;
BEGIN
  IF current_setting('role', true) = 'authenticated' THEN
    v_row_security := current_setting('row_security', true);
    PERFORM set_config('row_security', 'off', true);
    IF EXISTS (
      SELECT 1 FROM public.assistant_messages m
      WHERE m.conversation_id = OLD.id
        AND m.organization_id = OLD.organization_id
        AND m.role IS DISTINCT FROM 'user'
    ) THEN
      PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
      RAISE EXCEPTION 'assistant_conversations: stored assistant answers cannot be erased'
        USING ERRCODE = 'restrict_violation';
    END IF;
    PERFORM set_config('row_security', COALESCE(v_row_security, 'on'), true);
  END IF;
  RETURN OLD;
END;
$fn$;

DROP TRIGGER IF EXISTS assistant_conversations_history_delete_guard ON public.assistant_conversations;
CREATE TRIGGER assistant_conversations_history_delete_guard
  BEFORE DELETE ON public.assistant_conversations
  FOR EACH ROW
  EXECUTE FUNCTION app.assistant_conversations_history_delete_guard();

REVOKE ALL ON FUNCTION app.assistant_conversations_history_delete_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.assistant_conversations_history_delete_guard() TO service_role;

DROP POLICY IF EXISTS assistant_conversations_service_all ON public.assistant_conversations;
CREATE POLICY assistant_conversations_service_all ON public.assistant_conversations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assistant_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assistant_messages_tenant_select ON public.assistant_messages;
CREATE POLICY assistant_messages_tenant_select ON public.assistant_messages
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.organization_id = assistant_messages.organization_id
        AND c.user_id = app.current_user_id()
    )
    AND (
      role = 'user'
      OR app.assistant_message_still_permitted(organization_id, access_scope_json)
    )
  );

DROP POLICY IF EXISTS assistant_messages_tenant_insert ON public.assistant_messages;
CREATE POLICY assistant_messages_tenant_insert ON public.assistant_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    role = 'user'
    AND app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'assistant.use')
    AND EXISTS (
      SELECT 1 FROM public.assistant_conversations c
      WHERE c.id = assistant_messages.conversation_id
        AND c.organization_id = assistant_messages.organization_id
        AND c.user_id = app.current_user_id()
    )
  );

DROP POLICY IF EXISTS assistant_messages_tenant_update ON public.assistant_messages;
CREATE POLICY assistant_messages_tenant_update ON public.assistant_messages
  FOR UPDATE TO authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS assistant_messages_tenant_delete ON public.assistant_messages;
CREATE POLICY assistant_messages_tenant_delete ON public.assistant_messages
  FOR DELETE TO authenticated
  USING (false);

DROP POLICY IF EXISTS assistant_messages_service_all ON public.assistant_messages;
CREATE POLICY assistant_messages_service_all ON public.assistant_messages
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.automation_rules TO authenticated;
GRANT SELECT ON public.automation_runs TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.automation_runs FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_integrations TO authenticated;
REVOKE ALL ON public.integration_entity_mappings FROM authenticated;
REVOKE ALL ON public.integration_sync_jobs FROM authenticated;
GRANT ALL ON public.integration_entity_mappings TO service_role;
GRANT ALL ON public.integration_sync_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_conversations TO authenticated;
GRANT SELECT, INSERT ON public.assistant_messages TO authenticated;
REVOKE UPDATE, DELETE ON public.assistant_messages FROM authenticated;
