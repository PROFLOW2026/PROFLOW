-- 0022_master_completion_foundations
-- Additive only. Does NOT edit 0000–0021.
-- UNAPPLIED draft — DO NOT run against owner Supabase until owner approves.
--
-- Includes:
--   1) Dated vendor_engagements (start/end) — Engagement ≠ Actual
--   2) Time entry lifecycle (recorded/void + correction link) — no silent rewrite
--   3) Attendance days/events — Attendance ≠ project time ≠ Actual
--   4) AP vendor credits — Credits ≠ payments; reduce economic cost / outstanding
--   5) Catalog permissions for attendance
--
-- Soft-archive/restore for employees/clients/vendors/projects needs NO new columns.

--------------------------------------------------------------------------------
-- Permissions
--------------------------------------------------------------------------------

INSERT INTO public.permissions (key, category, description) VALUES
  ('attendance.read', 'workforce', 'View attendance records for the organization'),
  ('attendance.manage', 'workforce', 'Enter and correct attendance for any employee'),
  ('attendance.self', 'workforce', 'Clock in/out and view own attendance only')
ON CONFLICT (key) DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description;

--------------------------------------------------------------------------------
-- 1) Dated vendor engagements
--------------------------------------------------------------------------------

ALTER TABLE public.vendor_engagements
  ADD COLUMN IF NOT EXISTS "start_date" date,
  ADD COLUMN IF NOT EXISTS "end_date" date,
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_engagements_status_known'
  ) THEN
    ALTER TABLE public.vendor_engagements
      ADD CONSTRAINT "vendor_engagements_status_known"
      CHECK ("status" IN ('active', 'ended', 'cancelled'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vendor_engagements_date_order'
  ) THEN
    ALTER TABLE public.vendor_engagements
      ADD CONSTRAINT "vendor_engagements_date_order"
      CHECK ("end_date" IS NULL OR "start_date" IS NULL OR "end_date" >= "start_date");
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "vendor_engagements_org_dates_idx"
  ON public.vendor_engagements ("organization_id", "start_date", "end_date");

--------------------------------------------------------------------------------
-- 2) Time entry lifecycle (correction without silent overwrite)
--------------------------------------------------------------------------------

ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'recorded',
  ADD COLUMN IF NOT EXISTS "voided_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "corrects_entry_id" uuid,
  ADD COLUMN IF NOT EXISTS "bulk_batch_id" uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_status_known'
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT "time_entries_status_known"
      CHECK ("status" IN ('recorded', 'void'));
  END IF;
END $$;

