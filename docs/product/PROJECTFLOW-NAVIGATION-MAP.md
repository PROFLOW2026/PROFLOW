# ProjectFlow — Navigation & Route Inventory

**Date:** 2026-08-11 · Updated after Master Completion Run  
**Status values:** COMPLETE · PARTIAL · FOUNDATION ONLY · HIDDEN · DISABLED · MISSING

---

## Shell entry points

| Surface | Behavior |
|---------|----------|
| **Desktop sidebar** | Core → Business → Operations → Advanced → Settings |
| **Mobile bottom** | ≤4 primary + **More** sheet |
| **Quick Create (+)** | Expense, Time, Employee, Vendor Bill, Field Log, Document, Attendance, Maintenance, Project/Job… — **permission/module aware** |
| **Settings** | Always reachable; sections by permission |

**Permission-only (no module pref):** workforce (employees), vendorBills (AP), attendance (any of read/self/manage).

---

## Mobile More (typical owner)

| Group | Items (when gated on) |
|-------|------------------------|
| Business | Clients, Changes, Billing, Reports, (Jobs if demoted) |
| Operations | CRM, Vendors, **Employees**, **Attendance**, Procurement, Materials, Field ops, Documents |
| Advanced | **Vendor bills**, Assets, Compliance |
| — | Settings |

---

## Route inventory (highlights changed in master run)

### Workforce

| Route | Hebrew | Status | Disc |
|-------|--------|--------|------|
| `/workforce/employees` | עובדים | COMPLETE | YES |
| `/workforce/employees/new` | עובד חדש | COMPLETE | YES |
| `/workforce/employees/[id]` | עובד (עריכה / ארכיון / תעריפים / שיוכים) | COMPLETE | YES |
| `/workforce/time` | דיווחי שעות (+ filters) | COMPLETE | YES |
| `/workforce/time/new` | דיווח (פשוט + מתקדם) | COMPLETE | YES |
| `/workforce/attendance` | נוכחות | COMPLETE | YES |

### Vendors / AP / Procurement

| Route | Hebrew | Status | Disc |
|-------|--------|--------|------|
| `/vendors/[id]` | ספק (עריכה / ארכיון / התקשרויות) | COMPLETE | YES |
| `/procurement/ap` | חשבונות ספקים | COMPLETE | YES |
| `/procurement/ap/aging` | גיל יתרות ספקים | COMPLETE | YES (from AP list) |
| `/procurement/ap/[billId]` | חשבון (void / credit / allocation) | COMPLETE | YES |
| `/procurement/[poId]` | הזמנה (cancel / close) | COMPLETE | YES |

### Clients

| Route | Status | Disc |
|-------|--------|------|
| `/clients` (+ archived filter) | COMPLETE | YES |
| `/clients/[id]` (edit / archive / restore / projects / contacts) | COMPLETE | YES |

### Planning

| Surface | Status | Disc |
|---------|--------|------|
| Project `?tab=schedule` לוח זמנים | COMPLETE | YES (tab; `planning.read`) |
| Jobs Gantt | OPTIONAL / not forced | — |

### Integrations (unchanged)

| Route | Status |
|-------|--------|
| `/documents/ocr-review` | DISABLED / FOUNDATION |
| Live bank feed / statutory invoice | DISABLED foundations |

---

## Project tab map (daily chrome)

Order: Overview → Financials → Expenses → **Team** → **Schedule** → Changes → Billing → Time → Documents → Work → Details  
(Contractors/engagements surface on overview or vendor panels — optional.)

| Tab | Hebrew | Gate | Daily vs setup |
|-----|--------|------|----------------|
| overview | סקירה | always | Daily |
| financials | כספים | financials/contracts read | Daily |
| expenses | הוצאות | expenses.read | Daily |
| team | צוות | workforce.read | Daily |
| schedule | לוח זמנים | planning.read | Daily when used |
| changes | שינויים | module + changes.read | Daily when used |
| billing | חיובים | module + billing.read | Daily when used |
| time | שעות | workforce.read | Daily |
| documents | מסמכים | module + documents.read | Daily when used |
| work | תחומי עבודה | >1 work packages | Setup |
| details | פרטים | always | Setup |

Jobs: Team available when workforce permitted; Schedule not forced.

---

## Mobile daily-task tap paths

| Task | Path (approx) | Notes |
|------|---------------|-------|
| Create expense | + → Expense | 1–2 taps |
| Report hours | + → Time | Simple default; advanced expandable |
| Clock attendance | + / More → Attendance → כניסה/יציאה | Large targets |
| Assign employee | Project → Team | OK |
| Vendor bill | More → Vendor bills | Advanced |
| AP aging | Vendor bills → גיל יתרות | From AP list |
| Planning | Project → לוח זמנים | List on mobile |
| Archive employee/client/vendor | Detail → archive | Soft |

---

## Misleading links — resolved

| Before | After |
|--------|-------|
| Schedule → Details | Dedicated **לוח זמנים** tab |
| Employees hard to find | More → Employees (permission-only) |
| AP only via procurement module | Vendor bills permission-only |
