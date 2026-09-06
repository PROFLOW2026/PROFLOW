-- Recurring template payment behavior (source-of-truth) + expense draft linkage + Hebrew system notes.

ALTER TABLE public.recurring_financial_drafts
  ADD COLUMN IF NOT EXISTS payment_confirmation_override text NOT NULL DEFAULT 'org_default',
  ADD COLUMN IF NOT EXISTS recurring_payment_day integer,
  ADD COLUMN IF NOT EXISTS payment_term_id uuid;

ALTER TABLE public.recurring_financial_drafts
  DROP CONSTRAINT IF EXISTS recurring_financial_drafts_payment_confirmation_override_known;
ALTER TABLE public.recurring_financial_drafts
  ADD CONSTRAINT recurring_financial_drafts_payment_confirmation_override_known
  CHECK (payment_confirmation_override IN ('org_default', 'automatic'));

ALTER TABLE public.recurring_financial_drafts
  DROP CONSTRAINT IF EXISTS recurring_financial_drafts_recurring_payment_day_range;
ALTER TABLE public.recurring_financial_drafts
  ADD CONSTRAINT recurring_financial_drafts_recurring_payment_day_range
  CHECK (
    recurring_payment_day IS NULL
    OR (recurring_payment_day >= 1 AND recurring_payment_day <= 28)
  );

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source_recurring_draft_id uuid;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_source_recurring_draft_org_fk;
ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_source_recurring_draft_org_fk
  FOREIGN KEY (source_recurring_draft_id, organization_id)
  REFERENCES public.recurring_financial_drafts (id, organization_id)
  ON DELETE SET NULL (source_recurring_draft_id);

CREATE INDEX IF NOT EXISTS expenses_source_recurring_draft_idx
  ON public.expenses (organization_id, source_recurring_draft_id)
  WHERE source_recurring_draft_id IS NOT NULL;

-- Link existing generated expenses to their recurring template (idempotent).
UPDATE public.expenses e
SET source_recurring_draft_id = r.draft_id
FROM public.recurring_financial_draft_runs r
WHERE e.id = r.generated_entity_id
  AND r.generated_entity_type = 'expense'
  AND e.organization_id = r.organization_id
  AND e.source_recurring_draft_id IS NULL;

-- Localize known system-generated recurring notes (English pattern only).
UPDATE public.expenses
SET notes = regexp_replace(
  notes,
  'Generated from recurring draft [“"]([^”"]+)[”"]\.',
  'נוצר אוטומטית מהוצאה חוזרת "\1".',
  'g'
)
WHERE notes ~ 'Generated from recurring draft [“"]';
