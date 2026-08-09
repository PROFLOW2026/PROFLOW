# 53 — V1 Transaction Wireframes (Expenses, Changes, Billing)

**Status:** Structure wireframes  
**Phase:** Planning only

---

## 1. All Expenses list

```text
הוצאות                    [חיפוש] [תאריך] [פרויקט] [ספק] [+ הוצאה]

תאריך | תיאור | פרויקט | ספק | סכום | מסמך?
─────────────────────────────────────────────
…     | …     | …      | …   | ₪…  | 📎/—
```

Sections/filters: הכל · לפי פרויקט · הוצאות עסק/תקורה  

Mobile: cards.

---

## 2. Quick Expense (Amount-centric)

```text
┌──────────── הוצאה חדשה ────────────┐
│                                      │
│  סכום *                              │
│  ₪ [____________________]  ← dominant│
│                                      │
│  תיאור                               │
│  [____________________]              │
│                                      │
│  פרויקט          [אופציונלי ▾]      │
│  ספק             [ריק / טקסט / ספק] │
│                                      │
│  [ 📎 הוסף קבלה ]                   │
│                                      │
│  › פרטים נוספים                      │
│                                      │
│                 [ שמור ]             │
└──────────────────────────────────────┘
```

### More details (disclosure)

Tax · Category · Cost family · תחום עבודה · Split · Payment method · Notes · Link/create Vendor  

Advanced fields must not visually compete with Amount.

---

## 3. Expense detail + Split

```text
הוצאה ₪10,000
ספק: ABC…   [שמור כספק?]
פרויקט: …

› פיצול
  ₪6,000 → פרויקט א / חשמל
  ₪3,000 → פרויקט ב / מיזוג
  ₪1,000 → תקורה עסקית
  סה״כ חייב להשתוות לסכום (סכום או %)
```

---

## 4. Changes list (Project → שינויים ותוספות)

```text
סיכום: תוספות מאושרות | הפחתות | ממתינים | פוטנציאל | מאושרים שטרם חויבו

כותרת | סכום | סטטוס | תאריך | חויב? | תחומים
─────────────────────────────────────────────
…      | +₪…  | ממתין לאישור | … | לא | חשמל
```

Statuses (U7): Draft · Awaiting Approval · Approved · Rejected · Cancelled  
(+ Sent event metadata when relevant)

---

## 5. New Change / Extra

```text
┌──────── שינוי / תוספת חדשה ────────┐
│ כותרת *                              │
│ תיאור                                │
│ מבוקש ע״י                            │
│ תחומים מושפעים (אופציונלי)          │
│ [תמונה / מסמך]                       │
│                                      │
│ השפעת מחיר                           │
│ ( + / − )  [ סכום ]                  │
│ עלות משוערת (אופציונלי)              │
│                                      │
│ › גרסאות הצעה / פירוט                │
│                                      │
│ [שמור טיוטה]  [סמן ממתין לאישור]   │
└──────────────────────────────────────┘
```

`סמן ממתין לאישור` may record Sent event (timestamp/evidence) without a separate status.

---

## 6. Change detail / approval

```text
סטטוס: ממתין לאישור
מחיר נוכחי (גרסה V2)
היסטוריית גרסאות: V1 · V2

[אשר] → יוצר/מקשר שינוי מאושר (ChangeOrder)
        מעדכן שווי חוזה נוכחי
[דחה] [בטל]

מצב חיוב (נפרד): לא חויב | חויב חלקית | חויב
```

---

## 7. Billing list

```text
חיובים וגבייה
[חיובים כולל] [שולם] [יתרה לתשלום] [באיחור*]

פרויקט | אסמכתא | תאריך | סכום | שולם | יתרה | סטטוס
```

Copy must **not** imply statutory invoice issuance.  
Label as רשומות חיוב / מעקב חיובים.

---

## 8. Add BillingRecord

```text
חיוב חדש
פרויקט *
סכום *
תאריך *
תאריך לתשלום (אופציונלי)
אסמכתא / מספר
מסמך חיצוני (אופציונלי)
שינויים מאושרים קשורים (אופציונלי)
הערות
[שמור]
```

Rich Client **not** required (U6). Customer-facing send/export = separate gate later.

---

## 9. Add Payment (fast)

```text
תשלום חדש
חיוב * (או מהקשר)
סכום *   (חלקי מותר)
תאריך תשלום *
אמצעי / אסמכתא (אופציונלי)
הערות
[שמור] → מעדכן שולם / יתרה לתשלום
```

---

## 10. Responsive

| Flow | Desktop | Mobile |
|------|---------|--------|
| Expense | Modal/page Amount-first | Full-screen Amount-first + camera |
| Split | Side panel / section | Stepper or stacked lines |
| Change | Two-column detail | Single column; approve sticky |
| Payment | Small modal | Bottom sheet |

---

## Related

`43`, `45`, `49`, `55`
