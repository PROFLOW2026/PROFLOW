# PROJECTFLOW — FULL PRODUCT UX / INFORMATION ARCHITECTURE REMAP

**Status:** COMPLETE (audit-only)  
**Date:** 2026-08-28  
**Authority:** Rendered UI (production owner org) + source code for conditional/hidden surfaces  
**Code / schema / migrations changed:** NONE  
**Evidence artifacts:** `_ux-remap-ui-snapshot.json`, `_owner-audit-ui.json`, `_ux-remap-scrape.mjs`  

---

## 1. Executive Summary

ProjectFlow’s **economic engine is sophisticated and largely coherent**; the **product surface is not**. The same owner questions—*What is my work worth? What did it cost? What is my profit? What needs attention?*—are answered repeatedly across **Home, Reports, Project Overview, Project Financials, Client, Vendor, Cash Flow, and Billing** with overlapping KPI grids, disclosure paragraphs, and drill-down cards.

The global shell exposes **~45 navigable destinations** (permissions × modules × persona × work mix), grouped into **9 accordion sections** on desktop, while mobile shows **4 primary tabs**. A single project workspace can surface **up to 17 tabs**, with **Overview alone hosting 15+ panels**—functionally a nested application.

**Verdict:** The product behaves like a **capability catalog with financial dashboards attached**, not like a **single owner narrative**. Remediation is **surface consolidation** (canonical homes, summaries elsewhere), not engine removal.

**Recommended direction:**

| Layer | Today (approx.) | Target |
|-------|-----------------|--------|
| Primary nav | 4 core + 9 groups + 30+ items | 5–6 top destinations + “More” |
| Project workspace | 17 tabs, Overview = mini-dashboard | 5 hubs: סקירה / כספים / עבודה / מסמכים / פרטים |
| Home | Multi-section KPI wall | 4 headline metrics + project table + attention |
| Expense UX | Lifecycle verbs exposed | Create → Save → Edit/Cancel; advanced chain collapsed |
| Settings | 22 routes / 4 groups | 3 owner-friendly groups |

---

## 2. Current Product Mental Model

### What the UI currently teaches users

1. **Everything is a destination** — Reports, Cash Flow, Billing, Changes, BOQ, AP, Month Close, Overhead each compete for attention.
2. **Financial truth is plural** — “Actual”, “Forecast”, “Commitments”, “Company Actual”, “Allocated general”, “Unallocated business” appear with long inclusion/exclusion footnotes.
3. **Project = system inside system** — Overview duplicates Financials; workspace nav links outward to half the product.
4. **Procurement vocabulary is primary** — AP, RFQ, commitments, recognition, GCM (as “shared/general costs”).
5. **Lifecycle complexity is visible** — Expense finalize/void/reverse/correct/reversal rows in lists.

### What owners actually need (product goal)

| # | Question | Intended canonical home (proposed) |
|---|----------|-----------------------------------|
| 1 | What work do I have? | Projects list + Home table |
| 2 | What is each project worth? | Project → כספים (contract/CCV) |
| 3 | What did each project cost? | Project → כספים (actual breakdown) |
| 4 | What created that cost? | Project → כספים drill-down → Expenses/Time/AP |
| 5 | Real profit / profitability? | Home rollup + Project → כספים |
| 6 | What needs attention? | Today + Home attention strip |
| 7 | Whole business picture? | Home (summary only) → Reports (export/deep) |

---

## 3. Current Navigation Map

### 3.1 Global shell (as experienced — owner org, Hebrew RTL, desktop)

**Observed (ACTUAL UI — production scrape 2026-08-28):**

| Zone | Content |
|------|---------|
| Sidebar core | לוח בקרה, היום, פרויקטים, עבודות, הוצאות |
| Accordion groups | לקוחות, אנשים, רכש וספקים, כסף, שטח, דוחות, מתקדם, הגדרות |
| Top bar | תצוגת חוויה (profile switcher), חיפוש ⌘K, חדש, התראות, משתמש |
| Mobile bottom | לוח בקרה, היום, פרויקטים, הוצאות (+ “עוד”) |
| Banners | Unused capability tip (e.g. Jobs hidden), hidden-module deep-link notice |

**Source:** `src/components/shell/navigation.ts` — `NAV_ITEMS` (45 entries), filtered by `visibleNavItems()`.

### 3.2 Navigation hierarchy (user experience tree)

```
ProjectFlow
├── לוח בקרה (/)
├── היום (/today)                    [permission: COMMAND_CENTER_READ]
├── פרויקטים (/projects)
├── עבודות (/jobs)                   [module: jobs]
├── הוצאות (/expenses)
├── ▾ לקוחות
│   ├── לקוחות, הצעות מחיר, חוזים, מכירות(CRM), שינויים, חיובים, טיוטות חוזרות, דוחות*, תזרים*
├── ▾ אנשים
│   ├── עובדים (/workforce/employees), שעות (/workforce/time)
├── ▾ רכש וספקים
│   ├── ספקים, קבלני משנה, רכש, RFQ, חומרים, …
├── ▾ כסף
│   ├── (expenses subgroup when accordion open) חיובים, הוצאות…
├── ▾ שטח
│   ├── field-ops, forms, safety, warranty, scheduling, calendar…
├── ▾ דוחות
│   └── /reports (+ PDF pack catalog)
├── ▾ מתקדם
│   ├── assets, compliance, approvals, month-close, overhead*, assistant, automations, vendor bills*
└── הגדרות (/settings → redirect to first section)
```

