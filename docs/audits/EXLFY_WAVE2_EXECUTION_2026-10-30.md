# EXLFY — גל 2: דוח ביצוע (הרחבת אחידות)

**תאריך:** 2026-10-30  
**סטטוס:** הושלם בקוד — לא נדחף ל-Production

## תשתית נוספת

| רכיב | תפקיד |
|------|--------|
| `MainAppOrgListFilterPanel` | טפסי GET + `OwnerListFilterBar` (סגור כברירת מחדל, chips, submit) |
| `OwnerListFilterBar` | `applyButtonType=submit`, `clearHref`, `collapseDesktop` |

## מסכים שעודכנו

| מודול | שינוי | סמנטיקה עסקית |
|-------|--------|----------------|
| **AP** | `ApBillsListFilters` — תאריך חשבון + תקופת תשלום KPI, סגור; כרטיס מובייל צפוף (kit) | `fromDate`/`toDate` מסננים רשימה; `paymentFrom`/`To` — KPI בלבד (ללא שינוי) |
| **Billing** | `BillingHubPeriodFilters` במקום `<details>` פתוח | הנפקה מסננת רשימה; תאריך תשלום — גבייה/טבלת תשלומים (ללא שינוי) |
| **הצעות** | חיפוש `q` + סטטוס; repository `ILIKE` | — |
| **הזמנות רכש** | חיפוש + סטטוס; סינון ב-repository | — |
| **קבלני משנה** | סינון קומפקטי ב-panel סגור | פרמטרי URL ללא שינוי |
| **לקוחות / פרויקטים / עובדים** | ללא diff — כבר על `MainAppListSearchToolbar` / חיפוש קיים | — |

## לא בוצע (מכוון)

- **ספקים → kit** (גל 2 Owner: אחרי יציבות פיילוט)
- **גל 3** — Dialog families
- **BH-01/BH-02** — שיוך/חלוקה

## בדיקות

- `vitest`: presets תאריך + expense-list-query (ירושה מגל 1)

## המלצת smoke

- `/procurement/ap`, `/billing`, `/quotes`, `/procurement`, `/subcontracts` — מובייל, פתיחת סינון, chips, ניקוי
- וידוא KPI «שולם בתקופה» / «נגבה בתקופה» עם טווח תשלום בלבד
