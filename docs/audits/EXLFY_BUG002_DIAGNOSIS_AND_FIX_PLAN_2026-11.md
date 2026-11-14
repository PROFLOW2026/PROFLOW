# EXLFY — אבחון BUG-002 + תוכנית תיקונים ל־BUG-001…016

**תאריך:** 2026-11-14  
**היקף:** אבחון BUG-002 · תוכנית תיקונים (טיוטה) · חקירת BUG-001 הושלמה בנפרד  
**סטטוס:** **הדוח אינו מאושר לתיקונים** — ממתין לאישור Owner אחרי השלמת חקירת 16/21  
**איסורים:** אין תיקון מוצר · אין SQL מוחל · אין Push/Merge/Deploy  
**מקור:** `EXLFY_FULL_REGRESSION_AUDIT_2026-11.md` · `bug-01/OCT_2026_16_OF_21_PROOF.md`  
**תוכנית Cursor (מושהית עד אישור):** `.cursor/plans/exlfy_16_findings_fix_execution.plan.md`

---

## א. אבחון ממוקד — BUG-002 (קריסת אישור שכר)

### א.1 הפעולה המדויקת (קישור התראה)

בנאי Command Center (`payrollAlertHref`):

```text
/workforce/employees/{employeeId}?yearMonth={YYYY-MM}&focus=payroll&paymentId={paymentId}
```

עבור בעלים **ערן יוסף** · חודש **2026-10** (נתוני Prod, קריאה בלבד):

| שדה | ערך |
|-----|-----|
| employeeId | `1651af31-5f63-425d-a518-a9fa84931ecd` |
| paymentId | `c35d5f56-7b11-4ea2-835e-f40025715621` |
| payment_status | `upcoming` |
| expected_amount | `25142.860000` (תואם BUG-001: 33000×16/21) |
| due_date | `2026-11-10` |
| קישור מלא | `/he-IL/workforce/employees/1651af31-5f63-425d-a518-a9fa84931ecd?yearMonth=2026-10&focus=payroll&paymentId=c35d5f56-7b11-4ea2-835e-f40025715621` |

### א.2 השוואת נתוני Prod מול harness

| ממד | Production (ערן · 2026-10) | Harness seed (BUG-02) |
|-----|---------------------------|------------------------|
| EMC status | **`applied`** | **`draft`** |
| known_amount | 25142.86 | 8250 |
| recognition_source | `monthly_allocated` | `time_snapshot` |
| labor run | `applied`, method=`hours`, **company_only=25142.86**, allocated=0, **0 שורות פרויקט** | אין run |
| payment | `upcoming` / unpaid | `due` unpaid |
| compensation_class | `owner_manager` | `standard` |
| תוצאת deep-link בדפדפן | דיווח Owner: «משהו השתבש» | **VERIFIED PASS** (אין crash) |

**מסקנת פער:** ה־seed המבודד לא ייצג את צורת הנתונים החיה (EMC כבר **applied** + company_only). לכן אי-שחזור ב־harness **אינו** מפריך תקלה ב־Prod — הוא מפריך רק את השערת Flight-Date על seed שגוי־צורה.

### א.3 לוגים קיימים מ־Production (Vercel Observability)

חלון 7 ימים · deployment פעיל `dpl_613TyYZ4VpKKzeNeMxg4uZc4WuPQ` · פילטר נתיב  
`/[locale]/workforce/employees/[employeeId]`:

| ממצא | סטטוס |
|------|--------|
| שגיאת Flight/Date על טעינת העמוד | **לא נמצאה** באשכולות |
| שגיאת RSC ייעודית ל־GET של ערן | **לא נמצאה** |
| שגיאה חוזרת על אותו נתיב | **`employee_month_costs_immutable`** ×3 (2026-11-11…13), 2 משתמשים |

פרטי השגיאה החוזרת (ראיה):

