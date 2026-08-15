-- 0048_document_versioning
-- Additive only. Does NOT modify 0000–0047.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Document record ≠ version ≠ storage object.
-- Uploading a new version never deletes the previous file row.

ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'contract';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'work_order';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'subcontract_agreement';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'safety_record';
ALTER TYPE public.document_owner_type ADD VALUE IF NOT EXISTS 'timesheet';

CREATE TABLE IF NOT EXISTS public.document_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  parent_id uuid,
  name text NOT NULL,
  owner_type text,
  owner_id uuid,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_folders_id_organization_id_uq
  ON public.document_folders (id, organization_id);
CREATE INDEX IF NOT EXISTS document_folders_org_owner_idx
  ON public.document_folders (organization_id, owner_type, owner_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_folders_parent_org_fk') THEN
    ALTER TABLE public.document_folders
      ADD CONSTRAINT document_folders_parent_org_fk
      FOREIGN KEY (parent_id, organization_id)
      REFERENCES public.document_folders (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('document_folders', 'documents.read', 'documents.manage');

CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  document_id uuid NOT NULL,
  version_number integer NOT NULL,
  storage_bucket text NOT NULL,
  storage_path text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer,
  checksum text,
  is_current boolean NOT NULL DEFAULT false,
  uploaded_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_versions_number_positive CHECK (version_number >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_versions_id_organization_id_uq
  ON public.document_versions (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_id_document_org_uq
  ON public.document_versions (id, document_id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_document_number_uq
  ON public.document_versions (document_id, version_number);
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_current_uq
  ON public.document_versions (document_id)
  WHERE is_current;
CREATE UNIQUE INDEX IF NOT EXISTS document_versions_storage_path_uq
  ON public.document_versions (storage_bucket, storage_path);
CREATE INDEX IF NOT EXISTS document_versions_document_idx
  ON public.document_versions (document_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'document_versions_document_org_fk') THEN
    ALTER TABLE public.document_versions
      ADD CONSTRAINT document_versions_document_org_fk
      FOREIGN KEY (document_id, organization_id)
      REFERENCES public.documents (id, organization_id)
      ON DELETE CASCADE;
  END IF;
END $$;

SELECT app.install_permissioned_rls('document_versions', 'documents.read', 'documents.manage');

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS folder_id uuid,
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS tags text,
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS is_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS required_type text,
  ADD COLUMN IF NOT EXISTS current_version_id uuid;

CREATE INDEX IF NOT EXISTS documents_org_folder_idx
  ON public.documents (organization_id, folder_id);
CREATE INDEX IF NOT EXISTS documents_org_expires_idx
  ON public.documents (organization_id, expires_at);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_folder_org_fk') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_folder_org_fk
      FOREIGN KEY (folder_id, organization_id)
      REFERENCES public.document_folders (id, organization_id)
      ON DELETE SET NULL (folder_id);
  END IF;
END $$;

INSERT INTO public.document_versions (
  organization_id, document_id, version_number, storage_bucket, storage_path,
  original_filename, mime_type, size_bytes, checksum, is_current,
  uploaded_by_user_id, uploaded_at
)
SELECT
  d.organization_id, d.id, 1, d.storage_bucket, d.storage_path,
  d.original_filename, d.mime_type, d.size_bytes::integer, d.checksum, true,
  d.uploaded_by_user_id, d.created_at
FROM public.documents d
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_versions v WHERE v.document_id = d.id
)
  AND d.deleted_at IS NULL
  AND d.status <> 'deleted';

UPDATE public.documents d
SET current_version_id = v.id
FROM public.document_versions v
WHERE v.document_id = d.id AND v.is_current AND d.current_version_id IS NULL;

CREATE OR REPLACE FUNCTION app.document_versions_immutable_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_user = 'authenticated' THEN
      RAISE EXCEPTION 'document_versions: historical versions cannot be deleted'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF NEW.storage_path IS DISTINCT FROM OLD.storage_path
       OR NEW.storage_bucket IS DISTINCT FROM OLD.storage_bucket
       OR NEW.checksum IS DISTINCT FROM OLD.checksum
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.original_filename IS DISTINCT FROM OLD.original_filename
       OR NEW.mime_type IS DISTINCT FROM OLD.mime_type
       OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes THEN
      RAISE EXCEPTION 'document_versions: file identity is immutable'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS document_versions_immutable_guard ON public.document_versions;
CREATE TRIGGER document_versions_immutable_guard
  BEFORE UPDATE OR DELETE ON public.document_versions
  FOR EACH ROW
  EXECUTE FUNCTION app.document_versions_immutable_guard();

REVOKE ALL ON FUNCTION app.document_versions_immutable_guard() FROM PUBLIC;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_current_version_org_fk') THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_current_version_org_fk
      FOREIGN KEY (current_version_id, id, organization_id)
      REFERENCES public.document_versions (id, document_id, organization_id)
      ON DELETE SET NULL (current_version_id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

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
END;
$fn$;

DROP TRIGGER IF EXISTS documents_current_version_guard ON public.documents;
CREATE CONSTRAINT TRIGGER documents_current_version_guard
  AFTER INSERT OR UPDATE OF current_version_id ON public.documents
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.documents_current_version_guard();

DROP TRIGGER IF EXISTS document_versions_current_guard ON public.document_versions;
CREATE CONSTRAINT TRIGGER document_versions_current_guard
  AFTER INSERT OR UPDATE OF is_current, document_id, organization_id OR DELETE ON public.document_versions
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION app.documents_current_version_guard();

REVOKE ALL ON FUNCTION app.documents_current_version_guard() FROM PUBLIC;

COMMENT ON TABLE public.document_versions IS
  'One stored file object per version. documents.current_version_id points at latest.';
