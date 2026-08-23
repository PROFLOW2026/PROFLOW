# PROJECTFLOW — FULL SYSTEM REMAP / END-TO-END BUSINESS FLOW AUDIT

**Status:** COMPLETE (inspect-only)  
**Authority:** Current code, routes, schema, and UI — **not** old completion/release reports  
**Date of remap:** 2026-08-23  
**Fixes / migrations / commits / SQL / deploy:** NONE  
**Sub-agents used:** 8 (domain-parallel Auto agents) + Lead cross-check  

---

## A. Executive Summary

ProjectFlow **has a real project-centric financial spine**: one compose engine (`composeProjectFinancials`) that separates Commercial ≠ Billing ≠ Paid ≠ Actual ≠ Commitment ≠ Forecast, and one work entity (`projects.work_kind` = project | job | work_order).

What is **not** true today: a new business owner is **not** reliably led, in one continuous path, from Client → Contract → all costs → Billing → Collection → trustworthy Profitability. Modules often work in isolation; handoffs are missing; Project Overview can show **incomplete Actual**; Expense + AP can double-count; subcontract agreements do **not** feed Forecast commitments; Workforce/Attendance weigh heavily in chrome relative to the product’s stated center (Project Profitability).

**Plain verdict:** The math engine is largely coherent. The **product flow** around it is **PARTIAL** — technically capable, operationally fragmented.

---

## B. האם מטרת המוצר נשמרה

### PARTIAL

| Product intent | Reality today |
|----------------|---------------|
| Project is the center | **Yes in data model & financial engine**; **Partial in UX** (workforce/nav sprawl, orphan hubs, thin post-create coaching) |
| See agreed / changes / current contract | **Yes** (CCV from `contract_value_events`) |
| See billed / collected | **Yes on Financials tab**; **No together on Overview** |
| See all costs (labor, vendor, sub, materials, expenses) | **Engine can**; Overview/snapshot **understates**; materials only via PO/AP/Expense (not stock) |
| See open commitments | **PO only** in engine; **subcontract remaining unbilled missing** from Forecast |
| Trustworthy profitability | **Conditional** — false zeros, permission-empty slices, dual Expense+Bill, incomplete overview |

---

## C. Core Flow Verdict

| Stage | Verdict | Notes |
|-------|---------|-------|
| Client → Project | **PARTIAL** | Wired; create allows name-only empty shell; billing contact role unused |
| Project → Contract | **PARTIAL** | Optional on create; CCV SoT solid when present; no contract → classic project can show fake loss (−Actual) |
| Project → Labor Cost | **PASS** (engine) / **PARTIAL** (UX) | Approved time (+ monthly alloc) → Actual; Attendance sync can mislead |
| Project → Vendor Cost | **PARTIAL** | AP + Expense paths; double Actual if unmatched |
| Project → Subcontractor Cost | **PARTIAL** | Roster + cash on card; Actual via AP/Expense; commitment not in Forecast |
| Project → Material Cost | **PARTIAL** | Via PO→AP or Expense only; inventory/usage ≠ cost |
| Project → Expenses | **PASS** (engine) | Finalize → NET Actual; void/reversal exist |
| Project → Billing | **PASS** (engine) | Billing records; plan + BOQ progress feed same AR |
| Billing → Payment | **PASS** | Payment ≠ billing; retention = cash timing |
| All Costs → Project Actual | **PARTIAL** | Compose correct when slices loaded; Overview omits labor/AP/commit; dual entry risk |
| Project Financials → Profitability | **PARTIAL** | Formulas coherent; trust eroded by false zeros / incompleteness / overview gap |

**Core chain answer to §7:**  
> If a new owner signs up today and runs Client → Project → Contract → people/subs/vendors/procurement/expenses → work → bill → collect — does ProjectFlow lead them naturally, once, reliably to true profitability?  
**NO — not end-to-end as a guided product.** The system **can** represent the economics if the owner already knows which screens and which rules to use. It does **not** consistently teach or enforce that path.

---

## D. Full Route Map

**Total unique `page.tsx` routes under `src/app/[locale]`: 162**