- פעולה: `UPDATE employee_month_costs` לסכומים (`estimated`/`actual`/`known`/`known_quality`)
- WHERE: `status IN ('applied','closed')`
- DB: `PostgresError 23514` ← `app.employee_month_costs_immutability_guard()`
- שורת היעד: EMC `5e7d6c2f-…` · עובד **מוחמד נציר** · 2026-10 · status=`applied` · estimated=8250 → ניסיון actual=8205
- מקור קוד: `correctMonthlyEmployerCostActual` → `updateAppliedEmployeeMonthCostAmounts`

**מגבלת לוגים:** תוכנית Hobby — שמירת runtime logs גולמיים ~1 שעה; לא ניתן למשוך stack מלא להיסטוריית GET ישנה. אשכולות Runtime Errors (7d) כן זמינים.

### א.4 ניתוח זרימת UI מול הקוד

ב־`focus=payroll` מוצגים יחד:

1. **`MonthlyEmployerCostReview`** (`payrollApprovalMode`) — כפתור ראשי מתורגם ל־«אישור חודש שכר» / `confirmPayrollMonth`, אך בפועל קורא ל־`handleApply` →  
   אם `status ∈ {applied,closed}` → **`correctMonthlyEmployerCostActualAction`** (תיקון סכומים על שורה applied).
2. **`EmployeePayrollMonthPanel`** — כפתור נפרד «אשר ששולם» → `confirmPayrollPaymentAction` (עדכון `employee_payroll_payments` בלבד; **לא** נוגע ב־EMC).

סתירת ארכיטקטורה **מוכחת בקוד**:

- הערה ב־`correctMonthlyEmployerCostActual`: «supersede applied/closed…»
- המימוש בפועל: **עדכון in-place** של סכומים על applied/closed
- טריגר DB אוסר שינוי סכומים כש־`NEW.status = OLD.status` ל־applied/closed (מותר רק notes, או מעבר ל־`superseded`/`closed`)

פעולות השרת **תופסות** את השגיאה ומחזירות `{ error }` (`mapEmployeeActionError`). לכן:

- תרחיש **מוכח בלוגים:** לחיצה על שמירה/«אישור חודש» לחודש **applied** → כשל DB. ייתכן UX של הודעת שגיאה גנרית **או** גבול שגיאה — תלוי אם הלקוח/Next מציגים digest; ה־digest בלוג מוכיח שהשגיאה תועדה כ־runtime error.
- תרחיש **טעינת הקישור בלבד** לערן: **לא הוכח** באשכולות 7d כ־crash RSC. חסר digest דפדפן מהבעלים.

### א.5 מה הופרך / מה מוכח / מה חסר

| טענה | סיווג | ביטחון |
|------|--------|--------|
| Flight `$D` Date כגורם יחיד לקריסה | **DISPROVEN** (harness Flight + browser mount) | גבוה |
| harness draft+paymentId = אותו מצב כמו Prod ערן | **DISPROVEN** (applied vs draft) | גבוה |
| נתיב תיקון applied EMC שובר את חוק ה־DB | **PROVEN** (לוג Prod + קוד + טריגר) | גבוה |
| זה בדיוק מה שקורה בלחיצת «אישור חודש שכר» על EMC applied | **PROVEN בקוד** · **PROVEN בלוג** על עובד אחר | גבוה לנתיב; בינוני לזהות Owner |
| קריסת **פתיחת** הקישור של ערן בלבד (לפני לחיצה) | **UNVERIFIED** | — |
| `confirmPayrollPaid` עצמו קורס על ערן | **לא נמצאה ראיה** בלוגים | — |

### א.6 גורם שורש (לפי ראיות — לא השערה עיוורת)

**גורם שורש מוכח לתקלת אישור/תיקון חודש applied:**  
אי-התאמה בין שכבת האפליקציה (`updateAppliedEmployeeMonthCostAmounts`) לבין חוק ה־DB (`employee_month_costs_immutability_guard`). כל ניסיון Owner לתקן/«לאשר חודש» על EMC שכבר `applied` נכשל ברמת Postgres.

