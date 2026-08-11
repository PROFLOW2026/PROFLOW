-- 0030_gap_closure_corrections_retention_recurring
-- Additive only. Does NOT edit 0000–0029 (APPLIED + IMMUTABLE).
-- UNAPPLIED — DO NOT run against owner Supabase until owner approves.
--
-- 1) Month-close economic corrections (closed history stays immutable)
-- 2) Retention / holdback: recognized vs payable/receivable now
-- 3) Recurring financial draft generation history (drafts only)

--------------------------------------------------------------------------------
-- 1) Month-close economic corrections
--------------------------------------------------------------------------------

ALTER TABLE public.month_close_adjustments
  ADD COLUMN IF NOT EXISTS amount numeric(18,6),
  ADD COLUMN IF NOT EXISTS currency char(3),
  ADD COLUMN IF NOT EXISTS effect_side text,
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS supersedes_adjustment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_close_adjustments_economic_complete'
  ) THEN
    ALTER TABLE public.month_close_adjustments
      ADD CONSTRAINT month_close_adjustments_economic_complete CHECK (
        (amount IS NULL AND currency IS NULL AND effect_side IS NULL)
        OR (
          amount IS NOT NULL
          AND currency IS NOT NULL
          AND effect_side IN ('cost', 'revenue')
          AND project_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_close_adjustments_project_org_fk'
  ) THEN
    ALTER TABLE public.month_close_adjustments
      ADD CONSTRAINT month_close_adjustments_project_org_fk
      FOREIGN KEY (project_id, organization_id)
      REFERENCES public.projects (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_close_adjustments_supersede_org_fk'
  ) THEN
    ALTER TABLE public.month_close_adjustments
      ADD CONSTRAINT month_close_adjustments_supersede_org_fk
      FOREIGN KEY (supersedes_adjustment_id, organization_id)
      REFERENCES public.month_close_adjustments (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS month_close_adjustments_supersedes_uq
  ON public.month_close_adjustments (organization_id, supersedes_adjustment_id)
  WHERE supersedes_adjustment_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'month_close_adjustments_no_self_supersede'
  ) THEN
    ALTER TABLE public.month_close_adjustments
      ADD CONSTRAINT month_close_adjustments_no_self_supersede
      CHECK (supersedes_adjustment_id IS DISTINCT FROM id);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.month_close_adjustments_supersede_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target public.month_close_adjustments%ROWTYPE;
  period_status text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'month_close_adjustments' THEN
    RAISE EXCEPTION 'month_close_adjustments: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'month_close_adjustments: rows are immutable after insert'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.supersedes_adjustment_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.supersedes_adjustment_id = NEW.id THEN
    RAISE EXCEPTION 'month_close_adjustments: cannot supersede itself'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.amount IS NULL OR NEW.currency IS NULL OR NEW.effect_side IS NULL OR NEW.project_id IS NULL THEN
    RAISE EXCEPTION 'month_close_adjustments: a superseding row must be economically complete'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT * INTO target
    FROM public.month_close_adjustments
   WHERE id = NEW.supersedes_adjustment_id
     AND organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'month_close_adjustments: superseded row not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF target.amount IS NULL OR target.currency IS NULL OR target.effect_side IS NULL OR target.project_id IS NULL THEN
    RAISE EXCEPTION 'month_close_adjustments: cannot supersede an audit-only row'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF target.period_id IS DISTINCT FROM NEW.period_id THEN
    RAISE EXCEPTION 'month_close_adjustments: supersede must stay in the same closed period'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF target.project_id IS DISTINCT FROM NEW.project_id THEN
    RAISE EXCEPTION 'month_close_adjustments: supersede must keep the same project'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF target.effect_side IS DISTINCT FROM NEW.effect_side THEN
    RAISE EXCEPTION 'month_close_adjustments: supersede must keep the same economic side'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF target.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'month_close_adjustments: supersede must keep the same currency'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT status INTO period_status
    FROM public.month_close_periods
   WHERE id = NEW.period_id
     AND organization_id = NEW.organization_id;
  IF period_status IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'month_close_adjustments: economic supersede requires a closed period'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS month_close_adjustments_supersede_guard ON public.month_close_adjustments;
CREATE TRIGGER month_close_adjustments_supersede_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.month_close_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION app.month_close_adjustments_supersede_guard();

CREATE OR REPLACE FUNCTION app.month_close_adjustments_economic_currency_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  project_currency char(3);
  org_currency char(3);
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'month_close_adjustments' THEN
    RAISE EXCEPTION 'month_close_adjustments: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'month_close_adjustments: rows are immutable after insert'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.amount IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.base_currency INTO org_currency
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;
  IF org_currency IS NULL THEN
    RAISE EXCEPTION 'month_close_adjustments: organization not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT p.currency INTO project_currency
    FROM public.projects p
   WHERE p.id = NEW.project_id
     AND p.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'month_close_adjustments: project not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF coalesce(project_currency, org_currency) IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'month_close_adjustments: currency must match the project (or organization base)'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS month_close_adjustments_economic_currency_guard ON public.month_close_adjustments;
CREATE TRIGGER month_close_adjustments_economic_currency_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.month_close_adjustments
  FOR EACH ROW
  EXECUTE FUNCTION app.month_close_adjustments_economic_currency_guard();

CREATE INDEX IF NOT EXISTS month_close_adjustments_org_project_idx
  ON public.month_close_adjustments (organization_id, project_id)
  WHERE amount IS NOT NULL;

--------------------------------------------------------------------------------
-- 2) Retention / holdback on AP bills and billing records
--------------------------------------------------------------------------------

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS retention_amount numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_held_remaining numeric(18,6) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_bills_retention_range'
  ) THEN
    ALTER TABLE public.ap_bills
      ADD CONSTRAINT ap_bills_retention_range CHECK (
        retention_amount >= 0
        AND retention_held_remaining >= 0
        AND retention_held_remaining <= retention_amount
        AND retention_amount <= total_amount
      );
  END IF;