\* Placement varies by module flags and persona (`applyExperienceNavLayout`).

### 3.3 Multiple paths to same data

| Data | Paths |
|------|-------|
| Project financials | Home cards → Project Overview snapshot → Project Financials tab → Reports → PDF packs → Client detail |
| Expenses | Global list → Project Expenses tab → Overhead (legacy) → Vendor AP → Ops-finance linked |
| Billing | Global /billing → Project Billing tab → Billing Plan tab → Reports commercial |
| Vendors | /vendors → /subcontracts → Project contractors panel → AP |

### 3.4 Navigation findings

- **Too many first-level concepts** when all accordions expanded (~30+ links).
- **Neighbors hard to distinguish:** חיובים vs תזרים vs דוחות vs לוח בקרה (all money).
- **Technical terms exposed:** AP/חשבוניות ספק, RFQ, month close, overhead, recurring drafts.
- **Reports as destination** — behaves like a second home dashboard.
- **Project sub-features at business level:** Changes, BOQ, Billing Plan as global nav items duplicate project tabs.

---

## 4. Complete Surface Inventory

**Route census:** 162 `page.tsx` files under `src/app/[locale]`.  
**Rendered scrape:** 56 surfaces (global + 17 project tabs + detail pages + mobile home).  
**Legend:** 🟢 OBSERVED | 🟡 CODE-CONDITIONAL | 🔴 LEGACY/REDIRECT | ⚪ HIDDEN/PROFILE  

### 4.1 Global shell

| Route | Title (he-IL) | Primary question | Sections | Primary actions | Complexity |
|-------|---------------|------------------|----------|-----------------|------------|
| `/(app) layout` | — | Navigate | Sidebar, top bar, mobile nav | Quick create, search, notifications | MODERATE |
| `/` | שלום {name} | How is my business? | Business snapshot, active projects, KPI grid, attention, cash forecast link | New, manage capabilities, reports links | **HEAVY** 🟢 |
| `/today` | היום | What needs action now? | Inbox sections by domain | Open linked items | SIMPLE 🟢 (empty state observed) |
| `/sign-in` etc. | Auth | Sign in | Form | Submit | SIMPLE |

### 4.2 Projects domain

| Route | Title | Question | Key content | Cards | Actions | Dupes | Complexity |
|-------|-------|----------|-------------|-------|---------|-------|------------|
| `/projects` | פרויקטים | What projects exist? | Filterable table, contract value column | 1 table | New project, commercial report link | Home active list | MODERATE 🟢 |
| `/projects/new` | פרויקט חדש | Create project | Template, client, contract value, VAT, billing plan | 1 form | Create | — | MODERATE 🟢 |
| `/projects/[id]?tab=*` | PRJ-xxx | (tab-specific) | See §5 | 5–15/tab | Archive, PDF reports | Extensive | **VERY HEAVY** 🟢 |
| `/projects/[id]/financials` | — | — | **Redirects to ?tab=financials** | — | — | — | 🔴 |
| `/projects/[id]/boq-measure` | BOQ measure | Field measure | Mobile measure UI | 1 | Save readings | BOQ tab | MODERATE 🟡 |

### 4.3 Jobs / work orders / service

| Route | Title | Visibility | Notes |
|-------|-------|------------|-------|
| `/jobs`, `/jobs/[id]` | עבודות | 🟢 OBSERVED list; job uses reduced tabs | Shares project engine |
| `/work-orders`, `/work-orders/[id]` | קריאות שירות | 🟡 module: service | Financials panel embedded |
| `/dispatch`, `/service/recurring` | לוח שירות / שירות חוזר | 🟡 module: service | Ops-heavy |
| `/field` | שטח | 🟡 permissions OR | Mobile-first hub |

### 4.4 Expenses

| Route | Title | Question | Content | Complexity |
|-------|-------|----------|---------|------------|
| `/expenses` | הוצאות | All costs? | Filters, saved views, status column (נרשמה/מבוטל/Reversal) | MODERATE 🟢 |
| `/expenses/new` | הוצאה חדשה | Record cost | OCR link, form, VAT mode, classification | MODERATE 🟢 |
| `/expenses/[id]` | הוצאה | What is this cost? | Detail cards, edit form, attachments, correction history, promote vendor | **HEAVY** 🟢 |
| `/overhead` | הוצאות כלליות | Manage GCM? | **Hidden from nav** but reachable; duplicates expense lists split general/shared | **HEAVY** 🟢🔴 |

