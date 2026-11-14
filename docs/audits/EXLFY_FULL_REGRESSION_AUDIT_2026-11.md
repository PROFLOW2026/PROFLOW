# EXLFY — ביקורת מערכתית מלאה ואיתור רגרסיות (דוח מאוחד)

**גרסת דוח:** 2026-11-14-complete  
**פרויקט:** PROFLOW2026/PROFLOW · ענף `main`  
**HEAD מקומי מאומת:** `b2f0b9e766f8c84b7c4f6b4dd3e6f14e65e387e7`  
**Production URL:** https://proflow-two-bice.vercel.app  
**מצב:** Read-only — **לא בוצעו תיקוני מוצר, מיגרציות, Push, Merge או Deploy**  
**ראיות:** [`docs/audits/evidence/exlfy-full-regression-2026-11/`](./evidence/exlfy-full-regression-2026-11/)

> **הערה לבעלים:** אם גרסה קודמת של הקובץ הסתיימה ב־BUG-010 — זו הייתה טיוטה חלקית / תצוגה לא מעודכנת. **בקובץ זה מופיעים BUG-001 עד BUG-016 במלואם** (11 שדות לכל ממצא).

---

## א. סיכום מנהלים

### מצב המערכת

המאגר המקומי על `main` ב־`b2f0b9e7`. **Production READY** על `dpl_613TyYZ4VpKKzeNeMxg4uZc4WuPQ`; הדומיין `proflow-two-bice.vercel.app` משויך אליו. **SHA משוחזר כ־`b2f0b9e7`** (prebuilt CLI ללא `githubCommitSha` ב־meta; התאמת זמן+ארטיפקט `.deploy-linux`) — `env/PROD_SHA_VERIFICATION.md`. **מיגרציות 0197–0203** על Supabase PROFLOW — **VERIFIED** (`env/MIGRATIONS_LIVE_READONLY.md`).

חמש התקלות המדווחות נחקרו לעומק. נוספו ממצאים מבניים מגל EXLFY. חלק מ־Runtime/E2E עדיין מסומן **UNVERIFIED** או **חלקי** — מתועד בשקיפות בסעיפים ג׳ / ט׳.

### ספירת ממצאים לפי חומרה

| חומרה | כמות | מזהים |
|--------|------|--------|
| **P0 מאומת** | 0 | — |
| **P0 מותנה** | 0 | BUG-006 **הוחלש** — סכמת 0197–0203 קיימת ב־DB החי שנבדק |
| **P1** | 4 | BUG-001*, BUG-002, BUG-003, BUG-011 |
| **P2** | 8 | BUG-004, BUG-005, BUG-007, BUG-008, BUG-010, BUG-012, BUG-013, BUG-014 |
| **P3** | 4 | BUG-006†, BUG-009, BUG-015, BUG-016 |
| **סה״כ ממצאים ממוספרים** | **16** | BUG-001…016 |

†BUG-006 נשאר כממצא תיעודי (סיכון שאריות / אי-התאמת SHA≠סכמה) בחומרת **P3 Residual**, לא P0.

\*BUG-001: **16 ו־21 הוכחו מ־Prod** (ראו סעיף BUG-001 + `bug-01/OCT_2026_16_OF_21_PROOF.md`); חומרת P1 = סמנטיקת «שכר» + צבירת בעלים + שורת Oct **stale** אחרי כניסת נובמבר.

### תחומים שנפגעו

Workforce/Payroll · Command Center · PDF/תוכניות · UX מובייל · Schema · Infra Live Share · Tasks/Search · Multi-org shell · (סיכון מותנה) Goals/Automations

### סיכונים משמעותיים

1. אישור שכר (BUG-002) — מדווח ב־Prod; ב־harness עם EMC+paymentId **לא שוחזר** (PASS). RC עדיין לא מוכח.  
2. PDF אחרי Zoom (BUG-003) — שטח/קבלנים.  
3. התראת «שכר» = צבירת עלות מעסיק 16/21 מ־23.10 (BUG-001) — הוכח; שורה לא רועננה ל־33,000 אחרי סוף אוק׳.  
4. Live Share host פנימי עם `project.view` בלבד (BUG-011).  
5. (הוסר) חסם SHA — אומת ברמת pipeline; ראה סעיף Production.

### מוכנות

**הדוח עדיין אינו מאושר לתיקונים.** חקירת BUG-001 (מקור 16/21) הושלמה בראיות Prod. נדרש אישור Owner לדוח לפני כל ביצוע תיקונים. אין Push/Deploy/SQL.

### אימות Production

| נושא | סטטוס | פרטים |
|------|--------|--------|
| Deployment READY | **VERIFIED PASS** | `dpl_613TyYZ4VpKKzeNeMxg4uZc4WuPQ` · target production · dub1 |
| Alias `proflow-two-bice.vercel.app` | **VERIFIED PASS** | → אותו Deployment ID |
| Commit SHA == `b2f0b9e7…` | **VERIFIED PASS (inferred)** | אין חותמת Git ב־meta של prebuilt; שחזור מ־`.deploy-linux` SUCCEEDED + timeline — `env/PROD_SHA_VERIFICATION.md` |
| מיגרציות 0197–0203 | **VERIFIED PASS** | Supabase PROFLOW `rnjeggpsjchayprygkcw` — `env/MIGRATIONS_LIVE_READONLY.md` |

---

## ב. טבלת כל הממצאים (BUG-001 … BUG-016)

לכל ממצא: תיאור · חומרה · שחזור · צפוי · בפועל · Root Cause · ראיות · השפעה · תיקון מוצע · סיכון תיקון · בדיקות אחרי תיקון.

---

### BUG-001 — התראת שכר ₪25,142.86 מול הגדרות ₪33,000 / ₪22,000

