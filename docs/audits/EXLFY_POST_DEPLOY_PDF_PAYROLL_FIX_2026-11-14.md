# EXLFY — תיקון PDF + שכר מוחמד (אחרי פריסה) · 2026-11-14

**Scope:** שתי תקלות בלבד · אין כתיבת נתוני שכר ב־Production · אין auto-paid

---

## 1. PDF מאחסון ענן (BUG-003)

**שורש:** ב־Android Chrome, `setPointerCapture` + `pointermove` על גלילה מעל canvas PDF לא מספק הזזה אמינה באצבע אחת. זום (pinch) כבר עבד דרך TouchEvents.

**תיקון:**
- `pdf-js-viewer.tsx` — הזזה באצבע אחת דרך `TouchEvent` (touchmove לא־פסיבי + `preventDefault`); עכבר נשאר ב־pointer capture.
- `public/sw.js` + `sw-policy` — מעבר ל־`projectflow-shell-v9` כדי ש־PWA מותקן יתקין worker חדש (SW לא שומר PDF/API; רק shell).

**בדיקות:** `tests/ui/pdf-js-viewer-mobile-toolbar.test.tsx` — 3/3 PASS (כולל TouchEvent pan).

**הערה:** השינוי מקומי עד commit/push/deploy מאושר. אחרי פריסה: רענון קשיח / סגירת הטאב ב־Android אם SW ישן עדיין פעיל.

---

## 2. שכר מוחמד נציר · אוקטובר 2026 (קריאה בלבד + UI)

ראיות Production: `docs/audits/evidence/exlfy-full-regression-2026-11/bug-payroll-mohamed-oct/FINDINGS.md`

| שאלה | תשובה |
|------|--------|
| האם תיקון עלות מעסיק נשמר? | חלקית → הוחזר. שורת 8205 **superseded**; applied פעיל = **8250 estimated** («Return to estimate»). |
| האם expected עודכן? | נשאר **8250**; אין תשלום שסונכרן ל־8205. |
| האם נרשם תשלום בפועל? | **לא** (`paid_at` null). |
| האם ההתראה נכונה? | **כן** — unpaid + due 2026-11-10 → overdue ב־2026-11-14. |
| האם UI מפריד תיקון עלות מאישור ששולם? | חוזק בקוד — ראו למטה. |

**תיקוני קוד (ללא כתיבה ל־Prod):**
- סנכרון `expected_amount` אחרי תיקון עלות מעסיק (לתיקונים עתידיים).
- תג סטטוס בפאנל נגזר ממועד תשלום (לא מ־`upcoming` מיושן ב־DB) → יוצג **באיחור**.
- העתקים שמסבירים: תיקון עלות ≠ אשר ששולם; אין סימון שולם אוטומטי.
- הסתרת «עדכן סכום ששולם» בחודש שלא שולם.

**בדיקות:** `unpaid-payroll-alert-status.test.ts` 5/5 · `web-manifest.test.ts` 2/2.

**פעולות Owner ב־Prod (ידני):** אם 8205 הוא האמת — להזין שוב תיקון עלות (אחרי deploy הסנכרון יעדכן expected). לסימון שולם — רק «אשר ששולם».

---

## סטטוס שחרור

קוד מוכן מקומית. **לא בוצעו** commit / push / deploy / SQL שכר בסיבוב זה.
