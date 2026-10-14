# ProjectFlow — ביקורת מלאה: פרופילי תצוגה ומצבי View

**מצב:** READ-ONLY | **תאריך:** 2026-10-13  
**מיקוד:** בורר «תצוגה לבדיקה: …» (Experience Preview) + שכבות תצוגה קשורות  
**אין שינוי קוד / SQL / commit / deploy**

---

## 0. תמצית מנהלים

הטקסט **«תצוגה לבדיקה: {label}»** מגיע מ־**Experience Preview** — שכבת UI ל־**Owner בלבד**, **cookie** (`pf_experience_preview`), **לא** משנה הרשאות RBAC ו**לא** כותבת הגדרות ארגון. היא **מדמה** פרופיל עסק (`BusinessProfileKey`) לצורך QA: ניווט, מודולים, persona, כרטיסי דשבורד, דגש Today.

במערכת קיימות **4 שכבות נפרדות** (אין לערבב):

| שכבה | מטרה | שמירה | קהל |
|------|------|--------|-----|
| **Experience Preview** | בורר בסרגל | Cookie 14 יום, httpOnly | Owner בלבד |
| **Business Profile** (הגדרות) | קונפיגורציית עסק | DB `business_profile` | מנהל עם `SETTINGS_MANAGE` |
| **Experience Persona** (פנימי) | הרכב UI | נגזר מפרופיל | כל המשתמשים (לפי פרופיל הארגון) |
| **Dashboard display** (הגדרות) | קיצורי דרך בדשבורד | DB `dashboard_quick_access` | מי שמנהל הגדרות |

**מסקנה:** צמצום **בבורר** אפשרי בלי לאבד יכולות — היכולות נשארות בניווט, בהגדרות «מה יוצג», וב־22 פרופילי עסק מלאים. **אסור** שהבורר יהפוך ל־RBAC; היום הוא **לא** מעניק הרשאות (מאומת בקוד).

---

## 1. איתור — הבורר בצילום

### 1.1 רכיב UI

| פריט | ערך |
|------|-----|
| **רכיב** | `ExperiencePreviewSwitcher` |
| **קובץ** | `src/components/shell/experience-preview-switcher.tsx` |
| **מיקום** | Footer של `Sidebar` + `MobileNav` more footer — `src/components/shell/app-shell.tsx` |
| **מאפיין DOM** | `data-pf-experience-preview=""` |
| **כותרת בורר** | `nav.experiencePreview.label` → **«תצוגת חוויה»** (`src/locales/he-IL/nav.json`) |
| **טקסט פעיל** | `nav.experiencePreview.previewing` → **«תצוגה לבדיקה: {label}»** |
| **ברירת מחדל** | `actual` — **«הפרופיל האמיתי של העסק»** |
| **Production** | **פעיל** ל־Owner (`canUseExperiencePreview` → `roleKeys.includes('owner')`) בכל סביבה |
| **Dev-only?** | **לא בפועל** — למרות הערות «Development» ב־`experience-preview.ts`, `PF_EXPERIENCE_PREVIEW` ו־`isExperiencePreviewEnvironment` **לא** שולטים בנראות הבורר |

### 1.2 כל אפשרויות הבורר (11)

