# Retroactive business edit — closure report (2026-10-23)

Branch: `feature/retroactive-business-edit`  
Production data / push / deploy: **not performed**.

## Completed by module

| Module | Server | UI (confirm / duplicate / back) |
|--------|--------|----------------------------------|
| Shared | Owner detect, month bypass, `changeAcknowledged`, `assertOwnerRetroactiveBusinessChange`, hooks, dialogs | — |
| Billing | Finalized + draft edit; payment date/amount; **owner void with recorded payments** | Finalized/draft forms, payment panel, void-with-payments |
| Expenses | Finalized edit + similar lookup | Expense edit form |
| AP | Recognized bill + vendor payment date | Bill panel, payment actions |
| Quotes | `editQuoteRetroactive` | `QuoteRetroactiveEditForm` |
| Workforce payroll | Revise paid date/amount | `EmployeePayrollRetroactiveEdit` |
| Workforce time | `correctTimeEntry` + ack | Time entry confirm |
| Employer month costs | Actual + applied notes + ack | Month review + notes edit |
| Subcontracts | Owner retro on closed/cancelled agreements | `AgreementRetroactiveEditForm` |
| **Projects — contracts** | `updateContract` owner + ack on closed/cancelled; audit `correctionKind` | `ProjectContractsClient` edit confirm; **panel wired on project Details tab** |
| **Projects — metadata** | `updateProject` owner + ack on completed/cancelled/archived | Details tab confirm before save |
| **Change orders** | `editChangeOrderRetroactive` incl. **amount** + `amountChangeAcknowledged`, CVE update, billing guard; `reverseChangeOrder` requires ack | Change detail: retro edit (metadata + amount, duplicate + dual confirm); reversal confirm |
| **CRM** | `updateOpportunity` / `updateProspect` owner + ack on terminal records | Closed **opportunity** + **prospect** retro forms with duplicate warning |

## Available in UI (owner)

- **Project → Details:** edit closed/archived project fields with confirm; **Contracts** section lists primary/additional contracts with owner retro edit on closed/cancelled contracts.
- **Changes → approved change request:** owner metadata correction on change order; reversal with confirm dialog.
- **CRM → opportunity (won/lost/cancelled):** owner correction block in Follow-up section (duplicate warning).
- **CRM → prospect (converted/inactive):** owner correction on prospect detail page.
- **Duplicate warning (continue after ack):** contracts, change orders, project details, CRM opportunity/prospect.
- Prior modules: billing, expenses, AP, quotes, workforce, subcontracts (unchanged paths).

## Billing 0011

- Record: `12815257-49ae-408f-a725-1f0977439101`
- Target: issue **2026-01-31**, due **2026-02-28**, payment **2026-03-10**, net **66,020.00**
- **Ready in product:** owner → billing detail → finalized owner edit (issue date) → confirm
- Script: `scripts/repair-billing-0011-issue-date.ts` (dry-run; **no Production execution**)

## i18n

- **he-IL, en, ar, ru:** `changes.retroactiveEdit` (incl. amount + duplicate), `projects.details/contracts.retroactiveEdit`, `crm.retroactiveEdit.duplicate*`, `changes.errors.changeOrderNotEditable`.

## Targeted checks

- `npx tsc --noEmit` — **pass**
- Integration: `change-order-reversal.test.ts` updated for `changeAcknowledged`

## Residual limits

- **Change order amount** — blocked when finalized billing exists for that CO (credit/void billing first).
- **0011 / Production** — mechanism ready; owner applies in UI or approves script; no DB apply in this work.
- **Push / deploy / migrations** — not done; branch has many unrelated modified files in working tree — scope commit carefully before release.
