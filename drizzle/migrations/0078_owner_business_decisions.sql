-- 0078_owner_business_decisions
-- Owner decisions: expense payment lifecycle, payroll payment visibility, attendance outcomes.
-- Owner must apply. Do NOT modify historical migrations 0000–0077.

--------------------------------------------------------------------------------
-- 1. Expense payment lifecycle (recognized ≠ paid)
--------------------------------------------------------------------------------

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_term_id uuid,
  ADD COLUMN IF NOT EXISTS due_date date,
  ADD COLUMN IF NOT EXISTS payment_status text,
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS payment_confirmation_source text,
  ADD COLUMN IF NOT EXISTS paid_gross_amount numeric(18,6);

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_status_known;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_status_known
  CHECK (
    payment_status IS NULL
    OR payment_status IN ('upcoming', 'due', 'paid', 'overdue', 'legacy_unknown')
  );

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_payment_confirmation_source_known;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_payment_confirmation_source_known
  CHECK (
    payment_confirmation_source IS NULL
    OR payment_confirmation_source IN ('manual', 'automatic_policy')
  );

ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_paid_fields_coupled;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_paid_fields_coupled
  CHECK (
    payment_status IS DISTINCT FROM 'paid'
    OR (
      paid_at IS NOT NULL
      AND payment_confirmation_source IS NOT NULL
      AND paid_gross_amount IS NOT NULL
    )
  );

-- Legacy finalized expenses: intentionally NO backfill.
-- We have no reliable payment history for pre-0078 rows — do NOT invent due_date,
-- upcoming, overdue, or paid. Leave payment_status / due_date / paid_at NULL (unset).
-- New expenses initialized after 0078 get due/upcoming via application on finalize.

CREATE INDEX IF NOT EXISTS expenses_org_payment_status_due_idx
  ON public.expenses (organization_id, payment_status, due_date)
  WHERE status = 'finalized' AND archived_at IS NULL;

--------------------------------------------------------------------------------
-- 2. Employee payroll payment visibility (not a payroll engine)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_payroll_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  year_month char(7) NOT NULL,
  currency char(3) NOT NULL,
  expected_amount numeric(18,6) NOT NULL,
  paid_amount numeric(18,6),
  payment_status text NOT NULL DEFAULT 'upcoming',
  due_date date,
  paid_at date,
  payment_confirmation_source text,
  voided_at timestamptz,
  voided_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_payroll_payments_year_month_shape
    CHECK (year_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT employee_payroll_payments_status_known
    CHECK (payment_status IN ('upcoming', 'due', 'paid', 'overdue')),
  CONSTRAINT employee_payroll_payments_confirmation_source_known
    CHECK (
      payment_confirmation_source IS NULL
      OR payment_confirmation_source IN ('manual', 'automatic_policy')
    ),
  CONSTRAINT employee_payroll_payments_expected_non_negative
    CHECK (expected_amount >= 0),
  CONSTRAINT employee_payroll_payments_paid_shape
    CHECK (
      payment_status <> 'paid'
      OR (
        paid_amount IS NOT NULL
        AND paid_at IS NOT NULL
        AND payment_confirmation_source IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_payroll_payments_id_org_uq
  ON public.employee_payroll_payments (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS employee_payroll_payments_active_employee_month_uq
  ON public.employee_payroll_payments (organization_id, employee_id, year_month)
  WHERE voided_at IS NULL;

CREATE INDEX IF NOT EXISTS employee_payroll_payments_org_due_idx
  ON public.employee_payroll_payments (organization_id, due_date);

CREATE INDEX IF NOT EXISTS employee_payroll_payments_org_status_idx
  ON public.employee_payroll_payments (organization_id, payment_status);

ALTER TABLE public.employee_payroll_payments DROP CONSTRAINT IF EXISTS employee_payroll_payments_employee_org_fk;
ALTER TABLE public.employee_payroll_payments ADD CONSTRAINT employee_payroll_payments_employee_org_fk
  FOREIGN KEY (employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE CASCADE;

SELECT app.install_permissioned_rls('employee_payroll_payments', 'workforce.read', 'workforce.manage');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_payroll_payments TO authenticated;

--------------------------------------------------------------------------------
-- 3. Owner attendance outcomes (worked / not worked + paid absence)
--------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.employee_attendance_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  work_date date NOT NULL,
  outcome text NOT NULL,
  absence_reason text,
  absence_compensation text,
  notes text,
  created_by_user_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_attendance_outcomes_outcome_known
    CHECK (outcome IN ('worked', 'not_worked')),
  CONSTRAINT employee_attendance_outcomes_absence_reason_known
    CHECK (
      absence_reason IS NULL
      OR absence_reason IN ('unpaid_leave', 'vacation', 'sick', 'rest_day', 'other')
    ),
  CONSTRAINT employee_attendance_outcomes_compensation_known
    CHECK (
      absence_compensation IS NULL
      OR absence_compensation IN ('paid', 'unpaid')
    ),
  CONSTRAINT employee_attendance_outcomes_not_worked_shape
    CHECK (
      (outcome = 'worked' AND absence_reason IS NULL AND absence_compensation IS NULL)
      OR (
        outcome = 'not_worked'
        AND absence_reason IS NOT NULL
        AND absence_compensation IS NOT NULL
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS employee_attendance_outcomes_id_org_uq
  ON public.employee_attendance_outcomes (id, organization_id);

CREATE UNIQUE INDEX IF NOT EXISTS employee_attendance_outcomes_employee_date_uq
  ON public.employee_attendance_outcomes (organization_id, employee_id, work_date);

CREATE INDEX IF NOT EXISTS employee_attendance_outcomes_org_date_idx
  ON public.employee_attendance_outcomes (organization_id, work_date);

ALTER TABLE public.employee_attendance_outcomes DROP CONSTRAINT IF EXISTS employee_attendance_outcomes_employee_org_fk;
ALTER TABLE public.employee_attendance_outcomes ADD CONSTRAINT employee_attendance_outcomes_employee_org_fk
  FOREIGN KEY (employee_id, organization_id)
  REFERENCES public.employees (id, organization_id)
  ON DELETE CASCADE;

SELECT app.install_permissioned_rls('employee_attendance_outcomes', 'attendance.read', 'attendance.manage');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_attendance_outcomes TO authenticated;

--------------------------------------------------------------------------------
-- 4. Default org financial policies (manual confirmation)
--------------------------------------------------------------------------------

INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'expense_payment_confirmation_mode', '"manual"'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings s
  WHERE s.organization_id = o.id AND s.key = 'expense_payment_confirmation_mode'
);

INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'salary_payment_confirmation_mode', '"manual"'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings s
  WHERE s.organization_id = o.id AND s.key = 'salary_payment_confirmation_mode'
);

INSERT INTO public.organization_settings (organization_id, key, value)
SELECT o.id, 'salary_payment_day', '10'::jsonb
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_settings s
  WHERE s.organization_id = o.id AND s.key = 'salary_payment_day'
);