| # | מזהה פנימי | עברית (בורר) | Persona | מטרה | קהל יעד |
|---|------------|--------------|---------|------|---------|
| 0 | `actual` | הפרופיל האמיתי של העסק | לפי DB | ללא override | Owner — חזרה לפרודקשן אמיתי |
| 1 | `GENERAL_CONTRACTOR` | קבלן פרויקטים | `project_contractor` | דשבורד Owner + BOQ/רכש | קבלנות ראשית |
| 2 | `ELECTRICAL` | קבלן חשמל | `electrical` | דשבורד כרטיסים + הצעות | מקצועות מעורבים/שטח |
| 3 | `RENOVATION` | קבלן שיפוצים | `renovation` | דשבורד Owner + הצעות | שיפוצים |
| 4 | `SMALL_WORKS` | קבלן עבודות קטנות | `small_works` | כרטיסים מינימליים + firstActions | עבודות קטנות |
| 5 | `FIELD_SERVICE` | שירות ותחזוקה | `service` | Today + קריאות + serviceToday | שירות/שטח |
| 6 | `ARCHITECT` | אדריכלות ועיצוב | `architecture` | Owner + timeUtilization | משרדי תכנון |
| 7 | `ENGINEERING_CONSULTANT` | הנדסה וייעוץ | `consulting` | כמו architecture ברמת כרטיסים | יועצים |
| 8 | `SAFETY_INSPECTION_CONSULTANT` | ביקורת ופיקוח | `inspection` | שטח + בטיחות | ביקורת |
| 9 | `MIXED_PROJECT_SERVICE` | עסק מעורב | `mixed` | פרויקט+שירות (Card בגלל `preferServiceSurface`) | היברידי |
| 10 | `ALL_CAPABILITIES` | **כל האפשרויות** | `all` | כל המודולים + כל כרטיסי הדשבורד | QA / הדגמת מוצר |

**חוזה רשימה:** `EXPERIENCE_PREVIEW_PROFILE_KEYS` — `src/modules/tenancy/domain/experience-preview.ts`  
**פעולת שרת:** `setExperiencePreviewAction` — `src/modules/tenancy/application/experience-preview.ts`  
**Cookie:** `EXPERIENCE_PREVIEW_COOKIE = 'pf_experience_preview'`

### 1.3 פרופילי עסק שלא בבורר (עדיין ב־Production)

22 מפתחות ב־`BUSINESS_PROFILES` — `src/modules/tenancy/domain/business-profiles.ts`.  
דוגמות **ללא** שורה בבורר: `PLUMBING`, `HVAC`, `SUBCONTRACTOR`, `PROJECT_MANAGEMENT`, `DESIGNER`, … — נבחרים רק בהגדרות ארגון / onboarding, אך **אותה שכבת persona** חלה עליהם.

### 1.4 מצבי תצוגה **מקבילים** (לא הבורר)

| מנגנון | מיקום | הערה |
|--------|--------|------|
| **Owner Dashboard vs Card Dashboard** | `shouldUseOwnerDashboard` — `home-dashboard-content.tsx` | תלוי persona + `preferServiceSurface` |
| **Work hub** (לוח/יומן/ציר) | `work-hub-nav.tsx` | `viewMode` calendar/timeline — לא persona |
| **Saved list views** | `saved-list-views-bar.tsx` | portfolio, punch, tasks — query presets |
| **Reports** | `?workKind=`, `?section=` | `reports-section.ts` |
| **CRM opportunities** | Board / Table | `opportunity-pipeline-views.tsx` |
| **Billing hub** | `?view=payments`, `?filter=` | `billing-org-hub-view.tsx` |
| **My Work** | `?view=` | `my-work-views.ts` |
| **Project workspace tabs** | `PROJECT_PROFILE_TAB_ALLOWLIST` | `project-profiles.ts` — לפי פרופיל פרויקט |
| **Experience depth (complexity)** | הגדרות | `applyComplexityToVisibility` — `session.ts` |
| **Dashboard shortcuts** | הגדרות «תצוגת דשבורד» | עד 8 קיצורים — `dashboard-quick-access.ts` |

---

## 2. מה כל תצוגה כוללת — מנגנון ליבה

### 2.1 שרשרת החלטה (דשבורד בית)

```
Cookie/DB business_profile
  → resolveExperiencePreview (override Owner)
  → personaForBusinessProfile (experience-persona.ts)
  → dashboardCardsForPersona (experience-dashboard.ts)
  → shouldUseOwnerDashboard (preferServiceSurface + persona)
  → HomeDashboardOwnerView | renderCard(...)
```

**מקור נתונים פיננסי:** `get-home-dashboard.ts` — **אותם מנועים**; `hasPermission` לפני טעינה (`PROJECT_FINANCIALS_READ`, `BILLING_READ`, …).  
**חודש:** `?month=` / ברירת מחדל timezone — **לא** persona.

### 2.2 מצב **Owner Dashboard** (לא Card)

