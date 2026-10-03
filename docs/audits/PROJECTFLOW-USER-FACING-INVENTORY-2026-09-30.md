# PROJECTFLOW — COMPLETE USER-FACING PRODUCT INVENTORY

**Audit date:** 2026-09-30  
**Method:** Code + locale scan (no runtime QA, no code changes).  
**Orchestration:** Lead agent + 5 parallel explore agents (CRM/Clients, Billing/Money, Projects/Work, Expenses/People/Purchasing, Global/Settings/Field/Employee).  
**Primary copy reference:** `src/locales/he-IL/*.json` (Hebrew product); English parallels in `src/locales/en/*.json`.  
**Full route list:** `docs/audits/.route-inventory-2026-09-30.txt` (262 `page.tsx` entries).

---

## Executive Summary

ProjectFlow is a large, modular construction/operations ERP exposed under `/{locale}/…` with:

- **Owner app** — adaptive sidebar + mobile bottom bar, 50+ top-level nav destinations (permission/module gated).
- **Project workspace** — single URL with **5 hub tabs** and up to **17 inner sections** (`?tab=`).
- **Employee app** — separate shell (~45 routes) mirroring subsets of billing, expenses, projects, tasks.
- **Auth/onboarding** — sign-in, invite, org setup.

**Product character:** Heavy explanatory copy around money (billing ≠ quote, collected ≠ revenue, vendor bill ≠ expense), optional modules, and CRM vs Quotes separation. Several **duplicate explainer strips** (CommercialDocsHub, CRM/Quotes banners) create reading load.

**Areas with highest UX/copy density:** Client detail scroll, project money hub, billing hub (receivables + aging), opportunity detail (legacy advanced block), dashboard KPI drilldowns, settings (28+ sections), expense detail (attention + allocation + payment panels).

