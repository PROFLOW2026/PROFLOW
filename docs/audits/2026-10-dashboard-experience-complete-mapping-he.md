# ProjectFlow — מיפוי מלא: חוויית דשבורד ותצוגות (READ-ONLY)

**תאריך:** 2026-10-13  
**המשך ל:** `2026-10-display-profile-view-mode-audit-he.md`  
**נתוני עזר (מחולל מהקוד):** `_dashboard-mapping-data.json`  
**אין שינוי קוד / SQL / Production / commit**

---

## קדימון: מה בודקים

- **11 מצבי Experience Preview** (בורר Owner) + **`actual`** = פרופיל הארגון האמיתי.
- **20 מפתחות `BusinessProfileKey`** בקוד (`business-profiles.ts`) — לא 22; אין מפתחות נוספים ברepo.
- **שני layouts דשבורד:** `HomeDashboardOwnerView` vs **Card** (`home-dashboard-content.tsx` → `renderCard`).
- **מסלול רינדור:** `page.tsx` → `getHomeDashboard` → `HomeDashboardContent` → Owner **או** Card.

**מקרא סיווג:**  
ALWAYS VISIBLE | CONDITIONAL ON DATA | PERMISSION-GATED | MODULE-GATED | PERSONA-HIDDEN (Today בלבד) | LAYOUT-REPLACED | NOT IMPLEMENTED

---

# חלק א — שלד משותף (כל 11 המצבים, ארגון לא «ריק»)

סדר מסך מלמעלה (מחוץ ל־AppShell):

| # | רכיב (עברית) | קובץ | הופעה | תלות |
|---|--------------|------|--------|------|
| 1 | כותרת «שלום {שם}» / ללא שם | `page.tsx` → `PageHeader` | ALWAYS | — |
| 2 | פס «קבצי החברה» (Quick access bar) | `dashboard-quick-access-bar.tsx` | ALWAYS | — |
| 3 | טיפ יכולות לא מנוצלות | `DashboardCapabilityTip` | **NOT IMPLEMENTED** | `DASHBOARD_UNUSED_CAPABILITY_TIP_VISIBLE=false` |
| 4 | CTA התקנת PWA | `PwaInstallCta` | ALWAYS | — |
| 5 | מסנן **הכל / פרויקטים / עבודות** | `WorkKindFilterChrome` | ALWAYS | משנה rollup ב־`getHomeDashboard` via `?workKind=` |
| 6 | גוף דשבורד | `HomeDashboardContent` | Owner **או** Card | ראו חלק ב/ג |

**AppShell (נפרד):** Sidebar, Mobile nav, **כפתור +** (`QuickCreateDeferred`), בורר «תצוגה לבדיקה» (Owner בלבד).

**כפתור +:** `buildQuickCreateActions` — **אותה רשימה קנונית** לכל persona; `_persona` / `quickCreateEmphasis` **לא משנים** פריטים (רק הרשאות + מודולים). נתיב: `/quick-capture`, `/projects/new`, … — `quick-create-actions.ts`.

**ארגון «ריק» (`isBrandNew`):** במקום Owner/Card — `EmptyState` + כפתורי יצירה (פרויקט/עבודה/קריאה לפי `emptyStartKind`) — `home-dashboard-content.tsx` שורות 95–148.

---

# חלק ב — Owner Dashboard (רשימת רכיבים מלאה, לפי סדר רינדור)

**מי נכנס לכאן:** `shouldUseOwnerDashboard(data)=true` — persona ∈ {project_contractor, renovation, architecture, consulting, mixed} **ו** `preferServiceSurface=false`.  
**קומפוננטה:** `home-dashboard-owner-view.tsx`.