**לסימפטום Owner הספציפי («משהו השתבש» בפתיחת אישור שכר מתוך התראה):**

- **ההסבר הסביר ביותר עם ראיות:** בעת תהליך האישור במסך ה־deep-link (EMC כבר applied אצל ערן כמו אצל שאר העובדים) נלחץ ה־CTA של סקירת החודש (`confirmPayrollMonth` / שמירה) → אותו נתיב immutable. זה מסביר גם למה harness עם **draft** עבר.
- **לא ניתן לסגור ברמת «מוכח 100% לפתיחת URL בלבד»** בלי digest דפדפן של בקשת ה־GET של ערן.

### א.7 ראיות חסרות + דרך ממוקדת להשיגן (בלי QA כללי)

| ראיה חסרה | איך להשיג (ממוקד, דקות) |
|-----------|-------------------------|
| digest / stack מפתיחת קישור ערן | Owner פותח את הקישור למעלה פעם אחת ב־Prod; אם crash — להעתיק digest מ־error.tsx / Network |
| האם הכשל ב־GET או ב־POST (server action) | אותה פעולה + סינון Vercel Runtime Logs ל־30 הדקות האחרונות אחרי השחזור |
| שחזור מקומי צורת Prod | seed audit-only: EMC **`applied`** + labor run `company_only` + payroll upcoming (לא draft) על `projectflow_e2e` בלבד |
| האם «אשר ששולם» לבדו מצליח | אחרי שהמסך נטען — ללחוץ רק על כפתור התשלום בפאנל השכר (לא על confirmPayrollMonth) |

**אין לתקן Serializer Date. אין לשנות נתוני Prod לצורך האבחון.**

---

## ב. תוכנית תיקון מלאה — BUG-001 … BUG-016

חלוקה: **דחוף** · **חשוב** · **שיפורים**.

לכל פריט: מה לתקן · קבצים/מודולים · סיכון · בדיקות · תלות · החלטת בעלים.

### דחוף — קריסות, הרשאות, שכר וחישובים

#### BUG-002 — קריסת / כשל אישור שכר (EMC applied immutable)

1. **מה לתקן:** להחליף את `updateAppliedEmployeeMonthCostAmounts` בנתיב תיקון שמכבד את הטריגר: supersede → draft התאמה (כפי שההערה מבטיחה), או עדכון notes-only כשאין שינוי סכום. להפריד UX: «אשר ששולם» ≠ «תקן עלות מעסיק». ב־`payrollApprovalMode` לא להפנות CTA ראשי לנתיב correction כשהמטרה היא תשלום.
2. **קבצים:** `employer-month-costs.ts`, `employee-month-costs.repository.ts`, `monthly-employer-cost-review.tsx`, `employee-payroll-month-panel.tsx`, `employees/actions.ts`; טריגר קיים ב־`0021_…sql` (לא לשבור).
3. **סיכון:** **גבוה** — כסף/רווחיות/היסטוריית EMC; תיקונים רטרואקטיביים.
4. **בדיקות:** unit לנתיב correction; Playwright deep-link עם EMC **applied**+company_only; לחיצת confirmPayrollMonth; לחיצת אשר-ששולם; עובד רגיל + owner_manager; אין שינוי סכום applied in-place.
5. **תלות:** רצוי אחרי הכרעת BUG-001 (תוויות/סכום צפוי) אך **ניתן לתקן את הכשל הטכני קודם**.
6. **החלטת בעלים:** כן — האם תיקון applied נעשה תמיד ב־supersede+adjustment, ומה קורה ל־payroll.paidAmount כש־`syncPaidAmount`.

#### BUG-001 — התראת «שכר» מציגה צבירת עלות מעסיק ₪25,142.86