END $$;

ALTER TABLE public.billing_records
  ADD COLUMN IF NOT EXISTS retention_amount numeric(18,6) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS retention_held_remaining numeric(18,6) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_records_retention_range'
  ) THEN
    ALTER TABLE public.billing_records
      ADD CONSTRAINT billing_records_retention_range CHECK (
        retention_amount >= 0
        AND retention_held_remaining >= 0
        AND retention_held_remaining <= retention_amount
        AND retention_amount <= total_amount
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'billing_records_credit_note_no_retention'
  ) THEN
    ALTER TABLE public.billing_records
      ADD CONSTRAINT billing_records_credit_note_no_retention CHECK (
        kind <> 'credit_note'
        OR (retention_amount = 0 AND retention_held_remaining = 0)
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.retention_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  side text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  amount numeric(18,6) NOT NULL,
  currency char(3) NOT NULL,
  released_on date NOT NULL,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT retention_releases_side_known CHECK (side IN ('ap', 'ar')),
  CONSTRAINT retention_releases_source_known CHECK (source_type IN ('vendor_bill', 'billing_record')),
  CONSTRAINT retention_releases_amount_positive CHECK (amount > 0),
  CONSTRAINT retention_releases_side_source_match CHECK (
    (side = 'ap' AND source_type = 'vendor_bill')
    OR (side = 'ar' AND source_type = 'billing_record')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS retention_releases_id_organization_id_uq
  ON public.retention_releases (id, organization_id);
CREATE INDEX IF NOT EXISTS retention_releases_org_source_idx
  ON public.retention_releases (organization_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS app.retention_release_in_progress (
  source_id uuid PRIMARY KEY
);
DO $$
BEGIN
  REVOKE ALL ON TABLE app.retention_release_in_progress FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE app.retention_release_in_progress FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE app.retention_release_in_progress FROM anon;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.retention_releases_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  held numeric(18,6);
  src_currency char(3);
  org_today date;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'retention_releases' THEN
    RAISE EXCEPTION 'retention_releases: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'retention_releases: release rows are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT app.is_org_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'retention_releases: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (NEW.side = 'ap' AND NOT app.has_org_permission(NEW.organization_id, 'ap.manage'))
     OR (NEW.side = 'ar' AND NOT app.has_org_permission(NEW.organization_id, 'billing.manage')) THEN
    RAISE EXCEPTION 'retention_releases: missing permission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  NEW.created_by_user_id := app.current_user_id();
  IF NEW.created_by_user_id IS NULL THEN
    RAISE EXCEPTION 'retention_releases: creator must be the current user'
      USING ERRCODE = 'restrict_violation';
  END IF;

  SELECT (timezone(o.timezone, now()))::date INTO org_today
    FROM public.organizations o
   WHERE o.id = NEW.organization_id;
  IF org_today IS NULL THEN
    RAISE EXCEPTION 'retention_releases: organization not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.released_on > org_today THEN
    RAISE EXCEPTION 'retention_releases: released_on cannot be in the future'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.side = 'ap' THEN
    SELECT currency, retention_held_remaining
      INTO src_currency, held
      FROM public.ap_bills
     WHERE id = NEW.source_id
       AND organization_id = NEW.organization_id
       AND archived_at IS NULL
       AND status IN ('open', 'partially_matched', 'matched')
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'retention_releases: vendor bill not found or not posted'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF src_currency IS DISTINCT FROM NEW.currency THEN
      RAISE EXCEPTION 'retention_releases: currency must match the bill'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.amount > held THEN
      RAISE EXCEPTION 'retention_releases: amount exceeds held remaining'
        USING ERRCODE = 'restrict_violation';
    END IF;
    INSERT INTO app.retention_release_in_progress (source_id) VALUES (NEW.source_id);
    UPDATE public.ap_bills
       SET retention_held_remaining = retention_held_remaining - NEW.amount,
           updated_at = now()
     WHERE id = NEW.source_id
       AND organization_id = NEW.organization_id;
    DELETE FROM app.retention_release_in_progress WHERE source_id = NEW.source_id;
  ELSE
    SELECT currency, retention_held_remaining
      INTO src_currency, held
      FROM public.billing_records
     WHERE id = NEW.source_id
       AND organization_id = NEW.organization_id
       AND archived_at IS NULL
       AND status = 'finalized'
       AND kind <> 'credit_note'
     FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'retention_releases: billing record not found or not finalized'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF src_currency IS DISTINCT FROM NEW.currency THEN
      RAISE EXCEPTION 'retention_releases: currency must match the billing record'
        USING ERRCODE = 'restrict_violation';
    END IF;
    IF NEW.amount > held THEN
      RAISE EXCEPTION 'retention_releases: amount exceeds held remaining'
        USING ERRCODE = 'restrict_violation';
    END IF;
    INSERT INTO app.retention_release_in_progress (source_id) VALUES (NEW.source_id);
    UPDATE public.billing_records
       SET retention_held_remaining = retention_held_remaining - NEW.amount,
           updated_at = now()
     WHERE id = NEW.source_id
       AND organization_id = NEW.organization_id;
    DELETE FROM app.retention_release_in_progress WHERE source_id = NEW.source_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS retention_releases_guard ON public.retention_releases;
CREATE TRIGGER retention_releases_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.retention_releases
  FOR EACH ROW
  EXECUTE FUNCTION app.retention_releases_guard();

ALTER TABLE public.retention_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.retention_releases FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_releases_tenant_select ON public.retention_releases;
CREATE POLICY retention_releases_tenant_select ON public.retention_releases
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (side = 'ap' AND (
        app.has_org_permission(organization_id, 'ap.read')
        OR app.has_org_permission(organization_id, 'ap.manage')
      ))
      OR (side = 'ar' AND (
        app.has_org_permission(organization_id, 'billing.read')
        OR app.has_org_permission(organization_id, 'billing.manage')
      ))
    )
  );

DROP POLICY IF EXISTS retention_releases_tenant_insert ON public.retention_releases;
CREATE POLICY retention_releases_tenant_insert ON public.retention_releases
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND created_by_user_id = app.current_user_id()
    AND (
      (side = 'ap' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (side = 'ar' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

-- UPDATE/DELETE policies exist so the immutability trigger can raise instead of
-- RLS silently matching 0 rows. The trigger rejects every mutation.
DROP POLICY IF EXISTS retention_releases_tenant_update ON public.retention_releases;
CREATE POLICY retention_releases_tenant_update ON public.retention_releases
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (side = 'ap' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (side = 'ar' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (side = 'ap' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (side = 'ar' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS retention_releases_tenant_delete ON public.retention_releases;
CREATE POLICY retention_releases_tenant_delete ON public.retention_releases
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (side = 'ap' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (side = 'ar' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS retention_releases_service_all ON public.retention_releases;
CREATE POLICY retention_releases_service_all ON public.retention_releases
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- 3) Recurring financial draft generation history (drafts only)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recurring_financial_draft_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  run_date date NOT NULL,
  generated_entity_type text NOT NULL,
  generated_entity_id uuid NOT NULL,
  notes text,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT recurring_financial_draft_runs_type_known CHECK (
    generated_entity_type IN ('expense', 'vendor_bill', 'billing_record')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_financial_draft_runs_id_organization_id_uq
  ON public.recurring_financial_draft_runs (id, organization_id);
CREATE UNIQUE INDEX IF NOT EXISTS recurring_financial_draft_runs_draft_date_uq
  ON public.recurring_financial_draft_runs (organization_id, draft_id, run_date);
DROP INDEX IF EXISTS public.recurring_financial_draft_runs_entity_uq;
CREATE UNIQUE INDEX recurring_financial_draft_runs_entity_uq
  ON public.recurring_financial_draft_runs (organization_id, generated_entity_type, generated_entity_id);
CREATE INDEX IF NOT EXISTS recurring_financial_draft_runs_org_draft_idx
  ON public.recurring_financial_draft_runs (organization_id, draft_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'recurring_financial_draft_runs_draft_org_fk'
  ) THEN
    ALTER TABLE public.recurring_financial_draft_runs
      ADD CONSTRAINT recurring_financial_draft_runs_draft_org_fk
      FOREIGN KEY (draft_id, organization_id)
      REFERENCES public.recurring_financial_drafts (id, organization_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app.recurring_financial_draft_runs_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  draft_status text;
  draft_kind text;
  entity_status text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME IS DISTINCT FROM 'recurring_financial_draft_runs' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generation history is immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NOT app.is_org_member(NEW.organization_id) THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: not an organization member'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT d.status, d.draft_kind
    INTO draft_status, draft_kind
    FROM public.recurring_financial_drafts d
   WHERE d.id = NEW.draft_id
     AND d.organization_id = NEW.organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: draft not found in organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF draft_status IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: draft must be active to generate'
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF draft_kind IS DISTINCT FROM NEW.generated_entity_type THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity type must match draft kind'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.generated_entity_type = 'expense' THEN
    SELECT e.status INTO entity_status
      FROM public.expenses e
     WHERE e.id = NEW.generated_entity_id
       AND e.organization_id = NEW.organization_id
     FOR UPDATE;
  ELSIF NEW.generated_entity_type = 'vendor_bill' THEN
    SELECT b.status INTO entity_status
      FROM public.ap_bills b
     WHERE b.id = NEW.generated_entity_id
       AND b.organization_id = NEW.organization_id
     FOR UPDATE;
  ELSIF NEW.generated_entity_type = 'billing_record' THEN
    SELECT r.status INTO entity_status
      FROM public.billing_records r
     WHERE r.id = NEW.generated_entity_id
       AND r.organization_id = NEW.organization_id
     FOR UPDATE;
  END IF;

  IF entity_status IS NULL THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity must exist in the same organization'
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF entity_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated entity must remain draft'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recurring_financial_draft_runs_guard ON public.recurring_financial_draft_runs;
CREATE TRIGGER recurring_financial_draft_runs_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.recurring_financial_draft_runs
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_financial_draft_runs_guard();

ALTER TABLE public.recurring_financial_draft_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_financial_draft_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS recurring_financial_draft_runs_tenant_select ON public.recurring_financial_draft_runs;
CREATE POLICY recurring_financial_draft_runs_tenant_select ON public.recurring_financial_draft_runs
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND (
          (d.draft_kind = 'expense' AND (
            app.has_org_permission(organization_id, 'expenses.read')
            OR app.has_org_permission(organization_id, 'expenses.create')
          ))
          OR (d.draft_kind = 'vendor_bill' AND (
            app.has_org_permission(organization_id, 'ap.read')
            OR app.has_org_permission(organization_id, 'ap.manage')
          ))
          OR (d.draft_kind = 'billing_record' AND (
            app.has_org_permission(organization_id, 'billing.read')
            OR app.has_org_permission(organization_id, 'billing.manage')
          ))
        )
    )
  );

DROP POLICY IF EXISTS recurring_financial_draft_runs_tenant_insert ON public.recurring_financial_draft_runs;
CREATE POLICY recurring_financial_draft_runs_tenant_insert ON public.recurring_financial_draft_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND d.status = 'active'
        AND (
          (d.draft_kind = 'expense' AND generated_entity_type = 'expense'
            AND app.has_org_permission(organization_id, 'expenses.create'))
          OR (d.draft_kind = 'vendor_bill' AND generated_entity_type = 'vendor_bill'
            AND app.has_org_permission(organization_id, 'ap.manage'))
          OR (d.draft_kind = 'billing_record' AND generated_entity_type = 'billing_record'
            AND app.has_org_permission(organization_id, 'billing.manage'))
        )
    )
  );

-- So the immutability trigger raises instead of RLS matching 0 rows.
DROP POLICY IF EXISTS recurring_financial_draft_runs_tenant_update ON public.recurring_financial_draft_runs;
CREATE POLICY recurring_financial_draft_runs_tenant_update ON public.recurring_financial_draft_runs
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND (
          (d.draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
          OR (d.draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
          OR (d.draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
        )
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND (
          (d.draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
          OR (d.draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
          OR (d.draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
        )
    )
  );

DROP POLICY IF EXISTS recurring_financial_draft_runs_tenant_delete ON public.recurring_financial_draft_runs;
CREATE POLICY recurring_financial_draft_runs_tenant_delete ON public.recurring_financial_draft_runs
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND EXISTS (
      SELECT 1 FROM public.recurring_financial_drafts d
      WHERE d.id = draft_id
        AND d.organization_id = organization_id
        AND (
          (d.draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
          OR (d.draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
          OR (d.draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
        )
    )
  );

DROP POLICY IF EXISTS recurring_financial_draft_runs_service_all ON public.recurring_financial_draft_runs;
CREATE POLICY recurring_financial_draft_runs_service_all ON public.recurring_financial_draft_runs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Held remaining / retention_amount invariants.
-- Session GUCs are not a security authority. The only writer of held remaining
-- after post is app.retention_releases_guard, which inserts a row into
-- app.retention_release_in_progress (authenticated has no table privilege).
CREATE OR REPLACE FUNCTION app.retention_source_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME NOT IN ('ap_bills', 'billing_records') THEN
    RAISE EXCEPTION 'retention: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'void')
       AND NEW.retention_held_remaining IS DISTINCT FROM NEW.retention_amount THEN
      RAISE EXCEPTION 'retention: held remaining must equal retention amount when posted'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM 'draft' AND NEW.status = 'draft' THEN
    RAISE EXCEPTION 'retention: cannot revert posted/finalized/void to draft'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.status IS DISTINCT FROM 'draft'
     AND NEW.retention_amount IS DISTINCT FROM OLD.retention_amount THEN
    RAISE EXCEPTION 'retention_amount: immutable after post'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status NOT IN ('draft', 'void') AND OLD.status IN ('draft', 'void') THEN
    IF NEW.retention_held_remaining IS DISTINCT FROM NEW.retention_amount THEN
      RAISE EXCEPTION 'retention: held remaining must equal retention amount on post'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF NEW.retention_held_remaining IS DISTINCT FROM OLD.retention_held_remaining THEN
    IF EXISTS (
         SELECT 1 FROM app.retention_release_in_progress p WHERE p.source_id = NEW.id
       )
       AND NEW.retention_held_remaining < OLD.retention_held_remaining
       AND NEW.retention_amount IS NOT DISTINCT FROM OLD.retention_amount
       AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'retention_held_remaining: only a retention release may reduce held remaining after post'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_bills_retention_held_exclusive ON public.ap_bills;
DROP TRIGGER IF EXISTS ap_bills_retention_invariants ON public.ap_bills;
CREATE TRIGGER ap_bills_retention_invariants
  BEFORE INSERT OR UPDATE ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.retention_source_invariants();

DROP TRIGGER IF EXISTS billing_records_retention_held_exclusive ON public.billing_records;
DROP TRIGGER IF EXISTS billing_records_retention_invariants ON public.billing_records;
CREATE TRIGGER billing_records_retention_invariants
  BEFORE INSERT OR UPDATE ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.retention_source_invariants();

DROP FUNCTION IF EXISTS app.retention_held_remaining_exclusive();

-- Recurring draft template policies: generate/manage uses expenses.create (not finalize).
-- SELECT allowed with read OR write so a generate-capable custom role is not blocked.
DROP POLICY IF EXISTS recurring_financial_drafts_tenant_select ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_select ON public.recurring_financial_drafts
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND (
        app.has_org_permission(organization_id, 'expenses.read')
        OR app.has_org_permission(organization_id, 'expenses.create')
      ))
      OR (draft_kind = 'vendor_bill' AND (
        app.has_org_permission(organization_id, 'ap.read')
        OR app.has_org_permission(organization_id, 'ap.manage')
      ))
      OR (draft_kind = 'billing_record' AND (
        app.has_org_permission(organization_id, 'billing.read')
        OR app.has_org_permission(organization_id, 'billing.manage')
      ))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_insert ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_insert ON public.recurring_financial_drafts
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_update ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_update ON public.recurring_financial_drafts
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

DROP POLICY IF EXISTS recurring_financial_drafts_tenant_delete ON public.recurring_financial_drafts;
CREATE POLICY recurring_financial_drafts_tenant_delete ON public.recurring_financial_drafts
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND (
      (draft_kind = 'expense' AND app.has_org_permission(organization_id, 'expenses.create'))
      OR (draft_kind = 'vendor_bill' AND app.has_org_permission(organization_id, 'ap.manage'))
      OR (draft_kind = 'billing_record' AND app.has_org_permission(organization_id, 'billing.manage'))
    )
  );

CREATE OR REPLACE FUNCTION app.recurring_generated_entity_delete_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  entity_type text;
BEGIN
  IF TG_TABLE_SCHEMA IS DISTINCT FROM 'public'
     OR TG_TABLE_NAME NOT IN ('expenses', 'ap_bills', 'billing_records') THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: invalid trigger origin'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  entity_type := CASE TG_TABLE_NAME
    WHEN 'expenses' THEN 'expense'
    WHEN 'ap_bills' THEN 'vendor_bill'
    WHEN 'billing_records' THEN 'billing_record'
  END;
  IF EXISTS (
    SELECT 1
      FROM public.recurring_financial_draft_runs r
     WHERE r.organization_id = OLD.organization_id
       AND r.generated_entity_type = entity_type
       AND r.generated_entity_id = OLD.id
  ) THEN
    RAISE EXCEPTION 'recurring_financial_draft_runs: generated draft entity cannot be deleted'
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS expenses_recurring_run_delete_guard ON public.expenses;
CREATE TRIGGER expenses_recurring_run_delete_guard
  BEFORE DELETE ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_generated_entity_delete_guard();

DROP TRIGGER IF EXISTS ap_bills_recurring_run_delete_guard ON public.ap_bills;
CREATE TRIGGER ap_bills_recurring_run_delete_guard
  BEFORE DELETE ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_generated_entity_delete_guard();

DROP TRIGGER IF EXISTS billing_records_recurring_run_delete_guard ON public.billing_records;
CREATE TRIGGER billing_records_recurring_run_delete_guard
  BEFORE DELETE ON public.billing_records
  FOR EACH ROW
  EXECUTE FUNCTION app.recurring_generated_entity_delete_guard();

REVOKE ALL ON FUNCTION app.month_close_adjustments_supersede_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.month_close_adjustments_supersede_guard() TO service_role;
REVOKE ALL ON FUNCTION app.month_close_adjustments_economic_currency_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.month_close_adjustments_economic_currency_guard() TO service_role;
REVOKE ALL ON FUNCTION app.retention_releases_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retention_releases_guard() TO service_role;
REVOKE ALL ON FUNCTION app.recurring_financial_draft_runs_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recurring_financial_draft_runs_guard() TO service_role;
REVOKE ALL ON FUNCTION app.retention_source_invariants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.retention_source_invariants() TO service_role;
REVOKE ALL ON FUNCTION app.recurring_generated_entity_delete_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.recurring_generated_entity_delete_guard() TO service_role;
