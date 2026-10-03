-- 0155: Developer / GC layer - FOUNDATION (shared contracts used by every later track).
-- PREPARED ONLY - Owner applies after the Final Gate review. Do not modify 0000-0154.
--
-- PURPOSE
--   1. external_access_grants: contractor portal kind + agreement scope (additive relax of checks)
--   2. app.external_principal_id / app.external_has_scope / app.external_can_see_project
--      (external principals are NOT org members; they never pass app.is_org_member)
--   3. project_locations (hierarchical, per project)
--   4. subcontract_work_lines (operational) + subcontract_work_line_prices (financial, split by RLS)
--   5. entity_links (generic cross-entity relation, no cross-track FKs)
--   6. domain_events (typed outbox, immutable except processing columns)
--
-- COMPATIBILITY: additive. Existing grants (customer/vendor) satisfy the relaxed checks.

--------------------------------------------------------------------------------
-- 1. External grants: contractor kind + agreement scope
--------------------------------------------------------------------------------

ALTER TABLE public.external_access_grants
  ADD COLUMN IF NOT EXISTS subcontract_agreement_id uuid;

ALTER TABLE public.external_access_grants
  DROP CONSTRAINT IF EXISTS external_access_grants_kind_known;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_kind_known
  CHECK (portal_kind IN ('customer', 'vendor', 'contractor'));

ALTER TABLE public.external_access_grants
  DROP CONSTRAINT IF EXISTS external_access_grants_scope_present;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_scope_present
  CHECK (
    (portal_kind = 'vendor' AND vendor_id IS NOT NULL AND client_id IS NULL
      AND project_id IS NULL AND subcontract_agreement_id IS NULL)
    OR (portal_kind = 'customer' AND vendor_id IS NULL AND subcontract_agreement_id IS NULL
      AND num_nonnulls(client_id, project_id) >= 1)
    OR (portal_kind = 'contractor' AND vendor_id IS NOT NULL AND client_id IS NULL)
  );

ALTER TABLE public.external_access_grants
  DROP CONSTRAINT IF EXISTS external_access_grants_agreement_vendor_fk;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_agreement_vendor_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id)
  ON DELETE CASCADE;

ALTER TABLE public.external_access_grants
  DROP CONSTRAINT IF EXISTS external_access_grants_agreement_project_fk;
ALTER TABLE public.external_access_grants
  ADD CONSTRAINT external_access_grants_agreement_project_fk
  FOREIGN KEY (subcontract_agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id)
  ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS external_access_grants_agreement_idx
  ON public.external_access_grants (organization_id, subcontract_agreement_id)
  WHERE subcontract_agreement_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS external_access_grants_project_idx
  ON public.external_access_grants (organization_id, project_id)
  WHERE project_id IS NOT NULL;

--------------------------------------------------------------------------------
-- 2. External authorization helpers (DB mirror of requireExternalScope)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.external_principal_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p.id
  FROM public.external_principals p
  WHERE p.auth_user_id = app.current_user_id()
    AND p.archived_at IS NULL
  LIMIT 1
$fn$;

CREATE OR REPLACE FUNCTION app.external_has_scope(
  p_organization_id uuid,
  p_project_id uuid,
  p_vendor_id uuid,
  p_agreement_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_vendor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.external_access_grants g
      WHERE g.principal_id = app.external_principal_id()
        AND g.organization_id = p_organization_id
        AND g.portal_kind = 'contractor'
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND jsonb_exists(g.scopes, p_capability)
        AND g.vendor_id = p_vendor_id
        AND (g.project_id IS NULL OR g.project_id = p_project_id)
        AND (g.subcontract_agreement_id IS NULL OR g.subcontract_agreement_id = p_agreement_id)
    )
$fn$;

CREATE OR REPLACE FUNCTION app.external_can_see_project(
  p_organization_id uuid,
  p_project_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT p_project_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.external_access_grants g
      WHERE g.principal_id = app.external_principal_id()
        AND g.organization_id = p_organization_id
        AND g.portal_kind = 'contractor'
        AND g.status = 'active'
        AND g.revoked_at IS NULL
        AND (g.expires_at IS NULL OR g.expires_at > now())
        AND jsonb_exists(g.scopes, 'ext.project.view')
        AND (
          g.project_id = p_project_id
          OR EXISTS (
            SELECT 1 FROM public.subcontract_agreements a
            WHERE a.organization_id = g.organization_id
              AND a.vendor_id = g.vendor_id
              AND a.project_id = p_project_id
              AND a.status <> 'cancelled'
              AND a.archived_at IS NULL
              AND (g.subcontract_agreement_id IS NULL OR g.subcontract_agreement_id = a.id)
          )
        )
    )
