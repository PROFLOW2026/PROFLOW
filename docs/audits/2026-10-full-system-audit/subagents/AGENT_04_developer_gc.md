# AGENT 04 — Developer / GC / Entrepreneur Projects

**Audit type:** Read-only system audit (no code or schema changes)  
**Repository baseline:** `35e2ff0f7f12d0a3ec94ea0aed23b8c97b6bb00e` (main)  
**Primary references:** `.cursor/plans/developer_gc_subcontractor_management.plan.md`, `docs/implementation/dev-gc-shared-contracts.md`, `docs/implementation/dev-gc-track-briefs.md`  
**Finding ID prefix:** `D04-xxx`

---

## 1. Scope and terminology

| Term in audit brief | Product mapping |
|---|---|
| Entrepreneur / developer | Project **management mode** `developer_gc` (`operating_roles`: developer + general_contractor), often with **ownership** `own_development` (“פיתוח עצמי”) |
| Tenders | Track Q — `contractor_tender_*` via `src/modules/contractor-procurement` |
| BOQ | Existing client/cost BOQ module (`src/modules/boq`), including **subcontractor schedules/valuations** on the BOQ side |
| Contractor agreements | Track E — `subcontract_agreements`, work lines, changes, unpriced work (`src/modules/subcontracts`) |
| Execution | Track S surfaces — `/projects/{id}/execution` hub + satellite routes (coordination, defects, site ops, etc.) |
| Change orders | Subcontract **changes** (`/contractors/{agreementId}/changes`), not client quote change orders |
| Claims | Track F — `src/modules/subcontract-claims` (portal submit → internal certify → payable basis → draft AP) |
| `developer/*` routes | **Connected-project** shell on the **contractor org’s** project (`src/app/.../projects/[projectId]/developer/*`), not the entrepreneur’s GC execution workspace |

---

## 2. End-to-end scenario trace

### 2.1 Entrepreneur project birth

1. **Create project** — Owner selects management mode `developer_gc`; delivery profile defaults to `own_development` when mode is developer/GC (`src/modules/project-profile/application/create-section.ts`, `management-mode-actions.ts`).
2. **Mode gate** — `resolveManagementMode()` requires **both** `developer` and `general_contractor` roles; a single role stays `standard_project` (`src/modules/project-profile/domain/management-mode.ts`).
3. **Execution chrome** — When profile is `developer_gc`, layout loads execution nav via `loadProjectExecutionNav` and shows `DeveloperGcExecutionEntry` / `ProjectExecutionNav` (`projects/[projectId]/layout.tsx`, `requireDeveloperGcExecutionPage` on execution screens).

**Assessment:** Profile and navigation gating for “entrepreneur runs a job with subcontractors” are implemented and tested at unit level (`tests/unit/project-workspace/execution-nav.test.ts`, `tests/integration/audit-verification/sec-004-execution-nav-gate.test.ts`).

### 2.2 Optional commercial / cost setup (parallel tracks)

| Step | Route / module | Notes |
|---|---|---|
| Project structure & locations | `/structure` — Track D (`project-profile`, `dg-project-profile`) | Supports work-package / location hierarchy used by subcontract lines |
| BOQ | Project tab `?tab=boq` — `src/modules/boq` | **Separate** from DG claims; shared contracts explicitly: claims reference **work lines**, not BOQ nodes (`dev-gc-shared-contracts.md` §5) |
| Budget / cost control | `/cost-control` — Track S | Trade rollup; financial columns capability-gated per plan notes |

**Assessment:** BOQ and DG subcontract execution coexist on the same project without an automated bridge from BOQ nodes → tender packages → work lines.

### 2.3 Tender → subcontract (Track Q → E)

**Backend (complete for core path):**

```
createTenderPackage → inviteVendorToTender → [portal] submitContractorBid
  → awardTenderToSubcontract → createDraftAgreement (draft) + link awardedAgreementId
```

Evidence: `src/modules/contractor-procurement/application/tenders.ts`; integration `tests/integration/dg-procurement/tenders.test.ts` (bidder isolation, award creates **draft** agreement).

**Owner UI (incomplete):**

- List: `projects/.../tenders/screen.tsx` — read-only package list.
- Detail: `tenders/[packageId]/screen.tsx` — read-only offers; amounts only if `contract.financial.view`.
- **No** server actions or forms in app routes for create / invite / award (grep: use-cases only referenced from tests and module index).
- Copy promises creation (`awards.empty.description`: “Create a package…”) but empty state has no action.

**Portal UI (bid side):** `contractor/.../tenders/[packageId]` + `ContractorBidForm` + `submitContractorBid` — functional.

**Post-award contract hardening (manual):**

