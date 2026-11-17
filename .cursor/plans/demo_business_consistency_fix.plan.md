---
name: Demo business consistency fix
overview: "Final execution plan: one seed+cleanup wave so all 20 demo profiles are economically trustworthy (CCV→billed→collected→AR→cost→commitments→profit), preserve A1–A19 richness, add B1–B8+C* gates, and permanently clear [דמו-נטוש] orgs that soft-abandon leaves behind. No code until Owner approves this plan."
todos:
  - id: money-envelope
    content: "Per-project money envelope: CCV→billed→collected→AR→cost→commitments→profit for all projects × 20 profiles; engines must match"
    status: completed
  - id: preserve-a1-a19
    content: "Keep monthly non-empty activity, payroll, cashflow, professional variance, contracts, three-app data; no empty months to fix overbill"
    status: completed
  - id: service-cost-align
    content: "Scale p-service costs/AP/hours so service Actual ≤ CCV (no artificial loss); billed ≤ CCV"
    status: completed
  - id: zero-value-cards
    content: "Gate active+contracted projects: engine/dashboard contract KPI > 0 when fixture CCV > 0; fix seed or wiring if broken"
    status: completed
  - id: abandoned-org-cleanup
    content: "Hard-delete path without session_replication_role + nightly/sweeper for [דמו-נטוש]; acceptance C1–C4; no Prod delete until approved"
    status: completed
  - id: acceptance-a-b-c
    content: "A1–A19 stay green; add B1–B8 + C1–C4; prove B* fail on current seed before fix, pass after"
    status: completed
  - id: single-release
    content: "Commit ready; await Owner for push/deploy + SQL 0215 + sweeper opt-in"
    status: pending
isProject: true
---

# Demo business consistency — תוכנית ביצוע סופית אחת

**סטטוס:** מימוש מקומי הושלם (2026-11-18). דוח סגירה: `docs/audits/EXLFY_DEMO_BUSINESS_CONSISTENCY_FIX_CLOSURE_2026-11-18.md`. ממתין לאישור Push/Deploy + SQL 0215 + הפעלת sweeper.

**מקור ממצאים (כבר הוכח — לא לחקור מחדש):**  
`docs/audits/EXLFY_DEMO_BUSINESS_CONSISTENCY_AUDIT_2026-11-17.md`  
+ `docs/audits/local-tool-artifacts/demo-business-consistency-fixture-2026-11-17.json`  
+ `docs/audits/local-tool-artifacts/demo-business-consistency-engine-sample-2026-11-17.json`

**החלטות סגורות בתוכנית זו — אין פערים שדורשים החלטה נוספת לפני ביצוע.**

---

## 0. Non-negotiables

| כלל | פירוט |
|---|---|
| היקף קוד | `src/modules/demo/**` (+ בדיקות demo) בלבד |
| מנועים | **אין** שינוי מנועי כספים / הרשאות / RLS |
| SQL Production | אסור בלי אישור Owner נפרד אחרי הכנת הקובץ |
| פריסה | גל אחד אחרי A1–A19 + B1–B8 + C1–C4 ירוקים מקומית |
| עושר דמו | **חובה** לשמר A1–A19 — אסור «לתקן» overbill במחיקת פעילות או חודשים ריקים |
| שינויי חוזה | **אסור** ליצור CO פיקטיביים כדי להעלות CCV ולהסתיר חיובים |

---

## 1. עקביות כספית מלאה (שרשרת אחת)

### אילוץ מחייב לכל פרויקט עם חוזה (כל 20 הפרופילים)

```
CCV = originalValueNet + Σ approvedChangeNet
billedNet ≤ CCV + ε_round          (ε_round ≤ ₪1)
collectedNet ≤ billedNet + ε_round
outstandingAR = billedNet − collectedNet   (± ₪1)
actualCost (מנוע) ≥ 0
commitments (PO פתוחים + דומה) ≥ 0 ומכוילים לתקציב
profitStory = CCV − actualCost     (מדד הסיפור לבעלים; לא חייב ≥0 אם intentionalLoss=true — בדמו: false)
```

**מקור אמת אחרי זריעה:** המנועים הקיימים — `getProjectFinancials` / `getOrganizationProjectRollup` (PGlite), לא סכימת fixture ידנית בלבד. Fixture חייב לייצר נתונים שהמנועים מאשרים.

### שינוי מוצע (שורש → תיקון)

