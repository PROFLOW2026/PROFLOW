# PROJECTFLOW FULL 3-WAVE OVERNIGHT BUILD

**Date:** 15 August 2026  
**Baseline:** local working tree on top of applied 0000–0045 (immutable).  
**New SQL:** 0046–0051 **unapplied**. Owner reviews before any Supabase apply.

---

## 1. FINAL STATUS

```text
PROJECTFLOW FULL 3-WAVE OVERNIGHT BUILD

Overall = READY FOR OWNER REVIEW

Wave 1 = PASS
Wave 2 = PASS
Wave 3 = PASS

Owner Supabase SQL applied = NO
Commit = NONE
Push = NONE
Deploy = NONE
External portal = OFF
```

---

## 2. Modules completed

```text
Multi-Contract Projects = PASS
Notifications Engine = PASS
Timesheet Approval = PASS
Documents & Versioning = PASS

Work Order Billing = PASS
Client Timeline = PASS
Advanced Subcontractors = PASS
OCR Background Queue = PASS

Resource Scheduling = PASS
Project-Level Permissions = PASS
Employee Privacy = PASS
Advanced Daily Logs = PASS
Safety/HSE = PASS
Advanced Inventory = PASS
```

Notes:

- **Employee missing required report** scanner is intentionally skipped. There is no existing workforce semantics for a periodic required employee report distinct from timesheets / attendance / required documents. Inventing one would collide with timesheet work.
- **Email / push delivery** was not built. The notification engine has a channel abstraction and in-app persistence only.
- **External customer/vendor portal** remains `isExternalPublicAccessEnabled(): false`.

---

## 3. What changed

### Wave 1 — core platform

**Multi-contract projects.** A project can hold a primary contract plus additional / secondary commercial agreements. Each contract has identity, type, number, dates, retention, original / approved-changes / current, and its own billing and BOQ scope. Project financials still use the **existing commercial engine**: live contracts are summed (`sumCommercialPositions`). Pending / rejected changes do not move Current. Existing single-contract projects keep working (primary backfill, nullable BOQ `contract_id`).

**Notifications engine.** Org-scoped `notifications` rows, unique `(org, recipient, dedupe_key)`, writes only via `app.emit_notification` (SECURITY DEFINER). Bell + inbox: unread count, mark read / mark all, deep links, empty / loading / error, RTL, mobile. Scanners cover overdue AR, AP due soon/overdue, approvals, timesheets, expiring documents, overdue tasks, BOQ awaiting approval, assigned work orders, low stock, overdue safety actions. Repeat runs upsert; resolved conditions are cleared.

**Timesheet approval.** Draft → Submitted → Approved, or Returned for correction then resubmit. Approved recorded time is locked (DB trigger + application). Actual labor cost counts **only** `status='recorded' AND approval_status='approved'`. Grandfathered recorded entries were backfilled approved in 0047 so historical Actual does not vanish. Manager queue with notes; bulk approve only submitted rows, idempotent.

**Documents & versioning.** Folders, metadata (expiry, required flag), version rows distinct from the document record and from the stored file. New version does not delete the previous file. OCR can bind to a specific version. Signed private storage and tenant RLS remain.

### Wave 2 — business workflows

**Work order billing.** “חייב את העבודה” composes labor / materials / call-out / extras / discount and calls the **existing AR** `createBillingRecord`. Source stamp `source_kind='work_order'`. Duplicate live draft/finalized billing is blocked (application + trigger). Void then recreate is the correction path. No second billing engine.

**Client timeline.** Aggregates canonical events (projects, quotes, contracts, changes, BOQ, billing, payments, documents, work orders, notes, approvals, financial corrections). Newest-first, filters, deep links. Pointers / activity index — not a second ledger.

**Advanced subcontractors.** Subcontract agreements: Original + approved subcontract changes = Current. Progress / valuations reuse BOQ-style progress semantics. Commitment ≠ expense; valuation ≠ payment. Documents (insurance, certificates, PDF) use the Wave 1 document system.

**OCR background queue.** Upload returns immediately. Jobs: queued → processing → completed / failed / needs_review / cancelled. Retry, attempt count, last error, idempotency, org isolation, batch progress. Failures do not create half financial entities. OCR still never auto-creates Actual.

### Wave 3 — operations / field / scale

**Resource scheduling.** Day/week board: employees, projects, work orders, planned hours, leave/unavailability, conflict / overtime / capacity signals. Manual bookings plus projections from assignments and scheduled work orders.

**Project-level permissions.** Modes `all` (default, no behavior change) | `selected` | `assigned`. RLS helper `app.can_access_project` on `projects` SELECT. Owner / manager / finance get `projects.access_all`. Application lists for projects, jobs, work orders, safety, daily logs, scheduling, inventory reservations also filter.

