# EXLFY — השלמת תיקון נתוני הדמו (שווי חוזי / רווחיות)

**תאריך:** 2026-11-17  
**מצב:** תיקון מקומי הושלם — קומיט מוכן. **לא** בוצעו SQL על Production, Push או Deploy.

---

## 1. תיקונים שבוצעו (דמו בלבד)

| אזור | שינוי |
|---|---|
| שורש באג השווי־אפס | לכל חוזה בדמו נוצר `contract_value_events` עם `kind=original`, סכום נטו, תאריך אפקטיבי וסיבה זהים לנתיב `contract-amount.ts` |
| חוזים | 5 חוזים לפרופיל (כולל `p-hold`); שדות entered/tax/gross + `isPrimary` |
| תמחור עבודות | `pricingMode: fixed` ל־job/work_order |
| משימות | `ownerEmployeeId` לכל משימה |
| שיבוצים | כולל `e4`; `startDate` דינמי |
| רכש | 2 הזמנות `issued` + `committed_costs` פתוחים |
| קבלני משנה | הסכם + אירוע ערך `original` בפרופילים רלוונטיים |
| תקציבים | תקציב פעיל + שורת total לכל חוזה פעיל |
| BOQ | זריעה לפי `projectKey` (לא רק `p-active`) |
| מסמכים | `status: available` |
| מחיקת סשן | ניקוי תקציבים לפני CASCADE (demo-only, `session_replication_role`) |
| בדיקות | מנוע CCV/רווח לכל 20; rich-seed דורש CCV>0; fixture-richness מעודכן |

**לא שונו:** מנועי כספים, מיגרציות, קבצי כתב כמויות, SQL Production.

---

## 2–3. טבלת 20 הפרופילים (מנועי מסך — PGlite זהה לנתיב UI)

מקור: `tests/integration/demo/contract-value-engines-all-profiles.test.ts` (21/21 עברו).

| פרופיל | חוזים | events original | CCV>0 בשורות פעילות | שווי לוח בקרה | עלות | רווח חוזי עסקי | הפסד מלאכותי |
|---|---:|---:|---:|---:|---:|---:|---:|
| GENERAL_CONTRACTOR | 5 | 5 | 3 | 1,310,725 | 353,008 | 957,717 | 0 |
| ELECTRICAL | 5 | 5 | 3 | 885,625 | 241,526 | 644,100 | 0 |
| PLUMBING | 5 | 5 | 3 | 743,925 | 203,752 | 540,173 | 0 |
| HVAC | 5 | 5 | 3 | 814,775 | 223,063 | 591,712 | 0 |
| RENOVATION | 5 | 5 | 3 | 673,075 | 185,106 | 487,969 | 0 |
| SMALL_WORKS | 5 | 5 | 3 | 297,570 | 86,220 | 211,350 | 0 |
| FIELD_SERVICE | 5 | 5 | 3 | 410,930 | 116,663 | 294,267 | 0 |
| MAINTENANCE | 5 | 5 | 3 | 510,120 | 142,798 | 367,323 | 0 |
| FACILITY_MANAGEMENT | 5 | 5 | 3 | 956,475 | 260,516 | 695,960 | 0 |
| LANDSCAPING | 5 | 5 | 3 | 481,780 | 135,205 | 346,575 | 0 |
| CLEANING | 5 | 5 | 3 | 340,080 | 97,130 | 242,950 | 0 |
| INSTALLATION | 5 | 5 | 3 | 623,480 | 172,669 | 450,811 | 0 |
| ARCHITECT | 5 | 5 | 3 | 552,630 | 156,368 | 396,263 | 0 |
| DESIGNER | 5 | 5 | 3 | 439,270 | 125,508 | 313,763 | 0 |
| ENGINEERING_CONSULTANT | 5 | 5 | 3 | 651,820 | 182,948 | 468,873 | 0 |
| SAFETY_INSPECTION_CONSULTANT | 5 | 5 | 3 | 389,675 | 112,782 | 276,893 | 0 |
| SUBCONTRACTOR | 5 | 5 | 3 | 743,925 | 203,445 | 540,481 | 0 |
| PROJECT_MANAGEMENT | 5 | 5 | 3 | 580,970 | 163,035 | 417,935 | 0 |
| REAL_ESTATE_DEVELOPMENT | 5 | 5 | 3 | 1,523,275 | 410,138 | 1,113,137 | 0 |
| MIXED_PROJECT_SERVICE | 5 | 5 | 3 | 708,500 | 194,510 | 513,990 | 0 |

**הוכחת אפסים:** לפני — `value_events=0` → CCV=0 → רווח=−עלות. אחרי — 5/5 events, 3/3 שורות פעילות עם CCV>0, `rowsWithArtificialLoss=0` בכל הפרופילים.

---

## 4–5. עובדים / ספקים / משימות / גבייה

| תחום | מצב אחרי תיקון |
|---|---|
| עובדים + תעריפים + נוכחות + שעות מאושרות | תקין (18 שעות, 48 ימי נוכחות) |
| שיבוצים | ≥9 כולל e4 |
| משימות עם אחראי | 22/22 |
| ספקים + AP מוכר + תשלומים | 6 open / ≥2 payments |
| הזמנות רכש + התחייבויות פתוחות | 2 issued + 2 committed open |
| הסכמי קבלן משנה | לפי פרופיל (0–1) עם value event |
| גבייה / חיובים | נשארים חיוביים; אינם מחליפים CCV |
| מחיקת סשן | נבדקה בכל 20 — ללא שאריות org |

---

## 6. בדיקת דפדפן

- **מנועי מסך** (`getHomeDashboard`, `getOrganizationProjectRollup`, `getBusinessProfitability`) רצו לכל 20 הפרופילים — אלה אותם מנועים שה־UI קורא.
- **דפדפן חי מקומי:** `DEMO_ENTRY_ENABLED` לא מוגדר ב־`.env.local` — כניסת דמו מקומית לא הופעלה בסשן זה.
- **Production חי:** עדיין על הזריעה הישנה עד Push/Deploy מאושרים (לא בוצעו כאן בכוונה).

---

## 7. בדיקות מקומיות

| בדיקה | תוצאה |
|---|---|
| `contract-value-engines-all-profiles` | 21/21 PASS |
| `rich-seed-all-profiles` | 21/21 PASS |
| `seed-and-reset` | 2/2 PASS |
| `fixture-richness` | 22/22 PASS |
| `tsc --noEmit -p .` | PASS |
| eslint על קבצי הדמו | PASS (0 errors) |
| בנייה לינוקס/פריסה | לא הורצה (אין אישור Deploy; Windows אינו נתיב הפריסה) |

---

## 8. Git

- עבודה רק על קבצי דמו/בדיקות/דוח — **לא** נגעו בכתב כמויות / `0213` / מיגרציות.
- קומיט דמו בלבד מוכן (ראה הודעת הקומיט).
- עבודת takeoff מקבילה נשארה dirty בעץ ולא נכללה.

---

## 9–10. אישורים

1. **כתב כמויות לא נפגע** — לא נערכו קבצי electrical-takeoff / migrations BOQ.  
2. **לא בוצעו** SQL על Production, Push או Deploy.
