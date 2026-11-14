# EXLFY — דוח סיום מעודכן (תיקון + אימות E2E) · BUG-001…016

**תאריך עדכון:** 2026-11-14 (אחרי Playwright fix-verify)  
**ענף מקומי:** `main` @ `b2f0b9e7` (+ שינויים לא-committed)  
**מצב Git:** מקומי בלבד — **אין Push / Merge / Deploy**  
**מצב Production:** ללא שינוי נתונים/סכמה  
**ראיות E2E:** `docs/audits/evidence/exlfy-full-regression-2026-11/runtime-fix-verify/E2E_RESULTS.md`

### מדיניות סטטוס (מחייבת)

| תווית | משמעות |
|---|---|
| **VERIFIED** | התנהגות המוצר אומתה ברמת הבדיקה המתאימה (unit/integration **או** E2E בדפדפן) לפי אופי הממצא |
| **FIXED** | קוד תוקן ואומת חלקית; אין אימות מוצר מלא ב־E2E / מכשיר / Prod |
| **BLOCKED** | ממתין לאישור Owner או חסום ע״י harness/סביבה |

אין לסמן VERIFIED להתנהגות UI/מוצר שלא נצפתה ב־E2E כשהממצא דורש זאת.

---

## סיכום כולל

| מדד | ערך |
|---|---|
| ממצאים שטופלו בקוד | **16/16** |
| Vitest ממוקד | **100/100 PASS** |
| Integration EMC supersede | **6/6 PASS** |
| Playwright fix-verify (postgres `projectflow_e2e`) | **14/14 PASS** (0 fail) |
| E2E אזורי VERIFIED_PASS | **11** |
| E2E VERIFIED_FAIL | **0** |
| E2E HARNESS / UNVERIFIED / DEVICE | **3 / 12 / 1** |
| מיגרציה 0204 על `projectflow_e2e` | **VALIDATION PASS** · Prod apply **BLOCKED** |
| Eran Oct repair | Static PASS · Live dry-run **BLOCKED** (Prod URL) · EXECUTE **BLOCKED** |
| Push / Deploy / SQL-Prod | **לא בוצעו** |

### בדיקות שעברו

| Suite | תוצאה |
|---|---|
| Unit payroll / authz / shell / goals / UI | **100/100** |
| Integration `employee-actual-employer-cost` | **6/6** |
| ESLint ממוקד · `tsc --noEmit` | **PASS** |
| Playwright fix-verify (owner+surfaces+pdf projects) | **14/14** על `127.0.0.1/projectflow_e2e` |
| Migration journal unit | **13/13** |
| 0204 apply מבודד | **PASS** (0 orphans) |

### בדיקות שנכשלו / חסומות

| בדיקה | תוצאה |
|---|---|
| Playwright על PGlite (Windows) | **FAIL** setup-owner `ECONNRESET` — לא סמכותי |
| BUG-02 deep-link suite נפרד | **HARNESS** — webServer כשל במיגרציה כפולה |
| Pinch/pan מכשיר אמיתי | **DEVICE_UNAVAILABLE** |
| Eran live dry-run | **BLOCKED** — `.env.local` → Supabase Prod |
| 0204 / Eran על Production | **BLOCKED** עד אישור |

---

## ממצאים אחד־אחד (מעודכן אחרי E2E)

### BUG-001 — עלות מעסיק בעלים / roll-forward

| שדה | תוכן |
|---|---|
| בעיה | Eran 10/2026: ₪25,142.86 במקום ₪33,000 (פער ₪7,857.14) |
| שורש | asOf יחסי ללא roll-forward; `company_only` דולג |
| תוקן | roll-forward + daily-ops + UI שלושה מושגים + סקריפט dry-run |
| בדיקות | Unit **PASS** · E2E past-month **UNVERIFIED_E2E** (אין time-travel) · Live dry-run Prod **BLOCKED** |
| סטטוס | **FIXED** (קוד+unit) · Prod repair **BLOCKED** |
| SQL | לא (recompute) · **אישור Owner** להרצת סקריפט |

### BUG-002 — תיקון שכר / immutability

| שדה | תוכן |
|---|---|
| בעיה | UPDATE in-place על EMC applied נחסם בטריגר |
| תוקן | supersede→adjustment→apply; CTA נפרד |
| בדיקות | Unit+Integration **6/6 VERIFIED ללוגיקה** · E2E: ניווט deep-link **PASS** ללא קריסה; UI אישור/שולם/רטרו **UNVERIFIED** (פאנל לא נטען בסיד); suite bug-02 נפרד **HARNESS** |
| סטטוס | **FIXED** — לוגיקה **VERIFIED** (unit/integration); זרימת UI מלאה **לא VERIFIED ב־E2E** |
| SQL / אישור | לא לקוד |

### BUG-003 — PDF zoom/pan

| שדה | תוכן |
|---|---|
| תוקן | pointer pan + commit pinch |
| בדיקות | UI unit PASS · E2E viewer **HARNESS** (אין OCR job) · zoom/pan **UNVERIFIED** · מכשיר **DEVICE_UNAVAILABLE** |
| סטטוס | **FIXED** (קוד+unit) · E2E/מכשיר **לא VERIFIED** |
| אישור | QA מובייל ידני מומלץ |

### BUG-004 — ₪ / 2dp

| שדה | תוכן |
|---|---|
| בדיקות | Unit PASS · E2E paid-amount labels **UNVERIFIED** |
| סטטוס | **FIXED** (unit) — תצוגה חיה ב־E2E לא אומתה |