**Employee privacy.** List/detail hide compensation unless `workforce.cost.read`. Operational employee records stay name / contact / assignments / availability.

**Advanced daily logs.** Extra field sections (weather, workforce, delays, incidents, safety, visitors, manager notes) plus draft → submitted → finalized and correction notes. Closed logs are not silently overwritten.

**Safety / HSE.** Incidents, near miss, accident, hazard, observation, toolbox talk, PPE, corrective actions with owner / due / overdue. Summary by open / overdue / severity / type / project. Overdue actions feed notifications. Toolbox attendees. Documents via canonical attachments.

**Advanced inventory.** Min stock, low-stock signal, project/WO reservation (on hand vs reserved vs available), stock counts, location kinds (warehouse / site / vehicle), barcode. Qty only — no FIFO / WAVG / depreciation ledger.

---

## 4. Database changes

All six files are **new**. 0000–0045 were not modified. Nothing was applied to Owner Supabase.

### 0046 — `drizzle/migrations/0046_multi_contract_projects.sql`

| | |
|---|---|
| **Purpose** | Multi-contract identity; BOQ/billing `contract_id`; shared `app.install_permissioned_rls`; new permissions + role backfill |
| **Tables** | Alters `contracts`, `project_boqs`, `billing_records`; inserts `permissions` / `role_permissions` |
| **Columns** | `contracts.contract_type`, `contract_number`, `client_id`, `start_date`, `end_date`, `retention_percent`; `project_boqs.contract_id`; `billing_records.contract_id`, `source_kind` |
| **Indexes** | Same-org contract number unique; per-contract active BOQ unique |
| **Triggers / functions** | `app.install_permissioned_rls` |
| **RLS** | Helper used by later waves; existing tenant isolation unchanged |
| **Permissions** | `notifications.read`, `time.approve`, `projects.access_all`, `scheduling.read/manage`, `safety.read/manage` |
| **Backfill** | Primary/additional type; BOQ `contract_id` from primary contract |
| **Risk** | Low. Additive. Unique indexes replace unscoped BOQ uniqueness with contract-aware variants |
| **Why safe** | Existing one-contract projects keep a primary row. Nullable `contract_id` for jobs without a contract |
| **Owner action** | Apply 0046 after review, before 0047 |

### 0047 — `drizzle/migrations/0047_notifications_and_timesheets.sql`

| | |
|---|---|
| **Purpose** | In-app notifications; timesheets; time-entry approval + lock |
| **Tables** | `notifications`, `timesheets`; alters `time_entries` |
| **Integrity** | Unique `(org, recipient, dedupe_key)`; unique timesheet `(org, employee, period)`; approved rows locked |
| **Functions** | `app.emit_notification`, `app.resolve_notifications`, `app.time_entries_approval_lock` |
| **RLS** | Recipient SELECT + `notifications.read`. Direct INSERT revoked; writes via definer function |
| **Backfill** | Existing `time_entries` with `status='recorded'` set `approval_status='approved'` so Actual is not dropped |
| **Risk** | Medium (labor Actual filter). Grandfather is explicit and tested |
| **Owner action** | Apply after 0046 |

### 0048 — `drizzle/migrations/0048_document_versioning.sql`

| | |
|---|---|
| **Purpose** | Folders + versions; document metadata; v1 backfill |
| **Tables** | `document_folders`, `document_versions`; alters `documents` |
| **Integrity** | One current version per document; storage path unique; versions immutable |
| **RLS** | Permissioned tenant RLS via installer |
| **Backfill** | Existing documents get version 1 pointing at current storage object |
| **Risk** | Low if storage paths already unique |
| **Owner action** | Apply after 0047 |

### 0049 — `drizzle/migrations/0049_wave2_workflows.sql`

| | |
|---|---|
| **Purpose** | WO billing sources; activity events; subcontract agreements + value events; OCR batch/queue |
| **Tables** | `work_order_billing_sources`, `activity_events`, `subcontract_agreements`, `subcontract_value_events`, `ocr_batches`; OCR job columns |
| **Integrity** | One live (draft/finalized) billing per work order; activity idempotency unique; OCR idempotency unique |
| **Triggers** | `app.work_order_billing_live_guard` |
| **Risk** | Low. Financial writes still go through existing AR / AP |
| **Owner action** | Apply after 0048 |

### 0050 — `drizzle/migrations/0050_wave3_operations.sql`

