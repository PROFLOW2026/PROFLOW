# 49 — V1 Wireframe Map

**Status:** Wireframe-level planning (structure only)  
**Phase:** Planning only — no branding, CSS, components, or code  
**Decisions closed:** U1–U7 / B6 / C2 (2026-08-09)

---

## 1. Purpose

Index of V1 wireframe specs and shared patterns.  
Wireframe = layout, hierarchy, placement, interaction structure, desktop/mobile behavior.

---

## 2. Document index

| Doc | Contents |
|-----|----------|
| `50` | App shell desktop + mobile |
| `51` | Home dashboard states |
| `52` | Project list, create, workspace, overview, financials, work |
| `53` | Expenses, changes, billing, payments |
| `54` | Clients, vendors, workforce, settings |
| `55` | Mobile shells, quick-create, receipt capture |

---

## 3. Desktop shell recommendation (V1)

**Left sidebar + top utility bar** (collapses on tablet/mobile).

Rationale:

- Scales for adaptive modules without overcrowding a top nav
- Stable Settings + primary areas
- RTL: sidebar mirrors to the right in Hebrew

See `50`.

---

## 4. Mobile shell recommendation (V1)

**Bottom primary nav** (לוח בקרה / פרויקטים / הוצאות / עוד) + floating `+` + bottom sheet.  
No desktop sidebar clone. See `50`, `55`.

---

## 5. Conceptual reusable patterns (not code)

| Pattern | Role |
|---------|------|
| PageHeader | Title, status, primary actions |
| KPI Card | Single metric + optional subtitle |
| Status Badge | Text + icon (not color-only) |
| Empty State | CTA, never “setup incomplete” for unused modules |
| Quick Create | Adaptive `+` / bottom sheet |
| Advanced Disclosure | “More details ›” |
| Calculation Basis | מה כלול בחישוב expand |
| Entity Picker | Project/Client/Vendor/Employee |
| Money Input | Amount dominant; currency from defaults |
| Document Attachment | Optional camera/file |
| Filter Bar | Search + few defaults |
| Confirmation Dialog | Destructive / approve actions |

---

## 6. Table principles (desktop)

- Useful default columns only (simple orgs ≠ spreadsheet)
- Search, filters, sort, pagination
- Row click → detail
- Optional column customization later
- Mobile: cards, not dense grids

---

## 7. Accessibility & RTL (structure)

- Keyboard focus order logical
- All controls labeled
- Touch targets comfortable on mobile
- Status never color-only
- RTL mirror of shell; numbers/currency LTR islands as appropriate
- Directional icons only mirrored when semantic
- Mixed HE + EN vendor/client names supported

---

## 8. Five profiles — visible chrome summary

| Profile | Nav | Project tabs | Home cards | Quick + |
|---------|-----|--------------|------------|---------|
| A Solo electrician | Home Projects Expenses Billing* Settings | Overview Financials Expenses Changes Details Docs | Snapshot + billing if used | Expense Change Project Billing* |
| B Contractor + employees | + Workforce + Vendors | + Time/Team | + labor when used | + Time Employee |
| C Turnkey | + Vendors + Changes† + Workforce | + Work (multi-area) + Billing | + pending/unbilled | Full adaptive |
| D Architect | + Workforce | + Time; Work if multi | Time-heavy costs | Time Expense Change |
| E Consultant | + Workforce | Time-focused | Simple KPIs | Time Expense Change |

\* if billing used † cross-project Changes if heavy use

Same product shell — adaptive visibility only.

---

## 9. Out of scope for wireframes

Logo, final brand name, brand colors, fonts, illustrations, decorative style.

---

## 10. Related

`40`–`48`, `18`
