# EXLFY — גל 1: דוח ביצוע (פיילוט הוצאות)

**תאריך:** 2026-10-30  
**סטטוס:** הושלם בקוד — **לא** נדחף ל-Production (לפי הנחיית Owner)

## מה שונה

| נושא | קבצים / רכיבים |
|------|----------------|
| קיצורי תאריך | `date-range-selector.tsx` — ברירת מחדל `thisWeek \| thisMonth \| thisYear`; `LEGACY_DATE_RANGE_PRESETS` + prop `presets` |
| סינון משותף | `main-app-standard-list-filters.tsx`, `owner-list-filter-bar.tsx` (`collapseDesktop`) |
| כרטיס צפוף | `main-app-compact-list-card.tsx`, `main-app-list.css` |
| פיילוט הוצאות | `expenses-org-list-view.tsx`, `expenses-org-list-page.tsx` |
| חיפוש `q` | `expense-list-query.ts`, `expenses.repository.ts`, `schemas.ts` |
| FAB הוצאה | `quick-create-actions.ts` → `/expenses/new` |
| i18n | `expenses.json` (he/en/ar/ru) — חיפוש, כותרת סינון, chips |

## מה נבדק (מקומי)

- `tests/unit/patterns/date-range-selector-presets.test.ts`
- `tests/unit/expenses/expense-list-query.test.ts` (+ `q`)
- `tests/unit/shell/quick-create-actions.test.ts` (+ href הוצאה)

## מה נותר (גל 2+)

- AP, Billing, לקוחות, פרויקטים, עובדים, הצעות, PO, קבלני משנה — על אותה תשתית
- מיגרציית ספקים ל-kit (אחרי יציבות הפיילוט)
- גל 3: משפחות Dialog/Sheet; BH-01/BH-02 (שיוך/חלוקה) — **לא** נגע
- Runtime smoke מובייל / RTL על `/expenses` — מומלץ לפני הרחבה

## פיילוט — מצב

- רשימת הוצאות (Owner + Employee mirror) משתמשת ב-chrome החדש; `dateBasis` expense|payment ללא שינוי סמנטי
- מסננים מתקדמים **סגורים** כברירת מחדל; חיפוש + אינדיקציית סינון פעיל
- שינוי presets חל על **כל** צרכני `DateRangeSelector` — לוודא AP/Billing/דוחות בהתאמה בעיניים בגל 2
