# 48 — V1 UX Rules, Validation & Closed Decisions

**Status:** UX decisions closed 2026-08-09; wireframes in `49`–`55`  
**Phase:** Planning only

---

## 1. UX rules (non-negotiable for V1 design)

1. Progressive Complexity — simple by default (`39`).  
2. Adaptive nav — unused modules stay quiet (`41`, **U1/U2 DECIDED**).  
3. Internal mandatory ≠ exposed UI (Default WorkPackage → HE: תחום עבודה when shown).  
4. Honest financial coverage — What’s included / מה כלול בחישוב (`46`).  
5. No punishment empty states.  
6. Progressive disclosure — Basic / More details / Advanced.  
7. Status = text + icon (not color alone).  
8. Contextual required fields only.  
9. Country Pack legal fields attach to legal/export actions, not project create (**U6/B6**).  
10. Hebrew first UI labels from initial glossary (**U5**); English canonical keys.  
11. Do not pull future modules into V1 chrome.  
12. Hiding a module never deletes data (**U2**).

---

## 2. Closed V1 UX decisions (2026-08-09)

| ID | Decision |
|----|----------|
| **U1** | Always: Home, Projects, Expenses, Settings, `+ New`. Conditional: Billing, Workforce, Vendors, Clients, Documents, cross-project Changes |
| **U2** | Hybrid Option C; hide ≠ delete |
| **U3** | Changes primary at Project → Changes; cross-project optional |
| **U4** | Project statuses: Draft, Active, On Hold, Completed, Cancelled, Archived — **no Quoted** |
| **U5** | Initial Hebrew glossary below |
| **U6 / B6** | Client not required on project create; internal BillingRecord OK without rich Client; customer-facing send/export contextual Country Pack gate |
| **U7 / C2** | CR statuses: Draft, Awaiting Approval, Approved, Rejected, Cancelled; Sent = event; billing/payment separate |

---

## 3. Initial Hebrew UX glossary (U5)

Canonical English remains internal. Do **not** show `WorkPackage` in HE UI.

| Canonical | Hebrew UX |
|-----------|-----------|
| Home / Dashboard | לוח בקרה |
| Projects | פרויקטים |
| Project | פרויקט |
| Expenses | הוצאות |
| Changes | שינויים ותוספות |
| ChangeRequest | בקשת שינוי |
| ChangeOrder | שינוי מאושר |
| Billing | חיובים וגבייה |
| BillingRecord | חיוב |
| Payment | תשלום |
| Outstanding | יתרה לתשלום |
| Clients | לקוחות |
| Client | לקוח |
| Vendors | ספקים וקבלני משנה |
| Vendor | ספק / קבלן משנה לפי ההקשר |
| Workforce | עובדים ושעות |
| Employee | עובד |
| Time Entry | דיווח שעות |
| Documents | מסמכים |
| Settings | הגדרות |
| WorkPackage | תחום עבודה |
| Phase | שלב |
| Current Contract Value | שווי חוזה נוכחי |
| Pending Changes | שינויים ממתינים |
| Actual Cost to Date | עלות בפועל עד היום |
| Estimated Profit | רווח משוער |
| Calculation basis / What's included | מה כלול בחישוב |

Polishable later without changing domain meaning.

---

## 4. Contextual required fields matrix

| Action | Required | Optional | Why |
|--------|----------|----------|-----|
| Create Project | Project name; tenant | Client, contract value, domain, location | **U6** |
| Create Expense | Amount + currency | Description, project, supplier, … | Fast capture |
| Create Change | Title; project | Description, areas, attachments, cost estimate | Negotiation |
| Price / quote version | Customer price + currency | Estimated cost | Commercial |
| Approve → CO | Approved amount/version | Notes, evidence | Contract integrity |
| Create BillingRecord | Project, amount, currency, date | Due date, ref, doc, COs | Internal tracking; rich Client **not** required |
| Customer-facing send/export | Client identity + Country Pack fields | — | Contextual gate only |
| Record Payment | Billing target, amount, currency, date | Method, reference | Cash integrity |
| Create Employee | Name; style; base rate | Burden, login | Workforce used |
| Log Time | Employee, date, duration, project | Phase, notes | Workforce used |

---

## 5. Profile validation

Same product shell; adaptive chrome only — see `49` § profiles.

---

## 6. Remaining before visual design (not UX forks)

- Stack/providers (J*)  
- Pilot profile (L*)  
- C3 client approval channel  
- Visual branding (explicitly deferred)  

No remaining blocker inside U1–U7.

---

## 7. Related

`16`, `18`, `39`, `40`–`47`, wireframes `49`–`55`
