# ProjectFlow — Money Format + Notification Audit (2026-09-16)

## Implementation summary

### Global money display
- **Canonical formatter:** `formatMoney` / `formatMoneyDisplay` / new `formatMoneyString` in `src/shared/money/format.ts`
- **UI component:** `MoneyText` (`src/components/patterns/money-text.tsx`)
- **Max decimal places:** 2 (currency minor units; JPY = 0 per `displayScaleFor`)
- **DB/calc precision:** unchanged (`numeric(18,6)`)

### Inactive work removal
- **Key removed:** `stale_project` (Command Center source type)
- **Hebrew copy removed:** "בדיקת עבודה לא פעילה" / "אין עדכונים כבר 14+ ימים"
- **Collector removed:** `collectStaleProjects` from `collect-sources.ts`
- **SQL required:** NO — runtime collectors only; no persisted notification rows for this type

---

## Notification architecture (two channels)

1. **Persisted notifications** — `notifications` table, emitted by `runNotificationScan()` scanners in `scan-conditions.ts`. Types in `NOTIFICATION_EVENT_TYPES`.
2. **Action-required (Command Center)** — live collectors in `collect-sources.ts` + `collect-next-gen.ts` + `collect-owner-payments.ts`. Shown on `/today` and merged into notification bell as synthetic `action_required` items (`cc:{itemKey}`).

Bell merge: `listMergedNotificationInbox()` — Command Center items first; persisted items with duplicate deep links deduped.

---

## Persisted notification types (17 active scanners + 1 skipped)

| Key | Hebrew title (template) | Severity | Source | Trigger | Dedup | Resolution | Bell | Dashboard | Owner action | Actionable? |
|-----|-------------------------|----------|--------|---------|-------|------------|------|-----------|--------------|-------------|
| `billing_overdue` | חיוב לקוח באיחור | urgent | billing | Finalized billing with outstanding balance past due | per record + recipient | Record paid/closed | yes | via scan | Collect payment | yes |
| `ap_overdue` | חשבון ספק באיחור | urgent | ap | AP bill past due date with outstanding balance | per bill + recipient | Paid/cleared | yes | via scan | Pay vendor bill | yes |
| `ap_due_soon` | חשבון ספק מתקרב לפירעון | warning | ap | *(type exists; scanner currently resolves stale only — not emitted in current `scanApDue`)* | — | — | — | — | — | — |
| `approval_waiting` | ממתין לאישור | warning | approvals | Pending approval request | per request + recipient | Approved/rejected | yes | via scan | Decide approval | yes |
| `timesheet_waiting` | גיליון שעות ממתין | warning | workforce | Submitted timesheet awaiting approval | per timesheet + recipient | Approved/rejected | yes | via scan | Approve timesheet | yes |
| `employee_missing_report` | חסר דיווח שעות | — | workforce | **SKIPPED** — no scanner implementation | — | — | no | no | — | — |
| `document_expiring` | מסמך שפג תוקף בקרוב | warning | documents | Document expiry within window | per document + recipient | Renewed/replaced/expired | yes | via scan | Renew document | yes |
| `task_overdue` | משימה באיחור | warning | planning | Planning work item past target end | per item + recipient | Updated/closed | yes | via scan | Update plan item | yes |
| `boq_awaiting_approval` | כתב כמויות ממתין לאישור | warning | boq | BOQ progress batch pending approval | per batch + recipient | Approved/rejected | yes | via scan | Approve BOQ measurement | yes |
| `work_order_assigned` | שובצת לקריאת שירות | info | service | Work order assigned to user | per WO + assignee | WO closed | yes | via scan | Handle work order | yes |
| `punch_assigned` | שובצת לפריט תיקון | info | field_ops | Punch item assigned to user | per item + assignee | Item closed | yes | via scan | Fix punch item | yes |
| `low_stock` | מלאי נמוך | warning | inventory | On-hand below min/reorder threshold | per item + recipient | Restocked/adjusted | yes | via scan | Reorder/restock | yes |
| `safety_action_due` | פעולה בטיחות לטיפול | urgent | safety | Corrective action past due | per action + recipient | Completed | yes | via scan | Complete safety action | yes |
| `warranty_expiring` | אחריות שעומדת לפוג | warning | warranty | Warranty end date approaching | per coverage + recipient | Extended/accepted | yes | via scan | Review warranty | yes |
| `closeout_blockers` | סגירת פרויקט חסומה | warning | closeout | Project closeout has blockers | per project + recipient | Blockers cleared | yes | via scan | Clear blockers | yes |
| `communication_failed` | הודעה לא נשלחה | warning | communications | Outbound message failed | per message + recipient | Retried/sent | yes | via scan | Retry/fix message | yes |
| `automation_output` | אוטומציה דורשת מעקב | warning | automations | Automation run failed or needs review | per run + recipient | Run succeeded/handled | yes | via scan | Review automation | yes |
| `billing_plan_cycle_draft` | חשבון התקדמות ממתין להנפקה | warning | billing | Billing plan cycle draft/ready | per cycle + recipient | Issued | yes | via scan | Issue progress bill | yes |
| `billing_plan_milestone_due` | אבן דרך לחיוב מתקרבת | warning | billing | Milestone target within 7 days | per line + recipient | Billed/passed | yes | via scan | Bill milestone | yes |
| `billing_plan_retention_held` | עיכבון מוחזק לשחרור | info | billing | Retention held remaining on plan | per plan + recipient | Released | yes | via scan | Release retention | informational |
| `action_required` | דורש טיפול | varies | command-center | Synthetic wrapper for CC items in bell | per itemKey | Condition clears / snooze / handle | yes | yes (/today) | Open linked record | yes |

