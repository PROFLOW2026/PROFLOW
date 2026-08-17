# PROJECTFLOW LIVE UI / HEBREW / NAVIGATION MAP

**Status:** MAPPING ONLY — no product fixes applied  
**Date:** 2026-08-17  
**Scope:** Actual routes, navigation, module/permission gates, homepage, marketing screenshots, Hebrew quality inventory  
**Method:** Source of rendered UI (app routes + shell + he-IL locales + marketing assets). Locale files alone are not treated as the product.  
**Allowed artifact:** this file only  

---

## 1. Executive summary

The live product is large (~140+ user-facing `page.tsx` routes, ~35 shell nav keys, 52 he-IL locale namespaces, 11 marketing screenshot SVGs).

Three Owner-confirmed problems are **code-explained**, not speculation:

1. **Hebrew quality** — many screens still use over-explaining, engine-adjacent phrasing, inconsistent terms, and “object/table” language (especially Quotes hub, Financials KPI hints, Projects empty state, Field Ops description).
2. **היום missing for Owner** — not a bug of the `/today` route. Nav item is gated by **optional module `command_center`**, which defaults **OFF** and is **not backfilled** for existing orgs. Owner usually *has* `command_center.read`. Opening `/today` with module off shows empty state “היום כבוי”.
3. **Homepage screenshots** — all tour/hero SVGs are **hand-drawn mock chrome** from `scripts/generate-marketing-screenshots.mjs`, not captures of live UI. Sidebar labels, card layouts, and feature surfaces do not match the real app shell.

**Process note for next phase:** correct screen-by-screen from this map; do not mass-rewrite locales without Owner/ChatGPT instructions per route.

---

## 2. Owner navigation map

### 2.1 Desktop sidebar (`visibleNavItems` → `partitionNavItems`)

**Core (ungrouped, top):** items with no `moreGroup` and not Settings.

For a typical Owner with **default modules OFF** (no business profile applied / Features never touched):

| Order | Visible HE label | Destination | Why visible |
|------:|------------------|-------------|---------|
| 1 | לוח בקרה | `/` | Always |
| 2 | פרויקטים | `/projects` | `projects.read` (Owner has) |
| 3 | הוצאות | `/expenses` | `expenses.read` |
| last | הגדרות | `/settings` | Always |

**Absent from core for that Owner:** היום, לקוחות, ספקים, חיובים, עבודות, … (module OFF and/or relegated to More).

When modules are ON, core grows. Example with `command_center` ON:

| Order | Label | Href |
|------:|-------|------|
| 1 | לוח בקרה | `/` |
| 2 | **היום** | `/today` |
| 3 | פרויקטים | `/projects` |
| 4 | הוצאות | `/expenses` |
| (+ jobs primary if work mix) | | |

**More groups (sidebar sections):**

| Group HE | Keys (when visible) |
|----------|---------------------|
| עסק | clients, quotes, crm, changes, billing, recurringDrafts, reports; (+ projects/jobs if demoted by work mix) |
| תפעול | vendors, workforce, time, attendance, timesheets, scheduling, procurement, materials, fieldOps, safety, forms, serviceRecurring, documents, imports; (+ vendorBills when procurement ON) |
| מתקדם | vendorBills (if procurement OFF), assets, compliance, approvals, monthClose, overhead |

### 2.2 Full nav item matrix