-- Tenant-safe correction target: same organization as the correcting row.
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_id_organization_id_uq"
  ON public.time_entries ("id", "organization_id");

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_corrects_entry_fk'
  ) THEN
    ALTER TABLE public.time_entries
      DROP CONSTRAINT "time_entries_corrects_entry_fk";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'time_entries_corrects_entry_org_fk'
  ) THEN
    ALTER TABLE public.time_entries
      ADD CONSTRAINT "time_entries_corrects_entry_org_fk"
      FOREIGN KEY ("corrects_entry_id", "organization_id")
      REFERENCES public.time_entries ("id", "organization_id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "time_entries_org_status_idx"
  ON public.time_entries ("organization_id", "status");

CREATE INDEX IF NOT EXISTS "time_entries_bulk_batch_idx"
  ON public.time_entries ("bulk_batch_id")
  WHERE "bulk_batch_id" IS NOT NULL;

--------------------------------------------------------------------------------
-- 3) Attendance (optional layer; never Actual by itself)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.attendance_days (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES public.organizations ("id") ON DELETE CASCADE,
  "employee_id" uuid NOT NULL,
  "work_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "notes" text,
  "created_by_user_id" uuid REFERENCES public.profiles ("id") ON DELETE SET NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_days_status_known"
    CHECK ("status" IN ('open', 'complete', 'void')),
  CONSTRAINT "attendance_days_employee_org_fk"
    FOREIGN KEY ("employee_id", "organization_id")
    REFERENCES public.employees ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_days_id_organization_id_uq"
  ON public.attendance_days ("id", "organization_id");

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_days_employee_date_uq"
  ON public.attendance_days ("organization_id", "employee_id", "work_date")
  WHERE "archived_at" IS NULL AND "status" <> 'void';

CREATE INDEX IF NOT EXISTS "attendance_days_org_date_idx"
  ON public.attendance_days ("organization_id", "work_date");

CREATE TABLE IF NOT EXISTS public.attendance_events (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES public.organizations ("id") ON DELETE CASCADE,
  "attendance_day_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "occurred_at" timestamp with time zone NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "notes" text,
  "created_by_user_id" uuid REFERENCES public.profiles ("id") ON DELETE SET NULL,
  "voided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "attendance_events_type_known"
    CHECK ("event_type" IN ('clock_in', 'clock_out', 'break_start', 'break_end')),
  CONSTRAINT "attendance_events_source_known"
    CHECK ("source" IN ('self', 'manager', 'manual', 'system')),
  CONSTRAINT "attendance_events_day_org_fk"
    FOREIGN KEY ("attendance_day_id", "organization_id")
    REFERENCES public.attendance_days ("id", "organization_id")
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "attendance_events_day_idx"
  ON public.attendance_events ("attendance_day_id", "occurred_at");

CREATE INDEX IF NOT EXISTS "attendance_events_org_idx"
  ON public.attendance_events ("organization_id");

--------------------------------------------------------------------------------
-- 4) AP vendor credits (not negative fake payments)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ap_vendor_credits (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES public.organizations ("id") ON DELETE CASCADE,
  "vendor_id" uuid NOT NULL,
  "ap_bill_id" uuid,
  "project_id" uuid,
  "reference" text,
  "credit_date" date NOT NULL,
  "currency" char(3) NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  "notes" text,
  "voided_at" timestamp with time zone,
  "created_by_user_id" uuid REFERENCES public.profiles ("id") ON DELETE SET NULL,
  "archived_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_vendor_credits_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "ap_vendor_credits_status_known"
    CHECK ("status" IN ('draft', 'open', 'applied', 'void')),
  CONSTRAINT "ap_vendor_credits_vendor_org_fk"
    FOREIGN KEY ("vendor_id", "organization_id")
    REFERENCES public.vendors ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "ap_vendor_credits_id_organization_id_uq"
  ON public.ap_vendor_credits ("id", "organization_id");

CREATE INDEX IF NOT EXISTS "ap_vendor_credits_vendor_idx"
  ON public.ap_vendor_credits ("organization_id", "vendor_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_bill_org_fk'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      ADD CONSTRAINT "ap_vendor_credits_bill_org_fk"
      FOREIGN KEY ("ap_bill_id", "organization_id")
      REFERENCES public.ap_bills ("id", "organization_id")
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_project_fk'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      DROP CONSTRAINT "ap_vendor_credits_project_fk";
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ap_vendor_credits_project_org_fk'
  ) THEN
    ALTER TABLE public.ap_vendor_credits
      ADD CONSTRAINT "ap_vendor_credits_project_org_fk"
      FOREIGN KEY ("project_id", "organization_id")
      REFERENCES public.projects ("id", "organization_id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ap_credit_applications (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid NOT NULL REFERENCES public.organizations ("id") ON DELETE CASCADE,
  "credit_id" uuid NOT NULL,
  "ap_bill_id" uuid NOT NULL,
  "amount" numeric(18, 6) NOT NULL,
  "currency" char(3) NOT NULL,
  "status" text NOT NULL DEFAULT 'applied',
  "created_by_user_id" uuid REFERENCES public.profiles ("id") ON DELETE SET NULL,
  "voided_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ap_credit_applications_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "ap_credit_applications_status_known"
    CHECK ("status" IN ('applied', 'void')),
  CONSTRAINT "ap_credit_applications_credit_org_fk"
    FOREIGN KEY ("credit_id", "organization_id")
    REFERENCES public.ap_vendor_credits ("id", "organization_id")
    ON DELETE CASCADE,
  CONSTRAINT "ap_credit_applications_bill_org_fk"
    FOREIGN KEY ("ap_bill_id", "organization_id")
    REFERENCES public.ap_bills ("id", "organization_id")
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "ap_credit_applications_credit_idx"
  ON public.ap_credit_applications ("credit_id");

CREATE INDEX IF NOT EXISTS "ap_credit_applications_bill_idx"
  ON public.ap_credit_applications ("ap_bill_id");

--------------------------------------------------------------------------------
-- RLS for new tables
--------------------------------------------------------------------------------

ALTER TABLE public.attendance_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_days FORCE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance_events FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ap_vendor_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_vendor_credits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.ap_credit_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_credit_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS attendance_days_tenant_select ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_insert ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_update ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_tenant_delete ON public.attendance_days;
DROP POLICY IF EXISTS attendance_days_service_all ON public.attendance_days;

CREATE POLICY attendance_days_tenant_select ON public.attendance_days
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.read', 'attendance.manage', 'attendance.self', 'workforce.read']::text[]
    )
  );

CREATE POLICY attendance_days_tenant_insert ON public.attendance_days
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  );