| שדה | פירוט |
|-----|--------|
| **תיאור** | לערן יוסף: בסיס ₪22,000 + burden 50% = עלות מעסיק מוגדרת ₪33,000; התראת אוק׳ 2026 מציגה ₪25,142.86 |
| **חומרה** | **P1** |
| **שחזור** | CC/`payroll_overdue` → תשלום `c35d5f56-…` · `expected_amount=25142.860000` |
| **צפוי** | הפרדה: שכר בסיס / עלות מעסיק מלאה / צבירה; אחרי סוף חודש — רענון לבריכה מלאה אם זו המדיניות |
| **בפועל (Prod)** | ראה טבלת ההוכחה למטה — לא השערה מתמטית בלבד |
| **Root Cause** | **מוכח בשני שלבים:** (A) צבירת 16/21 ב־23.10 (`fd136c18` + asOfDate). (B) **אין מנגנון אוטומטי** שמריץ recompute בסיום חודש; בעלים `company_only` **לא נכלל** ב־`ensureOpenMonthlyLaborFreshForProject`; פטור נוכחות מפחית טריגרים; לכן אוק׳ נשאר 25142.86. `applied` **אינו** חוסם recompute אם הוא נקרא. |
| **ראיות** | `bug-01/OCT_2026_16_OF_21_PROOF.md`; `bug-01/IMPACT_AND_RECOMPUTE_ROOT_CAUSE.md`; EMC/payroll/general_cost Prod; `monthly-cost-recompute.ts`; `ensure-open-monthly-labor-fresh.ts` |
| **השפעה** | **פער כספי מוכח יחיד לחודש עבר:** ₪7,857.14 (ערן·אוק׳). משפיע על EMC + company_only + payroll expected + `labor_company_only` ב־general cost Oct. **לא** על פרויקטים של ערן (allocated=0). **לא** על תשלומים ששולמו ינו׳–ספט׳ (actual ידני). |
| **תיקון מוצע** | ראה סעיף «היקף פגיעה + תיקון בטוח» למטה — **מומלץ בלבד** |
| **סיכון תיקון** | גבוה אם UPDATE in-place (BUG-002/immutability); נמוך־בינוני דרך recompute supersede על unpaid estimated |
| **בדיקות אחרי תיקון** | ערן Oct→33000; labor_company_only; payroll expected; actuals ינו׳–ספט׳ ללא שינוי; חודש פתוח Nov; אין in-place update |

#### BUG-001 — הוכחת 16 / 21 / ₪25,142.86 (Production, קריאה בלבד)

| שאלה | תשובה מוכחת |
|------|-------------|
| **מקור הסכום** | EMC `038917ac-8a25-4949-9e52-c5e15beaeac4` · `known_amount=25142.860000` · notes: `Defined monthly employer cost 33000.000000; accrued to date 25142.860000 (16 of 21 work days)` → payroll `c35d5f56-7b11-4ea2-835e-f40025715621` · `expected_amount=25142.860000` · `obligation_source=period_accrual` |
| **פונקציה** | `monthly-cost-recompute.ts` → `recognizeMonthlyEmployerPoolByCalendar` → `describeMonthlyEmployerCostRecognition` → `syncPayrollExpectedFromLaborRecompute` |
| **מקור 21** | ימי א׳–ה׳ באוק׳ 2026 לפי `workWeekdays=[0,1,2,3,4]` מ־`organization_settings.labor_cost_defaults` = **21** תאריכים. המכנה הקלנדרי גובר על `rate_versions.working_days_per_month=5` |
| **מקור 16** | אותם ימי א׳–ה׳ מ־01.10 עד `asOfDate=23.10.2026` (שישי לא נספר) = **16** תאריכים — רשימה ב־`OCT_2026_16_OF_21_PROOF.md` |
| **תאריך החישוב** | EMC `updated_at=2026-10-23 09:22:23 UTC` (נוצר 11.10; צבירת 16/21 נכתבה בעדכון זה). TZ ארגון: `Asia/Jerusalem` |
| **למה בעלים בצבירה** | אחרי `fd136c18`, `shouldRecognizeFullEmployerMonth` לא פוטר `owner_manager`/`company_only`. פטור נוכחות משפיע רק על UI |
| **רענון בסוף אוק׳** | לפי קוד חי: מ־01.11 צריך 33,000 אם רץ recompute. בפועל נשאר 25,142.86 מאז 23.10 — **stale מוכח** |
| **חודשים אחרים** | ינו׳–ספט׳ בלי notes של `N of W`; **רק אוק׳** עם תבנית צבירה פתוחה |
| **השפעה עסקית** | עלות מעסיק + company_only + התראת payroll — לא מזומן עדיין; לא «התראה בלבד» |

#### BUG-001 — היקף פגיעה (Prod) + מדוע לא רענן + תיקון בטוח

**טבלת חודשי ערן 2026** (פירוט מלא: `IMPACT_AND_RECOMPUTE_ROOT_CAUSE.md`):

| חודש | בסיס | מעסיק מוגדר | known שמור | company_only | expected | שולם | סטטוס | עדכון אחרון | סיווג פער |
|------|-----:|------------:|-----------:|-------------:|---------:|------:|--------|-------------|-----------|
| 01–07 | 18k | 27k | actuals ~23.4k–28.2k | =known | 27k | =known | paid | 2026-09-23 | תיקון/actual ידני — **לא stale accrual** |
| 08 | 22k | 33k | 26900 actual | 26900 | 27000 | 26900 | paid | 2026-10-11 | actual ידני |
| 09 | 22k | 33k | 34957 actual | 34957 | 33000 | 34957 | paid | 2026-10-11 | actual ידני |
| **10** | **22k** | **33k** | **25142.86** estimated 16/21 | **25142.86** | **25142.86** | — | upcoming | **2026-10-23** | **STALE** · פער **7857.14** |