**תנאי:** `!isBrandNew && !preferServiceSurface && persona ∈ {project_contractor, renovation, architecture, consulting, mixed}` — `home-dashboard-content.tsx` שורות 70–80.

**מוצג (VISIBLE):** `HomeDashboardOwnerView` — סיכום חוזה, KPI שורת רווח/עלות, תזרים (`HomeDashboardCashForecast` אם `canReadFinancials`), `HomeDashboardRestoredSections` (תחזית, חיובים, מזומן חודשי), טבלת פרויקטים, קישורי reports/cash-flow.

**לא תלוי ב־`PERSONA_DASHBOARD_CARDS`:** ברוב המקטעים — **אותו שלד Owner** ל־GC, שיפוצים, אדריכלות, ייעוץ, mixed (כשלא Card).

### 2.3 מצב **Card Dashboard**

**Personas:** `electrical`, `small_works`, `service`, `inspection`, `all`, וכל persona עם `preferServiceSurface: true` (כולל `MIXED_PROJECT_SERVICE`, `ALL_CAPABILITIES`, `SAFETY_INSPECTION_CONSULTANT`).

**כרטיסים אפשריים** (`ExperienceDashboardCard`):  
`attention`, `activeWork`, `contractValue`, `profit`, `forecast`, `commitments`, `billing`, `collections`, `serviceToday`, `timeUtilization`, `quotePipeline`, `firstActions` — `experience-dashboard.ts`.

**הערה:** מפתח `attention` ברשימה אך `renderCard('attention')` → **null**; ההתראות ב־`DashboardAttentionCards` (**COMMON**).

### 2.4 רכיבים משותפים (כל פרופיל, אם לא brand-new)

| רכיב | סוג | תנאי |
|------|-----|------|
| `PageHeader` | VISIBLE | תמיד |
| `DashboardQuickAccessBar` | VISIBLE | תמיד (קישור מסמכי חברה) |
| `WorkKindFilterChrome` | VISIBLE | תמיד; מסנן rollup ב־`?workKind=` |
| `DashboardQuickAccessSection` | CONDITIONAL | קיצורים מהגדרות + הרשאות/מודולים |
| `DashboardAttentionCards` | CONDITIONAL | יש פריטי attention |
| `HomePendingTimeAlert` | CONDITIONAL | `pendingTime` + workforce read |
| `HomeLaborReconciliation` | CONDITIONAL | `laborReconciliation` |
| `DashboardMissingDataTrigger` | CONDITIONAL | completeness |
| `DashboardCapabilityTip` | **NOT IMPLEMENTED (כבוי)** | `DASHBOARD_UNUSED_CAPABILITY_TIP_VISIBLE=false` — `dashboard-ui-flags.ts` |
| `PwaInstallCta` | VISIBLE | תמיד |

### 2.5 Today (`/today`)

| השפעה | מנגנון | קובץ |
|--------|--------|------|
| דירוג | `todayUrgencyBumpForPersona` | `experience-today.ts` |
| הסתרת פריטים low/medium | `todayItemVisibleForPersona` | `experience-today.ts` |
| persona=`all` | **לא מסנן** | שורה 136 |
| כסף critical/high | **תמיד נשאר** | שורות 137–139 |

**PERMISSION-GATED:** איסוף פריטים — `collect-sources.ts` (הרשאות + מודול).

### 2.6 ניווט + כפתור **+**

| רכיב | השפעת פרופיל |
|------|----------------|
| **Sidebar / mobile** | `visibleNavItems(permissions, modules, { workMix, persona, roleSurface })` — `navigation.ts`; מודולים מ־preview override ב־`getShellContext` |
| **Primary nav order** | `PERSONA_PRIMARY_NAV_KEYS` — `experience-nav-layout.ts` |
| **Global Quick Create (+)** | `buildQuickCreateActions` — **רשימה קנונית קבועה**; `_persona` ו־`_emphasis` **מוזנים אך לא משנים** תוכן — `quick-create-actions.ts` שורות 90–97 |
| **quickCreateEmphasis בפרופיל** | נשמר ב־shell / מוצג בהגדרות preset — **לא מיושם ב־+** (פער מימוש) |