$fn$;

REVOKE ALL ON FUNCTION app.external_principal_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION app.external_has_scope(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.external_can_see_project(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.external_principal_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.external_has_scope(uuid, uuid, uuid, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.external_can_see_project(uuid, uuid) TO authenticated, service_role;

--------------------------------------------------------------------------------
-- 3. project_locations
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid NOT NULL,
  parent_id uuid,
  type text NOT NULL DEFAULT 'area',
  code text,
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_locations_type_known CHECK (type IN (
    'site', 'building', 'wing', 'floor', 'apartment', 'unit', 'room', 'area', 'zone',
    'parking', 'basement', 'roof', 'facade', 'infrastructure', 'other'
  )),
  CONSTRAINT project_locations_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT project_locations_not_own_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

ALTER TABLE public.project_locations DROP CONSTRAINT IF EXISTS project_locations_project_org_fk;
ALTER TABLE public.project_locations
  ADD CONSTRAINT project_locations_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS project_locations_id_organization_id_uq
  ON public.project_locations (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS project_locations_id_org_project_uq
  ON public.project_locations (id, organization_id, project_id);

ALTER TABLE public.project_locations DROP CONSTRAINT IF EXISTS project_locations_parent_fk;
ALTER TABLE public.project_locations
  ADD CONSTRAINT project_locations_parent_fk
  FOREIGN KEY (parent_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS project_locations_code_uq
  ON public.project_locations (
    organization_id, project_id,
    COALESCE(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(code)
  )
  WHERE code IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS project_locations_project_parent_idx
  ON public.project_locations (organization_id, project_id, parent_id, sort_order);

-- A location can never become its own ancestor.
CREATE OR REPLACE FUNCTION app.project_locations_no_cycle()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  cursor_id uuid := NEW.parent_id;
  hops integer := 0;
BEGIN
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW.id THEN
      RAISE EXCEPTION 'project_locations: cycle detected' USING ERRCODE = '23514';
    END IF;
    hops := hops + 1;
    IF hops > 32 THEN
      RAISE EXCEPTION 'project_locations: hierarchy too deep' USING ERRCODE = '23514';
    END IF;
    SELECT l.parent_id INTO cursor_id FROM public.project_locations l
      WHERE l.id = cursor_id AND l.organization_id = NEW.organization_id;
  END LOOP;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS project_locations_no_cycle ON public.project_locations;
CREATE TRIGGER project_locations_no_cycle
  BEFORE INSERT OR UPDATE OF parent_id ON public.project_locations
  FOR EACH ROW EXECUTE FUNCTION app.project_locations_no_cycle();

--------------------------------------------------------------------------------
-- 4. subcontract_work_lines (operational) + prices (financial)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.subcontract_work_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  agreement_id uuid NOT NULL,
  project_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  parent_line_id uuid,
  code text,
  description text NOT NULL,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(18, 6) NOT NULL DEFAULT 0,
  location_id uuid,
  work_package_id uuid,
  sort_order integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_work_lines_status_known CHECK (status IN ('active', 'closed', 'cancelled')),
  CONSTRAINT subcontract_work_lines_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT subcontract_work_lines_description_not_blank CHECK (length(btrim(description)) > 0),
  CONSTRAINT subcontract_work_lines_not_own_parent CHECK (parent_line_id IS NULL OR parent_line_id <> id)
);

ALTER TABLE public.subcontract_work_lines DROP CONSTRAINT IF EXISTS subcontract_work_lines_agreement_project_fk;
ALTER TABLE public.subcontract_work_lines
  ADD CONSTRAINT subcontract_work_lines_agreement_project_fk
  FOREIGN KEY (agreement_id, organization_id, project_id)
  REFERENCES public.subcontract_agreements (id, organization_id, project_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_work_lines DROP CONSTRAINT IF EXISTS subcontract_work_lines_agreement_vendor_fk;
ALTER TABLE public.subcontract_work_lines
  ADD CONSTRAINT subcontract_work_lines_agreement_vendor_fk
  FOREIGN KEY (agreement_id, organization_id, vendor_id)
  REFERENCES public.subcontract_agreements (id, organization_id, vendor_id) ON DELETE CASCADE;
ALTER TABLE public.subcontract_work_lines DROP CONSTRAINT IF EXISTS subcontract_work_lines_location_fk;
ALTER TABLE public.subcontract_work_lines
  ADD CONSTRAINT subcontract_work_lines_location_fk
  FOREIGN KEY (location_id, organization_id, project_id)
  REFERENCES public.project_locations (id, organization_id, project_id) ON DELETE SET NULL (location_id);

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_work_lines_id_organization_id_uq
  ON public.subcontract_work_lines (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS subcontract_work_lines_id_org_agreement_uq
  ON public.subcontract_work_lines (id, organization_id, agreement_id);

ALTER TABLE public.subcontract_work_lines DROP CONSTRAINT IF EXISTS subcontract_work_lines_parent_fk;
ALTER TABLE public.subcontract_work_lines
  ADD CONSTRAINT subcontract_work_lines_parent_fk
  FOREIGN KEY (parent_line_id, organization_id, agreement_id)
  REFERENCES public.subcontract_work_lines (id, organization_id, agreement_id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS subcontract_work_lines_code_uq
  ON public.subcontract_work_lines (organization_id, agreement_id, lower(code))
  WHERE code IS NOT NULL AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS subcontract_work_lines_agreement_idx
  ON public.subcontract_work_lines (organization_id, agreement_id, sort_order);
CREATE INDEX IF NOT EXISTS subcontract_work_lines_project_idx
  ON public.subcontract_work_lines (organization_id, project_id);

CREATE TABLE IF NOT EXISTS public.subcontract_work_line_prices (
  work_line_id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  currency char(3) NOT NULL,
  unit_price numeric(18, 6) NOT NULL DEFAULT 0,
  contract_amount numeric(18, 6) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subcontract_work_line_prices_non_negative CHECK (unit_price >= 0 AND contract_amount >= 0)
);

ALTER TABLE public.subcontract_work_line_prices DROP CONSTRAINT IF EXISTS subcontract_work_line_prices_line_org_fk;
ALTER TABLE public.subcontract_work_line_prices
  ADD CONSTRAINT subcontract_work_line_prices_line_org_fk
  FOREIGN KEY (work_line_id, organization_id)
  REFERENCES public.subcontract_work_lines (id, organization_id) ON DELETE CASCADE;

--------------------------------------------------------------------------------
-- 5. entity_links (generic relation, polymorphic; no cross-track FKs)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.entity_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  relation text NOT NULL DEFAULT 'related',
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_links_type_shape CHECK (
    source_type ~ '^[a-z][a-z0-9_]*$' AND target_type ~ '^[a-z][a-z0-9_]*$'
    AND relation ~ '^[a-z][a-z0-9_]*$'
  ),
  CONSTRAINT entity_links_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.entity_links DROP CONSTRAINT IF EXISTS entity_links_project_org_fk;
ALTER TABLE public.entity_links
  ADD CONSTRAINT entity_links_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS entity_links_edge_uq
  ON public.entity_links (organization_id, source_type, source_id, target_type, target_id, relation);
CREATE INDEX IF NOT EXISTS entity_links_source_idx
  ON public.entity_links (organization_id, source_type, source_id);
CREATE INDEX IF NOT EXISTS entity_links_target_idx
  ON public.entity_links (organization_id, target_type, target_id);

--------------------------------------------------------------------------------
-- 6. domain_events (typed outbox)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  project_id uuid,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  actor_type text NOT NULL DEFAULT 'internal',
  actor_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  actor_principal_id uuid REFERENCES public.external_principals (id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT domain_events_type_shape CHECK (event_type ~ '^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){2,}$'),
  CONSTRAINT domain_events_actor_shape CHECK (
    (actor_type = 'internal' AND actor_principal_id IS NULL)
    OR (actor_type = 'external' AND actor_principal_id IS NOT NULL AND actor_user_id IS NULL)
    OR (actor_type = 'system' AND actor_user_id IS NULL AND actor_principal_id IS NULL)
  )
);

ALTER TABLE public.domain_events DROP CONSTRAINT IF EXISTS domain_events_project_org_fk;
ALTER TABLE public.domain_events
  ADD CONSTRAINT domain_events_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects (id, organization_id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS domain_events_unprocessed_idx
  ON public.domain_events (occurred_at) WHERE processed_at IS NULL;
CREATE INDEX IF NOT EXISTS domain_events_entity_idx
  ON public.domain_events (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS domain_events_project_idx
  ON public.domain_events (organization_id, project_id, occurred_at DESC);

-- Immutable facts: only the processing bookkeeping columns may change; never deleted by clients.
CREATE OR REPLACE FUNCTION app.domain_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'domain_events are append-only' USING ERRCODE = '42501';
  END IF;
  IF (NEW.id, NEW.organization_id, NEW.project_id, NEW.event_type, NEW.entity_type, NEW.entity_id,
      NEW.actor_type, NEW.actor_user_id, NEW.actor_principal_id, NEW.payload, NEW.occurred_at)
     IS DISTINCT FROM
     (OLD.id, OLD.organization_id, OLD.project_id, OLD.event_type, OLD.entity_type, OLD.entity_id,
      OLD.actor_type, OLD.actor_user_id, OLD.actor_principal_id, OLD.payload, OLD.occurred_at) THEN
    RAISE EXCEPTION 'domain_events are append-only (only processing columns may change)' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$fn$;

DROP TRIGGER IF EXISTS domain_events_immutable ON public.domain_events;
CREATE TRIGGER domain_events_immutable
  BEFORE UPDATE OR DELETE ON public.domain_events
  FOR EACH ROW EXECUTE FUNCTION app.domain_events_immutable();

--------------------------------------------------------------------------------
-- 7. RLS + grants
--------------------------------------------------------------------------------

ALTER TABLE public.project_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_locations FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_lines FORCE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subcontract_work_line_prices FORCE ROW LEVEL SECURITY;
ALTER TABLE public.entity_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_links FORCE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;

-- project_locations: internal members with project access read; project.manage writes;
-- external contractors read locations of projects they work on.
DROP POLICY IF EXISTS project_locations_select ON public.project_locations;
CREATE POLICY project_locations_select ON public.project_locations
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id) AND app.can_access_project(organization_id, project_id))
    OR app.external_can_see_project(organization_id, project_id)
  );
DROP POLICY IF EXISTS project_locations_insert ON public.project_locations;
CREATE POLICY project_locations_insert ON public.project_locations
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'));
DROP POLICY IF EXISTS project_locations_update ON public.project_locations;
CREATE POLICY project_locations_update ON public.project_locations
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'))
  WITH CHECK (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'));
DROP POLICY IF EXISTS project_locations_delete ON public.project_locations;
CREATE POLICY project_locations_delete ON public.project_locations
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'project.manage'));
DROP POLICY IF EXISTS project_locations_service_all ON public.project_locations;
CREATE POLICY project_locations_service_all ON public.project_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_work_lines (operational; NO money columns).
DROP POLICY IF EXISTS subcontract_work_lines_select ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_select ON public.subcontract_work_lines
  FOR SELECT TO authenticated
  USING (
    (app.is_org_member(organization_id) AND app.can_access_project(organization_id, project_id)
      AND app.has_project_capability(organization_id, project_id, 'contractor.view'))
    OR app.external_has_scope(organization_id, project_id, vendor_id, agreement_id, 'ext.project.view')
  );
DROP POLICY IF EXISTS subcontract_work_lines_insert ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_insert ON public.subcontract_work_lines
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'contractor.coordinate')));
DROP POLICY IF EXISTS subcontract_work_lines_update ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_update ON public.subcontract_work_lines
  FOR UPDATE TO authenticated
  USING (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'contractor.coordinate')))
  WITH CHECK (app.is_org_member(organization_id) AND (
    app.has_project_capability(organization_id, project_id, 'contract.manage')
    OR app.has_project_capability(organization_id, project_id, 'contractor.coordinate')));
DROP POLICY IF EXISTS subcontract_work_lines_delete ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_delete ON public.subcontract_work_lines
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id)
    AND app.has_project_capability(organization_id, project_id, 'contract.manage'));
