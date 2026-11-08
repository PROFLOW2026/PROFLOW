-- 0199_duplicate_warnings_and_auth_rate_limits.sql
-- PREPARED ONLY. Do not apply to Production or any shared database without a separate Owner approval.
-- Pending duplicate warnings and hashed auth rate limits. No source-row updates. No raw email.

CREATE TABLE IF NOT EXISTS public.duplicate_warning_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  case_key text NOT NULL,
  record_id uuid,
  warning_type text NOT NULL,
  snapshot_hash text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approver_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  CONSTRAINT duplicate_warning_acknowledgements_type_known CHECK (
    warning_type IN ('expense_ap_overlap', 'duplicate_vendor_reference')
  ),
  CONSTRAINT duplicate_warning_acknowledgements_status_known CHECK (
    status IN ('pending', 'acknowledged')
  ),
  CONSTRAINT duplicate_warning_acknowledgements_ack_shape CHECK (
    (status = 'pending' AND acknowledged_at IS NULL)
    OR (status = 'acknowledged' AND approver_user_id IS NOT NULL AND acknowledged_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS duplicate_warning_acknowledgements_case_uq
  ON public.duplicate_warning_acknowledgements (organization_id, case_key, warning_type, snapshot_hash);

ALTER TABLE public.duplicate_warning_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.duplicate_warning_acknowledgements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS duplicate_warning_acknowledgements_select ON public.duplicate_warning_acknowledgements;
CREATE POLICY duplicate_warning_acknowledgements_select ON public.duplicate_warning_acknowledgements
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id));

DROP POLICY IF EXISTS duplicate_warning_acknowledgements_insert ON public.duplicate_warning_acknowledgements;
CREATE POLICY duplicate_warning_acknowledgements_insert ON public.duplicate_warning_acknowledgements
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND status = 'pending'
    AND approver_user_id IS NULL
  );

DROP POLICY IF EXISTS duplicate_warning_acknowledgements_ack ON public.duplicate_warning_acknowledgements;
CREATE POLICY duplicate_warning_acknowledgements_ack ON public.duplicate_warning_acknowledgements
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND status IN ('pending', 'acknowledged')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (
        status = 'pending'
        AND approver_user_id IS NULL
        AND acknowledged_at IS NULL
      )
      OR (
        status = 'acknowledged'
        AND approver_user_id IS NOT NULL
        AND acknowledged_at IS NOT NULL
      )
    )
  );

DROP POLICY IF EXISTS duplicate_warning_acknowledgements_service ON public.duplicate_warning_acknowledgements;
CREATE POLICY duplicate_warning_acknowledgements_service ON public.duplicate_warning_acknowledgements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.duplicate_warning_acknowledgements FROM PUBLIC;
REVOKE DELETE ON public.duplicate_warning_acknowledgements FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.duplicate_warning_acknowledgements TO authenticated;
GRANT ALL PRIVILEGES ON public.duplicate_warning_acknowledgements TO service_role;

CREATE TABLE IF NOT EXISTS public.auth_rate_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL,
  key_hash text NOT NULL,
  window_started_at timestamptz NOT NULL,
  attempt_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT auth_rate_limits_count_nonneg CHECK (attempt_count >= 0),
  CONSTRAINT auth_rate_limits_scope_key_window_uq UNIQUE (scope, key_hash, window_started_at)
);

ALTER TABLE public.auth_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_rate_limits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auth_rate_limits_service ON public.auth_rate_limits;
CREATE POLICY auth_rate_limits_service ON public.auth_rate_limits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON public.auth_rate_limits FROM PUBLIC;
REVOKE ALL ON public.auth_rate_limits FROM authenticated;

CREATE OR REPLACE FUNCTION app.consume_auth_rate_limit(
  p_scope text,
  p_key_hash text,
  p_window_seconds integer,
  p_limit integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_window timestamptz;
  v_count integer;
BEGIN
  IF p_scope IS NULL OR p_key_hash IS NULL OR length(p_key_hash) < 32 THEN
    RETURN false;
  END IF;
  IF p_window_seconds IS NULL OR p_window_seconds < 1 OR p_limit IS NULL OR p_limit < 1 THEN
    RETURN false;
  END IF;
  IF position('@' in p_key_hash) > 0 THEN
    RETURN false;
  END IF;
  v_window := to_timestamp(floor(extract(epoch FROM now()) / p_window_seconds) * p_window_seconds);
  INSERT INTO public.auth_rate_limits (scope, key_hash, window_started_at, attempt_count)
  VALUES (p_scope, p_key_hash, v_window, 1)
  ON CONFLICT (scope, key_hash, window_started_at)
  DO UPDATE SET attempt_count = public.auth_rate_limits.attempt_count + 1, updated_at = now()
  RETURNING attempt_count INTO v_count;
  RETURN v_count <= p_limit;
END;
$fn$;

REVOKE ALL ON FUNCTION app.consume_auth_rate_limit(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.consume_auth_rate_limit(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION app.consume_auth_rate_limit(text, text, integer, integer) TO anon;
GRANT EXECUTE ON FUNCTION app.consume_auth_rate_limit(text, text, integer, integer) TO service_role;
