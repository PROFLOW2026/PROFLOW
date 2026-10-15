# ProjectFlow — ביקורת מצב נוכחי עצמאית (אוקטובר 2026)

**מזהה דוח:** `PROJECTFLOW_FRESH_CURRENT_STATE_AUDIT_2026-10`  
**מתודולוגיה:** קוד מקור, סכמת Drizzle, מיגרציות, בדיקות unit/integration רלוונטיות, Production Vercel, שאילתות DB **קריאה בלבד** — **ללא** הסתמכות על דוחות ביקורת קודמים, **ללא** E2E דפדפן, **ללא** שינויי מערכת.

> **עדכון 15.10.2026:** ממצאי FCA-2026-* מדוח זה **טופלו/סווגו** ב-[CURRENT_FINDINGS_RESOLUTION_2026-10.md](./CURRENT_FINDINGS_RESOLUTION_2026-10.md).  
> הטבלאות למטה משקפות את **מצב הבaseline** `4a4763f7` לפני התיקונים — לא את HEAD לאחר סגירת הממצאים.

---

## א. מצב גרסה ו-Production

| פרמטר | ערך |
|--------|-----|
| **CURRENT HEAD** | `4a4763f723355a882376008c5b509c0464e3a1c9` |
| **ORIGIN MAIN** | `4a4763f723355a882376008c5b509c0464e3a1c9` (זהה ל-HEAD) |
| **PRODUCTION SHA** | `4a4763f723355a882376008c5b509c0464e3a1c9` — Vercel `proflow`, deployment `dpl_4qRfvT9Z5p2iWsUNgxnCX8qZEGac`, מצב **READY** |
| **LOCAL CHANGES** | לא משפיעים על Production: שינויים tracked — `.cursor/plans/sumit_integration_phase_0.plan.md`, `tests/e2e/.audit-route-fixtures.json`, `tests/e2e/.world.json`; untracked — תוכניות `.cursor/plans/*`, קבצים תחת `docs/audits/` (לא נכללו בביקורת). **אין** diff ב-`src/` מול HEAD. |
| **Deploy במקביל** | לא זוהה deploy פעיל (BUILDING) — האחרון ב-Production **READY** על אותו SHA. |
| **SHA שנבדק בקוד** | `4a4763f7` — תואם Production. |

**מסקנה:** קוד Production = `origin/main` = HEAD המקומי (לגבי `src/`). הביקורת מתייחסת ל-commit זה.

---

## ב. מצב DB ומיגרציות (כולל 0181)

| שאלה | תשובה |
|------|--------|
| **0181 FILE EXISTS** | **YES** — `drizzle/migrations/0181_owner_bms_installment_payment_backfill.sql` |
| **0181 JOURNAL REGISTERED** | **YES** — `drizzle/migrations/meta/_journal.json`, `idx` 179, tag `0181_owner_bms_installment_payment_backfill`, `when` 1789715040000 |
| **0181 PRODUCTION DB APPLIED** | **YES** (על בסיס DB שאליו מצביע `DATABASE_URL` / `DIRECT_DATABASE_URL` ב-`.env.local`) — רשומה ב-`drizzle.__drizzle_migrations`: `id` 190, `created_at` 1789715040000, hash תואם קובץ SQL |
| **0181 SCHEMA VERIFIED** | **YES** — probe קריאה (`scripts/eb1-0181-probe.mjs`): 9 שורות `expense_installment_payments` עם מפתחות `bms-owner-2026-01`…`09`, `voidAuditForLump` = 1, `paid_gross_amount` = 6516.72 על הוצאת BMS — תואם כוונת המיגרציה |
| **PRODUCTION DB EVIDENCE** | (1) טבלת מיגרציות: **191** רשומות = **191** tags ביומן; אחרון `created_at` 1789715700000 (0192). (2) אффектי 0181 על org Owner ב-DB. (3) Supabase MCP בחשבון המחובר מציג רק פרויקט LEO-KID — **לא** אימות נפרד דרך MCP ל-ProjectFlow DB. |

**DB ENVIRONMENT:** Postgres נגיש מקומית דרך `.env.local` (אותו DB שבו org `8ef9e353-…` קיים — מיושר לנתוני Owner ב-Production). **Development / Test DB נפרדים לא נבדקו.**