| Bucket | Count (approx) | Notes |
|--------|----------------:|-------|
| Auth | 5 | sign-in/up, password, invite |
| Onboarding / setup | 2 | `/onboarding`, `/setup` |
| Portal (OFF → `notFound`) | 3 | confirmed dead to users |
| Redirects | 2 | `/inbox`→Today, `/integrations`→settings |
| Work (projects/jobs) | 9 | core entity |
| Service | 7 | WO / dispatch / recurring |
| Commercial / CRM / changes | 25 | includes orphan `/sales` |
| Money | 16 | expenses, billing, reports, cash-flow, month-close |
| Purchasing | 19 | vendors, PO, AP, materials, RFQ |
| Workforce | 10 | employees, time, attendance, timesheets |
| Field / schedule / safety / forms | 20 | |
| Docs / assets / compliance | 14 | OCR review weak nav |
| Settings + advanced | 27 | portal/OCR settings hidden |

**Nav:** ~45 top-level `NAV_ITEMS` + Settings; composed by permissions × modules × workMix × persona × role.

**Orphans / weak discoverability:** `/sales`, `/notifications` (bell only), `/procurement/rfqs*`, `/procurement/ap/credits*`, `/documents/ocr-review*`, `/settings/portal` & `/settings/ocr` (hidden), portal routes (intentional OFF).

Full path inventory is enumerated in agent extract (routes audit); representative list lives in `src/app/[locale]/(app)/**/page.tsx`.

---

## E. Full Domain Map

| Domain | Module(s) | Project link | Money effect | UX maturity |
|--------|-----------|--------------|--------------|-------------|
| Tenancy / profiles | `tenancy` | org-wide | config | Strong |
| Clients / contacts | `clients` | FK on project | none | Strong |
| Projects / jobs / WO | `projects`, `service` | hub | ETC field | Strong structure |
| Commercial / contracts / changes | `commercial`, contracts schema | strong | CCV / pending | Strong engine; handoff gaps |
| Quotes (product) | `quotes` / estimates | convert → project | seeds contract | Connected |
| CRM | `crm` | pre-project | none until product quote | Partial / dual |
| Financials engine | `financials` | compose | SoT P&L | Strong math |
| Billing / payments | `billing` | strong | AR / cash in | Strong |
| Billing plan | `billing-plan` | strong | → billing_records | Strong; vs BOQ asym guard |
| BOQ | `boq` | strong | progress → AR | Parallel commercial spine |
| Budgets | `budgets` | strong | control only | Clear vs Actual |
| Expenses | `expenses` | strong | Actual | Strong |
| Vendors / engagements | `vendors` | roster | engagement ≠ cost | Partial |
| Subcontracts | `vendors` + platform-ops | strong | cash + commercial; Actual via AP | Partial Forecast |
| AP / credits / payments | `ap` | strong | Actual + cash | Strong; dual-entry risk |
| Procurement / RFQ / PO | `procurement` | optional project | Commitment→Actual | Strong PO path |
| Materials catalog | `procurement` | via PO lines | via AP/Expense | Catalog only |
| Inventory / assets | `assets`, field-ops | ops attribution | **none** | Ops-only |
| Workforce / time / attendance | `workforce` | assignment + time | labor Actual | Connected; UX heavy |
| Planning / Gantt | `planning` | schedule | **none** | Non-financial |
| Retention | `retention` | via AR/AP | cash timing | Complete semantics |
| Month close | `month-close` | adjustments | cost/revenue fold | Complete model |
| OCR | `ocr` | drafts | none until finalize | Env-gated |
| Offline / PWA | `offline` | candidates | no finalize offline | Partial |
| Portal | `portal` | foundation | OFF | Intentionally off |
| Reports / search / docs | various | mixed | read | Broad |
| Approvals | `approvals` + domain parallels | mixed | gates | Fragmented UX |
| Forms / field-ops / safety / warranty / closeout | various | project-scoped (mostly) | none / ops | Partial |
| API / webhooks / banking / integrations | foundation | tiny surface | assist | Infrastructure-heavy |

---

## F. Full Entity Map

See schema remap (authoritative tables in `drizzle/schema/*`). Condensed ownership graph:

```
Organization
  ├─ Client → Contact
  ├─ Vendor → Engagement (ops) / Subcontract agreement (commercial)
  ├─ Employee → Rate versions → Assignments / Time / Attendance / Month costs
  └─ Project (job | work_order)
       ├─ Contract → contract_value_events (CCV SoT)
       ├─ Change requests → Change orders → CVE
       ├─ BOQ → progress → billing_records (AR)
       ├─ Billing plan → cycles → billing_records
       ├─ Budget (control)
       ├─ Expenses (+ allocations) → Actual
       ├─ PO → committed_costs → AP bill → Actual (+ consume commit)
       ├─ AP credits/payments (cash / −Actual when applied)
       ├─ Time entries / monthly labor → labor Actual
       ├─ Billing records → payments (cash in)
       ├─ Documents / field-ops / planning (non-cost or AR bridges)
       └─ expected_remaining_cost (ETC → Forecast only)
```

**Source-of-truth highlights**

| Fact | SoT |
|------|-----|
| Current Contract Value | Sum of `contract_value_events` |
| Actual Cost | Finalized expense NET (− bill-linked) + labor + recognized AP NET + month-close cost |
| Commitment (engine) | `committed_costs` open/partial (issued PO) |
| Invoiced | Finalized `billing_records` |
| Collected | Recorded `payments` (+ applications) |
| Subcontract agreed | `subcontract_value_events` (not engine commitment) |
| Material stock | Inventory qty — **not** Actual |

---

## G. Full Financial Flow Map

### Into Actual
1. Finalized expenses (direct + allocations), NET  
2. Workforce labor (approved time snapshots **or** applied monthly allocation — mutually displacing)  
3. Recognized AP bills (`open` / `partially_matched` / `matched`), NET, project attribution  
4. Dedup: exclude expenses linked via accepted `ap_po_matches.expenseId`  
5. Month-close economic cost adjustments (once)

### Into Commitment / Forecast only
6. Open/partial `committed_costs` (PO)  
7. Project `expected_remaining_cost` (ETC)

### Cash only (not Actual)
8. Customer payments / AP payments  
9. Retention held / release (timing)  
10. Open AP payable disclosure

### Commercial / AR
11. Contracts + CVE (+ pending CR disclosure)  
12. Billing records (manual, billing-plan, BOQ progress)  
13. Month-close revenue adjustments

### Explicit non-sources
PO receipts, inventory movements, material/equipment usage, attendance presence, assignments/engagements, BOQ quantities until billed, budgets, drafts, vendor payments, RFQ/quotes.

### Forecast Final Cost
`Actual + remaining PO commitments + ETC`  
**Not** open AP payable. **Not** subcontract remaining unbilled.

---

## H. Full Project Profitability Map

Implemented in `src/modules/financials/domain/profit.ts` + `cost-aggregation.ts` + `compose-project-financials.ts`.

| Metric | Formula |
|--------|---------|
| **Revenue basis** | `currentContractValue` (CVE sum, same currency) |
| **Actual Cost** | expenses NET (deduped) + labor + recognized AP NET + month-close cost |
| **Commitments (engine)** | open/partial `committed_costs` |
| **Forecast Final Cost** | Actual + commitments + ETC |
| **Actual Profit** | Current Contract − Actual Cost |
| **Forecast Profit** | Current Contract − Forecast Final Cost |
| **Margin %** | profit / Current Contract × 100; **null if contract = 0** |
| **Collected** | recorded payments (separate from profit) |
| **Unbilled backlog** | Current Contract − invoiced (null if invoiced > contract) |
| **Open AP** | cash obligation disclosure only |

**Profit is null when:** no `project_profit.read`, commercial hidden, or `priceNotSet` (open-price job/WO without managed contract).

**Classic project with no contract:** compose can still compute profit as **−Actual** (fake loss) — jobs are gated; classic projects are not. **HIGH.**

---

## I. Full User Journey Findings

### Journey A — Project contractor
Client → Project → Contract → Employees → Sub → Vendor → Expenses → Change → Billing → Payment → Profitability  
**PARTIAL.** Contract optional; CO does not prompt billing; Overview understates cost; sub commitment not in Forecast; Expense+AP double risk; Financials tab can show truth if used correctly.

### Journey B — Electrician
Job/project → labor → materials → supplier → expense → extra work → billing → profit  
**PARTIAL.** Labor path solid; materials via Expense/PO not stock; Quick Create/job bias helps; Attendance can distract.