| Key | HE label (`nav.json`) | Href | Permission | Module | Mobile primary? | Owner default sees? |
|-----|----------------------|------|------------|--------|-----------------|---------------------|
| dashboard | לוח בקרה | `/` | — | — | Yes | YES |
| today | היום | `/today` | `command_center.read` | **`command_center`** | Yes (if visible) | **NO** if module off |
| projects | פרויקטים | `/projects` | `projects.read` | — | Yes* | YES |
| jobs | עבודות | `/jobs` | `projects.read` | `jobs` (or forced by work mix) | Cond. | Often NO |
| workOrders | קריאות שירות | `/work-orders` | `service.read` | `service` | No | Often NO |
| dispatch | לוח שירות | `/dispatch` | service/dispatch | `service` | No | Often NO |
| expenses | הוצאות | `/expenses` | `expenses.read` | — | Yes* | YES |
| clients | לקוחות | `/clients` | `clients.read` | `clients` | No | Often NO |
| quotes | הצעות מחיר | `/quotes` | `quotes.read` | `quotes` | No | Often NO |
| crm | צינור מכירות | `/crm` | `crm.read` | `crm` | No | Usually NO (no profile enables CRM) |
| changes | שינויים ותוספות | `/changes` | `changes.read` | `changes` | No | Cond. |
| billing | חיובים וגבייה | `/billing` | `billing.read` | `billing` | No | Cond. |
| recurringDrafts | טיוטות חוזרות | `/recurring-drafts` | expenses/AP/billing* | — | No | YES (perm) |
| reports | דוחות | `/reports` | `project_financials.read` | — | No | YES |
| vendors | ספקים | `/vendors` | `vendors.read` | `vendors` | No | Cond. |
| workforce | עובדים | `/workforce/employees` | `workforce.read` | **none** (discoverable) | No | YES |
| time | שעות | `/workforce/time` | time* | — | No | YES |
| attendance | נוכחות | `/workforce/attendance` | attendance* | — | No | YES |
| timesheets | גיליונות שעות | `/workforce/time/approvals` | `time.approve` | — | No | YES (Owner) |
| scheduling | יומן צוות | `/scheduling` | `scheduling.read` | — | No | YES |
| procurement | רכש | `/procurement` | `procurement.read` | `procurement` | No | Rare (GC only by profile) |
| vendorBills | חשבונות ספקים | `/procurement/ap` | `ap.read` | — | No | YES (perm) |
| materials | חומרים | `/procurement/materials` | `materials.read` | `materials` | No | Cond. |
| fieldOps | עבודה בשטח | `/field-ops` | `field_ops.read` | `field_ops` | No | Cond. |
| safety | בטיחות | `/safety` | `safety.read` | — (nav) | No | YES perm / module soft |
| forms | טפסי שטח | `/forms` | `forms.read` | `forms` | No | Cond. |
| serviceRecurring | שירות חוזר | `/service/recurring` | `service.read` | `service` | No | Cond. |
| documents | מסמכים | `/documents` | `documents.read` | `documents` | No | Cond. |
| imports | ייבוא | `/imports` | multi manage | — | No | YES |
| assets | צי ותחזוקה | `/assets` | `assets.read` | `assets` | No | Cond. |
| compliance | ביטוחים וציות | `/compliance` | `compliance.read` | `compliance` | No | Usually NO |
| approvals | אישורים | `/approvals` | `approvals.read` | `approvals` | No | Cond. |
| monthClose | סגירת חודש | `/month-close` | `month_close.read` | soft | No | YES nav |
| overhead | תקורה | `/overhead` | `expenses.read` | `overhead` | No | Usually NO |
| settings | הגדרות | `/settings` | — | — | No | YES |

\* Mobile: at most **4** `primaryOnMobile` items (`mobile-nav.tsx` `.slice(0, 4)`). With Today ON + Projects + Expenses + Dashboard, the 5th primary (often Expenses under mixed mix) drops to **עוד**.

### 2.3 Top bar / chrome

| Control | HE | Notes |
|---------|----|-------|
| Global search | placeholder: «חיפוש או מעבר - פרויקטים, חשבוניות, ספקים…» | Opens search UI |
| Quick create | «חדש» | Menu of create actions from `nav.newMenu` |
| Notifications | התראות | Bell → `/notifications` |
| User menu | פרופיל / התנתקות | + org switcher «עסק» |
| Org switcher | עסק / יצירת עסק חדש | |

### 2.4 Mobile bottom bar

- Max 4 destinations + **עוד**
- Default Owner (module off): typically לוח בקרה · פרויקטים · הוצאות · (+ 4th if another primary) · עוד  
- **היום never appears** if `command_center` module false — not merely capped into More; it is **filtered out of `items` entirely**.

---

## 3. Confirmed Today problem

### Answers A–J