### 4.5 Vendors / procurement / AP

| Route | Title | Complexity | Notes |
|-------|-------|------------|-------|
| `/vendors` | ספקים | MODERATE 🟢 | List |
| `/vendors/[id]` | {vendor} | **VERY HEAVY** 🟢 | AP 360, subcontracts, performance, docs, custom fields |
| `/subcontracts` | קבלני משנה | MODERATE 🟡 | Overlaps vendor |
| `/procurement` | רכש | MODERATE 🟢 | PO list |
| `/procurement/ap` | חשבוניות ספק | HEAVY 🟢 | Bill lifecycle |
| `/procurement/ap/[billId]` | Bill detail | **VERY HEAVY** 🟡 | Edit recognized bill (new workflow) |
| `/procurement/rfqs`, `/materials` | RFQ / חומרים | MODERATE 🟡 | Weak nav discoverability |

### 4.6 Workforce

| Route | Title | Complexity | Dupes |
|-------|-------|------------|-------|
| `/workforce/employees` | עובדים | MODERATE 🟢 | Project Team tab |
| `/workforce/time` | שעות | MODERATE 🟢 | Project Time tab |
| `/workforce/timesheets`, `/attendance` | Timesheets / attendance | 🟡 | Heavy chrome vs project need |

### 4.7 Commercial / CRM

| Route | Notes |
|-------|-------|
| `/clients`, `/clients/[id]` | Client 360; billing overlap 🟢 |
| `/quotes`, `/contracts`, `/changes`, `/billing` | Parallel commercial spine 🟡 |
| `/crm/*` | Pre-project pipeline 🟡 |
| `/sales` | 🔴 Redirect — orphan |

### 4.8 Money / reports

| Route | Complexity | Notes |
|-------|------------|-------|
| `/reports` | **VERY HEAVY** 🟢 | Full org analytics + PDF catalog + sections |
| `/reports?section=commercial\|cost\|profitability` | **VERY HEAVY** 🟢 | Same page, focused section |
| `/cash-flow` | HEAVY 🟢 | Overlaps reports cash section |
| `/recurring-drafts` | MODERATE 🟢 | Cross-domain recurrence |
| `/month-close` | HEAVY 🟡 | Admin concept in primary advanced nav |

### 4.9 Field / docs / compliance

| Route | Complexity |
|-------|------------|
| `/documents`, `/documents/ocr-review` | MODERATE; OCR weak nav ⚪ |
| `/field-ops`, `/forms`, `/safety`, `/warranty` | MODERATE–HEAVY 🟡 |
| `/approvals` | MODERATE 🟡 |
| `/assistant`, `/automations` | 🟡 advanced |

### 4.10 Settings (22 destinations)

See §11. Index `/settings` redirects to first accessible section.

---

## 5. Project Workspace Deep Audit

### 5.1 Header (stable layout — all tabs)

**Observed on PRJ-00003 (פינס 16):**

| Element | Content |
|---------|---------|
| Title | Document number + project name |
| Meta | Status badge, client link, contact |
| Header metrics | Current contract value (+ optional original/managed opening) |
| Actions | Project PDF reports (status + financial summary), Archive |
| Tab bar | Up to 17 tabs (see below) |

**Tabs observed (ACTUAL — all rendered for owner org):**

`overview | financials | expenses | changes | boq | billing | billingPlan | budgets | team | time | schedule | work | documents | usage | closeout | warranty | details`

### 5.2 Overview panels (ACTUAL headings)

1. עבודה בשטח (field ops summary)  
2. טפסי שטח  
3. סביבת עבודה (cross-links to global modules)  
4. סיימו להקים את הפרויקט (setup checklist)  
5. Early warnings (conditional)  
6. תאריכים ואבני דרך  
7. סיכום חוזה  
8. תמונת הפרויקט / owner actual teaser  
9. ממה מורכבת העלות בפועל?  
10. סיכום כספי (financial snapshot)  
11. אבני דרך  
12. היסטוריית סכום חוזה  
13. חוזים  
14. סגירה / אחריות / הודעות / תזרים (next-gen strip)  
15. קבלנים וספקים + הסכמי קבלני משנה  

**Panel count:** 15+ | **Primary actions:** 10+ | **Complexity:** **VERY HEAVY**

### 5.3 Financials tab (ACTUAL headings)

1. כספים של הפרויקט  
2. Billing plan status strip  
3. ממה מורכבת העלות בפועל? (owner actual experience — **same component family as Overview**)  
4. איך מגיעים לעלות הצפויה בסיום  
5. איך מגיעים לרווח הצפוי  
6. חיוב וגבייה  
7. תזרים פרויקט - בפועל מול תחזית  
8. עלות ספקים בפרויקט זה  

**Complexity:** **VERY HEAVY**

### 5.4 Overview ↔ Financials overlap