**PERMISSION-GATED:** כל פריט ב־+ וניווט — `permissions` + `modules`.

### 2.7 גרפים

**אין** רכיבי chart ייעודיים בדשבורד הבית — KPI tiles וטבלאות בלבד. גרפים במסכים אחרים (reports analytics) **לא** מושפעים מ־Experience Preview.

---

## 3. מטריצת השוואה

**מקרא:** ✓ גלוי | — מוסתר | C מותנה (הרשאה/נתונים/מודול) | O רק Owner layout | Card = מצב כרטיסים

### 3.1 עמודות = אפשרויות הבורר

קיצורים: **ACT** actual | **GC** קבלן פרויקטים | **EL** חשמל | **RN** שיפוצים | **SW** עבודות קטנות | **FS** שירות | **AR** אדריכלות | **EN** הנדסה | **SF** ביקורת | **MX** מעורב | **ALL** כל האפשרויות

### 3.2 שורות — מצב דשבורד (Layout)

| רכיב | ACT | GC | EL | RN | SW | FS | AR | EN | SF | MX | ALL |
|------|:---:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|
| Owner Dashboard layout | C | O | — | O | — | — | O | O | — | —* | — |
| Card Dashboard layout | C | — | Card | — | Card | Card | — | — | Card | Card* | Card |

\* **MX / ALL:** `preferServiceSurface: true` → **Card** גם כש־persona=`mixed` (`business-profiles.ts` שורות 437, 661).

### 3.3 כרטיסי Card Dashboard (✓ = ברשימת persona)

| כרטיס | GC | EL | RN | SW | FS | AR | EN | SF | MX | ALL |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:---:|
| contractValue | ✓ | — | — | — | — | — | — | — | ✓ | ✓ |
| profit | ✓ | ✓ | ✓ | — | — | ✓ | ✓ | — | ✓ | ✓ |
| forecast | ✓ | — | — | — | — | — | — | — | — | ✓ |
| commitments | ✓ | ✓ | ✓ | — | — | — | — | — | — | ✓ |
| quotePipeline | — | ✓ | ✓ | — | — | — | — | — | — | ✓ |
| serviceToday | — | — | — | — | ✓ | — | — | ✓ | ✓ | ✓ |
| timeUtilization | — | — | — | — | — | ✓ | ✓ | — | — | ✓ |
| firstActions | — | — | — | ✓ | ✓ | — | — | — | — | — |
| billing / collections | C | C | C | C | C | C | C | C | C | C |

**GC/RN/AR/EN ב־Owner mode:** כרטיסים למעלה **לא** מגדירים את המסך — מקטעי Owner + RestoredSections מחליפים.

### 3.4 Today — דגש קטגוריות (boost / soft-hide)

| קטגוריה | GC | EL | RN | SW | FS | AR | EN | SF | MX | ALL |
|---------|----|----|----|----|----|----|----|----|----|-----|
| boq (דגש) | ✓ | — | — | — | — | — | — | — | — | ✓ |
| service (דגש) | — | — | — | — | ✓ | — | — | — | ✓ | ✓ |
| time_people (דגש) | — | ✓ | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| soft-hide service (low/med) | ✓ | — | ✓ | ✓ | — | ✓ | ✓ | — | — | — |

מקור: `PERSONA_TODAY_FOCUS`, `PERSONA_TODAY_DEEMPHASIZE` — `experience-today.ts`.

### 3.5 ניווט ראשי (Core bar) — דוגמאות

| מפתח nav | GC | EL | FS | AR | EN | SW |
|----------|:--:|:--:|:--:|:--:|:--:|:--:|
| `today` ב-core | — | ✓ | ✓ | ✓ | ✓ | ✓ |
| `projects` | ✓ | ✓ | — | ✓ | ✓ | — |
| `jobs` | — | ✓ | — | — | — | ✓ |
| `workOrders` | — | — | ✓ | — | — | — |
| `portfolio` | — | — | — | ✓ | ✓ | — |

מקור: `PERSONA_PRIMARY_NAV_KEYS` — `experience-nav-layout.ts`.

### 3.6 מודולים (visibleModules) — הבדלים מהותיים

