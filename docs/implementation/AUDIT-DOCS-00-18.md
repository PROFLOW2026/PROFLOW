# AUDIT — Docs 00–18 vs code

**Auditor:** Auto AUDITOR A  
**Date:** 2026-08-09  
**Workspace:** `projectflow/`  
**Scope:** Foundational product decisions in `docs/00`–`docs/18` compared to current application/schema.  
**Policy:** Close safe HIGH/MEDIUM gaps in code when docs are clear. No push. No notifications invent. No drizzle invent (propose Lead **0014+**).

---

## Summary

Core V1 financial separations (Contract ≠ Billing ≠ Cash; Committed ≠ Expense; coverage disclosure; no casual “Revenue”) are largely implemented. Progressive complexity (adaptive nav, auto default WorkPackage, optional modules) is in place. Remaining gaps cluster around **project-scoped RBAC**, **budget entity**, **remaining-cost forecast inputs**, **vendor pick-at-capture**, and **period allocation runs** — several need Lead-owned schema (0014+).

---

## Findings table

| ID | Severity | Area | Doc ref | Finding | Code evidence | Disposition | Status |
|----|----------|------|---------|---------|---------------|-------------|--------|
| A01 | HIGH | Vendors / progressive complexity | `07` §2; `09` §5; `16` §5.4 | Plain `supplierName` → Vendor promote path existed in application but had **no UI**; expense edit could also **drop `vendorId`** (no hidden field). | `promote-vendor-from-transaction.ts` exported; no prior app action/UI. `expense-form.tsx` typed `vendorId` but did not submit it. | **SAFE TO FIX NOW** | **CLOSED** — promote panel + action on expense detail; preserve `vendorId` on edit; en/he copy |
| A02 | MEDIUM | Financial honesty | `04` §3, §10; `16` §5.9 | Estimated Final Cost equals Actual Cost to Date (no remaining-cost engine). Risk of looking like a real forecast. | `cost-aggregation.ts` comment + `estimatedFinalCost: actualCostToDate`; panel labeled “forecast” nature | **SAFE TO FIX NOW** | **CLOSED** — `estimatedFinalCostHint` disclosure on project financials panel |
| A03 | MEDIUM | Terminology | `03` / `18` B5; projects UX | EN expenses UI said “Work package” while projects UI uses “Work area” (canonical WorkPackage). | `locales/en/expenses.json` vs `projects.workPackages` | **SAFE TO FIX NOW** | **CLOSED** — EN copy aligned to “Work area” |
| A04 | HIGH | Optional Phase workflow | `03` §; `16` §4–5.2; `18` B4 | Phase create use-case existed; Work tab previously read-only for phases. | `createPhase` in `modules/projects`; Work tab now has `createPhaseAction` + `AddPhaseForm` | **SAFE TO FIX NOW** | **Already closed in tree** (phase create UI present); verified this pass |
| A05 | HIGH | Permissions / scope | `12` §6; `15` §4; `16` §5.1 | Project-scoped role assignments documented; column reserved but always org-wide. Workers with `projects.read` see all org projects. | `role_assignments.projectId` nullable; comment “null until scope feature enabled”; no filter in list queries | **DEFERRED** | Propose Lead **0014** — enforce `projectId` scope in authz + lists + RLS helpers |
| A06 | HIGH | Financial model | `04` §5; `16` success criteria (budget optional) | **Budget** concept in docs/UI keys; **no budget tables/module**. | `financial.json` has `"budget"`; grep finds no `budgets` schema/module | **DEFERRED** | Propose Lead **0014+** budget tables (project/WP/category) before UI |
| A07 | MEDIUM | Financial forecast depth | `04` §3 Estimated/Forecast Final Cost | No user-entered remaining / ETC cost; forecast cannot diverge from actual. | Same as A02 domain path | **DEFERRED** | After A02 disclosure; remaining-cost input needs schema (Lead **0015**) |
| A08 | MEDIUM | Cost allocation | `04` §8; `02` AllocationRule/Run; `16` §5.4 | Manual amount/% on **expense allocation lines** works; no period **AllocationRule / AllocationRun** for shared/overhead batches. | Expense `AllocationEditor` + methods; no `AllocationRun` symbols | **DEFERRED** | V1 manual-on-expense is enough for many pilots; period engine = Lead **0015+** if needed |
| A09 | MEDIUM | Vendors capture modes | `07` §2 modes 1–4 | Modes 1–2 (none / plain name) + promote (4) OK; **pick existing Vendor at capture** (mode 3) not in expense form. | Supplier text field only; no vendor select on create | **SAFE TO FIX NOW** | **CLOSED** — vendor select under More details on create/edit |
| A10 | MEDIUM | Permissions catalog vs docs | `12` §5 examples | Docs illustrate `time.create.own` / `time.approve` / `expenses.approve`; code uses coarser `time.manage` / `expenses.finalize`. | `shared/permissions/catalog.ts` | **DEFERRED** | Intentional V1 coarseness (H1); refine with Lead when own-record scoping lands with A05 |
| A11 | LOW | Tax overrides depth | `11` §5 | Org tax rules + snapshots exist; project/document override UX thin vs full precedence ladder. | `modules/tax`; no `TaxOverride` entity usage found in app | **DEFERRED** | Lead **0014+** if project-level override rows required beyond current snapshots |
| A12 | LOW | Assets vs V1 deferral | `08`; `16` §6 | Doc 16 defers full assets; Wave 3 shipped assets/fleet/inventory. Progressive nav hides until used — OK, but **scope drift** vs 00–18 V1 cut. | `modules/assets`, nav `module: 'assets'` | **DEFERRED** | Treat as Wave 3 expansion; keep progressive hide; do not back-port into 00–18 “Must” |
| A13 | LOW | Notifications | `14` §3; `02` Notification; `17` V1.x | Notifications capability mentioned in architecture; explicitly out of current build policy. | Job port has invitation email; no in-app notifications module | **DEFERRED** | Do **not** invent (program rule) |
| A14 | INFO | Committed ≠ Expense | `04` §3; procurement later docs | Correctly separated; financials disclose committed vs actual. | `committed-costs.repository.ts`; PO issue creates committed cost not expense | OK | Keep invariant |
| A15 | INFO | Revenue labeling | `01` §2.6; `04` §2; `16` §5.9 | Code/docs consistently avoid Revenue as UI label. | Financials/billing copy + export notes | OK | — |
| A16 | INFO | Progressive complexity nav | `01` §2.11; `16` §3.1 | Adaptive nav + module visibility + auto default WP + coverage disclosure. | `navigation.ts` `visibleNavItems`; `noteModuleUsage`; default WP on create | OK | — |
| A17 | INFO | Multi-tenancy / RLS | `15`; `16` §5.8 | Org context + RLS migrations present through local 0013. | `0001_rls_security.sql`, `0006_rls_hardening.sql` | OK | Remote apply lag is ops, not domain gap |
| A18 | MEDIUM | Relationships | `02` §4; `07` §5 | VendorEngagement create/archive exists; engagement commercial fields (quoted/contracted value) thin vs doc sketch. | `createVendorEngagement` role+project only | **SAFE TO BUILD NOW** | Enrich engagement form with optional scope/notes using existing columns if present; else Lead schema |
| A19 | LOW | Terminology / CRM vs Project | `03` lifecycle; `18` | Project statuses exclude `Quoted` (belongs to CRM) — code respects. | Project status enum vs CRM opportunity | OK | — |
| A20 | MEDIUM | Integrity | `13` §3 | Audit trail UI under Settings → Activity; coverage of all sensitive writes uneven across Wave 3 modules. | `settings/activity`; `recordAuditEvent` used widely but not proven exhaustive for AP/field-ops | **SAFE TO BUILD NOW** | Audit coverage checklist pass (no schema) |

