# ProjectFlow — Marketing Claims Safety Matrix

**Purpose:** Prevent overselling. Every public claim must match `docs/implementation/CURRENT-SITE-MAP.md` (authoritative for what exists TODAY).  
**Updated:** 2026-08-09  
**Status meanings:** COMPLETE · PARTIAL · FOUNDATION ONLY · INTERNAL/HIDDEN

---

## How to use

| Column | Meaning |
|--------|---------|
| **Capability** | What sales/marketing might want to talk about |
| **Current status** | From site map / product truth |
| **Safe marketing wording** | Allowed Hebrew/English framing |
| **Do NOT say yet** | Claims that overstate readiness |

If unsure — soften, or omit from hero/primary story.

---

## Core product story (primary)

| Capability | Current status | Safe marketing wording | Do NOT say yet |
|------------|----------------|------------------------|----------------|
| Project management | COMPLETE | ניהול פרויקטים במקום אחד; יצירה מהירה; סביבת פרויקט | «מערכת ניהול פרויקטים מלאה בסגנון MS Project / Primavera» |
| Project financials view | COMPLETE | תצוגת כסף של הפרויקט: בפועל / התחייבות / תחזית / מסחרי | «הכרה ברווח חשבונאית / Revenue Recognition אוטומטי» |
| Clients | COMPLETE | מדריך לקוחות ופרופיל לקוח | — |
| Expenses / costs | COMPLETE | רישום הוצאות מהיר; עלויות פרויקט והוצאות עסק | «הנהלת חשבונות מלאה / דוחות לרשויות» |
| Vendors | COMPLETE | מדריך ספקים אופציונלי; אפשר הוצאה בלי כרטיס ספק | «חובה לנהל ספקים כדי להתחיל» |
| Workforce / time | COMPLETE | עובדים, תעריפי עלות, דיווחי שעות לפרויקט | «שכר / תלושי שכר / נוכחות חוקית מלאה» |
| Changes (CR → approve) | COMPLETE | תוספות והפחתות; ממתין בנפרד עד אישור; חוזה נוכחי = מקורי + מאושרים | «שינויים מסונכרנים אוטומטית לחוזה הלקוח החיצוני» |
| Billing & payments (AR) | COMPLETE | חיובים, תשלומים, מעקב פתוח; חיוב ≠ תשלום | «מערכת חשבוניות מס סטטוטורית / דיווח לרשויות» |
| Reports / profitability | COMPLETE | דוחות בסיס מטבע; מע״מ אינו רווח; ייצוא CSV | «BI מתקדם / תחזיות AI / דשבורד אנליטי מלא» |
| Documents attach | COMPLETE | צירוף קבצים ותמונות לרשומות; צילום כקובץ מצורף | «סריקה אוטומטית של כל מסמך לכל השדות» |
| Dashboard | COMPLETE | לוח בקרה עסקי עם סיכומים וקישורים לעבודה | «תחזית תזרים מלאה אוטומטית לכל העסק» |
| Progressive modules | COMPLETE (features toggles) | מתחילים פשוט; מדליקים מודולים לפי הצורך | «חובה בהגדרה מלאה לפני שימוש» |

---

## Advanced modules (secondary story — usable today when enabled)

| Capability | Current status | Safe marketing wording | Do NOT say yet |
|------------|----------------|------------------------|----------------|
| CRM / sales pipeline | COMPLETE | צינור מכירות: מתעניינים, לידים, הזדמנויות; המרה לפרויקט | «CRM ארגוני מלא / אוטומציות שיווק / אימייל מרקטינג» |
| Procurement (POs) | COMPLETE | הזמנות רכש כהתחייבות עלות (לא הוצאה) | «רכש ארגוני עם אישורים מרובי שלבים לכל סוג עסק אוטומטית» |
| RFQs | COMPLETE | בקשות הצעת מחיר והשוואת הצעות לפני הזמנה | — (OK if framed as RFQ → PO) |
| AP (vendor bills) | COMPLETE | חשבונות ספקים והתאמה להזמנה/הוצאה קיימת | «AP שממציא הוצאות אוטומטית» / «תשלום לספקים מתוך המערכת» |
| Materials catalog | COMPLETE | קטלוג חומרים ומחירי ספקים | «מלאי חשבונאי / GL / עלות מלאי אוטומטית» |
| Inventory quantities | COMPLETE | מעקב כמויות במלאי (לא הנה״ח מלאי) | «מערכת WMS / סריקות ברקוד / ניהול מחסן מלא» |
| Field ops (logs / punch / inspections) | COMPLETE | יומני עבודה, פאנץ׳, בדיקות + מסמכים | «אפליקציית שטח ייעודית נפרדת / GPS חובה / נוכחות ביומטרית» |
| Assets / fleet / maintenance | COMPLETE | ציוד, רכבים, לוח תחזוקה | «ניהול צי מלא עם טלמטיקה / עלות תחזוקה = הוצאה אוטומטית» |
| Compliance / insurance | COMPLETE | פוליסות, רישיונות, הסמכות ותאריכי פקיעה | «ציות רגולטורי אוטומטי / דיווח לרשויות» |
| Templates | COMPLETE | תבניות מבנה לפרויקט | — |
| Custom fields | COMPLETE | שדות מותאמים בניהול | — |
| Import CSV/Excel | COMPLETE | ייבוא לקוחות/ספקים/עובדים/פרויקטים עם מיפוי ותצוגה מקדימה | «ייבוא מכל מערכת ERP בלחיצה» |
| Activity / audit log | COMPLETE | יומן פעילות לשינויים רגישים + ייצוא | — |
| Roles & permissions | COMPLETE | אנשים, תפקידים והרשאות; הפרדת נראות רווח | «SSO ארגוני / SCIM / ספריות משתמשים חיצוניות» (unless later proven) |
| Tax settings | COMPLETE | הגדרות מס ארגוניות | «מחשבון מע״מ סטטוטורי מלא / דיווח לרשויות» |

