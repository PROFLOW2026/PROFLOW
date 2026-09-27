# ProjectFlow — Management / Office Experience Architecture Map

**Date:** 2026-09-21  
**Mode:** READ-ONLY (no code / SQL / commit / push / deploy)  
**Product decision:** Keep current Employee App Planner/operational experience. Add a complementary Management/Office layer by **reusing Main App modules**, not by duplicating business logic.

---

## Verdict (short)

| Decision | Answer |
|----------|--------|
| KEEP CURRENT EMPLOYEE PLANNER | **YES** |
| MANAGEMENT EXPERIENCE SHARED WITH MAIN MODULES | **YES** (services already shared; **UI must be extracted**, not current thin Employee duplicates) |
| Session boundary Main ↔ Employee | **KEEP HARD** — do not open Employee sessions into `(app)` routes |
| Recommended routing | **OPTION A** — `/employee/management/...` (or grouped Management nav) rendering **shared module components** |
| Current Employee finance pages | **Simplified duplicates** — replace with shared module UI over time |
| Preset code changes vs live grants | **Not automatic** — existing accounts keep old `employee_permission_grants` until Save / re-activate |
| Team open-task = 0 | **Code-proven mechanisms** (missing `TASKS_READ`, scope, viewer-visible task universe); live grants not SELECTed this pass |

---

## 0. Surface boundary (non-negotiable)

| Surface | Layout | Guard |
|---------|--------|-------|
| Main (Owner) App | `src/app/[locale]/(app)/layout.tsx` → `AppShell` | `assertOwnerAppSurface()` — active Employee sessions redirected away from `(app)` |
| Employee App | `src/app/[locale]/employee/(shell)/layout.tsx` | `assertEmployeeAppContext()` |

**Permissions:**

- Main: org RBAC (`loadEffectivePermissions` / role union).
- Employee: org permissions **replaced** by `employee_permission_grants` (+ `ATTENDANCE_SELF` baseline) via `enrichOrgContextWithEmployeeApp`.
- Domain services already use `assertPermission(context, PERMISSIONS.*)` — Employee sessions can call the **same services** when grants match.

---

## 1. Main App module reuse map

Legend for **CAN COMPONENT BE REUSED DIRECTLY**: whether the existing Main **page** can be dropped into Employee shell as-is (almost always **NO** — shell/nav/hub coupling). Services are the reusable core.

### PROJECTS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/projects`, `/projects/[projectId]` (+ tabs/sub-routes) |
| MAIN PAGE/COMPONENT | `(app)/projects/page.tsx`, `[projectId]/page.tsx` + layout/tabs |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** (AppShell, ProjectTabsShell, SavedListViews, Owner hub) |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`listProjectsForOrg`, `getProjectDetail`, tab loaders) |
| OWNER-SHELL COUPLING | **HIGH** |
| OWNER-ONLY GUARD | UI gated by `PROJECTS_*`; Employee already has operational project routes |
| ORG RBAC COUPLING | Project access modes + grants |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (operational projects already exist) |
| REQUIRED EXTRACTION | Keep Planner project UX; Management needs richer project directory/detail only if granted — prefer shared list panels, not full Owner hub |
| ESTIMATED COMPLEXITY | **HIGH** |

### CLIENTS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/clients`, `/clients/new`, `/clients/[clientId]` |
| MAIN PAGE/COMPONENT | `(app)/clients/page.tsx` + detail/new |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** (PageHeader, SavedListViews, Owner filters) |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`listClientsForOrg`, `getClientById`, `createClient`, …) |
| OWNER-SHELL COUPLING | **MEDIUM** |
| OWNER-ONLY GUARD | `CLIENTS_READ` / `CLIENTS_MANAGE` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (already used by Employee clients pages) |
| REQUIRED EXTRACTION | `ClientsList` / `ClientDetail` into `modules/clients/ui` with surface-agnostic props |
| ESTIMATED COMPLEXITY | **LOW–MEDIUM** |