| # | Answer |
|---|--------|
| **A** | Yes. `/today` exists (`today/page.tsx`). `/inbox` redirects to `/today`. |
| **B** | Yes by URL if Owner has `command_center.read`. If module OFF → page loads with empty state «היום כבוי» + link to Features (if `settings.manage`). If no permission → redirect `/`. |
| **C** | Nav filtered: `module: 'command_center'` and `modules.command_center === false`. |
| **D** | **No** for normal Owner (Owner template includes `command_center.read`; migration 0024 backfilled permission). |
| **E** | **Yes — primary root cause.** Default module visibility OFF when no preference / no firstUsedAt. |
| **F** | Profile can leave it off (many trades omit it). Work mix does **not** hide Today. Onboarding default profile often `none` → no modules enabled. |
| **G** | Same filter on desktop — not desktop-specific. |
| **H** | Mobile cap is **not** why it’s missing when module off. When module on, Today is early in primary list and usually stays in the bar. |
| **I** | Product intent today: **only when module ON**. Contrast: Workforce nav is permission-only so Owners can discover it. Today was **not** given that treatment. Marketing homepage *promises* Today. |
| **J** | Safest product corrections (describe only): (1) Ops: Features → היום → פעיל; (2) Code: default `command_center` ON for Owners / new orgs + backfill preferences; or nav permission-only like workforce; (3) Add to all business profiles. **Do not** “fix” via mobile order alone. |

### Evidence snippets

- Nav gate: `navigation.ts` today item `permission: COMMAND_CENTER_READ`, `module: 'command_center'`.
- Filter: `if (item.module && !modules[item.module]) return false`.
- Page: `today/page.tsx` returns `module_off` empty state.
- Copy: `commandCenter.moduleOff.title` = «״היום״ כבוי».
- Features label: `settings.modules.command_center` = «היום».
- Profiles enabling command_center: GC, RENOVATION, MAINTENANCE, FIELD_SERVICE, FM, MIXED, PM only.
- No `noteModuleUsage('command_center')` → never auto-on from use.

**Severity: CRITICAL** (marketed capability invisible to default Owner).

---

## 4. Homepage map

Public signed-out `/` → `PublicHomepage`. Section order:

| # | Section id | Heading (HE) | Supporting / body | CTA | Image |
|---|------------|--------------|-------------------|-----|-------|
| 1 | hero | מנהלים את העבודה. מבינים את הכסף. | לעסקי פרויקטים… רואים מה דורש טיפול עכשיו… | התחילו עכשיו / ראו איך זה עובד | Desktop: sc-02 financials SVG; Mobile: sc-08 |
| 2 | questions-problem | השאלות שכל בעל עסק שואל | 4 question chips | — | — |
| | | העסק רץ. הכסף מפוזר. | 3 problem cards | — | — |
| 3 | how-it-works | מהלקוח ועד הרווח - בזרימה אחת | 6 steps + support | — | — |
| 4 | capabilities | מה אפשר לנהל | 6 capability cards | — | sc-04 “invoice” SVG |
| 5 | financial | העבודה והכסף - באותה תמונה | items + insights | התחילו עכשיו | sc-02 |
| 6 | commercial | מה השתנה, מה חויב ומה באמת שולם | 3 blocks | — | sc-05 + sc-06 |
| 7 | product-tour | כך ProjectFlow נראית בעבודה | 7 tabs | התחילו עכשיו | tour SVGs |
| 8 | advanced | שליטה יומית - ועוד עומק כשצריך | module chips | — | — |
| 9 | mobile | מהמשרד ומהשטח - באותה מערכת | PWA install | — | sc-08 |
| 10 | audience | מתאימה לעסקי פרויקטים ושירות | audience chips + team | — | — |
| 11 | faq | שאלות נפוצות | 4 groups × 4 Qs | — | — |
| 12 | final-cta | רוצים לראות מה באמת קורה בעסק? | body | התחילו עכשיו | — |

**Marketing vs product truth:** Hero/capabilities advertise «פותחים את היום» but default Owner may never see היום in app nav (Part 3).

---

## 5. Homepage screenshot mismatch table

All assets under `public/marketing/screenshots/`. Generator: `scripts/generate-marketing-screenshots.mjs` (synthetic SVG chrome).

