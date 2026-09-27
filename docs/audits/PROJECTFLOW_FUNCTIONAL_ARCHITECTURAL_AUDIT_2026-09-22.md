# ProjectFlow — Functional & Architectural Audit Report  
**דוח ביקורת פונקציונלית וארכיטקטונית**

| Field | Value |
|-------|-------|
| **Date** | 2026-09-22 |
| **Audience** | External product analyst / competitive benchmarking |
| **Method** | Code inspection: `src/modules` (67), App Router pages (~195 office + ~42 employee), Drizzle schemas, API routes (~18), existing audits |
| **Language** | Hebrew narrative + English product/tech terms |
| **Code / DB changes** | None (read-only) |

**Related artifacts:**  
- `docs/audits/PROJECTFLOW_CORE_MODULES_MATURITY_AUDIT_2026-09-22.md` (module maturity table)  
- `docs/audits/PROJECTFLOW_FULL_END_TO_END_SYSTEM_MAP_2026-09-21.md`  
- `docs/audits/PROJECTFLOW_PLANNER_PLUS_CURRENT_STATE_MAP_2026-09-21.md`

---

## Executive verdict · סיכום מנהלים

**ProjectFlow הוא ERP רב־מודולי לבנייה / קבלנות / ייעוץ / שירות בשוק הישראלי**, עם שני משטחי מוצר פעילים (משרד + אפליקציית עובד), עמוד שדרה פיננסי חזק, ו־Universal Work Management (UWM) נפרד מ־field-ops.

| Dimension | Verdict |
|-----------|---------|
| **Product center of gravity** | רווחיות פרויקט / מחזור כסף (commercial → billing/AP/expenses → financials) |
| **Field vs office** | משרד מלא; שטח דרך Employee App + field-ops; **אין GPS**; offline drafts חלקי |
| **Maturity mix** | ~50 מודולים **FULL** · ~14 **PARTIAL** · Portal ציבורי **STUB/DISABLED** |
| **Not a** | CAD/BIM platform, multiplayer realtime field sync, או public client/vendor portal |

---

## 1. High-Level Overview & Architecture  
### סקירה ארכיטקטונית ומחסנית טכנולוגית

### 1.1 Core tech stack · מחסנית ליבה

| Layer | Technology | Evidence |
|-------|------------|----------|
| **Frontend** | Next.js **16** App Router, React **19**, Tailwind **4**, Radix UI, Lucide, TanStack Table | `package.json` |
| **Backend pattern** | **Server Actions** (~primary mutations) + **Route Handlers** (`src/app/api/*`) + RSC pages | `src/modules/*/application`, `**/actions.ts` |
| **Domain layout** | Modular domains under `src/modules/*` (application / data / domain / ui) | 67 folders |
| **Database** | **PostgreSQL** (Supabase-hosted), **Drizzle ORM**, migrations under `drizzle/migrations` | `drizzle.config.ts`, `src/shared/db/client.ts` |
| **Auth identity** | **Supabase Auth** (identity only) | `@supabase/ssr`, `src/shared/supabase/*` |
| **Authorization** | App-level **permission-key RBAC** + Postgres **RLS** (`app.user_id`) | `src/shared/permissions/*`, `drizzle/schema/rbac.ts` |
| **i18n** | **next-intl** — locales `he-IL` (default, RTL), `en`, `ar`, `ru` | `src/shared/i18n/*` |
| **Hosting** | **Vercel** region **`dub1`**; Supabase **`eu-west-1`** | `vercel.json`, release policy |
| **PDF / Excel** | `pdf-lib`, `pdfjs-dist`, `react-pdf`, `exceljs` | reports + document preview |
| **Email** | **Resend** adapter (`EMAIL_DRIVER=console` locally) | `src/shared/ports/email.ts` |

**Request edge:** `src/proxy.ts` (locale + session refresh) — not classic root `middleware.ts` ACL.

### 1.2 Architecture diagram (logical)