| ממצא | שורש | שינוי מוצע | קבצים | בדיקה | תוצאה צפויה |
|---|---|---|---|---|---|
| חיובים ≫ CCV ב־`p-active` (40−20=`p-active`×20) | `legacyBilling ∪ monthly` בלי תקרה; monthly תמיד על `p-active` | פונקציה טהורה `allocateBillingWithinContract`: (1) מחשבת יתרת חוזה אחרי legacy, (2) מחלקת את יתרת החיוב החודשי בין פרויקטים חוזיים לפי משקולות, (3) **מצמצמת סכומי חשבונית חודשית** כך שסכום החיים ≤ יתרה — **בלי למחוק חודשי פעילות** | `monthly-activity.ts`, `fixture-builder.ts`, אולי helper חדש `billing-envelope.ts` תחת `fixtures/` | **B1, B4, B8** | ELECTRICAL `p-active` billedNet ≤ 600k; GC ≤ 888k; 0 overbill בכל 20 |
| חיובים > CCV ב־`p-service` | legacy `b-service-1/2` > חוזה 18.5k×scale | הגדלת חוזה שירות **או** הקטנת שני החשבונות כך ש־Σ billed ≤ CCV; עדיפות: **הגדלת חוזה השירות** לכיסוי ה־legacy הקיים + מרווח קטן לפעילות חודשית מועטת אם מחולקת לשם — בלי להנמיך את נפח הפעילות הכללי | `fixture-builder.ts` (contractDefs / billingDefs) | **B1** | overbillAmt(`p-service`)=0 בכל 20 |
| גבייה / AR | כבר תקין יחסית לחיובים | אחרי צמצום חיובים: לשמור יחס גבייה ~70% על חודשיים + תקבולי legacy; כל payment נשאר משויך ל־`billingKey` | `monthly-activity.ts` | **B2, B3** | אין over-collection; AR = billed−collected |
| עלויות / רווחיות `p-service` | הוצאות/AP על שירות לעיתים ≫ CCV קטן | לכליל הוצאות+AP+שעות של `p-service` תחת `costCap = CCV × costRatio` (ברירת מחדל **0.85**); עודף מועבר ל־`p-active` / `p-active-2` **או** מוקטן בפרופורציה — חודשי פעילות נשארים לא־ריקים | `monthly-activity.ts`, `fixture-builder.ts` | **B7** | ActualCost(`p-service`) ≤ CCV; אין הפסד מלאכותי |
| תקציב / PO / AP | תקציב=0.92×CCV לא קשור לנפח חיוב; PO קבועים | אחרי envelope: תקציב פעיל ∈ **[0.85×CCV, 1.10×CCV]**; סכומי PO מצטברים ≤ תקציב; AP ≤ התחייבויות/הוצאות סבירות | `fixture-builder.ts` | **B6** | אין תקציב מנותק מ־CCV |
| שינויי חוזה | Changes=0 תמיד | **החלטה סגורה:** בגל זה **לא** חובה לזרוע CO. אם יזרעו 1–2 CO לדוגמה — רק עם סכום חיובי אמיתי שמוסיף ל־CCV **ואז** כל החיובים עדיין ≤ CCV החדש. **אסור** CO שנועד רק «לבלוע» overbill | אופציונלי ב־`fixture-builder.ts` | **B5** | אין CO פיקטיבי מסתיר |

### שמירת עושר (A1–A19) — חוקים מחייבים בזמן הרפקטור

1. **אין חודש פעילות ריק** מעבר ל־quiet month שכבר מוגדר בארכיטיפ (A1/A11).
2. צמצום כסף = **הקטנת סכומים** / **פיזור בין פרויקטים**, לא מחיקת שורות חודש.
3. Payroll, expenses, AP, time entries, RFIs, tasks, three-app actors — נשארים; רק סכומים/שיוך פרויקט מכוונים.
4. אחרי התיקון: **A1–A19 חייבים להישאר ירוקים** באותה חבילת בדיקות.

---

## 2. בדיקות B1–B8 (מעודכנות — אכיפה עסקית מדויקת)

מריצים על **כל 20** הפרופילים. לפני התיקון: B1 (ו־B7/B8) **חייבים להיכשל** על הזריעה הנוכחית. אחרי התיקון: כולם ירוקים + A1–A19 ירוקים.

