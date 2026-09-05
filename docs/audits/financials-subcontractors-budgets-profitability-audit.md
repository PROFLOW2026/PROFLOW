# ProjectFlow — Financials / Subcontractors / Budgets / Profitability Deep Audit

**Audit date:** 2026-09-05  
**Domains:** Project Financials, Subcontractors, Budgets, Overhead, Profitability, Forecast  
**Auditor:** Cursor Agent (Claude Sonnet 4.6)

---

## EXECUTIVE SUMMARY

The financial engine is architecturally sound with a well-designed separation between
Direct Actual, Full Actual, Commitment, Forecast, and Cash. The `CostPosition` type
enforces the key invariants in code. Subcontract commitment lifecycle is correctly
modeled and reconciles with AP actual. Budget vs actual overlay is implemented.
Profitability modes (direct / full / both) are org-configurable.

**12 findings** follow, ranging from CRITICAL (budget-mode profitability inconsistency)
to LOW (deprecated field retained but functionally safe).

---

## WHAT WORKS CORRECTLY

1. **Direct Actual engine**: Expenses + labor (True Cost) + recognized AP bills, with bill-linked expense dedup via `applyLinkedExpenseDeductionsToContributions`. No double-counting.
2. **Separation of Actual / Committed / Cash**: `committedOpen` is never summed into `actualCostToDate`; `openApPayable` (cash) is disclosed separately, not folded into Forecast Final Cost.
3. **Subcontract commitment formula**: `remaining = current − recognized AP actual`, net of open PO on same vendor (avoids PO/subcontract double-count in Forecast).
4. **Direct vs Full Actual**: `directActualCostToDate` / `fullActualCostToDate` clearly separated. `withAllocatedGeneralBusinessCost` cleanly attaches general without touching Direct.
5. **Profitability modes**: `direct` | `include_general` | `both` configured per org; profit never claimed when `priceNotSet`.
6. **Forecast Final Cost**: `directForecastFinalCost = Direct + committedOpen + ETC`; `fullForecastFinalCost = Full + committedOpen + ETC + futureGeneralForecast`. Both correct.
7. **ETC entry**: `expectedRemainingCost` stored on project; included in Forecast once. Does not duplicate PO commitments.
8. **Budget revision history**: Append-only revisions; total snapshot stored per revision.
9. **General pool conservation**: `assertGeneralPoolConservation` enforces `allocated + unallocatable = pool` exactly (signed, cent-accurate).
10. **FX exclusion disclosure**: Foreign-currency rows excluded from sums but disclosed as `partials` — never silently zeroed.
11. **Data confidence**: Incompleteness signals (missing employer cost, open drafts, open allocations) propagate to `DataConfidence` badge.
12. **Breakdown reconciliation**: `buildProjectActualBreakdown` explicitly asserts `sum(categories) = totalActual` (within ≤ 0.01 rounding residual).
13. **Subcontractor multi-project**: A vendor can have multiple `subcontract_agreements`, each on different projects. Org-level `/subcontracts` page filters by vendor and project.
14. **Retention**: `retentionPercent` on subcontract agreement; `retentionHeldRemaining` on AP bills tracked correctly.
15. **Per-contract commercial slices**: Projects with multiple contracts show individual `CommercialPosition` per contract; sum is the canonical total.
16. **Unallocated overhead visible**: `computeUnallocatedOrganizationCosts` surfaces unallocated general business costs in org reports.

---

## FINDINGS (JSON)

