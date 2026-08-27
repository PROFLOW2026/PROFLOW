-- 0070: Financial classification architecture (FINAL architecture closure).
-- Transaction classification, same-org AP category FKs, classification DB invariants.
-- Vendor capabilities reuse 0060 organization_catalog_entries + vendor_catalog_links.
-- Does NOT create vendor_roles (no second vendor taxonomy).
-- Additive only. Does NOT modify 0000–0069. No destructive table drops.
-- Owner applies; agent must not apply to production.
--
-- Owner corrections:
-- F-0070-01/09: safe historical classification_status backfill; amounts unchanged
-- F-0070-02: no supplier→materials inference
-- F-0070-04: AP same-org composite category FKs
-- F-0070-05: category/family contradiction trigger
-- F-0070-11: reuse vendor_catalog_links; no vendor_roles
-- F-0070-12: vendor capability never classifies transactions (app-enforced)
-- F-0070-13/19: classification_status DB invariant — classified requires cost_category_id always
-- F-0070-14: canonical transaction categories seeded; labor not for new authoritative use
-- F-0070-15: internal_employee_payroll NOT seeded as Expense category (Workforce path)
-- F-0070-16/17/20: AP line classification_status + shared cost_categories vocabulary
-- F-0070-22: locale-aware catalog seed names (he-IL orgs get Hebrew labels)
-- F-0070-A..O: recognition lifecycle, line immutability, NET economics, same-org FKs

-- ---------------------------------------------------------------------------
-- F-0070-K: canonical category seed — fail on family collision (never silent)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  bad record;
BEGIN
  FOR bad IN
    SELECT o.id AS org_id, c.key, c.family::text AS existing_family, v.expected_family
    FROM public.organizations o
    CROSS JOIN (
      VALUES
        ('materials', 'direct_project'),
        ('subcontractor', 'direct_project'),
        ('external_manpower', 'direct_project'),
        ('external_service', 'direct_project'),
        ('equipment_rental', 'direct_project'),
        ('permits_fees', 'direct_project'),
        ('project_travel', 'direct_project'),
        ('other_direct', 'direct_project'),
        ('shared_supervision', 'shared'),
        ('shared_equipment', 'shared'),
        ('shared_logistics', 'shared'),
        ('rent', 'business_overhead'),
        ('utilities', 'business_overhead'),
        ('accounting_legal', 'business_overhead'),
        ('insurance', 'business_overhead'),
        ('marketing', 'business_overhead'),
        ('software', 'business_overhead'),
        ('bank_fees', 'business_overhead'),
        ('office_supplies', 'business_overhead'),
        ('vehicle_fuel', 'business_overhead'),
        ('other_overhead', 'business_overhead'),
        ('equipment_purchase', 'asset_capital'),
        ('vehicle_purchase', 'asset_capital'),
        ('tools', 'asset_capital')
    ) AS v(key, expected_family)
    JOIN public.cost_categories c
      ON c.organization_id = o.id AND c.key = v.key
    WHERE c.family::text IS DISTINCT FROM v.expected_family
  LOOP
    RAISE EXCEPTION 'canonical category key % has conflicting family % (expected %)',
      bad.key, bad.existing_family, bad.expected_family
      USING ERRCODE = '23514';
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- cost_categories: composite uniqueness for same-org FKs
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS cost_categories_id_org_uq
  ON public.cost_categories (id, organization_id);

-- ---------------------------------------------------------------------------
-- F-0070-14: ensure canonical TRANSACTION taxonomy exists for every org
-- Shared by Expense + AP. Do NOT invent internal_employee_payroll here.
-- Legacy `labor` may already exist — left for history; app hides from new entry.
-- Names seeded per organization.default_locale (Hebrew for he-IL).
-- ---------------------------------------------------------------------------
INSERT INTO public.cost_categories (
  id, organization_id, key, name, family, is_system, sort_order, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  o.id,
  v.key,
  CASE WHEN COALESCE(o.default_locale, 'he-IL') LIKE 'he%' THEN v.name_he ELSE v.name_en END,
  v.family::public.cost_family,
  true,
  v.sort_order,
  now(),
  now()
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('materials', 'Materials', 'חומרים', 'direct_project', 10),
    ('subcontractor', 'Subcontractor', 'קבלן משנה', 'direct_project', 20),
    ('external_manpower', 'External manpower', 'כוח אדם חיצוני', 'direct_project', 25),
    ('external_service', 'External professional service', 'שירות חיצוני', 'direct_project', 28),
    ('equipment_rental', 'Equipment rental', 'השכרת ציוד', 'direct_project', 40),
    ('permits_fees', 'Permits and fees', 'היתרים ואגרות', 'direct_project', 50),
    ('project_travel', 'Project travel / logistics', 'נסיעות לפרויקט', 'direct_project', 60),
    ('other_direct', 'Other direct cost', 'עלות ישירה אחרת', 'direct_project', 70),
    ('shared_supervision', 'Shared supervision', 'פיקוח משותף', 'shared', 110),
    ('shared_equipment', 'Shared equipment', 'ציוד משותף', 'shared', 120),
    ('shared_logistics', 'Shared logistics', 'לוגיסטיקה משותפת', 'shared', 130),
    ('rent', 'Rent', 'שכירות', 'business_overhead', 210),
    ('utilities', 'Utilities', 'חשמל ומים', 'business_overhead', 220),
    ('accounting_legal', 'Accounting and legal', 'הנהלת חשבונות ומשפטים', 'business_overhead', 230),
    ('insurance', 'Insurance', 'ביטוח', 'business_overhead', 240),
    ('marketing', 'Marketing', 'שיווק', 'business_overhead', 250),
    ('software', 'Software and subscriptions', 'תוכנה ומנויים', 'business_overhead', 260),
    ('bank_fees', 'Bank and finance fees', 'עמלות בנק ומימון', 'business_overhead', 270),
    ('office_supplies', 'Office supplies', 'ציוד משרדי', 'business_overhead', 280),
    ('vehicle_fuel', 'Vehicle and fuel', 'רכב ודלק', 'business_overhead', 290),
    ('other_overhead', 'Other overhead', 'הוצאות כלליות אחרות', 'business_overhead', 300),
    ('equipment_purchase', 'Equipment purchase', 'רכישת ציוד', 'asset_capital', 410),
    ('vehicle_purchase', 'Vehicle purchase', 'רכישת רכב', 'asset_capital', 420),
    ('tools', 'Tools', 'כלים', 'asset_capital', 430)
) AS v(key, name_en, name_he, family, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.cost_categories c
  WHERE c.organization_id = o.id AND c.key = v.key
);