```
┌─────────────────────────────────────────────────────────────┐
│  Surfaces                                                    │
│  (app) Office  │  /employee Employee App  │  /portal OFF    │
└────────────┬──────────────────┬─────────────────────────────┘
             │                  │
             ▼                  ▼
   Org RBAC roles      Employee grants + scopes
             │                  │
             └────────┬─────────┘
                      ▼
              assertPermission + org context
                      ▼
         Drizzle → Postgres (RLS / organization_id)
                      │
     ┌────────────────┼────────────────┐
     ▼                ▼                ▼
  Supabase Auth   Storage OAuth    Workers/cron
                  (OneDrive/…)     (OCR, Sumit, ops)
```

### 1.3 Third-party integrations · אינטגרציות

| Integration | Role | Status |
|-------------|------|--------|
| **Supabase** | Auth + Postgres + (system) storage | Operational |
| **Resend** | Transactional email | Operational (console fallback) |
| **Sumit** | Israeli statutory invoicing / expense sync | Foundation + workers; production enablement gated |
| **OneDrive / Google Drive / Dropbox / Box** | Org external file SoT via OAuth | Operational when credentials set |
| **Azure Document Intelligence** | OCR | Optional; default provider = **stub** |
| **Accounting adapter** | Generic sync façade | Default **unconfigured** |
| **Public API v1** | `health` / `whoami` / `projects` | Thin / partial |
| **LLM Assistant** | Chat + tools | **Unconfigured** provider (no live LLM by default) |

### 1.4 Target personas · פרסונות ו־RBAC

#### Product surfaces

| Surface | Path | Audience | Status |
|---------|------|----------|--------|
| **Office / Main App** | `/[locale]/(app)/**` (~195 pages) | בעלים, מנהלים, משרד, כספים | **Operational** |
| **Employee App** | `/[locale]/employee/**` (~42 pages) | עובדי שטח / עובדים עם מענקים (PIN) | **Operational** |
| **Portal** | `/[locale]/portal/**` | לקוח / ספק חיצוני | **Hard-disabled** (`notFound`) |

#### Security roles (org templates)

`owner` · `manager` · `worker` · `finance` · `employee`  
→ cloned per organization (`src/shared/permissions/role-templates.ts`).

#### Business / experience personas (config, not security)

Examples: `GENERAL_CONTRACTOR`, `SUBCONTRACTOR`, `ELECTRICAL`, `HVAC`, `ARCHITECT`, `ENGINEERING_CONSULTANT`, `SAFETY_INSPECTION_CONSULTANT`, service profiles — `src/modules/tenancy/domain/business-profiles.ts`.

**Who the product actually serves today:**

- **קבלנים / קבלני משנה** — projects, BOQ, subcontracts, commercial CCV, billing/AP  
- **מנהלי פרויקט / משרד** — UWM boards, meetings, documents, command center  
- **כספים** — billing, expenses, AP, banking import, month-close, Sumit  
- **עובדי שטח** — Employee App: attendance, time, tasks, expenses, forms  
- **יועצים / אדריכלים / שירות** — lighter profiles, CRM, work orders / dispatch  
- **לקוח/ספק חיצוני** — **לא** כ־login product (portal OFF)

### 1.5 Multi-tenancy · רב־דיירות

**Tenant boundary = `organizations`.** Almost all business tables carry `organization_id` + RLS.

```
Organization
  ├── memberships + roles (Main RBAC)
  ├── employees + employee_app_accounts + grants
  ├── projects (work_kind: project | job | work_order)
  ├── workspaces ↔ project_workspace_links → boards → tasks
  ├── clients, vendors, documents, money domains…
  └── module preferences / business profile / numbering
```

Project access modes: `all` | `selected` | `assigned` (+ `projects.access_all` escape hatch).

---

## 2. Field Operations & Task Management  
### שטח ומשרד

ProjectFlow מפריד במכוון בין שתי שכבות עבודה:

| Layer | Hebrew | What it is |
|-------|--------|------------|
| **UWM Tasks** | ניהול משימות ארגוני | Workspace → Board → Bucket → Task |
| **Field-ops** | תיעוד שטח | Daily logs, punch lists, inspections |

**אין FK משותף** — פריט punch אינו משימת UWM.

### 2.1 Task management (UWM) — פירוט