### CONTRACTS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/contracts`; project contracts via project hub |
| MAIN PAGE/COMPONENT | `(app)/contracts/page.tsx`; CRUD in project commercial UI |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`listOrgContracts`, `manage-contracts`) |
| OWNER-SHELL COUPLING | **LOW–MEDIUM** (org list); **HIGH** (project contract workspace) |
| OWNER-ONLY GUARD | `CONTRACTS_READ` / `CONTRACTS_MANAGE` |
| ORG RBAC COUPLING | Project-access filtered |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | Shared contracts list + detail; project contract panels already modular |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### CHANGES

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/changes`, `/changes/new`, `/changes/[id]`, approve/price |
| MAIN PAGE/COMPONENT | `(app)/changes/*` + `ChangeRequestList` / `ProjectChangesPanel` |
| CAN COMPONENT BE REUSED DIRECTLY | **PARTIAL** (module UI closer than most) |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`@/modules/commercial`) |
| OWNER-SHELL COUPLING | **MEDIUM** (CommercialDocsHub) |
| OWNER-ONLY GUARD | `CHANGES_*` + module flag |
| ORG RBAC COUPLING | Org list + project panel |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (no Employee routes yet) |
| REQUIRED EXTRACTION | Wire existing module list/panels into Management shell |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### QUOTES

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/quotes`, `/quotes/new`, `/quotes/[quoteId]` |
| MAIN PAGE/COMPONENT | `(app)/quotes/*` |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** |
| OWNER-SHELL COUPLING | **MEDIUM** |
| OWNER-ONLY GUARD | `QUOTES_*` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (no Employee routes yet) |
| REQUIRED EXTRACTION | Quotes list/detail → `modules/quotes/ui` |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### BILLING

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/billing`, `/billing/new`, `/billing/[id]`, payments allocate |
| MAIN PAGE/COMPONENT | `(app)/billing/page.tsx` (heavy hub) |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`listBillingRecords`, AR summary, payments, allocate, …) |
| OWNER-SHELL COUPLING | **HIGH** (CommercialDocsHub, reports, statutory) |
| OWNER-ONLY GUARD | `BILLING_READ` / `BILLING_MANAGE` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | Split hub into shared panels: list, aging, unallocated, payment history, create/allocate forms |
| ESTIMATED COMPLEXITY | **HIGH** |

### COLLECTIONS / PAYMENTS

| Field | Value |
|-------|--------|
| MAIN ROUTE | Embedded in `/billing` + `/billing/payments/*` |
| MAIN PAGE/COMPONENT | Billing hub + payment pages |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** |
| OWNER-SHELL COUPLING | **HIGH** |
| OWNER-ONLY GUARD | Same as billing |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (Employee has payment create only) |
| REQUIRED EXTRACTION | Shared payment/allocate/history panels |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### EXPENSES

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/expenses`, `/expenses/new`, `/expenses/[id]`, `/expenses/received` |
| MAIN PAGE/COMPONENT | `(app)/expenses/page.tsx` + `expenses-list.tsx` |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** (project-scoped queries already) |
| OWNER-SHELL COUPLING | **MEDIUM** (OCR, recurring, SavedListViews) |
| OWNER-ONLY GUARD | `EXPENSES_*` |
| ORG RBAC COUPLING | Project-scoped for restricted users |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | Share list + detail; keep OCR/received Main/Management-advanced |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### AP

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/procurement/ap`, bills, credits, aging |
| MAIN PAGE/COMPONENT | `(app)/procurement/ap/*` |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`@/modules/ap`) |
| OWNER-SHELL COUPLING | **HIGH** (ProcurementSectionNav, OCR, reports) |
| OWNER-ONLY GUARD | `AP_READ` / `AP_MANAGE` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | Bill list/detail/lifecycle panels without Owner section chrome |
| ESTIMATED COMPLEXITY | **HIGH** |

### VENDORS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/vendors`, `/vendors/new`, `/vendors/[vendorId]` |
| MAIN PAGE/COMPONENT | `(app)/vendors/*` |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** |
| OWNER-SHELL COUPLING | **MEDIUM** |
| OWNER-ONLY GUARD | `VENDORS_*` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | Vendor list + multi-panel detail |
| ESTIMATED COMPLEXITY | **MEDIUM** |

### PROCUREMENT

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/procurement`, POs, RFQs, materials |
| MAIN PAGE/COMPONENT | `(app)/procurement/*` |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** |
| OWNER-SHELL COUPLING | **MEDIUM–HIGH** |
| OWNER-ONLY GUARD | `PROCUREMENT_*`, `MATERIALS_*` |
| ORG RBAC COUPLING | Org-wide |
| EMPLOYEE AUTH COMPATIBILITY | **YES** |
| REQUIRED EXTRACTION | PO list/detail first; RFQ/materials later |
| ESTIMATED COMPLEXITY | **HIGH** |

### PROJECT FINANCIALS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/projects/[id]?tab=financials`; org `/financials/*` |
| MAIN PAGE/COMPONENT | `modules/financials/ui/project-financials-panel.tsx`; org overview pages |
| CAN COMPONENT BE REUSED DIRECTLY | **Project panel: YES (best existing shared UI)**; org rollups: **NO** for default Management (Owner analytics) |
| CAN APPLICATION SERVICE BE REUSED | **YES** (`getProjectFinancials`, …) |
| OWNER-SHELL COUPLING | **MEDIUM** (tab visibility) |
| OWNER-ONLY GUARD | `PROJECT_FINANCIALS_READ`, `PROJECT_PROFIT_READ` |
| ORG RBAC COUPLING | Project access |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (Employee financials page already calls service; UI is simplified cards) |
| REQUIRED EXTRACTION | Prefer embedding `ProjectFinancialsPanel` in Employee project hub when granted |
| ESTIMATED COMPLEXITY | **MEDIUM** (project); **HIGH** (org dashboards — keep Main-only unless explicitly granted later) |

### DOCUMENTS

| Field | Value |
|-------|--------|
| MAIN ROUTE | `/documents`; project documents tab; `/company-files` |
| MAIN PAGE/COMPONENT | `(app)/documents/*`; project documents-tab |
| CAN COMPONENT BE REUSED DIRECTLY | **NO** |
| CAN APPLICATION SERVICE BE REUSED | **YES** (+ employee document access helpers) |
| OWNER-SHELL COUPLING | **MEDIUM** (storage alerts, OCR) |
| OWNER-ONLY GUARD | `DOCUMENTS_*`; category grants |
| ORG RBAC COUPLING | Org registry + category filters |
| EMPLOYEE AUTH COMPATIBILITY | **YES** (operational documents already exist) |
| REQUIRED EXTRACTION | Share preview/upload; Management org registry vs Planner project files |
| ESTIMATED COMPLEXITY | **MEDIUM–HIGH** |

---

## 2. Wrong duplication already created

Evidence pattern: Employee finance pages under `employee/(shell)/{clients,contracts,billing,expenses,ap,vendors,procurement}` and `projects/[projectId]/financials` use **shared services** but **Employee-only list UI** (`employee-surface-styles`). Zero imports of Main `@/modules/*/ui` list tables from Employee routes.

| Route | Real reuse of Main UI? | Simplified duplicate? | Major gaps vs Main | Stay / Replace |
|-------|------------------------|----------------------|--------------------|----------------|
| `/employee/clients` | Services only | **YES** | Filters, pagination, archive, full form, edit | **Replace UI** with shared Clients module; keep Employee route |
| `/employee/contracts` | Services only | **YES** | Detail, filters, manage actions, links | **Replace UI** |
| `/employee/billing` | Services only | **YES** | Detail, aging, allocate, history, line items | **Replace UI** with shared Billing panels |
| `/employee/expenses` | Services only | **YES** | Detail, finalize, OCR, categories | **Replace UI**; optional keep ultra-light capture as mode |
| `/employee/ap` | Services only | **YES** | Detail, create, credits, aging | **Replace UI** |
| `/employee/vendors` | Services only | **YES** | Detail, edit, filters | **Replace UI** |
| `/employee/procurement` | Services only | **YES** | PO detail, RFQ, materials, issue | **Replace UI** (PO-first) |
| `/employee/projects/[id]/financials` | Service only | **YES** (stat cards) | Full `ProjectFinancialsPanel` | **Replace with shared panel** when granted |

**Do not modify yet** — this section is diagnostic only.

---

## 3. Management shell concept (evaluation)

```
Employee App
├── Operational / Planner   ← KEEP as primary for most users / PMs
│   Home, Projects, Tasks, Team, Time, Meetings, Documents, Forms
│
└── Management / Office     ← SHOW ONLY if any management grants present
    Clients, Projects (business), Contracts, Billing & Collections,
    Expenses, Vendors / AP, Procurement, Financials (project + optional org later)
