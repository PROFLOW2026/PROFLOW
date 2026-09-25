-- =============================================================================
-- PROJECTFLOW — PAYROLL CASH REPAIR (PREPARED — DO NOT EXECUTE)
-- Organization: מתח ח.י הנדסת חשמל בע"מ
-- organization_id: 8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec
-- Prepared: 2026-09-25
-- Owner approval required before any execution.
-- =============================================================================

-- =============================================================================
-- PHASE 1 — APRIL DUPLICATE (READY FOR IMMEDIATE OWNER APPROVAL)
-- =============================================================================
--
-- KEEP:   52858ea4-9109-4331-8a3d-c7b67c83cfd5
-- VOID:   2807943d-8fcb-41e5-989d-3ee46982f8b0
--
-- Reason: owner-confirmed duplicate; kept row has vendor_id, payment_method=check,
--         correct VAT (NET 28,050 + VAT 5,049 = GROSS 33,099), stronger provenance.
--
-- APRIL PAID CASH (composeMonthCashFlow probe 2026-09-25):
--   BEFORE: 16 canonical lines, total 107,417.89 ILS
--   AFTER:  15 canonical lines, total  74,318.89 ILS  (−33,099 GROSS duplicate)
--
-- Affected row (VOID target):
--   id:              2807943d-8fcb-41e5-989d-3ee46982f8b0
--   status BEFORE:   finalized
--   status AFTER:    void
--   paid_at:         2026-04-15 (unchanged — history preserved)
--   gross_amount:    33,099.00
--   net_amount:      28,050.00
--   tax_amount:      5,049.00
--   vendor_id:       NULL
--   payment_method:  NULL
--
-- Kept row (unchanged):
--   id:              52858ea4-9109-4331-8a3d-c7b67c83cfd5
--   status:          finalized
--   vendor_id:       d2d96839-ae1c-400e-a4b7-f8e0a3de3fa0
--   payment_method:  check
--
-- Payment schedule impact:
--   expense_managerial_schedule_lines for 2807943d → status 'void'
--   (same as application voidExpense() path)
--   No change to 52858ea4 schedule lines.
--
-- Audit event (application path records):
--   action:     expense.voided
--   entity:     expense / 2807943d-8fcb-41e5-989d-3ee46982f8b0
--   before:     { status: 'finalized' }
--   after:      { status: 'void', reason: 'owner_confirmed_april_duplicate' }
--
-- RECOMMENDED EXECUTION (canonical application path, not raw SQL alone):
--   EXECUTE=1 npx tsx scripts/.mth-april-duplicate-void.ts
--
-- Raw SQL equivalent (review only — prefer voidExpense() for schedule + recompute):

BEGIN;

-- Pre-check
SELECT id, status, paid_at, gross_amount, net_amount, tax_amount, vendor_id, payment_method
FROM expenses
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'::uuid
  AND id IN (
    '2807943d-8fcb-41e5-989d-3ee46982f8b0'::uuid,
    '52858ea4-9109-4331-8a3d-c7b67c83cfd5'::uuid
  );

UPDATE expenses
SET status = 'void',
    updated_at = now()
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'::uuid
  AND id = '2807943d-8fcb-41e5-989d-3ee46982f8b0'::uuid
  AND status = 'finalized';

UPDATE expense_managerial_schedule_lines
SET status = 'void',
    updated_at = now()
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'::uuid
  AND expense_id = '2807943d-8fcb-41e5-989d-3ee46982f8b0'::uuid
  AND status <> 'void';

-- Post-check: duplicate must not appear in finalized April paid cash
SELECT id, status, paid_gross_amount
FROM expenses
WHERE organization_id = '8ef9e353-ca0c-4cad-b0c7-c2de612eb1ec'::uuid
  AND status = 'finalized'
  AND paid_at >= '2026-04-01' AND paid_at <= '2026-04-30'
  AND id IN (
    '2807943d-8fcb-41e5-989d-3ee46982f8b0'::uuid,
    '52858ea4-9109-4331-8a3d-c7b67c83cfd5'::uuid
  );

ROLLBACK; -- replace with COMMIT only after explicit owner approval

-- ROLLBACK / REVERSAL (Phase 1):
--   UPDATE expenses SET status = 'finalized' WHERE id = '2807943d-...' AND status = 'void';
--   UPDATE expense_managerial_schedule_lines SET status = 'scheduled'
--     WHERE expense_id = '2807943d-...' AND status = 'void';
--   Record compensating audit event expense.restored or expense.updated.

