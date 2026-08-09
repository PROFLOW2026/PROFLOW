# 52 — V1 Project Wireframes

**Status:** Structure wireframes  
**Phase:** Planning only

---

## 1. Project list — desktop

Default columns (keep lean):

```text
┌ פרויקטים                        [חיפוש] [סטטוס▾] [+ פרויקט] ┐
│                                                                  │
│ שם פרויקט     לקוח      סטטוס    שווי חוזה    עלות     יתרה*   │
│ ───────────  ────────  ───────  ─────────  ───────  ───────   │
│ בית כהן       כהן       פעיל     ₪500,000    ₪310k   ₪50k     │
│ ייעוץ X       —         טיוטה    —           ₪12k    —        │
└──────────────────────────────────────────────────────────────────┘
```

\* Outstanding column only emphasized if billing used.  
Profit estimate: optional secondary column or hover/detail — **not** required in default simple list.  
Status = text + icon.

### Mobile

Cards: name, status, contract, cost; tap → workspace.

---

## 2. New Project

```text
┌─────────── פרויקט חדש ───────────┐
│                                    │
│ שם הפרויקט *                       │
│ [____________________________]     │
│                                    │
│ לקוח (אופציונלי)                   │
│ [ ללא / שם פשוט / בחירת לקוח ]   │
│                                    │
│ שווי חוזה מקורי (אופציונלי)        │
│ [____________]  [מטבע ברירת מחדל] │
│                                    │
│ תחום / סוג (אופציונלי)             │
│ [____________]                     │
│                                    │
│ מיקום (אופציונלי)                  │
│ [____________]                     │
│                                    │
│ › הוסף פרטים נוספים                │
│                                    │
│              [ צור פרויקט ]        │
└────────────────────────────────────┘
```

**Hidden:** WorkPackage, Phase, team, tax override, billing config.  
System creates General תחום עבודה internally.

### Add more details (disclosure)

Sections: Client enrich · Commercial · Work axes · Location · Dates · Structure (multi תחומי עבודה) · Team (if workforce).

---

## 3. Project workspace — desktop header

**Avoid duplicating every Overview card in the header.**

Header = identity + 3–4 primary numbers + tab strip.

```text
┌────────────────────────────────────────────────────────────────┐
│ בית כהן                              [פעיל ▾]  [⋯]            │
│ לקוח: כהן · מיקום: …                                          │
│                                                                │
│ שווי חוזה נוכחי   עלות בפועל   רווח משוער                     │
│ ₪504,000          ₪310,000     ₪…  [מה כלול›]                 │
│                                                                │
│ שינויים ממתינים: ₪18k     חיוב | שולם | יתרה  (if billing)   │
├────────────────────────────────────────────────────────────────┤
│ סקירה | כספים | הוצאות | שינויים ותוספות | [חיובים] | …     │
└────────────────────────────────────────────────────────────────┘
```

Tabs adaptive: חיובים / תחומי עבודה / עובדים ושעות appear when used; מסמכים / פרטים always available.

---

## 4. Overview tab

Priority sections (not all if empty):

```text
סיכום חוזה
  מקורי · מאושרים · נוכחי · ממתינים

תמונת מצב כספית
  עלות בפועל · עלות סופית משוערת (אם קיים) · רווח משוער
  [ מה כלול בחישוב ]

חיובים וגבייה (אם בשימוש)
  חיובים · שולם · יתרה לתשלום

דורש תשומת לב
  שינויים ממתינים · שינויים מאושרים שטרם חויבו · הוצאות אחרונות

פעולות מהירות
  [+ הוצאה] [+ שינוי] [+ חיוב*]
```

---

## 5. Financials tab

```text
חוזה
  Original
  + Approved additions
  − Approved reductions
  = Current contract
  Pending changes

עלויות   (שורות רלוונטיות בלבד)
  Direct
  Shared
  Overhead allocated
  Generic labor
  Employee labor

תחזית
  Actual cost to date
  Estimated final cost
  Estimated profit
  [ מה כלול בחישוב ]
```

---

## 6. Work / תחומי עבודה

Hidden until split.

```text
פרויקט פשוט → אין מסך ניהול תחומים

[ פצל לתחומי עבודה / דיסציפלינות ]

לאחר פיצול:
┌ תחום          עלות     שינויים    … ┐
│ כללי (מקודם)  …                    │
│ חשמל          …                    │
│ אינסטלציה     …                    │
└ + תחום עבודה                        ┘
```

History stays on General until reassigned.

---

## 7. Responsive

| Desktop | Tablet | Mobile |
|---------|--------|--------|
| Header metrics row | Wrap metrics | Stack metrics; chips for tabs |
| Tables in Expenses/Changes | Same / horizontal scroll | Cards |
| Multi-WP table | Cards | Cards |

Mobile project: see `55`.

---

## Related

`45`, `49`, `53`, `55`
