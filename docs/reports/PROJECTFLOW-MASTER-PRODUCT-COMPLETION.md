# ProjectFlow — Master Product Completion

**Status:** READY FOR OWNER SQL REVIEW  
**Date:** 15 August 2026  
**Baseline commit:** `b8f53f8bfa959574781398a961d1c1a7287f3618`  
**Code / SQL apply / commit / push / deploy:** none (this wave)

This report describes the product **after** closing the independent audit backlog. It does not repeat overnight PASS stamps. Portal remains **OFF**.

Authoritative gap map used:

```text
docs/reports/PROJECTFLOW-INDEPENDENT-MASTER-AUDIT.md
```

---

# סיכום מנהלים (עברית)

הביקורת העצמאית אמרה שהמוצר אמיתי, אבל כמה מסלולים מרכזיים היו שבורים או מטעים: שעות עובד שטח, שלוש “הצעות מחיר”, שרשרת קבלן משנה, חוזה שני בלי עריכה, OCR בלי תפעול, והרשאות פרויקט שהמסך לא שלט בהן.

**מה נסגר עכשיו (בקוד, לפני SQL של הבעלים)**

- עובד שטח יכול לדווח שעות על עצמו בלי לקבל `workforce.read`. קישור משתמש↔עובד במסך. שעון עם הפסקות. פאנץ׳ עם אחראי ותאריך.
- מסלול מכירות אחד ברור: **הצעות מחיר** = מכרז ללקוח. CRM = צינור רשות. תמחור שינוי נשאר בפרויקט.
- הסכם קבלן משנה מתחבר ללוח BOQ ולחשבון ספק, כולל עיכבון ומאזן לפי הסכם.
- חוזה נוסף ניתן לעריכה / סגירה / ביטול. בקשת שינוי יכולה לבחור חוזה. רווח נשאר ברמת הפרויקט — בלי המצאת הקצאת עלות.
- כרטיס ספק מציג תמונת AP אמיתית (יתרה, גיל, עיכבון) מאותו מנוע AP.
- תפקידים יכולים לכבות `projects.access_all` ו־`workforce.manage`. מסמכי שכר מוסתרים בלי `workforce.cost.read`.
- מספור `PRJ-` / `JOB-` / `WO-`, תצוגות שמורות, ניווט ברור יותר, OCR עם Settings + cron, טיוטות מחזוריות מתוזמנות.

**מה לא נבנה בכוונה**

פורטל חיצוני, הנהלת חשבונות, משכורות, FIFO, חשבונית ישראל, מייל/פוש, Microsoft Project, מנוע כספי שני.

**SQL:** יש להחיל ידנית `0052` ואז `0053`. המיגרציות `0000–0051` לא נגעו. אין commit / push / deploy.

---

## What now exists (owner-facing)

One operating system for project businesses. Same financial engine as before.

| Journey | What the owner uses |
|---|---|
| Bid → work | `/quotes` (lines, VAT, discount, issue status, accept, convert). CRM is optional pipeline. In-project extras stay on `/changes/.../price`. |
| Worker time | Settings → People / Employees: link user. Worker opens **Time**, sees own entries, submits week, manager approves. Attendance clock is separate. |
| Subcontractor | Vendor → subcontract agreement → BOQ schedule (agreement id) → valuation → draft AP (retention from agreement) → pay through existing AP. |
| Multi-contract | Project contracts: edit metadata, close/cancel, switch primary, target a change at a contract. Project CCV sums **draft/active** only. Cost/profit stay project-level. |
| Vendor money | Vendor page AP 360 reuses `getVendorApOutstanding`. |
| Paper invoices | Settings → OCR + cron `/api/internal/ocr-worker`. Review still creates **drafts only**. |
| Overhead drafts | Recurring templates; daily worker `/api/internal/ops-worker` generates **drafts** (idempotent, month-close aware). |

Work kinds remain one financial row with three skins: Project / Job / Service call.

---

## Independent audit findings — disposition

Audit counts used: **3 CRITICAL**, **9 HIGH-VALUE**, **14 USEFUL**. OPTIONAL / LATER and NOT RECOMMENDED were not implemented as product work.

### CRITICAL — 3/3 closed