| Capability | Status | Notes |
|------------|--------|-------|
| Create / edit / archive | **Full** | `src/modules/tasks` |
| Assignment | **Full** | Org member **או** employee (exactly one) via `task_assignees` |
| Statuses | **Full** | `todo \| in_progress \| in_review \| blocked \| done \| cancelled` |
| Priority | **Full** | `none \| low \| medium \| high \| urgent` |
| Checklist / labels / subtasks | **Full** (subtasks ≤ 2 levels) | |
| Comments + comment attachments | **Full** | `task_comments` |
| Document attachments | **Full** | `document_links` + link/unlink UI (`task-document-attachments.tsx`) |
| Dependencies / recurrence / reminders | **Mostly full** | Recurrence scheduler; cron wiring historically incomplete vs schema |
| Activity log / followers | **Full** | |
| Approvals gate | **Full** | Approvals module |
| Meetings → tasks | **Full** | Action item → `createTaskFromActionItem` |

**Key tables:** `workspaces`, `task_boards`, `task_buckets`, `tasks`, `task_assignees`, checklist/deps/comments/activity/labels/templates — `drizzle/schema/tasks.ts`, `workspaces.ts`.

**Main UI routes:**

- Office: `/work`, `/work/board`, `/work/calendar`, `/work/timeline`, `/tasks/[taskId]`, `/workspaces/...`, `/projects/[id]/boards|tasks`  
- Employee: `/employee/tasks`, `/employee/projects/[id]/{tasks,board,calendar}`

**Planning (Gantt):** מודול נפרד `planning_work_items` — foundational; **critical path / CPM = unsupported** as product truth.

### 2.2 Field-ops · יומן יומי, ליקויים, ביקורות

| Feature | Tables | Status | Routes |
|---------|--------|--------|--------|
| **Daily logs** | `daily_logs` (+ vendors/employees/assets joins) | **Full** office CRUD; draft→submitted→finalized | `/field-ops/logs` |
| **Punch / defects** | `punch_list_items` | **Full** office; status/priority/assignee/location **text** | `/field-ops/punch` |
| **Inspections** | `inspections` | **Full**; optional form template gate | `/field-ops/inspections` |
| **Photos** | via `documents` + `attachFilesToOwner` | **Full** (needs docs permission + storage) | create forms |
| **Work packages link** | field-ops fields | Present | |
| **Employee punch** | same table | **Partial** — assigned list tab only; no employee CRUD/detail | `/employee/tasks?tab=field-items` |
| **`/field` cockpit** | aggregator | **Partial** | `/field` |

### 2.3 Offline, mobile, GPS

| Capability | Status | Evidence |
|------------|--------|----------|
| **Mobile-responsive Employee shell** | **Full** | `max-w-lg`, bottom nav, `data-pf-employee-app` |
| **PWA manifests** | Present | `manifest.webmanifest`, `employee.webmanifest` |
| **Offline drafts (IndexedDB)** | **Partial–Full** for capture kinds | `src/modules/offline` — daily_log, punch, inspection, expense, time, etc. |
| **Reconnect sync** | **Full** for queued drafts | `OfflineSyncProvider` → server submit |
| **Service worker** | **Partial** | Shell assets + offline fallback — not full offline app; finance finalize offline excluded |
| **GPS / geolocation / geofence** | **Absent** | `Permissions-Policy: geolocation=()` in `next.config.ts`; punch `location` is free text |
| **Realtime sync (WebSocket / Supabase Realtime)** | **Absent** | Shared DB + `revalidatePath` / refresh only |

### 2.4 Field ↔ office sync · מנגנון סנכרון

**מודל:** single shared Postgres org database.

1. Office ו־Employee כותבים לאותן טבלאות (לפי הרשאות).  
2. אחרי mutation — Next.js `revalidatePath` / `router.refresh`.  
3. Offline — תור IndexedDB מתנקז ב־`online`.  
4. **אין** ערוץ realtime נפרד בין שטח למשרד.

---

## 3. Core Functional Modules  
### פירוק מודולים — Feature Breakdown

> Full maturity table: `docs/audits/PROJECTFLOW_CORE_MODULES_MATURITY_AUDIT_2026-09-22.md`

### 3.1 Modules table (benchmark view)

