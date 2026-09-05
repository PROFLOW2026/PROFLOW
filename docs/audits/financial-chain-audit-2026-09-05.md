# Financial Chain Deep Audit — 2026-09-05

Modules audited: `ap`, `billing`, `financials`, `month-close`, `expenses`, `vendors`, `retention`, `commercial`, `ops-finance`.

---

## What Works Correctly

| Domain | Correct Behaviors |
|--------|-------------------|
| **AP** | Bill lifecycle `draft → open → partially_matched → matched → void` well-defined. Payments are cash-only (never Actual). Vendor credits reduce both Outstanding AND Actual. Partial payments via header+application model. Aging by `dueDate` (5 buckets). Multi-project allocation via `bill_project_allocation`. Expense-AP dedup via accepted match deductions. Retention per bill (cash timing only). Month-close gate `assertMonthOpenForRewrite` enforced on bill create/void. PO commitment consumed at post; restored on void. |
| **Billing** | `invoiced` / `paid` / `outstanding` kept fully separate. Retention per billing record (cash-timing only, does not inflate invoiced). Partial collection supported (open/partial/paid/overdue). Aging (5 buckets). Credit notes handled (negate invoiced amount). Payment terms inherited hierarchically (contract → client → org default). |
| **Financials** | `Actual Cost` = expenses + labor + recognized bills (net of dedup) + month-close adjustments — NOT cash paid. `Commitment` ≠ Actual. `openApPayable` disclosed separately, never in Forecast. Direct vs Full Actual distinction. `allocatedGeneralBusinessCost` attribution-only. |
| **Month-Close** | Three-state machine `open → ready → closed` (closed terminal). 100% completeness required before close. Post-close corrections via `month_close_adjustments` supersede pattern. General-cost pool frozen on close. DB-level `assertMonthOpenForRewrite` covers expenses, AP bills, credits, labor allocations. |
| **Expenses** | `draft → finalized → void` with reversal/adjustment chain. Overhead tracked separately. Allocation to multiple projects via allocation lines (overhead/shared). Allocation amounts sum exactly to allocatable total with cent reconciliation. Month-close gate enforced. |
| **Payment Terms** | `eom_plus_days` correctly implements שוטף+30/60/90. Hierarchical resolution for both AP and AR. Due-date stored at create, never rewritten when catalog changes. |
| **Commercial** | Change requests never move CCV — only change orders do. `currentContractValue = original + additions − reductions`. Pending changes shown separately. `netInvoiced` uses ex-VAT subtotal for backlog math. |
| **Subcontract Cash** | Reads from existing AP bills tagged to the agreement — no separate cash store, no double-count source. |
| **Ops-Finance** | Explicit rule: ops record cost alone = 0 Actual. Only linked + finalized expenses contribute. |

---

## Findings

