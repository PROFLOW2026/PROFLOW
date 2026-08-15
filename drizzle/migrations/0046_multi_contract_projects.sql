-- 0046_multi_contract_projects
-- Additive only. Does NOT modify 0000–0045.
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- Multi-contract projects: extra commercial identity on contracts, BOQ/billing
-- scoped to a contract, project aggregate remains the sum of contracts.
-- Existing single-contract projects keep one primary row; backfill is idempotent.

--------------------------------------------------------------------------------
-- Shared RLS installer (reused by 0047–0050)
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.install_permissioned_rls(
  p_table text,
  p_select_perm text,
  p_write_perm text
) RETURNS void
LANGUAGE plpgsql
AS $fn$
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', p_table);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', p_table);

  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_select', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_insert', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_update', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_delete', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_tenant_write', p_table);
  EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p_table || '_service_all', p_table);

  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR SELECT TO authenticated
    USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, %L))
    $policy$,
    p_table || '_tenant_select', p_table, p_select_perm
  );

  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
    WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, %L))
    $policy$,
    p_table || '_tenant_insert', p_table, p_write_perm
  );

  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
    USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, %L))
    WITH CHECK (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, %L))
    $policy$,
    p_table || '_tenant_update', p_table, p_write_perm, p_write_perm
  );

  EXECUTE format(
    $policy$
    CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
    USING (app.is_org_member(organization_id) AND app.has_org_permission(organization_id, %L))
    $policy$,
    p_table || '_tenant_delete', p_table, p_write_perm
  );

  EXECUTE format(
    'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
    p_table || '_service_all', p_table
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.install_permissioned_rls(text, text, text) FROM PUBLIC;

--------------------------------------------------------------------------------
-- Permissions
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('notifications.read', 'organization', 'View in-app notifications'),
  ('time.approve', 'workforce', 'Approve, return and lock timesheets'),
  ('projects.access_all', 'projects', 'See every project regardless of assignment-scoped access mode'),
  ('scheduling.read', 'workforce', 'View resource scheduling and availability'),
  ('scheduling.manage', 'workforce', 'Create and change resource bookings'),
  ('safety.read', 'projects', 'View safety and HSE records'),
  ('safety.manage', 'projects', 'Create and close safety records and actions')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

INSERT INTO public.role_permissions (organization_id, role_id, permission_key)
SELECT r.organization_id, r.id, p.permission_key
FROM public.roles r
CROSS JOIN (
  VALUES
    ('owner', 'notifications.read'),
    ('owner', 'time.approve'),
    ('owner', 'projects.access_all'),
    ('owner', 'scheduling.read'),
    ('owner', 'scheduling.manage'),
    ('owner', 'safety.read'),
    ('owner', 'safety.manage'),
    ('manager', 'notifications.read'),
    ('manager', 'time.approve'),
    ('manager', 'projects.access_all'),
    ('manager', 'scheduling.read'),
    ('manager', 'scheduling.manage'),
    ('manager', 'safety.read'),
    ('manager', 'safety.manage'),
    ('finance', 'notifications.read'),
    ('finance', 'time.approve'),
    ('finance', 'projects.access_all'),
    ('finance', 'scheduling.read'),
    ('finance', 'safety.read'),
    ('worker', 'notifications.read'),
    ('worker', 'safety.read'),
    ('worker', 'scheduling.read')
) AS p(role_key, permission_key)
WHERE r.key = p.role_key
ON CONFLICT DO NOTHING;

--------------------------------------------------------------------------------
-- Contracts: extra identity (schema already allowed many-per-project)
--------------------------------------------------------------------------------

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_type text NOT NULL DEFAULT 'primary',
  ADD COLUMN IF NOT EXISTS contract_number text,
  ADD COLUMN IF NOT EXISTS client_id uuid,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS retention_percent numeric(9,6);

UPDATE public.contracts
SET contract_type = CASE WHEN is_primary THEN 'primary' ELSE 'additional' END
WHERE contract_type IS NULL OR (is_primary AND contract_type = 'primary')
   OR ((NOT is_primary) AND contract_type = 'primary');

UPDATE public.contracts
SET contract_type = 'additional'
WHERE is_primary = false AND contract_type = 'primary';

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_type_known;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_type_known
  CHECK (contract_type IN ('primary', 'additional', 'secondary'));

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_date_order;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_date_order
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);

ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_retention_percent_range;
ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_retention_percent_range
  CHECK (retention_percent IS NULL OR (retention_percent >= 0 AND retention_percent <= 100));

CREATE UNIQUE INDEX IF NOT EXISTS contracts_id_organization_id_uq
  ON public.contracts (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS contracts_org_number_uq
  ON public.contracts (organization_id, contract_number)
  WHERE contract_number IS NOT NULL AND archived_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'contracts_client_org_fk') THEN
    ALTER TABLE public.contracts
      ADD CONSTRAINT contracts_client_org_fk
      FOREIGN KEY (client_id, organization_id)
      REFERENCES public.clients (id, organization_id)
      ON DELETE SET NULL (client_id);
  END IF;