| Concept | Overview | Financials |
|---------|----------|--------------|
| Current contract | ✅ סיכום חוזה | ✅ חוזה נוכחי |
| Actual breakdown | ✅ teaser | ✅ full |
| Profit / forecast | ✅ snapshot | ✅ KPI panel |
| Billing/collections | ✅ snapshot | ✅ full card |
| Cash flow | ✅ link/strip | ✅ full view |
| Vendor actual | ❌ | ✅ panel |

**Conclusion:** Overview is a **partial duplicate** of Financials, not a distinct “status” layer.

### 5.5 Project vs global Reports

Reports PDF packs + analytics repeat project-level commercial/cost/profit with org rollup — same metrics, broader scope.

### 5.6 “System inside system” assessment

**YES.** Project workspace exposes: 17 tabs, 15+ overview panels, workspace nav to ~15 external modules, PDF actions in header, field/forms/contractors on overview. An owner can live entirely inside one project and still see **three dashboard-grade surfaces** (Overview, Financials, Reports drill-down).

### 5.7 Proposed simplified project workspace

```
סקירה (Overview)
  ├── Status, dates, client, 3 KPIs (value | actual | profit)
  ├── Attention items (max 5)
  └── Links: "כל הכספים →", "עבודה →"

כספים (Financials) — CANONICAL for all money detail
  ├── Contract & changes
  ├── Actual breakdown (full)
  ├── Billing & collections
  ├── Forecast & commitments (collapsed by default)
  └── Exports

עבודה (Work hub — internal sub-nav)
  ├── תחומי עבודה / BOQ / שינויים
  ├── צוות / שעות / לוח זמנים
  ├── חומרים וציוד
  └── שטח (punch, inspections, daily logs)

מסמכים (Documents)
  ├── Files, contracts, forms submissions

פרטים (Details)
  ├── Project fields, closeout, warranty, archive
```

Engine tabs remain reachable via sub-nav — **not deleted**.

---

## 6. Dashboard Deep Audit

### 6.1 Current behavior (OBSERVED)

Home (`/he-IL`) presents:

- Greeting + capability tip + PWA CTA  
- Work kind filter (projects/jobs/all)  
- **תמונת מצב עסקית** section with:  
  - Active project cards (name + contract value only — **no actual/profit per project**)  
  - Quotes CTA  
  - Billing, collections, **duplicate outstanding**, commitments, forecast profit  
  - Month billing, month costs  
  - Cash forecast link, owner management view link  
- “יש דבר לבדיקה” completeness trigger  
- Attention section (conditional)  

### 6.2 Assessment

| Criterion | Verdict |
|-----------|---------|
| Owner understands business in seconds? | **NO** — too many KPIs, duplicate labels |
| Single story (value → cost → profit)? | **PARTIAL** — numbers present but buried among billing/collections |
| Simple project table? | **NO** — cards show value only |
| Attention + activity + quick actions? | **PARTIAL** — attention exists; competes with KPI wall |

### 6.3 Ideal vs actual

| Ideal | Actual |
|-------|--------|
| 4 headline metrics | 10+ KPI tiles across cards |
| Project table Value/Actual/Profit/% | Project cards with value only |
| Attention only | Attention + completeness + quotes + cash |
| No duplicate outstanding | “יתרה פתוחה” twice in scrape |

### 6.4 Proposed simplified dashboard

1. **Headline row:** Total work value | Total actual cost | Total profit | Profitability %  
2. **Projects table:** Name | Client | Value | Actual | Profit | % | Status  
3. **Needs attention** (max 5, link to Today)  
4. **Recent activity** (optional, collapsed)  
5. **Quick actions:** New expense, New project  
6. **Single link:** “דוחות וייצוא →” (not inline rollup)

---

## 7. Expenses Deep Audit

### 7.1 Flows mapped

| Flow | Route / component | User-visible steps |
|------|-------------------|-------------------|
| Normal create | `/expenses/new` | Form → save draft → finalize |
| OCR | `/documents/ocr-review` → draft | Scan → review → expense draft |
| Edit draft | `/expenses/[id]` | Inline form |
| Edit finalized | same | “Edit finalized” when month open |
| Finalize | ExpenseDetailActions | Confirm finalize |
| Void | ExpenseDetailActions | Confirm void |
| Reverse | ExpenseDetailActions | Creates reversal row |
| Correct | ExpenseCorrectDialog | Chain link |
| Correction history | ExpenseCorrectionHistory | Technical chain visible |
| Allocations | Overhead page + expense classification | Shared/general → project splits |
| Recurring | recurrence rule on expense + `/recurring-drafts` | Two surfaces |
| Vendor | vendor select + promote vendor panel | — |

### 7.2 Old vs new workflow coexistence

| Pattern | Old | New |
|---------|-----|-----|
| General costs | `/overhead` separate nav (hidden) | Unified `/expenses` list with cost section labels |
| Status display | Reversal rows in list with English “Reversal:” | Same — confusing in Hebrew UI |
| AP linkage | Vendor bills separate | Expense + AP both create actual — user may double-enter |
| Finalized edit | Month-close gated | Edit finalized expense (0071 editability) |