**עובדים אחרים (חודש עבר + notes צבירה):** 3 עובדים באוק׳ עם 21/21 = מלא (פער 0). **רק ערן** עם 16/21. נוב׳ mid-month אצל אחרים = תקין.

| מדד | ערך |
|-----|-----|
| רשומות stale לחודש עבר | **1** (ערן·2026-10) |
| עובדים | **1** |
| סכום פער כולל | **₪7,857.14** |

**גורם שורש לאי-רענון (מוכח):** אין cron/סיום-חודש ל־employer accrual; רענון פרויקטלי מדלג על `company_only` בלי שורות פרויקט; פטור נוכחות מוריד טריגרים; bootstrap ידני בלבד; קריאת מסך לא מחשבת.

**דוחות — האם 7857.14 משפיע:**

| דוח / מאגר | נוכחי | צפוי (הכרה מלאה) | פער |
|------------|------:|-----------------:|----:|
| EMC + labor run company_only | 25142.86 | 33000 | 7857.14 |
| payroll expected (upcoming) | 25142.86 | 33000 | 7857.14 |
| תזרים / payroll_obligation | קורא expected | 33000 | 7857.14 |
| `general_cost` Oct `labor_company_only` | **25142.86** | 33000 | 7857.14 |
| pool Oct כללי | 35835.20 | ~43692.34 | 7857.14 |
| עלויות/רווחיות **פרויקט** (ערן) | 0 | 0 | **0** |
| מזומן ששולם | 0 | 0 | **0** |
| ינו׳–ספט׳ ששולם | actuals | — | לא באג צבירה |

**מניעת הישנות (מומלץ):** job גבול-חודש / יומי שמריץ recompute ל־estimated של חודשים שעברו; לכלול בעלי `company_only` מחוץ ל־project-freshness; אופציונלית רענון ב־bootstrap אוטומטי.

**תיקון היסטוריה בטוח (מומלץ — לא לבצע עכשיו):**  
`recomputeMonthlyEmployeeCostForOpenMonth(ערן, 2026-10)` — supersede→draft→apply (מכבד immutability) + sync payroll unpaid. **לא** UPDATE סכומים על `applied`. לשמור actuals ינו׳–ספט׳. לשמור נתיב retro Owner כ־supersede/adjustment (תיקון BUG-002).

**בדיקות מניעה:** אחרי תיקון — Oct=33000; labor_company_only; expected; actuals ללא שינוי; סימולציית «אמצע חודש→חודש הבא» לבעלים company_only בלי attendance.

---

### BUG-002 — קריסת אישור שכר («משהו השתבש»)

| שדה | פירוט |
|-----|--------|
| **תיאור** | פתיחת תהליך אישור שכר מקריסה למסך שגיאה גנרי; לא ניתן לאשר/לעדכן שכר ששולם |
| **חומרה** | **P1** (סימפטום מאומת בדיווח Owner; גורם שורש **עדיין לא מוכח במלואו**) |
| **שחזור** | `/workforce/employees/{id}?yearMonth=YYYY-MM&focus=payroll&paymentId={uuid}` לעובד עם ≥1 `employee_month_costs` |
| **צפוי** | `MonthlyEmployerCostReview` + `EmployeePayrollMonthPanel` |
| **בפועל** | `[locale]/error.tsx` — «משהו השתבש» (ב־Production לפי Owner) |
| **Root Cause** | **מעודכן אחרי E2E (next dev + EMC seed):** deep-link עם `paymentId` → **HTTP 200**, אין «משהו השתבש», פאנל שכר+סקירת חודש+כפתור אישור גלויים (`playwright-with-paymentId-verdict.json` = PASS_candidate). **הסימפטום של Owner ב־Prod לא שוחזר** במסלול זה. Flight-Date כגורם יחיד נשאר **מוחלש**. כשל `without paymentId` = HTTP 500 מ־`CONNECT_TIMEOUT` ל־Postgres — **HARNESS**. חסר stack מ־Prod / נתוני Owner אמיתיים. |
| **ראיות** | `bug-02/logs/playwright-with-paymentId*.json`; `BUG-02-RUNTIME.md`; Flight harness; `RUN_LOG_BUG02.txt` |
| **השפעה** | ב־Prod (דיווח Owner) — תהליך מושבת; ב־harness מבודד עם seed — המסך נטען |
| **תיקון מוצע** | **לא לתקן Serializer עיוור.** קודם שחזור על נתוני Prod/ייצוג מלא + stack; ההבדל harness↔Prod הוא ממצא ביקורת |
| **סיכון תיקון** | גבוה אם מתקנים את הגורם הלא נכון |
| **בדיקות אחרי תיקון** | Deep link עם/בלי EMC; confirm/retro; digest בלוג; desktop+mobile |

---

### BUG-003 — אין Pan חופשי ב־PDF אחרי Zoom

| שדה | פירוט |
|-----|--------|
| **תיאור** | אחרי הגדלת תוכנית (למשל 3643-EL-M2.pdf) לא ניתן להגיע לאזורים אחרים |
| **חומרה** | **P1** |
| **שחזור** | אחסון ענן או תוכניות פרויקט → PdfJsViewer → Pinch/Zoom → גרירת אצבע אחת |
| **צפוי** | Pan כמו `ZoomablePreviewImage` |
| **בפועל** | Zoom ב־`transform:scale` לא מגדיל scrollport; אין pointer-pan במגע; hand tool עכבר בלבד; body `touch-action:none` |
| **Root Cause** | **מאומת בקוד (H1):** מודל Zoom/Pan מנותק ב־`pdf-js-viewer.tsx`. H2 iOS body-lock — **השערה בינונית**. Overlay ב־view לא חוסם |
| **ראיות** | `bug-03/FINDING.md`; `pdf-transform-scroll-probe.test.ts` **4/4 PASS**; `TOUCH_PAN_GAPS.md` (מגע/מכשיר UNVERIFIED); git (`f6c45b02`, `5cd8a858`) |
| **השפעה** | כל שלוש האפליקציות המשתמשות ב־PdfJsViewer |
| **תיקון מוצע** | Commit scale ל־layout מיד; pointer pan; תיקון body lock |
| **סיכון תיקון** | בינוני — מחוות סימון/מדידה |
| **בדיקות אחרי תיקון** | Pinch+pan; toolbar zoom; Android/iOS/desktop; סימון ב־view; אחסון+תוכניות |

