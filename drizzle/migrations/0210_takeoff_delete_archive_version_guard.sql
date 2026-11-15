-- PREPARED — do not apply to production until the Owner approves this file.
--
-- 1. Real archive timestamp. Legacy "[ARCHIVED] " name prefix is folded in and removed.
-- 2. A detection, edit, or approval row may be deleted only as part of deleting its
--    analysis. The parent analysis row is already gone when a foreign-key cascade
--    reaches the child. A direct DELETE, while the analysis row still exists, is rejected.
--    UPDATE of detections and edits stays append-only. Approval snapshot columns stay immutable.
-- 3. The deferred document-version guard reads the live current_version_id. An INSERT
--    event otherwise still sees the null pointer from insert time, after a later update
--    has set the real version, and raises
--    "documents: current_version_id must be the current version of this document".

ALTER TABLE public.takeoff_analyses
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.takeoff_analyses
SET archived_at = updated_at
WHERE name LIKE '[ARCHIVED] %'
  AND archived_at IS NULL;

UPDATE public.takeoff_analyses
SET name = substring(name FROM 12)
WHERE name LIKE '[ARCHIVED] %';

CREATE INDEX IF NOT EXISTS takeoff_analyses_archived_idx
  ON public.takeoff_analyses (organization_id, project_id, archived_at);

CREATE OR REPLACE FUNCTION app.takeoff_block_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Cascade from takeoff_analyses (or from a job whose analysis is already gone).
    -- A direct delete still sees the analysis row and is rejected.
    IF NOT EXISTS (
      SELECT 1
      FROM public.takeoff_analyses AS analysis
      WHERE analysis.id = OLD.analysis_id
        AND analysis.organization_id = OLD.organization_id
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$fn$;

REVOKE ALL ON FUNCTION app.takeoff_block_update() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.takeoff_approvals_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.takeoff_analyses AS analysis
      WHERE analysis.id = OLD.analysis_id
        AND analysis.organization_id = OLD.organization_id
    ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'takeoff_approvals rows are immutable' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.analysis_id, NEW.boq_json, NEW.detections_hash,
      NEW.file_versions_json, NEW.rule_set_version, NEW.approved_by_user_id, NEW.approved_at, NEW.created_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.analysis_id, OLD.boq_json, OLD.detections_hash,
      OLD.file_versions_json, OLD.rule_set_version, OLD.approved_by_user_id, OLD.approved_at, OLD.created_at) THEN
    RAISE EXCEPTION 'takeoff_approvals: snapshot columns are immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.reopened_at IS NOT NULL AND NEW.reopened_at IS DISTINCT FROM OLD.reopened_at THEN
    RAISE EXCEPTION 'takeoff_approvals: reopen timestamp is final' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

REVOKE ALL ON FUNCTION app.takeoff_approvals_guard() FROM PUBLIC;

CREATE OR REPLACE FUNCTION app.documents_current_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_document_id uuid;
  v_organization_id uuid;
  v_pointer uuid;
  v_total integer;
  v_current_count integer;
  v_current_id uuid;
  v_current_document_id uuid;
  v_current_organization_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'documents' THEN
    v_document_id := COALESCE(NEW.id, OLD.id);
    v_organization_id := COALESCE(NEW.organization_id, OLD.organization_id);
    -- Live row, not NEW. A deferred INSERT trigger still carries the insert-time
    -- pointer (null) after this transaction has set current_version_id.
    SELECT d.current_version_id INTO v_pointer
    FROM public.documents d
    WHERE d.id = v_document_id AND d.organization_id = v_organization_id;
  ELSIF TG_OP = 'DELETE' THEN
    v_document_id := OLD.document_id;
    v_organization_id := OLD.organization_id;
    SELECT d.current_version_id INTO v_pointer
    FROM public.documents d
    WHERE d.id = v_document_id AND d.organization_id = v_organization_id;
  ELSE
    v_document_id := NEW.document_id;
    v_organization_id := NEW.organization_id;
    SELECT d.current_version_id INTO v_pointer
    FROM public.documents d
    WHERE d.id = v_document_id AND d.organization_id = v_organization_id;
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.document_versions v
  WHERE v.document_id = v_document_id AND v.organization_id = v_organization_id;

  IF v_total = 0 THEN
    IF v_pointer IS NOT NULL THEN
      RAISE EXCEPTION 'documents: current_version_id must be null when no versions exist'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*)::int INTO v_current_count
  FROM public.document_versions v
  WHERE v.document_id = v_document_id
    AND v.organization_id = v_organization_id
    AND v.is_current;

  IF v_current_count = 0 THEN
    RAISE EXCEPTION 'document_versions: a document with versions must have exactly one current version'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  IF v_current_count <> 1 THEN
    RAISE EXCEPTION 'document_versions: exactly one current version is allowed'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  SELECT v.id, v.document_id, v.organization_id
    INTO v_current_id, v_current_document_id, v_current_organization_id
  FROM public.document_versions v
  WHERE v.document_id = v_document_id
    AND v.organization_id = v_organization_id
    AND v.is_current;

  IF v_pointer IS DISTINCT FROM v_current_id
     OR v_current_document_id IS DISTINCT FROM v_document_id
     OR v_current_organization_id IS DISTINCT FROM v_organization_id
     OR v_pointer IS NULL THEN
    RAISE EXCEPTION 'documents: current_version_id must be the current version of this document'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN COALESCE(NEW, OLD);
END
$fn$;

REVOKE ALL ON FUNCTION app.documents_current_version_guard() FROM PUBLIC;