| File | Homepage use | Claims | Real route | Verdict | Key mismatches |
|------|--------------|--------|------------|---------|----------------|
| pf-landing-sc-01-desktop.svg | Tour «היום» | Today inbox | `/today` | **FALSE/MISLEADING** | Fake sidebar (היום/פרויקטים/לקוחות/ספקים/דוחות) ≠ real shell (לוח בקרה + conditional items). Fake list cards. Today often invisible to Owner. |
| pf-landing-sc-02-desktop.svg | Hero + Financial + Tour כספים | Project financials KPIs | `/projects/[id]` tab כספים or `/financials` | **PARTIAL** | KPI names approximate; chrome/sidebar fake; real UI denser with hints/drilldowns. |
| pf-landing-sc-03-desktop.svg | Tour פרויקט | Project hub | `/projects/[id]` | **PARTIAL** | Tabs shown (סקירה/כספים/…) roughly exist; order/labels differ; fake activity strip. |
| pf-landing-sc-04-desktop.svg | Capabilities + Tour חשבונית | Invoice review | `/documents/ocr-review` | **FALSE/MISLEADING** | Invented split preview/approve UI; real OCR review is different; OCR gated by flag + settings; not always discoverable. |
| pf-landing-sc-05-desktop.svg | Commercial changes | Changes list | `/changes` | **PARTIAL** | Status chips ok conceptually; layout not real list. |
| pf-landing-sc-06-desktop.svg | Commercial + Tour גבייה | Billing/collections | `/billing` | **PARTIAL** | Totals concept ok; not real billing table. |
| pf-landing-sc-07-desktop.svg | Tour דוחות | PDF packs | `/reports` / preview | **PARTIAL** | Pack names loosely match report kinds; UI invented. |
| pf-landing-sc-08-mobile.svg | Hero mobile + Mobile section | Mobile Today | mobile shell + `/today` | **FALSE/MISLEADING** | Fake bottom nav labels; Today may be off. |
| pf-landing-sc-09-mobile.svg | (legacy / unused in current tour?) | Placeholder lineage | — | **FALSE/MISLEADING** | Stale placeholder style historically. |
| pf-landing-sc-10-mobile.svg | (legacy) | — | — | **FALSE/MISLEADING** | Same. |
| pf-landing-sc-11-desktop.svg | Tour התראות | Early warnings | project financials / forecast panel | **PARTIAL** | Warning themes exist in `forecast.json`; panel UI not matching SVG. |

**Counts:** MATCH = **0** · PARTIAL = **6** · FALSE/MISLEADING = **5** (counting primary used assets; legacy 09/10 also FALSE if still served).

**Recommendation (do not implement):** replace every marketing SVG with a real Hebrew RTL capture from a seeded demo org (module `command_center` ON), or faithful crop of live components — never regenerate fake sidebars.

---

## 6. Global terminology map