-- =============================================================================
-- PHASE 2 — EMPLOYEE PAYROLL HISTORY (NOT APPROVED — DO NOT EXECUTE)
-- =============================================================================
--
-- Rule: employee cash must come from employee_payroll_payments paid_amount + paid_at
--       (or audit-confirmed payment). NOT from employee_month_costs (employer cost).
--       NOT from rate_versions.base_rate (compensation config, not bank payment).
--
-- Structured evidence summary (probe 2026-09-25):
--
-- PROVEN CANONICAL (no owner input):
--   ערן יוסף  — 27,000/mo — payroll rows paid — cash months Feb–Sep 2026
--   פאדי מנצור — 5,625 — period 2026-04 — paid 2026-05-10 — payroll:4947882b
--   פאדי מנצור — 8,250 — period 2026-08 — paid 2026-09-09 — payroll:83b9d9f1
--
-- UNRESOLVED (owner input required per employee-month):
--   מוחמד נציר — periods 2026-01..2026-08 — voided obligations, NO paid_at
--   פאדי מנצור — periods 2026-01, 2026-02, 2026-05..2026-07 — NO obligation row
--   סאלח נציר  — periods 2026-01..2026-08 — NO obligation row (hire 2026-05-01)
--
-- BULK EXPENSES STILL COUNTING AS CASH (8 finalized vendor rows):
--   5057f5e5  paid 2026-03-15  gross 41,276.40
--   52858ea4  paid 2026-04-15  gross 33,099.00  (kept until Phase 2 maps employees)
--   2807943d  paid 2026-04-15  gross 33,099.00  (Phase 1 void — duplicate)
--   23559bd8  paid 2026-05-15  gross 25,311.00
--   49426715  paid 2026-06-15  gross 35,046.00
--   ae11fb0d  paid 2026-07-15  gross 36,344.00
--   113e8f4a  paid 2026-08-15  gross 45,430.00
--   2eca1fd7  paid 2026-09-15  gross 45,430.00
--   (+ 71a725ef upcoming/unpaid — not in paid cash today)
--
-- Phase 2 requires explicit owner-approved mapping:
--   employee × period × paid_amount × paid_at
-- before any payroll row is restored/inserted.
-- Bulk vendor expenses (התותחים) stay unless owner explicitly maps them later.
--
-- NO automatic void by amount/date/name similarity.
--
-- RECOMMENDED EXECUTION (after manifest filled):
--   Edit .cursor/.payroll-historical-repair-manifest.json
--   OWNER_APPROVED=1 EXECUTE=1 npx tsx scripts/.payroll-historical-repair-apply.ts
--
-- Example restore (מוחמד — ONLY after owner supplies real paid amount + date):
--   kind: restore_voided
--   paymentId: 9d212c69-f4e3-4646-a49a-3e6c253954c1  (2026-01)
--   paidAmount: <owner confirmed>
--   paidAt: <owner confirmed>
--   evidence: "owner confirmed bank transfer YYYY-MM-DD"
--
-- Example insert (פאדי — ONLY after owner supplies real paid amount + date):
--   kind: insert
--   employeeId: 4e742d25-03ee-49e7-a45e-15a545bfe3b4
--   yearMonth: 2026-01
--   expectedAmount: <owner confirmed>
--   paidAmount: <owner confirmed>
--   paidAt: <owner confirmed>
--   currency: ILS
--   evidence: "owner confirmed ..."
--
-- VOIDED MOHAMMAD ROW IDS (restore targets when approved):
--   2026-01 9d212c69-f4e3-4646-a49a-3e6c253954c1
--   2026-02 57dad991-a1f2-4ce2-8a94-2bfe62dc3efb
--   2026-03 2163f9e2-97d2-4117-8811-242dd2732262
--   2026-04 14867ba9-ade5-4994-84e5-183d61d50f98
--   2026-05 eb326854-f573-4ca5-905d-8e4c7bb8626b
--   2026-06 ebaa550f-c43a-435e-b0a7-ea188d86520d
--   2026-07 0a47f53a-4636-4ae3-b132-25d53aeb56d1
--   2026-08 6d6392f8-4a24-4d91-8a94-571434e20b93