| # | Finding | Disposition |
|---|---|---|
| 1 | Worker time loop broken | **CLOSED.** Self-scoped `time.manage` without `workforce.read`. Employee↔user UI. Self-approval blocked except Owner (all catalog keys). |
| 2 | Sales vs Quotes confusion | **CLOSED.** `/quotes` is the customer bid. CRM quotes/estimates are advanced/internal. Kanban stage select submits `stage`. Won conversion uses product quotes. |
| 3 | Subcontract ↛ BOQ ↛ AP | **CLOSED.** Schedule and AP bill store `subcontract_agreement_id`. Draft AP copies agreement + retention %. Outstanding scoped per agreement. |

### HIGH-VALUE — 9/9 closed

| # | Finding | Disposition |
|---|---|---|
| 4 | Punch assignee + due/location | **CLOSED.** UI + notifications `punch_assigned`. Offline payload now keeps `assigneeEmployeeId`. |
| 5 | Vendor AP 360 | **CLOSED.** Vendor page uses existing AP math. |
| 6 | `projects.access_all` / Manager restriction | **CLOSED.** Roles UI toggle + bypass copy. People warns when access-all is on in selected/assigned mode. |
| 7 | Multi-contract edit + CR targeting | **CLOSED.** Edit/close/cancel UI; CR contract picker; original amount still immutable. |
| 8 | Nav / terminology | **CLOSED.** Quotes vs CRM, Expense vs Vendor bills, Time/Attendance/Timesheets, Team calendar vs Dispatch, Today vs bell copy, Imports in More. OCR review stays gated (`OcrEntryLink` + Settings), not a always-on More item. |
| 9 | CRM board movement | **CLOSED.** Stage `<select name="stage">` submits `updateOpportunityAction`. |
| 10 | OCR operations | **CLOSED.** Settings → OCR, queue, Vercel cron `*/5`, worker auth. Drafts only. |
| 11 | Recurring drafts schedule | **CLOSED.** Daily cron `0 6`. Draft-only, idempotent. |
| 12 | Document project ACL + search | **CLOSED.** Restricted-project visibility; `privacy_class=compensation` needs `workforce.cost.read`. Search: filename, category, tags, owner, project. |

### USEFUL in-scope — 14/14 closed (two via existing surfaces)

| # | Finding | Disposition |
|---|---|---|
| 13 | Daily log corrections + optional safety | **CLOSED.** Correction notes displayed; optional safety prefill (no auto-create). |
| 14 | Quote edit after create + print ≠ email | **CLOSED.** Draft editor; Issued status copy states no email was sent. |
| 15 | `workforce.manage` toggle | **CLOSED.** Manager template toggleable. |
| 16 | Attendance breaks on clock | **CLOSED.** Break start/end. Attendance ≠ Time. |
| 17 | Saved list views | **CLOSED.** Projects, jobs, work orders, clients, vendors, expenses, AP, quotes, punch, inventory. |
| 18 | Project/job/WO numbering | **CLOSED.** Sequences `PRJ-` / `JOB-` / `WO-` (5 digits). UUID unchanged. |
| 19 | Named notification recipients | **CLOSED.** Assignee / approver / punch owner / timesheet parties — not the bell opener. |
| 20 | Inspection templates | **CLOSED.** Reuses Forms (`form_template_id`, inspector). No second form engine. |
| 21 | Dispatch → resource booking | **CLOSED.** Write-through `resource_bookings` `source=work_order`. |
| 22 | Supplier quote comparison | **CLOSED at totals.** RFQ ranks comparable totals. Line-item matrix not built (see exclusions). |
| 23 | Change-request lines UI | **CLOSED via quote versions.** Pricing stays on commercial quote versions. No second lines editor. |
| 24 | Legal identity / tax ID | **CLOSED.** Settings → Business; OCR reads the same setting. |
| 25 | Inventory import + search | **CLOSED.** Qty-only import; global search inventory + materials. Asset search href `/assets/{id}`. |
| 26 | Work-mix hides unused modules | **CLOSED.** Profiles (e.g. plumbing) omit BOQ/CRM; Features + work mix remain editable. |

---

## NOT BUILT — INTENTIONAL

These are product-scope exclusions, not deferred bugs.

### External portal

```text
NOT BUILT — INTENTIONAL
Reason: Owner decision. Portal stays OFF.
Why outside current product: public customer/vendor login is explicitly disabled
(`isExternalPublicAccessEnabled(): false`). Dormant foundations remain.
```