DROP POLICY IF EXISTS subcontract_work_lines_service_all ON public.subcontract_work_lines;
CREATE POLICY subcontract_work_lines_service_all ON public.subcontract_work_lines
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- subcontract_work_line_prices (financial): contract.financial.view reads, contract.manage writes,
-- the contractor reads only its own prices when granted ext.contract.view_value.
DROP POLICY IF EXISTS subcontract_work_line_prices_select ON public.subcontract_work_line_prices;
CREATE POLICY subcontract_work_line_prices_select ON public.subcontract_work_line_prices
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_work_lines l
    WHERE l.id = subcontract_work_line_prices.work_line_id
      AND l.organization_id = subcontract_work_line_prices.organization_id
      AND (
        (app.is_org_member(l.organization_id)
          AND app.has_project_capability(l.organization_id, l.project_id, 'contract.financial.view'))
        OR app.external_has_scope(l.organization_id, l.project_id, l.vendor_id, l.agreement_id,
          'ext.contract.view_value')
      )
  ));
DROP POLICY IF EXISTS subcontract_work_line_prices_write ON public.subcontract_work_line_prices;
CREATE POLICY subcontract_work_line_prices_write ON public.subcontract_work_line_prices
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.subcontract_work_lines l
    WHERE l.id = subcontract_work_line_prices.work_line_id
      AND l.organization_id = subcontract_work_line_prices.organization_id
      AND app.is_org_member(l.organization_id)
      AND app.has_project_capability(l.organization_id, l.project_id, 'contract.manage')))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.subcontract_work_lines l
    WHERE l.id = subcontract_work_line_prices.work_line_id
      AND l.organization_id = subcontract_work_line_prices.organization_id
      AND app.is_org_member(l.organization_id)
      AND app.has_project_capability(l.organization_id, l.project_id, 'contract.manage')));