| # | כלל | נכשל כאשר | הערות אכיפה |
|---|---|---|---|
| **B1** | `billedNet ≤ CCV + ₪1` לכל פרויקט עם חוזה | כל overbill כמו בצילום | **אין** סובלנות 1%; רק עיגול |
| **B2** | `collectedNet ≤ billedNet + ₪1` | גביית יתר | |
| **B3** | `|AR − (billedNet − collectedNet)| ≤ ₪1` | יתרה לא מתיישבת | דרך מנוע + fixture |
| **B4** | לפרויקט `active` עם CCV>0: `billedNet/CCV ∈ [0.15, 1.00]` | חיוב קיצוני או כמעט־אפס לא־עקבי לסטטוס | completed/cancelled: כללים נפרדים ≤1.00 |
| **B5** | אם `billedNet>0` → חוזה או WO/open-pricing מתועד בזריעה | חיוב בלי בסיס | **וכן:** אם יש CO — `CCV = original + approved` בלבד; אסור CO שנוצר רק כדי ש־B1 יעבור (בדיקה: לפני/אחרי CO, יחס billed/original לא «נבלע» ע״י הגדלת CCV מעל הצורך העסקי — בגל זה פשוט: **או אין CO, או CO עם billing נפרד שמצדיק אותם**) |
| **B6** | תקציב פעיל ∈ [0.85, 1.10]×CCV | תקציב מנותק | |
| **B7** | `p-service`: `actualCost ≤ CCV + ₪1` ו־`billedNet ≤ CCV + ₪1` | עלות/חיוב שירות לא סבירים | Actual מ**מנוע**, לא רק expenses fixture |
| **B8** | ELECTRICAL `p-active`: overbillAmt == 0; חוזה 600k נשמר (±scale) | רגרסיית הצילום | |

**מיקום מוצע:** `tests/integration/demo/demo-business-consistency-acceptance.test.ts` (+ יחידות טהורות על `allocateBillingWithinContract`).

---

## 3. ניקוי ארגוני `[דמו-נטוש]` — חובה (החלטות סגורות)

### מצב נוכחי (עובדות קוד — לא חקירה חדשה)

| שאלה | תשובה |
|---|---|
| האם נמחקים אוטומטית? | **לא.** Soft-abandon משאיר את שורת הארגון + הנתונים. |
| מנגנון | `deleteDemoSessionOrganization` → אם `session_replication_role` נדחה (Supabase) → `softAbandonDemoSession`: מוחק `demo_sessions` / `demo_session_actors`, משנה שם ל־`[דמו-נטוש] …`, **לא** מוחק `organizations`. |
| מועד | בכניסה מחדש / החלפת פרופיל (`enter-demo` + `previousSessionId`); וב־nightly דרך אותו `deleteDemoSessionOrganization`. |
| האם החלפת פרופיל מצטברת? | **כן.** כל כשל hard-delete / soft-abandon משאיר ארגון נטוש; סשן חדש נוצר תמיד. |
| האם הניקוי היומי מוחק אותם? | **לא.** `runNightlyReset` בוחר רק ארגונים עם `INNER JOIN demo_sessions`. אחרי soft-abandon אין session → **נעלמים מהתור לתמיד**. גם כשה־nightly קורא delete על סשן פעיל ונופל ל־soft-abandon, הוא עלול לסמן `rows=completed` (`deleted === 1` על session) בזמן שהארגון נשאר. |

קבצים: `delete-session.ts`, `nightly-reset.ts`, `enter-demo.ts`, cron לפי `reset-clock.ts` (פעם ביום).

### פתרון מחייב בגל זה (בטוח ומוגדר)

**שני חלקים — שניהם בתוכנית:**

#### D1 — Hard-delete בלי `session_replication_role`

| | |
|---|---|
| שורש | מחיקת budgets פעילים דורשת replica role שנחסם ב־Prod |
| שינוי | במסלול demo בלבד (`app.demo_provisioner=on` + `demo_kind='session'`): לפני מחיקת org — להעביר budgets לסטטוס ש**מאפשר** מחיקה לפי ה־guards הקיימים (או latch ייעודי demo ל־budget clear), למחוק lines/revisions/budgets, ואז `DELETE organizations` כרגיל. **בלי** `session_replication_role`. Soft-abandon נשאר רק כ־fallback אחרון אם גם זה נכשל, עם לוג. |
| קובץ | `src/modules/demo/application/delete-session.ts` (+ schema/guards רק אם חסר מסלול demo מותר — **מינימום**; עדיפות בלי הרחבת RLS לכלל הארגונים) |
| בדיקה | **C1** |
| תוצאה | ב־PGlite **ובסימולציית** «replication denied»: org נמחק physically; אין `[דמו-נטוש]` חדש בנתיב המאושר |