| # | שם בעברית | מה מציג | Loader / נתונים | לחיצה | הופעה |
|---|-----------|---------|-----------------|-------|--------|
| 1 | התראת שעות ממתינות | שעות לא מאושרות | `pendingTime` — `getHomeDashboard` | לאישור שעות | CONDITIONAL + PERMISSION workforce |
| 2 | התאמת שכר / עבודה | פערי reconciliation | `laborReconciliation` | קישורים workforce | CONDITIONAL |
| 3 | **קיצורי דרך** (עד 8) | מה שהוגדר בהגדרות | `quickAccessShortcuts` — `dashboard-quick-access.ts` | נתיבים לפי קטalog | CONDITIONAL (ריק אם אין) + PERMISSION/MODULE |
| 4 | **כרטיסי תשומת לב** (חיובים/שינויים) | ספירות attention | `attention` — rollup | `/billing`, `/changes` | CONDITIONAL ON DATA |
| 5 | «חסר נתון» / «לבדיקה» | modal completeness | `missingDataItems` | פעולות מתוך modal | CONDITIONAL |
| 6 | **שורת סיכום חוזים** | חוזים פעילים / חיוב | `contractSummary` | פירוט חוזה | CONDITIONAL ON DATA |
| 7 | **שווי פרויקטים** | `totalContractValue` | rollup | פופאover KPI | CONDITIONAL (אם אין contractSummary) |
| 8 | **עלות מוכרת עד היום** | actual cost | `totalActualCost` / forecast | פופאover | PERMISSION financials |
| 9 | **רווח נוכחי** | actual profit | `actualProfitTotal` | פופאover | PERMISSION profit |
| 10 | **שיעור רווחיות** | % | `profitabilityPercent` | פופאover | PERMISSION profit |
| 11 | **ביצוע חברה (Company actual)** | KPI | `forecast.companyActual` | פופאover | CONDITIONAL ON DATA |
| 12 | **מזומן ששולם (עסק)** | business cash paid | `businessCashPosition` | פופאover | CONDITIONAL + financials |
| 13 | **יתרה לתשלום (עסק)** | outstanding payable | idem | פופאover | CONDITIONAL |
| 14 | **תזרים צפוי** (90 יום) | cash forecast | `cashForecast` — `loadOwnerCashForecast` | `/cash-flow` | CONDITIONAL + `canReadFinancials` |
| 15 | **חוב לספקים (AP)** | ap outstanding | `apOutstanding` | `/procurement/ap?outstanding=1` | CONDITIONAL |
| 16 | **מקטעי תחזית/חיוב/מזומן חודשי** | RestoredSections | `HomeDashboardRestoredSections` | KPI cards + drilldowns | CONDITIONAL (forecast/billing/month) |
| 16א | בתוך Restored: **תחזית עלות**, **צפוי לסיום**, **רווח צפוי**, **התחייבויות** | forecast grid | `data.forecast` | financial drilldowns | CONDITIONAL |
| 16ב | **חיוב / שולם / יתרה לגבייה** | billing KPIs | `billing` + `showBilling` | billing pages | PERMISSION BILLING_READ |
| 16ג | **בוחר חודש + תזרים החודש** | month cash | `organizationSummary` | `/cash-flow`, month links | CONDITIONAL |
| 17 | **פרויקטים אחרונים** | רשימת cards | `recentProjects` | `/projects/{id}` | CONDITIONAL ON DATA |
| 18 | **טבלת רווחיות לפי פרויקט** | 7 עמודות | `projectTableRows` | פרויקט | CONDITIONAL ON DATA |
| 19 | הודעה «אין שורות כספיות» | טקסט | active count | `/projects` | CONDITIONAL |
| 20 | **פעולות מהירות** | הוצאה / פרויקט | permissions | `/expenses/new`, `/projects/new` | PERMISSION-GATED |
| 21 | קישורים **דוחות** + **ניהול** | טקסט | — | `/reports`, `/reports?section=management` | ALWAYS (בתוך Owner body) |

**מה Owner לא משתמש ב־`dashboardCards`:** רשימת הכרטיסים ב־`PERSONA_DASHBOARD_CARDS` **לא** שולטת ב־Owner — **LAYOUT-REPLACED**.

---

# חלק ג — Card Dashboard (רשימת רכיבים מלאה)

**מי:** `shouldUseOwnerDashboard=false`.  
**סדר:** `home-dashboard-content.tsx` שורות 785+.