END $$;

--------------------------------------------------------------------------------
-- BOQ belongs to a contract (nullable for jobs without a contract)
--------------------------------------------------------------------------------

ALTER TABLE public.project_boqs
  ADD COLUMN IF NOT EXISTS contract_id uuid;

UPDATE public.project_boqs b
SET contract_id = c.id
FROM public.contracts c
WHERE b.contract_id IS NULL
  AND c.project_id = b.project_id
  AND c.organization_id = b.organization_id
  AND c.is_primary = true
  AND c.archived_at IS NULL;

DROP INDEX IF EXISTS public.project_boqs_one_active_per_project_uq;
DROP INDEX IF EXISTS public.project_boqs_project_version_uq;

CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_project_version_unscoped_uq
  ON public.project_boqs (organization_id, project_id, version_number)
  WHERE contract_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_project_contract_version_uq
  ON public.project_boqs (organization_id, project_id, contract_id, version_number)
  WHERE contract_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_one_active_unscoped_uq
  ON public.project_boqs (organization_id, project_id)
  WHERE status = 'active' AND archived_at IS NULL AND contract_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS project_boqs_one_active_per_contract_uq
  ON public.project_boqs (organization_id, project_id, contract_id)
  WHERE status = 'active' AND archived_at IS NULL AND contract_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_boqs_contract_idx
  ON public.project_boqs (organization_id, contract_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_boqs_contract_org_fk') THEN
    ALTER TABLE public.project_boqs
      ADD CONSTRAINT project_boqs_contract_org_fk
      FOREIGN KEY (contract_id, organization_id)
      REFERENCES public.contracts (id, organization_id)
      ON DELETE SET NULL (contract_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.project_boqs_contract_project_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.contract_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = NEW.contract_id
      AND c.organization_id = NEW.organization_id
      AND c.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'project_boqs: contract must belong to the same project and organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS project_boqs_contract_project_guard ON public.project_boqs;
CREATE TRIGGER project_boqs_contract_project_guard
  BEFORE INSERT OR UPDATE OF contract_id, project_id, organization_id
  ON public.project_boqs
  FOR EACH ROW
  EXECUTE FUNCTION app.project_boqs_contract_project_guard();

REVOKE ALL ON FUNCTION app.project_boqs_contract_project_guard() FROM PUBLIC;

--------------------------------------------------------------------------------
-- AR billing linked to a contract; source for work-order billing
--------------------------------------------------------------------------------

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS contract_id uuid,
  ADD COLUMN IF NOT EXISTS source_kind text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_id uuid;

UPDATE public.billing_records b
SET contract_id = c.id
FROM public.contracts c
WHERE b.contract_id IS NULL
  AND b.project_id IS NOT NULL
  AND c.project_id = b.project_id
  AND c.organization_id = b.organization_id
  AND c.is_primary = true
  AND c.archived_at IS NULL;

ALTER TABLE public.billing_records DROP CONSTRAINT IF EXISTS billing_records_source_kind_known;
ALTER TABLE public.billing_records
  ADD CONSTRAINT billing_records_source_kind_known
  CHECK (source_kind IN ('manual', 'boq_progress', 'work_order', 'retention_release'));

CREATE INDEX IF NOT EXISTS billing_records_contract_idx
  ON public.billing_records (organization_id, contract_id);

CREATE INDEX IF NOT EXISTS billing_records_source_idx
  ON public.billing_records (organization_id, source_kind, source_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'billing_records_contract_org_fk') THEN
    ALTER TABLE public.billing_records
      ADD CONSTRAINT billing_records_contract_org_fk
      FOREIGN KEY (contract_id, organization_id)
      REFERENCES public.contracts (id, organization_id)
      ON DELETE SET NULL (contract_id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.billing_records_contract_project_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.contract_id IS NULL OR NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.contracts c
    WHERE c.id = NEW.contract_id
      AND c.organization_id = NEW.organization_id
      AND c.project_id = NEW.project_id
  ) THEN
    RAISE EXCEPTION 'billing_records: contract must belong to the same project and organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS billing_records_contract_project_guard ON public.billing_records;
CREATE TRIGGER billing_records_contract_project_guard
  BEFORE INSERT OR UPDATE OF contract_id, project_id, organization_id
  ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.billing_records_contract_project_guard();

REVOKE ALL ON FUNCTION app.billing_records_contract_project_guard() FROM PUBLIC;

COMMENT ON COLUMN public.contracts.contract_type IS
  'UX kind. is_primary remains the unique commercial primary per project.';
COMMENT ON COLUMN public.project_boqs.contract_id IS
  'Optional contract scope. Null = unscoped / legacy single-contract BOQ.';
COMMENT ON COLUMN public.billing_records.contract_id IS
  'Optional AR contract scope. Project aggregate is the sum of contracts.';
