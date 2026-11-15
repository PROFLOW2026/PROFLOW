-- Rollback for 0210, captured from production before apply on 2026-11-15.
-- Restores the three replaced functions and drops the archive column.
-- Do not run unless the Owner asks to roll back.

ALTER TABLE public.takeoff_analyses DROP COLUMN IF EXISTS archived_at;

CREATE OR REPLACE FUNCTION app.takeoff_block_update()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION '% rows are append-only', TG_TABLE_NAME USING ERRCODE = '42501';
END
$function$;

CREATE OR REPLACE FUNCTION app.takeoff_approvals_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
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
$function$;

CREATE OR REPLACE FUNCTION app.documents_current_version_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
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
    v_document_id := NEW.id;
    v_organization_id := NEW.organization_id;
    v_pointer := NEW.current_version_id;
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
$function$;
