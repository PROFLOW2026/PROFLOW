-- 0217_external_professional_tools.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without separate Owner approval.
--
-- SCHEMA: external tool sessions, files, parts, xrefs, edits, object ledger, streams.
--   No project_id. Organization and user foreign keys are ON DELETE RESTRICT.
--   The object ledger keeps its row if a session row is removed (session_id SET NULL).
--   RLS is forced and this file creates no policy for authenticated or anon.
-- DATA MUTATION: two permission catalog rows and an owner-role grant for existing
--   organizations. No manager, worker, or employee grant. No business rows.
--   No change to takeoff_analyses.
-- app.external_scopes_valid is replaced with the 0205 allow-list plus
--   ext.tools.viewer and ext.tools.takeoff. No previously allowed scope is removed.

INSERT INTO public.permissions (key, category, description) VALUES
  ('tools.external_viewer', 'commercial', 'Open an external drawing with no project'),
  ('tools.external_takeoff', 'commercial', 'Run an external quantity takeoff with no project')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'tools.external_viewer'),
    ('owner', 'tools.external_takeoff')
) AS p(role_key, permission_key)
WHERE r.key = p.role_key
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.external_tool_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  created_by_user_id uuid NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  actor_kind text NOT NULL,
  principal_id uuid NULL REFERENCES public.external_principals(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'uploading',
  expires_at timestamptz NOT NULL,
  upload_window_ends_at timestamptz NOT NULL,
  worker_lease_until timestamptz NULL,
  last_heartbeat_at timestamptz NULL,
  worker_instance_id text NULL,
  source_token_hash text NULL,
  result_token_hash text NULL,
  progress_token_hash text NULL,
  terminal_token_hash text NULL,
  revision integer NOT NULL DEFAULT 1,
  stage text NULL,
  percent integer NULL,
  message text NULL,
  reviewed_at timestamptz NULL,
  analysis_finished_at timestamptz NULL,
  closed_at timestamptz NULL,
  result_sha256 text NULL,
  result_stored_at timestamptz NULL,
  terminal_received_at timestamptz NULL,
  terminal_outcome text NULL,
  worker_job_id text NULL,
  analyze_request_id text NULL,
  purge_attempts integer NOT NULL DEFAULT 0,
  purge_error text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_tool_sessions_status_known CHECK (
    status IN (
      'uploading','queued','running','ready','reviewed','failed',
      'cancelling','cancelled','expired','purge_pending','purged'
    )
  ),
  CONSTRAINT external_tool_sessions_actor_known CHECK (actor_kind IN ('member', 'contractor')),
  CONSTRAINT external_tool_sessions_actor_identity CHECK (
    (actor_kind = 'member' AND created_by_user_id IS NOT NULL)
    OR (actor_kind = 'contractor' AND principal_id IS NOT NULL)
  ),
  CONSTRAINT external_tool_sessions_percent_range CHECK (percent IS NULL OR (percent >= 0 AND percent <= 100))
);

CREATE UNIQUE INDEX IF NOT EXISTS external_tool_sessions_analyze_request_uq
  ON public.external_tool_sessions (id, analyze_request_id)
  WHERE analyze_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_tool_sessions_org_expiry_idx
  ON public.external_tool_sessions (organization_id, expires_at);
CREATE INDEX IF NOT EXISTS external_tool_sessions_lease_idx
  ON public.external_tool_sessions (status, worker_lease_until);

CREATE TABLE IF NOT EXISTS public.external_tool_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.external_tool_sessions(id) ON DELETE RESTRICT,
  logical_id uuid NOT NULL,
  relative_path text NOT NULL,
  idempotency_key text NOT NULL,
  role text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NULL,
  upload_state text NOT NULL,
  upload_url_issued_at timestamptz NULL,
  part_size_bytes integer NOT NULL DEFAULT 4194304,
  part_count integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_tool_files_session_logical_uq UNIQUE (session_id, logical_id),
  CONSTRAINT external_tool_files_session_idem_uq UNIQUE (session_id, idempotency_key),
  CONSTRAINT external_tool_files_size_nonnegative CHECK (size_bytes >= 0),
  CONSTRAINT external_tool_files_part_size CHECK (part_size_bytes = 4194304),
  CONSTRAINT external_tool_files_part_count CHECK (part_count IS NULL OR part_count >= 1),
  CONSTRAINT external_tool_files_upload_state CHECK (
    upload_state IN ('pending', 'uploading', 'complete', 'failed')
  )
);

CREATE TABLE IF NOT EXISTS public.external_tool_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  logical_id uuid NOT NULL,
  part_index integer NOT NULL,
  offset_bytes bigint NOT NULL,
  size_bytes bigint NOT NULL,
  upload_key text NOT NULL,
  locked_key text NULL,
  sha256 text NULL,
  state text NOT NULL,
  CONSTRAINT external_tool_parts_slot_uq UNIQUE (session_id, logical_id, part_index),
  CONSTRAINT external_tool_parts_offset_uq UNIQUE (session_id, logical_id, offset_bytes),
  CONSTRAINT external_tool_parts_file_fk FOREIGN KEY (session_id, logical_id)
    REFERENCES public.external_tool_files (session_id, logical_id) ON DELETE RESTRICT,
  CONSTRAINT external_tool_parts_index CHECK (part_index >= 0),
  CONSTRAINT external_tool_parts_offset CHECK (offset_bytes >= 0),
  CONSTRAINT external_tool_parts_size CHECK (size_bytes > 0 AND size_bytes <= 4194304),
  CONSTRAINT external_tool_parts_state CHECK (state IN ('issued', 'locked', 'rejected')),
  CONSTRAINT external_tool_parts_locked_key CHECK (
    (state = 'locked' AND locked_key IS NOT NULL AND sha256 IS NOT NULL)
    OR (state <> 'locked')
  )
);