| # | רכיב | תנאי |
|---|------|------|
| 1 | כותרת **«תמונת מצב עסקית»** + missing trigger | אם persona כולל כרטיס כסף (contractValue/profit/forecast/commitments/billing/collections) |
| 2–5 | כמו Owner: pending time, labor, shortcuts, attention | זהה |
| 6 | **לoop כרטיסים** לפי `data.dashboardCards` | `renderCard` — ראו טבלת כרטיסים |
| 7 | **ניווט חודש** (`MonthNavigation`) | אם `organizationSummary` + (billing **או** collections **או** profit card) |
| 8 | **«תזרים החודש»** — גבייה/שולם/צפוי/נטו | grid KPI | `organizationSummary.monthCash` | PERMISSION + cardSet |
| 9 | **«רווחיות / פעילות החודש»** — חיובים/עלות חודש | invoiced/costs KPIs | CONDITIONAL + billing card |
| 10 | קישורי **תזרים** + **דוחות** | footer | ALWAYS ב-Card |

### ג.1 — כרטיסי Card (מפתח → UI בעברית)

| מפתח | UI (עברית/מקור) | מרender | נעלם אם |
|------|-----------------|--------|---------|
| `attention` | — | **null** (לא מרender) | תמיד; attention ב־#4 |
| `activeWork` | פרויקטים אחרונים | `DashboardRecentProjectsSection` | `recentProjects.length=0` |
| `contractValue` | שווי חוזה / `DashboardContractSummaryRow` | CONDITIONAL data |
| `profit` | רווח צפוי | `DashboardKpiCard` | !showProfit |
| `forecast` | רשת KPI תחזית (עלות, התחייבויות, רווח, תקורה, …) | `data.forecast` | !forecast |
| `commitments` | התחייבויות | KPI | !forecast |
| `billing` | חיוב + שולם | KPI | !showBilling |
| `collections` | יתרה לגבייה (+ AP) | KPI | !showBilling / data |
| `serviceToday` | **«היום בשטח/שירות»** + קישור `/today` | ALWAYS when in list | — |
| `timeUtilization` | פרויקטים פעילים + attention count | KPI | counts=0 |
| `quotePipeline` | **«הצעות מחיר»** + `/quotes` | MODULE quotes + `showQuotes` |
| `firstActions` | **«פעולות מהירות»** — פרויקט/עבודה/הוצאה | PERMISSION create |

Loader מרכזי: **`getHomeDashboard`** — `src/modules/financials/application/get-home-dashboard.ts`.

---

# חלק ד — 11 מצבי Preview (מפרט נפרד)

> **הערה על `actual`:** אין override cookie; layout/cards/nav לפי **`business_profile`** ב-DB + complexity + הרשאות. דוגמת JSON ב־mapping משתמשת ב-GC רק לדוגמה — **בפועל תלוי בארגון**.

---

## 1. הפרופיל האמיתי (`actual`)

- **Layout:** לפי org — Owner אם persona project-first ו־`preferServiceSurface=false`; אחרת Card.
- **דשבורד:** אחד מחלק ב/ג לפי org.
- **Today / Nav / Modules:** מהגדרות org (לא cookie).
- **Preview switcher:** לא פעיל (`resolveExperiencePreview('actual')`).

---

## 2. קבלן פרויקטים (`GENERAL_CONTRACTOR`)

**Persona:** `project_contractor` | **Layout:** **Owner** | **preferServiceSurface:** false

### מה רואים בדשבורד (סדר מלא — Owner)

1. שלד חלק א (כותרת, מסנן work kind, …)  
2. רכיבים 1–21 מ**חלק ב** (טבלה Owner) — **כולם** subject ל-data/permissions.

### מה לא רואים (לעומת Card electrical / ALL)

- **LAYOUT-REPLACED:** אין loop כרטיסי `quotePipeline`, `serviceToday`, `firstActions` בדף הבית.
- **Card-only blocks:** כותרת «תמונת מצב עסקית» לפני כרטיסים — **לא** (Owner).
- **בCard persona electrical:** אין **טבלת רווחיות לפי פרויקט** — **LAYOUT-REPLACED** (זה הפער ל«קבלן חשמל פרויקטים»).