DROP POLICY IF EXISTS subcontract_work_line_prices_service_all ON public.subcontract_work_line_prices;
CREATE POLICY subcontract_work_line_prices_service_all ON public.subcontract_work_line_prices
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- entity_links: internal members with project access; external principals never read or write
-- links directly (they go through application use-cases that write as service role).
DROP POLICY IF EXISTS entity_links_select ON public.entity_links;
CREATE POLICY entity_links_select ON public.entity_links
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id)));
DROP POLICY IF EXISTS entity_links_insert ON public.entity_links;
CREATE POLICY entity_links_insert ON public.entity_links
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id)
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id))
    AND actor_type = 'internal');
DROP POLICY IF EXISTS entity_links_delete ON public.entity_links;
CREATE POLICY entity_links_delete ON public.entity_links
  FOR DELETE TO authenticated
  USING (app.is_org_member(organization_id)
    AND (project_id IS NULL OR app.has_project_capability(organization_id, project_id, 'project.manage')));
DROP POLICY IF EXISTS entity_links_service_all ON public.entity_links;
CREATE POLICY entity_links_service_all ON public.entity_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- domain_events: org members append (own actor) and read for accessible projects; external
-- principals append events about projects they can see (own principal id only), never read.
DROP POLICY IF EXISTS domain_events_select ON public.domain_events;
CREATE POLICY domain_events_select ON public.domain_events
  FOR SELECT TO authenticated
  USING (app.is_org_member(organization_id)
    AND (project_id IS NULL OR app.can_access_project(organization_id, project_id)));