```json
[
  {
    "id": "PRJ-001",
    "domain": "Budget/Profitability",
    "severity": "HIGH",
    "current_behavior": "composeBudgetControlPosition() in src/modules/budgets/domain/variance.ts uses cost.estimatedFinalCost (deprecated, always equals directForecastFinalCost) for the budget forecast and variance calculation. When the org profitability mode is 'include_general', the budget variance panel shows Direct Forecast vs Budget — it does not include the allocated general business cost in the forecast.",
    "expected_business_behavior": "When the org is configured for 'include_general' profitability mode, the budget variance (and the Forecast vs Budget comparison in the budget panel) should compare against fullForecastFinalCost, not directForecastFinalCost. Otherwise the budget looks healthier than the full picture suggests.",
    "source_of_truth": "src/modules/budgets/domain/variance.ts:68-76, src/modules/financials/domain/resolve-forecast-cost-basis.ts",
    "root_cause": "variance.ts reads cost.estimatedFinalCost which is always the Direct forecast. It does not receive or use the projectProfitabilityMode, so it cannot switch to fullForecastFinalCost.",
    "financial_impact": "Budget variance is systematically understated (appears more favorable) when overhead allocations are material and org uses include_general mode. Projects may appear under-budget when they are over-budget on a full-cost basis.",
    "ux_impact": "Project budget panel shows green (favorable) variance when finance team expects red (over budget) once overhead is included.",
    "data_integrity_impact": "No data corruption, but misleading KPI displayed to users in include_general mode.",
    "recommended_fix": "Pass projectProfitabilityMode into composeBudgetControlPosition (or expose a resolveForecastCostBasis call). When mode === 'include_general', use cost.fullForecastFinalCost as the forecast input to variance.ts. Update the BudgetVarianceSummary and BudgetLineControlList UIs to use the resolved forecast basis.",
    "tests_required": "Unit test: composeBudgetControlPosition with include_general mode returns fullForecastFinalCost in forecast field. Integration test: budget panel shows correct variance when overhead allocation is non-zero."
  },
  {
    "id": "PRJ-002",
    "domain": "Budget/Actual Mapping",
    "severity": "HIGH",
    "current_behavior": "Budget lines with lineType='discipline' or lineType='cost_code' are marked 'unmapped' by lineHasReliableActualMapping() in src/modules/budgets/domain/map-line-actuals.ts (returns false for these types). These lines show budget amounts but no Actual, no Forecast, no Variance — only an 'unmapped' status badge.",
    "expected_business_behavior": "Users who build discipline- or cost-code-based budgets expect to see Actual spend against each line. Without it, the budget breakdown is decorative — the total 'engine_total' line shows Actual but the detail breakdown doesn't.",
    "source_of_truth": "src/modules/budgets/domain/map-line-actuals.ts:113-121, src/modules/budgets/SCHEMA_REQUEST.md",
    "root_cause": "Expense contributions and AP bills do not carry disciplineKey or costCode attributes; only categoryKey and workPackageId are available on expense records. SCHEMA_REQUEST.md acknowledges this as a known gap.",
    "financial_impact": "Budget-based cost control is partially blind for discipline and cost-code budgets. Project teams cannot see spend vs budget at the discipline level without exporting data manually.",
    "ux_impact": "Budget panel shows rows labeled 'unmapped' or '—' for Actual which causes user confusion and trust erosion in the budget module.",
    "data_integrity_impact": "No data loss. Unmapped remainder row correctly shows unattributed Actual.",
    "recommended_fix": "Option A (schema): Add optional disciplineKey / costCodeId columns to expense_allocations and ap_bills, then pass them through cost contributions. Option B (display): Show a clear tooltip/banner on discipline/cost-code lines explaining that line-level Actual attribution requires expense tagging — not an unmapped error. The SCHEMA_REQUEST.md option B is the right near-term fix.",
    "tests_required": "Unit test: lineHasReliableActualMapping returns false for discipline/cost_code. UX test: discipline budget line renders a 'not mappable' label rather than a blank/dash."
  },
  {
    "id": "PRJ-003",
    "domain": "Subcontractors",
    "severity": "HIGH",
    "current_behavior": "The subcontract data model (SubcontractAgreementRecord in src/modules/vendors/domain/subcontract-types.ts) has no advance payment concept. There is no advanceAmount field, no advance invoice type, and no advance flag on AP bills linked to subcontracts.",
    "expected_business_behavior": "Construction and services subcontracts routinely include advance payments (mobilization advances) that are later recovered from milestone invoices. The system should track: advance issued, advance balance outstanding, and net retention + advance deduction from each certified invoice.",
    "source_of_truth": "src/modules/vendors/domain/subcontract-types.ts:20-42, src/modules/vendors/domain/subcontract-cash.ts",
    "root_cause": "Advance tracking was not designed into the subcontract schema. SubcontractCashPosition only has billed, paid, outstanding.",
    "financial_impact": "Advance payments appear as ordinary AP payments. Recovery deductions from milestone invoices are invisible. Open advance balance is not tracked. Cash flow forecasting ignores mobilization advance outflows.",
    "ux_impact": "Subcontract card shows incorrect 'outstanding' amount (does not net out advance recovery). Users cannot report on advance exposure across projects.",
    "data_integrity_impact": "Cash figures on subcontract are correct in aggregate (advances and recoveries both flow through AP), but there is no line-item decomposition of advance vs milestone invoices.",
    "recommended_fix": "Add advanceType flag (enum: 'mobilization' | 'material' | null) to subcontract AP bills. Add advanceRecoveredAmount to subcontract cash position. Expose advance balance = issued − recovered in SubcontractDetail. This requires a schema migration (non-breaking: nullable columns).",
    "tests_required": "Domain test: advance balance = advance issued − recovered amounts. UI test: subcontract card shows advance line when advanceType is set."
  },
  {
    "id": "PRJ-004",
    "domain": "Budget",
    "severity": "MEDIUM",
    "current_behavior": "There is no budget overrun alerting mechanism. The budget panel shows negative variance (budget − forecast < 0) in a muted style but sends no notification. No badge, email, or in-app alert fires when Forecast > Budget.",
    "expected_business_behavior": "Project managers and finance approvers should be alerted when a project's Forecast Final Cost exceeds its approved budget. Threshold-based alerting (e.g., >5% over) is a standard ERP/PM capability.",
    "source_of_truth": "src/modules/budgets/ui/budget-variance-summary.tsx, src/modules/budgets/domain/variance.ts",
    "root_cause": "No notification or alerting module is triggered from budget variance calculation. The variance is computed but only displayed.",
    "financial_impact": "Budget overruns may go undetected until month-end review. Early detection could enable remediation.",
    "ux_impact": "No proactive signal to project stakeholders when budget is at risk.",
    "data_integrity_impact": "None.",
    "recommended_fix": "Add a budget alert rule (e.g., a notification row in a budget_alerts table) when variance crosses a configurable threshold (% or absolute). Integrate with the existing notification system. Near-term quick win: add a visual warning badge/color change to BudgetVarianceSummary when variance is negative.",
    "tests_required": "Unit test: budget variance is negative when forecast > budget. Integration test: alert badge is rendered when variance < 0."
  },
  {
    "id": "PRJ-005",
    "domain": "Overhead",
    "severity": "MEDIUM",
    "current_behavior": "The /overhead route (src/app/[locale]/(app)/overhead/page.tsx) immediately redirects to /expenses?costFamily=business_overhead. There is no dedicated overhead management UI, no overhead pool summary, no allocation preview, and no ability to manually assign overhead to projects.",
    "expected_business_behavior": "Finance users navigating to /overhead expect to see: (1) total overhead pool for the period, (2) how much has been allocated to each project, (3) unallocated remainder, (4) allocation method, and (5) the ability to trigger or preview allocations. The current redirect provides none of this.",
    "source_of_truth": "src/app/[locale]/(app)/overhead/page.tsx, src/modules/financials/domain/general-cost-allocation.ts",
    "root_cause": "A dedicated overhead hub page was not built. The route was created as a placeholder redirect to the expense list.",
    "financial_impact": "Finance teams cannot self-service overhead allocation review without navigating to the org reports. Month-close overhead work is operationally difficult.",
    "ux_impact": "Users navigating to /overhead via sidebar or link land on the raw expense list with no summary or allocation context. High confusion.",
    "data_integrity_impact": "None.",
    "recommended_fix": "Build an OverheadHubPage that renders: general pool total for the current month, per-project allocation table (project, direct actual basis, weight %, allocated amount), unallocated remainder, and a link to trigger/review month-close allocation. Reuse getOrganizationReportsAnalytics data for the pool and allocation figures.",
    "tests_required": "Page renders pool total, allocation rows, and unallocated remainder. Link to expense list preserved as a secondary action."
  },
  {
    "id": "PRJ-006",
    "domain": "Overhead/Financials",
    "severity": "MEDIUM",
    "current_behavior": "General business cost allocation to projects uses only Direct Actual weight (or equal split when all direct actuals are zero). There is no support for revenue-based allocation, headcount-based allocation, fixed manual allocation, or project-type-based allocation.",
    "expected_business_behavior": "Construction companies commonly allocate overhead by revenue (billing backlog), headcount, or fixed keys (contract percentage). Restricting to a single allocation basis limits the system's applicability for mature organizations.",
    "source_of_truth": "src/modules/financials/domain/general-cost-allocation.ts:33-35 (GeneralAllocationBasisMode)",
    "root_cause": "V1 design decision to implement a single weighted-by-direct-actual method. GeneralAllocationBasisMode type only has 'direct_actual_weight' | 'equal_split' | 'none'.",
    "financial_impact": "Projects with high revenue but low expenses get under-allocated overhead. Projects with high expenses but low billing get over-allocated. Profitability calculations are distorted from a managerial accounting perspective.",
    "ux_impact": "Finance manager cannot configure the allocation basis. No UI exists for this.",
    "data_integrity_impact": "Current allocations are consistent within their method. If method changes, historical allocations (stored in general_cost_month_lines) are not restated.",
    "recommended_fix": "Add allocationBasis setting to org configuration (tenancy). Implement a revenue-weight allocator as the next basis. Migrate GeneralAllocationBasisMode enum. Store the basis used per month in general_cost_months for audit trail.",
    "tests_required": "Unit test: revenue-weight allocator produces correct weights. Historical stored rows are not affected by new basis."
  },
  {
    "id": "PRJ-007",
    "domain": "Project/Financials",
    "severity": "MEDIUM",
    "current_behavior": "The project financials page route (src/app/[locale]/(app)/projects/[projectId]/financials/page.tsx) immediately redirects to /projects/[projectId]?tab=financials. The financials tab on the project workspace embeds ProjectFinancialsPanel. The panel has a loading.tsx but the page itself is a redirect — meaning if a user bookmarks or deeplinks /projects/[id]/financials, they always get redirected.",
    "expected_business_behavior": "Redirect is acceptable only if it preserves the financial context without losing the user's scroll position or tab state. However, the redirect to ?tab=financials may reset to the default project workspace layout. Users who share the financials URL get a temporary redirect that may fail in certain SPA routing scenarios.",
    "source_of_truth": "src/app/[locale]/(app)/projects/[projectId]/financials/page.tsx",
    "root_cause": "The financials moved to a tab; the old route was kept as a redirect for backward compatibility.",
    "financial_impact": "None.",
    "ux_impact": "URL in address bar changes after navigation, breaking bookmarks and shared links.",
    "data_integrity_impact": "None.",
    "recommended_fix": "Keep the redirect as-is but ensure the ?tab=financials query parameter is always included and the project workspace tab system reads it correctly on load. If SSR handles the tab server-side this is low priority.",
    "tests_required": "Navigation test: /projects/[id]/financials redirects to correct tab. Tab is active after redirect."
  },
  {
    "id": "PRJ-008",
    "domain": "Project/Financials",
    "severity": "MEDIUM",
    "current_behavior": "estimatedFinalCost in CostPosition (types.ts:131) is marked @deprecated ('Prefer directForecastFinalCost / fullForecastFinalCost'). However, it is still used as the primary Forecast figure in: (1) variance.ts in the budget module (line 68), (2) the advanced panel in project-financials-panel.tsx (line 292), and (3) referenced in withRecognizedVendorBills and withAllocatedGeneralBusinessCost.",
    "expected_business_behavior": "Deprecated fields should be removed or the deprecation notice should be actioned. Users see 'Estimated Final Cost' in the advanced panel which is silently the Direct Forecast — not the Full Forecast in include_general mode.",
    "source_of_truth": "src/modules/financials/domain/types.ts:131-134, src/modules/budgets/domain/variance.ts:68, src/modules/financials/ui/project-financials-panel.tsx:292",
    "root_cause": "estimatedFinalCost was retained for call-site compatibility when directForecastFinalCost was added. It always equals directForecastFinalCost (set in withCommittedAndApPayable:450). The deprecation was added but migration was not completed.",
    "financial_impact": "Low: functionally equivalent to directForecastFinalCost. Risk is that future code reads estimatedFinalCost as 'the primary forecast' and misapplies it in include_general contexts (see PRJ-001).",
    "ux_impact": "The advanced panel label 'Estimated Final Cost' is ambiguous — it's actually Direct Forecast, not Full Forecast.",
    "data_integrity_impact": "None currently.",
    "recommended_fix": "Complete the migration: (1) Replace all usages of estimatedFinalCost with directForecastFinalCost. (2) Update the advanced panel label to 'Direct Forecast Final Cost'. (3) Remove the deprecated field once all usages are gone. (4) Fix PRJ-001 as part of this migration.",
    "tests_required": "Grep for estimatedFinalCost usages — all should be replaced. Advanced panel shows 'Direct Forecast Final Cost' label."
  },
  {
    "id": "PRJ-009",
    "domain": "Subcontractors",
    "severity": "MEDIUM",
    "current_behavior": "The subcontracts list page (src/app/[locale]/(app)/subcontracts/page.tsx) links each row to /vendors/[vendorId] — the vendor's profile page — rather than to the subcontract agreement detail. There is no dedicated subcontract agreement detail page (drilldown from the list goes to the vendor, not the specific agreement).",
    "expected_business_behavior": "Clicking a subcontract row should open the subcontract agreement detail, showing value events, AP bill history, cash position, retention, document links, and remaining commitment. Currently only the vendor 360 page is accessible from the list.",
    "source_of_truth": "src/app/[locale]/(app)/subcontracts/page.tsx:109, src/modules/vendors/domain/subcontract-types.ts (SubcontractDetail type exists but no dedicated page)",
    "root_cause": "A dedicated /subcontracts/[id] or /vendors/[id]/subcontracts/[id] page was not built. The list links to the vendor page as a workaround.",
    "financial_impact": "None on correctness. Users cannot quickly access subcontract-level commitment, value events, or document flags from the org-level subcontracts list.",
    "ux_impact": "High friction: user must navigate to vendor page, find the specific subcontract among all projects, then open detail. No direct URL for a specific subcontract agreement.",
    "data_integrity_impact": "None.",
    "recommended_fix": "Build a /subcontracts/[subcontractId] page or /vendors/[vendorId]/agreements/[agreementId] page that renders SubcontractDetail including: value events timeline, AP bill rows, cash position, retention, document checklist, remaining commitment calculation.",
    "tests_required": "Page renders subcontract detail. Remaining commitment matches formula from subcontract-commitment domain."
  },
  {
    "id": "PRJ-010",
    "domain": "Financials/Subcontractors",
    "severity": "MEDIUM",
    "current_behavior": "In sumSubcontractRemainingCommitment (src/modules/vendors/domain/subcontract-commitment.ts:82-120), the open PO committed amount is subtracted from subcontract remaining per vendor to avoid double-counting. However, if a vendor has multiple active subcontracts on the same project AND also has open POs for a different scope on that project, the PO amount is subtracted from the combined subcontract remaining — potentially under-reporting commitment.",
    "expected_business_behavior": "Open PO commitment should only offset subcontract remaining when the PO is specifically for the same subcontract scope. POs for different scope (e.g., materials purchased from the same vendor) should not reduce the subcontract commitment.",
    "source_of_truth": "src/modules/vendors/domain/subcontract-commitment.ts:82-120, src/modules/financials/data/subcontract-commitment.repository.ts:213-250",
    "root_cause": "The deduplication is done at vendor+project level, not at agreement level. There is no PO-to-agreement link in the schema.",
    "financial_impact": "Commitment (and thus Forecast Final Cost) is understated when a vendor has both an active subcontract and open POs for separate scope on the same project. Real remaining commitment is hidden from users.",
    "ux_impact": "Forecast Final Cost appears lower than it actually is, giving misleading comfort to project managers.",
    "data_integrity_impact": "Commitment figure in cost.committedOpen is understated in this specific multi-agreement scenario.",
    "recommended_fix": "Add optional purchaseOrderId linkage to subcontract_agreements. When the link exists, only offset PO amounts that are linked to a specific agreement. Unlinked POs use the current vendor-level netting as fallback. Alternatively, expose the netting assumption in the UI with a disclosure note.",
    "tests_required": "Unit test: vendor with subcontract + unrelated PO reports both amounts without offsetting. Vendor with PO linked to subcontract reduces remaining correctly."
  },
  {
    "id": "PRJ-011",
    "domain": "Budget/Financials",
    "severity": "LOW",
    "current_behavior": "The budget module enforces one active budget per project in application code (manage-budget.ts:93-103: throws DomainRuleError if active budget exists). However, there is no database-level unique partial index to enforce this invariant. The SCHEMA_REQUEST.md notes this as an optional follow-up.",
    "expected_business_behavior": "A database unique constraint should back the application-layer rule to prevent race conditions or manual DB edits from creating two active budgets for the same project.",
    "source_of_truth": "src/modules/budgets/application/manage-budget.ts:93-103, src/modules/budgets/SCHEMA_REQUEST.md:6-9",
    "root_cause": "The unique partial index was not created in the initial schema migration.",
    "financial_impact": "In a race condition (two concurrent create-budget requests), two active budgets could be inserted. Budget panel would show undefined behavior (which budget 'wins').",
    "ux_impact": "Low risk in practice (concurrent budget creation is rare). But the absence of a DB constraint means manual DB intervention could silently corrupt state.",
    "data_integrity_impact": "Two active budgets for one project would cause the budget panel to display the wrong budget total.",
    "recommended_fix": "Create migration: CREATE UNIQUE INDEX project_budgets_one_active_per_project ON project_budgets (organization_id, project_id) WHERE status = 'active' AND archived_at IS NULL;",
    "tests_required": "DB constraint test: inserting a second active budget for the same project fails at the DB level."
  },
  {
    "id": "PRJ-012",
    "domain": "Financials/Profitability",
    "severity": "LOW",
    "current_behavior": "In compose-project-financials.ts:275-278, excludeCommittedFromActualCost() is called but its return value is not used (the call is void). Looking at the procurement module's excludeCommittedFromActualCost, it appears to be a validation assertion rather than a transformation. However, the call signature and void return suggest this may be a guard that silently no-ops.",
    "expected_business_behavior": "Any assertion that committed cost is not accidentally merged into actual cost should throw clearly if violated, not return void silently.",
    "source_of_truth": "src/modules/financials/application/compose-project-financials.ts:273-278",
    "root_cause": "The function is called for its side-effect (assertion) but its return is discarded, which is fragile and unclear.",
    "financial_impact": "If the assertion is a no-op, the committed-not-actual invariant has no runtime enforcement beyond code convention.",
    "ux_impact": "None visible.",
    "data_integrity_impact": "Low risk: the composing logic separately uses committedOpen only in forecast, never in actual.",
    "recommended_fix": "Either (1) rename excludeCommittedFromActualCost to assertCommittedNotInActual and document it as a throw-or-noop guard, or (2) remove the call if it is a no-op and rely on test coverage instead. Add a unit test that explicitly verifies committed amounts never enter actualCostToDate.",
    "tests_required": "Unit test: composing financials with a committed amount does not increase actualCostToDate."
  }
]
```