**מיגרציות ממתינות (repo ↔ DB מחובר):** **0** — journal 191, טבלה 191, tag אחרון ב-repo `0192_inventory_rls`.

**הערה:** הרצת `db:migrate` נוספת ב-Production דורשת `MIGRATION_APPROVED_TAGS` ואישור Owner נפרד — לא בוצע בביקורת זו.

---

## ג. תקציר מנהלים

ProjectFlow בגרסת Production `4a4763f7` הוא **פלטפורמת ERP/BMS לבנייה ושירות** עם כ-**103** מודולי דומיין, **416+** דפי App Router, שלושה משטחים (Owner `(app)`, Employee `/employee`, Contractor `/contractor`), RBAC ארגוני + יכולות פרויקט + scopes חיצוניים לקבלנים.

**חוזקות מאומתות בקוד:** מנוע פיננסי פרויקט (חיוב ≠ תשלום, commitment ≠ actual, CCV מאירועי חוזה, חודש סגור), פורטל קבלנים רחב עם capability gates, שרשרת CRM→הצעת מוצר→פרויקט (integration tests), UWM גלים 1–3 (boards, קישור משימות ל-quote/WO), SUMIT ואחסון ענן ממומשים, i18n 4 שפות / 88 namespaces ללא drift מפתחות.

**חולשות מאומתות:** redirect שגוי ב-`/workforce` ללא הרשאה (באג), דף `/employee/time` ריק ללא הרשאות, סטייה בין `PROJECT_PROFIT_READ` ל-`PROJECT_FINANCIALS_READ` ברווחיות עסקית, חשיפת סכומי claims בפורטל קבלן ללא `ext.contract.view_value`, ~27 קבצים עם `next/navigation` במקום i18n router.

**Runtime חזותי / E2E:** **NOT VERIFIED** — לא נכלל ב-scope.

**הכרעה:** **PARTIAL** — בעל עסק / מנהל עם תבנית manager/owner **יכול לעבוד** ביומיום רחב; תפקידים מוגדרים (מזכירה convert, finance AP, worker ב-UWM owner app) דורשים **הרשאות מותאמות**; דיוק כספי **WORKING** ברוב הכללים עם **2–3** נקודות enforcement/UI שדורשות תיקון.

---

## ד. מפת מודולים נוכחית (תמצית)

| אשכול | מודולים עיקריים (מ-`src/modules/*/index.ts`) |
|--------|-----------------------------------------------|
| ליבה / tenancy | `tenancy`, `rbac`, `identity`, `portal`, `branding` |
| פרויקטים | `projects`, `project-workspace`, `project-profile`, `connected-projects`, `commercial`, `boq`, `planning`, `subcontracts`, `subcontract-claims` |
| עבודה / UWM | `tasks`, `workspaces`, `calendar`, `scheduling`, `meetings`, `collaboration` |
| כספים | `billing`, `financials`, `expenses`, `ap`, `month-close`, `tax`, `ops-finance`, `banking`, `budgets`, `forecast` |
| CRM / מכירות | `crm`, `clients`, `quotes`, `service` |
| כוח אדם | `workforce`, `employee-app`, `field`, `field-ops` |
| רכש / נכסים | `procurement`, `vendors`, `material-market`, `assets` |
| קבלנים | `contractor-portal`, `contractor-access`, `contractor-compliance`, `contractor-procurement`, `dg-events`, `defects`, `rfi`, `submittals` |
| מסמכים / אינטגרציה | `documents`, `external-storage`, `invoicing-integration`, `integrations`, `api`, `automations`, `notifications`, `ocr` |
| תמיכה | `command-center`, `reports`, `search`, `assistant`, `compliance`, `safety`, … |

**ניווט Owner:** ~60 פריטים ב-`src/components/shell/navigation.ts`, מסונן לפי הרשאה, מודול אופציונלי, work mix, persona.

---

## ה. מפת משתמשים ותפקידים

מיפוי **קוד** (לא כל 19 personas הם roles נפרדים):