---

### BUG-004 — תצוגת עלות מעסיק (ILS8250, 6dp, אנגלית)

| שדה | פירוט |
|-----|--------|
| **תיאור** | בשדות/דיאלוגי תיקון עלות מעסיק: קוד ISO צמוד לסכום, 6 ספרות, טקסט טכני |
| **חומרה** | **P2** |
| **שחזור** | מסך עובד → תיקון עלות מעסיק → MoneyInput / דיאלוג אישור שינוי עסקי |
| **צפוי** | ₪ / 2 ספרות / עברית |
| **בפועל** | `currencySymbol={currency}` → ILS + `ps-8`; diffs גולמיים; הסברי accrual באנגלית |
| **Root Cause** | **מאומת** |
| **ראיות** | `bug-04/FINDINGS.md`; `money-input.tsx`; `monthly-employer-cost-review.tsx` |
| **השפעה** | בלבול בעריכת עלויות; אמון נמוך |
| **תיקון מוצע** | סמל מקומי + `currency=`; formatMoney בדיאלוג; i18n |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | RTL MoneyInput; דיאלוג; retro payroll |

---

### BUG-005 — FAB מובייל מסתיר תוכן/פעולות

| שדה | פירוט |
|-----|--------|
| **תיאור** | כפתור + קבוע חופף CTAs בתחתית/פינה (RTL שמאל) |
| **חומרה** | **P2** |
| **שחזור** | 360–430px במסכי טפסים/רשימות; במיוחד `/new`,`/edit`, דחיית משימה בעובדים |
| **צפוי** | פעולות ראשיות נגישות; FAB מוסתר במסכי composer ממוקדים |
| **בפועל** | `isFocusedComposerPath` קיים אך **לא מחובר**; unit test אוכף שלא ייקרא; יש רק padding תחתון |
| **Root Cause** | **מאומת בקוד** |
| **ראיות** | `bug-05/FINDINGS.md`; unused-proof **3/3 PASS**; `SCREENS_AT_RISK.md`; FAB vs bottom-nav: **PASS** בריצה מבודדת (`FOCUSED_E2E_RESULTS.md`) + viewport dashboard ≤390; Save-vs-composer overlap **UNVERIFIED** |
| **השפעה** | Main + Employee; לא Contractor portal |
| **תיקון מוצע** | חיבור hide ל־composer; inset אופקי RTL; E2E intersection |
| **סיכון תיקון** | נמוך (שינוי מדיניות טסט) |
| **בדיקות אחרי תיקון** | 320/390 על expenses/tasks/workforce create |

---

### BUG-006 — סיכון Deploy-before-migrate (הוחלש אחרי אימות חי)

| שדה | פירוט |
|-----|--------|
| **תיאור** | חשש מקוד שרץ לפני SQL 0200–0203 |
| **חומרה** | **P3 Residual** (לא P0) — סכמה חיה תואמת 0197–0203 |
| **שחזור** | MCP read-only על `rnjeggpsjchayprygkcw` |
| **צפוי** | אובייקטי 0200–0203 + journal |
| **בפועל** | `tasks.work_package_id` קיים; baselines/goals/marks/risks/permits/RFQ tokens קיימים; CHECK `task_blocked` ב־`automation_rules`; חותמות `created_at` תואמות journal `when` ל־0197–0203 |
| **Root Cause** | **לא מאומת כתקלה חיה** — החשש היה פערי אימות; כעת מוחלש. נותר: SHA קוד ב־Vercel ≠ אומת |
| **ראיות** | `env/MIGRATIONS_LIVE_READONLY.md`; `db/SCHEMA_MIGRATION_0200-0203_READ_ONLY_AUDIT.md` |
| **השפעה** | סיכון migrate חסר **נמוך** על DB זה; סיכון deploy-code ישן נפרד |
| **תיקון מוצע** | אין SQL להחלה על סמך ממצא זה; לאמת SHA Prod בלבד |
| **סיכון תיקון** | — |
| **בדיקות אחרי תיקון** | לאחר אימות SHA: smoke tasks/goals |

---

### BUG-007 — טבלאות 0200 חסרות ב־Drizzle schema

| שדה | פירוט |
|-----|--------|
| **תיאור** | שש טבלאות (marks, risks, RFQ tokens, permits, …) רק ב־SQL + raw repos |
| **חומרה** | **P2** |
| **שחזור** | השוואת `0200_*.sql` מול `drizzle/schema/*` |
| **צפוי** | ייצוג Drizzle תואם |
| **בפועל** | אין קבצי schema לטבלאות אלה |
| **Root Cause** | **מאומת** |
| **ראיות** | DB audit |
| **השפעה** | Drift / חוסר טיפוסים; Runtime תלוי migrate |
| **תיקון מוצע** | הוספת schema TS |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | journal + generate check |

---

### BUG-008 — FK חלש ל־`tasks.work_package_id`