- Award does **not** copy `bidAmount` into agreement `originalAmount` or work lines (`createDraftAgreement` in award path; test expects `status: draft` only).
- Operator must use **Contractors** list (`/contractors?new=1`, `CreateAgreementForm`) or agreement workspace to add lines, financial terms, and **activate** (baseline lock + value event).

### 2.4 Execution phase

Entrepreneur team uses **execution workspace** routes from `EXECUTION_ROUTE_CATALOG` (`src/modules/project-workspace/domain/execution-route-catalog.ts`):

- Dashboard: `/execution` — metrics + contractor shortcuts (`execution/screen.tsx`).
- Field / quality / coordination: `coordination`, `rfi`, `submittals`, `inspections`, `defects`, `site-log`, `instructions`, etc.
- Commercial execution: `contractors`, `tenders`, `claims`, `unpriced-work`, `deductions`, `cost-control`.
- Employee app: thin wrappers under `employee/(shell)/projects/[projectId]/...` for the same segments (per shared contracts §2.1).

**Assessment:** Route catalog and pages align with track brief §2; schedule hub links to `?tab=schedule` on main project shell.

### 2.5 Change orders

Flow implemented in Track E with domain rules, portal proposals, approval, value events:

- Internal: `/contractors/{agreementId}/changes`
- Portal: `/contractor/projects/{projectId}/contracts/{agreementId}/changes`
- Integration coverage: `tests/integration/dg-subcontract/subcontract-core.test.ts` (changes, unpriced work, instruction-origin changes).

**Assessment:** Change-order semantics match spec (approved value events, revised lines); independent of client billing change module.

### 2.6 Claims → certification → AP (Track F)

**Happy path (integration-tested):**

1. Active agreement with priced work lines (`addWorkLine`, `changeAgreementStatus(activate)`).
2. `createClaim` → `saveClaimDraft` → `submitClaim` (owner or portal).
3. QS certifies / reassesses — append-only assessments (`certifyClaim`, `reassessClaim`).
4. Payable basis computed; draft AP via AP module (`review.ts` / `payables.ts` — certification ≠ payment).
5. Financial separation: operational PM / site manager see no claim amounts (`dg-claims/claims.test.ts`).

**Portal:** `/contractor/projects/{projectId}/claims` — create/list/detail; E2E smoke hits owner claim create + portal claims list (`tests/e2e/harness/dg-auth-smoke.mjs`).

**Assessment:** Core claims lifecycle is the strongest vertical slice in this domain; not wired from tender award automatically.

### 2.7 `developer/*` routes (connected projects)

Separate product thread: contractor org project linked to developer org engagement.

- Layout: `projects/[projectId]/developer/layout.tsx` — requires connected mapping + external grant; tabs: **tasks, rfi, plans, documents** only (`developer-workflows.ts`).
- Hub redirects to first visible tab; **no** claims/tenders/contracts under `developer/*`.
- Deep link helper `portalDeveloperProjectHref` points to full guest portal on developer `projectId`.

**Assessment:** Naming `developer/*` is easy to confuse with entrepreneur `developer_gc` mode; functionally it is a **limited embedded portal** for connected subcontractors.

---

## 3. Schema and plan alignment

| Plan wave (`.cursor/plans/...`) | Repo signal |
|---|---|
| W0 shared contracts | `docs/implementation/dev-gc-shared-contracts.md` present |
| W1 project capabilities | Module `project-team`; migrations `0154`/`0155` + foundation tests |
| W1b financial projection | `0168_dg_financial_projection_rls.sql`; `tests/integration/dg-financial-projection/` |
| W2–W11 domain tracks | Journal entries `0156`–`0170` present in `drizzle/migrations/meta/_journal.json` |
| W12 i18n / matrix / E2E | i18n: `dg-locale-parity` unit tests; matrix spread across integration tests; **no** single Playwright tender→claim journey |
| W13 consolidation | Applied migrations in repo; no `drizzle/migrations-wip/` remainder |

**Plan file drift:** Plan front-matter still marks `w1-project-capabilities` **in_progress** and several waves **pending**, while journal and integration suites indicate DG migrations **0155–0170** are already in the canonical migration chain. Treat the plan narrative as historical execution log, not live completion status.

---

## 4. Test and verification coverage (targeted)

| Area | Representative tests | Gap |
|---|---|---|
| Tenders | `tests/integration/dg-procurement/tenders.test.ts` | No UI/action tests for owner tender management |
| Subcontracts + changes | `tests/integration/dg-subcontract/subcontract-core.test.ts` | — |
| Claims | `tests/integration/dg-claims/claims.test.ts` | No cross-module tender→award→activate→claim test |
| Financial leaks | `tests/integration/dg-financial-projection/financial-projection.test.ts` | — |
| BOQ subcontractor | `tests/integration/boq/*`, E2E `boq-happy-path.spec.ts` | Exercises BOQ valuation path, not DG claims |
| E2E DG smoke | `tests/e2e/harness/dg-auth-smoke.mjs` | Pre-seeded world; skips tender lifecycle |
| Portal routes | `tests/unit/contractor-portal/routes.test.ts` | All project portal routes marked implemented |