### 7.3 Concepts users should NOT need

- Finalize vs draft (use “שמירה” / “אישור לדוחות”)  
- Void vs reverse vs correct vs adjustment chain  
- Cost family / classification architecture  
- Allocated general vs direct vs unallocated business (show “פרויקט / כללי”)  
- VAT mode internals  

### 7.4 Proposed simplified expense UX

**Create model:** supplier, category, destination (project/general), amount, VAT, date, description, document → **Save**

**Subsequent:** Edit | Cancel/delete (when allowed)

**Advanced drawer:** correction history, reversal chain, allocation detail, recurrence

---

## 8. Vendors / AP / Procurement Audit

### 8.1 Surfaces

- **Vendor list/detail** — engagements, subcontracts, AP 360, performance, documents  
- **Subcontracts** — global list duplicates vendor agreements  
- **Procurement** — PO list, RFQ (weak nav), materials catalog  
- **AP** — bills, credits, aging; promoted from advanced → purchasing when procurement on  
- **Project** — contractors panel on Overview  

### 8.2 Duplication

Vendor financial story appears on: Vendor detail AP 360, Project vendor actual panel, Reports subcontract cash PDF, AP bill detail, Expenses by vendor.

### 8.3 Recommendations

- **Canonical vendor money home:** Vendor detail → Invoices & payments  
- **Project view:** Summary + link to vendor  
- **Primary nav:** “Suppliers” under Purchasing — not AP jargon at top level  

---

## 9. Workforce Audit

| Surface | Purpose | vs Project |
|---------|---------|------------|
| /workforce/employees | HR master | Project Team tab duplicates assignments |
| /workforce/time | Log/approve time | Project Time tab |
| Timesheets / attendance | Payroll-style | Heavy for owner persona |
| Labor actual in financials | Cost engine | Shown in project financials + reports |

**Recommendation:** People hub for **master data**; project **Work** hub for **project-scoped** time/team. Hide attendance/timesheets from default owner nav.

---

## 10. Reports Audit

### 10.1 Structure (OBSERVED + code)

1. **Report packs** — PDF catalog (20+ report types)  
2. **Work kind filter** — projects/jobs/all  
3. **Section focus** — commercial | cash | cost | profitability | management  
4. **Analytics grid** — mirrors Home KPIs at org level with inclusion/exclusion lists  
5. **Export actions** — CSV/Excel top menu  

### 10.2 vs other surfaces

| Metric group | Also on |
|--------------|---------|
| Commercial rollup | Home, Reports, Projects list |
| Cost / actual | Home forecast card, Reports cost section, Project financials |
| Profitability | Home profit KPI, Reports profitability, Project KPI |
| Cash | Home link, /cash-flow, Reports cash, Project cash flow |
| Management | Reports management section, Today items |

**Verdict:** Reports is a **second full dashboard**, not merely export.

### 10.3 Recommendation

Reports → **“Exports & deep analysis”** — default collapsed sections; Home/Project remain daily drivers.

---

## 11. Settings Audit

### 11.1 Complete tree (`SETTINGS_SECTIONS`)

| Group | Key | Route | Owner need | Frequency | Type |
|-------|-----|-------|------------|-----------|------|
| basic | business | /settings/business | Legal identity | Once | Business setup |
| basic | branding | /settings/branding | Logo/colors | Rare | Personalization |
| basic | people | /settings/people | Invite users | Occasional | Permissions |
| basic | profile | /settings/profile | My profile | Rare | Personal |
| basic | tax | /settings/tax | VAT rules | Once | Business setup |
| basic | numbering | /settings/numbering | Doc numbers | Once | Business setup |
| basic | app | /settings/app | Locale/prefs | Rare | Personalization |
| business | approvals | /settings/approvals | Workflow gates | Setup | Workflow |
| business | features | /settings/features | Module toggles | Setup | **Implementation IA** |
| business | costCategories | /settings/cost-categories | Expense categories | Setup | Workflow |
| business | businessCatalogs | /settings/business-catalogs | Catalogs | Setup | Duplicates catalog |
| business | templates | /settings/templates | Project templates | Setup | Workflow |
| business | catalog | /settings/catalog | Legacy catalog | Setup | **Duplicate** |
| business | roles | /settings/roles | RBAC | Setup | Permissions |
| advanced | customFields | /settings/custom-fields | Extensions | Rare | Advanced |
| advanced | forms | /settings/forms | Form builder | Rare | Advanced |
| advanced | activity | /settings/activity | Audit log | Rare | Admin |
| advanced | offlineDrafts | /settings/offline-drafts | PWA drafts | Rare | Advanced |
| advanced | banking | /settings/banking | Bank feeds | Rare | Advanced |
| advanced | integrations | /settings/integrations | Connectors | Rare | Advanced |
| advanced | ocr | /settings/ocr | OCR config | ⚪ flag-gated | Advanced |
| developers | api | /settings/api | API keys | Rare | Developer |
| developers | portal | /settings/portal | ⚪ hidden | — | Developer |