| מודול | GC | EL | FS | AR | EN | SF | ALL |
|--------|:--:|:--:|:--:|:--:|:--:|:--:|:---:|
| procurement / boq | ✓ | — | — | — | — | — | ✓ |
| field_ops / service | — | ✓ | ✓ | — | — | ✓ | ✓ |
| safety | — | — | — | — | — | ✓ | ✓ |
| crm / overhead / api | — | — | — | — | — | — | ✓ |

מקור: `business-profiles.ts` — ב־preview, `modulesFromProfile` — `experience-preview.ts`.

**ACT:** מודולים מהגדרות ארגון + complexity — **לא** מהטבלה.

### 3.7 רכיבים בכל המצבים / רק באחד / כפולים

| תובנה | פירוט |
|--------|--------|
| **בכל המצבים** | Header, WorkKindFilter, Attention (אם יש נתונים), Quick Create (אם הרשאות), גישה ל־`/reports` |
| **רק Owner layout** | טבלת פרויקטים מלאה Owner, KPI שורת רווח תפעולי מרוכזת |
| **רק Card / personas** | `serviceToday`, `firstActions`, `quotePipeline` (לפי persona) |
| **רק ALL** | כל כרטיסי persona יחד; כל optional modules ב־preview |
| **כפול מידע** | חיוב/גבייה/תזרים — Owner RestoredSections **וגם** Card billing/collections/month block |
| **מוגדר ולא נגיש** | `DashboardCapabilityTip`; `quickCreateEmphasis` (לא משפיע על +); `isExperiencePreviewEnvironment` (ללא call sites) |
| **כפול שם** | «היום» nav + `serviceToday` card → אותו `/today` |

---

## 4. תצוגה מול הרשאות

| שאלה | תשובה | הוכחה |
|------|--------|--------|
| משנה RBAC? | **לא** | `experience-preview.ts` שורות 134–137; `apply-business-profile.ts` שורות 53–57 |
| מסנן נתונים SQL? | **לא ישירות** — אותם queries; `showBilling`/`canReadFinancials` קובעים | `get-home-dashboard.ts` |
| משנה מקור נתונים? | **לא** | הערות `experience-dashboard.ts`, `experience-presentation.ts` |
| משנה טווח זמן? | **לא** | `effectiveSelectedMonth` — `get-home-dashboard.ts` |
| משנה מודולים (UI)? | **כן** — ב־preview override `modules` | `getShellContext` — `session.ts` ~277 |
| Today מסתיר פריטים? | **כן** — ranking/filter presentation | `todayItemVisibleForPersona` |
| נשמר איפה? | Cookie per browser; לא org | `setExperiencePreviewAction` |
| Owner בלי הרשאה finance | **לא** רואה KPI כסף | `showBilling`, `canReadFinancials` |

**PERMISSION IMPACT:** **YES** רק במובן של **הסתרת UI** כשאין הרשאה; **NO** במובן של **הרחבת** גישה. שרת חייב להמשיך לאכוף — **כך ממומש** ב־loaders.

---

## 5. כפילויות (מדויק)

| # | חפיפה | שונה | משמעותי? | איחוד? | אובדן באיחוד | שימור ייחודיות |
|---|--------|------|-----------|--------|--------------|----------------|
| D1 | **ARCHITECT ↔ ENGINEERING_CONSULTANT** — אותם `PERSONA_DASHBOARD_CARDS` | primary nav: portfolio vs myWork; Today דגש זהה تقريباً | **נמוך** | **כן** בבורר → «תכנון וייעוץ» | הבחנה myWork vs portfolio ב-core | שמירה ב־nav persona פנימי |
| D2 | **GENERAL_CONTRACTOR ↔ RENOVATION** — Owner layout זהה | מודולים (boq/procurement vs materials); Today | **בינוני** | אופציונלי בבורר | דגש BOQ vs שיפוצים | השאר 2 business profiles ב־DB |
| D3 | **ELECTRICAL ↔ RENOVATION** | Card vs Owner; cards שונים | **בינוני** | **לא** | — | — |
| D4 | **FIELD_SERVICE ↔ PLUMBING/HVAC** (לא בבורר) | אותו persona `service` | **גבוה** | כבר מאוחדים ב-persona | — | בורר מייצג «שירות» |
| D5 | **MIXED_PROJECT_SERVICE ↔ ALL_CAPABILITIES** | ALL = כל מודולים+כרטיסים; MIXED = subset | **בינוני** | ALL מספיק ל-QA | תצוגת «עסק מעורב» ריאלית | MIXED נשאר profile בהגדרות |
| D6 | **ALL_CAPABILITIES ↔ consulting quickCreate** | טест: אותו quickCreate fingerprint | **נמוך** (QC כבר לא persona-specific) | — | — | — |
| D7 | **כרטיס attention vs DashboardAttentionCards** | מפתח מת ב־renderCard | **טכני** | ניקוי עתידי | — | — |
| D8 | **Owner RestoredSections vs Card month cash** | אותם מנועים, chrome שונה | **בינוני** | לא — שני layouts | — | — |

