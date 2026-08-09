# 47 — V1 Mobile / Field Flows

**Status:** UX planning draft  
**Phase:** Planning only — responsive web, not native apps  
**Out of V1:** native apps, full offline PWA (`31`)

---

## 1. Purpose

Make field-critical actions fast on phone without cloning the desktop shell.

---

## 2. Mobile priorities

Primary:

1. Quick Expense (+ optional photo)  
2. Quick Change / Extra  
3. Quick Time (if workforce)  
4. Project summary glance  
5. Payment capture (if billing)

Secondary:

- project list  
- attach photo to project/change  
- approve change (if permitted)

---

## 3. Mobile shell pattern

```text
Top: context (org/project) + search lite
Bottom or floating: + action sheet
Home: KPI cards + recent projects (not dense tables)
```

Lists use **cards**, not full desktop tables.

---

## 4. + Action sheet (adaptive)

Always candidates:

- Project  
- Expense  
- Change  

If enabled/used:

- Time  
- Billing  
- Payment  

---

## 5. Quick Expense (mobile)

```text
Amount (large input)
Description (optional)
Project (recent first)
Supplier (optional: none / text / pick Vendor)
[Camera] attach receipt (optional)
Save
More details → advanced fields
```

---

## 6. Quick Change (mobile)

```text
Title
Short description
Price impact (+/−)
Photo optional
Save as Draft
(Approval may be desktop-preferred but must work on mobile)
```

---

## 7. Quick Time (mobile, workforce only)

```text
Employee (default = self if worker user)
Date (default today)
Hours
Project (WP default hidden General)
Notes optional
Save
```

---

## 8. Project summary (mobile)

Compact header metrics + What’s included link + shortcuts to Expenses / Changes / Billing.

---

## 9. Desktop remains richer

Filters, multi-column forms, allocation splits, multi-WP management optimized for desktop; mobile offers guided subset.

---

## 10. Related

`31`, `43`, `44`, `45`, `48`