---

## SUMMARY MATRIX

| ID | Domain | Severity | Impact Area |
|----|--------|----------|-------------|
| PRJ-001 | Budget/Profitability | HIGH | Budget variance wrong in include_general mode |
| PRJ-002 | Budget/Actual | HIGH | Discipline/cost-code budget lines show no Actual |
| PRJ-003 | Subcontractors | HIGH | No advance payment tracking |
| PRJ-004 | Budget | MEDIUM | No budget overrun alerting |
| PRJ-005 | Overhead | MEDIUM | /overhead page is just a redirect with no hub |
| PRJ-006 | Overhead | MEDIUM | Only one allocation basis method supported |
| PRJ-007 | Financials | MEDIUM | Project financials deeplink is a redirect |
| PRJ-008 | Financials | MEDIUM | Deprecated estimatedFinalCost still used |
| PRJ-009 | Subcontractors | MEDIUM | No subcontract detail page (list links to vendor) |
| PRJ-010 | Subcontractors/Financials | MEDIUM | PO/subcontract netting can understate commitment |
| PRJ-011 | Budget | LOW | Missing DB unique index for one-active-budget rule |
| PRJ-012 | Financials | LOW | excludeCommittedFromActualCost return value unused |

---

## ARCHITECTURAL STRENGTHS (Reference)