**Mapped destinations:** 22 (20 nav-visible typical owner; portal/ocr hidden)

### 11.2 Fragmentation issues

- **costCategories** vs **businessCatalogs** vs **catalog** — three catalog UIs  
- **features** exposes engine module keys  
- **integrations** vs top-level `/integrations` redirect  

### 11.3 Proposed settings hierarchy

```
העסק שלי (Business)
  business, branding, tax, numbering, people, roles

איך עובדים (Workflow)
  features (renamed: "מה מוצג"), cost categories, templates, approvals

מתקדם (Advanced)
  custom fields, forms, banking, integrations, activity, offline

מפתחים (Developers)
  api, portal (internal)
```

---

## 12. Duplication Matrix

| Concept | Surfaces (all) | CANONICAL HOME | SECONDARY SUMMARY | REMOVE/COLLAPSE |
|---------|----------------|----------------|-------------------|-----------------|
| Project contract value | Home cards, Projects list, Project header, Overview contract, Financials, Reports commercial, Client | Project → כספים | Home table column, Projects list | Overview full contract history |
| Original/current contract | Overview, Financials, Reports, PDF | Project → כספים | Header metric (current only) | Home |
| Project Actual | Overview teaser, Financials, Reports cost, PDF | Project → כספים | Home total only | Overview breakdown |
| Direct Actual | Financials breakdown, Reports | Project → כספים drill | — | Dashboard |
| Allocated general cost | Financials, Reports, expense labels | Project → כספים | — | Multiple KPI tiles |
| Full Actual | Same as project actual rollup | Project → כספים | Home one number | Reports section duplicate |
| Estimated final cost | Financials forecast, Reports, Home | Project → כספים | — | Home forecast grid |
| Commitments | Home, Reports, Financials | Project → כספים (collapsed) | — | Home |
| Expected remaining | Financials ETC form, Reports | Project → כספים | — | Home |
| Project profit | Overview snapshot, Financials, Reports, Home | Project → כספים | Home total | Overview snapshot |
| Profitability % | Reports, (partial Home) | Home + Project header | — | Reports if on Home |
| Company Actual | Home, Reports | Reports (deep) | Home **one** number | Home multi-KPI |
| Company profit | Home, Reports | Reports (deep) | Home headline | Home duplicate tiles |
| Billing | Home, Billing module, Project tabs, Client, Reports | Project → כספים / Billing tab | Home total billed | Home duplicate outstanding |
| Collections | Same | Project → כספים | Home received | — |
| Outstanding | Home (×2), Billing, Reports AR | Billing / Project | One KPI Home | Duplicate card |
| Cash flow | Home link, /cash-flow, Reports, Project | /cash-flow OR Reports | Home link only | Two full pages |
| Employees/labor | Workforce, Project team/time, Reports | Workforce master | Project team | — |
| Vendors | Vendors, Subcontracts, Project contractors, AP | Vendor detail | Project list | Subcontracts nav |
| Materials | Materials, Project usage, PO | Project → Work | — | — |
| Expenses | Expenses, Overhead, Project tab | /expenses | Project tab | Overhead page |
| Schedule/milestones | Overview, Schedule tab, Details | Schedule tab | Overview dates one-liner | Overview milestones panel |
| Documents | Documents, Project tab, entity panels | Project → מסמכים | — | — |
| Warnings/attention | Home, Today, Overview warnings | **Today** | Home strip (5 max) | Overview warnings |
| Recent activity | Home (limited), Activity settings | Today | — | — |

**Duplicate concept groups:** 22

---

## 13. Old-vs-New UX Collision List

| # | Collision | Evidence |
|---|-----------|----------|
| 1 | Unified expenses vs `/overhead` | Hidden nav + duplicate lists 🟢 |
| 2 | Project financials route vs tab | `/financials` redirects 🔴 |
| 3 | `/sales` vs CRM vs quotes | sales redirect 🟡 |
| 4 | Global billing vs project billing tabs | Both full UI |
| 5 | Recurring drafts nav vs expense recurrence | Two entry points |
| 6 | Jobs + Projects both primary | Work mix tip to hide jobs 🟢 |
| 7 | Experience preview switcher in prod shell | Dev tool visible to owner 🟢 |
| 8 | English “Reversal:” in Hebrew expense list | 🟢 |
| 9 | Workspace nav vs global nav | Same destinations twice |
| 10 | BOQ global vs project BOQ tab | — |
| 11 | Field home vs field-ops | Two field entry points |
| 12 | Integrations route vs settings | Redirect |
| 13 | Notifications page vs bell | Orphan `/notifications` 🟡 |
| 14 | AP edit on bill vs expense correction | Parallel correction UX (new) |
| 15 | Dashboard cards config vs static reports | Persona cards vs full analytics |

**Collisions found:** 15

---

## 14. Engine-vs-User-Surface Matrix