### Journey C — Small works
Fast job → work → expense → bill → close  
**PARTIAL.** Profile thins profit chrome; Simple mode still leaves permission-only ERP chrome; empty-shell create still possible.

### Journey D — Service & maintenance
Service job → employee → material → expense → customer billing  
**PARTIAL.** WO billing → AR works; open/recurring WOs often `priceNotSet` → costs without claimed margin; dual recurring systems.

### Journey E — Consultant / architect
Client → Project → agreement → hours → milestone billing → collection → profit  
**PARTIAL.** Time emphasized in persona; billing plan/milestones exist; overview/false-zero issues remain; CRM quotes don’t convert alone.

### Fresh organization
Signup → onboarding (12/20 profiles) → dashboard empty CTA → first project  
**PARTIAL.** Empty dashboard CTAs are good; no guided first loop Contract→Expense→Bill→Profit; Simple ≠ simple chrome.

---

## J. Disconnected Modules

| Module | Works alone? | Connected to Project Financial Truth? |
|--------|--------------|----------------------------------------|
| Attendance | Yes | Presence only; sync can create time (indirect) |
| Vendor engagement | Yes | Roster ≠ cost |
| Subcontract agreement | Yes | Cash + commercial; **not** Forecast commitment |
| Inventory / material usage | Yes | **Never** Actual |
| Planning / Gantt | Yes | **No** money |
| CRM sales quotes | Yes | Must detour to product `/quotes` |
| `/sales` hub | Yes | **No nav** |
| OCR | When env live | Draft only until finalize |
| Portal | Foundation | Public OFF |
| Budget cost-code committed | Yes | Can disagree with engine remaining commitment |
| Overview financial snapshot | Yes | **Incomplete compose slices** |
| BOQ progress | Yes | AR when billed; not Actual |
| Service recurrence | Yes | Open price; no auto profit basis |

---

## K. Duplicate Inputs / Duplicate Truth Sources

| Fact | Multiple inputs? | Canonical? |
|------|------------------|------------|
| Client party | Client form + project inline create | Prefer full client form |
| Contact | Client vs project quick-add | Project primary vs client-wide primary distinguished |
| Contract value | Create + later contracts panel | CVE events |
| Cost of same purchase | Expense **and** AP bill | Dedup only if matched |
| Labor cost | Time snapshots **or** monthly allocation | Displacement rule |
| Quotes | CRM sales quotes vs product quotes | Product `/quotes` for convert |
| Billing from measure | Billing plan vs BOQ progress | Same AR; asymmetric anti-dup |
| Commitment display | Financials `committedOpen` vs budget cost-code PO totals | Engine = remaining `committed_costs` |
| “Simple” | Org complexity vs project profile simple | Two vocabularies |
| Vendor on project | Engagement vs subcontract vs AP docs | Different layers |

**One business fact — one input:** **PARTIAL / often violated** for cost capture (Expense vs Bill) and quotes (CRM vs product).

---

## L. UX Flow Problems

1. Project create (name-only) → active empty shell, no coach for contract/team/costs.  
2. CO approve → CCV up, **no** next action to bill.  
3. Overview looks like P&L but **omits** labor/AP/commitment/vendor bills.  
4. Workforce = 4 nav items; Attendance in Quick Create; competes with Project center.  
5. Simple mode hides modules but not permission-only ERP destinations.  
6. Quick Create “maintenance” → `/assets/new`; “attendance” → list not create.  
7. Dual quote systems force CRM → `/quotes` detour.  
8. Subcontract card shows cash, not “remaining commitment / Actual”.  
9. No per-vendor Actual rollup on project.  
10. PO receive ≠ inventory stock (ops chain break).  
11. Dense financial forms mobile = desktop-first.  
12. Today can boost attendance/time beside money for service personas.

---

## M. Financial Integrity Problems