#### D2 — Sweeper לילית לארגונים נטושים קיימים

| | |
|---|---|
| שורש | Nightly מתעלם מארגונים בלי `demo_sessions` |
| שינוי | ב־`runNightlyReset` (create items): בנוסף לסשנים הפעילים, לצרף ארגונים ש־`demo_kind='session'` ו־(`name LIKE '[דמו-נטוש]%'` **או** אין שורת `demo_sessions`). אותן פאזות rows/storage/auth. Soft-abandon **אינו** נחשב הצלחת `rows` — רק `organizations` שנמחק (`deleted === 1` על org) או קוד חזרה מפורש `removedOrganization=true`. |
| קובץ | `nightly-reset.ts`, התאמה ב־`delete-session.ts` לערך חזרה חד־משמעי |
| בדיקה | **C2, C3** |
| תוצאה | ארגוני נטוש קיימים ב־Prod ייכנסו לתור בלילה **אחרי** פריסת התיקון; אין צורך ב־SQL ידני בגל הביצוע (אלא אם Owner יאשר ניקוי חד־פעמי נפרד) |

#### D3 — כניסה מחדש

| | |
|---|---|
| שינוי | `enter-demo`: אחרי ניסיון cleanup, אם נוצר soft-abandon — לכתוב metric/log מובנה; לא לחסום כניסה (כבר כך). אחרי D1 ה־fallback אמור להיות נדיר. |
| קובץ | `enter-demo.ts` |
| בדיקה | **C4** |

### בדיקות ניקוי C1–C4

| # | בדיקה | תוצאה צפויה |
|---|---|---|
| **C1** | מחיקת סשן כש־`session_replication_role` מדומה כנדחה → org **נמחק** (לא רק נטוש) | 0 שורות org עם אותו id |
| **C2** | Org בשם `[דמו-נטוש]%` + `demo_kind=session` ללא `demo_sessions` נכנס ל־nightly items ונמחק | נעלם אחרי `runNightlyReset` |
| **C3** | Soft-abandon **לא** מסמן הצלחת rows אם org נשאר | status failed או retry; לא «completed» עם org חי |
| **C4** | החלפת פרופיל פעמיים ברצף (PGlite) → לא נשארים ארגוני session ישנים | count session orgs = 1 (הנוכחי) |

**בשלב התוכנית / לפני אישור: אין להריץ מחיקה על Production.**

---

## 4. ממצאים פתוחים — סגירה מפורשת

### 4.1 פרויקטי שירות עם עלויות לא סבירות

| | |
|---|---|
| סיווג | **באג זריעה** (הוכח בטבלת הביקורת: expenses≫CCV על `p-service`) |
| החלטה | **בתוך הגל** — סעיף 1 + **B7**. לא נשאר פתוח. |
| תוצאה | רווחיות שירות סבירה; פעילות חודשית נשמרת |

### 4.2 כרטיסי «שווי 0» בדשבורד

| | |
|---|---|
| מה הוכח | KPIs של חוזה/חיוב על `p-active` **אינם** 0 (engines = fixture; צילום 600k). אין החלפת תוויות חוזה↔חיובים. |
| מה לא חוסם overbill | כרטיס אחר שיכול להציג 0 בצדק (יתרה ששולמה, פרויקט בלי חוזה, מדד שאינו CCV). |
| החלטה סגורה | **בתוך הגל:** בדיקת קבלה **B9** (למטה) — לכל פרויקט בסטטוס active עם חוזה בזריעה, `getProjectFinancials.currentContractValue > 0` ו־rollup תואם. אם כרטיס UI שמסומן כחוזה/שווי פרויקט מציג 0 בניגוד למנוע → תיקון **wiring/seed באותו גל**. אם הכרטיס הוא מדד אחר לגיטימי — לא לשנות UI; רק לוודא שאין תווית מטעה בטקסט קיים. **אין ממצא פתוח אחרי הגל.** |

**B9:** לכל פרופיל, לכל פרויקט active עם `contracts.originalValueNet > 0`: מנוע `currentContractValue > 0`; אם יש כרטיס דשבורד לפרויקט שמציג «שווי/חוזה» — הערך > 0.

---

