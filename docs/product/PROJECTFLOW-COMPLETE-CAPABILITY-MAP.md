# ProjectFlow — Complete Capability Map

**Status:** UPDATED after Master Completion Run (2026-08-11)  
**Rule:** Schema ≠ usable. USER-USABLE = reachable and operable from UI.  
**Companion docs:** Gap Matrix · Lifecycle Matrix · Navigation Map · Master Completion Report

---

## Product principle (owner)

- Initial setup may be detailed.
- Daily operation must stay **simple**.
- Advanced functions must be **optional**.
- Customers must not be forced to maintain compensation, assignments, monthly allocation, vendor splits, Gantt, attendance, OCR, banking, or advanced financial setup unless they choose to.

---

## 1. Clients / CRM / Contacts

| Area | Status | Notes |
|------|--------|-------|
| Client directory | **COMPLETE** | Create / view / full edit (incl. address). Soft archive + restore + archived filter. No hard delete with history. |
| Contacts | **COMPLETE** | Add / **edit** / remove / mark primary. |
| Project-specific contact | **COMPLETE** | `projects.primary_contact_id`. |
| Linked projects | **COMPLETE** | Client detail shows linked project list. |
| CRM | **COMPLETE** (optional module) | Separate from Clients. |

**Permissions:** `clients.read` / `clients.manage`

---

## 2. Projects + Jobs

| Area | Status | Notes |
|------|--------|-------|
| Shared model | **COMPLETE** | `work_kind` project\|job. |
| Edit / archive / restore | **COMPLETE** | Archive ≠ completed/cancelled status. |
| Team (projects + jobs) | **COMPLETE** | Workforce optional; Team when `workforce.read`. |
| Planning / Gantt | **COMPLETE** (optional) | Project → **לוח זמנים**; mobile list/progress; jobs not forced. |
| Financial tabs | **COMPLETE** | Permission/module gated. |

---

## 3. Employees / Workforce / Compensation

| Area | Status | Notes |
|------|--------|-------|
| Employee CRUD UI | **COMPLETE** | Edit master fields; soft archive / restore; Active/Inactive/Archived. |
| Rate list vs detail | **COMPLETE** | One org-date authority — list/detail/monthly agree. |
| Compensation | **COMPLETE** (optional) | Monthly/hourly/daily; effective from/until; history; employer cost estimate / monthly apply. No net payroll. |
| Assignments | **COMPLETE** | Create / edit dates / end / cancel; history; ≠ Actual; multi-project OK. |
| Time entry | **COMPLETE** | Simple day default; advanced range/bulk/weekday/preview; non-project categories optional; void/correct. |
| Attendance | **COMPLETE** (optional) | Clock in/out; manager manual; retro correct; `attendance.self` worker mode. ≠ project time; ≠ Actual alone. |

---

## 4. Vendors / Subcontractors / Engagements

| Area | Status | Notes |
|------|--------|-------|
| Vendor edit / archive / restore | **COMPLETE** | No hard delete with financial history. |
| Dated engagements | **COMPLETE** | Vendor↔Project start/end; end/cancel; history. **Engagement ≠ Actual.** |
| Project contractors panel | **COMPLETE** | Optional. |

---

## 5. AP / Procurement

| Area | Status | Notes |
|------|--------|-------|
| Vendor bills | **COMPLETE** | Create / match / allocate / pay. |
| Bill void | **COMPLETE** | Preserve history; payments-first rule. |
| Vendor credits | **COMPLETE** | Credit + apply; not fake negative payments. |
| AP aging | **COMPLETE** | Current / 1–30 / 31–60 / 61–90 / 90+. |
| PO lifecycle | **COMPLETE** | Issue / cancel / close; commitment cleared on cancel. |

---

## 6. Expenses / Billing / Banking / Integrations

| Area | Status | Notes |
|------|--------|-------|
| Expenses | **COMPLETE** | Draft edit → finalize → void/correct. |
| Billing / AR | **COMPLETE** | Void / credit notes exist; statutory issuance **DISABLED** foundation. |
| Banking | **COMPLETE** (optional advanced) | Import/match; no live bank-feed provider. |
| OCR / statutory invoice / live bank | **FOUNDATION / DISABLED** | Honest — not fake. |

---

## 7. Planning

| Area | Status | Notes |
|------|--------|-------|
| Project schedule tab | **COMPLETE** | Tasks, dates, progress, milestones, dependencies; cycle blocked. |
| Mobile | **COMPLETE** | Simplified list/timeline — not forced desktop Gantt. |
| Jobs | **OPTIONAL** | Not forced. |

---

## 8. Mobile / Permissions / Quick Create

| Area | Status | Notes |
|------|--------|-------|
| Quick Create | **COMPLETE** | Permission/module aware (expense, time, employee, bill, field log, document, attendance, maintenance…). |
| Permission-aware UI | **IMPROVED** | Unauthorized actions hidden where audited; server still mandatory. |
| Worker finance protection | **COMPLETE** | No billing/clients/vendors/AP; attendance.self allowed. |
| Press feedback | **COMPLETE** | Preserve global patterns on new controls. |

---

## 9. Financial integrity (cross-cutting)

| Concept | Rule |
|---------|------|
| Assignment | No Actual |
| Attendance | No Actual alone |
| Time | Provisional labor per existing model; monthly true cost may displace — no double count |
| Engagement | No Actual |
| PO | Commitment only |
| Vendor bill | Recognition = Actual |
| Payment | Cash only |
| Credit | Reduces economic cost + outstanding |
| Unallocated | Remains visible at org level |

---

## 10. Database

| Item | Value |
|------|-------|
| Immutable | Migrations **0000–0021** |
| New | **0022_master_completion_foundations**, **0023_attendance_rls_and_role_backfill** |
| Owner DB apply | **NO** in this run |

---

## Explicit owner answers (post completion)

| Question | Answer |
|----------|--------|
| Edit employee / client / vendor / contact after create? | **Yes** |
| Archive / restore master records? | **Yes** (soft) |
| Multi-day / retro time? | **Yes** (advanced mode) |
| Attendance optional? | **Yes** |
| Subcontractor dated on projects? | **Yes** |
| Void bill / credit / aging? | **Yes** |
| Planning visible? | **Yes** when `planning.read` |
| Can basic customer ignore advanced features? | **YES** |