1. **מה לתקן:** (א) UX: תווית «עלות מעסיק מצטברת» מול «שכר בסיס»; ו/או (ב) הפרדת obligation; ו/או (ג) רענון `expectedAmount` בסגירת חודש / בקריאת CC. המנוע 16/21 **תקין** — לא «לתקן נוסחה» בלי החלטה.
2. **קבצים:** `collect-owner-payments.ts`, `monthly-cost-recompute.ts`, `item-copy.ts`, UI התראות/Today; אולי `payroll-payments.ts`.
3. **סיכון:** **גבוה** — תזרים והתראות.
4. **בדיקות:** owner Oct פתוח/סגור; עובד רגיל; company_only; אין רגרסיית invariant.
5. **תלות:** אין חובה טכנית ל־BUG-002; תיאום מוצר משותף.
6. **החלטת בעלים:** **חובה** — מה מוצג ומה נחשב לתשלום.

#### BUG-011 — Live Share host עם `project.view` בלבד

1. **מה לתקן:** ב־`authorizeProject` ל־internal — לכבד `need:'document'` (או capability מקבילה) בכל כניסות host (`start`/`setControl`/`end`).
2. **קבצים:** `src/modules/.../live-share` / `access.ts`, actions host; טסטי `live-share.test.ts`.
3. **סיכון:** בינוני — משתמשים עם view בלבד יאבדו host.
4. **בדיקות:** view-only נדחה; document עובר; contractor path לא נפגע; three-surface.
5. **תלות:** אין.
6. **החלטת בעלים:** האם view בלבד אי־פעם מורשה כ־host (ברירת מחדל מהביקורת: לא).

### חשוב — PDF, משימות, קישורים, תהליכים

#### BUG-003 — אין pan חופשי ב־PDF אחרי zoom

1. **מה לתקן:** יישור מודל zoom/pan ל־`ZoomablePreviewImage` (commit scale / pointer pan / touch); בחינת body `touch-action`.
2. **קבצים:** `pdf-js-viewer.tsx` (+ שיתוף עם employee/contractor).
3. **סיכון:** בינוני — מחוות סימון/מדידה.
4. **בדיקות:** pinch+pan desktop/mobile; device אם אפשר; לא לשבור annotate.
5. **תלות:** אין.
6. **החלטת בעלים:** לא חובה.

#### BUG-005 — FAB מסתיר CTA במובייל

1. **מה לתקן:** לחבר `isFocusedComposerPath` (או שווה־ערך) להסתרת FAB; inset RTL.
2. **קבצים:** FAB shell / quick-create; עדכון unit שמכריח unused היום.
3. **סיכון:** נמוך.
4. **בדיקות:** 320–430 על `/new`,`/edit`, workforce; three-surface רלוונטי.
5. **תלות:** אין.
6. **החלטת בעלים:** לא.

#### BUG-008 — FK חלש `tasks.work_package_id`

1. **מה לתקן:** מיגרציה עתידית ל־composite FK / שווה־ערך; השארת assert עד אז.
2. **קבצים:** migration חדשה (רק אחרי אישור SQL), schema tasks.
3. **סיכון:** בינוני (מיגרציה).
4. **בדיקות:** קישור WP מפרויקט אחר נדחה ב־DB.
5. **תלות:** אחרי אימות BUG-006 (כבר Residual).
6. **החלטת בעלים:** כן לאישור SQL נפרד.

#### BUG-010 — מיסוך שגיאות במסך עובד / אישורי זמן

1. **מה לתקן:** לא להמיר כל כשל ל־`notFound()`; `error.tsx` סגמנטלי + מיפוי AppError (קשור לחוויית BUG-002).
2. **קבצים:** `employees/[employeeId]/page.tsx`, `time/approvals/error.tsx`, ממפה שגיאות.
3. **סיכון:** נמוך.
4. **בדיקות:** ValidationError / AuthorizationError מציגים הודעה נכונה.
5. **תלות:** מומלץ יחד עם BUG-002.
6. **החלטת בעלים:** לא.

