# 15 Owner business flows — verification map (2026-10-09)

**Authoritative expand:** [15 business flow map](01c21234-fe79-4e06-98da-8ba94b66c6f1) (subagent deliverable; this file restored after accidental delete).

**Wave 2 integration batch:** `_verification-business-flows-integration-2026-10-09.log` (**56/56**), unit `_verification-business-flows-unit-2026-10-09.log` (**20/20**).

| # | Flow | Doc status | Primary evidence |
|---|------|------------|------------------|
| 1 | CRM → quote → project → contract | **PARTIAL** / integration **A** | `opportunity-quote-conversion-flow.test.ts` 4/4 |
| 2 | Approved change → contract value | **PARTIAL** / integration **A** | `dg-subcontract/subcontract-core.test.ts` |
| 3 | Pending change → no financial effect | **PARTIAL** | subcontract pending change tests |
| 4 | Billing → SUMIT mock → payment → profit | **PARTIAL** | `billing/integrity.test.ts` 3/3; E2E money-chain **blocked** |
| 5 | Attendance → approval | **VERIFIED WORKING** | `timesheet-approval.test.ts` 4/4 |
| 6 | Hours → allocation → labor → profit | **PARTIAL** | PRE-0021 + timesheet; UI **E** |
| 7–8 | Employer cost actual / retro | **VERIFIED WORKING** | `employee-actual-employer-cost.test.ts` 6/6 |
| 9 | Retro / multi-date attendance | **PARTIAL** | atomicity not in batch; WF-002 static **CONFIRMED** |
| 10–11 | PO / AP / expense / payment | **PARTIAL** | unit committed-cost 8/8; PRE-0021 |
| 12–13 | Contractor grant → task → claim | **VERIFIED WORKING** | `contractor-tasks.test.ts` 7/7; `claims.test.ts` 4/4 |
| 14–15 | Progress → dashboard/reports | **NOT VERIFIED (browser)** | PRE-0021; `/reports` overflow **B** |

**E2E:** **0/15** full browser chains (FINAL §23). **Appendix commands:** see subagent [15 business flow map](01c21234-fe79-4e06-98da-8ba94b66c6f1).
