-- 0063_branding_billing_freeze_permission
-- Additive hotfix on top of applied 0062_organization_branding.
-- Does NOT rewrite 0062.
--
-- Progress billing may finalize via boq.billing.create without billing.manage.
-- Brand snapshot freeze on billing_record must accept that authorized path.

CREATE OR REPLACE FUNCTION app.freeze_document_brand_snapshot(
  p_organization_id uuid,
  p_entity_type text,
  p_entity_id uuid,
  p_brand_profile_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_existing uuid;
  v_id uuid;
  v_permission text;
  v_project uuid;
  v_resolved_brand uuid;
  v_snapshot jsonb;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not an organization member' USING ERRCODE = '42501';
  END IF;

  v_permission := app.document_brand_snapshot_required_permission(p_entity_type);
  IF v_permission IS NULL THEN
    RAISE EXCEPTION 'unsupported brand snapshot entity type' USING ERRCODE = 'check_violation';
  END IF;

  IF p_entity_type = 'form_submission' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'forms.submit')
      OR app.has_org_permission(p_organization_id, 'forms.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'boq' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'boq.manage')
      OR app.has_org_permission(p_organization_id, 'boq.progress.approve')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'boq_progress_batch' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'boq.progress.approve')
      OR app.has_org_permission(p_organization_id, 'boq.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'change_order' THEN
    IF NOT (
      app.has_org_permission(p_organization_id, 'changes.approve')
      OR app.has_org_permission(p_organization_id, 'changes.manage')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF p_entity_type = 'billing_record' THEN
    -- billing.manage OR authorized BOQ progress billing path
    IF NOT (
      app.has_org_permission(p_organization_id, 'billing.manage')
      OR app.has_org_permission(p_organization_id, 'boq.billing.create')
    ) THEN
      RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT app.has_org_permission(p_organization_id, v_permission) THEN
    RAISE EXCEPTION 'missing permission for brand snapshot capture' USING ERRCODE = '42501';
  END IF;

  IF NOT app.document_brand_snapshot_subject_ok(
    p_organization_id, p_entity_type, p_entity_id
  ) THEN
    RAISE EXCEPTION 'brand snapshot subject missing, wrong org, or not issued'
      USING ERRCODE = '42501';
  END IF;

  v_project := app.document_brand_snapshot_subject_project_id(
    p_organization_id, p_entity_type, p_entity_id
  );
  IF v_project IS NOT NULL AND NOT app.can_access_project(p_organization_id, v_project) THEN
    RAISE EXCEPTION 'project access denied for brand snapshot capture'
      USING ERRCODE = '42501';
  END IF;

  SELECT s.id INTO v_existing
  FROM public.document_brand_snapshots s
  WHERE s.organization_id = p_organization_id
    AND s.entity_type = p_entity_type
    AND s.entity_id = p_entity_id
  LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  v_resolved_brand := app.resolve_document_brand_profile_id(
    p_organization_id, p_entity_type, p_entity_id, p_brand_profile_id
  );
  v_snapshot := app.build_canonical_brand_snapshot_json(
    p_organization_id, v_resolved_brand
  );

  INSERT INTO public.document_brand_snapshots (
    organization_id, entity_type, entity_id, brand_profile_id, snapshot
  ) VALUES (
    p_organization_id, p_entity_type, p_entity_id, v_resolved_brand, v_snapshot
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.freeze_document_brand_snapshot(uuid, text, uuid, uuid) TO service_role;