1. **HIGH** Expense + recognized Bill without match → double Actual.  
2. **HIGH** Match dedupe all-or-nothing on expense id (partial match under/over).  
3. **HIGH** Overview compose: `laborInput/committed/openAp/recognizedVendor = null` → false understated Actual.  
4. **HIGH** Classic project no contract → profit = −Actual.  
5. **HIGH** Permission-denied expense/AP/workforce slices → silent 0.  
6. **HIGH** Subcontract remaining unbilled not in Forecast Final Cost.  
7. **HIGH** `incompleteness` (drafts/open allocations) not passed into project compose confidence.  
8. **MEDIUM** AR total (often gross) vs contract net → unbilled skew.  
9. **MEDIUM** BOQ↔billing-plan anti-dup one direction only.  
10. **MEDIUM** Empty billing shows 0/0/0 like “nothing owed”.  
11. **MEDIUM** Open AP payable header-`projectId` only vs allocation Actual.  
12. **MEDIUM** Budget cost-code committed ≠ engine remaining.  
13. **MEDIUM** ETC can overlap open PO in Forecast if user double-counts mentally.  
14. **MEDIUM** `vendorActual` KPI: subcontractor-typed expenses vs all bills.  
15. **LOW–MED** `asset_capital` summed into Actual (intent unclear to owners).

---

## N. Permissions / Tenant / Security Problems

| Finding | Severity | Notes |
|---------|----------|-------|
| Visibility ≠ permission | By design | Hidden module ≠ revoke permission; deep links still ACL |
| Warranty org list | **HIGH** | `PROJECTS_READ` lists all org coverages — no project-access filter |
| Soft `.catch(() => [])` | MEDIUM | Auth failures look like empty data |
| Manager default without profit | INFO | Toggleable; intentional split |
| Portal public | PASS (OFF) | Routes 404 |
| Tenant org filters | Generally strong | Sampled paths use `organizationId` |

---

## O. Mobile Problems

- Bottom nav ≤4 + More; FAB Quick Create — structure OK.  
- Core money/AP/billing-plan/WO billing = dense, not mobile-simplified.  
- Field path stronger than manager profitability path.  
- Offline = candidate drafts only; no financial finalize.  
- Attendance/time compete for primary slots on some personas.

---

## P. Hebrew / RTL Problems

- Default `he-IL` / RTL; locale namespaces parity strong.  
- Residual: hardcoded English domain errors; LTR islands for dates/codes (often correct); Gantt/calendar LTR-biased.  
- Technical terms (Actual, Commitment, Allocation) exposed — literacy burden for non-ERP owners.

---

## Q. Hidden / Partial / Orphan Features

| Item | State |
|------|-------|
| External portal | OFF |
| OCR live | Env + credentials gated |
| `/sales` | Orphan hub |
| RFQ / AP credits | Section-nav only |
| OCR review | Weak Documents nav |
| API v1 | health / whoami / projects |
| Webhooks | enqueue without HTTP fan-out |
| Calendar Google/Microsoft | stubs |
| Custom fields | 6 entity types |
| Document template studio | Not full |
| Purchase request stage | Missing |
| Material issue → project cost | Explicitly disabled |
| Statutory invoicing / payroll / full GL | Out of boundary (correct) |

---

## R. Existing Features That Are Actually Complete

Re-verified against current code (not old PASS statements):

1. Single financial compose engine for project + org batch.  
2. Commercial ≠ Billing ≠ Paid ≠ Actual ≠ Commitment ≠ Forecast separations.  
3. CCV from append-only contract value events; CO approve writes events.  
4. Billing ≠ Payment; retention = cash timing.  
5. PO issue → commitment; receive ≠ Actual; posted bill → Actual + consume commitment.  
6. Vendor payment never Actual.  
7. Expense finalize NET → Actual; void/reversal paths.  
8. Labor Actual from approved time / monthly allocation with Mode B/C exclusion.  
9. Assignment / engagement / attendance presence ≠ Actual (domain enforced).  
10. Open-price jobs/WOs do not invent fake margin (`priceNotSet`).  
11. BOQ progress ≠ cost Actual.  
12. Budgets consume engine Actual (control layer).  
13. Planning has no financial side effects.  
14. Portal public hard-OFF.  
15. Offline forbids financial finalize.  
16. Adaptive nav × modules × personas × work mix.  
17. Project/job/WO one entity, one engine.  
18. Product quote convert → project/job/WO with contract seed.  
19. Month-close additive economic corrections.  
20. Hebrew-first shell + RTL layout foundation.

---

## S. Full Findings Register

Format: **ID · Domain · Severity · Type · Current · Expected · Why · Impact · Files · Direction**  
(No implementation in this phase.)