---

## Caution / partial / foundation (high risk of oversell)

| Capability | Current status | Safe marketing wording | Do NOT say yet |
|------------|----------------|------------------------|----------------|
| **OCR / receipt auto-read** | FOUNDATION ONLY (`StubOcrProvider`; no live extraction) | אפשר לצלם ולצרף קבלה/חשבונית כמסמך; יש מסך בדיקת חילוץ בתשתית | «מצלמים כל חשבונית ו־ProjectFlow קוראת אותה אוטומטית» · «OCR חי / חילוץ שדות אוטומטי» · «הוצאה נוצרת לבד מהתמונה» |
| **Customer portal (public)** | FOUNDATION ONLY (internal preview/grants; public login deferred) | תשתית פנימית לתצוגות בטוחות ללקוח (לא מוצר פורטל ציבורי) | «פורטל לקוחות חי» · «הלקוח מתחבר ורואה את הפרויקט» · «שיתוף לקוח אונליין» |
| **Vendor portal (public)** | FOUNDATION ONLY | תשתית פנימית לתצוגות/מועמדים לספק | «פורטל ספקים ציבורי» · «ספקים מגישים הצעות במערכת מבחוץ» |
| **API / Webhooks** | FOUNDATION ONLY | תשתית מפתחות API ו־webhooks (לא פלטפורמת אינטגרציות בשלה) | «אינטגרציות רחבות» · «מתחברים לכל מערכת» · «פלטפורמת API מוכנה לייצור» |
| **Scheduling / Gantt** | PARTIAL (light dates/milestones in project; not standalone Gantt) | תאריכי פרויקט, שלבים ואבני דרך; תזמון קל | «Gantt מלא» · «נתיב קריטי» · «תזמון משאבים / resource leveling» · «לוח זמנים מקצועי מלא» |
| **PWA install** | COMPLETE (install UX) | אפשר להתקין כאפליקציה מהדפדפן (מסך בית / אייקון) — לא מחנות האפליקציות | «אפליקציית iOS/Android מחנות» · «אפליקציה נייטיב» |
| **Offline** | PARTIAL (drafts + SW shell; not offline-first) | טיוטות מקומיות להמתנה לסנכרון; עבודה לא מקוונת חלקית | «עובדים מלא בלי אינטרנט» · «מוצר offline-first» · «סנכרון שטח מלא תמיד» |
| **Photograph receipt (UI path)** | UI COMPLETE → extract FOUNDATION | קישור «צילום קבלה» קיים; החילוץ החי אינו פעיל | לערבב בין «צילום מצורף לרשומה» לבין «OCR אוטומטי» |
| Document Take photo (attachment) | COMPLETE | צילום/העלאה כמסמך מצורף לרשומה | «התמונה נסרקת אוטומטית לשדות» |

---

## Positioning claims (always true — use freely)

| Claim | Safe? | Notes |
|-------|-------|-------|
| לא תוכנת הנהלת חשבונות | Yes | Core principle |
| חיוב ≠ תשלום | Yes | Financial model |
| התחייבות (Committed) ≠ הוצאה (Actual) | Yes | POs = committed |
| מע״מ אינו רווח | Yes | Reports rule |
| חוזה נוכחי = מקורי + שינויים מאושרים | Yes | Pending stays separate |
| אפשר להתחיל פשוט ולהעמיק | Yes | Progressive complexity |
| לא מיועד רק לקבלן ראשי | Yes | Broad built-environment |
| ישראל־ראשון / עברית | Yes | First market |

---

## Hero / ads checklist (before publish)

1. Does the claim appear as **COMPLETE** (or clearly framed PARTIAL) in the site map?  
2. If FOUNDATION ONLY — is it omitted from hero and primary bullets?  
3. Are Billing / Payment / Committed / Expense / VAT separated correctly?  
4. Is OCR / public portal / full Gantt / native store app / broad API **absent** from headlines?  
5. Is PWA described as installable web app, not App Store product?  
6. Is “accounting replacement” avoided?

---

## Quick “red flag” phrases (Hebrew)

Do not use until status upgrades:

- «קורא חשבוניות אוטומטית»
- «פורטל לקוחות / ספקים»
- «Gantt / נתיב קריטי»
- «אפליקציה בחנויות»
- «עבודה מלאה בלי רשת»
- «מחליף את הרו״ח / הנהלת חשבונות»
- «אינטגרציות לכל המערכות»
- «בינה מלאכותית שמנהלת את הפרויקט»