### Today

- דגש: `project_risk`, `money`, `boq`, `approvals`, `closeout`, `field` — `PERSONA_TODAY_FOCUS`.
- מסתיר low/medium: קטגוריה `service` — `PERSONA_TODAY_DEEMPHASIZE`.

### ניווט ראשי (core)

`dashboard`, `projects`, `expenses`, `clients` — **ללא** `today` ב-core.

### מודולים (preview override)

clients, vendors, billing, changes, documents, workforce, procurement, budgets, boq, approvals, quotes, month_close, command_center, work_management.

### טאבי פרויקט (ברירת מחדל)

`resolveProjectExperienceProfile` → **`boq`** (BOQ, budgets, financials, …) — `project-profiles.ts`.

### יכולות במקום אחר

CRM: לא ב-default modules — `/crm` אם module+permission. רכש: `/procurement` (module on).

---

## 3. קבלן חשמל (`ELECTRICAL`)

**Persona:** `electrical` | **Layout:** **Card** (לא Owner — persona לא ב־PROJECT_FIRST set)

### מה רואים (Card — סדר)

1. חלק א  
2. «תמונת מצb עסקית» (כי יש כרטיסי כסף)  
3. pending/labor/shortcuts/attention  
4. **פרויקטים אחרונים** (`activeWork`) — אם יש  
5. **הצעות מחיר** (`quotePipeline`) → `/quotes`  
6. **חיוב / גבייה / התחייבויות / רווח** — KPI cards  
7. **בוחר חודש + תזרים החודש + רווחיות חודש** — אם `organizationSummary`  
8. קישורי תזרים/דוחות  

### מה לא רואים (Owner)

- **טבלת «רווחיות לפי פרויקט»** — **LAYOUT-REPLACED**  
- **HomeDashboardCashForecast** (90d) — **NOT on Card path** (רק Owner view) — גישה: **`/cash-flow`**  
- **RestoredSections** forecast grid המלא כמו Owner — חלק ב-**forecast** card בלבד (לא זהה layout)

### Today

דגש: field, time_people, money; deemphasize boq, closeout.

### ניווט core

`today`, `dashboard`, `jobs`, `projects`, `expenses`.

### מודולים

+ field_ops, materials, forms, service, jobs (ללא procurement/boq default).

### טאבי פרויקט default

**`full`** (לא boq אוטומטי).

---

## 4. קבלן שיפוצים (`RENOVATION`)

**Persona:** `renovation` | **Layout:** **Owner**

### דשבורד — רשימה מלאה Owner

**זהה במבנה לסעיף 2 (חלק ב, רכיבים 1–21)** — אותו קוד `HomeDashboardOwnerView`.

**הבדלים שאינם UI layout:** Today (deemphasize service, boq); nav core כולל **`today`**; modules: materials, jobs, boq — **ללא** procurement/approvals/month_close כמו GC.

### מה לא רואים

- Card-only: `quotePipeline` **בדף הבית** (ב-Owner אין card loop — הצעות ב-nav `/quotes`).

---

## 5. קבלן עבודות קטנות (`SMALL_WORKS`)

**Persona:** `small_works` | **Layout:** **Card**

### דשבורד (Card)

1. חלק א  
2. תמונת מצב עסקית (billing/collections)  
3. shortcuts, attention  
4. activeWork (אם יש)  
5. **«פעולות מהירות»** (`firstActions`) — פרויקט/עבודה/הוצאה  
6. billing + collections KPIs  
7. month cash block (אם summary)  
8. footer links  

**לא:** contractValue, profit, forecast, commitments, quotePipeline, serviceToday, timeUtilization, **טבלת Owner**.

### Today

דגש money, time_people; hide boq, closeout, service, field (low/med).

### Nav core

`today`, `dashboard`, `jobs`, `clients`, `expenses`.

### Project tabs default

**`simple`** — expenses, billing, billingPlan, team, documents (ללא financials/boq).

---

## 6. שירות ותחזוקה (`FIELD_SERVICE`)

**Persona:** `service` | **Layout:** **Card** | **preferServiceSurface:** true