COMMENT ON TABLE public.cost_categories IS
  'Canonical transaction economic taxonomy shared by Expense and AP. Legacy key labor may exist historically but must not be treated as authoritative classified until Owner reclassifies. Internal employee payroll is Workforce — not an ordinary Expense category.';

-- ---------------------------------------------------------------------------
-- F-0070-11: vendor capability via existing 0060 catalog (NO vendor_roles table)
-- Seed system vendor_category capability entries + safe legacy link backfill.
-- Names seeded per organization.default_locale (Hebrew for he-IL).
-- ---------------------------------------------------------------------------
INSERT INTO public.organization_catalog_entries (
  id, organization_id, kind, key, name, description, metadata, sort_order, is_system, is_active, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  o.id,
  'vendor_category',
  v.key,
  CASE WHEN COALESCE(o.default_locale, 'he-IL') LIKE 'he%' THEN v.name_he ELSE v.name_en END,
  CASE WHEN COALESCE(o.default_locale, 'he-IL') LIKE 'he%' THEN v.desc_he ELSE v.desc_en END,
  jsonb_build_object('capability', true, 'suggestCostCategoryKey', v.suggest),
  v.sort_order,
  true,
  true,
  now(),
  now()
FROM public.organizations o
CROSS JOIN (
  VALUES
    ('materials_supplier', 'Materials supplier', 'ספק חומרים', 'Sells materials / stock', 'מוכר חומרים / מלאי', 'materials', 10),
    ('equipment_supplier', 'Equipment supplier', 'ספק ציוד', 'Sells equipment', 'מוכר ציוד', 'equipment_purchase', 20),
    ('equipment_rental', 'Equipment rental', 'השכרת ציוד', 'Rents equipment', 'משכיר ציוד', 'equipment_rental', 30),
    ('service_provider', 'Service provider', 'נותן שירות', 'Professional / external service', 'שירות מקצועי / חיצוני', 'external_service', 40),
    ('subcontractor', 'Subcontractor', 'קבלן משנה', 'Project subcontract work', 'עבודת קבלן משנה', 'subcontractor', 50),
    ('external_manpower', 'External manpower', 'כוח אדם חיצוני', 'External manpower supply', 'אספקת כוח אדם חיצוני', 'external_manpower', 60),
    ('consultant', 'Consultant', 'יועץ', 'Consulting', 'ייעוץ', 'external_service', 70),
    ('logistics', 'Logistics', 'לוגיסטיקה', 'Transport / logistics', 'הובלה / לוגיסטיקה', 'shared_logistics', 80),
    ('landlord', 'Landlord', 'משכיר', 'Rent / premises', 'שכירות / מבנה', 'rent', 90),
    ('utility_provider', 'Utility provider', 'ספק שירותים', 'Utilities', 'חשמל ומים', 'utilities', 100),
    ('insurance_provider', 'Insurance provider', 'ספק ביטוח', 'Insurance', 'ביטוח', 'insurance', 110),
    ('government', 'Government', 'ממשלה / רשות', 'Fees / permits / government', 'אגרות / היתרים / רשות', 'permits_fees', 120)
) AS v(key, name_en, name_he, desc_en, desc_he, suggest, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.organization_catalog_entries e
  WHERE e.organization_id = o.id AND e.kind = 'vendor_category' AND e.key = v.key
);

-- Safe legacy mapping ONLY: subcontractor / both → catalog vendor_category subcontractor.
-- Generic supplier / other → NO automatic specialized capability.
INSERT INTO public.vendor_catalog_links (
  id, organization_id, vendor_id, catalog_entry_id, link_kind, created_at, updated_at
)
SELECT
  gen_random_uuid(),
  v.organization_id,
  v.id,
  e.id,
  'vendor_category',
  now(),
  now()
FROM public.vendors v
JOIN public.organization_catalog_entries e
  ON e.organization_id = v.organization_id
 AND e.kind = 'vendor_category'
 AND e.key = 'subcontractor'
WHERE v.type IN ('subcontractor', 'both')
ON CONFLICT (vendor_id, catalog_entry_id, link_kind) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Expense classification review state
-- ---------------------------------------------------------------------------
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS classification_status text;

COMMENT ON COLUMN public.expenses.classification_status IS
  'classified = canonical structured transaction category known (cost_category_id required). needs_classification = detailed bucket uncertain but amount still in Actual. Vendor capability never sets this.';

UPDATE public.expenses e
SET classification_status = 'classified'
FROM public.cost_categories c
WHERE e.cost_category_id = c.id
  AND e.organization_id = c.organization_id
  AND e.classification_status IS NULL
  AND c.key IS DISTINCT FROM 'labor'
  AND c.key IS DISTINCT FROM 'internal_employee_payroll'
  AND c.family::text = e.cost_family::text;

UPDATE public.expenses
SET classification_status = 'needs_classification'
WHERE classification_status IS NULL;

ALTER TABLE public.expenses
  ALTER COLUMN classification_status SET DEFAULT 'needs_classification';

ALTER TABLE public.expenses
  ALTER COLUMN classification_status SET NOT NULL;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_classification_status_known;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_classification_status_known
  CHECK (classification_status IN ('classified', 'needs_classification'));

-- ---------------------------------------------------------------------------
-- AP bill / line structured economic classification (shared cost_categories)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS cost_family public.cost_family;

ALTER TABLE public.ap_bills
  ADD COLUMN IF NOT EXISTS cost_category_id uuid;

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS cost_family public.cost_family;

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS cost_category_id uuid;

ALTER TABLE public.ap_bills
  DROP CONSTRAINT IF EXISTS ap_bills_cost_category_fk;

ALTER TABLE public.ap_bills
  DROP CONSTRAINT IF EXISTS ap_bills_cost_category_org_fk;

ALTER TABLE public.ap_bills
  ADD CONSTRAINT ap_bills_cost_category_org_fk
  FOREIGN KEY (cost_category_id, organization_id)
  REFERENCES public.cost_categories(id, organization_id)
  ON DELETE SET NULL (cost_category_id);

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_cost_category_fk;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_cost_category_org_fk;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_cost_category_org_fk
  FOREIGN KEY (cost_category_id, organization_id)
  REFERENCES public.cost_categories(id, organization_id)
  ON DELETE SET NULL (cost_category_id);

COMMENT ON COLUMN public.ap_bill_lines.cost_category_id IS
  'Line-level transaction category (same vocabulary as expenses). Canonical Actual classification source for new bills.';

COMMENT ON COLUMN public.ap_bills.cost_category_id IS
  'Optional entry default for new lines only — NOT authoritative Actual classification. Economic truth lives on ap_bill_lines.';

COMMENT ON COLUMN public.ap_bills.cost_family IS
  'Optional entry default for new lines only — NOT authoritative Actual classification.';

-- F-0070-20/25: classification_status on LINES only (header has no stored classification state)
ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS classification_status text;

COMMENT ON COLUMN public.ap_bill_lines.classification_status IS
  'classified = canonical structured transaction category on this line. needs_classification = legacy/historical unknown; new recognized lines must be classified.';

UPDATE public.ap_bill_lines l
SET classification_status = 'classified'
FROM public.cost_categories c
WHERE l.cost_category_id = c.id
  AND l.organization_id = c.organization_id
  AND l.classification_status IS NULL
  AND c.key IS DISTINCT FROM 'labor'
  AND c.key IS DISTINCT FROM 'internal_employee_payroll'
  AND (l.cost_family IS NULL OR l.cost_family::text = c.family::text);

UPDATE public.ap_bill_lines
SET classification_status = 'needs_classification'
WHERE classification_status IS NULL;

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN classification_status SET DEFAULT 'needs_classification';

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN classification_status SET NOT NULL;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_classification_status_known;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_classification_status_known
  CHECK (classification_status IN ('classified', 'needs_classification'));

-- F-0070-L: normalize classified line family from canonical category
UPDATE public.ap_bill_lines l
SET cost_family = c.family::public.cost_family
FROM public.cost_categories c
WHERE l.cost_category_id = c.id
  AND l.organization_id = c.organization_id
  AND l.classification_status = 'classified'
  AND (l.cost_family IS NULL OR l.cost_family::text IS DISTINCT FROM c.family::text);

-- ---------------------------------------------------------------------------
-- F-0070-D/E: line NET / TAX / GROSS — Actual uses NET only
-- Historical upgrade conserves parent bill NET/TAX/GROSS (VAT-safe allocation).
-- ---------------------------------------------------------------------------
ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS net_amount numeric(18, 6);

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS tax_amount numeric(18, 6);

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS gross_amount numeric(18, 6);

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS legacy_bill_level_allocated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.ap_bill_lines.legacy_bill_level_allocated IS
  'True when historical line NET/TAX was deterministically allocated from bill-level economics (not originally captured per line).';

CREATE OR REPLACE FUNCTION app._0070_allocate_historical_ap_line_economics(
  p_bill_id uuid,
  p_org_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  b record;
  line_rec record;
  line_cnt int;
  gross_sum numeric(18, 6);
  allocated_net numeric(18, 6) := 0;
  allocated_tax numeric(18, 6) := 0;
  allocated_gross numeric(18, 6) := 0;
  net_part numeric(18, 6);
  tax_part numeric(18, 6);
  gross_part numeric(18, 6);
  rn int := 0;
BEGIN
  SELECT id, net_amount, tax_amount, gross_amount, tax_basis
  INTO b
  FROM public.ap_bills
  WHERE id = p_bill_id AND organization_id = p_org_id;

  IF b.id IS NULL THEN
    RETURN;
  END IF;

  SELECT COUNT(*)::int, COALESCE(SUM(line_total), 0)
  INTO line_cnt, gross_sum
  FROM public.ap_bill_lines
  WHERE ap_bill_id = p_bill_id
    AND organization_id = p_org_id
    AND net_amount IS NULL;

  IF line_cnt = 0 THEN
    RETURN;
  END IF;

  IF b.tax_basis IN ('legacy_undivided', 'zero_exempt')
     OR (b.net_amount = b.gross_amount AND COALESCE(b.tax_amount, 0) = 0) THEN
    UPDATE public.ap_bill_lines
    SET
      gross_amount = line_total,
      net_amount = line_total,
      tax_amount = 0,
      legacy_bill_level_allocated = (line_cnt > 1 AND COALESCE(b.tax_amount, 0) > 0)
    WHERE ap_bill_id = p_bill_id
      AND organization_id = p_org_id
      AND net_amount IS NULL;
    RETURN;
  END IF;

  FOR line_rec IN
    SELECT id, line_total
    FROM public.ap_bill_lines
    WHERE ap_bill_id = p_bill_id
      AND organization_id = p_org_id
      AND net_amount IS NULL
    ORDER BY sort_order, id
  LOOP
    rn := rn + 1;
    IF rn < line_cnt AND gross_sum > 0 THEN
      net_part := round(b.net_amount * line_rec.line_total / gross_sum, 6);
      tax_part := round(b.tax_amount * line_rec.line_total / gross_sum, 6);
      gross_part := round(b.gross_amount * line_rec.line_total / gross_sum, 6);
      allocated_net := allocated_net + net_part;
      allocated_tax := allocated_tax + tax_part;
      allocated_gross := allocated_gross + gross_part;
    ELSE
      net_part := b.net_amount - allocated_net;
      tax_part := b.tax_amount - allocated_tax;
      gross_part := b.gross_amount - allocated_gross;
    END IF;

    UPDATE public.ap_bill_lines
    SET
      net_amount = net_part,
      tax_amount = tax_part,
      gross_amount = gross_part,
      legacy_bill_level_allocated = true
    WHERE id = line_rec.id;
  END LOOP;
END;
$fn$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT b.id AS bill_id, b.organization_id
    FROM public.ap_bills b
    JOIN public.ap_bill_lines l ON l.ap_bill_id = b.id AND l.net_amount IS NULL
  LOOP
    PERFORM app._0070_allocate_historical_ap_line_economics(r.bill_id, r.organization_id);
  END LOOP;
END $$;

DO $$
DECLARE
  bad record;
BEGIN
  FOR bad IN
    SELECT
      b.id AS bill_id,
      b.net_amount,
      b.tax_amount,
      b.gross_amount,
      COALESCE(SUM(l.net_amount), 0) AS sum_net,
      COALESCE(SUM(l.tax_amount), 0) AS sum_tax,
      COALESCE(SUM(l.gross_amount), 0) AS sum_gross
    FROM public.ap_bills b
    JOIN public.ap_bill_lines l ON l.ap_bill_id = b.id AND l.organization_id = b.organization_id
    GROUP BY b.id, b.net_amount, b.tax_amount, b.gross_amount
    HAVING COALESCE(SUM(l.net_amount), 0) IS DISTINCT FROM b.net_amount
        OR COALESCE(SUM(l.tax_amount), 0) IS DISTINCT FROM b.tax_amount
        OR COALESCE(SUM(l.gross_amount), 0) IS DISTINCT FROM b.gross_amount
  LOOP
    RAISE EXCEPTION
      'historical AP line economics failed reconciliation for bill % (bill net/tax/gross %/%/%, lines %/%/%)',
      bad.bill_id, bad.net_amount, bad.tax_amount, bad.gross_amount,
      bad.sum_net, bad.sum_tax, bad.sum_gross
      USING ERRCODE = '23514';
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS app._0070_allocate_historical_ap_line_economics(uuid, uuid);

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN net_amount SET NOT NULL;

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN tax_amount SET NOT NULL;

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN gross_amount SET NOT NULL;

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN tax_amount SET DEFAULT 0;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_net_tax_gross;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_net_tax_gross
  CHECK (net_amount + tax_amount = gross_amount AND gross_amount = line_total);

COMMENT ON COLUMN public.ap_bill_lines.net_amount IS
  'Canonical line NET — classification buckets and Actual use this, never gross/VAT.';

COMMENT ON COLUMN public.ap_bill_lines.gross_amount IS
  'Line payable GROSS (= line_total). Payments/outstanding use GROSS.';

-- ---------------------------------------------------------------------------
-- F-0070-F: line economic destination (category ≠ destination)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS economic_target_type text;

ALTER TABLE public.ap_bill_lines
  ADD COLUMN IF NOT EXISTS project_id uuid;

UPDATE public.ap_bill_lines
SET economic_target_type = 'inherit'
WHERE economic_target_type IS NULL;

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN economic_target_type SET DEFAULT 'inherit';

ALTER TABLE public.ap_bill_lines
  ALTER COLUMN economic_target_type SET NOT NULL;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_economic_target_known;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_economic_target_known
  CHECK (economic_target_type IN ('inherit', 'project', 'overhead'));

UPDATE public.ap_bill_lines
SET project_id = NULL
WHERE economic_target_type IN ('inherit', 'overhead')
  AND project_id IS NOT NULL;

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_economic_target_shape;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_economic_target_shape
  CHECK (
    (economic_target_type = 'project' AND project_id IS NOT NULL)
    OR (economic_target_type = 'overhead' AND project_id IS NULL)
    OR (economic_target_type = 'inherit' AND project_id IS NULL)
  );

ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_project_org_fk;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_project_org_fk
  FOREIGN KEY (project_id, organization_id)
  REFERENCES public.projects(id, organization_id)
  ON DELETE RESTRICT;

-- ---------------------------------------------------------------------------
-- F-0070-C: AP line → bill same-org composite FK
-- ---------------------------------------------------------------------------
ALTER TABLE public.ap_bill_lines
  DROP CONSTRAINT IF EXISTS ap_bill_lines_bill_org_fk;

ALTER TABLE public.ap_bill_lines
  ADD CONSTRAINT ap_bill_lines_bill_org_fk
  FOREIGN KEY (ap_bill_id, organization_id)
  REFERENCES public.ap_bills(id, organization_id)
  ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- Trusted financial lifecycle latches (not caller-spoofable GUCs)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.trusted_financial_latch_acquire(
  p_kind text,
  p_organization_id uuid,
  p_permission text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'trusted_financial_latch_not_org_member'
      USING ERRCODE = '42501';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, p_permission) THEN
    RAISE EXCEPTION 'trusted_financial_latch_permission_denied'
      USING ERRCODE = '42501';
  END IF;
  PERFORM app.next_gen_latch_acquire(p_kind);
END;
$fn$;

CREATE OR REPLACE FUNCTION app.trusted_financial_latch_release(p_kind text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM app.next_gen_latch_release(p_kind);
END;
$fn$;

REVOKE ALL ON FUNCTION app.trusted_financial_latch_acquire(text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION app.trusted_financial_latch_release(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.trusted_financial_latch_acquire(text, uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app.trusted_financial_latch_release(text) TO authenticated, service_role;

-- Same-org correction provenance for expenses
ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_voids_expense_org_fk;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_voids_expense_org_fk
  FOREIGN KEY (voids_expense_id, organization_id)
  REFERENCES public.expenses(id, organization_id)
  ON DELETE RESTRICT;

ALTER TABLE public.expenses
  DROP CONSTRAINT IF EXISTS expenses_adjusts_expense_org_fk;

ALTER TABLE public.expenses
  ADD CONSTRAINT expenses_adjusts_expense_org_fk
  FOREIGN KEY (adjusts_expense_id, organization_id)
  REFERENCES public.expenses(id, organization_id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION app.validate_expense_reversal_correlation(p_row public.expenses)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  orig record;
BEGIN
  IF p_row.voids_expense_id IS NULL THEN
    RAISE EXCEPTION 'expense_correction_requires_voids_expense_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT id, organization_id, net_amount, tax_amount, gross_amount, currency
  INTO orig
  FROM public.expenses
  WHERE id = p_row.voids_expense_id
    AND organization_id = p_row.organization_id;

  IF orig.id IS NULL THEN
    RAISE EXCEPTION 'voids_expense_id not found in organization'
      USING ERRCODE = '23503';
  END IF;

  IF p_row.net_amount IS DISTINCT FROM (-orig.net_amount)
     OR p_row.tax_amount IS DISTINCT FROM (-orig.tax_amount)
     OR p_row.gross_amount IS DISTINCT FROM (-orig.gross_amount)
     OR p_row.currency IS DISTINCT FROM orig.currency THEN
    RAISE EXCEPTION 'expense_reversal_amounts_must_negate_original'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Category/family match + classification_status invariant + payroll ban
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION app.assert_cost_category_family_match()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  cat_family text;
  cat_key text;
  row_org uuid;
  row_family text;
BEGIN
  IF NEW.cost_category_id IS NULL THEN
    RETURN NEW;
  END IF;

  row_org := NEW.organization_id;
  row_family := NEW.cost_family::text;

  SELECT c.family::text, c.key INTO cat_family, cat_key
  FROM public.cost_categories c
  WHERE c.id = NEW.cost_category_id
    AND c.organization_id = row_org;

  IF cat_family IS NULL THEN
    RAISE EXCEPTION 'cost_category_id % not found in organization %', NEW.cost_category_id, row_org
      USING ERRCODE = '23503';
  END IF;

  -- F-0070-15: internal payroll is Workforce — never an ordinary Expense/AP category path
  IF cat_key = 'internal_employee_payroll' THEN
    RAISE EXCEPTION 'internal_employee_payroll is not allowed on ordinary Expense/AP rows; use Workforce'
      USING ERRCODE = '23514';
  END IF;

  IF row_family IS NOT NULL AND row_family IS DISTINCT FROM cat_family THEN
    RAISE EXCEPTION 'cost_family % contradicts category family %', row_family, cat_family
      USING ERRCODE = '23514';
  END IF;

  IF row_family IS NULL THEN
    NEW.cost_family := cat_family::public.cost_family;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS expenses_category_family_match ON public.expenses;
CREATE TRIGGER expenses_category_family_match
  BEFORE INSERT OR UPDATE OF cost_category_id, cost_family, organization_id
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_cost_category_family_match();

DROP TRIGGER IF EXISTS ap_bills_category_family_match ON public.ap_bills;
CREATE TRIGGER ap_bills_category_family_match
  BEFORE INSERT OR UPDATE OF cost_category_id, cost_family, organization_id
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_cost_category_family_match();

DROP TRIGGER IF EXISTS ap_bill_lines_category_family_match ON public.ap_bill_lines;
CREATE TRIGGER ap_bill_lines_category_family_match
  BEFORE INSERT OR UPDATE OF cost_category_id, cost_family, organization_id
  ON public.ap_bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_cost_category_family_match();

-- F-0070-13/19: classified requires canonical cost_category_id — no inventory/asset exceptions
CREATE OR REPLACE FUNCTION app.assert_transaction_classification_status()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  cat_family text;
  cat_key text;
BEGIN
  IF NEW.classification_status IS DISTINCT FROM 'classified' THEN
    RETURN NEW;
  END IF;

  IF NEW.cost_category_id IS NULL THEN
    RAISE EXCEPTION 'classification_status=classified requires cost_category_id'
      USING ERRCODE = '23514';
  END IF;

  SELECT c.family::text, c.key INTO cat_family, cat_key
  FROM public.cost_categories c
  WHERE c.id = NEW.cost_category_id
    AND c.organization_id = NEW.organization_id;

  IF cat_key IS NULL THEN
    RAISE EXCEPTION 'classified transaction category % not found in organization %', NEW.cost_category_id, NEW.organization_id
      USING ERRCODE = '23503';
  END IF;

  IF cat_key IN ('labor', 'internal_employee_payroll') THEN
    RAISE EXCEPTION 'classification_status=classified is not allowed for category key %', cat_key
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME IN ('expenses', 'ap_bill_lines')
     AND NEW.cost_family::text IS NOT NULL
     AND NEW.cost_family::text IS DISTINCT FROM cat_family THEN
    RAISE EXCEPTION 'classified cost_family % contradicts category family %', NEW.cost_family, cat_family
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS expenses_classification_status_guard ON public.expenses;
CREATE TRIGGER expenses_classification_status_guard
  BEFORE INSERT OR UPDATE OF classification_status, cost_category_id, cost_family, organization_id
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_transaction_classification_status();

DROP TRIGGER IF EXISTS ap_bill_lines_classification_status_guard ON public.ap_bill_lines;
CREATE TRIGGER ap_bill_lines_classification_status_guard
  BEFORE INSERT OR UPDATE OF classification_status, cost_category_id, cost_family, organization_id
  ON public.ap_bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_transaction_classification_status();

-- F-0070-24: new recognized costs require classified transaction category.
-- Trusted reversal path only (validated correlation + private latch). Adjustments do not bypass.
CREATE OR REPLACE FUNCTION app.assert_expense_recognition_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.status = 'finalized'
     AND (
       TG_OP = 'INSERT'
       OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM 'finalized')
     ) THEN
    IF app.next_gen_latch_held('expense_correction')
       AND NEW.voids_expense_id IS NOT NULL THEN
      PERFORM app.validate_expense_reversal_correlation(NEW);
      RETURN NEW;
    END IF;

    IF NEW.classification_status IS DISTINCT FROM 'classified'
       OR NEW.cost_category_id IS NULL THEN
      RAISE EXCEPTION 'finalized expense requires classified transaction category'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS expenses_recognition_gate ON public.expenses;
CREATE TRIGGER expenses_recognition_gate
  BEFORE INSERT OR UPDATE OF status, classification_status, cost_category_id, voids_expense_id,
    adjusts_expense_id, net_amount, tax_amount, gross_amount, currency, organization_id
  ON public.expenses
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_expense_recognition_gate();

-- F-0070-I: extend finalized expense economic immutability (classification + amounts)
CREATE OR REPLACE FUNCTION app.expenses_economic_settings_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status = 'finalized' THEN
    IF app.next_gen_latch_held('expense_classification_remediation') THEN
      IF OLD.classification_status IS DISTINCT FROM 'needs_classification' THEN
        RAISE EXCEPTION 'classification_remediation_only_for_needs_classification'
          USING ERRCODE = 'restrict_violation';
      END IF;
      IF NEW.installment_count IS DISTINCT FROM OLD.installment_count
         OR NEW.installment_start_date IS DISTINCT FROM OLD.installment_start_date
         OR NEW.inventory_stock_purchase IS DISTINCT FROM OLD.inventory_stock_purchase
         OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
         OR NEW.inventory_purchase_qty IS DISTINCT FROM OLD.inventory_purchase_qty
         OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
         OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
         OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
         OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
         OR NEW.status IS DISTINCT FROM OLD.status
      THEN
        RAISE EXCEPTION 'classification_remediation_scope_violation'
          USING ERRCODE = 'restrict_violation';
      END IF;
      RETURN NEW;
    ELSIF NEW.installment_count IS DISTINCT FROM OLD.installment_count
       OR NEW.installment_start_date IS DISTINCT FROM OLD.installment_start_date
       OR NEW.inventory_stock_purchase IS DISTINCT FROM OLD.inventory_stock_purchase
       OR NEW.inventory_item_id IS DISTINCT FROM OLD.inventory_item_id
       OR NEW.inventory_purchase_qty IS DISTINCT FROM OLD.inventory_purchase_qty
       OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
       OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
    THEN
      RAISE EXCEPTION 'expenses_economic_settings_immutable'
        USING ERRCODE = 'restrict_violation';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.currency IS DISTINCT FROM OLD.currency
     AND EXISTS (
       SELECT 1
       FROM public.expense_managerial_schedule_lines s
       WHERE s.expense_id = OLD.id
         AND s.organization_id = OLD.organization_id
         AND s.status IN ('scheduled', 'recognized')
     )
  THEN
    RAISE EXCEPTION 'expense_currency_schedule_locked'
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

-- F-0070-J: controlled historical Expense classification remediation (audited trusted path)
CREATE OR REPLACE FUNCTION app.remediate_expense_classification(
  p_expense_id uuid,
  p_organization_id uuid,
  p_cost_category_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  exp record;
  cat record;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'remediation_not_org_member' USING ERRCODE = '42501';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'expenses.finalize') THEN
    RAISE EXCEPTION 'remediation_permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT id, status, classification_status, organization_id, expense_date, cost_family
  INTO exp
  FROM public.expenses
  WHERE id = p_expense_id AND organization_id = p_organization_id
  FOR UPDATE;

  IF exp.id IS NULL THEN
    RAISE EXCEPTION 'expense not found' USING ERRCODE = '23503';
  END IF;
  IF exp.status IS DISTINCT FROM 'finalized' THEN
    RAISE EXCEPTION 'remediation requires finalized expense' USING ERRCODE = '23514';
  END IF;
  IF exp.classification_status IS DISTINCT FROM 'needs_classification' THEN
    RAISE EXCEPTION 'remediation only for needs_classification expenses' USING ERRCODE = '23514';
  END IF;
  IF app.is_month_closed(p_organization_id, to_char(exp.expense_date, 'YYYY-MM')) THEN
    RAISE EXCEPTION 'remediation blocked in closed month' USING ERRCODE = '23514';
  END IF;

  SELECT id, family::text AS family, key INTO cat
  FROM public.cost_categories
  WHERE id = p_cost_category_id AND organization_id = p_organization_id;

  IF cat.id IS NULL THEN
    RAISE EXCEPTION 'category not found in organization' USING ERRCODE = '23503';
  END IF;
  IF cat.key IN ('labor', 'internal_employee_payroll') THEN
    RAISE EXCEPTION 'category not allowed for remediation' USING ERRCODE = '23514';
  END IF;
  IF exp.cost_family IS NOT NULL
     AND exp.cost_family::text IS DISTINCT FROM cat.family THEN
    RAISE EXCEPTION 'classification_remediation_destination_mismatch'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.next_gen_latch_acquire('expense_classification_remediation');
  BEGIN
    UPDATE public.expenses
    SET
      cost_category_id = p_cost_category_id,
      cost_family = COALESCE(exp.cost_family, cat.family::public.cost_family),
      classification_status = 'classified',
      updated_at = now()
    WHERE id = p_expense_id AND organization_id = p_organization_id;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM app.next_gen_latch_release('expense_classification_remediation');
      RAISE;
  END;
  PERFORM app.next_gen_latch_release('expense_classification_remediation');

  INSERT INTO public.audit_events (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    p_organization_id,
    p_actor_user_id,
    'expense.classification_remediated',
    'expense',
    p_expense_id,
    jsonb_build_object('cost_category_id', p_cost_category_id),
    now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.remediate_expense_classification(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remediate_expense_classification(uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.validate_expense_reversal_correlation(public.expenses) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_expense_reversal_correlation(public.expenses) TO authenticated, service_role;

-- F-0070-K: protect canonical category semantics (system keys always immutable)
CREATE OR REPLACE FUNCTION app.cost_categories_semantic_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.is_system = true
       AND (
         NEW.key IS DISTINCT FROM OLD.key
         OR NEW.family::text IS DISTINCT FROM OLD.family::text
       ) THEN
      RAISE EXCEPTION 'system_cost_category_semantics_immutable'
        USING ERRCODE = '23514';
    END IF;

    IF NEW.key IS DISTINCT FROM OLD.key
       OR NEW.family::text IS DISTINCT FROM OLD.family::text THEN
      IF EXISTS (
        SELECT 1 FROM public.expenses e
        WHERE e.cost_category_id = OLD.id
          AND e.organization_id = OLD.organization_id
          AND e.status = 'finalized'
      ) OR EXISTS (
        SELECT 1 FROM public.ap_bill_lines l
        WHERE l.cost_category_id = OLD.id
          AND l.organization_id = OLD.organization_id
          AND l.classification_status = 'classified'
      ) THEN
        RAISE EXCEPTION 'cost_category_semantic_immutable_with_history'
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS cost_categories_semantic_guard ON public.cost_categories;
CREATE TRIGGER cost_categories_semantic_guard
  BEFORE UPDATE OF key, family ON public.cost_categories
  FOR EACH ROW
  EXECUTE FUNCTION app.cost_categories_semantic_guard();

-- F-0070-A/E: AP recognition — open | partially_matched | matched
CREATE OR REPLACE FUNCTION app.is_ap_bill_recognized_status(st text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT st IN ('open', 'partially_matched', 'matched');
$$;

CREATE OR REPLACE FUNCTION app.validate_ap_bill_recognition_atoms(p_bill_id uuid, p_org_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  bill_rec record;
  line_count int;
  bad_line_count int;
  sum_net numeric(18,6);
  sum_tax numeric(18,6);
  sum_gross numeric(18,6);
BEGIN
  SELECT net_amount, tax_amount, gross_amount, currency, status
  INTO bill_rec
  FROM public.ap_bills
  WHERE id = p_bill_id AND organization_id = p_org_id
  FOR UPDATE;

  IF bill_rec IS NULL THEN
    RAISE EXCEPTION 'AP bill not found' USING ERRCODE = '23503';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE l.classification_status IS DISTINCT FROM 'classified'
         OR l.cost_category_id IS NULL
         OR l.currency IS DISTINCT FROM bill_rec.currency
    ),
    COALESCE(SUM(l.net_amount), 0),
    COALESCE(SUM(l.tax_amount), 0),
    COALESCE(SUM(l.gross_amount), 0)
  INTO line_count, bad_line_count, sum_net, sum_tax, sum_gross
  FROM public.ap_bill_lines l
  WHERE l.ap_bill_id = p_bill_id
    AND l.organization_id = p_org_id;

  IF line_count = 0 OR bad_line_count > 0 THEN
    RAISE EXCEPTION 'AP bill cannot be recognized until every line has a classified transaction category'
      USING ERRCODE = '23514';
  END IF;

  IF sum_net IS DISTINCT FROM bill_rec.net_amount
     OR sum_tax IS DISTINCT FROM bill_rec.tax_amount
     OR sum_gross IS DISTINCT FROM bill_rec.gross_amount THEN
    RAISE EXCEPTION 'AP bill line economics do not reconcile to bill NET/TAX/GROSS'
      USING ERRCODE = '23514';
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION app.assert_ap_bill_recognition_gate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP = 'INSERT'
     AND app.is_ap_bill_recognized_status(NEW.status) THEN
    RAISE EXCEPTION 'AP bills must be created as draft before recognition'
      USING ERRCODE = '23514';
  END IF;

  -- VOID is terminal: no resurrection to draft/open/matched states.
  IF TG_OP = 'UPDATE'
     AND OLD.status = 'void'
     AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'void AP bills are terminal'
      USING ERRCODE = '23514';
  END IF;

  -- Recognized → void requires trusted lifecycle latch (not naked status UPDATE).
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'void'
     AND OLD.status IS DISTINCT FROM 'void' THEN
    IF NOT app.next_gen_latch_held('ap_bill_void') THEN
      RAISE EXCEPTION 'ap_bill_void_trusted_path_required'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NOT app.is_ap_bill_recognized_status(OLD.status)
     AND app.is_ap_bill_recognized_status(NEW.status) THEN
    PERFORM app.validate_ap_bill_recognition_atoms(NEW.id, NEW.organization_id);
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bills_recognition_gate ON public.ap_bills;
CREATE TRIGGER ap_bills_recognition_gate
  BEFORE INSERT OR UPDATE OF status
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ap_bill_recognition_gate();

-- F-0070-B: recognized AP lines are financial history — serialize with parent bill lock
CREATE OR REPLACE FUNCTION app.assert_ap_bill_line_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  parent_status text;
  bill_id uuid;
  org_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    bill_id := OLD.ap_bill_id;
    org_id := OLD.organization_id;
  ELSE
    bill_id := NEW.ap_bill_id;
    org_id := NEW.organization_id;
  END IF;

  SELECT status INTO parent_status
  FROM public.ap_bills
  WHERE id = bill_id AND organization_id = org_id
  FOR UPDATE;

  IF NOT app.is_ap_bill_recognized_status(parent_status) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'recognized AP bill lines cannot be inserted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'recognized AP bill lines cannot be deleted'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF app.next_gen_latch_held('ap_line_classification_remediation') THEN
      IF OLD.classification_status IS DISTINCT FROM 'needs_classification' THEN
        RAISE EXCEPTION 'ap_line_remediation_only_for_needs_classification'
          USING ERRCODE = '23514';
      END IF;
      IF NEW.quantity IS DISTINCT FROM OLD.quantity
         OR NEW.unit_amount IS DISTINCT FROM OLD.unit_amount
         OR NEW.line_total IS DISTINCT FROM OLD.line_total
         OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
         OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
         OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
         OR NEW.currency IS DISTINCT FROM OLD.currency
         OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
         OR NEW.economic_target_type IS DISTINCT FROM OLD.economic_target_type
         OR NEW.project_id IS DISTINCT FROM OLD.project_id
      THEN
        RAISE EXCEPTION 'ap_line_remediation_scope_violation'
          USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END IF;

    IF NEW.quantity IS DISTINCT FROM OLD.quantity
       OR NEW.unit_amount IS DISTINCT FROM OLD.unit_amount
       OR NEW.line_total IS DISTINCT FROM OLD.line_total
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.cost_category_id IS DISTINCT FROM OLD.cost_category_id
       OR NEW.cost_family IS DISTINCT FROM OLD.cost_family
       OR NEW.classification_status IS DISTINCT FROM OLD.classification_status
       OR NEW.economic_target_type IS DISTINCT FROM OLD.economic_target_type
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
    THEN
      RAISE EXCEPTION 'recognized AP bill line economics are immutable'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bill_lines_immutability_guard ON public.ap_bill_lines;
CREATE TRIGGER ap_bill_lines_immutability_guard
  BEFORE INSERT OR UPDATE OR DELETE
  ON public.ap_bill_lines
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ap_bill_line_immutability_guard();

-- F-0070-C2: recognized AP parent bill economics are immutable (lines alone are not enough)
CREATE OR REPLACE FUNCTION app.assert_ap_bill_economic_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF NOT app.is_ap_bill_recognized_status(OLD.status) THEN
    RETURN NEW;
  END IF;

  -- Trusted void path may change status to void only.
  IF app.next_gen_latch_held('ap_bill_void')
     AND NEW.status = 'void'
     AND OLD.status IS DISTINCT FROM 'void' THEN
    IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
       OR NEW.project_id IS DISTINCT FROM OLD.project_id
       OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
       OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
       OR NEW.currency IS DISTINCT FROM OLD.currency
       OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
       OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
       OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
       OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
       OR NEW.amount_includes_tax IS DISTINCT FROM OLD.amount_includes_tax
       OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
       OR NEW.tax_basis IS DISTINCT FROM OLD.tax_basis
       OR NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id
       OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
    THEN
      RAISE EXCEPTION 'ap_bill_void_scope_violation'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.vendor_id IS DISTINCT FROM OLD.vendor_id
     OR NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.purchase_order_id IS DISTINCT FROM OLD.purchase_order_id
     OR NEW.bill_date IS DISTINCT FROM OLD.bill_date
     OR NEW.currency IS DISTINCT FROM OLD.currency
     OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
     OR NEW.net_amount IS DISTINCT FROM OLD.net_amount
     OR NEW.tax_amount IS DISTINCT FROM OLD.tax_amount
     OR NEW.gross_amount IS DISTINCT FROM OLD.gross_amount
     OR NEW.amount_includes_tax IS DISTINCT FROM OLD.amount_includes_tax
     OR NEW.tax_snapshot IS DISTINCT FROM OLD.tax_snapshot
     OR NEW.tax_basis IS DISTINCT FROM OLD.tax_basis
     OR NEW.subcontract_agreement_id IS DISTINCT FROM OLD.subcontract_agreement_id
     OR NEW.archived_at IS DISTINCT FROM OLD.archived_at
  THEN
    RAISE EXCEPTION 'recognized AP bill economics are immutable'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS ap_bills_economic_immutability_guard ON public.ap_bills;
CREATE TRIGGER ap_bills_economic_immutability_guard
  BEFORE UPDATE
  ON public.ap_bills
  FOR EACH ROW
  EXECUTE FUNCTION app.assert_ap_bill_economic_immutability_guard();

-- F-0070-J2: controlled historical AP line classification remediation
CREATE OR REPLACE FUNCTION app.remediate_ap_bill_line_classification(
  p_line_id uuid,
  p_organization_id uuid,
  p_cost_category_id uuid,
  p_actor_user_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  line_rec record;
  cat record;
  bill_rec record;
BEGIN
  IF NOT app.is_org_member(p_organization_id) THEN
    RAISE EXCEPTION 'remediation_not_org_member' USING ERRCODE = '42501';
  END IF;
  IF NOT app.has_org_permission(p_organization_id, 'ap.manage') THEN
    RAISE EXCEPTION 'remediation_permission_denied' USING ERRCODE = '42501';
  END IF;

  SELECT l.id, l.ap_bill_id, l.classification_status, l.cost_family, l.organization_id
  INTO line_rec
  FROM public.ap_bill_lines l
  WHERE l.id = p_line_id AND l.organization_id = p_organization_id
  FOR UPDATE;

  IF line_rec.id IS NULL THEN
    RAISE EXCEPTION 'ap bill line not found' USING ERRCODE = '23503';
  END IF;
  IF line_rec.classification_status IS DISTINCT FROM 'needs_classification' THEN
    RAISE EXCEPTION 'remediation only for needs_classification AP lines' USING ERRCODE = '23514';
  END IF;

  SELECT b.id, b.status, b.bill_date
  INTO bill_rec
  FROM public.ap_bills b
  WHERE b.id = line_rec.ap_bill_id AND b.organization_id = p_organization_id
  FOR UPDATE;

  IF NOT app.is_ap_bill_recognized_status(bill_rec.status) THEN
    RAISE EXCEPTION 'remediation requires recognized AP bill' USING ERRCODE = '23514';
  END IF;
  IF bill_rec.bill_date IS NOT NULL
     AND app.is_month_closed(p_organization_id, to_char(bill_rec.bill_date, 'YYYY-MM')) THEN
    RAISE EXCEPTION 'remediation blocked in closed month' USING ERRCODE = '23514';
  END IF;

  SELECT id, family::text AS family, key INTO cat
  FROM public.cost_categories
  WHERE id = p_cost_category_id AND organization_id = p_organization_id;

  IF cat.id IS NULL THEN
    RAISE EXCEPTION 'category not found in organization' USING ERRCODE = '23503';
  END IF;
  IF cat.key IN ('labor', 'internal_employee_payroll') THEN
    RAISE EXCEPTION 'category not allowed for remediation' USING ERRCODE = '23514';
  END IF;
  IF line_rec.cost_family IS NOT NULL
     AND line_rec.cost_family::text IS DISTINCT FROM cat.family THEN
    RAISE EXCEPTION 'classification_remediation_destination_mismatch'
      USING ERRCODE = '23514';
  END IF;

  PERFORM app.next_gen_latch_acquire('ap_line_classification_remediation');
  BEGIN
    UPDATE public.ap_bill_lines
    SET
      cost_category_id = p_cost_category_id,
      cost_family = COALESCE(line_rec.cost_family, cat.family::public.cost_family),
      classification_status = 'classified',
      updated_at = now()
    WHERE id = p_line_id AND organization_id = p_organization_id;
  EXCEPTION
    WHEN OTHERS THEN
      PERFORM app.next_gen_latch_release('ap_line_classification_remediation');
      RAISE;
  END;
  PERFORM app.next_gen_latch_release('ap_line_classification_remediation');

  INSERT INTO public.audit_events (
    id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at
  ) VALUES (
    gen_random_uuid(),
    p_organization_id,
    p_actor_user_id,
    'ap_bill_line.classification_remediated',
    'ap_bill_line',
    p_line_id,
    jsonb_build_object(
      'ap_bill_id', line_rec.ap_bill_id,
      'cost_category_id', p_cost_category_id
    ),
    now()
  );
END;
$fn$;

REVOKE ALL ON FUNCTION app.remediate_ap_bill_line_classification(uuid, uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.remediate_ap_bill_line_classification(uuid, uuid, uuid, uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION app.validate_ap_bill_recognition_atoms(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.validate_ap_bill_recognition_atoms(uuid, uuid) TO authenticated, service_role;

-- AP line explicit project destination requires project access (parent RLS is not enough)
SELECT app.and_authenticated_policy_predicate(
  'ap_bill_lines',
  $pred$
    economic_target_type IS DISTINCT FROM 'project'
    OR project_id IS NULL
    OR app.can_access_project(organization_id, project_id)
  $pred$
);

REVOKE ALL ON FUNCTION app.is_ap_bill_recognized_status(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.is_ap_bill_recognized_status(text) TO authenticated, service_role;
