# EXLFY — סגירת תיקון עקביות עסקית לדמו (2026-11-18)

**סטטוס:** מימוש מקומי הושלם · קומיט מוכן · **אין** Push / Deploy / SQL כותב על Production  
**תוכנית:** `.cursor/plans/demo_business_consistency_fix.plan.md`  
**הוכחת מספרים:** `docs/audits/local-tool-artifacts/demo-consistency-proof-after-fix-2026-11-18.json`

---

## תקציר

כל M1–M10 בוצעו בגל אחד. אחרי התיקון: **0** פרויקטים עם overbill מתוך 120 חוזים × 20 פרופילים.  
ELECTRICAL `p-active`: CCV **600,000** · billed **600,000** · overbill **0** (לעומת 1,535,625 לפני).

מנגנון ניקוי דמו (D1/D2) מיושם עם זיהוי חד־משמעי (`demo_kind=session` + `demo_abandoned_at` / `demo_sessions`) — **לא** לפי שם.  
Sweeper לילית ל־`[דמו-נטוש]` **כבוי כברירת מחדל** (`includeAbandonedSessionOrgs: false`) עד אישור Owner נפרד.

מיגרציה `0215_demo_session_cleanup.sql` — **הוכנה בלבד**, לא הורצה על Production.

---

## תוצאות בדיקות (מקומי)

| חבילה | תוצאה |
|---|---|
| A1–A15 (`demo-ledger-acceptance`) | **21/21 עבר** |
| A17–A19 (`demo-surfaces-acceptance`) | **1/1 עבר** |
| rich-seed ×20 | **21/21 עבר** |
| B1–B9 ×20 (`demo-business-consistency-acceptance`) | **20/20 עבר** |
| C1–C4 + extras (`demo-abandoned-cleanup-acceptance`) | **6/6 עבר** |
| unit billing-envelope + fixture-richness + demo-rules | **34/34 עבר** |

---

## שינויים עיקריים

### כסף / זריעה
- `src/modules/demo/fixtures/billing-envelope.ts` — תקרת חוזה לחיובים + סקייל עלויות שירות במקום
- `fixture-builder.ts` — חוזה שירות 30k (pre-scale); envelope על billing/payments; scale עלויות `p-service` (הוצאות+AP+שעות) ≤ 0.85×CCV **בלי** העברת הוצאות לפרויקט אחר

### ניקוי דמו
- `delete-session.ts` — D1: מחיקת budgets תחת `app.demo_provisioner` בלי `session_replication_role`; ערך חזרה `{ removedOrganization, softAbandoned }`
- `nightly-reset.ts` — D2: sweeper אופציונלי עם `includeAbandonedSessionOrgs` (default false)
- `domain/session-cleanup.ts` — כללי זהות
- `drizzle/migrations/0215_demo_session_cleanup.sql` + `demo_abandoned_at` ב־schema

### בדיקות
- B1–B9, C1–C4, unit envelope

---

## הוכחת עקביות (fixture, עוגן 2026-11-17)

| מדד | ערך |
|---|---:|
| פרופילים | 20 |
| פרויקטים עם חוזה | 120 |
| overbill (>₪1) | **0** |
| ELECTRICAL p-active billed/CCV | 600000 / 600000 |

---

## הגנות לפני הפעלת Sweeper ב־Production (ממתין לאישור)

1. זהות: `demo_kind='session'` **ו־** `demo_abandoned_at IS NOT NULL` **ו־** אין `demo_sessions`.
2. לא מוחק org אמיתי / template / סשן פעיל.
3. Cron הקיים **לא** מעביר `includeAbandonedSessionOrgs: true`.
4. מיגרציה 0215 חייבת להיות מיושמת ב־Prod **באישור SQL נפרד** לפני ש־D1 עובד שם במלואו (בינתיים soft-abandon נשאר fallback).

**מומלץ בפריסה הבאה:** (א) commit+push+deploy הקוד; (ב) אישור SQL ל־0215; (ג) אישור נפרד להפעלת sweeper / ספירת נטושים צפויה.

---

## לא בוצע (כמבוקש)

- Push  
- Deploy  
- SQL כותב על Production  
- הפעלת sweeper על ארגונים קיימים ב־Prod  