| Internal concept | HE variants in product today | EN exposed | Recommended primary HE (proposal only) | Notes |
|------------------|------------------------------|------------|----------------------------------------|-------|
| Project | פרויקט | — | פרויקט | Clean |
| Job | עבודה / עבודות | — | עבודה | vs פרויקט must stay clear |
| Work Order | קריאת שירות / הזמנת עבודה (search kinds) | — | קריאת שירות | Inconsistency with search kind labels |
| Client | לקוח | — | לקוח | Clean |
| Contact | איש קשר | — | איש קשר | |
| Quote (pre-project) | הצעת מחיר / מכרזים / הצעות לפני פרויקט | CRM, Quote | הצעת מחיר | Hub over-explains |
| Opportunity | הזדמנות | CRM | הזדמנות | |
| Contract | חוזה / סכום חוזה / חוזה נוכחי נטו | — | חוזה | «נטו» overused in titles |
| Change | שינוי / תוספת / בקשת שינוי / שינויים ותוספות | — | שינוי / תוספת | |
| BOQ | כתב כמויות / חשבונות חלקיים / מדידה | BOQ (exports) | כתב כמויות | |
| Budget | תקציב | — | תקציב | |
| Expense | הוצאה | — | הוצאה | |
| Actual cost | עלות בפועל / בפועל נטו | Actual (removed from many strings but concept remains in keys) | עלות בפועל | Hints still engine-like |
| Commitment | התחייבויות / התחייבויות שנותרו | — | התחייבות (לספק/רכש) | |
| Forecast | תחזית / עלות סופית משוערת | — | תחזית עלות | |
| Billing | חיוב / חיובים וגבייה / סכום חשבוניות | — | חיוב ללקוח | |
| Payment | תשלום / שולם | — | תשלום | |
| Outstanding | יתרה לגבייה מזומן / פתוח | — | יתרה פתוחה | «מזומן» confuses |
| Retention | עיכבון | — | עיכבון | |
| Vendor | ספק | — | ספק | |
| Supplier invoice | חשבון ספק | AP (avoided in UI) | חשבון ספק | |
| Vendor credit | זיכוי ספק | — | זיכוי ספק | |
| Purchase order | הזמנת רכש | PO | הזמנת רכש | |
| Receiving | קבלה | — | קבלת סחורה | |
| Subcontractor | קבלן משנה | — | קבלן משנה | |
| Subcontract agreement | הסכם קבלן משנה | — | הסכם קבלן משנה | |
| Employee | עובד | — | עובד | |
| Assignment | שיוך | — | שיוך לפרויקט | |
| Time entry | דיווח שעות / שעות | — | דיווח שעות | Prefer over «timesheet» EN |
| Timesheet | גיליון שעות / גיליונות שעות | — | גיליון שעות | |
| Attendance | נוכחות | — | נוכחות | |
| Break | הפסקה | — | הפסקה | |
| Resource booking | שיבוץ | — | שיבוץ | |
| Dispatch | לוח שירות | — | לוח שירות | |
| Daily log | יומן עבודה / יומן שטח | — | יומן עבודה | Mixed «שטח» |
| Punch | רשימת ליקויים / ליקוי / **רשימות תיקונים** (fieldOps.description) | Punch | רשימת ליקויים | **Wrong term in description** |
| Inspection | בדיקה | — | בדיקה | |
| Safety | בטיחות | HSE (mostly removed) | בטיחות | |
| Form | טופס / טפסי שטח / רשימת בדיקה | — | טופס שטח | |
| Inventory | מלאי / כמות תפעולית | FIFO (EN banner) | מלאי (כמות) | |
| Material | חומר | — | חומר | |
| Asset | נכס / ציוד / צי | — | ציוד / רכב | Nav «צי ותחזוקה» |
| Document | מסמך | — | מסמך | |
| Invoice reading | בדיקת חשבונית / סריקת קבלות / קריאת מסמך | OCR in routes/settings keys | בדיקת חשבונית | Settings title «סריקת קבלות» |
| Approval | אישור / ממתינים | — | אישור | |
| Month close | סגירת חודש | — | סגירת חודש | |
| Saved view | תצוגות שמורות | — | תצוגה שמורה | |
| Notification | התראות | — | התראה | Distinct from Today |
| Today | היום / תיבת העבודה | command center | היום | |
| Dashboard | לוח בקרה | — | לוח בקרה | |
| Report / PDF | דוחות / חבילות דוחות PDF | PDF, CSV | דוח / PDF | |
| Archive | העברה לארכיון / בארכיון | — | ארכוב | |
| Void | מבוטל | void | ביטול רישום | Status «מבוטל» shared |
| Correction | תיקון | — | תיקון | |
| Draft | טיוטה | — | טיוטה | |
| Finalized | סופי / מאושרת לעלות | finalized/posted | Depends on domain | Expense ≠ billing |

---

## 7. Shared buttons / statuses map

### Buttons (`common.actions` + module overrides)

| Action | Standard HE | Other variants found | Issue |
|--------|-------------|----------------------|-------|
| Save | שמירה | שמירת תבנית / שמירת שינויים / שמירת תשלום | OK if specific |
| Cancel | ביטול | — | OK |
| Close | סגירה | שמירה וסגירה | OK |
| Create | יצירה | יצירת X / X חדש | Mix create vs new |
| Add | הוספה | — | OK |
| Edit | עריכה | — | OK |
| Delete | מחיקה | — | OK |
| Archive | העברה לארכיון | ארכיון | Prefer one |
| Restore | שחזור | — | OK |
| Approve | אישור | אישור ויצירת שינוי מאושר | Long CTAs |
| Reject | דחייה | — | OK |
| Submit | (no single common) | סימון כממתין לאישור / הגשה / שליחה | Ambiguous |
| Continue | — | המשך (module-specific) | |
| Back | חזרה | — | OK |
| Retry | נסו שוב | — | OK |
| Search | חיפוש | — | OK |
| Filter | סינון | ניקוי סינון | OK |
| Import | ייבוא | — | OK |
| Export | ייצוא | — | OK |
| Download | הורדה | — | OK |
| Upload | העלאה | — | OK |
| New menu | חדש | — | OK |

### Statuses (`status.json`)

