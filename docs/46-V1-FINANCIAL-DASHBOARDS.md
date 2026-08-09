# 46 — V1 Financial Dashboards

**Status:** UX planning draft  
**Phase:** Planning only

---

## 1. Purpose

Define Home and project financial surfaces that stay simple, adaptive, and honest about calculation coverage.

---

## 2. Home dashboard — simple first

### Minimum useful widgets (when data exists)

- Active projects (list/cards)
- Current contract value (sum of active / selected scope)
- Recorded costs
- Invoiced / Paid / Outstanding (if billing used)
- Changes pending
- Estimated profit based on available data + What’s included

### First-use / empty

Welcome + CTAs — **no** twenty zero widgets (`42`).

### Adaptive hiding

| If unused | Do not show |
|-----------|-------------|
| No workforce | Labor hours, workforce cost widgets |
| No billing yet | Large AR aging chrome (keep compact “Start billing” only if useful) |
| No overhead allocation | “Allocated overhead” as a primary KPI |
| No changes | Pending changes as alarming zero |

---

## 3. Calculation basis / What’s included

Required pattern on profit/cost KPIs:

```text
Estimated profit: [amount + currency]

What's included
✓ Recorded expenses
✓ Generic labor costs (if any)

Not currently included
○ Employee / time costing
○ Overhead allocation
```

Rules:

- No arbitrary fake completeness %
- Text + icon/label (not color alone)
- Same pattern on Project Overview / Financials
- User can understand why the number exists

Hebrew copy TBD; canonical concept: **Calculation basis / What’s included**.

---

## 4. Billing dashboard (business)

When billing used:

- Total invoiced
- Paid
- Outstanding
- Overdue (if due dates used)

Always visually separate from Contract Value.

### Project billing view

Same metrics scoped to one project (`45`).

---

## 5. Expense organization views

| View | Scope |
|------|--------|
| All Expenses | Org-wide filters: date, project, supplier, category, cost family, has document |
| Project Expenses | Selected project |
| Business / Overhead | Not assigned to a single project |

---

## 6. Desktop vs mobile presentation

| Desktop | Mobile |
|---------|--------|
| Multi-widget dashboard, tables | Stacked KPI cards; top projects; + sheet |
| Filters side-by-side | Bottom sheets / simple chips |

Do not blindly shrink dense tables onto phones (`47`).

---

## 7. Related

`39`, `41`, `44`, `45`, `48`