| שדה | פירוט |
|-----|--------|
| **תיאור** | FK ל־`work_packages(id)` בלבד; אין אכיפת org/project ב־DB |
| **חומרה** | **P2** |
| **שחזור** | סקירת `0203_tasks_work_package_id.sql` מול דפוס DG |
| **צפוי** | FK מורכב או שווה־ערך |
| **בפועל** | אכיפה באפליקציה בלבד (`assertWorkPackageMatchesTaskProject`) |
| **Root Cause** | **מאומת** |
| **ראיות** | DB audit; `assert-work-package-for-task.ts` |
| **השפעה** | סיכון קישור חוצה־פרויקט אם נעקף assert |
| **תיקון מוצע** | מיגרציה עתידית ל־composite FK |
| **סיכון תיקון** | בינוני (מיגרציה) |
| **בדיקות אחרי תיקון** | ניסיון קישור wp מפרויקט אחר נדחה ב־DB |

---

### BUG-009 — אסימטריית הרשאות יעדי פרויקט

| שדה | פירוט |
|-----|--------|
| **תיאור** | קריאה `project.view`; כתיבה `projects.update` או `planning.write` |
| **חומרה** | **P3** (ייתכן by design) |
| **שחזור** | משתמש עם view בלבד מול יעדים |
| **צפוי** | מתועד במטריצת מוצר |
| **בפועל** | list ללא mutate אפשרי |
| **Root Cause** | מדיניות RLS 0201 |
| **ראיות** | `0201` SQL; `goal-mutation-access.ts` |
| **השפעה** | בלבול UX |
| **תיקון מוצע** | תיעוד או יישור תבניות תפקידים |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | תפקיד view-only |

---

### BUG-010 — מיסוך שגיאות במסך עובד / אישורי זמן

| שדה | פירוט |
|-----|--------|
| **תיאור** | טעינת עובד: `catch → notFound()`; אישורי זמן → error גנרי |
| **חומרה** | **P2** |
| **שחזור** | כשל DB/הרשאה במסך עובד או `/workforce/time/approvals` |
| **צפוי** | הודעת שגיאה מדויקת |
| **בפועל** | 404 או «משהו השתבש» |
| **Root Cause** | **מאומת סטטית** |
| **ראיות** | finance audit; `employees/[employeeId]/page.tsx`; `time/approvals/error.tsx` |
| **השפעה** | קשה לאבחן תקלות שכר/זמן |
| **תיקון מוצע** | מיפוי AppError; error.tsx סגמנטלי |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | הזרקת ValidationError / AuthorizationError |

---

### BUG-011 — Live Share Host: `project.view` במקום document

| שדה | פירוט |
|-----|--------|
| **תיאור** | `startLiveShare` מעביר `need:'document'` אך ל־internal `authorizeProject` מתעלם מ־need ואוכף רק `PROJECT_VIEW` |
| **חומרה** | **P1** |
| **שחזור** | משתמש פנימי עם project.view ללא documents → התחלת Live Share |
| **צפוי** | דרושה יכולת מסמך (לפי תיעוד המודול) |
| **בפועל** | מספיק project.view |
| **Root Cause** | **מאומת בקוד** (`access.ts` L73–80 מתעלם מ־`need` ל־internal) |
| **ראיות** | `surfaces/LIVE_SHARE_AUTHZ.md` + `LIVE_SHARE_TEST_RUN.md`; `live-share.test.ts` **17/17** + `access-isolation` **7/7**; `access.ts` מתעלם מ־`need` ל־internal; מסלולים: Host → `startLiveShareAction` / `setLiveShareControl` / `endLiveShare`; Join API ללא `authorizeProject` |
| **השפעה** | שידור וידאו ללא הרשאת מסמך המיועדת |
| **תיקון מוצע** | לאכוף document capability ל־internal hosts בכל כניסות ה־host; לא לפתוח Join בלי מדיניות מפורשת |
| **סיכון תיקון** | נמוך־בינוני (משתמשים שאיבדו גישה) |
| **בדיקות אחרי תיקון** | view-only נדחה; document עובר; contractor upload path |

---

### BUG-012 — מוני משימות Multi-Org ב־org switcher

| שדה | פירוט |
|-----|--------|
| **תיאור** | `runInOrgContext` מקונן מתעלם מ־organizationId יעד → ספירות מיוחסות לארגון הפעיל |
| **חומרה** | **P2** (שלמות תצוגה; לא הוכחה דליפת שורות) |
| **שחזור** | משתמש ב־2+ ארגונים → תגי open-tasks ב־switcher |
| **צפוי** | ספירה לכל ארגון בנפרד |
| **בפועל** | ספירות שגויות/זהות לארגון הפעיל (לוגית) |
| **Root Cause** | **מאומת מבנית** ב־`session.ts` |
| **ראיות** | `PERMISSIONS_SECURITY.md`; `organization-switcher-open-tasks.ts` |
| **השפעה** | מידע מטעה בניהול רב־ארגוני |
| **תיקון מוצע** | לא לקנן הקשר לארגון אחר; שאילתה מפורשת לפי org |
| **סיכון תיקון** | בינוני (shell perf) |
| **בדיקות אחרי תיקון** | 2 ארגונים עם מספרי משימות שונים |

---

### BUG-013 — Sheet-mark ↔ BOQ ללא אימות פרויקט בשרת

| שדה | פירוט |
|-----|--------|
| **תיאור** | יצירת סימון עם linkedEntityId בודקת כפילות בגרסה בלבד |
| **חומרה** | **P2** |
| **שחזור** | API/action עם `linkedEntityId` של קו BOQ מפרויקט אחר באותו ארגון |
| **צפוי** | דחייה אם הקו לא שייך לפרויקט/BOQ פעיל |
| **בפועל** | אין assert שרת מלא (UI טוען קווים של הפרויקט) |
| **Root Cause** | **מאומת בקוד** |
| **ראיות** | modules risk scan; `sheet-marks.ts`; `sheet-mark-boq-link.ts` |
| **השפעה** | קישור מוטעה בתוך הארגון |
| **תיקון מוצע** | assert שייכות פרויקט/BOQ בשרת |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | ניסיון קישור חוצה־פרויקט נדחה |