| Domain | Draft | Approved / done | Problem |
|--------|-------|-----------------|---------|
| Project | טיוטה | פעיל / הושלם / בוטל / בארכיון | OK |
| Change | טיוטה | ממתין לאישור / מאושר / נדחה | OK |
| Billing | טיוטה | **סופי** / מבוטל | «סופי» unclear vs «נשלח ללקוח» |
| Expense | טיוטה | **מאושרת לעלות** / מבוטל | Jargon-ish |
| Quote version | טיוטה | **נשלחה** / התקבלה | «נשלחה» may imply email |
| Estimate quote | … | **נשלח** | Same risk |
| Payment | — | שולם / פתוח / באיחור | OK |
| Punch | פתוח | בטיפול / הושלם | OK |
| Inspection | מתוזמן | עבר / נכשל | OK |

---

## 8. Page-by-page map (high-signal surfaces)

> Full route inventory is in §8B. Below: concrete wording problems for Owner-critical screens.

### Route: `/` (signed-in dashboard)

- **Title:** לוח בקרה  
- **Purpose:** Home summary + quick actions  
- **Reach:** Default after login  
- **Perm/module:** Always  
- **Primary actions:** יצירת פרויקט / עבודה / קריאת שירות; quickActions  
- **Problem wording:** Attention block is good; business summary may still over-disclose financial separations (dashboard disclosures historically).  
- **Suggested direction:** Keep short; link to Today when module on.  
- **Severity:** MEDIUM  

### Route: `/today`

- **Title:** היום  
- **Subtitle:** «מה שדורש טיפול עכשיו - תיבת העבודה, לא פעמון ההתראות.»  
- **Problem:** Explains against notifications; «תיבת העבודה» abstract.  
- **moduleOff:** «״היום״ כבוי» / «הפעילו את ״היום״ בהגדרות ← יכולות…»  
- **Severity:** CRITICAL (discoverability) + MEDIUM (copy)  

### Route: `/projects`

- **Title:** פרויקטים  
- **Empty body:** «פרויקטים, עבודות וקריאות שירות חולקים אותה רשומה כספית - הרשימה הזו היא סביבת הפרויקט, לא ספר חשבונות נפרד.»  
- **Why bad:** Developer/architecture teaching; «רשומה כספית».  
- **Suggested:** «כאן מנהלים את הפרויקטים. אפשר גם לפתוח עבודות וקריאות שירות.»  
- **Severity:** HIGH  

### Route: `/projects/[id]` (tabs)

- Tabs HE: סקירה, כספים, הוצאות, צוות, שימוש, לוח זמנים, שינויים ותוספות, כתב כמויות, חיובים וגבייה, תקציב, שעות, מסמכים, תחומי עבודה, פרטים  
- **Conditional:** changes/boq/billing/budgets/documents by module+perm  
- **Severity:** MEDIUM (tab density / discoverability)  

### Route: project financials / `financial.*`

- **Title:** כספים של הפרויקט / סכום חוזה נוכחי נטו  
- **KPI hints example:** `actualCostHint` long paragraph about month-close corrections, VAT, drafts.  
- **Why bad:** Engine documentation in UI.  
- **Suggested:** Short: «סכום העלויות שכבר נרשמו לפרויקט (בלי מע״מ ובלי טיוטות).»  
- **Severity:** HIGH  

### Route: `/quotes`

- **Title:** הצעות מחיר לפני פרויקט  
- **Description:** «…לא חשבונית, לא הצעה במכירות, לא הצעת שינוי… ולא הכנסה…»  
- **Hub:** «שלושה אובייקטים נפרדים - לא אותה טבלה.»  
- **Why bad:** Category B+C+G — teaches schema.  
- **Suggested:** «הצעות מחיר ללקוח לפני שמתחילים עבודה.»  
- **Severity:** HIGH  

### Route: `/sales`

- Hub explaining Quotes vs CRM vs Changes vs Billing — same over-explanation pattern.  
- **Severity:** HIGH  

### Route: `/field-ops`

- **description:** «יומני עבודה, **רשימות תיקונים** ובדיקות…»  
- **nav.punch:** «רשימת ליקויים»  
- **Why bad:** Wrong terminology (E) — תיקונים ≠ ליקויים.  
- **Severity:** HIGH  

### Route: `/expenses`

- Status finalized: «מאושרת לעלות»  
- **Severity:** MEDIUM  

### Route: `/billing`

- Status «סופי»; title «חיובים וגבייה» OK  
- **Severity:** MEDIUM  