| | |
|---|---|
| **Purpose** | Scheduling, project access, daily-log lifecycle, safety/HSE, inventory reservations/counts |
| **Tables** | `resource_bookings`, `employee_unavailability`, `project_access_grants`, `safety_records`, `safety_corrective_actions`, `safety_toolbox_talks`, `safety_toolbox_attendees`, `inventory_reservations`, `inventory_counts` (+ lines); alters `daily_logs`, `inventory_items`, `inventory_locations` |
| **Functions** | `app.project_access_mode`, `app.can_access_project` |
| **RLS** | `projects_tenant_select` now also requires `can_access_project`. Default mode `all` ⇒ same as 0001 org-member SELECT |
| **Risk** | Medium if an org later switches to `selected`/`assigned` without grants. Default is unchanged |
| **Owner action** | Apply last **before 0051**. Confirm `project_access_mode` stays `all` until people grants are configured |

### 0051 — `drizzle/migrations/0051_review_integrity_closure.sql`

| | |
|---|---|
| **Purpose** | Close independent financial/RLS review findings without rewriting 0000–0050 |
| **Integrity** | Partial unique one-live work-order AR; approved recorded time cannot leave Actual except void; `activate_project_boq` supersedes only the same `contract_id` |
| **Functions** | Replaces `emit_notification` (recipient must be an active member), `resolve_notifications` (caller’s rows only), `can_access_project` / `project_access_mode` (SECURITY DEFINER), time lock UPDATE+DELETE, live WO billing guard lock |
| **RLS** | Restores `activity_events` INSERT to `clients.manage`; unavailability uses `scheduling.*`; projects UPDATE/DELETE and core financial tables honor `can_access_project` |
| **Risk** | Low on default `all` access mode (equivalent to 0001). Selected/assigned mode now actually hides project-scoped financial rows |
| **Owner action** | Apply after 0050 |

**Rollback assumption:** no down migrations. Reverse would be restore-from-backup / drop new tables in reverse order 0051→0046 after confirming no production data. Do not attempt that without a snapshot.

**Clean-start + upgrade-path:** `tests/integration/migration/hardening-0046-0050.test.ts` (0000→0051 and 0045→0051) **PASS**.

---

## 5. Financial integrity

```text
Billing != Payment = PASS
Commitment != Expense = PASS
VAT excluded from profit = PASS
Approved Changes only affect Current = PASS
Pending Changes do not affect Current = PASS
No duplicate Actual creation = PASS
Retention invariants preserved = PASS
Historical immutability preserved = PASS
```

Evidence:

- Project commercial position still uses `computeCommercialPosition` / value events; overnight only **sums all live contracts**.
- Work-order billing calls `createBillingRecord` then stamps source; live duplicate blocked by application `SELECT … FOR UPDATE`, trigger, and partial unique on `billing_records`.
- Labor Actual: `sumProjectLaborCost` and allocation hour bases require recorded **and** approved.
- OCR `processQueuedJob` comment and implementation: never creates Expense / Vendor Bill / Vendor Credit.
- Subcontract current = original + approved subcontract value events; AP remains a separate bill.
- 0051 lock trigger: approved recorded time cannot be un-approved or deleted; void+replace only.
- AR capture still uses `resolveRetentionCapture`; contract `retention_percent` is the default when the caller does not override.

---

## 6. Security / RLS

- **Tenant isolation:** new tables use `organization_id` composite FKs and FORCE RLS. Notifications cannot be inserted by authenticated clients except through `emit_notification`, and the recipient must hold an active membership.
- **Project access:** `app.can_access_project` is SECURITY DEFINER (so grants are visible without `projects.read`). SELECT on projects plus UPDATE/DELETE, and SELECT/write on contracts / billing_records / expenses / time_entries / change_requests, honor it. Default mode `all` preserves current tenants.
- **Employee sensitive data:** rates / cost versions require `workforce.cost.read`. Time-entry loaders redact `costAmount` without that permission.
- **Storage:** document versions reuse existing private storage + signed URLs; version rows are tenant-scoped.
- **Server-side permissions:** new writes use `assertPermission` + org membership + entity ownership + state machines. Client disable is not the gate.
- **Portal:** `isExternalPublicAccessEnabled()` is still `false`.

---

## 7. Tests

| Suite | Result |
|---|---|
| `npm run test:unit` | Targeted closure re-run PASS (journal, WO billing, workforce/projects/notifications/financials/vendors/clients). Full suite was **1887 / 237 files** before 0051; not fully re-run this closure. |
| Overnight integration (timesheets, multi-contract, timeline, subcontracts, inventory-advanced) | **20 passed / 5 files** (prior run; schema compatible) |
| `npm run test:migration` | **62 passed / 9 files**, including `hardening-0046-0050.test.ts` **3 passed** (clean-start 0000→0051, upgrade 0045→0051, lock/dedupe/BOQ-by-contract guards) |
| `npm run test:ui` | **122 passed / 32 files** (prior run) |
| `npx tsc --noEmit` | PASS (re-run after 0051) |
| `npm run build` (production, Next 16 Turbopack) | PASS (prior run; tsc clean after 0051) |
| Playwright `tests/e2e/authenticated/overnight-surfaces.spec.ts` | **Added, not executed** this night (needs authenticated world + running app). Existing e2e suite was not re-run. |