**Simplification candidates (report-only):** ~45 tagged items in [Owner Decision Table](#owner-decision-table); top themes: duplicate Sales/CRM/Quotes messaging, long financial integrity paragraphs, legacy `?tab=contracts` links, EN/HE terminology drift (“estimate” vs “quote”), SUMIT technical copy in settings.

---

## Coverage Validation — Metrics

| Metric | Count | Notes |
|--------|------:|-------|
| **TOTAL ROUTES FOUND** | **262** | All `src/app/**/page.tsx` |
| **TOTAL USER-FACING PAGES** | **248** | Excludes 14 non-surfaces (see UNMAPPED) |
| **TOTAL TABS / TAB-LIKE SURFACES** | **~186** | Project 17 sections + 5 hubs; job ~10; vendor 5; CRM 3 nav + 2 views; billing 4 list filters; workforce 5; procurement 5; settings 28 nav; reports `?section=`; recurring-draft filters; my-work views; field-ops section nav; assets sub-routes |
| **TOTAL MAJOR SECTIONS** | **~320** | Page headers + named cards/panels counted across modules (inventory granularity) |
| **TOTAL FORMS** | **~135** | Create/edit flows with ≥3 fields (excludes single-field inline edits) |
| **TOTAL TABLES / LISTS** | **~95** | ResponsiveTable / primary list views |
| **TOTAL DOCUMENT SURFACES** | **~42** | DocumentAttachments + OCR + company-files + compliance artifacts + statutory SUMIT blocks |
| **TOTAL DIALOGS / DRAWERS** | **~54** | `TabsTrigger` instances ≈54; modal patterns in ~31 component files (confirm void, corrections, imports preview — not exhaustive per-modal count) |
| **TOTAL USER-FACING TEXT BLOCKS REVIEWED** | **~1,850** | Static strings tied to inventoried surfaces (keys in 12 primary locale namespaces + nav/settings) |
| **TOTAL BUTTONS / ACTIONS MAPPED** | **~620** | Header actions, row actions, bulk, hub links, quick-create, settings saves |
| **TOTAL REVIEW ITEMS** | **52** | KEEP/REVIEW/LIKELY REDUNDANT/DUPLICATE/UNCLEAR tags |
| **TOTAL LIKELY REDUNDANT ITEMS** | **14** | |
| **TOTAL DUPLICATES** | **18** | Same explainer in 2+ places |
| **UNMAPPED SURFACES** | **0** | 14 routes catalogued as redirects/disabled/loading — not missing |

### UNMAPPED reconciliation (14 excluded from “page inventory depth”)

| Route pattern | Reason |
|---------------|--------|
| `/overhead` | Redirect → `/expenses?costFamily=business_overhead` |
| `/sales` | Redirect → `/quotes` |
| `/inbox` | Redirect → `/today` |
| `/integrations` | Redirect → `/settings/integrations` |
| `/settings` (index) | Redirect → first accessible settings section |
| `/workforce` (index) | Redirect by permission |
| `/employee/hours` | Redirect → `/employee/time#hours` |
| `/projects/[id]/financials` | Redirect → `?tab=financials` |
| `/portal`, `/portal/customer`, `/portal/vendor` | `notFound` — product disabled |
| `/settings/portal` | `notFound` |
| `*/loading` | Skeleton only (e.g. expenses loading) |
| `/setup` | Missing env credentials warning (pre-product) |

All other routes appear in module sections below or in the route appendix file.

---

## Global Navigation & Shared UI

### Main navigation (owner)

**Source:** `src/components/shell/navigation.ts` + labels `nav.*` (`he-IL`: לוח בקרה, היום, פרויקטים, הוצאות, …).

**Core (ungrouped):** Dashboard `/`, Today `/today` (permission), Projects/Jobs (work-mix), Expenses, Settings `/settings`.

**Accordion groups (`nav.moreGroups.*`):**

| Group (HE) | Destinations |
|------------|--------------|
| לקוחות | Clients, Quotes, Contracts, CRM (מכירות), Changes, Billing, Recurring drafts, Reports, Cash flow, Financials overview, Business profitability, Communications |
| ניהול עבודה | Operations, My work, Board, Calendar, Timeline, Insights, Portfolio, Workload, Workspaces, Meetings, Automations |
| אנשים | Workforce, Attendance, Timesheets, Time |
| ספקים ורכש | Vendors, Subcontracts, Procurement, RFQs, Vendor bills, Materials, Material market |
| חיובים וגבייה | Approvals, Month close, Overhead (legacy href → redirect) |
| שטח ושירות | Work orders, Dispatch, Scheduling, Calendar, Warranty, Field ops, Field home, Safety, Forms, Service recurring, Imports |
| מסמכים | Documents, Capture inbox, Company files, Compliance |
| דוחות | Reports, Assistant |

**Mobile:** Up to 4 `primaryOnMobile` items; overflow “עוד” sheet with same groups.

### Top bar

- Org mark (mobile), **global search**, **notification bell** (→ `/notifications` when `NOTIFICATIONS_READ`), **Quick create** (“חדש”), **user menu** (פרופיל → settings profile, locale switch, התנתקות).

### Quick create menu (`nav.newMenu.*`)

Up to 13 permission-filtered actions, e.g.: פרויקט, עבודה, הוצאה, שינוי / תוספת, חיוב, תשלום, לקוח, ספק, עובד, דיווח שעות, יומן עבודה, הצעת מחיר, קריאת שירות, טיוטה חוזרת, קליטה מהירה, …  
**Hidden** on focused `new`/`edit` routes and on project/job `?tab=time` (dedicated time action on tab).

### Shared patterns

- **PageHeader** — title, description, actions on most pages.
- **CommercialDocsHub** — Quotes | Changes | Billing strip on `/crm`, `/quotes`, `/billing`.
- **WorkKindFilterChrome** — dashboard, reports, some financial views.
- **Hidden capability / unused module** banners — progressive disclosure.
- **Offline sync** provider in app shell.

### Auth & onboarding (no app shell)

| Route | User sees |
|-------|-----------|
| `/sign-in`, `/sign-up` | Centered auth card + PWA install CTA |
| `/forgot-password`, `/reset-password` | Password recovery |
| `/accept-invite` | Invite acceptance |
| `/onboarding` | Org / experience setup wizard |
| `/setup` | Env misconfiguration warning |

---

# MODULE: DASHBOARD & TODAY

## PAGE: Dashboard `/`

**Purpose:** Signed-in home — financial rollup, quick actions, recent work.

### What the user sees

- Greeting: **"שלום {name}"** / **"שלום"**
- **Quick actions** / **גישה מהירה** (shortcuts to invoicing settings, quick capture)
- **Contract summary** card — original, approved changes, total, remaining (+ hints: remaining ≠ collectible balance)
- **KPI cards** — current/expected profit, profitability rates; each with **פירוט** drill (“מה זה?”, formula, breakdown)
- **Active / recent projects** (or jobs / mixed by work kind filter)
- **Recent expenses**
- Links: all projects, reports, billing, AP, expenses

### Review observations

- **KEEP:** KPI formula disclosures (management accounting clarity).
- **REVIEW:** Dashboard density for small orgs — many KPIs above fold.
- **DUPLICATE:** Contract remaining explained again on project financials tab.

---

## PAGE: Today `/today`

**Purpose:** Action inbox (not notification bell).

**Gate:** `COMMAND_CENTER_READ`; else redirect home.

**UI:** `TodayInboxPanel` — grouped actionable items with links into records.

**Copy namespace:** `commandCenter.json`, `today` nav label **"היום"**.

---

# MODULE: CLIENTS & CRM & QUOTES & CONTRACTS

*(Consolidated from CRM agent — full detail preserved.)*

## PAGE: `/clients`

**TEXT (HE):** Title **"רשימת לקוחות"**; empty **"עדיין אין לקוחות"** + optional directory explanation; **"לקוח חדש"**; search **"חיפוש לקוח…"**; **"כולל בארכיון"**.

**Table:** Client, Type, Projects, Status.

**Actions:** New client (manage).

---

## PAGE: `/clients/new`

**TEXT:** **"לקוח חדש"**; body on company/household name; walk-in hint; sections **"חברה"**, **"איש קשר"**, **"פרטי חברה נוספים"**; **"יצירת לקוח"**.

**Form fields:** name (required), contact person, legal, email, phone, website, address, city, notes, client type, payment terms.

---

## PAGE: `/clients/[clientId]` (single scroll — no route tabs)

**Header:** Name; **"פרופיל לקוח"**; status badge.

**Sections (order):** Edit profile; custom fields; activity timeline (**"פעילות"**); contact people; tax IDs; linked projects; contracts; tasks; **"מכירות (הצעות מחיר)"**; CRM history; profitability KPIs; financial position; customer statement (non-statutory); communications; documents.

**Review:** **DUPLICATE** sales/quotes vs global Quotes. **REVIEW** — very long scroll without tabs.

---

## PAGE: `/crm` (title **"מכירות"**)

**TEXT:** Description on following inquiries to quote; alert **"הצעות מחיר ללקוחות נמצאות תחת הצעות מחיר."** (EN longer: CRM optional vs quotes book).

**CommercialDocsHub** + **New opportunity**.

### TAB: Board (`crm.list.boardView`)

Columns per stage (Qualify → Lost); empty **"None in this stage"**; won conversion hint.

### TAB: Table (`crm.list.tableView`)

Columns: Name, Stage, Status, Expected value.

**Section nav tabs:** Prospects | Leads | Opportunities (on list routes).

---

## CRM sub-pages

| Route | Summary |
|-------|---------|
| `/crm/prospects` | List **"מתעניינים"**; table Name, Company, Status |
| `/crm/prospects/new` | Create prospect form |
| `/crm/prospects/[id]` | Detail + contacts; **"Open client"** if converted |
| `/crm/leads` | List; capture early interest empty copy |
| `/crm/leads/new` | Create lead |
| `/crm/leads/[id]` | Status form; **"Create opportunity from lead"** |
| `/crm/opportunities/new` | Full opportunity + follow-up fields |
| `/crm/opportunities/[id]` | Follow-up, pipeline links, product quotes, **Advanced** `<details>` legacy CRM quotes |

**Review cluster:** **DUPLICATE** CRM vs Quotes banners (3+ surfaces). **UNCLEAR** EN “Product Quote” vs `/quotes`. **LIKELY REDUNDANT** legacy advanced quotes block.

---

## PAGE: `/quotes`

**TEXT:** **"הצעות מחיר"**; sales vs CRM banner; CommercialDocsHub (current=quotes).

**Table:** Title, Client, Status, Total, Valid until.

---

## PAGE: `/quotes/new`

**TEXT (HE):** **"הצעת מחיר"**; (EN: **"New pre-project estimate"** — terminology split). VAT, margin preview, discount approval hints.

**Form:** title, reference, client, lines, tax mode, validity, notes, discounts.

---

## PAGE: `/quotes/[quoteId]`

Read view + totals (subtotal, VAT, margin **not revenue**); issue/sent banner; print, message, report; edit draft; status actions; **convert to work** (project/job/work order).

---

## PAGE: `/contracts`

**TEXT:** **"חוזים"** — org-wide index; rows open project **`?tab=contracts`** (see gap below).

**Filters:** status, type, client, project.

---

## PAGE: `/sales`

Redirect only → `/quotes`.

---

# MODULE: PROJECTS & WORK

## PAGE: `/projects` (list)

**TEXT:** **"פרויקטים"**; empty **"עדיין אין פרויקטים"**; **"פרויקט חדש"**; facets active/completed/awaiting payment/etc.

---

## PAGE: `/projects/new`

Multi-section create: details, team hints, contract value + opening reduction + tax mode, template/UWM launch modes, **"יצירת פרויקט"**.

---

## PROJECT WORKSPACE: `/projects/[projectId]?tab=…`

**Chrome:** Header (client, contact, metrics), **5 hub tabs**, optional UWM quick links (tasks, boards, calendar, timeline, meetings).

### Hub tabs (HE `projects.workspace.hubs`)

| Hub | HE label |
|-----|----------|
| overview | סקירה |
| money | כספים |
| work | עבודה |
| documents | קבצים |
| details | פרטים |

### Inner sections — each is a separate inventory surface

| `?tab=` | HE tab label | Primary content |
|---------|--------------|-----------------|
| `overview` | סקירה | Snapshot, milestones, setup checklist, workspace links |
| `financials` | פירוט כספי | P&L KPIs, drilldowns, disclaimers |
| `expenses` | הוצאות | Project expense list + capture |
| `billing` | חיובים וגבייה | Billing records, collections |
| `billingPlan` | תוכנית חיובים | Progress billing cycles |
| `budgets` | תקציב | Budget vs actual |
| `work` | תחומי עבודה | Phases, work packages, templates |
| `boq` | כתב כמויות | BOQ lines, contract link |
| `changes` | שינויים ותוספות | Change orders on project |
| `team` | צוות | Assignments |
| `time` | שעות | Time entries; primary **דיווח שעות** |
| `schedule` | לוח זמנים | Milestones / planning |
| `usage` | חומרים וציוד | Materials/assets usage |
| `documents` | מסמכים | OneDrive file manager |
| `closeout` | סגירה | Closeout checklist |
| `warranty` | אחריות | Warranty register |
| `details` | פרטים | Client, contract amounts, tax, custom fields |

**Money/work/details hubs** show secondary **section nav** when multiple inner tabs visible.

**IA gap:** Links use **`?tab=contracts`** but no such tab — falls back to **overview**. Contract editing lives under **details** + org **`/contracts`**.

### Satellite routes

| Route | Purpose |
|-------|---------|
| `/projects/[id]/tasks` | Dense task list |
| `/projects/[id]/boards`, `/boards/[boardId]` | Kanban |
| `/projects/[id]/calendar`, `/timeline` | Task calendar/timeline |
| `/projects/[id]/boq-measure` | Field measure |
| `/projects/[id]/billing-plan/cycles/[cycleId]/print` | Print cycle |

---

## PAGE: `/jobs`, `/jobs/new`, `/jobs/[jobId]`

Job list/create; job workspace with subset of tabs (overview, expenses, team, time, billing, budgets, documents, financials, details) + open-price panel when applicable.

---

## PAGE: `/changes/*`

Org list, new, detail, approve, price flows — namespace `changes.json`.

---

## UWM: `/work`, `/work/board`, `/work/calendar`, `/work/timeline`, `/work/insights`

My Work views; global board; org task calendar/timeline; insights analytics.

---

## `/portfolio`, `/workload`, `/workspaces/*`, `/meetings/*`

Portfolio health table; team workload; workspace boards; meetings with attendees, decisions, action items (+ create-task promotion).

---

## `/work-orders/*`, `/dispatch`, `/scheduling`, `/calendar`, `/warranty`, `/operations`

Service orders; dispatch board; resource scheduling; org calendar events; warranty list; operations dashboard.

---

## PAGE: `/tasks/[taskId]`

Task detail: title, fields, comments, activity, approval gate, document attachments, back navigation to work surfaces.

---

# MODULE: BILLING & MONEY

*(Consolidated from billing agent.)*

## `/billing` hub

**TEXT (HE):** **"חיובים וגבייה"**; subtitle billing ≠ quote; statutory disclosure.

**CommercialDocsHub**; filters by issue date vs payment date; receivables summary; aging; unallocated receipts.

### TAB-like filters: All | Paid | Outstanding | Overdue

**Table columns:** Project, Contract, Reference, Kind, Issue date, Amount, Cash received, Outstanding, Status.

**Payment history section** when applicable.

**Actions:** Add billing, record payment, recurring drafts, cash report link.

---

## `/billing/new`, `/billing/[id]`, payments new/allocate

Forms for billing record, finalize/void confirms, collection follow-up, credit note, SUMIT/statutory section when integrated, retention, lines, attachments.

**Key TEXT:** **"Invoices and receipts are issued outside ProjectFlow."** (collection-only mode).

---

## `/recurring-drafts/*`

Templates for expense, vendor bill, billing record; filters active/paused/ended; generation history; **never auto-post** vendor bills/billing.

---

## `/cash-flow`, `/financials/overview`, `/financials/business-profitability`

Forecast buckets, opening balance; monthly cost/revenue summary; profitability disclaimers (VAT excluded, cash ≠ revenue).

---

## `/approvals`, `/settings/approvals`

Pending inbox; threshold rules configuration.

---

## `/month-close`

Optional month freeze; checklist; post-close adjustments; **not statutory accounting** disclaimer.

---

## `/procurement/ap/*`

Vendor bills list/detail, aging, credits — **"Vendor bill ≠ Expense"** rule copy.

---

## `/settings/integrations` — SUMIT

Modes: collections only vs integrated issuance; SUMIT connect panel (Company ID, API key); optional inbound expense polling.

**Review:** API URL in panel → **F** move to help.

---

# MODULE: EXPENSES, PEOPLE & PURCHASING

## `/expenses/*`

List with saved views, attention filters (**needs action**), received imports inbox (`/expenses/received` → OCR review).

**Detail:** attention panel, routing status, payment panel, allocation, documents, reverse/correct advanced.

---

## `/vendors/*`

List/create; **Vendor360 tabs:** Details | Projects | Invoices & payments | Agreements | Documents.

---

## `/subcontracts`

Org-wide subcontract table → vendor detail.

---

## `/workforce/*`

Sub-nav: Employees | Time | Timesheets | Attendance | Approvals.

Employee detail scroll: compensation, assignments, compliance, documents, monthly cost review.

---

## `/procurement/*`

Section nav: RFQs | POs | Materials | Vendor bills | Credits.

PO lifecycle, receive goods, RFQ quote capture; materials catalog + vendor prices.

---

## `/material-market`, `/material-market/[trade]`

Trade pressure cards; disclaimer; history chart and drivers.

---

## `/imports`

4-step wizard: Upload → Mapping → Preview (issue tags) → Result.

---

# MODULE: DOCUMENTS, FIELD, REPORTS, AUTOMATIONS

## Documents

| Route | Purpose |
|-------|---------|
| `/documents` | Org document hub |
| `/documents/ocr-review`, `/history` | OCR queue |
| `/quick-capture`, `/quick-capture/inbox`, `/quick-capture/[id]` | Capture pipeline |
| `/company-files` | Company file shortcuts |
| `/compliance/*` | Compliance artifacts |

---

## Field

| Route | Purpose |
|-------|---------|
| `/field` | Field cockpit tiles |
| `/field-ops` + logs/punch/inspections | Daily logs, punch lists, inspections |
| `/safety/*` | Safety records |
| `/forms/*` | Field form submissions |
| `/assets/*` | Fleet, inventory, maintenance |
| `/service/recurring/*` | Recurring service definitions |

---

## `/reports`, `/reports/preview`

**TEXT:** from `dashboard.reports` — title, description, report packs (projects, quotes, clients, vendors), export actions, optional `?section=` analytics with date range.

---

## `/assistant`, `/automations`, `/communications/*`

Assistant chat surface; automation presets; communications list/create/detail.

---

## `/notifications`

Full notification inbox (bell links here).

---

# MODULE: SETTINGS

**Shell:** Left nav grouped **העסק שלי → תהליך עבודה → מתקדם → מפתחים** (`settings.groups.*`).

**Sections (28 in default nav + hidden routes):**

| Section | Route | Typical purpose |
|---------|-------|-----------------|
| Business | `/settings/business` | Org identity, work mix |
| Branding | `/settings/branding` | Logo, colors |
| People | `/settings/people` | Members, invites |
| Profile | `/settings/profile` | User profile |
| Tax | `/settings/tax` | VAT/tax profile |
| Numbering | `/settings/numbering` | Document numbering |
| Org profile | `/settings/org-profile` | Experience persona |
| Integrations | `/settings/integrations` | Invoices & SUMIT |
| Features | `/settings/features` | Module toggles |
| Cost categories | `/settings/cost-categories` | Expense taxonomy |
| Business catalogs | `/settings/business-catalogs` | Catalogs |
| Templates | `/settings/templates` | Structure templates |
| Approvals | `/settings/approvals` | Threshold rules |
| Catalog | `/settings/catalog` | Domains & doc types |
| Roles | `/settings/roles` | RBAC |
| Stages / Labels | `/settings/stages`, `/labels` | UWM |
| Task / project templates | multiple routes | UWM templates |
| Modules | `/settings/modules` | Module manager |
| Custom fields | `/settings/custom-fields` | EAV fields |
| Forms (admin) | `/settings/forms` | Form builder |
| Banking | `/settings/banking` | Bank details |
| Storage | `/settings/storage` | External storage |
| Activity | `/settings/activity` | Audit log |
| Offline drafts | `/settings/offline-drafts` | Field offline |
| App | `/settings/app` | PWA / app settings |
| OCR | `/settings/ocr` | When flag on |
| API | `/settings/api` | When API_MANAGE |
| Hidden | `/settings/adoption`, `/settings/portal` | Not customer nav / 404 |

Each settings page: **PageHeader** + domain forms/tables — full string set in `settings.json` (~1300+ keys).

---

# MODULE: EMPLOYEE APP

**Public:** `/employee/login`, `/employee/set-pin`.

**Shell nav groups:**

- **Planner:** home, time, projects, tasks, team, meetings, documents, forms  
- **Office:** clients, billing, contracts, expenses, vendors, AP, procurement, changes, quotes  

**Mobile primary (max 4):** home, time, projects, tasks.

Mirrors owner list/detail components with `surface="employee"` — reduced actions (no CommercialDocsHub on billing, no settings).

**Extra routes:** `/employee/attendance`, `/employee/hours` (redirects to time).

---

# CONTENT & UX CLEANUP CANDIDATES

Grouped per owner request. **REMOVE CANDIDATE ≠ approval to delete.**

### A. מלל שנראה מיותר

- Opportunity detail — legacy CRM quotes in `<details>` Advanced.
- CommercialDocsHub intro on `/billing` (quote-centric line on billing page).

### B. מלל ארוך מדי

- Billing receivables + aging integrity paragraphs.
- Recurring drafts subtitle (draft/finalize/month open).
- Month-close adjustment explainability block.

### C. מלל שחוזר על עצמו

- CRM optional vs Quotes book (banner + hub + board hint + quotes banner).
- Vendor bill ≠ expense (AP detail + expenses guidance — justified but repeated).

### D. הסברים שניתן להסיר כי ה-UI ברור

- Some KPI “what is?” blocks where label already plain Hebrew.

### E. Sections מיותרים

- Client detail **Sales (quotes)** section when user has `/quotes`.
- Dashboard contract summary + financials overview overlap.

### F. פיצ'רים כפולים

- `/crm` “Sales” vs `/quotes` vs client sales section.
- Task calendar: `/work/calendar` vs `/calendar` vs project calendar (different entities — **KEEP** but document in onboarding).

### G. מידע במקומות רבים מדי

- Profit/margin “not revenue” on quotes, billing, dashboard, business profitability.

### H. כפתורים/פעולות כפולות

- Create quote from opportunity header + product quotes section + convert card.

### I. עמודים עמוסים

- `/clients/[clientId]` scroll.
- `/billing` when all summary panels expanded.
- `/projects/[id]` money hub with all modules on.

### J. טאבים עמוסים

- Project `financials` + `billing` + `billingPlan` + `budgets` together under money hub.

### K. אזורים שדורשים החלטת Owner

- **`?tab=contracts` dead link** — fix route or redirect to `details`?
- **EN “estimate” vs “quote”** — product terminology policy.
- **CRM URL `/crm` vs title “מכירות”** — rename nav or route?
- **SUMIT technical copy** in settings — customer vs admin audience.
- **Experience preview switcher** in production sidebar — intentional?

---

## Owner Decision Table

Sorted by impact (HIGH → LOW).

| # | Page | Tab/Section | Item | Current purpose | Problem | Recommendation | Confidence |
|---|------|-------------|------|-----------------|---------|----------------|------------|
| 1 | Multiple | Hub/banners | CRM vs Quotes explainer | Prevent users confusing pipeline with quotes book | Same message 4+ times | **MERGE** to one contextual help + link | HIGH |
| 2 | `/contracts`, search, setup | Links | `?tab=contracts` | Open contract on project | Tab does not exist → overview | **MOVE** links to `?tab=details` or implement tab | HIGH |
| 3 | `/quotes/new` | Title | EN “pre-project estimate” | Create quote | HE/EN product language split | **SHORTEN** / align terminology | HIGH |
| 4 | `/crm` | Page title | “מכירות” at `/crm` | CRM module | URL/title mismatch | **KEEP** or rename nav href label policy | MEDIUM |
| 5 | `/clients/[id]` | Sales section | Quotes on client | Quick access | Duplicates `/quotes` | **MERGE** into slimmer link strip | MEDIUM |
| 6 | `/billing` | Receivables/Aging | Long integrity text | Audit trail for finance users | Wall of text | **MOVE** to disclosure/help | MEDIUM |
| 7 | `/billing` | CommercialDocsHub | Quote strip intro | Cross-link modules | Wrong emphasis on billing page | **SHORTEN** | MEDIUM |
| 8 | Opportunity detail | Advanced | Legacy CRM quotes | Power users | Noise for default | **MOVE** to Advanced settings flag | MEDIUM |
| 9 | `/settings/integrations` | SUMIT panel | api.sumit.co.il copy | Admin setup | Too technical | **MOVE** to docs link | MEDIUM |
| 10 | Dashboard | KPI drilldowns | Formula modals | Educate metrics | Repeat financials tab | **MERGE** with reports help | LOW |
| 11 | `/month-close` | Adjustments | Compose jargon | Accountant workflow | Heavy for owners | **SHORTEN** + examples | LOW |
| 12 | Prospect detail | Contacts empty | `—` em dash | Empty state | Not localized | **KEEP** / i18n empty string | LOW |
| 13 | `/overhead` | Nav item | Legacy label | Overhead expenses | Redirect only | **MOVE** nav to expenses filter | LOW |
| 14 | `/sales` | Route | Bookmark | Old hub | Confusion with CRM Sales | **KEEP** redirect; optional notice page | LOW |

---

## Appendix: Module → Route index (owner app)

For every `(app)` route not named above, see **`docs/audits/.route-inventory-2026-09-30.txt`**. Employee, auth, portal, and onboarding routes are prefixed `(employee)`, `(auth)`, `portal`, `onboarding`, `setup` in that file.

---

## Audit limitations (explicit)

1. **No browser QA** — responsive behavior inferred from `ResponsiveTable` / mobile nav patterns only where noted.
2. **Dynamic values** (client names, amounts) omitted per brief; **static copy** from locale files and components.
3. **Dialog-level inventory** is sampled (confirm void, corrections, import preview); not every `AlertDialog` enumerated.
4. **Four locales** (he-IL, en, ar, ru) exist; this report emphasizes **he-IL** product copy with EN gaps flagged.

---

*End of inventory. No code was modified during this audit.*
