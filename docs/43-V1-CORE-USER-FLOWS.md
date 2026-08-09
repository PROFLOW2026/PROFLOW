# 43 — V1 Core User Flows

**Status:** UX planning draft  
**Phase:** Planning only — conceptual flows, not wireframes

---

## Flow 1 — Register → organization → first project

```text
Sign up → verify → Business name → Country/language/currency
  → optional “What do you manage?” or Skip
  → Welcome Home
  → Create first project (name)
  → Project Overview
```

---

## Flow 2 — Create simple project

```text
+ New → Project
  → Enter name (required)
  → optional: client / contract value / domain / location
  → Save
System: org ownership + Default/General WorkPackage (hidden)
  → Project Overview
```

No WorkPackage UI shown.

---

## Flow 3 — Convert simple project → multi-WorkPackage

```text
Project → Work (or Details → Structure)
  → “Split project into areas / disciplines”
  → Rename Default/General and/or add packages (Electrical, Plumbing, …)
  → Confirm
Existing expenses/time/changes remain attached:
  - stay on renamed General, or
  - user optionally reassigns later
```

**Recommended transition:** keep historical lines on the former default package unless user redistributes; never recreate Project.

---

## Flow 4 — Add quick expense

```text
+ New → Expense (or Project → Expenses → +)
  → Amount (+ currency default)
  → optional description / project / supplier
  → Save
```

---

## Flow 5 — Enrich expense later

```text
Open Expense
  → More details
  → add photo/tax/category/cost family/WP/split/payment/notes/Vendor link
  → Save
```

---

## Flow 6 — Free-text supplier → Vendor

```text
Expense with supplier_name “ABC Electrical Supplies”
  → prompt or action: “Save as Vendor?”
  → Create/link Vendor
  → Expense.vendor_id set; name preserved for history
Later expenses suggest matching Vendor
```

---

## Flow 7 — Add business overhead

```text
+ Expense → amount
  → leave project empty OR choose Business/Overhead
  → optional category (Rent, Insurance, …)
  → optional recurrence
  → Save
Appears under Business/Overhead expenses
Optional later: allocate to projects (manual amount/%)
```

---

## Flow 8 — Split expense

```text
Expense → More details → Split
  → lines: amount or % → Project/WP or Overhead
  → validate sum = total
  → Save
```

No advanced allocation engine UI.

---

## Flow 9 — Enable workforce later

```text
Settings → Modules → enable Workforce
  OR create first Employee / Time entry (auto-surface)
Nav gains Workforce
No historical rewrite required
```

---

## Flow 10 — Add employee

```text
Workforce → + Employee
  → name, employment style, rate, burden %
  → optional components
  → Save
Note: Employee ≠ User login (invite separately if needed)
```

---

## Flow 11 — Log time

```text
+ Time (or Workforce → Time → +)
  → employee, date, hours
  → project (WP defaults to General / selected package)
  → optional phase/notes
  → Save
Costs roll into project labor when rates exist
```

---

## Flow 12 — Generic labor → later workforce

```text
Earlier: Expense category Labor = 8,000 on Project
Later: enable Workforce + time entries
Coverage UI shows both sources distinctly;
do not auto-delete generic labor
User may leave both or adjust manually
```

---

## Flow 13 — Change Request → quote → approval → ChangeOrder

```text
+ Change / Extra (project context preferred)
  → What changed? (title, description, requester, affected areas, attachments)
  → Price change (customer price, optional estimated cost, margin preview)
  → Save as Draft quote version
  → Mark Sent / Awaiting approval
  → Approve → creates/links ChangeOrder
  → Current Contract Value updates
  → Reject ends commercial path (history kept)
```

V1 statuses kept short: Draft · Awaiting approval · Approved · Rejected  
(Operational In Progress/Completed optional later — not required in primary V1 chrome.)

---

## Flow 14 — Record Billing

```text
+ Billing
  → project, amount, date
  → optional due date, reference, document, related CO(s), notes
  → Save
Updates Invoiced / Outstanding
Not statutory invoice issuance
```

---

## Flow 15 — Record partial/full Payment

```text
+ Payment (from Billing record or global)
  → billing record, amount, payment date
  → optional method/reference/notes
  → Save
Paid increases; Outstanding decreases; partial OK
```

---

## Flow 16 — Client added later to existing project

```text
Project → Details → Client
  → choose existing / enter simple name / create Client
  → Save
Project continues; richer client fields optional
```

---

## Flow 17 — Upload/link document

```text
From Project / Expense / Change / Billing / Client / Vendor
  → Attach file
  → optional type/note
  → Save
Also visible in that entity’s Documents section
```

---

## Flow 18 — View profitability with incomplete coverage

```text
Project Overview / Financials
  → Estimated profit figure
  → open “What’s included” / Calculation basis
  → see included vs not configured families
No fake % completeness
```

---

## Flow 19 — Hide module without deleting data

```text
Settings → Modules → turn off Workforce
  → Workforce leaves nav/dashboard
  → Employees/time data retained
  → Re-enable restores access
```

---

## Flow 20 — Mobile quick expense / change / time

```text
Mobile Home / + sheet
  → Expense | Change | Time (if workforce)
  → short form → Save
  → optional camera for receipt/photo
Return to project summary card
```

Detail: `47-V1-MOBILE-FIELD-FLOWS.md`

---

## Related docs

`40`–`48`, `39`, `16`