### Accounting / payroll / warehouse books

```text
NOT BUILT — INTENTIONAL
Reason: ProjectFlow is not accounting software.
Why outside current product: General Ledger, journals, depreciation, payroll,
payslips, FIFO / weighted-average inventory, warehouse GL, statutory Israeli
invoicing, bank reconciliation as books.
```

### Planning / platform expansion

```text
NOT BUILT — INTENTIONAL
Reason: Would change the product class.
Why outside current product: Microsoft Project / CPM, giant public API,
webhook platform, second OCR provider before Azure is operationally proven.
```

### Messaging / signatures

```text
NOT BUILT — INTENTIONAL
Reason: Audit OPTIONAL / LATER.
Why outside current product: email/push channels, quote email send, e-signature,
calendar sync, custom dashboards, workflow automation, document templates,
scheduled PDF reports.
```

### Per-contract profit

```text
NOT BUILT — INTENTIONAL
Reason: Costs remain project-level. Fabricating allocation would lie.
Why outside current product: UI states CCV per live contract; cost and profit
stay on the project. Closed/cancelled contracts are historical and excluded
from project current contract value.
```

### Change-request line items as a second editor

```text
NOT BUILT — INTENTIONAL
Reason: Commercial pricing already lives on quote versions.
Why outside current product: A parallel CR-lines UI would recreate the same
“which quote?” confusion the sales pass removed.
```

### Supplier quote line-item matrix

```text
NOT BUILT — INTENTIONAL
Reason: RFQ already ranks vendor totals for award.
Why outside current product: A full spreadsheet compare is OPTIONAL / LATER,
not required to buy from the cheapest comparable quote.
```

### `role_assignments.project_id` as a permission union

```text
NOT BUILT — INTENTIONAL (V1 semantics kept)
Reason: App still unions org-level role permissions. Project restriction is
access mode + RLS, not per-assignment permission bits.
Why outside current product: Changing DB union semantics would risk opening
fail-closed RLS. Documented; Roles UI matches current app behavior.
```

---

## Financial invariants — preserved

```text
Billing ≠ Payment
Commitment ≠ Expense
VAT ≠ Profit
Receiving ≠ Actual
Inventory movement ≠ Expense
Attendance ≠ Project Time
Assignment ≠ Actual
Progress ≠ Actual
Approved changes affect Current Contract; pending/rejected do not
Payments never create Actual
Financial history is never silently rewritten
```

`composeProjectFinancials` remains the only project financial composer. No second engine. Corrections still use void / reversal / adjustment / replacement / supersede.

OCR and recurring workers create **drafts only**.

---

## Final module status (honest)

| Area | Status after this completion |
|---|---|
| Clients / Quotes (`/quotes`) | FUNCTIONAL → coherent bid path (edit, issue ≠ email, convert) |
| CRM | FUNCTIONAL optional pipeline (real stage move; internal quotes hidden) |
| Projects / Jobs / Work orders | FUNCTIONAL + numbering + work-mix skins |
| Contracts / Changes | FUNCTIONAL multi-contract product (edit, target, honest CCV) |
| BOQ / Subcontracts / AP | FUNCTIONAL chain (agreement-aware) |
| Expenses / Vendor bills | FUNCTIONAL; separate doors, clearer labels |
| Workforce / Time / Attendance | FUNCTIONAL worker loop (self-scope) |
| Punch / Daily log / Inspection / Safety | FUNCTIONAL field notebook (assignee, corrections, forms reuse) |
| Dispatch / Scheduling | FUNCTIONAL lightweight (booking write-through; not MS Project) |
| Documents | FUNCTIONAL next level (project + compensation privacy) |
| OCR | FUNCTIONAL operations layer (still off until Azure + flag) |
| Recurring drafts | FUNCTIONAL scheduled drafts |
| Notifications | FUNCTIONAL in-app routing (no email/push) |
| Inventory | FUNCTIONAL quantity ops + import/search |
| Roles / project access | FUNCTIONAL UI matches RLS |
| Portal | OFF (intentional) |

---

## Migrations

Historical **0000–0051 are immutable** and were **not** edited.