---

## Closed this pass

1. **A01** — Expense → promote/link Vendor UI + preserve `vendorId` on edit.  
2. **A02** — Estimated final cost honesty hint.  
3. **A03** — EN “Work area” terminology alignment on expenses.  
4. **A04** — Confirmed Phase add UI already present on Work tab.  
5. **A09** — Link existing Vendor on expense capture/edit (More details).

---

## Lead migration proposals (do not invent here)

| Proposed | Why |
|----------|-----|
| **0014** | Project-scoped `role_assignments` enforcement + helper indexes/constraints if missing; optional tax override rows if product requires them |
| **0015** | Budget tables (project / work_package / category); optional remaining-cost / ETC fields for true Estimated Final Cost |
| **0016+** | Period AllocationRule / AllocationRun if batch overhead allocation becomes required beyond expense splits |

---

## Top SAFE TO BUILD NOW

1. **Vendor engagement enrichment UI** — optional scope/notes/status if columns already exist; otherwise stop for Lead.  
2. **Audit coverage pass** — ensure Wave 3 write paths call `recordAuditEvent` for money/permission-sensitive actions.  
3. **Expense create: optional “Save as vendor” checkbox** — same promote use-case at create time (mirror detail panel).  
4. **Project-scoped RBAC** — after Lead **0014** only (no UI-only mock).  
5. **Remaining-cost forecast UI** — only after Lead **0015**; disclosure already shipped.  
6. **Budget entry UI** — only after Lead **0014/0015** budget tables.

---

## Explicit non-goals (this audit)

- Notifications invent  
- New drizzle migrations authored by auditor  
- Git push  
- Reopening owner decisions in `18` marked DEFERRED/OPEN  

---

## Verdict

Foundational 00–18 decisions are mostly honored in code for money semantics, progressive complexity, commercial CR→CO, documents, tax basics, and tenancy. Highest remaining product risks are **unscoped project access (A05)** and **missing Budget / ETC schema (A06/A07)** — both Lead-owned. Safe UI/workflow gaps closed this pass improve vendor progressive complexity and financial honesty.