#### BUG-012 — מוני משימות Multi-Org

1. **מה לתקן:** לא לקנן `runInOrgContext` כך שמתעלמים מ־org יעד; שאילתה מפורשת per-org.
2. **קבצים:** `session.ts` / `organization-switcher-open-tasks.ts`.
3. **סיכון:** בינוני (shell).
4. **בדיקות:** 2 ארגונים עם מספרי משימות שונים.
5. **תלות:** אין.
6. **החלטת בעלים:** לא.

#### BUG-013 — Sheet-mark ↔ BOQ בלי אימות פרויקט

1. **מה לתקן:** assert שרת ש־`linkedEntityId` שייך לפרויקט/BOQ הפעיל.
2. **קבצים:** `sheet-marks.ts`, `sheet-mark-boq-link.ts`.
3. **סיכון:** נמוך.
4. **בדיקות:** קישור חוצה־פרויקט נדחה.
5. **תלות:** אין.
6. **החלטת בעלים:** לא.

#### BUG-014 — חיפוש גלובלי קורס אם טבלאות חסרות

1. **מה לתקן:** `allSettled` / probe per kind במקום `Promise.all` קשיח.
2. **קבצים:** `global-search.ts`, `search.repository.ts`.
3. **סיכון:** נמוך.
4. **בדיקות:** חיפוש עם/בלי kinds אופציונליים.
5. **תלות:** BUG-006 Residual (סכמה חיה כבר קיימת — עדיין hardening).
6. **החלטת בעלים:** לא.

#### BUG-007 — טבלאות 0200 חסרות ב־Drizzle schema

1. **מה לתקן:** הוספת ייצוג Drizzle לטבלאות שקיימות רק ב־SQL/raw.
2. **קבצים:** `drizzle/schema/*`.
3. **סיכון:** נמוך (טיפוסים; לא שינוי DB אם רק schema TS).
4. **בדיקות:** generate/check journal עקבי.
5. **תלות:** אין חובת runtime.
6. **החלטת בעלים:** לא.

### שיפורים — ממשק, עיצוב, אחידות

#### BUG-004 — תצוגת כסף ILS/6dp/אנגלית

1. **מה לתקן:** סמל מקומי + `formatMoney` + i18n בדיאלוג EMC.
2. **קבצים:** `money-input.tsx`, `monthly-employer-cost-review.tsx`.
3. **סיכון:** נמוך.
4. **בדיקות:** RTL MoneyInput; דיאלוג retro.
5. **תלות:** אחרי/עם BUG-002 UI.
6. **החלטת בעלים:** לא.

#### BUG-006 — Deploy-before-migrate (Residual P3)

1. **מה לתקן:** **אין SQL להחלה.** לשמור תהליך: migrate לפני deploy; תיעוד SHA בפריסות prebuilt.
2. **קבצים:** docs/deployment תהליך בלבד.
3. **סיכון:** —  
4. **בדיקות:** smoke אחרי פריסה מאושרת.
5. **תלות:** —  
6. **החלטת בעלים:** לא לתיקון קוד; כן למשמעת פריסה.

#### BUG-009 — אסימטריית הרשאות יעדים

1. **מה לתקן:** תיעוד במטריצה **או** יישור תבניות תפקידים (לפי החלטה).
2. **קבצים:** docs parity / RLS 0201 / `goal-mutation-access.ts`.
3. **סיכון:** נמוך.
4. **בדיקות:** view-only.
5. **תלות:** BUG-015 אם מוסיפים UI.
6. **החלטת בעלים:** **כן** — by design או שינוי מדיניות.

#### BUG-015 — יעדים רק ב־main

1. **מה לתקן:** תיעוד essential-need **או** surfaces לעובד/קבלן לפי הרשאה.
2. **קבצים:** routes employee/contractor; parity matrix.
3. **סיכון:** נמוך־בינוני.
4. **בדיקות:** three-surface.
5. **תלות:** BUG-009.
6. **החלטת בעלים:** **כן**.