| Persona מבקשת | מימוש בקוד | משטח |
|----------------|------------|------|
| בעל עסק | `owner` role → `ALL_PERMISSION_KEYS` | Owner `(app)` |
| מנהל מערכת | **אין role נפרד** — ≈ owner org | — |
| מנהל פרויקט | `manager` + `project_manager_*` capabilities | Owner + Employee (מוגבל) |
| מנהל אתר | `site_manager` template | פרויקט |
| עובד שטח | `worker` / Employee + grants | Owner חלקי / Employee |
| עובד משרד | `manager` / Employee preset `secretary` | Owner / Employee |
| מזכירה | preset `secretary` | Employee + Owner CRM |
| מנהל חשבונות | `finance` + `project_accountant` | Owner |
| מנהל כספים | `finance` | Owner |
| קבלן (ראשי/משנה/מקצוע) | external grants (`contractor_admin`, `site_contractor`, …) | `/contractor` |
| יזם | profile `REAL_ESTATE_DEVELOPMENT`, `developer_gc` execution | connected-projects / developer tabs |
| אדריכל / יועץ / משרד תכנון | profiles `ARCHITECT`, `ENGINEERING_CONSULTANT`, `DESIGNER` | Owner — tasks, quotes, documents |

---

## ו. הרשאות ונגישות לפעולות

- **ארגון:** `loadEffectivePermissions` + `assertPermission` / `authorize` — `src/shared/permissions/`.
- **פרויקט:** `scopeOrgContextToProject`, `project_member_capabilities`.
- **קבלן:** `requireExternalScope`, RLS-bound executor — `contractor-access`.
- **הפרדת משטחים:** `assertOwnerAppSurface` vs `assertEmployeeAppContext`; proxy `decideContractorSurface`.

**סטטוס enforcement:** **WORKING** בשכבת application (ראיה: integration `rls-permission-gaps`, `sec-004-execution-nav-gate`). **RLS מלא ב-runtime:** **NOT VERIFIED** (מיגרציות RLS קיימות; לא נסкан DB policies).

---

## ז. עובדים ונוכחות

| יכולת | סטטוס | ראיה |
|--------|--------|------|
| Employee login / shell | **WORKING** | `employee/(shell)/layout.tsx`, `session-guard.ts` |
| שעון נוכחות / שעות | **WORKING** (עם grants) | `employee/time`, `workforce/attendance/actions.ts` |
| אישור שעות | **WORKING** | `TIME_APPROVE`, workforce time |
| עלות עבודה לפרויקט | **PARTIAL** | `project-labor-cost.ts`, tab פיננסי — אין hub workforce ייעודי |
| Redirect `/workforce` | **BROKEN** | FCA-2026-001 |

---

## ח. קבלנים ויזמים

| יכולת | סטטוס |
|--------|--------|
| פורטל — routes מימוש מלא | **WORKING** — `PORTAL_ROUTES` |
| DG / מסמכים / RFI / איכות | **WORKING** + capability gates |
| Claims / payments | **PARTIAL** — FCA-2026-006 (סכומים) |
| יזם / Dev+GC | **WORKING** בקוד — `connected-projects`, `/projects/.../developer/*`, SEC-004 gate |
| ניהול grants פנימי | **WORKING** — `contractor-access` |

---

## ט. מזכירות והנהלת משרד

| יכולת | סטטוס |
|--------|--------|
| CRM / לקוחות / ישיבות (Owner) | **WORKING** |
| Employee CRM (opportunities) | **PARTIAL** — פחות מ-Owner |
| Convert הצעה→פרויקט | **PARTIAL** — preset secretary **ללא** `quotes.manage` + `projects.create` (FCA-2026-G03) |
| שרשרת CRM→quote→project | **WORKING** (integration) — **NOT VERIFIED** ב-Playwright |

---

## י. הנהלת חשבונות ופיננסים

| יכולת | סטטוס |
|--------|--------|
| Billing / payments / expenses / AP | **WORKING** + month-close guards |
| Profitability / compose | **WORKING** — profit null בלי `PROJECT_PROFIT_READ` |
| Business profitability UI | **PARTIAL** — FCA-2026-004 |
| Finance role + AP posting | **PARTIAL** — FCA-2026-005 |
| SUMIT statutory | **WORKING** בקוד — **NOT VERIFIED** ללא credentials org |
| 0181 BMS installments | **WORKING** על DB מאומת |