---

## Command Center source types (42 collectors)

All appear on `/today` (with persona filter + snooze/handle state). Also merged into notification bell unless snoozed/handled/dismissed.

| Key | Hebrew WHAT (representative) | Default severity | Source module | Trigger (summary) | Financial? | Snooze | Handle |
|-----|------------------------------|------------------|---------------|-------------------|------------|--------|--------|
| `overdue_ar` | גביית חיוב באיחור | critical | billing | Overdue finalized billing records | yes | yes | no |
| `vendor_bill_due` | תשלום חשבונית ספק באיחור | critical | ap | AP bill past due (respects vendor terms via payables) | yes | yes | no |
| `vendor_bill_approaching` | חשבונית ספק מתקרבת לפירעון | high | ap | Due within 7 days | yes | yes | no |
| `attendance_open` | סגירת יום נוכחות פתוח | medium | workforce | Open attendance day (no clock-out) last 14d | no | yes | yes |
| `unallocated_employee_cost` | הקצאת יתרת עלות | high | workforce | Monthly labor cost not fully allocated | yes | yes | no |
| `unallocated_vendor_bill` | שיוך חשבונית ספק לפרויקט | high | ap | Posted vendor bill without project | yes | yes | no |
| `project_over_budget` | בדיקת פרויקט שחרג מהתקציב | critical | budgets | Actual cost > active budget | yes | yes | no |
| `forecast_warning` | תחזית / תקציב (by kind) | high | forecast | Early warning kinds (over budget, margin, etc.) | yes | yes | no |
| `open_approval` | החלטה על אישור ממתין | high | approvals | Pending approval | no | yes | yes |
| `overdue_planning` | עדכון פריט תכנון באיחור | medium | planning | Milestone/task past target | no | yes | yes |
| `expiring_compliance` | מסמך ציות לקראת פקיעה | medium | compliance | Compliance artifact expiring | no | yes | yes |
| `overdue_maintenance` | השלמת תחזוקה באיחור | medium | assets | Maintenance overdue | no | yes | yes |
| `credit_void_issue` | טיפול בזיכוי פתוח | high | billing | Credit note open/partial collection | yes | yes | no |
| `month_close_incomplete` | השלמת סגירת חודש | high | month-close | Period not closed / incomplete | no | yes | yes |
| `boq_measurement_awaiting_approval` | אישור מדידת כתב כמויות | high | boq | Measurement batch awaiting approval | no | yes | yes |
| `boq_progress_ready_to_bill` | יצירת חשבון חלקי מכתב כמויות | high | boq | Approved progress ready to bill | no | yes | yes |
| `boq_vs_contract_mismatch` | התאמת כתב כמויות לחוזה | medium | boq | BOQ vs contract recon mismatch | no | yes | yes |
| `ocr_needs_review` | בדיקת חשבונית | medium | ocr | OCR candidate needs review | no | yes | yes |
| `ocr_failed` | ניסיון חוזר לקריאת מסמך | high | ocr | OCR read failed | no | yes | yes |
| `punch_open` | ליקוי פתוח | medium | field-ops | Open punch item | no | yes | yes |
| `safety_open` | רשומת בטיחות פתוחה | high | safety | Open safety record | no | yes | yes |
| `inspection_open` | ביקורת פתוחה | high | field-ops | Open inspection | no | yes | yes |
| `recurring_draft_issue` | טיוטה חוזרת | medium | recurring-drafts | Recurring draft generation issue | no | yes | yes |
| `timesheet_missing` | גיליון שעות חסר | medium | workforce | Missing timesheet submission | no | yes | yes |
| `closeout_blockers` | סגירת פרויקט | high | closeout | Closeout blockers remain | no | yes | yes |
| `warranty_expiring` | אחריות שעומדת לפוג | medium | warranty | Warranty ending soon | no | yes | yes |
| `cash_flow_risk` | סיכון תזרים לטיפול | critical | financials | Overdue collections and/or payables in cash-flow outlook | yes | yes | no |
| `automation_followup` | אוטומציה (preset label) | medium | automations | Failed/review automation run | no | yes | yes |
| `communication_failed` | הודעה לא נשלחה | high | communications | Failed outbound communication | no | yes | yes |
| `billing_plan_cycle_draft` | חשבון התקדמות ממתין להנפקה | high | billing-plan | Draft/ready cycle | yes | yes | no |
| `billing_plan_milestone_due` | אבן דרך לחיוב | medium | billing-plan | Milestone due soon | no | yes | yes |
| `billing_plan_retention_release_due` | שחרור עיכבון | high | billing-plan | Retention held ready to release | yes | yes | no |
| `missing_attendance_today` | עובדים לא דיווחו נוכחות | medium | workforce | Active employees missing attendance today (workday only) | no | yes | yes |
| `expense_due_today` | הוצאה לתשלום היום | high | expenses | Expense payment due today | yes | yes | no |
| `expense_due_soon` | הוצאה מתקרבת לתשלום | medium | expenses | Due within window | yes | yes | no |
| `expense_overdue` | הוצאה באיחור | critical | expenses | Past due expense obligation | yes | yes | no |
| `expense_pending_review` | הוצאה ממתינה לאישור | high | expenses | Pending owner payment review | yes | yes | no |
| `expense_needs_allocation` | הוצאה ללא שיוך | high | expenses | Expense needs project allocation | yes | yes | no |
| `payroll_due_today` | שכר לתשלום היום | high | workforce | Payroll due today | yes | yes | no |
| `payroll_due_soon` | שכר מתקרב לתשלום | medium | workforce | Payroll due soon | yes | yes | no |
| `payroll_overdue` | שכר באיחור | critical | workforce | Overdue payroll | yes | yes | no |
| `payroll_pending_review` | שכר ממתין לאישור | high | workforce | Pending payroll review | yes | yes | no |