| Engine capability | User-facing concept (friendly) | Primary UI today? | Should be primary? |
|-------------------|----------------------------------|-------------------|---------------------|
| GCM / general cost month | הוצאות כלליות של העסק | Overhead (hidden), expense labels | **No** — inside expenses |
| Allocation atoms | הקצאה לפרויקטים | Overhead allocations, expense detail | **No** — advanced |
| AP recognition | חשבונית ספק | /procurement/ap | Purchasing group only |
| FIFO inventory costing | עלות מלאי | Inventory detail | **No** |
| Committed costs (PO) | התחייבויות רכש | Home, Reports, Financials | Summary only |
| Contract value events | סכום חוזה / שינויים | Many surfaces | Project כספים |
| CCV / commercial compose | ערך מסחרי | Reports, Overview | Project כספים |
| BOQ progress billing | התקדמות / כתב כמויות | BOQ tab | Project → Work |
| Billing records | חיובים | Global + tab | Both OK; link together |
| Month close | סגירת חודש | /month-close nav | **No** — settings advanced |
| Cost family / classification | סוג עלות | Expense form | Simple category |
| VAT mode | מע״מ | Expense form selector | Simple toggle |
| Recurrence rules | הוצאה חוזרת | Expense + recurring-drafts | One surface |
| Time entries → labor actual | עלות עבודה | Financials breakdown | Project כספים |
| Subcontract agreements | הסכם קבלן | Vendor + subcontracts nav | Vendor detail |
| Vendor credits | זיכוי ספק | AP credits (weak nav) | AP area |
| Retention | עיכבון | Billing/AP internals | Billing context |
| OCR ingestion | סריקת חשבונית | OCR review | Expense create flow |
| Experience persona | תצוגת חוויה | Top bar switcher | **No** (dev only) |
| Work mix | projects vs jobs | Nav prominence | Settings |
| Forecast / ETC | תחזית עלות | Financials + Reports | Collapsed default |
| Data confidence partials | “חלקי” coverage | KPI footers everywhere | One help doc |
| RLS / permissions | — | Hidden | Never |
| Webhooks / API | API | settings/api | Developers |
| Portal | פורטל | OFF | Hidden |
| Automations | כללים | /automations | Advanced |
| Command center | היום | /today | **Yes** |
| Report packs PDF | דוחות PDF | /reports top | Reports/export |
| Project experience profile | — | Tab visibility | Settings |

---

## 15. Cognitive Load Findings

1. **Label overload** — Every KPI carries basis + inclusion + exclusion microcopy (Reports worst).  
2. **Duplicate numeracy** — Same ₪ amounts on Home and Reports without “as of” sync cue.  
3. **Tab explosion** — 17 project tabs exceed Miller threshold; users rely on muscle memory.  
4. **Accordion hiding** — Features exist but discovery fails (RFQ, credits, OCR).  
5. **English leakage** — Reversal, Vendor 360, PDF filenames.  
6. **Permission-empty slices** — KPIs show “unavailable” vs hidden — good pattern but adds noise on Home.  
7. **Workspace outward links** — Project Overview links to 15+ global routes — breaks mental model.  
8. **Status vocabulary** — נרשמה/מבוטל/finalized/Reversal mixed Hebrew/English.  
9. **Three dashboards** — Home, Reports, Project Overview.  
10. **Setup checklist on Overview** — Onboarding mixed with operational view.

---

## 16. Canonical Home Recommendations

| Information | Canonical home | Elsewhere |
|-------------|----------------|-----------|
| Org profit headline | Home (1 tile) | Reports deep |
| Org actual cost | Home (1 tile) | Reports cost section |
| Project profit detail | Project → כספים | PDF export |
| Actual breakdown | Project → כספים | — |
| Billing status | Project → כספים / Billing | Client summary |
| Expense lines | /expenses | Project expenses tab (filtered) |
| Vendor AP | Vendor detail | Project vendor panel (summary) |
| Attention items | /today | Home max 5 |
| PDF exports | /reports packs | Project header (2 key PDFs only) |
| Module configuration | Settings → Workflow | — |

---

## 17. Proposed Simplified Information Architecture

```
[Primary]
  Dashboard
  Today
  Projects  (+ Jobs/WO inside filter or sub-type)
  Expenses
  Clients   (optional primary by persona)

[More]
  People (employees, time)
  Purchasing (suppliers, POs, invoices)
  Billing & Collections (AR hub)
  Documents
  Field & Service
  Reports & Exports
  Settings

[Not primary — engine/admin]
  Month close, GCM/overhead page, RFQ, inventory FIFO, API, portal,
  automations, CRM pipeline, compliance, assets fleet, assistant
```

---

## 18. Proposed Simplified Project Workspace

See §5.7 — **5 hubs** mapping 17 tabs:

| Hub | Absorbs tabs |
|-----|--------------|
| סקירה | overview (slim) |
| כספים | financials, billing, billingPlan, budgets, expenses (link) |
| עבודה | work, boq, changes, team, time, schedule, usage, field |
| מסמכים | documents, forms outputs |
| פרטים | details, closeout, warranty |

