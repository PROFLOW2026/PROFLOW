# WAVE4 Audit A — Core docs 00–18 vs code

**Date:** 2026-08-09  
**Auditor:** Auto/Composer (PART B / AUDITOR A)  
**Scope:** `docs/00`–`18` compared to local codebase (modules through Wave 3 / local `0013`)  
**Constraints honored:** No push · no remote migrations · Lead owns `0014+` · notifications out of scope

---

## Verdict

V1 core (identity, projects/WP/phases, commercial CR→CO, expenses+overhead families, billing/payments, workforce True Cost path, vendors, documents, tax, Hebrew+Israel pack, adaptive nav, coverage disclosure) is **largely implemented and usable**. Remaining gaps are mostly progressive-disclosure polish, budget depth, project-scoped role UX, and a few terminology/coverage edges—not missing foundational workflows.

---

## Method

Cross-checked docs against: `src/modules/*`, app routes under `src/app/[locale]/(app)`, `src/shared/permissions/catalog.ts`, financials UI (`CoverageDisclosure`), locales (`en` / `he-IL`), and local migrations `0000`–`0013`.

---

## Doc-by-doc summary

| Doc | Topic | Code posture | Gaps |
|-----|-------|--------------|------|
| **00** Overview | Product intent | Aligned | Working name still ProjectFlow (deferred rename) |
| **01** Principles | Progressive complexity, honest finance, global-first | Strong | Occasional English “work package” vs “work area” drift (UX) |
| **02** Domain model | Entities + relationships | Schema + modules cover core graph | Budgets shallow; some Wave2/3 entities exceed original V1 map (by design) |
| **03** Business/project | Domains, WP mandatory, phases | Implemented (auto default WP; UI hides until multi) | Project-role / delivery-mode fields present but lightly used in flows |
| **04** Financial model | Separate concepts + coverage | Implemented with disclosures | Formal **Budget** editing thin; Estimated Final Cost UX limited vs doc depth |
| **05** Contracts/quotes/CR/CO | CR≠CO, quote versions | Implemented | Public quote send / client approval channel still internal-only (DECIDED C3) |
| **06** Workforce | True Cost, rates, time | Implemented | Optional Employee↔User link exists; advanced burden polish residual |
| **07** Vendors | Registry + engagements | Implemented | Hierarchy depth intentionally shallow (F2) |
| **08** Assets V1 categorization | Cost family asset/capital | Expense family yes; full fleet = Wave3 module | V1 “categorization only” OK; full assets are optional extension |
| **09** Documents | Attach + capture path | Implemented (upload/link, owners) | Real OCR provider = credential; private bucket owner action residual |
| **10** Globalization | EN keys, HE UI, country pack | Implemented | Extra country packs later |
| **11** Tax | Configurable rules | Implemented | Country-pack legal export gates contextual |
| **12** Users/roles/permissions | Templates + catalog | Implemented | Project-scoped assignment UX incomplete vs doc §6; no `time.create.own`-style fine grain |
| **13** Audit/integrity | AuditEvent, soft delete | Implemented | Activity labels lag newest Wave3 actions in places |
| **14** Architecture options | Historical | Superseded by 65–80 stack | N/A |
| **15** Security/tenancy | Org isolation | App filters + RLS tests | Ongoing defense-in-depth (Wave3 review closed F01–F14) |
| **16** V1 scope | Must list | Core Musts present | “Minimal path” still navigable; optional modules gated by usage |
| **17** Roadmap | Timing labels | Many “V2/V3” items already built locally | See Audit B |
| **18** Open questions | DECIDED batch | Reflected in schema/UX | Residual OPEN items are Future / packaging |

---

## Missing or incomplete workflows