### Route: `/procurement/ap`

- Title «חשבונות ספקים» OK after cleanup  
- **Severity:** LOW–MEDIUM  

### Route: `/settings/features`

- Modules list includes «היום»; modes אוטומטי/פעיל/כבוי  
- Owner must know to come here — poor discoverability for Today  
- **Severity:** CRITICAL (discoverability UX)  

### Route: `/documents/ocr-review`

- Title uses document-reading copy; route path still `ocr-review`  
- Gated by OCR flag + permissions  
- **Severity:** MEDIUM  

### Route: `/settings/api`, `/settings/banking`

- Technical admin surfaces; banking warns nothing posts until user acts — OK intent, still dense  
- **Severity:** MEDIUM (settings language)  

### Portal routes `/portal*`, `/settings/portal`

- **OFF** (`notFound`) — correct  
- **Severity:** CLEAN (for portal off policy)  

---

## 8B. Route inventory (condensed)

**~144 `page.tsx` files** under `src/app/[locale]/` (auth + app + portal + setup/onboarding).  

Groups: Public/Auth · Dashboard/Today · Projects/Jobs/WO · Changes/Billing/Expenses · CRM/Quotes/Clients/Vendors · Procurement/AP · Field/Safety/Forms/Docs · Assets/Compliance · Workforce/Scheduling · Reports/Approvals/Month-close · Settings (~20 sections) · Portal OFF.

(See agent inventory for per-route HE titles/CTAs/gates — used as source for this map.)

**Dialogs/modals:** confirm archive/void/approve/reject, engagement end/cancel, OCR confirm, banking match decide, saved views, quick create sheet, mobile More sheet — typically use `common.actions` + module strings. Exact dialog audit should be done per module in correction phase with UI open.

---

## 9. Dialog-by-dialog findings (representative)

| Surface | Trigger | Current HE (examples) | Issue | Severity |
|---------|---------|----------------------|-------|----------|
| Change approve | `/changes/.../approve` | אישור ויצירת שינוי מאושר | Long / process jargon | MEDIUM |
| Quote issue | quote actions | issued status «נשלחה» | Implies email | HIGH |
| Expense finalize | expense detail | מאושרת לעלות | Unclear | MEDIUM |
| Today actions | inbox | סימון כטופל / דחייה ל-7 ימים | OK | LOW |
| Vendor engagement | vendors | התקשרות עם ספק אינה יוצרת הוצאה בפועל | Better after cleanup; still explanatory | LOW |
| Features toggle | settings | אוטומטי / פעיל / כבוי | «אוטומטי» obscure | MEDIUM |

---

## 10. Errors / warnings / empty states

| Category | Example | Issue | Suggested direction |
|----------|---------|-------|---------------------|
| Empty projects | רשומה כספית / לא ספר חשבונות | Architecture | Plain empty CTA |
| Today module off | היום כבוי + Features | Correct but feature should be on by default | Product + soft copy |
| Financial KPI hints | Long Actual/VAT/month-close text | Engine docs | One short sentence |
| Quotes empty/hub | אובייקטים / טבלה | Dev language | Business language |
| Permission denied | (shared errors) | Check for permission key leakage in `errors.json` | Human sentence |
| OCR failed | קריאת מסמך נכשלה | OK | Keep simple |
| Banking | עד שתפעלו במסכים המתאימים | OK caution | Keep |
| Validation | currency mismatch etc. | Mostly OK | Spot-check EN residue |

---

## 11. Mobile-specific findings

1. Bottom bar **hard cap 4** + עוד.  
2. Today only appears if module on; then competes with Dashboard/Projects/Expenses/Jobs.  
3. Marketing mobile SVG invents bottom labels.  
4. FAB quick-create hidden on focused `/new`/`/edit` paths (`isFocusedComposerPath`).  
5. Field/OCR camera flows — mobile-critical; wording should stay short.

---

## 12. Settings / admin-language findings

| Section HE | Path | Owner sees? | Language risk |
|------------|------|-------------|---------------|
| העסק | `/settings/business` | Yes | Profiles OK |
| אנשים ותפקידים | `/settings/people` | Yes | OK |
| יכולות | `/settings/features` | Yes (`settings.manage`) | Module list jargon (API, etc.) |
| סריקת קבלות | `/settings/ocr` | Conditional flag; hideFromNav | Technical |
| API ו-webhooks | `/settings/api` | api.manage | Admin — OK if framed |
| בנקאות | `/settings/banking` | banking.* | Dense |
| גישת פורטל | `/settings/portal` | **notFound OFF** | — |
| יומן פעילות | `/settings/activity` | audit.read | «פריט» vs entity |
| מספור מסמכים | `/settings/numbering` | org.read | Long explanations |