CREATE POLICY attendance_days_tenant_update ON public.attendance_days
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  );

CREATE POLICY attendance_days_tenant_delete ON public.attendance_days
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'attendance.manage')
  );

CREATE POLICY attendance_days_service_all ON public.attendance_days
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS attendance_events_tenant_select ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_insert ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_update ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_tenant_delete ON public.attendance_events;
DROP POLICY IF EXISTS attendance_events_service_all ON public.attendance_events;

CREATE POLICY attendance_events_tenant_select ON public.attendance_events
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.read', 'attendance.manage', 'attendance.self', 'workforce.read']::text[]
    )
  );

CREATE POLICY attendance_events_tenant_insert ON public.attendance_events
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  );

CREATE POLICY attendance_events_tenant_update ON public.attendance_events
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['attendance.manage', 'attendance.self']::text[]
    )
  );

CREATE POLICY attendance_events_tenant_delete ON public.attendance_events
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'attendance.manage')
  );

CREATE POLICY attendance_events_service_all ON public.attendance_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ap_vendor_credits_tenant_select ON public.ap_vendor_credits;
DROP POLICY IF EXISTS ap_vendor_credits_tenant_insert ON public.ap_vendor_credits;
DROP POLICY IF EXISTS ap_vendor_credits_tenant_update ON public.ap_vendor_credits;
DROP POLICY IF EXISTS ap_vendor_credits_tenant_delete ON public.ap_vendor_credits;
DROP POLICY IF EXISTS ap_vendor_credits_service_all ON public.ap_vendor_credits;

CREATE POLICY ap_vendor_credits_tenant_select ON public.ap_vendor_credits
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

CREATE POLICY ap_vendor_credits_tenant_insert ON public.ap_vendor_credits
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_vendor_credits_tenant_update ON public.ap_vendor_credits
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_vendor_credits_tenant_delete ON public.ap_vendor_credits
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_vendor_credits_service_all ON public.ap_vendor_credits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS ap_credit_applications_tenant_select ON public.ap_credit_applications;
DROP POLICY IF EXISTS ap_credit_applications_tenant_insert ON public.ap_credit_applications;
DROP POLICY IF EXISTS ap_credit_applications_tenant_update ON public.ap_credit_applications;
DROP POLICY IF EXISTS ap_credit_applications_tenant_delete ON public.ap_credit_applications;
DROP POLICY IF EXISTS ap_credit_applications_service_all ON public.ap_credit_applications;

CREATE POLICY ap_credit_applications_tenant_select ON public.ap_credit_applications
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

CREATE POLICY ap_credit_applications_tenant_insert ON public.ap_credit_applications
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_credit_applications_tenant_update ON public.ap_credit_applications
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_credit_applications_tenant_delete ON public.ap_credit_applications
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_credit_applications_service_all ON public.ap_credit_applications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