### CostPosition separation (types.ts)
- `actualCostToDate` = Direct Actual (never includes committed or allocated general)
- `directActualCostToDate` = same as above, explicit alias for weight/profit basis
- `fullActualCostToDate` = Direct + allocated general business cost
- `committedOpen` = open/partially-consumed PO + subcontract remaining (never added to actual)
- `openApPayable` = cash obligation disclosure (recognized bill outstanding cash, not Actual)
- `directForecastFinalCost` = Direct + committedOpen + ETC
- `fullForecastFinalCost` = Full + committedOpen + ETC + futureGeneralAllocatedForecast
- `monthCloseCostNet` = closed-month economic corrections (folded into actual once, not double-counted)

### Subcontract Commitment Formula
```
remaining(agreement) = max(0, currentAmount − recognizedAPActual)
netRemaining(vendor) = Σremaining(agreements for vendor) − min(openPO, Σremaining)
totalCommitment = ΣnetRemaining(all vendors)
```

### Overhead Allocation Formula
```
weight(project) = max(0, directActual(project))
allocationShare(project) = weight / Σweight (or equal split when all zero)
allocated(project) = pool × allocationShare(project)
[cent conservation: Σallocated + unallocatable = pool exactly]
```

### Profitability Modes
- `direct`: profit = CCV − directActual; forecast profit = CCV − directForecast
- `include_general`: profit = CCV − fullActual; forecast profit = CCV − fullForecast
- `both`: shows direct and after-general separately; primary = direct

---

*Report written to `docs/audits/financials-subcontractors-budgets-profitability-audit.md`*