### דשבורד

1. חלק א  
2. (אין כותרת «תמונת מצב» אם אין כרטיס profit/forecast — **יש** billing/collections → **יש**)  
3. **«היום» / שירות** (`serviceToday`) → `/today`  
4. activeWork, **firstActions**  
5. billing, collections  
6. month cash  
7. footer  

**לא:** Owner table, forecast card (unless data in month block), quotePipeline (module quotes **off** in preset).

### Nav core

`today`, `dashboard`, **`workOrders`**, **`fieldHome`**, `clients`.

### Today

דגש service, time_people, field; deemphasize boq, closeout, project_risk.

---

## 7. אדריכלות ועיצוב (`ARCHITECT`)

**Persona:** `architecture` | **Layout:** **Owner**

### דשבורד — Owner מלא (חלק ב 1–21)

**זהה במבנה** ל-GC/שיפוצים.

**Card list ב-persona (לא מרender ב-Owner):** timeUtilization, billing, collections, profit — **LAYOUT-REPLACED** ל-KPI Owner + RestoredSections.

### Nav

`today`, `dashboard`, `projects`, **`portfolio`**, `clients`.

### Modules

documents, quotes, changes, billing, work_management — **ללא** workforce default.

### Project tabs

**`consulting`** — time, schedule, financials (אם מותר).

---

## 8. הנדסה וייעוץ (`ENGINEERING_CONSULTANT`)

**Persona:** `consulting` | **Layout:** **Owner**

### דשbורד

**רשימת Owner מלאה (חלק ב 1–21)** — **אותו render path** כמו ARCHITECT.

### הבדלים מ-ARCHITECT (לא דשbורד layout)

| נושא | ARCHITECT | ENGINEERING |
|------|-----------|-------------|
| Nav core אחרון | portfolio | **myWork** |
| Modules | + changes | **ללא** changes |
| Persona Today | זהה تقريباً | זהה |
| `PERSONA_DASHBOARD_CARDS` | **זהה לחלוטin** | **זהה** |

---

## 9. ביקורת ופיקוח (`SAFETY_INSPECTION_CONSULTANT`)

**Persona:** `inspection` | **Layout:** **Card** | **preferServiceSurface:** true

### דshבורד Card

activeWork, **serviceToday**, billing, collections — **ללא** quotePipeline, profit card, firstActions (לא ברשימה).

### Nav

`today`, `dashboard`, **`fieldOps`**, `projects`, `clients`.

### Modules

**safety**, field_ops, forms, jobs — **ללא** quotes/workforce default.

---

## 10. עסק מעורב (`MIXED_PROJECT_SERVICE`)

**Persona:** `mixed` | **Layout:** **Card** (preferServiceSurface **true** → **לא** Owner למרות persona mixed)

### דשבורד Card

contractValue, profit, billing, collections, **serviceToday**, activeWork — **ללא** forecast/commitments cards (לא ברשימה persona mixed).

### Nav

`today`, `dashboard`, `projects`, `jobs`, `expenses`.

### Modules

רחב (service, field_ops, budgets, …) — **ללא** boq/procurement in preset list.

**חשוב:** persona `mixed` **יכול** Owner רק אם org מכבה `preferServiceSurface` — preset profile **מכריח Card**.

---

## 11. כל האפשרויות (`ALL_CAPABILITIES`)

**Persona:** `all` | **Layout:** **Card** | **preferServiceSurface:** true

### דשבורד Card — **כל** סוגי הכרטיסים ברצף

attention (null), activeWork, contractValue, profit, forecast, commitments, billing, collections, serviceToday, timeUtilization, quotePipeline + month block + footer.

**Still NOT Owner:** **אין טבלת פרויקטים Owner** — **LAYOUT-REPLACED** (פער QA חשוב).

### Modules

כל optional modules (crm, overhead, api, …) — `modulesFromProfile` ALL=true.

### Today

**לא** מסנן פריטים (`persona === 'all'` → keep all).

---

# חלק ה — 20 Business Profiles (הגדרות, לא בורר)