| Module | Purpose (what users do) | Key tables / models | Maturity |
|--------|-------------------------|---------------------|----------|
| **tenancy** | Org setup, settings, modules, numbering | `organizations`, memberships, settings, sequences | FULL |
| **identity / rbac** | Profiles + role permissions | `profiles`, `permissions`, `roles`, assignments | FULL |
| **clients** | Customer master | `clients`, contacts, identifiers | FULL |
| **vendors + subcontracts** | Suppliers, engagements, advances | `vendors`, `subcontractAgreements`, … | FULL |
| **projects / jobs** | Project/job/work-order structure | `projects`, packages, milestones, phases | FULL |
| **commercial** | Changes, in-project quotes, COs, contracts | change requests, quote versions, contracts | FULL |
| **quotes** | Owner commercial bids | `estimates` / line items | FULL |
| **crm** | Pre-project pipeline | prospects, leads, opportunities, CRM quotes | FULL |
| **billing / billing-plan** | AR bills, payments, plan cycles | billing records, payments, plans | FULL |
| **ap** | Vendor bills, match, payments, credits | `apBills*`, payments, credits | FULL |
| **procurement** | RFQ → PO → receipt | RFQs, POs, receipts, committed costs | FULL |
| **expenses** | Costs, allocation, overhead | expenses, allocations, categories | FULL |
| **workforce** | HR, time, attendance, labor, payroll pay | employees, time, attendance, timesheets, payroll | FULL |
| **employee-app** | Field product + grants | app accounts, permission/category grants | FULL |
| **documents** | Registry, links, versions/folders | `documents`, `documentLinks`, … | FULL |
| **external-storage** | Cloud drives as SoT | storage connections, folder maps, files | FULL |
| **ocr** | Receipt extraction + review UI | OCR jobs, correction memory | FULL* (*provider often stub) |
| **financials** | P&L, cash, true-cost months | general cost months, managerial lines | FULL |
| **boq** | Measure, progress, sub valuations | `projectBoqs`, nodes, progress, valuations | FULL |
| **tasks / workspaces / meetings** | UWM + meetings→tasks | boards, tasks, meeting_* | FULL |
| **field-ops** | Logs, punch, inspections | daily_logs, punch, inspections | FULL |
| **assets** | Assets, fleet, inventory, maintenance | assets, fleet, inventory_* | FULL |
| **safety** | HSE, CAPA, toolbox talks | safety records, corrective actions, toolbox | FULL |
| **compliance** | Certificates / expiry artifacts | `complianceArtifacts` | FULL |
| **forms** | Custom form templates/submissions | templates, submissions | FULL |
| **service** | Work orders, dispatch, recurrence | service details, recurrence, billing sources | FULL |
| **scheduling / calendar** | Bookings, unavailability, events | bookings, calendar events | FULL |
| **approvals** | Multi-step rules + inbox | approval rules/requests/steps | FULL |
| **notifications / command-center** | In-app alerts + Today inbox | notifications, command center states | FULL |
| **budgets / month-close / recurring-drafts** | Budget, close, recurring finance | budgets, close periods, drafts | FULL |
| **banking** | Import + match (CSV/XLSX) | bank accounts, imports, matches | FULL* (*live feed stub) |
| **reports / branding / tax / custom-fields** | PDF packs, brand, tax, CF | brand profiles, tax rules, CF defs | FULL |
| **closeout / warranty** | Project close + warranty issues | closeouts, warranty coverages/issues | FULL |
| **communications** | Outbound email/message log | outbound communications | FULL |
| **search / imports / exports / marketing** | Shell search, CSV I/O, landing | — | FULL |
| **invoicing-integration / expense-ingestion** | Sumit statutory + expense import | external statutory docs, imports | PARTIAL |
| **assistant** | AI chat | conversations/messages | PARTIAL (no LLM default) |
| **automations** | Rules engine | rules/runs | PARTIAL (some action stubs) |
| **integrations / api** | Accounting façade + API keys | integrations, api keys, webhooks | PARTIAL |
| **planning / forecast / field / retention** | Gantt, warnings, field hub, retention | planning items; retention releases | PARTIAL |
| **offline / operations / generated-documents** | PWA drafts, ops dashboard, save reports | IndexedDB / reads | PARTIAL |
| **portal** | External customer/vendor | external principals/grants | **STUB** (public OFF) |

### 3.2 Domain clusters (for analysts)