---

## 19. Proposed Simplified Dashboard

See §6.4 — headline metrics + project table + attention + quick actions.

---

## 20. Proposed Simplified Expense UX

See §7.4 — unified create/save; advanced lifecycle in drawer; retire `/overhead` surface.

---

## 21. Proposed Simplified Settings

See §11.3 — 3 owner groups + developers.

---

## 22. Keep / Move / Collapse / Hide / Remove Matrix

| Surface | Action |
|---------|--------|
| Home KPI wall | **Collapse** to 4 metrics + table |
| Reports analytics sections | **Move** behind export intent; default collapsed |
| Project Overview financial panels | **Collapse** to 3 numbers + link |
| Project Overview field/forms/contractors | **Move** to Work hub |
| Project workspace nav | **Remove** from overview (use hubs) |
| Overhead page | **Remove** — redirect to expenses filtered |
| /projects/.../financials | **Keep** redirect |
| Today | **Keep** — promote attention canonical |
| Experience preview switcher | **Hide** from owner prod |
| Month close | **Move** to settings advanced |
| AP in advanced nav | **Move** to purchasing |
| Recurring drafts top nav | **Move** into expenses/billing |
| CRM top nav | **Move** to More / pre-project |
| Cash flow page | **Collapse** into reports or home link |
| Vendor 360 panels | **Keep** but tabbed inside vendor |
| BOQ measure route | **Keep** (field tool) |
| Jobs separate nav | **Collapse** into projects filter for project-first orgs |
| Duplicate outstanding on Home | **Remove** duplicate card |
| English Reversal rows | **Hide** — Hebrew “תיקון/ביטול” |

---

## 23. Functional Findings — Not Part of UX Remap

| # | Finding | Location | Not fixed |
|---|---------|----------|-----------|
| 1 | Owner scrape linked “first project link” to `/projects/new` in older audit — fixed in 2026-08-28 scrape (real project ID) | `_owner-audit-ui.json` vs `_ux-remap-ui-snapshot.json` | Recorded only |
| 2 | Expense list shows correction/reversal chains inline — may inflate “expense count” perception | /expenses 🟢 | UX only |
| 3 | Dashboard “יתרה פתוחה” duplicated in DOM | Home 🟢 | UX only |
| 4 | Dual Actual risk (Expense + AP) documented in system remap | engine | Not re-verified here |

---

## 24. Implementation Risks

1. **Permission matrices** — collapsing nav must not hide required actions for roles.  
2. **Deep links** — bookmarks to tabs/routes must redirect after IA change.  
3. **Persona/work mix** — service-first orgs need Jobs/WO visible.  
4. **Hebrew copy debt** — consolidating KPIs requires careful financial glossary.  
5. **Overview slimming** — owners who relied on Overview as financial dashboard will need migration messaging.  
6. **Reports downgrade** — finance-heavy users may resist hiding analytics.  
7. **Overhead retirement** — allocations workflow must remain reachable.  
8. **E2E tests** — many assert current nav labels and report headings.  
9. **No engine change** — surface-only; numbers must stay identical.  
10. **Mobile** — hub sub-nav must work on small screens.

---

## 25. Final Owner Decision Map

| Decision | Options | Audit recommendation |
|----------|---------|----------------------|
| D1 Primary nav count | 4 vs 6 vs status quo | **6** (Dashboard, Today, Projects, Expenses, Clients, More) |
| D2 Project tabs | 17 vs 5 hubs | **5 hubs** |
| D3 Home vs Reports | Merge vs separate | **Separate** — Home daily, Reports export/deep |
| D4 Overhead page | Keep vs merge | **Merge** into expenses |
| D5 AP nav placement | Advanced vs Purchasing | **Purchasing** |
| D6 Experience preview | Owner-visible vs dev-only | **Dev-only** |
| D7 Expense lifecycle UI | Exposed vs advanced drawer | **Drawer** |
| D8 Settings catalogs | 3 pages vs 1 | **Consolidate** to cost categories + one catalog |
| D9 CRM/sales | Primary vs pre-project | **Pre-project / More** |
| D10 Canonical attention | Home vs Today | **Today** with Home strip |

---

## Appendix A — Inspection methodology

- Playwright scrape: 56 rendered surfaces, Hebrew RTL, 1280×900 + mobile home 390px  
- Code review: navigation.ts, project-tab-order.ts, settings access, dashboard/report/financial components  
- Distinction: 🟢 observed in owner production org; 🟡 conditional on modules/permissions; 🔴 legacy redirect  

## Appendix B — VERY HEAVY pages (8)

1. `/reports` (+ section variants)  
2. `/projects/[id]?tab=overview`  
3. `/projects/[id]?tab=financials`  
4. `/vendors/[id]`  
5. `/procurement/ap/[billId]` (code; bill edit panel)  
6. `/overhead`  
7. `/` Home (KPI density)  
8. `/clients/[id]` (code — client 360 pattern)  

---

*End of audit.*
