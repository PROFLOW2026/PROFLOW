# דוח בעלים — Master Wave: Workforce + True Cost + Allocation

**תאריך:** 2026-08-10  
**Commit / push / db:migrate / apply 0021:** לא בוצעו

```
MASTER WORKFORCE/COST STATUS = READY FOR OWNER REVIEW
```

מוכן לסקירת בעלים לפני החלטת apply של 0021. לא מוכן לשחרור production עד שהבעלים מאשרים apply + מדידת ביצועים מחדש אחרי apply.

---

## Full Gate

| שלב | תוצאה |
|-----|--------|
| typecheck | PASS |
| lint | PASS (אחרי תיקון prefer-const) |
| unit | PASS (1062) |
| integration | PASS (138) — כולל disposable 0000→0021 |
| build | PASS |
| Playwright desktop+mobile+worker | PASS (45) אחרי תיקוני Gate |
| db:check-journal | PASS — אחרון `0021_workforce_contacts_and_allocations` |

תיקוני Gate: lint; כרום פרויקט בלי `CLIENTS_READ` לעובדים; סלקטורי E2E.

---

## PERFORMANCE

| מדד | בסיס (לפני Agent 7) | אחרי שינויי קוד (צפי) | נמדד מחדש בגל זה |
|-----|---------------------|----------------------|-------------------|
| Dashboard warm | ≈1202ms | ≈900–1100ms | לא חולץ מחדש בדוח הסגירה |
| Open project repeated | ≈1043ms / ~296KB | ≈550–750ms wall | לא חולץ מחדש בדוח הסגירה |
| Project tabs | ~171–512ms | ללא רגרסיה צפויה | Playwright perf suite עבר |

שינויים: Suspense רק על children; chrome/structure cache מפוצל; dashboard probes∥rollup.

**המלצה לבעלים:** אחרי apply 0021 — להריץ `performance-verify` ב־production ולוודא יעדים &lt;1000 / &lt;700.

---

## PROJECT CONTACT

| בדיקה | סטטוס |
|-------|--------|
| איש קשר שונה לפרויקט | PASS (סכמה + app; fallback ללקוח) |
| מחיקה בטוחה (לא נוגעים ב־organization_id) | PASS (FK חד־עמודתי + טריגרים; בדיקות integrity) |

---

## EMPLOYEES

| נושא | סטטוס |
|------|--------|
| Employee master | PASS (קיים + מורחב) |
| Compensation history | PASS בסכמה (`rate_versions` + `employee_month_costs`) — UI מתקדם חלקי |
| Effective-dated salary | PASS בסכמה |
| Hourly / monthly / daily | PASS (`employment_basis` + יחידות תעריף) |
| Estimated employer cost | PASS בסכמה |
| Actual employer cost | PASS בסכמה (חודשי) — לא payroll/net |
| Project date-range assignments | PASS — `employee_project_assignments` + soft-end |
| Multiple projects / month | PASS (overlap מותר בין פרויקטים) |
| Repeat assignments | PASS (היסטוריה נשמרת; סיים שיוך ≠ מחיקה) |

---

## EMPLOYEE COST

| נושא | סטטוס |
|------|--------|
| Hours / Days / % / Fixed allocation | PASS בסכמה (שיטות בהרצה) — UI סקירה חודשית עדיין Advanced/לא חובה |
| Unallocated cost | PASS (עמודה + conservation) |
| Double-count prevention | PASS (Displacement: time **או** monthly lines — לא שניהם) |
| Historical preservation | PASS (immutability על applied; גרסאות תעריף) |

`AP` / labor apply ל־Actual בפרודקשן: מסומן עד apply + wiring מלא ל־`aggregateProjectCosts`.

---

## SUBCONTRACTORS

| נושא | סטטוס |
|------|--------|
| Vendor-based (לא עובד) | PASS |
| Multi-project bill allocation | PASS בסכמה `ap_bill_project_allocations` |
| % / days / fixed | PASS במודל הדומיין |
| Partial / unallocated | PASS |
| Payment ≠ Actual | PASS (ללא שינוי מנוע תשלומים) |

Loader מסומן: `AP_BILL_PROJECT_ALLOCATIONS_READY = false` עד apply.

---

## OPTIONALITY

| | |
|--|--|
| שימוש בלי workforce מתקדם | **YES** |
| Mobile / simple flow | **PASS** (דיווח שעות נקי; שיוך פרויקט פשוט; Advanced מכווץ) |

---

## ATTENDANCE

| | |
|--|--|
| Future-compatible | **YES** (אין טבלאות שסוגרות את הדלת) |
| Full attendance built | **NO** |

---

## SCHEMA

| | |
|--|--|
| 0021 filename | `0021_workforce_contacts_and_allocations.sql` |
| 0021 summary | contacts בטוחים + assignments זמניים + compensation/month + labor runs + AP bill allocations |
| 0021 applied | **NO** |
| 0000–0020 modified | **NO** |

---

## Reviewer findings (נסגרו / פתוחים)

**Reviewer 1 (Financial):** בלוקרים של Displacement / conservation / vendor gate — תוקנו ב־SQL/app (עדיין unapplied).

**Reviewer 2 (UX):**  
- B1/B2 נסגרו (אין «הקצאה» על % תכנון; «סיים שיוך»).  
- HIGH פתוחים לגל המשך: Employee→Assign חסר; יצירת עובד עדיין מציגה תעריף מוקדם; תאריכים ב־first paint.

---

## BLOCKER / HIGH / MEDIUM (לבעלים)

**BLOCKER (לשחרור apply):** אין — Gate ירוק; 0021 לא הוחל במכוון.

**HIGH (לפני שימוש מתקדם בפרודקשן):**
1. Apply 0021 רק אחרי אישור בעלים + גיבוי.
2. אחרי apply: להפעיל loader vendor + Displacement ב־rollup רק עם בדיקות.
3. UX: מסלול Employee→Assign; פישוט יצירת עובד; מדידת perf מחדש.

**MEDIUM:**
- RSC משותף של AppShell ~250KB בכניסת נתיבים.
- UI חודשי/ספק נשאר Advanced/permissioned.

---

## מה הבעלים צריכים להחליט

1. לאשר את מודל 0021 (זמני + Displacement + הקצאת ספקים).  
2. מתי להחיל על Supabase (לא בוצע בגל זה).  
3. האם לפתוח UI הקצאה חודשית/ספקים בגל הבא או להשאיר מסומן.