---

### BUG-014 — חיפוש גלובלי קורס אם טבלאות 0200 חסרות

| שדה | פירוט |
|-----|--------|
| **תיאור** | `Promise.all` על kinds כולל risks/permits בלי probe → כישלון חיפוש שלם |
| **חומרה** | **P2** (תלוי migrate; קשור ל־BUG-006) |
| **שחזור** | חיפוש עם `projects.read` כש־`project_risks`/`work_permits` חסרים |
| **צפוי** | דגרדציה חלקית |
| **בפועל** | כשל כולל אפשרי |
| **Root Cause** | **מאומת בקוד** |
| **ראיות** | `global-search.ts`; `search.repository.ts` |
| **השפעה** | אובדן חיפוש ארגוני |
| **תיקון מוצע** | probe/`allSettled` per kind |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | חיפוש עם/בלי טבלאות |

---

### BUG-015 — יעדי פרויקט רק באפליקציה הראשית

| שדה | פירוט |
|-----|--------|
| **תיאור** | UI יעדים רק ב־main; אין employee/contractor routes |
| **חומרה** | **P3** (parity — ייתכן מכוון) |
| **שחזור** | חיפוש נתיבי goals תחת employee/contractor |
| **צפוי** | parity או תיעוד essential-need |
| **בפועל** | main בלבד |
| **Root Cause** | היקף sprint |
| **ראיות** | system map; `goals/page.tsx` |
| **השפעה** | עובדים/קבלנים עם project.view לא רואים יעדים במשטח שלהם |
| **תיקון מוצע** | תיעוד במטריצה או הוספת surfaces |
| **סיכון תיקון** | נמוך־בינוני |
| **בדיקות אחרי תיקון** | שלוש האפליקציות |

---

### BUG-016 — Today `?lens=decisions` מסתיר פריטי כספים

| שדה | פירוט |
|-----|--------|
| **תיאור** | עדשת החלטות מסננת inbox; נראה כאילו פריטי שכר/תשלומים נעלמו |
| **חומרה** | **P3** (UX / false regression) |
| **שחזור** | `/today?lens=decisions` מול `/today` ברירת מחדל |
| **צפוי** | סינון מפורש ומסומן |
| **בפועל** | סינון ל־`project_decision_recent` בלבד |
| **Root Cause** | **מאומת** ב־`today/page.tsx` |
| **ראיות** | release regression map |
| **השפעה** | בלבול תפעולי |
| **תיקון מוצע** | תווית ברורה / איפוס lens |
| **סיכון תיקון** | נמוך |
| **בדיקות אחרי תיקון** | lens on/off מציג payroll items |

---

### אבטחה — תוכניות פנימיות לקבלן

| שכבה | סטטוס |
|------|--------|
| קוד + RLS + unit/integration | **PASS** — `contractorMayViewDrawing` דוחה `internal` גם עם `ext.plan.view` |
| Runtime בדפדפן מול נתוני Prod | **UNVERIFIED** (לא בוצע כתיבה/גישה ל־Prod) |

ראיות: `drawing-visibility.test.ts` (unit PASS בגל זה); `PERMISSIONS_SECURITY.md`.

---

## ג. מטריצת כיסוי (מעודכנת)

| מודול | קוד | Unit | Runtime/E2E מבודד | סטטוס | ביטחון |
|--------|-----|------|-------------------|--------|--------|
| Git/SHA מקומי | כן | — | — | PASS | גבוה |
| Production SHA חי | — | — | READY+alias+inferred `b2f0b9e7` | **VERIFIED PASS (inferred)** | גבוה־בינוני |
| Migrations journal | כן | PASS | — | PASS repo | גבוה |
| Migrations apply חי | — | — | schema+journal **PASS** | **VERIFIED PASS** (PROFLOW) | גבוה |
| שכר/התראות | כן | PASS accrual | חלקי | BUG-001 | גבוה קוד |
| אישור שכר | כן | Flight Date **לא** נכשל; PGlite **7 PASS** | deep-link+EMC+paymentId **VERIFIED PASS** (no crash); without-id **HARNESS** | BUG-002 — לא שוחזר ב־harness | נמוך־בינוני ל־RC; גבוה לדיווח Owner |
| הוצאות/ספקים/תשלומים | כן | finance units | list **PASS**; detail/create/payment **HARNESS/UNVERIFIED** | `BUSINESS_FLOWS_RESULTS.md` | בינוני |
| רווחיות/תזרים | כן | VAT/recognition PASS | money-chain **לא רץ** | יציב בקוד | בינוני |
| פרויקטים/חוזים/BOQ | כן | — | hubs **PASS**; BOQ **UNVERIFIED** | BUG-013 | בינוני |
| משימות/views/WP | כן | — | work hub **HARNESS**; create **UNVERIFIED** | BUG-008/014 | נמוך־בינוני |
| CPM/Baseline/יעדים | כן | migration unit | **UNVERIFIED** E2E | BUG-015 | בינוני |
| RFI/ליקויים/בטיחות | מיפוי | — | safety **PASS**; RFI/defects nav **HARNESS** | `BUSINESS_FLOWS_RESULTS.md` | בינוני |
| PDF/שרטוטים | כן | geometry **4/4 PASS** | live viewer **HARNESS** (storage/OCR); device **UNVERIFIED** | BUG-003 + `PDF_MOBILE_WAVE2.md` | גבוה קוד |
| Infra/Live Share | כן | live-share+isolation **24/24** | infra viewport **PASS**; Live Share runtime **UNVERIFIED** | BUG-011 | גבוה קוד |
| קבלנים | מיפוי + visibility | PASS unit | login **PASS**; overflow prior = **HARNESS** | `THREE_SURFACE_RUNTIME.md` | גבוה ל־login |
| אפליקציית עובדים | — | — | `single99` **PASS**; opspm **HARNESS** | `THREE_SURFACE_RUNTIME.md` | בינוני |
| רכש/RFQ | כן | — | list **HARNESS**; seed RFQ placeholder | `BUSINESS_FLOWS_RESULTS.md` | נמוך |
| התראות | כן | — | notifications **PASS** (overnight) | BUG-001/016 | בינוני |
| הרשאות 3 משטחים | כן | PASS | contractor + `single99` **PASS** | `THREE_SURFACE_RUNTIME.md` | גבוה ל־login |
| מובייל viewports | shell unit | PASS | dashboard **320–1920 PASS** (incl. 360/430/1920); late mobile batch חלקי | `PDF_MOBILE_WAVE2.md` | גבוה |
| Dark/Light/styles | קיים | — | dark @390 **PASS**; Classic מלא **UNVERIFIED** | חלקי | בינוני |