### CRITICAL / HIGH

**R-001 · Project Overview · HIGH · DISCONNECTED**  
Current: Overview `composeProjectFinancials` sets `laborInput/committed/openAp/recognizedVendor = null` (`get-project-overview-payload.ts`).  
Expected: Same Actual/Forecast as Financials tab, or explicit “partial snapshot” labeling.  
Why: Owner believes Home P&L. Financial impact: understated Actual / wrong margin. UX: false confidence.  
Direction: Reuse full `getProjectFinancials` or label incompleteness loudly.

**R-002 · Expenses+AP · HIGH · BROKEN (integrity)**  
Current: Dual Actual unless accepted expense↔bill match.  
Expected: One obligation → one Actual; forced match or single capture path.  
Why: Profitability inflation.  
Files: `compose-project-financials.ts`, `ap/matches.ts`, expense/AP create UX.  
Direction: UX force-link + amount-aware dedupe.

**R-003 · Subcontracts · HIGH · DISCONNECTED**  
Current: Agreement value not in `committedOpen` / Forecast.  
Expected: Remaining unbilled subcontract commitment in Forecast (or explicit ETC prompt).  
Why: Forecast understates exposure.  
Files: `subcontracts`, `committed-costs.repository.ts`, compose.  
Direction: Feed remaining (current − recognized) into commitment layer.

**R-004 · Commercial · HIGH · BAD FLOW**  
Current: Classic project without contract → profit = −Actual.  
Expected: `priceNotSet` / unavailable profit like jobs.  
Files: `compose-project-financials.ts`, `work-pricing.ts`.  
Direction: Gate classic projects with no managed contract.

**R-005 · Financials permissions · HIGH · FALSE ZERO**  
Current: Missing expenses/AP/workforce read → empty slice → 0.  
Expected: Unavailable / partial, not zero.  
Files: `get-project-financials.ts`, KPI UI.  
Direction: Propagate coverage “not loaded” vs “empty”.

**R-006 · Data confidence · HIGH · DISCONNECTED**  
Current: Project compose rarely gets incompleteness (drafts/open allocations).  
Expected: Confidence reflects open drafts/allocations.  
Files: `compose-project-financials.ts`, loaders.  
Direction: Wire incompleteness inputs.

**R-007 · Labor rates · HIGH · FALSE ZERO (partial)**  
Current: Missing employer cost understates Actual; main Actual KPI still numeric.  
Expected: Block or mark Actual unavailable when labor unresolved.  
Files: `project-financials-panel.tsx` (labor local guard only).  
Direction: Extend unavailable gate to total Actual.

**R-008 · Navigation / Workforce · HIGH · BAD FLOW**  
Current: 4 people nav items + QC attendance; module toggle doesn’t hide employees.  
Expected: Project-money-first chrome; People hub.  
Files: `navigation.ts`, `quick-create-actions.ts`.  
Direction: Collapse workforce IA; persona demote attendance for owners.

**R-009 · Experience Simple · HIGH · BAD FLOW**  
Current: Simple filters optional modules only; permission-only destinations remain.  
Expected: Simple ≈ core loop chrome.  
Files: `experience-complexity.ts`, `navigation.ts`.  
Direction: Complexity allowlist for permission-only items.

**R-010 · Project create · HIGH · BAD FLOW**  
Current: Name-only create → empty active project.  
Expected: Post-create coach: contract, team, first cost, billing basis.  
Files: `create-project.ts`, `createProjectAction`, create form.  
Direction: Guided next steps / checklist on overview.

**R-011 · Warranty list · HIGH · BROKEN (access)**  
Current: Org warranty list without project-access filter.  
Expected: Same scoping as other project lists.  
Files: `warranty/application/coverages.ts`.  
Direction: `resolveAccessibleProjectIds`.

**R-012 · CO → Billing · HIGH · DISCONNECTED**  
Current: Approve CO updates CCV only; billing out of scope.  
Expected: Explicit next action to bill / update billing plan.  
Files: `quotes-and-approval.ts`, changes UI.  
Direction: Handoff CTA after approve.

### MEDIUM

