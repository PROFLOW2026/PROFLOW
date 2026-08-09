# 04 — Financial Model

**Status:** Draft with owner decisions applied  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Define how ProjectFlow thinks about money: contract value, costs (including overhead), allocation, billing/cash, and forecast profit — without pretending to be statutory accounting software in V1.

---

## 2. Foundational rules

1. Every money value is **Amount + Currency**.
2. Organization has a **Base Currency**.
3. V1 uses one org base currency and one project currency path; conversion is deferred, not blocked.
4. Do not assume ILS in core.
5. Do not overwrite historical financial documents when rates/taxes change.
6. Separate commercial value from billing and from cash.
7. Distinguish direct cost from shared/overhead/allocated cost.
8. **Business overhead capability is part of V1** — available for real business cost; **usage is optional** (progressive complexity — `39`).
9. Do not label a number **“Revenue”** in V1 UI unless its definition is explicit.
10. Accounting-grade Revenue Recognition is **out of V1**.
11. Financial metrics must disclose **calculation basis / coverage** when inputs (workforce, overhead allocation, etc.) are unused or unconfigured — never fake complete “True Profit”.

---

## 3. Core financial concepts (V1-facing)

| Concept | Meaning |
|---------|---------|
| **Original Contract Value** | Value at original agreement |
| **Approved Changes** | Approved additions and reductions (via Change Orders) |
| **Current Contract Value** | Original ± approved changes |
| **Pending Changes** | Change Requests / quotes not yet approved as Change Orders |
| **Invoiced** | Amount recorded as billed to client (basic billing records) |
| **Paid** | Amount collected against billing |
| **Outstanding** | Invoiced − Paid (± adjustments later) |
| **Actual Cost to Date** | Recorded costs to date (direct + allocated shared/overhead as applied) |
| **Estimated / Forecast Final Cost** | Expected total cost at completion |
| **Estimated / Forecast Profit** | Explicit forecast profit view (definition shown in UI) |
| **Budget** | Planned cost/commercial targets |
| **Committed Cost** | Obligations not yet fully actualized (future deepening) |

### Explicit non-default label

| Avoid in V1 unless defined | Why |
|----------------------------|-----|
| Generic “Revenue” | Easy to confuse with Contract Value, Invoiced, or recognition policy |

### Separation example

```text
Current Contract Value = 504,000
Invoiced               = 170,000
Paid                   = 120,000
Outstanding            =  50,000
Actual Cost to Date    = 140,000 (incl. allocated overhead if applied)
```

These remain separable.

---

## 4. Money value object

Conceptual shape:

```text
MoneyValue {
  amount: decimal
  currency: ISO currency code
}
```

### Decided currency posture (2026-08-09)

- Always store Amount + Currency
- One organization base currency in V1
- One project currency path in V1
- Multi-currency conversion deferred

Future needs (not V1):

- exchange rate used / date
- original vs base currency representation
- mixed-currency reporting

---

## 5. Budget model

Budgets may exist at multiple levels:

- Project
- Work package
- Cost category
- Phase (optional)

Budget types (conceptual):

- Cost budget
- Contract / commercial budget
- Hours budget
- Quantity budget (future)

Budget changes should be auditable. Whether budgets themselves are versioned is an open question.

---

## 6. Cost families (required in V1)

At least four families — all supported in V1 categorization:

### 6.1 Direct Project Cost

Costs caused by a specific project/package.

Examples: project materials, project subcontractor bills, project hours, project travel.

### 6.2 Shared Cost

Costs that serve multiple projects and should be allocated.

Examples: shared warehouse handling, shared specialist tools pool, shared supervision.

### 6.3 Business Overhead

General business expenses not naturally owned by one project.

Examples: rent, accounting, office internet, general insurance, marketing.

**Owner correction (2026-08-09):** overhead capability cannot be deferred from the product. Showing real project/business cost is a core purpose **when the user enters/allocates that data**.  
**Progressive complexity (2026-08-09):** organizations are not forced to configure overhead on day one; unused overhead must not be silently assumed as zero-complete true cost.

### 6.4 Asset / Capital Cost

Acquisition and holding of assets/vehicles/equipment.  
V1 supports categorization of related expenses; full asset registry module may still be later.

---

## 7. Expense records

An expense should support in V1:

- **fast minimal capture:** amount (+ currency), optional description/project/supplier
- supplier as: none | plain name | linked Vendor | create Vendor from transaction
- document/invoice link (optional)
- dates
- amounts (net/tax/gross as applicable; defaults from country/org where safe)
- payment method (as needed; advanced)
- category / cost family (optional enrichment)
- project / work package targeting **or** non-project / overhead targeting (WP defaults to project default package)
- allocation lines (split across projects/packages/overhead/categories) — advanced
- recurrence (monthly/quarterly/yearly/one-time/custom) for general business expenses
- approval status (if needed)
- audit history