```json
[
  {
    "id": "FIN-001",
    "domain": "AP / Month-Close",
    "severity": "CRITICAL",
    "current_behavior": "The completeness check `vendor_bills_unallocated` uses `b.total_amount` (GROSS, including VAT) as the denominator. SQL: `total_amount - SUM(allocation_amounts) > 0.000001`. AP bill project allocations are applied against `recognizedNet` (NET ex-VAT). For any recognized bill with VAT, allocation amounts sum to NET but the check compares to GROSS, producing a false positive remainder equal to the VAT amount.",
    "expected_business_behavior": "A bill whose allocation lines sum to 100% of its NET (recognized cost) should be reported as fully allocated. The check should compare against COALESCE(net_amount, total_amount).",
    "source_of_truth": "src/modules/month-close/data/completeness.repository.ts (countVendorBillsUnallocated, ~line 226-243) vs src/modules/ap/domain/bill-project-allocation.ts (resolveBillProjectAllocationLines uses recognizedNet)",
    "root_cause": "SQL hardcodes `b.total_amount` instead of `COALESCE(b.net_amount, b.total_amount)`. Application layer correctly uses `recognizedNet` (net_amount) for allocation, but completeness SQL was written without matching that convention.",
    "financial_impact": "Any company using VAT on vendor bills (standard in Israel — 17% VAT) that has fully allocated their bills will ALWAYS fail this completeness check. Month close becomes impossible to achieve 100% completeness, blocking the entire OPEN → READY → CLOSED flow.",
    "ux_impact": "Month-close checklist shows 'vendor bills unallocated' as failing even when all bills are fully allocated. Users cannot close the month.",
    "data_integrity_impact": "If users remove allocations to pass the check, project Actual loses its granularity — general cost remainder absorbs all bill costs instead of the correct project slices.",
    "recommended_fix": "In `countVendorBillsUnallocated`, replace `b.total_amount::numeric` with `COALESCE(b.net_amount::numeric, b.total_amount::numeric)` in both the EXISTS filter and the outer WHERE remainder check.",
    "tests_required": "Unit test: bill with 17% VAT, fully allocated to NET → should NOT appear in unallocated count. Integration test: month-close completeness reaches 100% for org with VAT bills that are fully allocated."
  },
  {
    "id": "FIN-002",
    "domain": "AP / Month-Close",
    "severity": "HIGH",
    "current_behavior": "The `ap_anomalies` completeness check flags ALL bills with `status = 'partially_matched'` as anomalies (one of the OR conditions). A bill with `partially_matched` status is a legitimate recognized bill partially reconciled to a PO — normal for progress billing against a PO.",
    "expected_business_behavior": "`partially_matched` is a valid ongoing state: the bill is recognized (Actual), partially reconciled to a PO, and the remaining amount awaits a further match. Only structural integrity issues (total ≠ sum of lines, over-allocation) should be anomalies.",
    "source_of_truth": "src/modules/month-close/data/completeness.repository.ts (countApAnomalies, ~line 286-316)",
    "root_cause": "The SQL treats `partially_matched` as an anomaly, conflating PO reconciliation lifecycle with data quality checks.",
    "financial_impact": "Any company with open PO-linked vendor bills not fully reconciled by month-end cannot close the month. Common in construction where bills arrive before PO reconciliation is complete.",
    "ux_impact": "Month-close completeness checklist fails for `ap_anomalies` whenever there are partially-matched bills. Users are forced to reject valid matches just to close the month.",
    "data_integrity_impact": "Forcing resolution of partial matches before close could lead to incorrect match acceptances or rejections to clear the anomaly.",
    "recommended_fix": "Remove `b.status = 'partially_matched'` from the anomaly OR condition. Keep only: (1) total ≠ sum(lines) by > 0.01, (2) sum(allocations) > total + tolerance. Optionally add a SEPARATE completeness check key `unreconciled_po_bills` for partially-matched bills older than 30 days (applicable=false by default).",
    "tests_required": "Unit test: bill with `partially_matched` status should not appear in `ap_anomalies` count. Integration test: month with only partially-matched bills (no structural anomalies) reaches 100% completeness."
  },
  {
    "id": "FIN-003",
    "domain": "Billing / Month-Close",
    "severity": "HIGH",
    "current_behavior": "Billing record finalization (`finalizeBillingRecord`, `finalizeBillingRecordCore`) does NOT call `assertMonthOpenForRewrite`. A billing record with `issueDate` in a closed month can be finalized after that month has been closed, retroactively changing AR outstanding and project financial figures for a frozen period.",
    "expected_business_behavior": "The same closed-period integrity guard applied to AP bills, expenses, and labor should apply to billing records. Finalizing a billing record in a closed month changes revenue recognition and outstanding balances for that period.",
    "source_of_truth": "src/modules/billing/application/finalize-billing-record.ts (finalizeBillingRecordCore — no assertMonthOpenForRewrite). Compare: src/modules/ap/application/bills.ts (promoteDraftApBillToOpen calls assertMonthOpenForRewrite)",
    "root_cause": "Month-close SCHEMA_REQUEST.md lists protected actions but NOT billing finalize/void — intentional or accidental omission.",
    "financial_impact": "Retroactive billing record finalization in a closed month changes: (1) billing.invoiced and billing.outstanding for the project, (2) org-level AR summary, (3) cash flow figures. These bypass the closed-period freeze.",
    "ux_impact": "Month-close process cannot guarantee immutability of revenue figures. After a period is officially closed, AR balances can silently change.",
    "data_integrity_impact": "Closed months are supposed to be immutable snapshots. Retroactive billing changes undermine audit trails and period-end reports.",
    "recommended_fix": "Add `await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(issueDate))` to `finalizeBillingRecordCore` and `void-billing-record.ts`. Also add to `record-payment.ts` using the `paymentDate`.",
    "tests_required": "Integration test: attempt to finalize a billing record in a closed month → should throw `closedPeriodSourceRewriteError`. Test void-billing and record-payment also respect month-close gate."
  },
  {
    "id": "FIN-004",
    "domain": "Billing / Month-Close",
    "severity": "MEDIUM",
    "current_behavior": "`record-payment.ts` does not call `assertMonthOpenForRewrite`. A payment with `paymentDate` landing in a closed month can be recorded without restriction, creating retroactive cash flow changes.",
    "expected_business_behavior": "Payment dates in closed months should be rejected or require a correction path.",
    "source_of_truth": "src/modules/billing/application/record-payment.ts (no assertMonthOpenForRewrite call)",
    "root_cause": "Same root cause as FIN-003 — billing module was not included in the month-close protection sweep.",
    "financial_impact": "Cash flow reports and payment aging for closed periods can change retroactively. billing.paid and billing.outstanding for a closed month's records can increase/decrease after close.",
    "ux_impact": "Finance team reviewing closed-month cash collections may see figures that change after close.",
    "data_integrity_impact": "Low — payment records themselves are append-only. But aggregate paid/outstanding for closed periods changes.",
    "recommended_fix": "In `record-payment.ts`, add `await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(paymentDate))` after `paymentDate` is resolved.",
    "tests_required": "Integration test: record payment with date in closed month → rejected. Record payment in open month → accepted."
  },
  {
    "id": "FIN-005",
    "domain": "AP",
    "severity": "MEDIUM",
    "current_behavior": "Loading recognized vendor bill atoms uses `row.netAmount ?? row.totalAmount` as the Actual cost amount. Legacy AP bills without a populated `netAmount` (pre-tax-split migration) use `totalAmount` (GROSS including VAT) as recognized Actual cost.",
    "expected_business_behavior": "Actual Cost should always be the NET economic cost (ex-VAT). VAT is a recoverable tax liability, not a project cost.",
    "source_of_truth": "src/modules/financials/data/recognized-vendor-bill-atoms.repository.ts (line ~149, ~332)",
    "root_cause": "Migration to separate net_amount from total_amount was not retroactive. Legacy bills have net_amount = null. The fallback keeps legacy bills in Actual but uses gross amount.",
    "financial_impact": "For any org with legacy AP bills (before tax-split migration), Actual cost is overstated by the VAT amount on those bills. At 17% VAT rate and ₪1M in legacy bills, Actual is overstated by ~₪170K.",
    "ux_impact": "Project profit margins appear lower than actual due to inflated Actual cost for historical bills.",
    "data_integrity_impact": "Historical Actual figures are permanently inflated until data is backfilled.",
    "recommended_fix": "Run a one-time migration to populate `net_amount` for legacy AP bills where `net_amount IS NULL` and `tax_amount IS NOT NULL`: `SET net_amount = total_amount - tax_amount`. If `tax_amount` is also null, set `net_amount = total_amount`.",
    "tests_required": "Unit test: bill with net_amount null → Actual uses total_amount as documented fallback. Data migration test: after backfill, all bills have non-null net_amount."
  },
  {
    "id": "FIN-006",
    "domain": "AP / Month-Close",
    "severity": "MEDIUM",
    "current_behavior": "The `countMissingProjectAllocations` completeness check combines two different issue types — (1) finalized direct_project expenses with null project_id, and (2) AP bills with null project and no allocation lines — into a single issue count with mixed entity IDs.",
    "expected_business_behavior": "Expense allocation gaps and AP bill attribution gaps are different workflows with different fix actions. They should be separate completeness check items.",
    "source_of_truth": "src/modules/month-close/data/completeness.repository.ts (countMissingProjectAllocations, ~line 325-371)",
    "root_cause": "The completeness check aggregates both entity types under one key `missing_project_allocations`. No separate key for AP bill attribution.",
    "financial_impact": "No direct financial error, but the combined count is misleading.",
    "ux_impact": "Month-close checklist shows a combined issue count that is difficult to act on. Users may fix expenses and believe the issue is resolved, only to find AP bill issues remain.",
    "data_integrity_impact": "None directly, but unclear attribution increases the chance that issues are left unresolved.",
    "recommended_fix": "Split into two check keys: `missing_expense_project_allocation` and `missing_ap_bill_project_attribution`. Update COMPLETENESS_CHECK_KEYS and scoring logic accordingly.",
    "tests_required": "Unit test: separate check keys each report correct counts independently."
  },
  {
    "id": "FIN-007",
    "domain": "AP",
    "severity": "MEDIUM",
    "current_behavior": "AP bills with null `dueDate` are assigned to the 'current' aging bucket (`bucketForDaysPastDue(null) === 'current'`). There is no validation requiring `dueDate` when a bill is posted. Bills from years ago without a due date always appear as 'current', never as 'overdue'.",
    "expected_business_behavior": "Bills without a due date that are old should appear in a separate 'no_due_date' bucket or fall back to using `billDate + org_default_term_days` for aging purposes.",
    "source_of_truth": "src/modules/ap/domain/payables-aging.ts (bucketForDaysPastDue — line ~46)",
    "root_cause": "The aging function treats `null` due date as 'not yet due'. Was a safe default but creates a blind spot for bills without payment terms.",
    "financial_impact": "AP aging report understates overdue payables. Cash exposure to past-due vendors is hidden under 'current'.",
    "ux_impact": "AP aging dashboard shows incorrect overdue totals. Vendor follow-up workflow misses bills with no due date.",
    "data_integrity_impact": "None — bill is correctly recorded; only aging classification is wrong.",
    "recommended_fix": "Option A: Add `no_due_date` bucket for bills where `dueDate IS NULL`. Option B: Fall back to `billDate + 30 days` when `dueDate` is null. Option C: Require `dueDate` when posting a bill (status = 'open').",
    "tests_required": "Unit test: bill with null dueDate, billDate = 90 days ago → should NOT appear in 'current' bucket."
  },
  {
    "id": "FIN-008",
    "domain": "AP",
    "severity": "MEDIUM",
    "current_behavior": "When restoring PO commitment on bill void (`restoreCommitmentForVoidedBill`), the restoration uses `bill.totalAmount` (GROSS). But the original consumption used `bill.netAmount` (NET). If the bill had VAT, restored amount > consumed amount, inflating PO commitment beyond its original value.",
    "expected_business_behavior": "Void should restore exactly what was consumed at post. Consumption used netAmount; restoration must also use netAmount.",
    "source_of_truth": "src/modules/ap/application/void-bill.ts (restoreCommitmentForVoidedBill — line ~148: uses bill.totalAmount) vs src/modules/ap/application/bills.ts (consumePoCommitmentForPostedBill — line ~87: uses updated.netAmount)",
    "root_cause": "The `restoreCommitmentForVoidedBill` function accesses `bill.totalAmount` directly. The equivalent post-path reads `updated.netAmount` explicitly. Asymmetry introduced when tax-split migration added separate net/gross tracking.",
    "financial_impact": "Voiding a bill with VAT overcredits PO commitment by the VAT amount. Example: ₪117K bill (₪100K net + ₪17K VAT). Post consumes ₪100K. Void restores ₪117K. PO commitment increases by ₪17K beyond its original value.",
    "ux_impact": "PO commitment balance is wrong after a bill void with VAT. Procurement shows inflated available commitment.",
    "data_integrity_impact": "HIGH — PO committed cost balance becomes incorrect, enabling procurement spend to exceed PO authorization amount.",
    "recommended_fix": "In `restoreCommitmentForVoidedBill`, use `bill.netAmount ?? bill.totalAmount` instead of `bill.totalAmount` to match the consumption path.",
    "tests_required": "Unit test: post bill with VAT (net=100, gross=117) → consumed=100. Void same bill → restored=100, not 117. Integration test: PO commitment balance unchanged after post+void cycle."
  },
  {
    "id": "FIN-009",
    "domain": "Billing",
    "severity": "MEDIUM",
    "current_behavior": "`record-payment.ts` reads current `paidAmount` from DB and validates against it, but there is no DB-level lock or optimistic concurrency check before inserting the payment. Two concurrent payment requests for the same billing record could both pass the over-payment check simultaneously.",
    "expected_business_behavior": "Payment recording should be atomic. The system must prevent two concurrent payments from both being accepted if combined amount exceeds outstanding.",
    "source_of_truth": "src/modules/billing/application/record-payment.ts (no SELECT FOR UPDATE). Compare: src/modules/ap/application/void-bill.ts (uses withTransaction + lockBillsForUpdate)",
    "root_cause": "AP bill void uses `withTransaction` + `repo.lockBillsForUpdate`. Billing payment does not use a comparable locking mechanism.",
    "financial_impact": "In a low-probability concurrent scenario: customer payment double-applied, reducing outstanding to negative (overpayment).",
    "ux_impact": "Rare — only triggered by concurrent requests. Overpayment would appear as negative outstanding.",
    "data_integrity_impact": "Data inconsistency: outstanding balance goes negative without an explicit credit note.",
    "recommended_fix": "Wrap billing payment in a transaction with row-level lock: `SELECT FOR UPDATE` on the billing record before reading `paidAmount` and before inserting the payment.",
    "tests_required": "Concurrency test: two simultaneous payment requests with combined amount = 110% of outstanding → only one should succeed."
  },
  {
    "id": "FIN-010",
    "domain": "Financials",
    "severity": "LOW",
    "current_behavior": "`composeVendorCostRecognition` accepts `linkedExpenseAmounts` parameter and computes `linkedExpenseTotal`, but `netRecognizedVendorActual` is always `recognizedBillTotal` — the parameter is never used in the return value. The actual expense-bill deduplication happens upstream in `applyLinkedExpenseDeductionsToContributions`. The `linkedExpenseAmounts` field is dead code in the return path.",
    "expected_business_behavior": "The function signature implies it returns a net value after expense deduction, but it does not. This could mislead future developers.",
    "source_of_truth": "src/modules/ap/domain/vendor-cost-recognition.ts (composeVendorCostRecognition — line ~88-91). src/modules/financials/application/compose-project-financials.ts (calls with linkedExpenseAmounts: [])",
    "root_cause": "Dedup architecture was changed to happen at the expense-contribution level, but function signature was not updated to remove the now-unused parameter.",
    "financial_impact": "None currently — correct dedup happens upstream. Risk: future misuse if a developer passes real amounts expecting them to deduct from the return value.",
    "ux_impact": "None.",
    "data_integrity_impact": "None currently. Latent risk of future double-counting.",
    "recommended_fix": "Either remove `linkedExpenseAmounts` from `VendorCostRecognitionInput` or add a prominent comment documenting that `netRecognizedVendorActual = recognizedBillTotal` by design (dedup happens upstream).",
    "tests_required": "Unit test: calling composeVendorCostRecognition with non-empty linkedExpenseAmounts → verify netRecognizedVendorActual still equals recognizedBillTotal."
  },
  {
    "id": "FIN-011",
    "domain": "Financials / AP",
    "severity": "LOW",
    "current_behavior": "Recognized vendor bills without an explicit `projectId` AND without applied project allocation lines accumulate in a `vendor_bill_general_remainder` pool (`null_project` kind). These costs contribute to company-level Actual but are NOT attributed to any project's `actualCostToDate`. `company_actual > sum(project_actuals)`.",
    "expected_business_behavior": "Unattributed bills should be visibly surfaced as a reconciliation gap. The completeness check for `missing_project_allocations` does flag them within month-close, but outside that workflow there is no project-level disclosure.",
    "source_of_truth": "src/modules/ap/domain/vendor-general-remainder.ts. src/modules/financials/application/recompute-general-cost-month.ts",
    "root_cause": "Architectural choice: unattributed costs go to company-level general pool. Correct for overhead vendors but problematic for project-specific bills that lack project tag.",
    "financial_impact": "Project profit margins appear better than reality for projects whose bills lack the projectId tag.",
    "ux_impact": "Project financials panel shows lower Actual than expected. Finance team may not notice missing attribution until month-close.",
    "data_integrity_impact": "No corruption — data is correctly pooled at company level. Attribution is just missing.",
    "recommended_fix": "Add a dashboard warning badge on project financials when `vendor_bill_general_remainder` has `null_project` bills that could logically belong to that project (same vendor, similar amount).",
    "tests_required": "Unit test: bill with null projectId → classified as null_project remainder; not in project Actual."
  },
  {
    "id": "FIN-012",
    "domain": "Month-Close",
    "severity": "LOW",
    "current_behavior": "Month-close does NOT freeze labor costs automatically. Closing a month calls `recomputeGeneralCostMonth` (freezes general cost pool) but does NOT explicitly freeze `employee_month_costs` rows or prevent new labor allocation runs for the closed month. The `assertMonthOpenForRewrite` gate only fires when calling code explicitly checks it.",
    "expected_business_behavior": "Closing a month should guarantee labor cost inputs are frozen. New time entry corrections after month close should require a `month_close_adjustment` rather than silently modifying the original month's labor totals.",
    "source_of_truth": "src/modules/month-close/application/manage-periods.ts (closeMonthClosePeriod — only calls freezeGeneralCostMonth). src/modules/month-close/SCHEMA_REQUEST.md: 'No triggers yet that refuse silent UPDATE/DELETE of operational cost rows when status = closed'.",
    "root_cause": "DB-level triggers for full labor row freeze were documented as a gap in SCHEMA_REQUEST.md but not yet implemented.",
    "financial_impact": "Labor costs for a closed month can change without an explicit correction record, making the audit trail incomplete.",
    "ux_impact": "Finance team may see different labor costs in closed months over time without visible correction events.",
    "data_integrity_impact": "Medium — no financial error if app-layer guards work correctly, but DB-level protection is missing.",
    "recommended_fix": "Implement DB-level triggers on `employee_month_costs` and `labor_allocation_runs` that check `app.is_month_closed()` before allowing UPDATE/DELETE.",
    "tests_required": "Integration test: attempt to update employee_month_costs.known_quality after month close → DB trigger blocks it."
  },
  {
    "id": "FIN-013",
    "domain": "Expenses",
    "severity": "LOW",
    "current_behavior": "Direct-project expenses (`targeting.mode = 'project'`) target exactly ONE project. `assertNoAllocationsOnProjectExpense` throws if allocation lines are added to a project-targeted expense. To split a cost across projects, the user must use `mode = 'overhead'` with `costFamily = 'shared'`, which reclassifies the cost family.",
    "expected_business_behavior": "A subcontractor invoice covering two projects should be splittable as a direct project cost across both, not reclassified as 'shared' overhead.",
    "source_of_truth": "src/modules/expenses/domain/targeting.ts. src/modules/expenses/domain/allocation.ts",
    "root_cause": "Architectural decision: direct_project expenses are 1:1 with project. Multi-project is overhead/shared. AP bills have `bill_project_allocation` for multi-project direct cost; expenses do not.",
    "financial_impact": "Multi-project expense splits that must use 'shared' family get reported under shared/overhead cost category instead of direct project cost.",
    "ux_impact": "Finance team trying to split a direct material cost across two projects sees it reported as overhead/shared.",
    "data_integrity_impact": "None — total Actual is correct; cost family breakdown is distorted.",
    "recommended_fix": "Document that the AP bill module is the correct path for multi-project direct costs. Add a UI hint on the expense form when user selects 'shared' family with project allocations.",
    "tests_required": "No immediate code fix required. Document the design decision."
  },
  {
    "id": "FIN-014",
    "domain": "AP",
    "severity": "LOW",
    "current_behavior": "DEFAULT_PAYMENT_TERMS names are English only ('EOM + 30', 'EOM + 60', 'EOM + 90'). For Israeli construction companies, the standard terms are 'שוטף+30', 'שוטף+60', 'שוטף+90'. Also missing: 'Net 90' (straight 90 days from invoice date, commonly used).",
    "expected_business_behavior": "Payment terms should be labeled in Hebrew or bilingual so Israeli accountants immediately recognize standard terms and select correctly.",
    "source_of_truth": "src/modules/business-catalog/domain/types.ts (DEFAULT_PAYMENT_TERMS — English names only)",
    "root_cause": "Default seed was written in English. Localization of catalog entry names via DEFAULT_PAYMENT_TERMS.name is not yet done.",
    "financial_impact": "None — the calculation logic is correct. Risk: users select wrong term due to unrecognized English label, resulting in incorrect due dates.",
    "ux_impact": "Israeli users may not immediately recognize 'EOM + 30' as 'שוטף+30'. Could lead to selection errors.",
    "data_integrity_impact": "None if users select the correct term.",
    "recommended_fix": "Update DEFAULT_PAYMENT_TERMS names to include Hebrew labels or update via the i18n system. Add 'net_90' (net_days: 90) to the default terms.",
    "tests_required": "Manual UX review."
  }
]
```