CREATE TABLE IF NOT EXISTS public.external_tool_xrefs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.external_tool_sessions(id) ON DELETE RESTRICT,
  host_logical_id uuid NOT NULL,
  parent_logical_id uuid NOT NULL,
  block_name text NOT NULL,
  saved_path text NOT NULL DEFAULT '',
  resolved_logical_id uuid NULL,
  wasm_doc_id text NULL,
  display_state text NOT NULL,
  CONSTRAINT external_tool_xrefs_triple_uq UNIQUE (session_id, parent_logical_id, block_name, saved_path),
  CONSTRAINT external_tool_xrefs_host_fk FOREIGN KEY (session_id, host_logical_id)
    REFERENCES public.external_tool_files (session_id, logical_id) ON DELETE RESTRICT,
  CONSTRAINT external_tool_xrefs_parent_fk FOREIGN KEY (session_id, parent_logical_id)
    REFERENCES public.external_tool_files (session_id, logical_id) ON DELETE RESTRICT,
  CONSTRAINT external_tool_xrefs_resolved_fk FOREIGN KEY (session_id, resolved_logical_id)
    REFERENCES public.external_tool_files (session_id, logical_id) ON DELETE RESTRICT,
  CONSTRAINT external_tool_xrefs_display CHECK (display_state IN ('found', 'missing', 'choice'))
);

CREATE TABLE IF NOT EXISTS public.external_tool_edits (
  session_id uuid NOT NULL REFERENCES public.external_tool_sessions(id) ON DELETE RESTRICT,
  seq integer NOT NULL,
  op jsonb NOT NULL,
  revision_after integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_tool_edits_pk PRIMARY KEY (session_id, seq)
);

CREATE TABLE IF NOT EXISTS public.external_tool_objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  session_id uuid NULL REFERENCES public.external_tool_sessions(id) ON DELETE SET NULL,
  storage_key text NOT NULL,
  kind text NOT NULL,
  issued_at timestamptz NOT NULL,
  delete_not_before timestamptz NOT NULL,
  deleted_at timestamptz NULL,
  last_error text NULL,
  CONSTRAINT external_tool_objects_key_uq UNIQUE (storage_key),
  CONSTRAINT external_tool_objects_kind_known CHECK (kind IN ('upload', 'locked', 'result'))
);

CREATE TABLE IF NOT EXISTS public.external_tool_streams (
  session_id uuid NOT NULL REFERENCES public.external_tool_sessions(id) ON DELETE RESTRICT,
  stream_id text NOT NULL,
  lease_until timestamptz NOT NULL,
  part_index integer NOT NULL,
  CONSTRAINT external_tool_streams_pk PRIMARY KEY (session_id, stream_id),
  CONSTRAINT external_tool_streams_part CHECK (part_index >= 0)
);

ALTER TABLE public.external_tool_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_files FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_parts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_xrefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_xrefs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_edits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_objects FORCE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_streams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_tool_streams FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION app.external_scopes_valid(p_scopes jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT jsonb_typeof(p_scopes) = 'array'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(p_scopes) AS scope
      WHERE scope NOT IN (
        'ext.project.view',
        'ext.schedule.view',
        'ext.event.respond',
        'ext.task.work',
        'ext.task.report',
        'ext.thread.post',
        'ext.document.view',
        'ext.document.upload',
        'ext.plan.view',
        'ext.plan.acknowledge',
        'ext.takeoff.view',
        'ext.takeoff.manage',
        'ext.takeoff.approve',
        'ext.takeoff.library.manage',
        'ext.tools.viewer',
        'ext.tools.takeoff',
        'ext.folder.quotes',
        'ext.folder.contracts',
        'ext.folder.billing',
        'ext.folder.vendor_invoices',
        'ext.folder.photos',
        'ext.folder.documents',
        'ext.folder.general_files',
        'ext.rfi.view',
        'ext.rfi.raise',
        'ext.submittal.submit',
        'ext.inspection.view',
        'ext.defect.work',
        'ext.daily_log.submit',
        'ext.delivery.report',
        'ext.safety.report',
        'ext.site_instruction.ack',
        'ext.contract.view_value',
        'ext.change.request',
        'ext.claim.view',
        'ext.claim.submit',
        'ext.payment.view',
        'ext.compliance.submit',
        'ext.handover.submit',
        'ext.bid.submit'
      )
    )
$fn$;

CREATE OR REPLACE FUNCTION app.external_tool_object_org_matches()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  session_org uuid;
BEGIN
  IF NEW.session_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT organization_id INTO session_org
  FROM public.external_tool_sessions
  WHERE id = NEW.session_id;
  IF session_org IS NULL OR session_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'external_tool_object_org_mismatch';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS external_tool_objects_org_match ON public.external_tool_objects;
CREATE TRIGGER external_tool_objects_org_match
  BEFORE INSERT OR UPDATE ON public.external_tool_objects
  FOR EACH ROW EXECUTE FUNCTION app.external_tool_object_org_matches();
