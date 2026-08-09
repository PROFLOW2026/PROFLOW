# 50 — V1 App Shell Wireframes

**Status:** Structure wireframes  
**Phase:** Planning only  
**Shell decision:** Left sidebar (desktop) + bottom nav (mobile)

---

## 1. Evaluation summary

| Approach | Pros | Cons | V1 |
|----------|------|------|----|
| Top nav only | Clean for few items | Crowds when modules appear | Reject as sole pattern |
| Left sidebar | Room for adaptive modules; clear Settings | Needs collapse on small screens | **Recommended desktop** |
| Bottom nav mobile | Thumb reach; field-friendly | Limited slots | **Recommended mobile** |

---

## 2. Desktop shell (RTL: mirror — nav on right)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Top bar                                                          │
│ [Org ▾]   [Search…………]          [+ New ▾]  [Bell]  [User ▾]     │
├────────────────┬─────────────────────────────────────────────────┤
│ NAV            │ PAGE                                            │
│                │                                                 │
│ לוח בקרה       │  PageHeader                                     │
│ פרויקטים       │  ─────────────────────────────────────────────  │
│ הוצאות         │  Content                                        │
│ [חיובים וגבייה] │                                                 │
│ [עובדים ושעות] │                                                 │
│ [ספקים…]       │                                                 │
│ [לקוחות]       │                                                 │
│ [מסמכים]       │                                                 │
│ [שינויים*]     │                                                 │
│                │                                                 │
│ ───────────    │                                                 │
│ הגדרות         │                                                 │
└────────────────┴─────────────────────────────────────────────────┘
```

\* Cross-project Changes — adaptive only (U3).

### Top bar

- Org switcher (future multi-org; V1 single org OK)
- Search: projects first; expand later
- `+ New` adaptive menu (U1)
- Notifications placeholder (can be minimal V1)
- User menu: profile, sign out

### Sidebar rules

- Always: לוח בקרה · פרויקטים · הוצאות · הגדרות
- Conditional items appear per U2
- Collapse to icons on tablet width
- Project context: optional secondary breadcrumb in page header, not a second sidebar

---

## 3. `+ New` desktop menu (adaptive)

```text
+ חדש
────────────
פרויקט
הוצאה
שינוי / תוספת
────────────
חיוב          ← if billing
תשלום         ← if billing
────────────
לקוח          ← if clients used
ספק           ← if vendors used
עובד          ← if workforce
דיווח שעות    ← if workforce
```

---

## 4. Mobile shell

```text
┌─────────────────────────────┐
│ [Org]  Search   User        │  ← compact top
├─────────────────────────────┤
│                             │
│     Page content            │
│     (cards / stacks)        │
│                             │
│              ┌───┐          │
│              │ + │          │  ← FAB
│              └───┘          │
├─────────────────────────────┤
│ לוח │ פרויקטים │ הוצאות │ עוד │  ← bottom nav
└─────────────────────────────┘
```

### Bottom nav

| Slot | Content |
|------|---------|
| 1 | לוח בקרה |
| 2 | פרויקטים |
| 3 | הוצאות |
| 4 | עוד → Billing / Workforce / Vendors / Clients / Documents / Settings / Cross-project Changes when relevant |

### `+` FAB → bottom sheet (`55`)

---

## 5. Responsive behavior

| Breakpoint | Shell |
|------------|--------|
| Desktop | Sidebar + top bar |
| Tablet | Collapsed icon sidebar or temporary drawer |
| Mobile | Bottom nav + FAB; no persistent sidebar |

Project workspace on mobile: tab strip becomes scrollable chips or “More” (`52`, `55`).

---

## 6. RTL notes

- HE: sidebar on right; bottom nav order mirrored appropriately
- Breadcrumbs logical order for locale
- Money amounts align consistently; currency symbol per locale rules
- Non-directional icons do not flip

---

## 7. Related

`41`, `49`, `55`