**DUPLICATES (קבוצות מהותיות):** **6**

---

## 6. כיסוי יכולות — «לא לאבד»

| תחום | נגישות כשמצמצמים בורר |
|------|------------------------|
| פרויקטים / jobs / work orders | ניווט + `/projects`, `/jobs`; מודולים בהגדרות |
| CRM / הצעות | `modules.quotes/crm`; `/crm`, `/quotes` |
| משימות | `/work`, My Work — **לא** persona-gated |
| פיננסים | Owner KPI / `/financials`, `/cash-flow`, `/reports` — **הרשאות** |
| תזרים | `/cash-flow`, דשבורד RestoredSections |
| רכש / ספקים | nav group purchasing — module visibility |
| עובדים / נוכחות | workforce modules + alerts בדשבורד |
| התראות | Attention + Today + `/notifications` |
| **+ גלובלי** | **לא** תלוי persona (רק הרשאות/מודולים) |
| **ALL_CAPABILITIES** | חובה להשאיר **נגיש** לפחות בהגדרות org או QA — לא בהכרח 10 שורות בבורר |

**UNIQUE CAPABILITIES PRESERVED (במלצה):** **YES** — אם מצמצמים **רק** את בורר Owner QA.

---

## 7. המלצה לצמצום (מיפוי בלבד — לא יישום)

### 7.1 עקרון

- **22 Business Profiles** — **נשארים** בהגדרות (טרמינולוגיה, מודולים, onboarding).
- **10 Personas** — **נשארים** בקוד (הבדלי nav/Today/cards).
- **בורר Owner** — לצמצם מ־**11** ל־**6** (+ ACT).

### 7.2 מבנה מוצע לבורר

| # | שם מוצע (עברית) | מייצג profile keys | מטרה | רכיבים עיקריים |
|---|------------------|---------------------|------|----------------|
| 1 | **הפרופיל האמיתי** | `actual` | Production | כמו היום |
| 2 | **קבלנות ופרויקטים** | `GENERAL_CONTRACTOR` (+ אופציונלי RN ב-persona) | Owner dashboard, BOQ | Owner layout, procurement |
| 3 | **מקצוע ושטח** | `ELECTRICAL` | Card + quotes + field | quotePipeline, jobs |
| 4 | **שירות ותחזוקה** | `FIELD_SERVICE` | service persona | Today, workOrders, serviceToday |
| 5 | **תכנון וייעוץ** | `ARCHITECT` *or* `ENGINEERING_CONSULTANT` | Owner/card time | timeUtilization, portfolio |
| 6 | **עבודות קטנות** | `SMALL_WORKS` | firstActions | jobs-first |
| 7 | **כל האפשרויות (QA)** | `ALL_CAPABILITIES` | בדיקות Owner | כל cards+modules — **אופציונלי:** להסתיר ב-Production UI behind flag |

**להסיר מהבורר בלבד (לא מהמוצר):**  
`RENOVATION`, `ENGINEERING_CONSULTANT` (אם נבחר AR), `SAFETY_INSPECTION_CONSULTANT`, `MIXED_PROJECT_SERVICE` — גישה via הגדרות business profile + ACT.