| מפתח | Persona | Layout | Project profile default | הערה |
|------|---------|--------|-------------------------|------|
| GENERAL_CONTRACTOR | project_contractor | Owner | boq | |
| RENOVATION | renovation | Owner | boq | |
| ELECTRICAL | electrical | Card | full | **אין טבלת Owner** |
| PLUMBING | service | Card | full | כמו FIELD persona |
| HVAC | service | Card | full | + assets |
| MAINTENANCE | service | Card | full | |
| FIELD_SERVICE | service | Card | full | |
| FACILITY_MANAGEMENT | service | Card | full | + approvals |
| LANDSCAPING | service | Card | full | preferService false |
| CLEANING | service | Card | full | |
| INSTALLATION | service | Card | full | |
| MIXED_PROJECT_SERVICE | mixed | Card | full | |
| SUBCONTRACTOR | project_contractor | Owner | full | modules מצומצם |
| ARCHITECT | architecture | Owner | consulting | |
| DESIGNER | architecture | Owner | consulting | + jobs |
| ENGINEERING_CONSULTANT | consulting | Owner | consulting | |
| SAFETY_INSPECTION_CONSULTANT | inspection | Card | full | |
| PROJECT_MANAGEMENT | project_contractor | Owner | consulting | ללא boq module default |
| SMALL_WORKS | small_works | Card | simple | |
| ALL_CAPABILITIES | all | Card | boq | |

**לא ב-onboarding list:** `ALL_CAPABILITIES` (path `all`).  
**Onboarding types:** 19 — `ONBOARDING_BUSINESS_TYPES` — `onboarding-experience.ts`.

---

# חלק ו — Owner מול Card (מטריצה)

| רכיב | Owner | Card | מה אובד / משתנה |
|------|:-----:|:----:|------------------|
| טבלת רווחיות לפי פרויקט | ✓ | — | **Card מאבד** — `/projects` + drilldown |
| HomeDashboardCashForecast 90d | ✓ | — | Card: **`/cash-flow`** |
| RestoredSections (מלא) | ✓ | חלקי | Card: spread ב-forecast/billing cards + month |
| KPI שורת 4 (שווי/עלות/רווח/%) | ✓ | — | Card: KPIs מפוזרים בכרטיסים |
| quotePipeline section | — | ✓* | *persona |
| serviceToday | — | ✓* | |
| firstActions | — | ✓* | |
| timeUtilization | — | ✓* | |
| «תמונת מצb עסקית» header | — | ✓* | *money cards |
| MonthNavigation (Card bottom) | בתוך Restored | ✓ | Owner: `MonthCashMonthPicker` in Restored |
| DashboardRecentProjectsSection | ✓ (אחרי Restored) | ✓ (activeWork) | סדר שונה |
| קיצורי דרך / attention / pending time | ✓ | ✓ | משותף |
| קישור reports/management | ✓ | ✓ (footer שונה) | |

---

# חלק ז — התאמה ל-7 משפחות יעד (עתידי)

| משפחה | BusinessProfileKeys קיימים | Layout נוכחי | CORE בדשbord (המלצה) | SECONDARY nav | MISSING במוצר |
|--------|---------------------------|--------------|------------------------|---------------|----------------|
| **א. הנדסה/ייעוץ/אדריכלות** | ARCHITECT, DESIGNER, ENGINEERING_CONSULTANT | Owner | KPI רווח + time + billing; **לא** BOQ בראש | portfolio/myWork, documents | SLA — **NOT IMPLEMENTED** |
| **ב. יזמות** | — | — | **MISSING** profile ייעודי; הקרוב: GC+PM | budgets, contractors | יזמות כ-is |
| **ג. קבלנות פרויקטים** | GC, RENOVATION, SUBCONTRACTOR, ELECTRICAL* | Owner או **Card ל-ELECTRICAL** | Owner: טבלה+תזרים; Electrical: **חסר טבלה** | procurement/boq | — |
| **ד. בעלי מקצוע** | SMALL_WORKS, ELECTRICAL, PLUMBING… | Card | jobs, firstActions, billing | today, quotes | — |
| **ה. ניהול/פיקוח** | PROJECT_MANAGEMENT, SAFETY | Owner / Card | PM: Owner; Safety: field+serviceToday | fieldOps, safety | — |
| **ו. שירות ותחזוקה** | FIELD_SERVICE, MAINTENANCE, … | Card | serviceToday, workOrders | dispatch | recurring — nav module |
| **ז. הכול** | ALL_CAPABILITIES | Card (max cards) | כל KPI cards; **חסר** Owner table | all modules | — |

