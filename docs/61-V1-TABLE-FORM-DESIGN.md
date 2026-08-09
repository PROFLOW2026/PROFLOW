# 61 — V1 Table & Form Design

**Status:** Planning  
**Phase:** Planning only

---

## 1. Tables — goals

Strong operational tables without spreadsheet heaviness.

### Rules

- Comfortable, efficient row height (balanced density)
- Clear headers (medium weight, muted bg optional)
- Numeric / money columns aligned for scanning; tabular figures when possible
- Row hover; optional selection
- Row click → detail; overflow actions (`⋯`)
- Status badges in-cell
- Search + filter bar above
- Sort indicators
- Pagination
- Empty state in table body
- Horizontal overflow: prioritize key columns; secondary columns hide on smaller widths; scroll as last resort

### Borders

Prefer whitespace + horizontal dividers over full cell grid borders.

### Default columns

Keep lean for simple orgs (see project list in `52`). Don’t dump every financial field by default.

---

## 2. Forms — Progressive Complexity

**Basic:** few fields, Amount/name dominant.  
**Advanced:** collapsed “פרטים נוספים ›”.

### Field rules

- Label **above** field (never placeholder-only)
- Required indicator `*` with accessible text
- Helper text muted below
- Error: text + border; announce for a11y
- Disabled / read-only distinct
- Field groups with section titles
- Controls: text, dropdown, money, date, %, multi-select, file

---

## 3. Money Input

```text
סכום
┌─────────────────────────┐
│ ₪    12,500             │
└─────────────────────────┘
```

- Amount dominates  
- Currency from org/project defaults  
- Currency selector only when relevant  
- Supports locale formatting direction  

---

## 4. Supplier / Vendor dual mode (visual unity)

Plain text supplier and linked Vendor should feel like **one control family**:

```text
ספק
[  type name  ············  ▾ הצע ספקים ]
     optional: שמור כספק
```

Not two unrelated workflows.

---

## 5. Related

`53`, `58`, `60`, `62`, `63`
