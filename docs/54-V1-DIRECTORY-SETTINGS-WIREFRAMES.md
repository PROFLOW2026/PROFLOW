# 54 — V1 Directory & Settings Wireframes

**Status:** Structure wireframes  
**Phase:** Planning only  
**Note:** Directories appear only when enabled/used (U1/U2)

---

## 1. Clients (לקוחות)

### List

```text
לקוחות                         [חיפוש] [+ לקוח]
שם | פרויקטים | יתרה* | …
```

### Detail (progressive)

```text
שם לקוח
אנשי קשר (אופציונלי)
כתובת / מזהים (אופציונלי — העשרה)
פרויקטים
סיכום חיובים (אם מותר לפי הרשאות)
מסמכים
```

Not a CRM. No forced legal fields until customer-facing export gate.

---

## 2. Vendors (ספקים וקבלני משנה)

### List

```text
ספקים וקבלני משנה              [חיפוש] [+ ספק]
שם | תגיות | הוצאות | פרויקטים
```

### Detail

```text
שם · סוג (ספק / קבלן משנה / …)
אנשי קשר (בסיסי)
הוצאות קשורות
פרויקטים / התקשרויות בסיסיות
מסמכים
```

Promote from expense supplier name without losing history.

---

## 3. Workforce (עובדים ושעות)

Visible only when used.

### Employee list

```text
עובדים                    [+ עובד]
שם | סוג העסקה | תעריף נוכחי | סטטוס
```

### Employee detail

```text
פרופיל
תעריף נוכחי + העמסת מעסיק %
רכיבי עלות אופציונליים
היסטוריית תעריפים (effective dates)
[הזמנה למשתמש — אופציונלי; עובד ≠ משתמש]
```

Not payroll.

### Time list + Quick Time

```text
דיווחי שעות          [+ דיווח שעות]
תאריך | עובד | פרויקט | שעות | …

Quick:
עובד · תאריך · שעות · פרויקט (תחום עבודה ברירת מחדל מוסתר) · הערה
```

---

## 4. Settings (הגדרות)

```text
הגדרות
├── עסק
├── מודולים / אפשרויות
├── מקצועות ושירותים
├── עלויות
├── מס
└── משתמשים והרשאות
```

### Business

Name · Country · Currency · Language · Timezone

### Modules

```text
┌────────────────────────────────────────────┐
│ מודולים                                    │
│                                            │
│ [x] חיובים וגבייה                          │
│ [ ] עובדים ושעות                           │
│ [ ] ספקים וקבלני משנה                      │
│ [ ] לקוחות (מדריך)                         │
│ [ ] מסמכים (תצוגה כללית)                   │
│ [ ] שינויים חוצי-פרויקטים                  │
│ [ ] כלי תקורה / הקצאה                      │
│                                            │
│ הערה קבועה:                                │
│ כיבוי מסתיר מהניווט והווידג׳טים בלבד.     │
│ המידע אינו נמחק. הפעלה מחדש משחזרת גישה. │
└────────────────────────────────────────────┘
```

Auto-surface on first use still applies (U2).

### Professions & Services / Costs / Tax / Users

Keep forms short; progressive disclosure for advanced tax overrides.

---

## 5. Responsive

Directories: tables → cards. Settings: stacked section nav on mobile (list → detail).

---

## Related

`41`, `42`, `48`, `49`, `50`