1. **Money spine:** clients → contracts/changes/quotes → billing ↔ expenses/AP/procurement → financials/month-close  
2. **People spine:** workforce + employee-app + attendance/time  
3. **Work spine:** workspaces/tasks + meetings + planning + field-ops + service/dispatch  
4. **Risk/quality:** safety, compliance, forms, warranty, closeout  
5. **Files:** documents + external-storage + OCR + reports PDF  
6. **Platform:** tenancy, rbac, approvals, automations, notifications, api, assistant  

**Three quote worlds (important for benchmarking):**

| Path | Model | Use |
|------|-------|-----|
| `/quotes` | `estimates` | Owner commercial bids |
| `/changes/...` commercial quotes | `quotes` / versions | In-project pricing |
| CRM sales quotes | `crm_sales_quotes*` | Pipeline only |

---

## 4. Collaboration & Permissions  
### שיתוף פעולה והרשאות

### 4.1 Permission model

| Layer | Mechanism |
|-------|-----------|
| **App gate (canonical)** | `assertPermission(permissionKey)` — no role-name branching in product logic |
| **Org RBAC** | Roles → permission union per membership |
| **Employee App** | Grants **replace** main role permissions for that surface; scopes: `self_only \| assigned_only \| granted_projects \| all_organization` |
| **Project access** | Org setting + per-project grants (`read`/`manage`) |
| **Postgres RLS** | Defense-in-depth with `app.user_id` session config |

**Not classical PM “project roles” (viewer/contractor/client).** Access is org-permission × project grant × employee scope.

### 4.2 Communication channels

| Channel | Status |
|---------|--------|
| **In-app notifications** | Operational (`/notifications`, bell) |
| **Command Center / Today** | Operational (`/today`) |
| **Task / client activity feeds** | Operational (append-only / timeline) |
| **Meetings** | Full Owner; Employee read-oriented |
| **Transactional email (Resend)** | Used by communications send path |
| **Notification email / push adapters** | **Intentionally unimplemented** (`channels.ts`) |
| **SMS** | Not a product channel |
| **WhatsApp** | Deep-link share only (`wa.me`), no API |
| **Automations** | Rules exist; some mutation actions stubbed/safe-notify |

### 4.3 Portal

- Admin Settings → Portal: grants, safe projections, vendor candidates — **foundation**  
- Public `/portal`, `/portal/customer`, `/portal/vendor` → **`notFound()`**  
- Policy: `EXTERNAL_PUBLIC_ACCESS_STATUS = 'disabled'` — ExternalPrincipal ≠ OrganizationMembership until safe session path exists  

---

## 5. Integrations & File Handling  
### אינטגרציות וקבצים

### 5.1 Cloud storage

| Layer | Role |
|-------|------|
| **Supabase Storage** | System/legacy blob adapter |
| **External org storage** | Preferred SoT: OneDrive, Google Drive, Dropbox, Box (OAuth) |
| **Company files** | Org browser hub `/company-files` |
| **Documents registry** | Metadata + polymorphic `document_links` (task, punch, log, inspection, etc.) |
| **Employee files** | Generally registry/metadata plane — not full live Drive browser |

### 5.2 PDF & documents

- **Generate:** branded PDF reports (`pdf-lib`, Hebrew-aware) — `/reports`  
- **View:** `react-pdf` / pdf.js worker (`copy-pdf-worker.mjs`)  
- **Statutory PDFs:** invoicing-integration org-guarded APIs  

### 5.3 Blueprint / CAD / BIM

| Capability | Status |
|------------|--------|
| CAD / DWG / IFC / Autodesk / BIM viewers | **Not present** |
| Drawing UX | PDF + image zoom preview only |
| “Blueprints” in Settings | Means **project/stage templates**, not drawings |

### 5.4 Other connectors

| Connector | State |
|-----------|-------|
| **Sumit** | Credential vault + workers; production tax-invoice milestone still gated by plan |
| **Bank live feed** | **StubBankFeedProvider**; CSV/XLSX import/match is real |
| **OCR** | Feature-gated; Azure when configured; default stub |
| **API keys + webhooks** | Settings + DB; public v1 surface thin |
| **Accounting integration** | Adapter façade; default unconfigured |

---

