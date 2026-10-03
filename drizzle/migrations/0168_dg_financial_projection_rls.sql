-- 0168_dg_financial_projection_rls (Developer / GC - Track B)
--
-- Financial projection security for subcontracts. No table or column is dropped. Changes:
--   1. money predicates app.subcontract_money_visible / app.subcontract_agreement_money_visible;
--   2. subcontract_value_events SELECT policy narrowed by AND-ing the money predicate;
--   3. subcontract_agreements stays the name callers use. The physical table is
--      subcontract_agreements_store. A security-definer reader masks original_amount and
--      retention_percent unless the money gate passes, and hides the store from authenticated.
--
-- Money gate (mirrors src/modules/vendors/application/subcontract-financial-access.ts):
--   org member AND (
--     project_financials.read  OR  ap.read  OR  vendors.manage
--     OR project capability contract.financial.view on the agreement's project )
-- `vendors.read` alone stays operational (who / where / status / dates / documents).
--
-- DEPLOY ORDER: this migration is safe to apply while the previous app build is still serving.
-- The relation name `subcontract_agreements` stays selectable and writable. Header money columns
-- are returned as NULL unless the money gate (or ext.contract.view_value) passes, so an old
-- SELECT / RETURNING does not error and a non-financial user does not receive the figures.
-- The physical row lives in subcontract_agreements_store, which `authenticated` cannot read.
-- The new app keeps using subcontract_agreement_money_secure for explicit financial reads.
--
-- Reviewed, no change needed:
--   * subcontract_advances / _applications / _refunds: SELECT already requires ap.read (0076).
--   * boq_subcontractor_schedule_lines.unit_rate/amount and boq_subcontractor_valuation_lines
--     .unit_rate_snapshot/period_amount: table SELECT already column-revoked from authenticated;
--     money only via *_secure views gated by app.boq_can_see_money (0035 section 12.2 / 16).
--   * boq_subcontractor_schedules / boq_subcontractor_valuations: no money columns.

--------------------------------------------------------------------------------
-- 1. Money predicates
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.subcontract_money_visible(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT app.is_org_member(p_organization_id)
    AND (
      app.has_org_permission(p_organization_id, 'project_financials.read')
      OR app.has_org_permission(p_organization_id, 'ap.read')
      OR app.has_org_permission(p_organization_id, 'vendors.manage')
      OR (
        p_project_id IS NOT NULL
        AND app.has_project_capability(p_organization_id, p_project_id, 'contract.financial.view')
      )
    );
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_money_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_money_visible(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.subcontract_agreement_money_visible(
  p_organization_id uuid,
  p_subcontract_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1
    FROM public.subcontract_agreements a
    WHERE a.id = p_subcontract_id
      AND a.organization_id = p_organization_id
      AND app.subcontract_money_visible(a.organization_id, a.project_id)
  );
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_agreement_money_visible(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_agreement_money_visible(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION app.subcontract_money_visible(uuid, uuid) IS
  'Subcontract money gate: project_financials.read | ap.read | vendors.manage | project capability contract.financial.view. vendors.read alone is operational.';

--------------------------------------------------------------------------------
-- 2. subcontract_value_events: SELECT requires the money gate
--    (AND onto the existing vendors.read + project-access policy; idempotent)
--    Writers keep working: INSERT ... RETURNING is done by vendors.manage holders,
--    who pass the gate. Events are append-only (trigger 0049).
--------------------------------------------------------------------------------

DO $do$
DECLARE
  v_expr text;
BEGIN
  SELECT pg_get_expr(p.polqual, p.polrelid)
    INTO v_expr
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'subcontract_value_events'
    AND p.polname = 'subcontract_value_events_tenant_select';

  IF v_expr IS NULL THEN
    RAISE EXCEPTION '0168: policy subcontract_value_events_tenant_select is missing';
  END IF;

  IF position('subcontract_agreement_money_visible' in v_expr) = 0 THEN
    EXECUTE format(
      'ALTER POLICY subcontract_value_events_tenant_select ON public.subcontract_value_events USING ((%s) AND (app.subcontract_agreement_money_visible(organization_id, subcontract_id)))',
      v_expr
    );
  END IF;
END
$do$;

--------------------------------------------------------------------------------
-- 3. Header money: keep the relation name, mask the figures, hide the store
--------------------------------------------------------------------------------

-- The physical table keeps every grant, policy, trigger, and foreign key. Callers (the deployed
-- app and the new app) keep using the name subcontract_agreements, which becomes a mask view.
ALTER TABLE public.subcontract_agreements RENAME TO subcontract_agreements_store;

CREATE OR REPLACE FUNCTION app.subcontract_agreements_view_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_org uuid;
  v_project uuid;
  v_vendor uuid;
  v_id uuid;
  v_new jsonb;
  v_old jsonb;
  v_can_money boolean;
  v_store public.subcontract_agreements_store;
  v_set text;
BEGIN
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);
  v_project := COALESCE(NEW.project_id, OLD.project_id);
  v_vendor := COALESCE(NEW.vendor_id, OLD.vendor_id);
  v_id := COALESCE(NEW.id, OLD.id);
  v_can_money := NOT app.dg_invoker_is_authenticated()
    OR app.subcontract_money_visible(v_org, v_project)
    OR (
      v_vendor IS NOT NULL AND v_id IS NOT NULL
      AND app.external_has_scope(v_org, v_project, v_vendor, v_id, 'ext.contract.view_value')
    );

  IF TG_OP = 'DELETE' THEN
    IF app.dg_invoker_is_authenticated() AND NOT (
      app.is_org_member(OLD.organization_id)
      AND app.has_org_permission(OLD.organization_id, 'vendors.manage')
    ) THEN
      RAISE EXCEPTION 'subcontract agreement delete is not allowed' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.subcontract_agreements_store WHERE id = OLD.id;
    RETURN OLD;
  END IF;

  IF app.dg_invoker_is_authenticated() AND TG_OP = 'INSERT' AND NOT (
    app.is_org_member(NEW.organization_id) AND (
      app.has_org_permission(NEW.organization_id, 'vendors.manage')
      OR app.has_project_capability(NEW.organization_id, NEW.project_id, 'contract.manage')
    )
  ) THEN
    RAISE EXCEPTION 'subcontract agreement insert is not allowed' USING ERRCODE = '42501';
  END IF;

  IF app.dg_invoker_is_authenticated() AND TG_OP = 'UPDATE' AND NOT (
    app.is_org_member(NEW.organization_id) AND (
      app.has_org_permission(NEW.organization_id, 'vendors.manage')
      OR app.has_project_capability(NEW.organization_id, NEW.project_id, 'contract.manage')
      OR app.has_project_capability(NEW.organization_id, NEW.project_id, 'change.financial.manage')
    )
  ) THEN
    RAISE EXCEPTION 'subcontract agreement update is not allowed' USING ERRCODE = '42501';
  END IF;

  v_new := to_jsonb(NEW);
  IF v_new ->> 'id' IS NULL THEN
    v_new := jsonb_set(v_new, '{id}', to_jsonb(gen_random_uuid()));
  END IF;
  IF v_new ->> 'created_at' IS NULL THEN
    v_new := jsonb_set(v_new, '{created_at}', to_jsonb(now()));
  END IF;
  IF v_new ->> 'updated_at' IS NULL THEN
    v_new := jsonb_set(v_new, '{updated_at}', to_jsonb(now()));
  END IF;

  IF TG_OP = 'UPDATE' AND NOT v_can_money THEN
    SELECT to_jsonb(s) INTO v_old
    FROM public.subcontract_agreements_store s
    WHERE s.id = OLD.id;
    v_new := v_new || jsonb_build_object(
      'original_amount', v_old -> 'original_amount',
      'retention_percent', v_old -> 'retention_percent'
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.subcontract_agreements_store
    SELECT r.*
    FROM jsonb_populate_record(NULL::public.subcontract_agreements_store, v_new) AS r;
  ELSE
    SELECT string_agg(format('%I = p.%I', att.attname, att.attname), ', ' ORDER BY att.attnum)
      INTO v_set
    FROM pg_attribute att
    WHERE att.attrelid = 'public.subcontract_agreements_store'::regclass
      AND att.attnum > 0
      AND NOT att.attisdropped
      AND att.attname <> 'id';
    EXECUTE format(
      'UPDATE public.subcontract_agreements_store AS s SET %s FROM jsonb_populate_record(NULL::public.subcontract_agreements_store, $1) AS p WHERE s.id = $2',
      v_set
    ) USING v_new, OLD.id;
  END IF;

  SELECT * INTO v_store
  FROM public.subcontract_agreements_store
  WHERE id = (v_new ->> 'id')::uuid;

  IF NOT v_can_money THEN
    v_store.original_amount := NULL;
    v_store.retention_percent := NULL;
  END IF;
  RETURN v_store;
END;
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_agreements_view_write() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_agreements_view_write() TO authenticated, service_role;

DO $do$
DECLARE
  v_cols text;
BEGIN
  SELECT string_agg(
    CASE
      WHEN att.attname IN ('original_amount', 'retention_percent') THEN format(
        '(CASE WHEN NOT app.dg_invoker_is_authenticated() OR app.subcontract_money_visible(s.organization_id, s.project_id) OR app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.id, %L) THEN s.%I ELSE NULL END)::%s AS %I',
        'ext.contract.view_value',
        att.attname,
        format_type(att.atttypid, att.atttypmod),
        att.attname
      )
      ELSE format('s.%I', att.attname)
    END,
    ', ' ORDER BY att.attnum
  )
    INTO v_cols
  FROM pg_attribute att
  WHERE att.attrelid = 'public.subcontract_agreements_store'::regclass
    AND att.attnum > 0
    AND NOT att.attisdropped;

  IF v_cols IS NULL OR position('original_amount' IN v_cols) = 0 THEN
    RAISE EXCEPTION '0168: could not build the agreement compatibility view';
  END IF;

  EXECUTE format(
    $fn$
    CREATE OR REPLACE FUNCTION app.subcontract_agreements_read()
    RETURNS SETOF public.subcontract_agreements_store
    LANGUAGE plpgsql
    STABLE
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $body$
    BEGIN
      RETURN QUERY
      SELECT %s
      FROM public.subcontract_agreements_store s
      WHERE NOT app.dg_invoker_is_authenticated()
        OR (
          app.is_org_member(s.organization_id)
          AND (
            app.has_org_permission(s.organization_id, 'vendors.read')
            OR app.has_project_capability(s.organization_id, s.project_id, 'contractor.view')
          )
        )
        OR app.external_has_scope(s.organization_id, s.project_id, s.vendor_id, s.id, 'ext.project.view');
    END
    $body$
    $fn$,
    v_cols
  );
  EXECUTE $view$
    CREATE VIEW public.subcontract_agreements
    WITH (security_barrier = true, security_invoker = false) AS
    SELECT * FROM app.subcontract_agreements_read()
  $view$;
END
$do$;

REVOKE ALL ON FUNCTION app.subcontract_agreements_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_agreements_read() TO authenticated, service_role;

DROP TRIGGER IF EXISTS subcontract_agreements_view_write_trg ON public.subcontract_agreements;
CREATE TRIGGER subcontract_agreements_view_write_trg
  INSTEAD OF INSERT OR UPDATE OR DELETE ON public.subcontract_agreements
  FOR EACH ROW EXECUTE FUNCTION app.subcontract_agreements_view_write();

COMMENT ON VIEW public.subcontract_agreements IS
  'Compatibility view over subcontract_agreements_store. SELECT of original_amount and retention_percent returns NULL unless the money gate or ext.contract.view_value passes. Writes pass through; a caller who cannot see money cannot overwrite it.';

-- Policies created before the rename keep the physical table OID. Point those
-- lookups at the compatibility view so authenticated never reads the store.
DO $do$
DECLARE
  r record;
  v_using text;
  v_check text;
BEGIN
  FOR r IN
    SELECT n.nspname, c.relname, p.polname,
           pg_get_expr(p.polqual, p.polrelid) AS using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
    FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname <> 'subcontract_agreements_store'
      AND (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') LIKE '%subcontract_agreements_store%'
        OR coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') LIKE '%subcontract_agreements_store%'
      )
  LOOP
    v_using := replace(r.using_expr, 'subcontract_agreements_store', 'subcontract_agreements');
    v_check := replace(r.check_expr, 'subcontract_agreements_store', 'subcontract_agreements');
    IF r.using_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (%s)', r.polname, r.nspname, r.relname, v_using);
    END IF;
    IF r.check_expr IS NOT NULL THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (%s)', r.polname, r.nspname, r.relname, v_check);
    END IF;
  END LOOP;
END
$do$;

REVOKE ALL ON TABLE public.subcontract_agreements_store FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_agreements_store TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_agreements TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app.subcontract_agreement_money_rows()
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  project_id uuid,
  vendor_id uuid,
  currency text,
  original_amount numeric,
  retention_percent numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  SELECT
    a.id,
    a.organization_id,
    a.project_id,
    a.vendor_id,
    a.currency::text,
    a.original_amount::numeric,
    a.retention_percent::numeric
  FROM public.subcontract_agreements_store a
  WHERE (
      app.subcontract_money_visible(a.organization_id, a.project_id)
      AND app.can_access_project(a.organization_id, a.project_id)
    )
    OR app.external_has_scope(a.organization_id, a.project_id, a.vendor_id, a.id, 'ext.contract.view_value')
    OR NOT app.dg_invoker_is_authenticated();
END
$fn$;

REVOKE ALL ON FUNCTION app.subcontract_agreement_money_rows() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.subcontract_agreement_money_rows() TO authenticated, service_role;

DROP VIEW IF EXISTS public.subcontract_agreement_money_secure;
CREATE VIEW public.subcontract_agreement_money_secure
WITH (security_invoker = false, security_barrier = true) AS
SELECT * FROM app.subcontract_agreement_money_rows();

REVOKE ALL ON public.subcontract_agreement_money_secure FROM PUBLIC;
GRANT SELECT ON public.subcontract_agreement_money_secure TO authenticated, service_role;

COMMENT ON VIEW public.subcontract_agreement_money_secure IS
  'Subcontract header money. Rows only when app.subcontract_money_visible plus project access, or external ext.contract.view_value. Reads the store, not the masked compatibility view.';

DO $do$
BEGIN
  IF has_table_privilege('authenticated', 'public.subcontract_agreements_store', 'SELECT') THEN
    RAISE EXCEPTION '0168: authenticated can still read subcontract_agreements_store';
  END IF;
  IF NOT has_column_privilege('authenticated', 'public.subcontract_agreements', 'original_amount', 'SELECT')
     OR NOT has_column_privilege('authenticated', 'public.subcontract_agreements', 'title', 'SELECT') THEN
    RAISE EXCEPTION '0168: compatibility view is not selectable by authenticated';
  END IF;
END
$do$;
