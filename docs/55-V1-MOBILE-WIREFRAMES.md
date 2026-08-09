# 55 — V1 Mobile Wireframes

**Status:** Structure wireframes  
**Phase:** Planning only — responsive web, not native  
**Shell:** Bottom nav + FAB (`50`)

---

## 1. Mobile project workspace

```text
┌─────────────────────────────┐
│ בית כהן              פעיל  │
│ לקוח: כהן                   │
├─────────────────────────────┤
│ שווי חוזה      עלות בפועל   │
│ ₪504,000       ₪310,000     │
│                             │
│ רווח משוער                  │
│ ₪…                          │
│ מה כלול בחישוב ›            │
│                             │
│ שינויים ממתינים · יתרה*     │
├─────────────────────────────┤
│ [ + הוצאה ]  [ + שינוי ]    │
├─────────────────────────────┤
│ סקירה | הוצאות | שינויים | עוד │
│                             │
│ (תוכן הטאב)                 │
└─────────────────────────────┘
```

`עוד` → כספים · חיובים* · תחומי עבודה* · שעות* · מסמכים · פרטים  

\* only when used.

---

## 2. Quick-create bottom sheet

```text
┌──────────── הוסף ────────────┐
│                              │
│  הוצאה                       │
│  שינוי / תוספת               │
│  פרויקט                      │
│  ─────────────               │
│  דיווח שעות     ← workforce  │
│  חיוב           ← billing    │
│  תשלום          ← billing    │
│                              │
│  [ ביטול ]                   │
└──────────────────────────────┘
```

Contextual first: if user is inside a project, Expense/Change pre-bound to that project.

---

## 3. Mobile receipt / expense capture

```text
┌────────── הוצאה חדשה ──────────┐
│                                │
│  ₪ סכום *                      │
│  [____________]                │
│                                │
│  ┌──────────────────────────┐  │
│  │  צלם קבלה                │  │
│  │  או בחר קובץ             │  │
│  └──────────────────────────┘  │
│  (אופציונלי — לא חובה)        │
│                                │
│  פרויקט [אופציונלי]            │
│  ספק    [אופציונלי]            │
│                                │
│  › פרטים נוספים                │
│                                │
│           [ שמור ]             │
└────────────────────────────────┘
```

Camera useful, never required.

---

## 4. Mobile Change (short)

```text
כותרת *
תיאור קצר
השפעת מחיר (+/− סכום)
[תמונה]
[שמור טיוטה]
[ממתין לאישור]
```

---

## 5. Mobile Time (workforce)

```text
עובד (ברירת מחדל: אני)
תאריך
שעות
פרויקט
[שמור]
```

---

## 6. What stacks / moves

| Desktop element | Mobile |
|-----------------|--------|
| Sidebar | Bottom nav + עוד |
| `+ New` menu | FAB sheet |
| KPI row | Vertical stack |
| Tables | Cards |
| Project tabs | Chip scroller / עוד |
| Split expense | Multi-step sheet |
| Settings sections | List → subpage |

---

## 7. One-hand field use

- FAB in thumb zone  
- Primary Save large  
- Recent projects at top of pickers  
- Minimal typing; defaults today/currency/self  

---

## Related

`47`, `50`, `51`, `52`, `53`