## 6. Current State vs Gaps  
### מצב נוכחי מול פערי מוצר

### 6.1 Fully implemented & operational (benchmark-ready)

- Multi-tenant org + dual RBAC (office / employee)  
- Commercial + AR/AP + expenses + procurement + project financials  
- Workforce time/attendance + Employee App shell  
- UWM (boards, tasks, comments, attachments link, portfolio/My Work)  
- Field-ops office CRUD + photo attach  
- Documents + multi-cloud OAuth storage  
- Safety / compliance / forms / service-dispatch / CRM  
- Approvals, reports PDF, i18n he/en/ar/ru  
- Offline draft queue for selected field/capture kinds  

### 6.2 Partial / gated / foundation

| Gap | Reality in code |
|-----|-----------------|
| Public client/vendor portal | Routes 404; admin foundation only |
| Notification email/push | Channel stubs intentionally empty |
| Live bank feed | Stub provider |
| OCR production | Off/stub unless Azure env |
| Sumit production e-invoicing | Milestone A foundations; B+ pending |
| Assistant | UI + tools without configured LLM |
| Automations actions | Some stubs |
| Public API v1 | Thin (`health`/`whoami`/`projects`) |
| Planning critical path | Explicitly unsupported |
| Employee field-ops CRUD | Punch list-only on employee |
| PWA offline | Drafts yes; full offline app no |
| Task recurrence cron | Schema/code vs incomplete scheduled worker historically |
| Management Office shared UI for employees | Services reusable; dedicated Management shell not shipped |
| Project team at create | Stub; post-create team panel full |

### 6.3 Explicitly absent (do not claim in sales)

- GPS / location tagging / geofencing  
- Realtime collaborative sync  
- CAD/BIM/sheet markups as first-class  
- SMS product channel  
- Public self-serve vendor/customer login  

### 6.4 Actionable benchmarking summary

**Where ProjectFlow is strong vs typical construction PM tools**

1. **Financial engine + UWM in one org** with hard boundaries (tasks don’t invent billing).  
2. **True dual surface** (Owner office + Employee grants) on shared services.  
3. **Honest stubs** (portal, push, bank feed, OCR) instead of fake “connected” UX.  
4. **External drives as document SoT** + registry links.  
5. **IL-oriented** tax/statutory/Sumit path and Hebrew-first UX.  

**Where competitors often win today**

1. Client/vendor portals  
2. Push/email task loops  
3. CAD/BIM / field GPS  
4. Planner polish (dependency UX, calendar depth, automation actions)  
5. Live bank + production e-invoicing completeness  
6. Realtime field↔office collaboration  

**Suggested close-the-gap priorities (product, not engineering mandate)**

| Priority | Item | Why |
|----------|------|-----|
| P0 | Complete Sumit test→prod policy path | Closes IL statutory story |
| P0 | Employee field-ops detail/CRUD for assigned punch | Closes שטח loop |
| P1 | Optional email for task/notification events | Collaboration without SMS |
| P1 | Un-stub automation actions + recurrence cron | UWM autonomy |
| P1 | Shared Management panels for high-grant employees | Office parity without portal |
| P2 | External portal ExternalPrincipal | High risk; keep admin-mediated until ready |
| P3 | Live bank feed / CAD-BIM | After import & PDF paths are product-complete |

---

## Appendix A — Inventory counts (codebase snapshot)

| Metric | Count |
|--------|------:|
| Domain modules (`src/modules`) | 67 |
| Office App `page.tsx` | ~195 |
| Employee App `page.tsx` | ~42 |
| API `route.ts` | ~18 |
| Primary mutation style | Server Actions |

## Appendix B — Analyst reading order

1. This report (overview + gaps)  
2. `PROJECTFLOW_CORE_MODULES_MATURITY_AUDIT_2026-09-22.md` (module × table × maturity)  
3. `PROJECTFLOW_FULL_END_TO_END_SYSTEM_MAP_2026-09-21.md` (identity, docs planes, journeys)  
4. `PROJECTFLOW_PLANNER_PLUS_CURRENT_STATE_MAP_2026-09-21.md` (UWM vs Planner competitors)  

---

*End of audit. Generated from repository inspection on 2026-09-22. No production SQL executed.*
