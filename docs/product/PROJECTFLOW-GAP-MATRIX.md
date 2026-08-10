# ProjectFlow — Gap Matrix

**Date:** 2026-08-11 · Updated after Master Completion Run  
Severity: **S1** owner-blocking · **S2** high friction · **S3** advanced/optional · **S4** foundation/deferred  
**Status:** CLOSED · PARTIAL · OPEN · DEFERRED

---

## A. Top product gaps (severity × impact) — completion status

| # | Gap | Sev | Area | Status |
|---|-----|-----|------|--------|
| 1 | Employee **edit** missing (domain exists) | S1 | Workforce | **CLOSED** — detail Edit panel |
| 2 | Employee list rate **“ללא תעריף”** vs detail rate (timezone `current_date`) | S1 | Workforce | **CLOSED** — org-date authority (`asOfDate`) |
| 3 | Employee **archive/inactive** not in UI | S1 | Workforce | **CLOSED** — archive / restore; soft-archive |
| 4 | Time entry **single day only** — no range/bulk/retrospective multi-day | S1 | Workforce | **CLOSED** — advanced expandable bulk + preview |
| 5 | Client **archive UI** missing | S2 | Clients | **CLOSED** — archive / restore + archived filter |
| 6 | Contact **edit UI** missing | S2 | Clients | **CLOSED** — contact edit + primary |
| 7 | Vendor **edit/archive UI** orphaned | S2 | Vendors | **CLOSED** — edit / archive / restore |
| 8 | Project/job **archive restore** advertised but not built | S2 | Projects | **CLOSED** — restore / reopen archive |
| 9 | Vendor bill **void/edit** not productized | S2 | AP | **CLOSED** — void (+ payments-first rule); no silent edit |
| 10 | Planning/Gantt **not mounted** | S3 | Planning | **CLOSED** — Project → לוח זמנים |
| 11 | Dated **subcontractor engagement** missing | S3 | Vendors | **CLOSED** — start/end engagement UX (0022) |
| 12 | AP **aging screen** missing | S3 | AP | **CLOSED** — `/procurement/ap/aging` |
| 13 | OCR / statutory invoicing / live bank feed | S4 | Integrations | **DEFERRED** — honest disabled foundations |

### Additional gaps closed in this run

| Gap | Status |
|-----|--------|
| Time void / correction lifecycle | **CLOSED** |
| Non-project time categories (optional) | **CLOSED** |
| Attendance optional layer (clock in/out, manager, self) | **CLOSED** |
| AP vendor credits + applications | **CLOSED** |
| PO cancel / close | **CLOSED** |
| Job Team parity | **CLOSED** (where workforce permitted) |
| Permission-aware Quick Create / nav attendance | **CLOSED** / **PARTIAL** (ongoing audit) |
| Assignment edit / cancel | **CLOSED** |

---

## B. Top UX / discoverability — status

| Gap | Discoverability |
|-----|-----------------|
| Employee edit / archive | **CLOSED** |
| Client archive | **CLOSED** |
| Contact edit | **CLOSED** |
| Vendor edit / archive | **CLOSED** |
| Planning/Gantt | **CLOSED** (Project → לוח זמנים; planning.read) |
| AP aging | **CLOSED** (from AP list → גיל יתרות) |
| Attendance | **CLOSED** (nav + workforce subnav; self for workers) |
| OCR review | **OPEN** (deep URL; feature off) |
| Imports | **PARTIAL** (Reports) |
| Banking | YES (Settings → Advanced) |
| Job Team tab | **CLOSED** (parity) |
| Schedule link → Details | **CLOSED** (dedicated schedule tab) |

---

## C. Top financial gaps — status

| Gap | Status |
|-----|--------|
| Vendor bill void | **CLOSED** |
| AP credits | **CLOSED** |
| Internal billing ≠ statutory | OK disclosure; issuance **DEFERRED** |
| Bank match ≠ payments | By design |
| Unallocated overhead / bill remainder | Visible; education remains |
| Attendance / engagement ≠ Actual | Enforced by domain (no Actual from those alone) |

---

## D. Top mobile gaps — status

| Flow | Status |
|------|--------|
| Edit employee / vendor / client archive | **CLOSED** |
| Multi-day time / bulk | **CLOSED** (advanced expandable) |
| Attendance clock large targets | **CLOSED** |
| Quick Create field/doc/attendance | **PARTIAL→improved** (permission-aware shortcuts) |
| Project Team on jobs | **CLOSED** |
| Banking / AP allocation / monthly cost | Advanced (intentional) |

---

## E. Edit / Delete / History — status after completion

| Object | Edit after create | Delete | Archive/Restore | Void/Correct | Notes |
|--------|-------------------|--------|-----------------|--------------|-------|
| Employee | **Y** | N | **Y/Y** | — | Soft archive preferred |
| Client | **Y** | N | **Y/Y** | — | |
| Contact | **Y** | Soft remove | — | — | |
| Vendor | **Y** | N | **Y/Y** | — | |
| Project | Y | N | **Y/Y** | — | Status ≠ archive |
| Time | N (immutable) | N | — | **Void / correct** | Bulk create |
| Expense | Draft | N | — | Void chain | |
| AP Bill | N silent | N | — | **Void**; **Credit** | |
| Assignment | **Y** (dates) | Cancel | End | — | ≠ Actual |
| Attendance | Manager correct | Void day/event | — | Replace/void | ≠ Actual |
| Planning | Y | Soft | — | — | Optional |
| Engagement | End/cancel | N | — | — | ≠ Actual |

---

## F. Remaining genuine gaps (post master run)

| Gap | Sev | Notes |
|-----|-----|-------|
| OCR / live bank / statutory invoice providers | S4 | Foundations only — do not fake |
| XLSX bank import in recon UI | S3 | CSV path exists |
| Billing draft dedicated edit page | S3 | Thin UI |
| Attendance-only user provisioning UX polish | S3 | Uses `attendance.self` + link employee |
| Full permission-UI audit residue | S3 | Server still mandatory |
| Open project repeated latency target &lt;700ms | S2/perf | Continuous; measure at final gate |
| Critical-path calculation | S4 | Explicit limitation in planning UI |

---

## G. Optionality checklist

| Principle | Status |
|-----------|--------|
| Compensation optional | **OK** (list/detail agree when used) |
| Assignments optional | **OK** |
| Attendance optional | **OK** — zero setup if unused |
| Monthly allocation optional | **OK** |
| Vendor engagement / split optional | **OK** |
| Gantt optional | **OK** — tab gated by planning.read |
| Banking optional | **OK** |
| Daily ops stay simple | **Improved** — advanced panels remain expandable |

---

## H. Database

| Item | Status |
|------|--------|
| New migration | `0022_master_completion_foundations`, `0023_attendance_rls_and_role_backfill` |
| 0000–0021 modified | **NO** |
| Applied to owner Supabase | **NO** (owner applies later) |