**פער מוצר לדוגמת «יועץ חשמל»:** persona `electrical` → **Card** → **אין** טבלת פרויקטים בבית — **UX gap**, לא הרשאות (נתונים ב-`/projects`, `/financials`).

---

# חלק ח — שאלון onboarding (תכנון)

**קיים:** `onboarding-experience.ts` — businessType, workStyle, manageOptions, path recommended/all/none.

**הצעה 5 שאלות:**

1. **מה סוג העסק העיקרי?** → map ל־`ONBOARDING_BUSINESS_TYPES` → `BusinessProfileKey`.
2. **עיקr העבודה:** פרויקטים / עבודות / שירות / ייעוץ / מעורב → `workMixForOnboardingStyle`.
3. **מנהלים עובדים?** → `employees` → module workforce.
4. **רכש חומרים / BOQ?** → `boq`, `inventory`, `suppliers` → modules additive.
5. **שטח וטכנאים?** → `field` → field_ops.

**שמירה:** `applyOrganizationBusinessProfile` — keys קיימים: `business_profile`, module prefs, terminology — **ללא סכימה חדשה** (NOT VERIFIED migration — רק settings JSON).

**שינוי אחר כך:** הגדרות → business profile; **בורר Preview** נשאר Owner-only QA.

**כל משתמש מורשה:** רואה חוויה לפי **org profile + permissions**; רק Owner רואה בורר.

---

# חלק ט — כפילויות (לאחר מיפוי מלא)

| זוג | זהה | שונה | איחוד בבורר? |
|-----|-----|------|--------------|
| ARCHITECT / ENGINEERING | Owner 1–21; cards persona | nav portfolio vs myWork; modules changes | **כן** לשורה אחת ב-QA |
| GC / RENOVATION | Owner layout | modules, Today | **לא** — רכש/BOQ שונה |
| FIELD / PLUMBING / HVAC | Card service persona | modules assets/forms | persona כבר אחד |
| MIXED / ALL | — | ALL=כל cards+modules | MIXED מהבורר; ALL ל-QA |
| Owner Restored vs Card month | מנוע זהה | chrome | **לא** לאחד ללא החלטת UX |

---

# חלק י — תשובות ל-13 שאלות הסיום

1. **מה רואים:** לכל preview — חלק ד; Owner = חלק ב; Card = חלק ג + cards per persona.
2. **מה לא רואים:** LAYOUT-REPLACED + MODULE-GATED + PERMISSION.
3. **מוסתר בדשבord vs לא נגיש:** nav/module hide → URL+permission עדיין; Today PERSONA-HIDDEN ≠ חסימת API.
4. **הבדל 11 מצבים:** layout Owner(4) vs Card(7); cards; nav core; modules — `_dashboard-mapping-data.json`.
5. **22→20 profiles:** טבלה חלק ה.
6. **יכולות חובה:** נגישות via nav/settings — ALL_CAPABILITIES או הפעלת module; **לא** כולן בדשbord.
7. **7 משפחות:** חלק ז.
8. **שאלון:** חלק ח.
9. **איחוד:** חלק ט — **לא** למחוק capabilities.

---

## טבלת סגירה

| שדה | ערך |
|-----|-----|
| CODE CHANGES | **NO** |
| SQL | **NO** |
| COMMIT / PUSH / DEPLOY | **NO** |
| PREVIEW MODES DOCUMENTED | **11** |
| BUSINESS PROFILES IN CODE | **20** |
| OWNER vs CARD VERIFIED | **YES** (render paths) |
| E2E / SCREENSHOTS | **NO** |

---

*מסמך זה נועד להחלטת בעלים לפני תכנון מחדש — לא יישום.*