Progressive disclosure: basic fields first; tax/allocation/documents behind “more details”.

### Split example

One invoice of 10,000 may split:

- 6,000 → Project A / Electrical (Direct)
- 3,000 → Project B / Plumbing (Direct)
- 1,000 → Business Overhead / Office supplies

---

## 8. Cost allocation

### Purpose

Distribute shared/overhead costs into projects (and optionally work packages) so Actual Cost / Forecast Profit reflect business reality.

### V1 methods (decided 2026-08-09)

Must support at least:

1. **Manual amount allocation**
2. **Manual percentage allocation**

V1 does **not** need the advanced Cost Allocation Engine.

### Future methods (architecture preserved)

- labor hours
- revenue / contract-value basis (label carefully)
- labor cost
- project duration
- headcount
- custom formulas

### Requirements

- Allocation method can evolve over time (effective-dated where relevant)
- Historical allocation runs remain explainable
- Users can understand “why was this cost applied to my project?”

---

## 9. Billing, payments, outstanding (V1 basic)

### Decided V1 depth (2026-08-09)

Not full statutory accounting / invoice issuance software.  
Still must record basic outgoing billing/payment tracking:

- billing / invoice record
- amount
- date
- project / change relation
- status
- payments received
- outstanding amount
- attached external invoice/document

### Separations

```text
Contract value (commercial)
  → Billing records (Invoiced)
    → Payments (Paid)
      → Outstanding
```

### Billing modes to support eventually

- Fixed price
- Hourly
- Daily
- Per unit
- Per quantity
- Per m² (or other unit)
- Percentage
- Retainer
- Milestones
- Mixed pricing

V1 may start with simple fixed/amount billing records and grow.

---

## 10. Profitability views (V1 language)

Prefer explicit formulas shown in UI.

### Example forecast profit framing (illustrative)

```text
Estimated / Forecast Profit ≈
  Current Contract Value
  − Estimated / Forecast Final Cost
```

Where Forecast Final Cost includes only inputs that exist/are configured:

- actual direct costs to date (if entered)
- remaining expected direct costs (if forecasting used)
- allocated shared/overhead (**only if allocation was applied**)
- workforce true cost (**only if workforce/time or equivalent labor costs exist**)

### Gross vs fully loaded

- Views based only on direct costs must be labeled as such
- Views including allocated shared/overhead must be labeled as fully loaded / true cost views

Never silently mix the two.

### Calculation / data coverage (progressive complexity)

Because modules are optional, metrics must explain completeness:

```text
Estimated profit based on entered data: …

Included:
✓ Direct expenses

Not included / not configured:
○ Workforce costs
○ Allocated overhead
```

Track conceptually: calculation basis, included families, missing/unconfigured inputs, timestamp, forecast assumptions.  
Do not invent a misleading completeness percentage without a defensible method. See `39`.

### Metrics readiness

- Planned profit
- Current / to-date position
- Forecast final profit
- Margin %
- Cost variance
- Commercial variance (contract vs pending vs invoiced)

---

## 11. Forecasting readiness (no AI required now)

Store enough facts to later detect:

- budget overrun risk
- hours overrun risk
- margin deterioration
- spend high vs progress low
- executed extra work not approved
- approved extras not invoiced
- unpaid billing records
- cash shortage risk

---

## 12. Overhead examples (business expenses)

Rent, warehouse, municipal taxes, utilities, phones, internet, bookkeeping, legal, insurances, software, advertising, bank fees, interest, financing, fuel, leasing, licenses, office supplies, and similar.

Support cadences:

- monthly
- quarterly
- yearly
- one-time
- custom recurrence

---

## 13. Financial integrity rules (product-level)

1. Approved financial artifacts should not be silently edited into a new truth without history.
2. Tax changes do not rewrite old billing/expense snapshots.
3. Rate changes do not rewrite old time entries’ historical cost basis without explicit re-open/recalc policy.
4. Currency must be visible whenever amounts are shown in mixed contexts.
5. Permissions may hide profitability from some roles while allowing cost entry.
6. Change Orders (not Change Requests alone) affect Current Contract Value.

---

## 14. Related documents

- Contracts & changes → `05-CONTRACTS-QUOTES-CHANGES.md`
- Workforce costing → `06-WORKFORCE-COSTS.md`
- Documents/expenses → `09-DOCUMENTS-EXPENSE-CAPTURE.md`
- Tax → `11-TAX-CONFIGURATION.md`
- Audit/integrity → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
- V1 money scope → `16-V1-SCOPE.md`
- Open questions → `18-OPEN-QUESTIONS.md`
