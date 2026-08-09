# 51 — V1 Home Dashboard Wireframe

**Status:** Structure wireframe  
**Hebrew label:** לוח בקרה  
**Phase:** Planning only

---

## A. Brand-new organization

No KPI zeros.

```text
┌─────────────────────────────────────────────┐
│ לוח בקרה                                    │
│                                             │
│  ברוכים הבאים ל-ProjectFlow                 │
│  התחילו בפרויקט הראשון — בלי להגדיר הכול. │
│                                             │
│  ┌──────────────────────┐                   │
│  │  צור פרויקט ראשון    │  ← primary        │
│  └──────────────────────┘                   │
│                                             │
│  ┌──────────────────────┐                   │
│  │  הוסף הוצאה          │  ← secondary      │
│  └──────────────────────┘                   │
│                                             │
│  קישור: הגדרת אפשרויות נוספות → הגדרות     │
└─────────────────────────────────────────────┘
```

---

## B. Simple active organization

```text
┌─────────────────────────────────────────────────────────────┐
│ לוח בקרה                              [+ חדש ▾]            │
├─────────────────────────────────────────────────────────────┤
│ תמונת מצב עסקית                                             │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐ │
│ │ פרויקטים   │ │ שווי חוזה  │ │ עלות בפועל │ │ רווח משוער │ │
│ │ פעילים     │ │ נוכחי      │ │            │ │ [מה כלול›] │ │
│ └────────────┘ └────────────┘ └────────────┘ └────────────┘ │
│                                                             │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐ ← if billing │
│ │ חיובים     │ │ שולם       │ │ יתרה לתשלום│              │
│ └────────────┘ └────────────┘ └────────────┘              │
│                                                             │
│ פרויקטים שדורשים תשומת לב                                   │
│  • שינויים ממתינים / יתרה / חוסר פעילות                     │
│                                                             │
│ פרויקטים אחרונים              פעילות אחרונה                 │
│  [card] [card]                 [הוצאה/שינוי…]               │
└─────────────────────────────────────────────────────────────┘
```

Rules:

- Omit labor/workforce cards if unused
- Omit billing row if never used
- Profit always offers מה כלול בחישוב

---

## C. Advanced organization (modules/data present)

Add **only relevant** cards:

- Pending changes total
- Unbilled approved changes
- Workforce cost (if time used)
- Overhead allocated (if allocations exist)
- Vendors spend snapshot (if vendors used)

Never show the full possible card catalog by default.

---

## Calculation Basis pattern (reuse)

Compact:

```text
רווח משוער
₪84,500
מבוסס על נתונים שהוזנו  [ מה כלול בחישוב › ]
```

Expanded:

```text
כלול
✓ הוצאות שנרשמו
✓ עלות עבודה כללית (אם קיימת)

לא כלול / לא הוגדר
○ עלויות עובדים ושעות
○ הקצאת תקורה
```

Not framed as errors.

---

## Responsive

| Desktop | Mobile |
|---------|--------|
| KPI grid 4-up | KPI stack 1-col |
| Two-column lists | Single column |
| `+` in header | FAB sheet |

---

## Related

`46`, `49`, `50`, `55`
