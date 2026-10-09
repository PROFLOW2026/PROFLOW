-- 0176: SEC-006 — default project visibility to selected when org has no explicit setting.
-- New orgs also set project_access_mode at onboarding; this aligns SQL helper for legacy rows.

CREATE OR REPLACE FUNCTION app.project_access_mode(p_organization_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT COALESCE(
    (
      SELECT CASE
        WHEN jsonb_typeof(value) = 'string' THEN value #>> '{}'
        ELSE COALESCE(value->>'mode', 'selected')
      END
      FROM public.organization_settings
      WHERE organization_id = p_organization_id AND key = 'project_access_mode'
      LIMIT 1
    ),
    'selected'
  );
$fn$;

REVOKE ALL ON FUNCTION app.project_access_mode(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.project_access_mode(uuid) TO authenticated, service_role;
