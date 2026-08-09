# 06 — Workforce & Labor Costs

**Status:** Draft with owner decisions applied  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Define how employees/workers, employment types, rates, employer burden, time tracking, and true labor cost are modeled.

---

## 2. Goals

1. Track who works on what **when the organization chooses workforce depth**.
2. Capture time against project structure and non-project codes.
3. Calculate labor cost beyond naive base wage when employee-level costing is used.
4. Preserve rate history with effective dates.
5. Support future payroll integrations without becoming payroll software in V1.
6. Remain fully skippable under progressive complexity (`39`).

---

## 2.1 Usage modes (DECIDED posture 2026-08-09)

| Mode | Description |
|------|-------------|
| **A — No workforce tracking** | Project costs come from expenses/subs/etc.; Employees/Timesheets not emphasized in nav |
| **B — Generic labor cost** | User records labor as an amount (e.g. expense `Labor = 8,000`) without Employees |
| **C — Employee-level costing** | Employees → rates → burden → time → WorkPackage → True Cost |

Organizations may move A → B → C later without deleting projects/expenses.

Do **not** require Employees merely because workforce capability exists.  
Do **not** show “Employees: 0 — action required” when unused.

---

## 3. Employee / Worker

### Meaning

An optional workforce record belonging to an organization.

May optionally link to a User login, but must not require it (link policy still OPEN — `E2`).

### Examples of employment styles

- Hourly
- Daily
- Monthly / salaried
- Contractor-style internal engagement
- Other custom types

### Conceptual attributes

- Identity / contact
- Employment type
- Status (active/inactive)
- Default role/title
- Cost settings
- Documents (ID, agreements — country sensitive)
- Assignments to projects
- Equipment/vehicle responsibilities (later)

---

## 4. True Cost / Fully Loaded Cost

### Intent

Estimate what an hour/day of work really costs the business.

### Decided V1 depth (2026-08-09)

V1 must support more than base wage only:

- base hourly / daily / monthly cost
- simple employer burden / loaded percentage
- optional additional cost components
- effective dates
- historical rate integrity

V1 is **not** payroll / statutory payroll software.

### Architecture readiness for richer components (later or optional now)

- overtime
- travel
- bonuses
- employer costs (detailed)
- leave burden
- insurance
- vehicle
- phone
- equipment
- training
- custom components

### Formula philosophy (not final formula)

```text
True labor cost ≈
  base cost
  + employer burden / loaded %
  + optional additional components
  (+ allocated worker-related overhead later if configured)
```

Exact composition will vary by country pack and organization configuration.

---

## 5. Effective-dated rates

Rates and cost parameters must be dated.

Example:

```text
Until 2026-08-31: 110 / hour + burden 30%
From 2026-09-01: 125 / hour + burden 32%
```

Rules:

- Future change does not rewrite historical entries by default
- Time entry cost basis should be explainable for the date worked
- Need a policy for corrections/recalculations when a past rate was wrong

### Correction policy fork (still OPEN — `E3`)

- **Option A:** Recalculate affected entries when past rate is corrected  
- **Option B:** Keep old calculations; create adjustment entries  
- **Recommendation:** Option B for audit clarity; allow controlled recalculation tools later  
- **OWNER DECISION REQUIRED**

---

## 6. Time tracking

### Project-linked time (aligned to V1 hierarchy)

Workers should be able to report time against:

- Project
- Work package (mandatory target level for project work)
- Phase (optional, when used)

Task/Activity depth is deferred with WBS.

### Non-project time

Supported codes (examples):

- Office
- Warehouse
- Training
- Travel
- Management
- General work

Non-project time still matters for true cost and overhead.

### Time entry attributes (conceptual)

- Worker
- Date
- Duration / start-end
- Target (project tree or non-project code)
- Billable flag (optional/policy)
- Notes
- Approval status (optional)
- Cost snapshot / rate reference (for historical integrity)

---

## 7. Billable vs cost time

A time entry can be:

- costly to the business
- billable to a client
- both
- neither (internal)

Do not assume every timed hour is billable.  
Do not assume non-billable hours have zero cost.

---

## 8. Overtime and special pay

Future-ready concepts:

- overtime multipliers
- weekend/holiday rules
- travel time rules
- minimum call-out fees
- night shifts

These are highly local and should be configuration/country-pack sensitive.  
Avoid hardcoding Israeli labor law into core.

V1 may allow optional additional components without a full rules engine.

---

## 9. Permissions implications

Typical patterns:

- Worker: create own time entries
- PM: view team time on assigned projects
- Finance/Owner: view cost amounts
- Worker often **cannot** see profitability or fully loaded rates

See `12-USERS-ROLES-PERMISSIONS.md`.

---

## 10. Mobile/field UX implications

Time entry must be fast on phone:

- few taps
- recent projects first
- defaults from last entry
- offline later (roadmap)

No native app required for V1 if responsive web is good enough.

---

## 11. V1 scope (updated)

In V1 **capability** (optional usage):

- employee records (when Mode C is used)
- hourly, daily, and monthly types
- effective-dated base rate
- simple employer burden / loaded percentage
- optional additional cost components
- time entries to project + work package (+ optional phase)
- non-project codes (small preset list + custom)
- historical integrity for rates/cost snapshots
- Mode A/B remain valid (no employees required)

Defer:

- full benefits administration
- statutory payroll filings
- complex union rules
- automatic leave accounting
- biometric attendance
- full overtime legislation engine

---

## 12. Related documents

- Financial model → `04-FINANCIAL-MODEL.md`
- Permissions → `12-USERS-ROLES-PERMISSIONS.md`
- Effective dating / audit → `13-AUDIT-HISTORY-DATA-INTEGRITY.md`
- V1 scope → `16-V1-SCOPE.md`
- Roadmap → `17-FUTURE-ROADMAP.md`
- Open questions → `18-OPEN-QUESTIONS.md`