---

## 5. Findings

| ID | Severity | Title | Evidence | Recommendation |
|---|---|---|---|---|
| **D04-001** | **High** | Owner tender management is backend-only | `createTenderPackage`, `inviteVendorToTender`, `awardTenderToSubcontract` exported from `contractor-procurement` but **no** `(app)/projects/.../tenders` actions/forms; screens are read-only | Add owner server actions + forms (create package, invite vendors, award offer) gated by `contract.manage`; wire FAB/global create if spec requires |
| **D04-002** | **High** | Tender award does not seed contract commercial baseline | `awardTenderToSubcontract` calls `createDraftAgreement` without bid financials; integration test only asserts `draft` + vendor | On award, optionally pre-fill `originalAmount` / import BOQ lines / copy offer financials; document manual steps until automated |
| **D04-003** | **Medium** | Dual subcontract cost models without integration | BOQ panel (`boq/ui/subcontractor-schedule-panel.tsx`) vs DG work lines + claims; shared contract forbids claim↔BOQ node coupling | Product doc + UI cues: when to use BOQ valuations vs progress claims; long-term link tender `workPackageId` to BOQ mappings |
| **D04-004** | **Low** | Tender status `evaluating` is dead | Enum in `domain/types.ts` + DB check; transitions only `draft`→`inviting`→`awarded`/`cancelled` in `tenders.ts` | Remove from UX or set when bids close before award |
| **D04-005** | **Medium** | `developer/*` route namespace misleading | Only connected-contractor mirror (4 tabs); entrepreneur GC uses `/execution`, `/tenders`, `/claims`, etc. | Rename or document in onboarding; link from connected banner to full portal |
| **D04-006** | **Low** | Plan todos out of sync with repo | Plan YAML pending vs migrations `0155–0170` applied | Refresh plan todo statuses or archive takeover notes |
| **D04-007** | **Medium** | No E2E for full entrepreneur commercial chain | E2E: seeded agreement + claims smoke; BOQ E2E separate; tender E2E absent | Add Playwright: create package (once UI exists) → portal bid → award → activate → claim → certify |
| **D04-008** | **Low** | Tender offer list shows vendor UUID fragment | `tenders/[packageId]/screen.tsx` — `vendorOffer` uses `offer.vendorId.slice(0, 8)` | Resolve vendor display name via operational vendor read |
| **D04-009** | **Info** | Entrepreneur path bypasses tenders entirely | `/contractors?new=1` supports direct agreement creation (supported workflow) | Keep; ensure tender UI gap is explicit in release notes so users are not blocked |
| **D04-010** | **Low** | Tender list empty copy over-promises | `awards.empty.description` references creation with no CTA | Align copy with capabilities or add create button |

---

## 6. Scenario completeness matrix

| Stage | Backend | Owner UI | Portal UI | Automated test |
|---|---|---|---|---|
| Entrepreneur profile (`developer_gc`) | Yes | Yes (create + delivery card) | N/A | Unit + integration profile |
| BOQ / budget | Yes | Tab + modules | N/A | BOQ integration + E2E |
| Tender package | Yes | **Read-only** | Bid submit | Integration only |
| Subcontract draft → active | Yes | Contractors + agreement tabs | Contract/changes | Integration |
| Change orders | Yes | Yes | Yes | Integration |
| Execution / field | Yes | Yes (+ employee) | Partial mirror | Many DG integration files |
| Progress claims | Yes | Yes | Yes | Integration + partial E2E |
| `developer/*` connected shell | Yes | Partial (4 tabs) | Full portal separate | `connected-projects` unit tests |

---

## 7. Summary

The **Developer/GC operating model is largely implemented at the data and application layer**: migrations through `0170`, subcontract core, claims with financial separation, contractor portal routes, execution hub, and procurement/tender **domain** services. The entrepreneur journey **breaks in the UI for tenders** (D04-001): an owner cannot complete tender→award without API/tests or direct subcontract creation. **Award→contract value** is manual (D04-002). **BOQ subcontract valuations** and **DG progress claims** remain parallel systems by design (D04-003), which is correct per shared contracts but operationally demanding. The **`developer/*` routes** serve connected subcontractors, not the entrepreneur workspace (D04-005).

**Suggested priority for product completion:** D04-001 → D04-002 → D04-007 (after UI) → D04-003 (documentation/UX).

---

*End of AGENT_04_developer_gc.md*