מיפוי מסכים: ~248 main / 106 employee / 53 contractor — `surfaces/SYSTEM_MAP.md`.

### Viewports / עיצוב — מה נבדק בפועל

| פריט | סטטוס |
|------|--------|
| Unit shell (FAB tokens, RTL left, padding) | נבדק — PASS |
| 320/375/390/768/1280 (dashboard, expenses, infra) | **PASS** |
| 360/430/1920 (dashboard + FAB@≤430) | **VERIFIED PASS** — `PDF_MOBILE_WAVE2.md` |
| Dark @390 (dashboard) | **PASS** |
| Classic / Light מלא לכל תפקיד | **UNVERIFIED** |
| PdfJsViewer live gestures | **HARNESS** (storage/OCR) — geometry unit **PASS**; device **UNVERIFIED** |

---

## ד. רגרסיות מהשחרורים

| ID | היה תקין | כעת | שינוי מוכח? | איך הוכח | מודולים |
|----|----------|-----|-------------|----------|---------|
| R-01 בעלים full-month | לפני `fd136c18` | צבירה יחסית | **כן** `fd136c18` | diff + unit 25142.86 | payroll alerts, EMC |
| R-02 אישור שכר | עבד בעבר (דיווח Owner) | crash ב־Prod מדווח; harness EMC+paymentId **PASS** | **לא מוכח ל־commit**; Date-Flight הופרך; שחזור מבודד נכשל | דיווח Owner מול E2E PASS | workforce |
| R-03 PDF pan | לפני pinch-transform | תקוע אחרי zoom | **כן** `f6c45b02`/`5cd8a858` | git blame + code | PDF כל המשטחים |
| R-04 tasks wp | לפני 0203 בקוד | תלוי migrate | **כן** `0c43a36e`→`3cffcab7` | schema לפני SQL | tasks |
| R-05 Today lens | inbox מלא | decisions filter | **כן** `0c43a36e` | today page | CC |
| R-06 Live Share need | (כוונת מסמך) | view מספיק | קיים בקוד; לא בהכרח רגרסיית גל אחרון | access.ts | infra |

**טריו `787623f0`/`3cffcab7`/`b2f0b9e7`:** אין שינויי מקור finance/payroll. `3cffcab7` = 0203. `b2f0b9e7` = tests בלבד.

---

## ה. בעיות נתונים וחישובים

| נושא | מצב |
|------|------|
| 25,142.86 | `ENGINE_MATCHES_CODE` = צבירת עלות מעסיק 16/21 |
| בסיס מול מעסיק מול שולם מול מוכר | `PRODUCT_SEMANTICS_AMBIGUOUS` — תווית «שכר» מול `expectedAmount` = עלות מעסיק; cash נפרד |
| סגירת אוק׳ (תאריך ביקורת נוב׳ 2026) | קלנדרית → בריכה ₪33,000 **אם** recompute רץ; אחרת `LIKELY_STALE_ROW` — **UNVERIFIED בלי DB** |
| כפילויות/יתומים חיים | **UNVERIFIED** |

פירוט עסקי: `bug-01/FINDINGS.md`, `bug-01/BUSINESS_SEMANTICS.md`.

---

## ו. הרשאות ואבטחה

| נושא | קוד | Runtime |
|------|-----|---------|
| Internal drawings | PASS | UNVERIFIED חי |
| Infra parity | PASS unit | UNVERIFIED חי |
| Live Share host | **FAIL כוונה** (BUG-011) | UNVERIFIED חי |
| Multi-org counts | BUG-012 | UNVERIFIED חי |
| RLS 0200–0201 | סקירה חיובית | schema apply **VERIFIED** (PROFLOW) |
| Payroll/finance permissions | סטטי | UNVERIFIED חי |
| Contractor / Employee shell login | — | contractor + `single99` **PASS**; prior FAIL = **HARNESS** (`THREE_SURFACE_RUNTIME.md`) |

---

## ז. UX

BUG-003, BUG-004, BUG-005, BUG-016 + RTL/FAB. Device PDF = UNVERIFIED. Portal overflow prior FAIL = harness assertion (intentional `overflow-x: clip`).

---

## ח. בדיקות שבוצעו / נכשלו