---

## יא. פרויקטים ותכנון

| יכולת | סטטוס |
|--------|--------|
| פרויקט / חוזה / milestones | **WORKING** |
| Change orders מאושרים → CCV | **WORKING** — `commercial`, `contract-value.ts` |
| BOQ / progress / billing link | **WORKING** |
| Planning schedule vs UWM tasks | **PARTIAL** — שני מודלים + hint (Wave 1) |
| Connected projects | **WORKING** בקוד — sync E2E **NOT VERIFIED** |

---

## יב. מערכת משימות UWM

| יכולת | סטטוס |
|--------|--------|
| `/work`, boards, filters (Wave 3) | **WORKING** — `4a4763f7` |
| Workspaces / buckets | **WORKING** |
| Recurrence, dependencies, Gantt (tasks) | **WORKING** — CPM לא נתמך (by design) |
| קישור quote / work-order ↔ task | **WORKING** (Wave 2) |
| Worker/finance על `/work` | **PARTIAL** — אין `tasks.*` בתבנית (FCA-2026-G04) |
| `/workspaces` ללא module guard | **PARTIAL** — FCA-2026-009 |

---

## יג. רכש, ספקים ומלאי

| יכולת | סטטוס |
|--------|--------|
| Vendors / RFQ / PO / receive | **WORKING** |
| Materials vs inventory split | **WORKING** — מודולים נפרדים |
| AP בנתיב procurement | **WORKING** — AP לא תלוי module procurement (מכוון) |
| Material market | **WORKING** — `MATERIALS_READ` בלבד |

---

## יד. CRM והצעות מחיר

| יכולת | סטטוס |
|--------|--------|
| Pipeline CRM + product quotes | **WORKING** |
| CRM quote → product quote → convert | **WORKING** — tests integration |
| Won opportunity ידני חסום | **WORKING** — דורש convert |
| CRM-001/002 edges | **CONFIRMED** — tests `crm-001-002-convert-edges` |

---

## טו. מסמכים ואינטגרציות

| יכולת | סטטוס |
|--------|--------|
| Documents + versions | **WORKING** |
| Storage OAuth (Google/OneDrive/Dropbox/Box) | **WORKING** — env-gated |
| API v1 + webhooks | **WORKING** — admin DB path (מכוון) |
| SUMIT invoicing + expense worker | **WORKING** בקוד — cron `sumit-expense-worker` |
| Automations | **WORKING** |

---

## טז. אוטומציות

**WORKING** — `src/modules/automations/`, rules + safe actions; triggers מ-tasks/events. **Runtime volume / production rules:** **NOT VERIFIED**.

---

## יז. תהליכים עסקיים מלאים (22 זרימות)

| # | זרימה | סטטוס | הערה |
|---|--------|--------|------|
| 1 | לקוח → CRM → הצעה → פרויקט → חוזה | **WORKING** | integration tests |
| 2 | ביצוע → חיוב → גבייה → רווחיות | **WORKING** / UI profit **PARTIAL** |
| 3 | עובד → נוכחות → שעות → אישור → פרויקט | **WORKING** |
| 4 | יזם → קבלנים → חוזים → claims → תשלומים | **WORKING** / claims UI **PARTIAL** |
| 5 | ספק → RFQ → PO → אספקה → AP → תשלום | **WORKING** |
| 6 | שינוי עבודה → אישור → CCV → תקציב | **WORKING** |
| 7 | משימה → ביצוע → שעות → התקדמות | **WORKING** |
| 8 | משרד תכנון → משימות → תוכניות → שעות | **PARTIAL** — planning vs tasks |
| 9 | שירות → WO → ביצוע → חיוב | **WORKING** |
| 10 | הנה"ח → מסמך נכנס → AP | **WORKING** |
| 11 | הוצאות כלליות → הקצאה → רווחיות | **WORKING** |
| 12 | מסמכים → ענן → שיוך → הרשאות | **WORKING** |
| 13 | התראות → automations | **WORKING** |
| 14 | Month close → תיקונים | **WORKING** |
| 15 | SUMIT חשבונית מס | **PARTIAL** — תלוי חיבור org |
| 16 | Contractor portal E2E | **NOT VERIFIED** browser |
| 17 | Employee office daily | **WORKING** |
| 18 | BOQ → progress → billing | **WORKING** |
| 19 | Connected developer ↔ GC | **WORKING** code |
| 20 | Installment expense payments | **WORKING** + 0181 verified |
| 21 | Quote ↔ task link (Wave 2) | **WORKING** |
| 22 | Board saved views / filters (Wave 3) | **WORKING** |