| ID | Severity | Finding | Status |
|----|----------|---------|--------|
| A-01 | MEDIUM | **Budget** as first-class editable plan (project/WP/category) is not a full workflow—metrics lean on contract/cost/billing. | PARTIAL — safe backlog unless product wants budgets pre-launch |
| A-02 | MEDIUM | **Project-scoped membership** (PM/worker limited to assigned projects) not fully productized in Settings People. | PARTIAL |
| A-03 | LOW | **Estimated / Forecast Final Cost** editable path is thinner than doc 04 narrative. | PARTIAL |
| A-04 | LOW | Client-facing **send quote / external approval** absent (aligned with C3 internal-only). | DEFERRED BY OWNER / product |
| A-05 | LOW | Global Documents hub secondary vs entity attachments—hub exists but search/depth light. | PARTIAL (acceptable V1) |

---

## Incomplete financial behavior

| ID | Severity | Finding |
|----|----------|---------|
| A-F01 | HIGH (watched) | Contract value ≠ invoiced ≠ paid ≠ outstanding: **honored** in billing + financials panels. |
| A-F02 | HIGH (watched) | Coverage disclosure present on project financials / org rollups; FX exclusions documented. |
| A-F03 | MEDIUM | Committed cost (PO) integrated in Wave3 financials with FX partial reasons—must stay ≠ Expense (preserved). |
| A-F04 | MEDIUM | Overhead allocation UI exists on expenses; org-level allocate tools still progressive/optional. |
| A-F05 | LOW | Generic “Revenue” avoided in primary metric labels; billing copy correctly says VAT is not revenue. |

No BLOCKER financial honesty regressions found vs docs 01/04/16 in this pass.

---

## Missing relationships

| Relationship (docs) | Code |
|---------------------|------|
| Project → ≥1 WorkPackage → optional Phase | Yes |
| Contract primary per project; CR → CO | Yes |
| Expense → Project/WP optional; cost family | Yes |
| BillingRecord → Payments; Outstanding derived | Yes |
| Document → polymorphic owner | Yes (+ `0013` owner types local) |
| Employee optional ↔ User | Schema/link path exists |
| Opportunity → Client/Project (doc 20) | Wave2 CRM convert — outside 00–18 but present |
| PO committed ≠ expense | Wave3 — present |

---

## Permission gaps

| Gap | Notes |
|-----|-------|
| Catalog richer than doc 12 examples | Good — includes CRM, compliance, API, procurement, AP, assets, field_ops |
| Missing fine-grained “own time only” | Doc illustrative; product uses `time.manage` / workforce manage |
| Project-scope enforcement | Permission keys exist for financials/profit; assignment UI incomplete (A-02) |
| Role templates seeded | Owner / Manager / Worker / Finance-style templates present |

---

## Progressive-complexity violations

| ID | Finding | Severity |
|----|---------|----------|
| A-PC01 | Adaptive nav (`navigation.ts` + module usage) generally correct for U1. | OK |
| A-PC02 | Wave2/3 modules (CRM, procurement, field-ops, assets) correctly module-gated—**not** forced on empty orgs. | OK |
| A-PC03 | Some empty states still soft text-only without single CTA (milestones historically). | LOW — fix in UX pass |
| A-PC04 | Settings Features / Business presets avoid mandatory long wizard — onboarding skippable. | OK |

---

## Terminology drift

| Canonical / U5 | Issue |
|----------------|-------|
| WorkPackage → HE `תחום עבודה` | Hebrew correct in projects/expenses/field-ops |
| WorkPackage → EN “work area” (projects) | **Drift:** expenses / workforce / fieldOps / procurement EN still say “work package” |
| Changes → `שינויים ותוספות` | Aligned |
| Billing / Outstanding glossary | Aligned in financial + billing locales |

**Fix in this wave:** normalize EN UI strings to “work area” for user-facing labels (keys may stay `workPackage`).

---

## Safe fixes applied from this audit

- EN terminology: remaining “work package” UI strings → “work area” (fieldOps / procurement / workforce).  
- Milestone missed/cancelled controls confirmed present.  
- Project financials CSV export link with `projectId`.  
- List loading skeletons + production service-role env guard (see Tech audit).

---

## Explicit non-goals (this auditor)

- Inventing `0014+` migrations  
- Notifications product (doc 26)  
- Remote migration apply / push  
- Reopening DECIDED owner items in `18`