## 5. סדר ביצוע סופי (גל אחד)

```
1. Pure billing/cost envelope helpers + unit tests (B1 fail-proof)
2. Wire fixture-builder + monthly-activity (preserve months; redistribute/scale)
3. Align p-service contract/costs; budgets/POs
4. delete-session hard-delete without replication role
5. nightly sweeper for [דמו-נטוש] + return-value semantics
6. Acceptance: prove B1/B7/B8 FAIL on old behavior (fixture snapshot or pre-fix branch check), then PASS on new
7. Full A1–A19 + B1–B9 + C1–C4 green
8. Owner-approved: commit → push → one Linux/Docker prebuilt deploy
9. Prod spot-check: ELECTRICAL billed≤CCV; profile switch leaves no new [דמו-נטוש]
```

**אין** פריסות ביניים. **אין** SQL Production בגל אלא אם soft-abandon היסטורי דורש ניקוי חד־פעמי — ואז: הכנת SQL → דוח → עצירה → אישור Owner נפרד. ברירת המחדל: ה־sweeper הלילי אחרי D1/D2 מנקה לבד.

---

## 6. מטריצת ממצאים מאוחדת (שורש → שינוי → קובץ → בדיקה → תוצאה)

| ID | ממצא | שורש | שינוי | קובץ עיקרי | בדיקה | תוצאה צפויה |
|---|---|---|---|---|---|---|
| M1 | Overbill `p-active` ×20 | monthly+legacy ללא תקרה | envelope + פיזור/צמצום סכומים | `monthly-activity.ts`, `fixture-builder.ts` | B1,B4,B8 | billed≤CCV |
| M2 | Overbill `p-service` ×20 | legacy > חוזה שירות | יישור חוזה/חשבונות | `fixture-builder.ts` | B1 | billed≤CCV |
| M3 | עלויות שירות לא סבירות | cost לא תחת CCV | costCap 0.85×CCV + העברה/scale | `monthly-activity.ts` | B7 | Actual≤CCV |
| M4 | תקציב/PO מנותקים | קבועים מול CCV בלבד | יישור יחסי | `fixture-builder.ts` | B6 | תקציב∈[0.85,1.10]×CCV |
| M5 | AR/גבייה | תקין יחסית; לעדכן אחרי M1 | שמירת יחס + קישור billingKey | `monthly-activity.ts` | B2,B3 | AR מתיישב |
| M6 | CO=0 / פיתוי להסתיר | — | **אין CO פיקטיביים** | — | B5 | לא מסתירים overbill |
| M7 | A1–A19 עלולים להישבר | צמצום חודשים | אסור; רק scale/פיזור | אותם קבצי זריעה | A1–A19 | נשארים ירוקים |
| M8 | כרטיסי שווי 0 | לא מאומת כבאג CCV; אולי מדד אחר | B9 + תיקון אם מנוע>0 ומסך חוזה=0 | seed / dashboard wiring רק אם נדרש | B9 | אין שווי־חוזה שקרי 0 |
| M9 | `[דמו-נטוש]` נצברים | soft-abandon + nightly מדלג | D1 hard-delete + D2 sweeper | `delete-session.ts`, `nightly-reset.ts` | C1–C4 | אין הצטברות; נטושים נמחים |
| M10 | מסך «משקר» | הוכח שלא | אין שינוי מנוע/UI כספי | — | engines probe | ללא שינוי |

---

## 7. Exit criteria (Definition of Done)

1. B1–B9 + C1–C4 ירוקים על כל 20 הפרופילים (PGlite/integration).
2. A1–A19 ירוקים ללא החלשה.
3. ELECTRICAL `p-active`: חוזה 600k, billedNet ≤ 600k, AR = billed−collected.
4. אף פרופיל עם overbill או עלות שירות > CCV.
5. החלפת פרופיל ×2 לא משאירה org session ישן; `[דמו-נטוש]` נכנס ל־sweeper ונמחק במסלול החדש.
6. פריסת Production אחת; אימות ידני Owner על 3–5 עסקים.

---

## 8. מה לא בתוכנית (מכוון)

- שינוי נוסחאות רווח/CCV במנועי Production לעסקים אמיתיים.
- שינוי הרשאות או three-surface מעבר לנתוני הדמו הקיימים.
- ניקוי SQL ידני ב־Prod לפני שיש אישור נפרד (ה־sweeper הוא ברירת המחדל אחרי הפריסה).
