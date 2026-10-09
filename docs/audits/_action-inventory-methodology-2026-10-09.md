# Action-level inventory methodology (2026-10-09)

**Commit:** `89e0b9a90c43cffbec24e726675bf8448587833e`  
**Authoritative closeout:** [PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md](./PROJECTFLOW-FINAL-COMPLETE-VERIFICATION-2026-10-09.md) §23  
**Reconciliation:** [Action inventory methodology](54a9e84a-55d1-4ee9-b6f9-4ba46f56a7c5)

## Measurement steps

| Step | What | How |
|------|------|-----|
| 1 | Page routes | Line count of `_route-inventory-2026-10-09.txt`; cross-check `src/app/**/page.tsx` |
| 2 | Shell nav | Count `key:` in `src/components/shell/navigation.ts` (`NAV_ITEMS`) |
| 3 | Server actions | Glob `**/actions.ts`; count `^export (async )?function` per file (barrels re-export only) |
| 4 | API handlers | Count `route.ts` under `src` (ops **31**; glob **32** paths after deduping duplicate health/exports variants) |
| 5 | Verification cross-ref | [PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md](./PROJECTFLOW-OPERATIONAL-VERIFICATION-2026-10-09.md) §04, §22 |

**Action atom types:** route load (`page.tsx`); nav key (`NAV_ITEMS` — E2E coverage, usually overlaps routes); server action (`export async function` in `actions.ts`); API handler (`route.ts`). Integration test cases are **not** discovered UI actions.

## Measured counts

| Metric | Count | Notes |
|--------|------:|-------|
| Page routes | **387** | Owner `(app)` **246**; employee **95**; contractor **52** (labels overlap) |
| `NAV_ITEMS` keys | **60** | Ops checkpoint used **58** (recount drift) |
| `actions.ts` files | **87** | Owner `(app)` **57**; modules **16** |
| Server actions (`export async function`) | **604** | Owner `(app)` **452** |
| API `route.ts` | **31** | Ops count |

## Denominators (§23 — no single “% ready” without naming numerator)

| Symbol | Meaning | Value |
|--------|---------|------:|
| **D_ui** | Distinct page routes | **387** |
| **D_nav** | Shell nav keys (E2E nav coverage) | **60** |
| **D_api** | HTTP handlers | **31** |
| **D_sa** | Server actions in `actions.ts` | **604** |
| **D_checkpoint** | §22 minimal | **418** = D_ui + D_api |
| **D_total** | Code-backed user-triggerable (recommended) | **1,022** = D_ui + D_api + D_sa |

Do **not** add D_nav into D_total (nav ⊆ routes for most hrefs). Optional shell QA upper bound: D_ui + D_nav + D_api + D_sa ≈ **1,082** — nav E2E ratio only.

## Verification numerators (pair with explicit denominator)

| Ratio | Numerator | Denominator |
|-------|-----------|-------------|
| Browser route coverage | ~5 (+ public shell **9/9**) | **387** |
| Nav E2E coverage | **5** | **60** (55 NOT VERIFIED) |
| Capability / integration anchors | **≥71** | **not** 387 (§22) |
| Executed product broken | **3** | OPS-B-002, OPS-B-003, UI-MOB-001 `/reports` |

**Report rule:** always state two numbers — e.g. **5 / 387** routes browser-verified; **≥71 / 1,022** actions verified at integration/capability depth.

## Sample inventory (DOM-001 … DOM-020)

Status legend: A/B/C/D/E/F per operational verification doc.

| ID | User action | Type | Surface | Domain | Ops status |
|----|-------------|------|---------|--------|------------|
| DOM-001 | Open dashboard | Route + nav | `/` · `dashboard` | Shell | **E** (E2E touched); public shell **A** |
| DOM-002 | Open projects list | Route + nav | `/projects` · `projects` | Projects | **E** |
| DOM-003 | Open expenses list | Route + nav | `/expenses` · `expenses` | Expenses | **E** |
| DOM-004 | Open settings | Route + nav | `/settings` · `settings` | Settings | **E** (profile subpath) |
| DOM-005 | Open reports | Route + nav | `/reports` · `reports` | Reports | **E** / layout **B** @320px |
| DOM-006 | Open today | Nav → route | `/today` · `today` | Operations | **E** (visibility-only) |
| DOM-007 | CRM lead → quote → project | Server + flow | `/crm/...` | CRM | **A** (integration 4/4) |
| DOM-008 | Approve timesheet → labor actual | Server + flow | workforce timesheets | Workforce | **A** (4/4) |
| DOM-009 | BOQ progress billing / AP guards | Server + flow | project financials | Financial | **A** (8/8) |
| DOM-010 | OCR / PO anti-spoof | Server + flow | OCR review | Documents | **A** (16/16) |
| DOM-011 | PRE-0021 cross-module reconcile | Integration | multi-module | Financial core | **A** (23/23 + 15/15) |
| DOM-012 | Create / mutate task (UWM) | Server | `/work` | Work mgmt | **C/E** |
| DOM-013 | Upload / link document | Server | `/documents` | Documents | **A** partial engine; owner evidence UI **E** |
| DOM-014 | Issue PO / AP vendor bill | Server | procurement | Procurement | **A** partial; UI **E** |
| DOM-015 | Record billing / credit note | Server | `/billing` | Billing | **A** integrity; live SUMIT **E** |
| DOM-016 | Generic `labor` expense vs workforce | Classification | `/expenses` | Financial | **F** (WF-001 / FIN2-007) |
| DOM-017 | Public customer/vendor portal | Route | `/portal/*` | Portal | **D** (`notFound()`) |
| DOM-018 | Contractor scoped agreement read | RLS | contractor portal | Security | **A** by design (0168); session-security test **OUTDATED** |
| DOM-019 | Quick-create from shell | Shell | global chrome | Shell | **E** |
| DOM-020 | API health / whoami | API | `/api/v1/...` | Platform | **E** (not browser matrix) |