---

## Priority Fix Order

| Priority | Finding | Why |
|----------|---------|-----|
| 🔴 P0 — Fix immediately | FIN-001 | Month close is broken for any org using VAT on bills (all Israeli orgs). One-line SQL fix. |
| 🔴 P0 — Fix immediately | FIN-002 | Month close is broken for any org with partially-matched PO bills. One-line SQL fix. |
| 🔴 P0 — Fix immediately | FIN-008 | PO commitment balance inflates after bill void with VAT. One-line code fix. Financial control bypass. |
| 🟠 P1 — Fix this sprint | FIN-003 | Billing records can be finalized in closed months. Add assertMonthOpenForRewrite to billing finalize. |
| 🟠 P1 — Fix this sprint | FIN-004 | Payments can be recorded with closed-month dates. Add assertMonthOpenForRewrite to record-payment. |
| 🟡 P2 — Fix next sprint | FIN-005 | Legacy AP bills use gross as Actual (net_amount null). Requires data backfill migration. |
| 🟡 P2 — Fix next sprint | FIN-006 | Missing project allocation check mixes expenses + bills. Split into two check keys. |
| 🟡 P2 — Fix next sprint | FIN-007 | AP aging hides null-dueDate bills in 'current'. Add 'no_due_date' bucket. |
| 🟡 P2 — Fix next sprint | FIN-009 | Billing payment has race condition. Add SELECT FOR UPDATE lock. |
| 🔵 P3 — Backlog | FIN-010 | Dead `linkedExpenseAmounts` parameter in cost recognition function. Clean up. |
| 🔵 P3 — Backlog | FIN-011 | Unattributed bills hidden in general pool — add UI disclosure. |
| 🔵 P3 — Backlog | FIN-012 | Labor not DB-frozen on month close — add triggers. |
| 🔵 P3 — Backlog | FIN-013 | Multi-project direct cost only via AP bills, not expenses — document. |
| 🔵 P3 — Backlog | FIN-014 | Add Hebrew payment term labels + Net 90. |