```

Rules:

- **Not by title** — any employee may receive any grant.
- No Management grants → hide entire Management section.
- Partial grants → show only matching modules (already how `buildEmployeeNavItems` works; needs grouping UX).

PMs stay on Planner by default. `project_financials.read` → financial tab on assigned project. Extra billing/client grants → also show Management modules.

---

## 4. Main App vs Management surface

### MUST remain Main-App-only (Owner / admin)

| Area | Why |
|------|-----|
| Settings (all) | `canAccessSection` false for Employee App users |
| Roles / employee permission administration | Owner People + Roles |
| Org profile, modules, features | `SETTINGS_MANAGE` / `MODULES_MANAGE` |
| Integrations & storage provider config | OAuth / credentials |
| API keys, audit export | Admin surfaces |
| Tax / numbering / banking / approval **configuration** | Dangerous system config |
| `/company-files` admin tree | Storage admin |
| Org analytics defaults (`/financials/*`, `/reports`, `/cash-flow`, `/month-close`) until explicitly productized for Management | High blast radius |
| CRM / portfolio / automations / assistant | Separate Owner products |
| Workforce HR/payroll **admin** | Beyond attendance/time Employee surfaces |

### Can be shared operationally (Management)

Clients, contracts, changes, quotes, billing & collections, expenses, AP, vendors, procurement (PO+), project financials panel, documents (registry + project files), company tasks/team (already Employee), business project directory (scoped).

---

## 5. Routing architecture

| Option | Idea | Fit |
|--------|------|-----|
| **A** | `/employee/management/...` (or Management nav group) rendering **shared module components** | **RECOMMENDED** |
| **B** | Shared route/content layer used by both shells | Good long-term; heavier refactor of `(app)` pages |
| **C** | Employee sessions enter existing Main `(app)` routes | **REJECT** — weakens `assertOwnerAppSurface` / session boundary |

**Why A:**

1. Preserves hard Employee vs Owner session split.
2. Same canonical services + (after extraction) same UI modules.
3. Allows Management grouping without forcing PMs into office chrome.
4. Avoids mixing Owner AppShell chrome (SavedListViews, CommercialDocsHub Owner links, settings alerts) into Employee.

Option B can follow once modules are extracted: Main and Employee both become thin shells over `SharedBillingModule`.

---

## 6. Component extraction pattern

Current Main pages typically mix: shell context + org RBAC UI + query + table + route-local `actions.ts`.

**Target:**

```
Main route:     Owner AppShell → org RBAC gate → SharedXModule
Employee route: Employee shell → employee grant/scope gate → SharedXModule
```

Extract:

1. **Shared presentation** under `src/modules/<domain>/ui/` (list, detail, forms).
2. **Shared loaders** (server functions that take `OrgContext` + filter options).
3. **Mutations** — one application entry; Employee `actions.ts` only adds `assertEmployeeAppContext` + grant checks (already partial pattern).
4. **Strip** from shared UI: AppShell-only widgets, Owner reports entry, settings storage banners (pass as optional slots if needed).

Best near-term win: **`ProjectFinancialsPanel`** already exists — embed in Employee project hub instead of custom cards.

---

## 7. Project managers

- Do **not** force Management UI.
- Planner projects/tasks remain primary.
- `PROJECT_FINANCIALS_READ` → financial tab/data on assigned projects.
- Extra grants (`CLIENTS_*`, `BILLING_*`, …) → Management modules appear via nav grants.

---

## 8. Owner / Management / Office

Management/Office should approach full **operational company** capability via grants.

Must **not** auto-expose: settings, integrations, permission admin, storage config, audit/admin infrastructure — unless Owner explicitly grants a future admin permission (none of those should be on office presets).

---

## 9. Team open-task counts = 0 — root cause (code evidence)

### Presets do **not** auto-update live grants

| Event | Behavior | Evidence |
|-------|----------|----------|
| Edit `presets.ts` | **No DB change** | No sync job |
| Preset dropdown in editor | Updates **React state only** | `employee-app-access-panel.tsx` `applyPreset()` |
| Save | Full replace of `employee_permission_grants` | `saveEmployeeAppGrants*` |
| Account activation | Rewrites grants from preset | `account-lifecycle.ts` |

**Conclusion:** Accounts created **before** Management/Office preset updates still hold **old stored grants** until Owner Save or re-activate.

### Why Team shows `0` open tasks (code)

From `listEmployeeTeamRoster` (`employee-operational.ts`):

1. Roster requires **`WORKFORCE_READ`**. Without it → empty roster (nav can still show Team if only `ATTENDANCE_READ` / `ATTENDANCE_MANAGE` — nav mismatch).
2. Open counts require **`TASKS_READ`**. Without it → roster may show but **every `openTaskCount` is 0**.
3. Counts use **viewer-visible** tasks (`listEmployeePmTasks`), not org-wide totals — scope `assigned_only` / `granted_projects` can yield zeros even with both permissions.

**Live DB SELECT of specific persona grants:** not executed this pass (Owner rule: prepare only if required).  
**Prepared check (do not run without approval):**

```sql
-- Read-only diagnostic for a given employee account user_id / employee_id
SELECT permission_key, scope
FROM employee_permission_grants
WHERE organization_id = $org
  AND employee_id = $employee_id
  AND permission_key IN ('workforce.read', 'tasks.read', 'attendance.read', 'attendance.manage')
ORDER BY permission_key;
```

Most likely for “existing live accounts + 0 Team counts”: **old grants lack `WORKFORCE_READ` and/or `TASKS_READ`**, or have `TASKS_READ` with narrow scope so viewer-visible open tasks are empty.

---

## 10. Final recommendation

### KEEP CURRENT EMPLOYEE PLANNER = YES

### MANAGEMENT EXPERIENCE = SHARED WITH MAIN MODULES = YES

(Same services today; **shared UI extraction required** — do not expand thin Employee duplicates.)

### MAIN APP OWNER-ONLY AREAS =

Settings, roles/permission admin, integrations, storage config, API keys, audit export, tax/numbering/banking **config**, company-files admin, org month-close / default org analytics, CRM/portfolio/automations/assistant, HR/payroll admin.

### SHARED MODULE EXTRACTION REQUIRED =

Billing hub panels, clients list/detail, contracts list/detail, expenses list/detail, AP bill lifecycle, vendors detail, procurement PO, **ProjectFinancialsPanel** (already modular), documents registry/preview. Changes/Quotes when Management needs them.

### ROUTES TO KEEP =

All Operational/Planner: `/employee`, `/employee/projects`, `/employee/tasks`, `/employee/team`, `/employee/time`, `/employee/meetings`, `/employee/documents`, `/employee/forms` (+ project hub operational tabs).

### ROUTES TO REPLACE (UI, not delete path)

`/employee/clients`, `/contracts`, `/billing`, `/expenses`, `/ap`, `/vendors`, `/procurement`, `/projects/[id]/financials` — keep Employee URLs; swap bodies to shared modules.

### NEW MANAGEMENT ROUTES =

Prefer nav **group** “Management / Office” over mandatory path rename; optional `/employee/management/*` aliases later. Add Changes/Quotes under Management when productized. Do **not** add Main `(app)` paths for Employee sessions.

### CURRENT SIMPLIFIED EMPLOYEE MODULES THAT SHOULD BE REPLACED =

All eight finance surfaces listed in §2 (keep routes; replace UI with shared Main-module components).

### TEAM 0 ROOT CAUSE =

Live grants are **not** updated when preset definitions change. Team open-task badges need `TASKS_READ` (+ visible tasks in scope); roster needs `WORKFORCE_READ`. Zero counts on older accounts are consistent with **stale grants and/or missing `TASKS_READ`**, not a broken Team page formula.

### IMPLEMENTATION PHASES =

1. **Shell + nav** — Management/Office section gated by any management grant; keep Planner primary; document Owner must re-save presets for existing accounts; optional grant audit SQL.
2. **Extract & swap highest-value modules** — ProjectFinancialsPanel → Employee project; Clients; Billing (list+detail+payments); Expenses list/detail.
3. **Complete office stack** — Contracts, AP, Vendors, Procurement PO; then Changes/Quotes; deepen AR (aging/allocate) via shared panels.

### MIGRATION EXPECTED = NO

(No schema change required for architecture; optional grant re-apply is **data**, not migration.)

### CODE CHANGED = NO  
### SQL EXECUTED = NO  
### COMMIT = NO  
### PUSH = NO  
### DEPLOY = NO

---

**STOP.**