**R-013 · Overview metrics · MEDIUM · DISCONNECTED** — Billed/collected absent from overview snapshot.  
**R-014 · Quotes dual · MEDIUM · BAD FLOW** — CRM sales quotes ≠ convert path.  
**R-015 · `/sales` orphan · MEDIUM · DISCONNECTED** — No nav.  
**R-016 · Billing contact role · MEDIUM · DISCONNECTED** — Unused; AR uses client id.  
**R-017 · BOQ↔Plan guard · MEDIUM · DISCONNECTED** — Anti-dup one way.  
**R-018 · AR gross vs net · MEDIUM · BAD FLOW** — Unbilled skew.  
**R-019 · Empty billing zeros · MEDIUM · FALSE ZERO**.  
**R-020 · Open AP vs allocations · MEDIUM · DISCONNECTED**.  
**R-021 · Budget committed view · MEDIUM · DISCONNECTED** — Full PO lines vs remaining.  
**R-022 · QC mislabels · MEDIUM · BAD FLOW** — maintenance/attendance.  
**R-023 · OCR/RFQ discoverability · MEDIUM · DISCONNECTED**.  
**R-024 · Attendance→Time sync · MEDIUM · BAD FLOW** — Teaches Attendance-as-project-OS.  
**R-025 · Planned share % · MEDIUM · BAD FLOW** — Looks like cost weight.  
**R-026 · Profiles vs personas · MEDIUM · DISCONNECTED** — Plumbing/HVAC share `service` persona.  
**R-027 · Onboarding 12/20 profiles · MEDIUM · BAD FLOW**.  
**R-028 · Today attendance boost · MEDIUM · BAD FLOW** — Owners see people noise.  
**R-029 · vendorActual KPI inconsistency · MEDIUM · DISCONNECTED**.  
**R-030 · Service open/recurring profit · MEDIUM · DISCONNECTED** — Costs without revenue basis.  
**R-031 · Dual recurring systems · MEDIUM · DISCONNECTED**.  
**R-032 · PO without project · MEDIUM · DISCONNECTED** — Orphan commitment.  
**R-033 · Receive ≠ inventory · MEDIUM · BAD FLOW** — Ops handoff.  
**R-034 · No per-vendor Actual on project · MEDIUM · BAD FLOW**.  
**R-035 · Mobile financial density · MEDIUM · BAD FLOW**.  
**R-036 · Soft empty catch · MEDIUM · BAD FLOW** — Masks auth errors.  
**R-037 · Asset capital in Actual · MEDIUM · DISCONNECTED** (clarity).  
**R-038 · Documents↔contract owner · MEDIUM · DISCONNECTED**.  
**R-039 · Inline thin clients · MEDIUM · BAD FLOW**.  
**R-040 · Match amount-blind · MEDIUM · BROKEN** (subset of R-002).

### LOW

**R-041 · Dual “simple” vocabulary · LOW · DISCONNECTED**.  
**R-042 · Legacy nav moreGroup tags · LOW · DISCONNECTED**.  
**R-043 · `hasBillingData` dropped · LOW · DISCONNECTED**.  
**R-044 · Mode B literacy · LOW · BAD FLOW**.  
**R-045 · Budget vs Contract naming · LOW · BAD FLOW**.  
**R-046 · Hardcoded English errors · LOW · BAD FLOW**.  
**R-047 · Search gaps (forms/approvals/RFQ) · LOW · DISCONNECTED**.  
**R-048 · Custom fields limited entities · LOW · DISCONNECTED**.  
**R-049 · API/webhooks foundation-only · LOW · DISCONNECTED**.  
**R-050 · No purchase request stage · LOW · BAD FLOW** (by absence).  
**R-051 · CR “void” status naming mismatch · LOW · BAD FLOW** (reverse CO exists).  
**R-052 · createProject ignores schema `clientName` · LOW · DISCONNECTED**.

**Finding counts:** CRITICAL=0 explicit · **HIGH=12** · **MEDIUM=28** · **LOW=12** · **Total register ≈ 52** (plus intentional OFF notes). Severity uses HIGH for integrity/false-zero/access; no separate CRITICAL band used beyond HIGH for this remap (product not production-outage).

---

## T. Recommended Repair Order

*(Order only — do not implement in this phase.)*