---

## יח. חוויית משתמש ועיצוב (קוד בלבד)

- **IA:** Settings מקובצים; אינטגרציות תחת Settings — **INTENTIONAL DESIGN**.
- **עומס ניווט:** 60 פריטים — מסונן דינמית — **PARTIAL** (תלוי הגדרות org).
- **Today vs Command Center:** `/today` בלבד — FCA-2026-G02.
- **RTL / i18n:** `he-IL` default, `dir` על document — **WORKING** בקוד.
- **ניווט locale:** FCA-2026-008 — סיכון **HIGH** ב-client filters.

**נראות ויזual / mobile scroll:** **NOT VERIFIED**.

---

## יט. מובייל ונגישות

- Mobile nav Owner / Contractor / Employee — **WORKING** (מבנה קוד).
- `LtrIsland` / `dir="ltr"` למספרים — נפוץ.
- ARIA / labels — **NOT VERIFIED** סריקה מלאה; spot checks ב-Radix components — **PARTIAL**.

---

## כ. ממצאים חדשים מאומתים

### CONFIRMED BUG

| ID | חומרה | תיאור | קוד | ודאות |
|----|--------|--------|-----|--------|
| **FCA-2026-001** | HIGH | `/workforce` מפנה ל-`/workforce/employees` גם בלי `WORKFORCE_READ` / time / attendance — שגיאת הרשאה צפויה | `src/app/[locale]/(app)/workforce/page.tsx` L20 fallback | CONFIRMED |
| **FCA-2026-004** | MEDIUM | `getBusinessProfitability` — `canReadProfit` משתמש ב-`PROJECT_FINANCIALS_READ` במקום `PROJECT_PROFIT_READ` | `get-business-profitability.ts` L58 | CONFIRMED |
| **FCA-2026-006** | MEDIUM | פורטל קבלן — רשימת claims מציגה סכומים בלי `ext.contract.view_value` | `subcontract-claims` external + UI | CONFIRMED |
| **FCA-2026-008** | HIGH | ~27 קבצי client משתמשים ב-`next/navigation` במקום `@/shared/i18n/navigation` | grep `from 'next/navigation'` ב-client components | CONFIRMED |

### CONFIRMED PRODUCT GAP

| ID | תיאור |
|----|--------|
| **FCA-2026-G01** | אין role platform/sysadmin — רק owner org |
| **FCA-2026-G02** | אין URL `/command-center` — `/today` |
| **FCA-2026-G03** | preset secretary — CRM חזק, convert quote→project דורש grants נוספים |
| **FCA-2026-G04** | worker/finance — אין `tasks.*` — UWM owner app למנהלים בעיקר |
| **FCA-2026-005** | finance template — `AP_READ` בלי `AP_MANAGE` (מכוון?) — חוסם posting AP |

### UX ISSUE — CODE EVIDENCE

| ID | תיאור |
|----|--------|
| **FCA-2026-002** | `/employee/time` ריק ללא הרשאות time/attendance |
| **FCA-2026-003** | `/today` redirect שקט ל-`/` בלי `COMMAND_CENTER_READ` |
| **FCA-2026-007** | documents contractor — בחירת grant ראשון ב-multi-grant |
| **FCA-2026-009** | `/workspaces` — חסר `work_management` module check על הדף |

---

## כא. פערים שאינם באגים

- אין sysadmin — **INTENTIONAL** (tenant-scoped product).
- Planning CPM — **INTENTIONAL** (`LIMITATION.md`).
- CRM sales quote vs product quote — **INTENTIONAL** dual model.
- CI — integration/E2E manual dispatch — **INTENTIONAL** lean CI.