**Candidates to hide/simplify for normal Owner:** API, OCR ops internals, portal foundation, raw numbering prose.

---

## 13. Business-profile / module discoverability

- **Default new org:** all optional modules **OFF**.  
- **Profiles enable-only** (never disable others).  
- **No DB backfill** when new module keys ship → existing orgs stay off.  
- **Today (`command_center`):** OFF by default; only some profiles; no usage auto-enable → **poor discoverability**.  
- **Workforce:** intentionally always in nav with permission — model to copy for Today.  
- **CRM / overhead / compliance / api:** never/rarely enabled by profiles.  
- Owner path to enable: **הגדרות → יכולות** or apply **פרופיל עסקי**.

---

## 14. CRITICAL findings

1. היום invisible to default Owner (module OFF) while homepage markets it.  
2. Marketing screenshots are synthetic / misleading (0 true MATCH).  
3. Quotes/Sales hub language exposes internal object model («אובייקטים», «טבלה»).  

## 15. HIGH findings

1. Projects empty state «רשומה כספית».  
2. Financial KPI hints read like engine docs.  
3. Field Ops description «רשימות תיקונים» vs nav «ליקויים».  
4. Quote status «נשלחה» may imply email.  
5. Many valuable modules invisible until Features — Owner doesn’t know they exist.  
6. Outstanding label «יתרה לגבייה מזומן» confusing.  

## 16. MEDIUM findings

1. Expense status «מאושרת לעלות».  
2. Billing status «סופי».  
3. Today subtitle vs notifications over-explained.  
4. Settings Features «אוטומטי» mode unclear.  
5. Tab overload on project workspace.  
6. Search kind labels vs nav labels (הזמנת עבודה vs קריאת שירות).  
7. Banking/API density.  

## 17. LOW findings

1. Archive verb length «העברה לארכיון».  
2. Minor hyphen/punctuation already normalized in many places.  
3. Duplicate create vs new CTAs.  

## 18. Clean areas

1. Portal OFF enforced.  
2. Core nav labels short (לוח בקרה, פרויקטים, הוצאות, הגדרות).  
3. Common actions base set coherent.  
4. Punch list naming in nav («רשימת ליקויים») after prior cleanup — except fieldOps.description mismatch.  
5. Owner permission model generally complete.  

## 19. Recommended correction order

1. **Today discoverability** (product default/backfill/nav policy) — before more copy.  
2. **Homepage screenshots** — real captures with modules ON.  
3. **Quotes/Sales hub** — strip object/table language.  
4. **Projects empty + Financial hints** — shorten.  
5. **Terminology lock** (Owner dictionary) then sweep statuses/buttons.  
6. **Field Ops description** fix תיקונים→ליקויים.  
7. **Module discoverability** UX (empty states pointing to Features; profile defaults).  
8. Remaining MEDIUM/LOW screens page-by-page per Owner instructions.  

---

## Appendix A — Owner post-login experience (default modules OFF)

1. **First page:** לוח בקרה `/`  
2. **Top bar:** search, חדש, notifications, user  
3. **Sidebar core:** לוח בקרה, פרויקטים, הוצאות, הגדרות  
4. **Mobile:** ~3–4 of those + עוד  
5. **Today:** **not in nav**; `/today` shows כבוי  
6. **Hidden modules:** clients, billing, vendors, documents, changes, quotes, command_center, … until Features/profile  
7. **Always findable:** עובדים, שעות, נוכחות, דוחות, ייבוא, חשבונות ספקים (perm), סגירת חודש (nav)  
8. **Why important features “built but invisible”:** optional module gate + no backfill + marketing assumes modules ON  

---

## Appendix B — Screenshot generator truth

`scripts/generate-marketing-screenshots.mjs` builds SVG with hardcoded Hebrew strings and fake nav. It is **not** wired to live React components. Any future marketing asset must start from authenticated demo UI.

---

**END OF MAP — WAITING FOR OWNER/CHATGPT CORRECTION PLAN**