| בדיקה | תוצאה |
|--------|--------|
| owner-employer-cost-invariant + payroll-labor-decoupling | **14/14 PASS** (גל זה) |
| migration-journal + 0201/0202 units | PASS |
| alert-deep-links + quick-create-fab + mobile-layout | PASS |
| drawing-visibility **4/4** + live-share **17** + access-isolation **7** | PASS (קוד); portal חי UNVERIFIED |
| PDF scroll-extent probe | **4/4 PASS**; touch device UNVERIFIED |
| FAB unused-proof + FAB vs bottom-nav (isolated) | **PASS**; Save-vs-composer UNVERIFIED |
| Flight RSC harness + PGlite bug-02 | Date `$D` PASS; loader **7 PASS** — לא מוכיח crash דפדפן |
| Playwright full batch | **12/16** — `RUN_LOG_FULL.txt`; כשלי mobile מאוחרים = harness |
| Viewport smoke | **17/17 PASS** — `RUN_LOG_VIEWPORT.txt` |
| Portal smoke (prior) | overflow/login **FAIL** — reclassified **HARNESS** |
| Three-surface diagnosis | contractor login **PASS**; employee `single99` **PASS**; opspm **HARNESS** | `THREE_SURFACE_RUNTIME.md` |
| Vercel production list | **BLOCKED** 403 team |
| gh CI 42659848441 | **BLOCKED** לא מחובר |

---

## ט. בדיקות שלא הושלמו / חסומות

1. SHA Production חי — חסר Vercel team consent.  
2. (סגור) SHA+alias Production אומתו; מיגרציות אומתו.  
3. Stack Playwright ל־BUG-02 — בתהליך harness מבודד.  
4. Android/iOS אמיתי ל־PDF.  
5. מטריצת viewports מלאה + Dark/Light לכל תפקיד.  
6. E2E מלא לכל מודולי RFI/בטיחות/רכש עם כתיבה מבודדת.  
7. שליחת מייל/webhook אמיתית — אסורה.  
8. כתיבה ל־Production — אסורה.

**השפעה על מסקנות:** Prod READY+SHA+migrations אומתו; BUG-002 לא שוחזר ב־harness; כישלונות portal קודמים = **HARNESS** (לא באג מוצר של overflow/login כללי) — `THREE_SURFACE_RUNTIME.md`.

---

## י. תוכנית תיקון מומלצת (ללא ביצוע)

1. (סגור מבחינת אימות) Prod SHA/alias/migrations — אין SQL להחלה מ־BUG-006.  
2. **BUG-002:** שחזור על נתוני Prod/ייצוג מלא + stack **לפני** תיקון; לא serializer — harness כבר PASS.  
3. BUG-003 PDF pan/zoom.  
4. BUG-011 Live Share authz.  
5. BUG-001 החלטת מוצר + UX/רענון.  
6. BUG-004/005/010/012/013.  
7. Schema/search hardening (007/008/014).  
8. P3 תיעוד/UX (009/015/016).

אין לבצע עד אישור מפורש.

---

## יא. סיכום בעברית לבעלים

הדוח המאוחד כולל **16 ממצאים ממוספרים** (BUG-001 עד BUG-016) עם תיאור מלא לכל אחד.

**הכי דחוף לתפעול:**  
- **אישור שכר (BUG-002)** — מדווח ב־Prod; ב־harness עם EMC+paymentId **לא קרס** (VERIFIED PASS). Flight-Date כגורם יחיד **הופרך**. נדרש שחזור על נתוני Owner אמיתיים לפני תיקון.  
- **PDF אחרי זום** — באג ברכיב המשותף (מודל גיאומטרי הוכח).  
- **התראת ₪25,142.86** — תואם מנוע (`ENGINE_MATCHES_CODE`); תווית «שכר» מול עלות מעסיק = פער מוצר; סיכון stale אחרי סגירת חודש.  
- **Live Share** — חור הרשאה מאומת בקוד (24 unit PASS מסביב).  

**Production:** `dpl_613…` READY · alias תקין · SHA משוחזר `b2f0b9e7`. **מיגרציות:** אומתו — BUG-006 לא P0.  
**E2E מבודד (גל אחרון):** viewport 360/430/1920 **PASS**; expenses list + project hubs **PASS**; detail/create/RFQ/RFI **HARNESS/UNVERIFIED**; PDF חי **HARNESS**; BUG-002 deep-link **PASS** ב־harness; portal login **PASS** (כישלונות קודמים = HARNESS). ראה `BUSINESS_FLOWS_RESULTS.md`, `PDF_MOBILE_WAVE2.md`, `THREE_SURFACE_RUNTIME.md`.

**לא תוקן שום דבר.** אין Serializer עיוור ל־BUG-002; אין Deploy/Push/מיגרציות בגל זה.

לאימות Production: לאשר מחדש Vercel team SSO כשמוכן.

---

## יב. בקרת שלמות עצמית (QC)

| בדיקה | תוצאה |
|--------|--------|
| 1. כל הממצאים 001–016 מופיעים | כן |
| 2. אין כפילות מזהים | כן |
| 3. ספירה תואמת סיכום | 16 ממצאים |
| 4. חומרות עקביות (006 מותנה) | כן |
| 5. ראיות לכל ממצא | כן (נתיבים) |
| 6. קישורים לראיות | תחת `evidence/exlfy-full-regression-2026-11/` |
| 7. אין PASS בלי בדיקה | Runtime חסר = UNVERIFIED |
| 8. חסרים מסומנים UNVERIFIED | כן |
| 9. חשדות מסומנים כהשערה | כן (stale row, iOS lock, digest חי) |
| 10. מטריצת כיסוי לכל תחום | כן |
| 11. בדיקות שנכשלו/נחסמו מתועדות | כן |
| 12. מגבלות גישה מוסברות | כן |
| 13. תוכנית תיקון ללא ביצוע | כן |
| 14. אין שינוי קוד מוצר/Production | כן (רק docs/audits) |

**סטטוס דוח:** **לא מאושר לתיקונים.** חקירת BUG-001 (מקור 16/21 מ־Prod) הושלמה. ראיות מאוחדות ל־BUG-001…016 קיימות, אך Owner טרם אישר את הדוח / מעבר לביצוע. אין תיקונים / Push / Deploy.

---

*סוף הדוח המאוחד. אין להתחיל תיקונים לפני אישור Owner מפורש.*