---

## כב. יכולות שלא אומתו

- E2E דפדפן / Playwright convert flow
- מראה RTL/mobile בכל המסכים
- SUMIT / Google Drive ב-Production org ספציפי
- RLS policy enforcement מול כל טבלה
- Supabase project נפרד דרך MCP
- Deploy BUILDING concurrent

---

## כג. הכרעת מוכנות לפי תפקיד

| שאלה | תשובה |
|------|--------|
| האם בעל עסק יכול לעבוד? | **WORKING** — dashboard, today, הגדרות, כספים, פרויקטים |
| האם עובד יכול לעבוד? | **WORKING** — Employee app; **PARTIAL** — time page ריק בלי grants |
| האם מנהל עבודה יכול לעבוד? | **WORKING** — manager template + שטח |
| האם מזכירות יכולה לעבוד? | **PARTIAL** — CRM/ישיבות; convert deal **PARTIAL** |
| האם הנהלת חשבונות יכולה לעבוד? | **PARTIAL** — finance; AP posting **PARTIAL** (FCA-2026-005) |
| האם קבלן משנה יכול לעבוד? | **WORKING** — portal; סכומי claims **PARTIAL** |
| האם יזם יכול לנהל קבלנים? | **WORKING** — connected-projects (קוד) |
| האם אדריכל/יועץ יכול לעבוד? | **WORKING** — profiles + tasks/quotes; רכש לא default |
| האם המידע מתחבר? | **WORKING** — compose + links; **PARTIAL** — dual planning/tasks |
| האם המערכת נוחה? | **PARTIAL** — NOT VERIFIED UX מלא; nav מסונן |
| האם הנתונים הכספיים מדויקים? | **WORKING** — rules; **PARTIAL** — profitability gate UI |
| האם הרשאות נאכפות? | **WORKING** — app layer; RLS **NOT VERIFIED** מלא |
| האם Production תואם לקוד? | **YES** — SHA זהה |

---

## כד. מסקנה סופית

ProjectFlow במצב **4a4763f7** הוא **מוצר שלם ורחב** עם Production מסונכרן ל-main, DB (מחובר) **מעודכן ל-0192** ו-**0181 מיושם ומאומת**. הביקורת מצאה **4 באגים מאומתים**, **5+ פערי מוצר/הרשאות**, ו-**4 ממצאי UX** — אף אחד לא חוסם שימוש מלא ל-owner/manager מנוסה, אך **דורשים תיקון** לפני הכרזה על "מוכן לכל התפקידים ללא התאמת RBAC".

**FINAL PRODUCT VERDICT:** **PARTIAL PRODUCTION READY** — כספים וליבה **WORKING**; תפקידים נישתיים ו-UX ניווט **PARTIAL**; runtime חזותי **NOT VERIFIED**.

---

## נספח — סיכום מנהלים (שורות חובה)

```
CURRENT HEAD = 4a4763f723355a882376008c5b509c0464e3a1c9
ORIGIN MAIN = 4a4763f723355a882376008c5b509c0464e3a1c9
PRODUCTION SHA = 4a4763f723355a882376008c5b509c0464e3a1c9
LOCAL CHANGES = plans + e2e fixtures only (no src diff vs HEAD)
DB ENVIRONMENT = Postgres via .env.local (191 migrations applied; Owner org present)
MIGRATION 0181 STATUS = APPLIED + schema effects verified (see section ב)
NUMBER OF AGENTS = 6 (Composer explore subagents covering 12 domain scopes in pairs)
NUMBER OF FLOWS = 22
CONFIRMED BUGS = 4
CONFIRMED PRODUCT GAPS = 5
UX FINDINGS = 4
NOT VERIFIED = E2E browser, full visual/RTL/mobile, RLS runtime sweep, Supabase MCP ProjectFlow DB
FINAL PRODUCT VERDICT = PARTIAL PRODUCTION READY
```

---

*דוח זה נוצר בביקורת עצמאית בלבד. לא נ cite דוחות קודמים. מזהי ממצאים: FCA-2026-*.*