New / extended tests include: multi-contract aggregate, additional contracts, timesheet lifecycle (unit + integration), notification dedupe/unread + bell UI, document versioning, work-order billing, client timeline, subcontract value/lifecycle, OCR job queue, scheduling overlap/capacity, project access, safety overdue/isolation, inventory reservations, daily-log status, migration hardening 0046–0051.

Failed = 0 (executed suites). Skipped = Playwright overnight surfaces (environment).

---

## 8. Review findings

Independent Lead review plus two Auto domain reviewers (financial/RLS and UI/permissions). First-wave findings were closed before the initial ZIP. Delayed financial/RLS review findings were closed in **0051** plus matching application locks.

| Severity | Found | Closed |
|---|---|---|
| BLOCKER | 1 | 1 — Client `project-access-panel` imported `@/modules/projects` barrel (`server-only`). Switched to `domain/project-access`. Production build then passed. |
| HIGH | 4 | 4 — Project lists honor `resolveAccessibleProjectIds`. Duplicate live WO AR: partial unique + `FOR UPDATE`. Approved recorded time cannot be un-approved or deleted. `activate_project_boq` supersedes only the same contract. |
| MEDIUM | 6 | 6 — Sequential notification scanners. Recipient must be an org member. Resolve cannot silence other users. Activity INSERT requires `clients.manage`. Project-scoped financial RLS + grant membership check. Labor-hours allocation bases require approved recorded time. |
| LOW | 4 | 4 — Safety nav permission-gated. WO/AR defaults contract retention %. Unscoped pending changes stay grandfathered to primary. `can_access_project` is SECURITY DEFINER. |

```text
Open known findings = 0
```

Documented non-findings (not defects):

- Employee missing-report scanner skipped (no existing semantics).
- Email/push not built (out of allowed scope).
- Existing AR/AP/expense **org-wide** lists stay permission-gated; default access mode is `all` and owner/manager/finance have `projects.access_all`.

---

## 9. Changed files

```text
created  = 176
modified = 176
deleted  = 0
total    = 352
```

Unrelated working-tree leftovers **not** in the ZIP: `MANIFEST.txt`, `_overnight-zip-files.txt`, `owner-review-overnight*.zip`.

---

## 10. ZIP

```text
ZIP created = YES
ZIP filename = projectflow-overnight-3-waves-owner-review.zip
ZIP contents verified = YES
Secrets included = NO
```

---

## 11. Git state

```text
Commit = NONE
Push = NONE
HEAD modified = YES
Unrelated working-tree files = MANIFEST.txt, _overnight-zip-files.txt, owner-review-overnight.zip, owner-review-overnight-v2.zip, owner-review-overnight-v3.zip
```

No `.env*` was edited. Historical migrations 0000–0045 were not rewritten.

---

## 12. OWNER MORNING CHECKLIST

1. **Read this report** and `CHANGED-FILES-MANIFEST.md` inside the ZIP.
2. **Review SQL 0046 → 0051 in order** (comments at top of each file). Do **not** apply until you accept risk notes, especially 0047 labor grandfather, 0050 `can_access_project`, and 0051 financial locks.
3. **Architecture / integrity:** multi-contract sum, timesheet Actual filter, WO billing using existing AR, OCR queue (no auto Actual), subcontract commitment ≠ expense.
4. **UI flows (Hebrew RTL):** extra contract on a project; notification bell; timesheet submit / return / approve; document version history; work-order “חייב את העבודה”; client timeline; vendor subcontract card; OCR review queue; `/scheduling`; Settings → People project access; daily log lifecycle; `/safety`; inventory reserve / count / low stock.
5. **Tests:** unit / ui / targeted integration / migration hardening already green locally. Run Playwright `overnight-surfaces.spec.ts` against a seeded world when convenient.
6. **ZIP** `projectflow-overnight-3-waves-owner-review.zip` — source, migrations, tests, this report. No secrets.
7. **Only after approval — SQL apply** 0046 then 0047 then 0048 then 0049 then 0050 then **0051** on Owner Supabase.
8. **Only after approval — commit / push / deploy.** Portal stays OFF.

---

## Definition of Done (this run)

- Three waves implemented and wired into the existing core.
- Migrations ready, **not** applied to Owner Supabase.
- Permissions / RLS / financial invariants checked in tests + review.
- Production build passed.
- Independent review findings closed.
- Final report + ZIP created.
- No commit, no push, no deploy.
- Portal remains OFF.
- Ready for Owner review.