| Tag | Purpose |
|---|---|
| `0052_product_completion` | Punch assignee; inspection inspector + form template; daily-log safety link; project/job/WO numbers; subcontract FKs on BOQ schedule + AP bill; document `privacy_class`; `saved_list_views`; inspection as form owner |
| `0053_estimates_opportunity` | `estimates.opportunity_id` with **same-org** FK to `crm_opportunities` |

Journal last tag: `0053_estimates_opportunity`.

### Owner SQL apply (manual)

Production/Supabase is at **0051**. Do **not** run 0000–0051 again.

1. Review, then apply in order:

```text
drizzle/migrations/0052_product_completion.sql
drizzle/migrations/0053_estimates_opportunity.sql
```

2. Confirm:

```sql
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'punch_list_items'
  AND column_name = 'assignee_employee_id';

SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'estimates'
  AND column_name = 'opportunity_id';

SELECT conname FROM pg_constraint
WHERE conname IN (
  'punch_list_items_assignee_org_fk',
  'estimates_opportunity_org_fk',
  'ap_bills_subcontract_org_fk'
);
```

3. After apply: set `CRON_SECRET` (or existing `OCR_WORKER_SECRET`) so Vercel crons can call:

```text
POST /api/internal/ocr-worker
POST /api/internal/ops-worker
```

OCR still requires the existing Azure env + ingestion flag. It will not post Actual.

**Owner SQL applied = NO** (this report).

---

## Tests (this candidate)

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | PASS |
| Unit (`vitest --project unit`) | PASS — 1976 tests |
| Migration clean-start through 0053 | PASS (`hardening-0052-0053`) |
| Upgrade 0051 → 0053 | PASS (same file) |
| Targeted integration | PASS — multi-contract (closed CCV excluded), document numbers, subcontract AP guard, subcontract agreements, timesheet approval, OCR draft-only, client timeline |
| Production build (`next build`) | PASS |

Full integration estate and Playwright e2e were **not** re-run after every wave (Owner rule). Final candidate used typecheck + unit + migration upgrade/clean-start + targeted integration + production build.

---

## User-journey review (code + tests, not live production)

Production still runs **0051** until Owner SQL. Journeys below are verified in this tree (UI actions, application services, PGlite). They cannot fully execute on current production until 0052–0053 are applied.

| Journey | Evidence |
|---|---|
| Quote → Project → Contract → Cost → Billing → Payment → Profit | Unchanged engine; quote edit/convert wired; `/quotes` is the bid door |
| Worker: user link → Attendance → Time → Timesheet → Return/Approve | Employee form `userId`; clock breaks; self-scope time; self-approval blocked; manager approvals unchanged |
| Vendor: RFQ → Quote → PO → Receive → AP → Payment | Existing procurement; RFQ total comparison; AP unchanged |
| Subcontractor: Agreement → BOQ → Progress → AP → Retention → Payment | Agreement id on schedule + bill; retention copied; outstanding per agreement |
| Work order: Create → Dispatch → Worker → Complete → Billing | Numbering `WO-`; dispatch writes resource booking |
| Document: Upload → Version → Permission → OCR → Review → Draft | Project ACL + compensation class; OCR drafts only |
| Project: multiple contracts → Change → BOQ → Billing | Contract picker; closed contracts out of current CCV; no fake P&L split |
| Field: Daily log → Punch → Inspection → Safety | Corrections shown; punch assignee; inspection forms; optional safety link |

---

## UX final pass (what changed for a contractor)

- One bid door: **Quotes**. Sales hub explains CRM as optional.
- Worker opening Workforce lands on **Time** if they cannot read the roster.
- Vendor bills sit next to Vendors when Procurement is on (not a buried advanced clone of AP).
- Today copy: work inbox, not the alert bell.
- Scheduling label: **Team calendar** (not a fake Gantt).
- Empty numbering and saved views reduce “which filter did I use?”
- Plumbing-style profiles still hide BOQ/CRM until Features turn them on.

---

## Known in-scope findings

**0.** Defects found during integration (offline punch assignee drop, closed-contract CCV inflation, 0053 cross-tenant FK, worker page typing, numbering list length) were fixed before this report.

---

## Git / deploy

```text
Commit = NONE
Push = NONE
Deploy = NONE
Owner SQL applied = NO
```

Do not ship this tree to production until Owner has applied 0052–0053 and smoke-tested Time, Quotes, Vendor AP, and OCR Settings.
