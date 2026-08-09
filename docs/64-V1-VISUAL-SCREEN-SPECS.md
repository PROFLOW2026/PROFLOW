# 64 — V1 Visual Screen Specs

**Status:** Planning — applies visual system to key screens  
**Phase:** Planning only  
**Structure source:** Wireframes `51`–`55`  
**No conflict intent:** Reinforce wireframe hierarchy; do not invent new IA

---

## 1. Home (לוח בקרה)

| State | Visual |
|-------|--------|
| Empty | Centered calm empty panel; 1 primary + 1 secondary CTA; no KPI ghosts |
| Simple | 3–4 KPI cards max in row; attention list; recent activity; billing row only if used |
| Advanced | Extra cards only with data; still capped visually — no metric wall |

Profit KPI always offers מה כלול בחישוב (neutral expansion).

---

## 2. Project workspace

- Compact identity strip: name, status badge, client line  
- **3 primary numbers** in header (contract, cost, profit) — not a second dashboard  
- Adaptive billing micro-line when used  
- Tab strip calm; active tab clear  
- Overview sections use light dividers more than nested cards  
- Do not repeat identical KPIs in header and Overview without added breakdown value  

Multi תחום עבודה: appear only after split — visually as a normal table/cards section, not a “pro unlock” celebration.

---

## 3. Expenses

- Quick add: **Amount** visually dominant (larger input, primary field position)  
- More details disclosure quieter  
- List: lean columns; attachment icon subtle  
- Supplier plain text vs Vendor: same control language (`61`)  

---

## 4. Changes (differentiator)

Make path readable without a workflow diagram:

```text
בקשה / מחיר → סטטוס → (אם מאושר) השפעה על שווי חוזה → מצב חיוב נפרד
```

- Status badge + amount with +/−  
- Approved state shows link/label שינוי מאושר  
- Billing chips (לא חויב / חויב) visually secondary to commercial status  
- Approval actions: one primary (אשר), destructive secondary (דחה)  

---

## 5. Billing

- Copy/UI: מעקב חיובים — not statutory “הפקת חשבונית מס” metaphors  
- Header KPIs: חיובים | שולם | יתרה לתשלום  
- Payment sheet: fast, amount-first  
- Avoid invoice-template chrome that implies compliance issuance  

---

## 6. Workforce

When enabled: clean employee list + time; rates as quiet financial fields.  
Permission-sensitive costs: hide values, don’t leave empty red errors.  
Must not look like payroll (no payslip metaphors).

---

## 7. Settings → Modules

Clear explanatory banner: hide ≠ delete.  
Toggles look standard; no scary warning styling for off state.

---

## 8. Wireframe alignment check

| Wireframe | Visual spec |
|-----------|-------------|
| `50` shell | Calm sidebar, strong `+` |
| `51` home | Empty/simple/advanced density |
| `52` project | Compact header, adaptive tabs |
| `53` transactions | Amount-first, CR clarity |
| `54` directories/settings | Simple, non-CRM |
| `55` mobile | Cards, FAB, sheets |

**No IA contradictions introduced.**

---

## 9. Related

`56`–`63`, `49`–`55`