### 7.3 מפת מעבר

| מצב קיים (בורר) | מצב מוצע |
|-----------------|----------|
| הפרופיל האמיתי | ללא שינוי |
| קבלן פרויקטים | קבלנות ופרויקטים |
| קבלן שיפוצים | ← אותו persona family; בחר GC או profile בהגדרות |
| קבלן חשמל | מקצוע ושטח |
| עבודות קטנות | ללא שינוי |
| שירות ותחזוקה | ללא שינוי |
| אדריכלות / הנדסה | **תכנון וייעוץ** (שורה אחת) |
| ביקורת ופיקוח | profile בהגדרות; preview דרך «שירות»+safety module או ALL |
| עסק מעורב | profile בהגדרות; QA → ALL |
| כל האפשרויות | שמור ל-QA / או flag |

### 7.4 רכיבים **אסור** לאבד באיחוד

- Owner Dashboard (layout מלא)
- Card personas: `serviceToday`, `firstActions`, `quotePipeline`, `timeUtilization`
- `ALL_CAPABILITIES` module map (לפחות בהגדרות)
- Today persona filter (critical money)
- `PROJECT_PROFILE_TAB_ALLOWLIST` בפרויקט
- Saved list views, reports sections, work hub — **לא נוגעים**

---

## 8. ממצאי נגישות / יכולות «נעלמות»

| ממצא | חומרה | פירוט |
|------|--------|--------|
| Preview מסתיר מודולים ב-nav | נמוכה (Owner QA) | מודול כבוי still reachable by URL — `hiddenCapability` banner |
| Today soft-hide | בינונית | low/medium non-money items — persona `small_works` / `architecture` |
| Owner vs Card | בינונית | mixed org on Card **לא** רואה Owner table בלי שינוי `preferServiceSurface` |
| quickCreateEmphasis | נמוכה | מוצג בהגדרות, **לא** ב־+ |
| 12 profiles לא בבורר | מידע | Owner QA לא מדמה PLUMBING וכו' בלי הגדרות |

---

## 9. הוכחות קוד (אינדקס)

| נושא | קובץ | סמל |
|------|------|-----|
| בורר | `experience-preview-switcher.tsx` | `ExperiencePreviewSwitcher` |
| רשימת preview | `experience-preview.ts` | `EXPERIENCE_PREVIEW_PROFILE_KEYS` |
| Persona | `experience-persona.ts` | `personaForBusinessProfile` |
| כרטיסים | `experience-dashboard.ts` | `PERSONA_DASHBOARD_CARDS` |
| Owner fork | `home-dashboard-content.tsx` | `shouldUseOwnerDashboard` |
| טעינת דשבורד | `get-home-dashboard.ts` | `getHomeDashboard` |
| Today | `experience-today.ts` | `todayItemVisibleForPersona` |
| Nav | `experience-nav-layout.ts` | `PERSONA_PRIMARY_NAV_KEYS` |
| Shell | `session.ts` | `getShellContext` |
| + גלובלי | `quick-create-actions.ts` | `buildQuickCreateActions` |
| מatrix tests | `persona-ux-matrix.test.ts` | `surfaceFingerprint` |

---

## 10. טבלת סיום

| שדה | ערך |
|-----|-----|
| **CURRENT PROFILES** (בורר) | **11** (actual + 10) |
| **Business profiles (DB)** | **22** |
| **Experience personas (קוד)** | **10** |
| **RECOMMENDED PROFILES** (בורר) | **6–7** (כולל actual + ALL ל-QA) |
| **DUPLICATES** | **6** קבוצות מהותיות |
| **UNIQUE CAPABILITIES PRESERVED** | **YES** (בתנאי שמצמצמים רק בורר) |
| **PERMISSION IMPACT** | **YES** (UI hide) / **NO** (grant) |
| **CODE CHANGES** | **NO** |
| **SQL** | **NO** |
| **COMMIT** | **NO** |
| **PUSH** | **NO** |
| **DEPLOY** | **NO** |

---

*דוח זה מבוסס על קוד הענף הנוכחי (post release ספר כספי). ללא E2E, ללא שינוי Production.*