1. **Truth surfaces:** Fix Overview compose to full financial slices (or honest partial badge) — R-001/R-013.  
2. **False zeros / confidence:** Permission-empty + incompleteness + labor unresolved — R-005/R-006/R-007.  
3. **Classic no-contract profit gate** — R-004.  
4. **Expense↔AP single Actual** — R-002/R-040 + UX.  
5. **Subcontract → Forecast commitment** — R-003.  
6. **Post-create + CO→bill handoffs** — R-010/R-012.  
7. **Chrome re-centering:** Workforce collapse + Simple realness — R-008/R-009.  
8. **Warranty project-access** — R-011.  
9. **Quote path unify / sales hub** — R-014/R-015.  
10. **BOQ↔billing-plan symmetric guard + AR net/gross clarity** — R-017/R-018.  
11. **Subcontractor explainability + per-vendor Actual** — R-034.  
12. **Ops chains:** receive↔inventory, materials literacy — R-033.  
13. **Mobile money simplification** — R-035.  
14. **Discoverability polish** — OCR/RFQ/QC labels — R-022/R-023.  
15. **Low debt cleanup** — R-041+.

---

## Answers to the 10 questions (§102)

1. **Is Project the true center today?** **PARTIAL.** Engine yes; chrome and some journeys compete (workforce, orphans, empty create).  
2. **Do all project expenses reach Actual?** **PARTIAL.** Finalized yes; drafts no; dual Bill path can double; Overview may hide them.  
3. **Do employee costs reach the project correctly?** **YES (engine)** when rates + approval + project time (or monthly alloc); **PARTIAL** UX/attendance confusion and missing-rate understatement.  
4. **Are subcontractors connected to Commitment/Actual?** **PARTIAL.** Actual via AP/Expense; commercial + cash on card; **not** engine Commitment/Forecast.  
5. **Vendors & procurement to project?** **PARTIAL.** PO→commitment→bill→Actual solid; orphan POs; Expense+Bill risk; inventory not cost.  
6. **Billing and payments separate and correct?** **YES** in engine.  
7. **Is Profitability fully trustworthy?** **NO / PARTIAL.** Math spine yes; surfaces and dual entry / false zeros undermine trust.  
8. **One business fact, one input?** **NO / PARTIAL.** Cost and quotes violate often.  
9. **Simple enough for non-ERP owner?** **NO / PARTIAL.** Profiles help; Simple incomplete; terminology and module count remain heavy.  
10. **What must change to return to original purpose?** Re-center UX on Project Financial Truth: full Overview numbers, guided create→contract→costs→bill→collect, single cost-capture discipline, subcontract in Forecast, collapse workforce chrome, kill false zeros, finish handoffs (CO→bill, CRM→quote). Keep the compose engine — repair the product flow around it.

---

## Lead verification notes

| Claim | Lead check |
|-------|------------|
| Overview omits labor/AP/commit/vendor | **Confirmed** in `get-project-overview-payload.ts` L123–126 |
| Profit = CCV − Actual / Forecast | **Confirmed** `profit.ts` |
| Forecast = Actual + commit + ETC | **Confirmed** `cost-aggregation.ts` |
| Portal OFF | **Confirmed** portal pages `notFound()` + policy |
| Inventory usage ≠ Actual | **Confirmed** `assets/domain/usage.ts` |
| Subcontract not in committed_costs | **Confirmed** financials commit repo reads PO ledger only |
| createProject name-only | **Confirmed** `create-project.ts` |
| Attendance ≠ Actual | **Confirmed** domain; sync can create time entries |

**Existing DB profitability reconciliation:** Not run against Owner production data in this remap (inspect-only; avoid production mutation). Path verification used code + composition tests as evidence.

**Old reports:** Consulted only as existence hints; **never** as authority.

---

## Appendix — Agent coverage

| Agent | Domain |
|-------|--------|
| 1 | Routes / nav / profiles / QC / dashboard / mobile shell |
| 2 | Client / project / contract / changes / quotes / CRM |
| 3 | Financials / profitability / false zeros |
| 4 | Expenses / vendors / AP / credits / payments |
| 5 | Procurement / materials / inventory / subcontractors |
| 6 | Workforce / BOQ / planning / budgets |
| 7 | Service / permissions / OCR / offline / portal / reports |
| 8 | Schema entity / action / financial source maps |

---

*End of MASTER REMAP REPORT.*
