# 62 — V1 Responsive Visual Rules

**Status:** Planning  
**Phase:** Planning only  
**Shell source:** `50`, `55`

---

## 1. Breakpoint posture (conceptual)

| Tier | Behavior |
|------|----------|
| Desktop | Sidebar + top bar; multi-column KPIs; full tables |
| Tablet | Collapsible sidebar/drawer; 2-column cards; tables with selective columns; touch targets |
| Mobile | Bottom nav + FAB; stacked cards; full-screen forms; sheets |

Mobile is **not** compressed desktop.

---

## 2. What transforms

| Pattern | Desktop | Tablet | Mobile |
|---------|---------|--------|--------|
| Nav | Sidebar | Drawer/icons | Bottom + עוד |
| `+ New` | Top button | Top or FAB | FAB sheet |
| KPIs | 3–4 column grid | 2-col | Stack |
| Tables | Full | Fewer columns | Cards |
| Project tabs | Horizontal strip | Scroll chips | Chips / עוד |
| Filters | Inline bar | Wrap / sheet | Bottom sheet |
| Quick Expense | Modal | Modal/full | Full-screen |
| Payment | Small modal | Modal | Sheet |

---

## 3. Touch

- Large primary targets (esp. Save, FAB, bottom nav)
- Sticky Save on long mobile forms where useful
- Adequate spacing between destructive and primary actions

---

## 4. Project workspace

Header metrics wrap; avoid duplicating Overview KPIs.  
Billing/Time/Work tabs appear only when used — same rule all breakpoints.

---

## 5. Home

Empty / simple / advanced states from `51` scale down: fewer columns, same progressive card rules.

---

## 6. Related

`50`, `55`, `60`, `64`