#### BUG-016 — Today `?lens=decisions` מסתיר כספים

1. **מה לתקן:** תווית ברורה לעדשה / איפוס קל ל־all.
2. **קבצים:** `today/page.tsx` (+ UI lens).
3. **סיכון:** נמוך.
4. **בדיקות:** lens on/off מציג payroll.
5. **תלות:** אין.
6. **החלטת בעלים:** לא (אלא אם רוצים לשנות ברירת מחדל).

---

## ג. סדר ביצוע מומלץ

| שלב | פריטים | הערה |
|-----|--------|------|
| 0 | שחזור ממוקד BUG-002 (seed applied / digest Owner) | דקות–שעה; **לפני** תיקון גדול אם Owner רוצה 100% על GET |
| 1 | **BUG-002** (+ **BUG-010** תצוגת שגיאה) | דחוף טכני |
| 2 | **BUG-001** אחרי החלטת מוצר | דחוף עסקי |
| 3 | **BUG-011** Live Share | דחוף אבטחה |
| 4 | **BUG-003**, **BUG-005** | חשוב UX |
| 5 | **BUG-013**, **BUG-012**, **BUG-014**, **BUG-007** | חשוב שלמות |
| 6 | **BUG-008** (מיגרציה באישור נפרד) | חשוב DB |
| 7 | **BUG-004**, **BUG-016**, **BUG-009/015** (לפי החלטות) | שיפורים |
| — | **BUG-006** | אין קוד; משמעת פריסה בלבד |

לא להריץ סבב QA מערכתי מחדש — רק בדיקות ממוקדות לשלב שמאושר.

---

## ד. בדיקות נדרשות לפני פריסה (אחרי אישור ביצוע)

מינימום לשחרור שכולל את הדחוף:

1. `npx tsc --noEmit -p .`
2. eslint על קבצים שנגעו
3. unit: EMC correction/immutability · owner accrual · live-share authz · FAB hide
4. Playwright ממוקד: deep-link payroll עם EMC **applied** + אשר-ששולם; PDF pan בסיסי אם נגע ב־BUG-003
5. בדיקת הרשאות Live Share (view-only / document)
6. **אין** migrate/apply SQL בלי אישור Owner נפרד אחרי קובץ מוכן
7. Deploy רק בנתיב Linux prebuilt אחרי אישור Owner נפרד (push ≠ deploy)

---

## ה. החלטות שמחייבות אישור בעלים לפני ביצוע

1. **BUG-001:** מה מוצג כ«שכר» ומה נחשב לתשלום (בסיס / עלות מעסיק / צבירה).
2. **BUG-002:** מדיניות תיקון EMC applied (תמיד supersede+adjustment? סנכרון paidAmount?).
3. **BUG-011:** האם host Live Share דורש הרשאת מסמך תמיד.
4. **BUG-009 / BUG-015:** יעדי פרויקט — by design ב־main בלבד או parity מלא.
5. **BUG-008:** אישור נפרד להכנת+החלת מיגרציית FK (אם ייכלל בגל).
6. **פריסה:** אישור נפרד ל־Push ואז ל־Deploy; SQL תמיד נפרד.

---

## ו. סיכום לבעלים

- גל הביקורת **סגור** ברמת הראיות; אין סבב QA חדש.
- BUG-002: **לא** לתקן Date serializer. יש **פער מוכח** בין קוד תיקון EMC applied לבין טריגר DB, וראיות Prod לכשל הזה; צורת הנתונים של ערן (applied) שונה מה־harness (draft) — זה מסביר את אי-השחזור.
- לסגירת 100% על «קריסה בפתיחת קישור בלבד» חסר digest Owner חד־פעמי או seed applied מקומי.
- תוכנית תיקון ל־16 הממצאים מוכנה לאישור ביצוע. **לא בוצע תיקון / Push / Deploy.**