**Typed but not collected (dead type entries):** `expense_upcoming`, `payroll_upcoming` — present in `COMMAND_CENTER_SOURCE_TYPES` / ranking defaults but no collector registered.

**Removed:** `stale_project` — inactive work check (14+ days without project update).

---

## Preserved business rules (verified in code)

| Rule | Location | Status |
|------|----------|--------|
| Owner/Manager attendance exempt | `listEmployeesWithoutAttendanceToday` filters `compensationClass != 'owner_manager'` | preserved |
| company_only no project allocation alerts | `labor-allocation-alerts.ts` skips owner_manager + company_only | preserved |
| Optional Friday / non-workdays | `collectMissingAttendanceToday` checks `resolveOrgWorkWeekdays` | preserved |
| Vendor payment terms | AP collectors use `getOrganizationApPayables` due dates | preserved |
| Recurring/installment scheduling | `collect-owner-payments.ts` uses expense/payroll lifecycle helpers | preserved |

---

## Questionable / unclear notification copy (flagged, not rewritten)

1. **`approval_waiting`** — body shows raw `entityType` string (e.g. `expense`) instead of localized label.
2. **`open_approval` (CC)** — same entity type codes in WHY line.
3. **`forecast_warning`** — generic "בדיקת…" titles; kind not always visible in WHAT.
4. **`automation_followup` / `automation_output`** — preset keys fall back to raw key when unknown.
5. **`boq_awaiting_approval`** — extra field may be technical batch reference.
6. **`employee_missing_report`** — type registered but never emitted (confusing if ever enabled).
7. **`expense_upcoming` / `payroll_upcoming`** — locale labels exist but no runtime items.

---

## Raw money render paths fixed (this release)

- `formatMoneyString` added to `src/shared/money/format.ts`
- Command Center copy: `item-copy.ts` (AR, AP, cash flow, budget, allocation, retention, approvals)
- Notification scan extras: `scan-conditions.ts` (billing_overdue, billing_plan_retention_held)
- UI: global search, billing payment forms, month-close supersede picker, recurring draft preview

Remaining low-traffic raw paths (not user-reported): assistant tool output, some AP page labels — use `MoneyText` / `formatMoneyString` if surfaced.