--------------------------------------------------------------------------------
-- AP credit history protection (database-level; not UI-only)
-- Draft/open: editable / cancellable. Applied: economic fields immutable.
-- Correction = void (status + voided_at). No hard-delete of applied history.
--------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app.ap_vendor_credits_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      IF OLD.status IN ('applied', 'void') THEN
        RAISE EXCEPTION 'ap_vendor_credits: applied/void credits cannot be hard-deleted'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'void' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.credit_date IS DISTINCT FROM OLD.credit_date
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.voided_at IS DISTINCT FROM OLD.voided_at
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ap_vendor_credits: void credits are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.status = 'applied' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.credit_date IS DISTINCT FROM OLD.credit_date
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.amount IS DISTINCT FROM OLD.amount
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
       OR NEW.id IS DISTINCT FROM OLD.id
       OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'ap_vendor_credits: applied economic fields are immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NOT (NEW.status = 'void') THEN
        RAISE EXCEPTION 'ap_vendor_credits: applied credits may only transition to void'
          USING ERRCODE = 'restrict_violation';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  -- draft / open: economic edits allowed; identity org/id frozen
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ap_vendor_credits: identity columns are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_vendor_credits_guard ON public.ap_vendor_credits;
CREATE TRIGGER ap_vendor_credits_guard
  BEFORE UPDATE OR DELETE ON public.ap_vendor_credits
  FOR EACH ROW EXECUTE FUNCTION app.ap_vendor_credits_guard();

CREATE OR REPLACE FUNCTION app.ap_credit_applications_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF pg_trigger_depth() = 1 THEN
      RAISE EXCEPTION 'ap_credit_applications: hard deletes are forbidden; void instead'
        USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.status = 'void' THEN
    RAISE EXCEPTION 'ap_credit_applications: void applications are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- applied: only void lifecycle (status + voided_at + updated_at)
  IF NEW.credit_id IS DISTINCT FROM OLD.credit_id
     OR NEW.ap_bill_id IS DISTINCT FROM OLD.ap_bill_id
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'ap_credit_applications: applied economic fields are immutable'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NOT (OLD.status = 'applied' AND NEW.status = 'void') THEN
      RAISE EXCEPTION 'ap_credit_applications: only applied→void is allowed'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_credit_applications_guard ON public.ap_credit_applications;
CREATE TRIGGER ap_credit_applications_guard
  BEFORE UPDATE OR DELETE ON public.ap_credit_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_credit_applications_guard();

CREATE OR REPLACE FUNCTION app.ap_credit_applications_conservation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  credit_amount numeric(18, 6);
  credit_currency char(3);
  credit_org uuid;
  applied_sum numeric(18, 6);
BEGIN
  SELECT c.amount, c.currency, c.organization_id
    INTO credit_amount, credit_currency, credit_org
  FROM public.ap_vendor_credits c
  WHERE c.id = NEW.credit_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ap_credit_applications: credit not found'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id IS DISTINCT FROM credit_org THEN
    RAISE EXCEPTION 'ap_credit_applications: organization mismatch'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.currency IS DISTINCT FROM credit_currency THEN
    RAISE EXCEPTION 'ap_credit_applications: currency mismatch'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status = 'applied' THEN
    SELECT COALESCE(SUM(a.amount), 0)
      INTO applied_sum
    FROM public.ap_credit_applications a
    WHERE a.credit_id = NEW.credit_id
      AND a.status = 'applied'
      AND a.id IS DISTINCT FROM NEW.id;

    IF applied_sum + NEW.amount > credit_amount THEN
      RAISE EXCEPTION 'ap_credit_applications: exceeds credit remaining'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ap_credit_applications_conservation ON public.ap_credit_applications;
CREATE TRIGGER ap_credit_applications_conservation
  BEFORE INSERT OR UPDATE ON public.ap_credit_applications
  FOR EACH ROW EXECUTE FUNCTION app.ap_credit_applications_conservation();