### BUG-005 — FAB

| שדה | תוכן |
|---|---|
| בדיקות | Unit PASS · E2E FAB נסתר ב־`/new` (expenses/projects/employees) **VERIFIED_PASS** |
| סטטוס | **VERIFIED** (unit + E2E) |

### BUG-006 — מיגרציות 0197–0203

| שדה | תוכן |
|---|---|
| סטטוס | **VERIFIED** residual — לא הורצו מחדש; 0204 אחריהן ב־journal |

### BUG-007 — Drizzle schema 0200

| שדה | תוכן |
|---|---|
| בדיקות | tsc PASS |
| סטטוס | **FIXED** |

### BUG-008 — FK task↔work package

| שדה | תוכן |
|---|---|
| בדיקות | Static+journal+apply על `projectflow_e2e` **PASS** |
| סטטוס | **FIXED** (מבודד) · Prod apply **BLOCKED** |
| SQL | **כן** — אישור Owner |

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations/0204_tasks_work_package_composite_fk.sql
PURPOSE = Composite FK tasks.work_package_id → work_packages(id, organization_id, project_id)
DATA MUTATION = YES (NULL incompatible work_package_id only)
SCHEMA MUTATION = YES
RISK = MEDIUM
READY FOR OWNER REVIEW = YES
ISOLATED APPLY (projectflow_e2e) = PASS
PRODUCTION APPLY = BLOCKED
```

### BUG-009 — view/edit יעדים

| שדה | תוכן |
|---|---|
| בדיקות | Unit permissions PASS · E2E main goals **VERIFIED_PASS** |
| סטטוס | **VERIFIED** (unit + main E2E) |

### BUG-010 — שגיאות שכר/זמן

| שדה | תוכן |
|---|---|
| בדיקות | E2E routes time/approvals **reachable VERIFIED_PASS** (לא שחזור שגיאה מלא) |
| סטטוס | **FIXED** — נגישות מסלול אומתה; מיפוי AppError מלא לא שוחזר ב־E2E |

### BUG-011 — Live Share documents

| שדה | תוכן |
|---|---|
| בדיקות | Unit authz **32/32** · E2E entry **UNVERIFIED** (אין בקרה ב־hub) |
| סטטוס | **FIXED** — הרשאות **VERIFIED** ב־unit; מסלול UI ב־E2E **לא VERIFIED** |

### BUG-012 — מוני Multi-Org

| שדה | תוכן |
|---|---|
| בדיקות | Unit nesting PASS · E2E switcher **UNVERIFIED** |
| סטטוס | **FIXED** — לוגיקה unit; UI badges **לא VERIFIED ב־E2E** |

### BUG-013 — BOQ sheet-mark

| שדה | תוכן |
|---|---|
| בדיקות | Unit assert PASS · E2E **UNVERIFIED** (אין drawing revision בסיד) |
| סטטוס | **FIXED** — שרת **VERIFIED** unit; UI **לא VERIFIED ב־E2E** |

### BUG-014 — חיפוש גלובלי

| שדה | תוכן |
|---|---|
| בדיקות | Unit settle PASS · E2E dialog **UNVERIFIED** |
| סטטוס | **FIXED** — לוגיקה unit; UI **לא VERIFIED ב־E2E** |

### BUG-015 — יעדים Employees/Contractors

| שדה | תוכן |
|---|---|
| בדיקות | Unit PASS · E2E auth contractor/employee **PASS** · goals routes **HARNESS HTTP 404** |
| סטטוס | **FIXED** — קוד+unit; זמינות routes בפורטלים **לא VERIFIED** (HARNESS 404) |

### BUG-016 — Today lens

| שדה | תוכן |
|---|---|
| בדיקות | E2E lens **UNVERIFIED** (לא נראה / gated) |
| סטטוס | **FIXED** — E2E **לא VERIFIED** |

---

## שלוש האפליקציות (E2E)

| משטח | תוצאה |
|---|---|
| Main | Owner setup + מרבית probes על postgres harness |
| Employees | התחברות **PASS**; `/goals` **404 HARNESS** |
| Contractors | התחברות **PASS**; `/goals` **404 HARNESS** |

---

## מצב אימות סופי

| פריט | מצב |
|---|---|
| TypeScript / ESLint / Vitest / Integration | **PASS** |
| Playwright fix-verify | **14/14 PASS** (postgres מקומי) |
| E2E כיסוי מוצר מלא ל־16 הממצאים | **חלקי** — ראה טבלת ממצאים |
| Commit | לא נוצר |
| Push / Deploy | **אסור** |
| SQL 0204 Prod | **אסור** (מבודד PASS) |
| Eran repair Prod | **אסור** (גם dry-run חי חסום ללא אישור קריאה) |
| Production | ללא שינוי |

---

## פעולות המחייבות אישור Owner

1. **החלת SQL 0204** על Production/shared (אחרי סקירת `BUG008_*` + `MIGRATION_0204_DRY_VALIDATION.md`)  
2. **קריאה dry-run** של סקריפט Eran מול Supabase (אופציונלי) ואז **`OWNER_APPROVED=1 EXECUTE=1`** לתיקון ₪7,857.14  
3. **Commit / Push / Deploy**  
4. **QA מובייל אמיתי** ל־BUG-003  
5. (מומלץ) ריצת E2E חוזרת עם seed EMC טרי *לפני* owner suite + תיקון harness ל־goals 404 / bug-02 webServer

---

*דוח סיום מאוחד מעודכן. אין Push/Deploy/SQL-Prod ללא אישור מפורש.*
