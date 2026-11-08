-- 0197_employee_notification_access.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without a separate Owner approval.
-- Next free number after 0196. This is the badge / notification SELECT / linked-write migration.

-- An active employee-app account may read and cache only that user's own notifications.
-- Org members who already hold notifications.read keep the same access. No other user's row is visible.

DROP POLICY IF EXISTS notifications_tenant_select ON public.notifications;
CREATE POLICY notifications_tenant_select ON public.notifications
  FOR SELECT TO authenticated
  USING (
    recipient_user_id = app.current_user_id()
    AND app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'notifications.read')
      OR EXISTS (
        SELECT 1
        FROM public.employee_app_accounts account
        WHERE account.organization_id = notifications.organization_id
          AND account.user_id = app.current_user_id()
          AND account.status = 'active'
      )
    )
  );

DROP POLICY IF EXISTS notification_attention_badge_snapshots_self ON public.notification_attention_badge_snapshots;
CREATE POLICY notification_attention_badge_snapshots_self ON public.notification_attention_badge_snapshots
  FOR ALL TO authenticated
  USING (
    user_id = app.current_user_id()
    AND app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'notifications.read')
      OR EXISTS (
        SELECT 1
        FROM public.employee_app_accounts account
        WHERE account.organization_id = notification_attention_badge_snapshots.organization_id
          AND account.user_id = app.current_user_id()
          AND account.status = 'active'
      )
    )
  )
  WITH CHECK (
    user_id = app.current_user_id()
    AND app.is_org_member(organization_id)
    AND (
      app.has_org_permission(organization_id, 'notifications.read')
      OR EXISTS (
        SELECT 1
        FROM public.employee_app_accounts account
        WHERE account.organization_id = notification_attention_badge_snapshots.organization_id
          AND account.user_id = app.current_user_id()
          AND account.status = 'active'
      )
    )
  );

-- Wins exactly one crm_opportunities row: the opportunity_id stored on the
-- converted estimate in the same organization. Caller must already hold the
-- quote-convert permission set (quotes.manage, projects.create, projects.update,
-- contracts.manage) org-wide, as an employee grant, or on that project.
-- Does not grant crm.manage and does not update any other opportunity.

CREATE OR REPLACE FUNCTION app.mark_linked_opportunity_won(
  p_organization_id uuid,
  p_quote_id uuid,
  p_opportunity_id uuid,
  p_project_id uuid,
  p_client_id uuid,
  p_contract_id uuid,
  p_converted_at timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_linked uuid;
  v_status text;
  v_existing_project uuid;
BEGIN
  IF app.current_user_id() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'not an organization member' USING ERRCODE = '42501';
  END IF;

  IF NOT (
    (
      app.uwm_has_permission(p_organization_id, 'quotes.manage')
      OR app.has_project_permission(p_organization_id, p_project_id, 'quotes.manage')
    )
    AND (
      app.uwm_has_permission(p_organization_id, 'projects.create')
      OR app.has_project_permission(p_organization_id, p_project_id, 'projects.create')
    )
    AND (
      app.uwm_has_permission(p_organization_id, 'projects.update')
      OR app.has_project_permission(p_organization_id, p_project_id, 'projects.update')
    )
    AND (
      app.uwm_has_permission(p_organization_id, 'contracts.manage')
      OR app.has_project_permission(p_organization_id, p_project_id, 'contracts.manage')
    )
  ) THEN
    RAISE EXCEPTION 'missing quote convert permission' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.projects p
    WHERE p.id = p_project_id
      AND p.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'project is outside the organization' USING ERRCODE = '42501';
  END IF;

  IF p_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.clients c
    WHERE c.id = p_client_id
      AND c.organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'client is outside the organization' USING ERRCODE = '42501';
  END IF;

  IF p_contract_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.contracts c
    WHERE c.id = p_contract_id
      AND c.organization_id = p_organization_id
      AND c.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION 'contract is outside the converted project' USING ERRCODE = '42501';
  END IF;

  SELECT e.opportunity_id
  INTO v_linked
  FROM public.estimates e
  WHERE e.id = p_quote_id
    AND e.organization_id = p_organization_id
    AND e.status = 'converted'
    AND e.converted_project_id = p_project_id;

  IF v_linked IS DISTINCT FROM p_opportunity_id THEN
    RAISE EXCEPTION 'opportunity is not linked to this converted quote' USING ERRCODE = '42501';
  END IF;

  SELECT o.status, o.converted_project_id
  INTO v_status, v_existing_project
  FROM public.crm_opportunities o
  WHERE o.id = p_opportunity_id
    AND o.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_status IN ('lost', 'cancelled') THEN
    RETURN;
  END IF;

  IF v_existing_project IS NOT NULL AND v_existing_project IS DISTINCT FROM p_project_id THEN
    RETURN;
  END IF;

  UPDATE public.crm_opportunities
  SET
    status = 'won',
    stage = 'won',
    converted_client_id = COALESCE(p_client_id, converted_client_id),
    converted_project_id = p_project_id,
    converted_contract_id = COALESCE(p_contract_id, converted_contract_id),
    converted_at = COALESCE(converted_at, p_converted_at, now()),
    updated_at = now()
  WHERE id = p_opportunity_id
    AND organization_id = p_organization_id;
END;
$fn$;

REVOKE ALL ON FUNCTION app.mark_linked_opportunity_won(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.mark_linked_opportunity_won(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION app.mark_linked_opportunity_won(uuid, uuid, uuid, uuid, uuid, uuid, timestamptz) TO service_role;

-- Returns a display name for one external principal, and only when the caller
-- is a member of an organization that owns that principal (grant, home org, or
-- a defect history row). No other principal columns are returned.

CREATE OR REPLACE FUNCTION app.external_principal_display_name(p_principal_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT CASE
    WHEN p_principal_id IS NULL THEN NULL
    WHEN NOT (
      EXISTS (
        SELECT 1
        FROM public.external_access_grants g
        WHERE g.principal_id = p_principal_id
          AND app.is_org_member(g.organization_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.external_principals home
        WHERE home.id = p_principal_id
          AND home.home_organization_id IS NOT NULL
          AND app.is_org_member(home.home_organization_id)
      )
      OR EXISTS (
        SELECT 1
        FROM public.defect_cycle_records history
        WHERE history.actor_principal_id = p_principal_id
          AND app.is_org_member(history.organization_id)
      )
    ) THEN NULL
    ELSE (
      SELECT COALESCE(
        NULLIF(btrim(p.display_name), ''),
        NULLIF(btrim(p.contact_email), ''),
        CASE
          WHEN p.email ILIKE '%@contractors.pf.internal' THEN NULL
          ELSE NULLIF(btrim(p.email), '')
        END
      )
      FROM public.external_principals p
      WHERE p.id = p_principal_id
    )
  END;
$fn$;

REVOKE ALL ON FUNCTION app.external_principal_display_name(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.external_principal_display_name(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION app.external_principal_display_name(uuid) TO service_role;