DROP POLICY IF EXISTS domain_events_insert_internal ON public.domain_events;
CREATE POLICY domain_events_insert_internal ON public.domain_events
  FOR INSERT TO authenticated
  WITH CHECK (app.is_org_member(organization_id) AND actor_type = 'internal'
    AND actor_user_id = app.current_user_id());
DROP POLICY IF EXISTS domain_events_insert_external ON public.domain_events;
CREATE POLICY domain_events_insert_external ON public.domain_events
  FOR INSERT TO authenticated
  WITH CHECK (actor_type = 'external' AND actor_principal_id = app.external_principal_id()
    AND app.external_can_see_project(organization_id, project_id));
DROP POLICY IF EXISTS domain_events_service_all ON public.domain_events;
CREATE POLICY domain_events_service_all ON public.domain_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_work_lines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcontract_work_line_prices TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.entity_links TO authenticated;
GRANT SELECT, INSERT ON public.domain_events TO authenticated;
GRANT ALL PRIVILEGES ON public.project_locations TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_work_lines TO service_role;
GRANT ALL PRIVILEGES ON public.subcontract_work_line_prices TO service_role;
GRANT ALL PRIVILEGES ON public.entity_links TO service_role;
GRANT ALL PRIVILEGES ON public.domain_events TO service_role;
