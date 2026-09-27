# ProjectFlow — Full System Audit
**Date:** 2026-09-27  
**Method:** 10 parallel deep-read subagents covering all 70+ modules, 133 migrations, ~2,400 source files. Zero reliance on prior audits. First-principles discovery.  
**Scope:** Every domain, every cross-module flow, every integration. Discovery only — no code changes.

---

## 1. Executive Summary

### What ProjectFlow Is Today

ProjectFlow is a **construction/contractor business operating system** — not accounting software, not payroll. It covers the full project lifecycle for a contracting business: winning work, executing projects, managing costs and workforce, billing clients, and analysing profitability.

**Scale of the system:**
- **70+ modules** across clients, projects, finance, workforce, tasks, documents, materials, and operations
- **133 applied migrations** covering a deeply layered schema
- **132 DB-level migration files** with extensive SECURITY DEFINER functions, CHECK constraints, RLS policies, and triggers
- **~2,400 source files** (components, server actions, API routes, domain services)
- **~88 RBAC permission keys** with financial isolation
- **6 cost allocation methods** with full audit trail
- **22 notification scanner types** (mostly non-firing — see gaps)
- **4 external storage providers** (OneDrive, Google Drive, Dropbox, Box) — all fully implemented
- **Live market intelligence engine** with FRED + CBS data feeds

### Maturity by Domain

| Domain | Maturity | Notes |
|--------|----------|-------|
| Projects / BOQ | ★★★★★ | Very strong. Multi-contract, lifecycle, BOQ progress billing |
| Billing / AR | ★★★★☆ | Strong. VAT, splits, SUMIT integration. Missing recovery cron |
| Expenses / AP | ★★★★☆ | Strong allocation engine. Multi-currency gap |
| Workforce | ★★★★☆ | Solid rate versioning, employee app. Manual attendance→cost bridge |
| Clients / CRM | ★★★☆☆ | Good client mgmt. CRM quotes are a dead end. Dual approval systems |
| Profitability | ★★★★☆ | CCV-based model, two modes. Snapshots lazy |
| Tasks / UWM | ★★★★☆ | RFC 5545 recurrence, actor model. Reminders never fire |
| Documents | ★★★★☆ | All 4 providers implemented. SUMIT PDF not archived |
| Material Market | ★★★☆☆ | Working score engine. Completely isolated from operations |
| Notifications | ★★☆☆☆ | 22 scanners, 1 has a cron. Most are silent |
| Automations | ★★★☆☆ | 15/21 presets functional. 6 permanently unavailable |
| Search | ★★☆☆☆ | 10 of 41 declared types actually searchable |
| Auth / RBAC | ★★★★☆ | Two-layer security, fine-grained. middleware.ts risk |
| AI Assistant | ★★☆☆☆ | 12 tools wired, no LLM provider connected |

### Core Strengths

1. **Append-only financial ledgers** — no overwrite, full history everywhere in money flows
2. **Production-grade DB integrity** — CHECK constraints, SECURITY DEFINER functions, mutual exclusion guards
3. **Genuine RLS coverage** — 6 helper functions, consistently applied across 133 migrations
4. **Strong allocation engine** — 6 methods, 4 schedule modes, frozen-slice semantics
5. **Complete external storage** — all 4 major providers implemented identically
6. **Real market data feeds** — live FRED + CBS daily cron
7. **Full employee app** — PIN auth, scoped access, attendance, task visibility
8. **RFC 5545 recurrence** — production-grade recurring task/event system
9. **OCR pipeline** — Azure Document Intelligence, Hebrew-native, correction memory (needs env var to activate)

### Critical Weaknesses (top issues)

1. **Notification system is mostly silent** — 20+ scanners exist, only task reminders have a cron
2. **CRM quotes can't convert to projects** — the sales pipeline has a dead end
3. **Change orders don't flow to billing** — approved revenue is stuck, never reaches AR
4. **No SUMIT recovery cron** — ambiguous statutory documents stay broken forever
5. **SUMIT PDFs not saved** — legal invoice records exist only on SUMIT's servers
6. **Attendance → labor cost is manual** — no automation bridge
7. **Material Market is informational only** — market intelligence doesn't connect to procurement or budgets
8. **Closed-month freeze is app-layer only** — no DB triggers
9. **middleware.ts session refresh risk** — Supabase sessions may expire silently
10. **Illegal module coupling** — shared/permissions imports from employee-app feature

---

## 2. Full System Map

### Domain: Clients & CRM

**Tables:** `clients`, `client_contacts`, `crm_leads`, `crm_opportunities`, `crm_activities`, `crm_pipelines`, `crm_pipeline_stages`, `crm_quotes` (sales quotes)

**Screens/Routes:** `/clients`, `/clients/[id]`, `/crm`, `/crm/leads`, `/crm/opportunities`, `/crm/pipeline`

**Capabilities:**
- Client master data (company info, tax ID, payment terms, contacts)
- Multi-contact per client with roles
- Lead management with status tracking
- Opportunity pipeline (visual Kanban + list)
- CRM activity logging
- CRM Sales Quotes (line items, pricing, validity date)
- Client history view

**Connected to:** Projects (client_id), Billing (client balance), Documents (client folder), Approvals

**Gap flag:** CRM Sales Quotes → Project conversion path is broken

---

### Domain: Quotes & Commercial

**Tables:** `quotes`, `quote_items`, `quote_versions`, `change_orders`, `contract_current_value_events`, `commercial_approvals`

**Screens/Routes:** `/quotes`, `/quotes/[id]`, `/projects/[id]/commercial`, `/projects/[id]/changes`

**Capabilities:**
- Product quotes with line items, sections, totals
- Versioned quotes (immutable on issue)
- Quote → Project conversion
- Change orders with approval evidence
- Contract Current Value (CCV) event ledger
- Commercial summary per project

**Connected to:** Projects, Billing, Documents, Approvals

---

### Domain: Approvals

**Tables:** `approval_requests`, `approval_steps`, `approval_rules`, `approval_rule_conditions`, `commercial_approvals` (separate!)

**Screens/Routes:** `/approvals`, `/approvals/[id]`

**Capabilities:**
- Multi-step approval workflows
- Threshold-based rule engine
- Unified approval inbox
- Approval history

**Gap flag:** Commercial change approvals use a separate `commercial_approvals` table and are invisible to the unified inbox

---

### Domain: Projects

**Tables:** `projects`, `project_contracts`, `project_contract_versions`, `project_milestones`, `project_stages`, `project_statuses`, `project_job_modes`, `project_closeouts` (raw SQL only)

**Screens/Routes:** `/projects`, `/projects/[id]`, `/projects/[id]/overview`, `/projects/[id]/financials`, `/projects/[id]/workforce`, `/projects/[id]/documents`, `/projects/[id]/tasks`

**Capabilities:**
- Full project lifecycle (draft → active → closeout → archived)
- Multi-contract support per project
- Contract versioning with effective dates
- Budget tracking vs actual
- Project job modes (lump sum, unit-price, cost-plus, etc.)
- Closeout checklist
- Project-level financial summary

**Connected to:** Clients, BOQ, Billing, Expenses, Workforce, Tasks, Documents, Profitability

---

### Domain: BOQ (Bill of Quantities)

**Tables:** `boq_items`, `boq_sections`, `boq_versions`, `boq_progress_entries`, `boq_subcontractor_valuations`

**Screens/Routes:** `/projects/[id]/boq`

**Capabilities:**
- Multi-level BOQ (sections + items)
- BOQ versioning with approval
- Progress billing per BOQ item (% or quantity)
- Subcontractor valuations tied to BOQ
- BOQ finalization (locks billing)
- BOQ-based progress billing vs flat billing-plan mutual exclusion guard
- Reverse allocation from change-approved items

**Connected to:** Billing (progress billing), Commercial (change orders), AP (subcontractor invoices)

---

### Domain: Billing (AR)

**Tables:** `billing_records`, `billing_record_items`, `payment_records`, `payment_allocations`, `payment_splits`, `billing_plans`, `billing_plan_items`, `recurring_billing_drafts`, `statutory_documents`

**Screens/Routes:** `/projects/[id]/billing`, `/billing`, `/billing/[id]`

**Capabilities:**
- Billing record creation (milestone, installment, reference, recurring)
- VAT / net / gross handling with invariant enforcement
- Payment recording with partial/split support
- Payment allocation to billing records
- Billing plan (milestone-based payment scheduling)
- Recurring billing templates
- SUMIT document issuance (invoices, receipts, tax receipts)
- Two-phase committed SUMIT issuance with idempotency keys
- Open balance calculation (derived, never stored)
- Client balance summary
- Overdue detection

**Connected to:** Projects, Clients, SUMIT, Tax, Commercial (CCV), Documents

---

### Domain: Accounts Payable (AP)

**Tables:** `ap_bills`, `ap_bill_lines`, `ap_bill_payments`, `ap_bill_inventory_layers`, `ap_vat_records`

**Screens/Routes:** `/expenses/ap`, `/expenses/ap/[id]`

**Capabilities:**
- Vendor bill entry with line items
- VAT / net / gross with DB CHECK constraints
- Multi-line AP with cost code attribution
- Payment recording against AP bills
- Inventory layers (FIFO cost tracking for materials)
- Credit notes
- Bill discrepancy tracking

**Connected to:** Vendors, Expenses, Procurement, Inventory

---

### Domain: SUMIT Integration

**Tables:** `statutory_documents`, `invoicing_integration_configs`, `sumit_issuance_log`

**Capabilities:**
- Document types: invoice, receipt, tax receipt (חשבונית מס + קבלה)
- Two-phase committed issuance (reserve → issue → confirm)
- Idempotency keys preventing duplicate statutory documents
- Retry logic with exponential backoff
- Ambiguous state tracking (timeout scenarios)
- Document reference storage (SUMIT URL + document number)
- Viewing issued documents via SUMIT URL
- Manual "Refresh Status" for ambiguous documents

**Gap flag:** No automated cron to recover ambiguous SUMIT outcomes

---

### Domain: Expenses & Cost Allocation

**Tables:** `expense_records`, `expense_line_items`, `allocation_runs`, `allocation_slices`, `allocation_policies`, `category_allocation_policies`, `cost_codes`, `expense_cash_installment_schedules`

**Capabilities:**
- 6 allocation methods: direct, auto-pool, company-only, manual, periodic, retroactive
- 4 schedule modes: immediate, end-of-month, periodic, retroactive
- Frozen-slice semantics (closed months get immutable allocation slices)
- Expense lifecycle: create → verify → void/adjust/reverse (D5 rule — no overwrite)
- Cost code / discipline attribution
- Cash installment schedules for large expenses
- External expense imports (11 entity kinds)
- Profitability engine: CCV-based revenue, direct actual vs full (allocated) actual
- Two-mode profitability: direct vs full with coverage disclosure

**Gap flags:** Multi-currency expenses dropped, budget lines unmapped, recurring drafts manual

---

### Domain: Workforce

**Tables:** `employees`, `employee_rate_versions`, `attendance_records`, `time_entries`, `time_entry_cost_snapshots`, `workforce_allocations`, `timesheets`, `payroll_obligation_payments`, `org_work_week_config`

**Capabilities:**
- Employee master data with employment type
- Rate versioning with effective dates (cost snapshotted at entry creation)
- Attendance tracking (owner/manager entry)
- Self-service attendance (employee app — today only)
- Time entries with project allocation
- Monthly employer cost calculation
- Work calendar configuration (org-level)
- Overtime flagging
- Month-close workforce completeness (9 checks)
- Payroll payment confirmation (NOT payroll processing)

**Connected to:** Projects (labor cost), Expenses (labor), Month-Close, Employee App

---

### Domain: Employee App

**Auth:** Username + 6-digit PIN, AES-256-GCM sealed temp PINs, lockout logic

**Routes:** `/employee/*` (35+ routes)

**Capabilities:**
- Attendance self-reporting (today only)
- Task list (scoped: self → assigned → granted projects → all org)
- Task status updates
- Document access (scoped)
- Notifications (employee-facing)
- Profile view

**Cannot see:** Pay rates, profitability, client financial data, other employees' data

---

### Domain: Tasks / UWM (Unified Work Management)

**Tables:** `tasks`, `task_comments`, `task_activity`, `task_attachments`, `task_reminders`, `task_labels`, `task_templates`, `task_recurrence_rules`, `workspaces`, `workspace_boards`, `workspace_stages`, `workspace_labels`, `planning_tasks`, `meetings`, `meeting_action_items`, `forms`, `form_submissions`, `quick_capture_items`

**Capabilities:**
- Full task CRUD with priorities, statuses, due dates
- Lexorank ordering within boards
- Subtasks / parent-child relationships
- Multi-assignee with actor model constraints
- RFC 5545 RRULE recurrence (DST-aware)
- Task templates
- Labels (workspace + task level)
- Comments and activity log
- Document attachments to tasks
- Reminders (stored, NOT delivered — see gap)
- Workspace + board + stage Kanban
- WIP limits (in schema, not enforced)
- Planning tasks (linked to UWM tasks)
- Calendar integration (internal, no external OAuth)
- Meetings with action items
- Forms (project/job/planning_task scope — NOT task scope)
- Quick Capture Inbox (financial document pipeline, NOT quick-task)
- Command Center with 8 real-time UWM scanners
- Portfolio + workload + insights aggregation

---

### Domain: Documents & Storage

**Tables:** `documents`, `document_versions`, `document_attachments`, `external_storage_configs`, `external_storage_folders`, `storage_provisioning`

**External storage providers (all fully implemented):** OneDrive, Google Drive, Dropbox, Box

**Capabilities:**
- Document upload, metadata, owner types (project, client, expense, etc.)
- Document versioning with DB-trigger immutability
- External storage OAuth connection per org
- Folder hierarchy: org → client → project → sub-folder
- File upload/download with byte-range streaming
- Generated documents (quotes, POs, payroll reports)
- OCR pipeline (Azure Document Intelligence, Hebrew-native — needs env var)
- Document correction memory for OCR
- Imports: 11 entity kinds, Hebrew alias support
- Exports: 14 entity kinds, RTL-safe Excel
- Task document attachments
- Employee document access (scoped by permission)

**Gap flags:** SUMIT PDFs not archived, Google Drive native docs crash, no Supabase storage fallback for generated docs

---

### Domain: Material Market Intelligence

**Tables:** `material_market_monitors`, `material_trade_scores`, `material_price_observations`, `market_driver_series`, `market_driver_observations`, `material_vendor_prices`

**External data (live daily cron at 06:00 UTC):**
- FRED: 9 series (copper, aluminium, steel, oil, USD/ILS, etc.)
- CBS Israel: 4 series (construction inputs index)
- EUR/ILS: cross-validation

**Capabilities:**
- Pressure score 0–100 per trade (electrical, steel, plumbing — 3 of 8 researched)
- Piecewise signal functions with weighted composites
- Coverage gating (score suppressed if insufficient data)
- Momentum labels
- Methodology versioning
- Historical trend charts
- Trade view drilldowns
- Owner-facing dashboard

**Gap flags:** Completely isolated from procurement/projects/budgets, supplier signal always null, no alerts, concrete/cement trades not built

---

### Domain: Procurement & Vendors

**Tables:** `purchase_orders`, `po_line_items`, `po_receipts`, `vendors`, `vendor_contacts`, `vendor_performance`, `subcontracts`, `subcontract_advances`, `inventory_items`, `inventory_locations`, `inventory_quantity_records`

**Capabilities:**
- Full PO lifecycle (draft → approved → sent → received → invoiced)
- Committed cost separation from actual
- Vendor 360 view: fulfillment lag, bill discrepancy, warranty quality
- Subcontract management with advances
- Inventory with FIFO cost layers
- Location-based inventory
- Receiving against PO
- Vendor portal (client and vendor-facing)

---

### Domain: Notifications

**Tables:** `notification_records`, `notification_preferences`, `notification_scanner_runs`

**22 declared scanner types** including: billing overdue, AP due, safety action due, warranty expiry, closeout blockers, budget overrun, task assignment, task comment mention, approval requested, recurring billing due, payment collection alert, material pressure alert

**What actually fires:** Only `runTaskReminderOpsWorker` has a cron (06:00 UTC)  
**What doesn't fire:** All other 20+ scanners — they run only if explicitly called from a route

---

### Domain: Automations

**21 presets total:**
- 15 functional (scan-based rules: billing alerts, AP reminders, expense flags, safety checks)
- 6 permanently unavailable (event-based: `task_assigned_to_you`, `task_comment_mention`, `task_approval_requested`, etc. — declared but no emitter)

---

### Domain: Auth / RBAC / Tenancy

**Auth:** Supabase Auth (owner path). PIN-based for employee app.

**RBAC:** 88 permission keys, two-layer enforcement:
- App-layer: `assertPermission()` guard on every server action
- DB-layer: RLS with 6 helper functions (`is_org_member`, `has_permission`, `is_employee_of_org`, etc.)

**Tenancy:** Row-level org isolation. `org_id` on every significant table. RLS enforced at DB level.

**Permission catalog highlights:**
- `project_financials.read` vs `project_profit.read` — financial data isolated from profitability
- `employee_app.access` — separate gate for employee path
- Module-level toggles per org

---

### Domain: Dashboards & Reports

**Owner dashboard:** 15+ KPI cards including:
- Cash outstanding, billing due, overdue payments
- Monthly cash flow with drilldown
- Project health summary (active count, at-risk flags)
- Work summary (tasks due, attendance gaps)
- Cost summary (allocation status, unallocated amounts)
- Data confidence indicators

**Reports:** Financial reports, expense reports, workforce reports, project profitability reports — most with date range filters and CSV/Excel export

**Search:** Global search — 10 of 41 entity types indexed (projects, clients, tasks, billing, employees, quotes, vendors, POs, contracts, contacts)

---

## 3. End-to-End Business Flows

### Flow 1: Lead → Money (Sales to Revenue)

| Step | Status | Notes |
|------|--------|-------|
| Lead creation | ✅ | CRM module |
| Opportunity management | ✅ | Pipeline stages |
| CRM Sales Quote | ✅ | Line items, versioning |
| CRM Quote → Product Quote | ❌ **BROKEN** | No conversion path. User must re-enter manually |
| Product Quote creation | ✅ | Line items, totals |
| Quote approval | ✅ | Unified approval inbox |
| Quote → Project conversion | ✅ | Creates project + contract |
| Quote lines → BOQ | ❌ **MISSING** | Only total amount seeds contract; all line items discarded |
| Contract setup | ✅ | Multi-contract support |
| BOQ creation | ✅ | Manual rebuild required |
| Change order | ✅ | Commercial module |
| Change approval | ⚠️ **PARTIAL** | Uses separate `commercial_approvals`, not unified inbox |
| Change → CCV update | ✅ | Ledger updated |
| Change → Billing | ❌ **MISSING** | No auto-create of billing record |
| Billing record | ✅ | Multiple types |
| SUMIT invoice | ✅ | Two-phase committed |
| Payment recording | ✅ | Split/partial support |
| SUMIT receipt | ✅ | Statutory document |
| Revenue in profitability | ✅ | CCV-based |

**Flow health:** ~65% complete. The CRM→Quote gap and Change→Billing gap are the two biggest breaks.

---

### Flow 2: Employee → Project Cost

| Step | Status | Notes |
|------|--------|-------|
| Employee setup | ✅ | Rate versioning, work calendar |
| Attendance recording | ✅ | Owner entry or employee self-service |
| Attendance approval | ✅ | Manager review |
| Attendance → Time entry | ❌ **MANUAL** | No auto-conversion bridge |
| Time entry creation | ✅ | Manual or attendance-linked |
| Time entry → Project allocation | ✅ | Project + cost code |
| Cost snapshot | ✅ | Rate captured at entry time |
| Monthly employer cost | ✅ | Calculated from rate versions |
| Month close | ✅ | 9-check completeness |
| Labor allocation to projects | ✅ | Allocation engine |
| Project labor cost | ✅ | In profitability model |

**Flow health:** ~80% complete. The attendance→time-entry manual step is the main friction.

---

### Flow 3: Supplier → Project Cost

| Step | Status | Notes |
|------|--------|-------|
| Vendor master | ✅ | Vendor 360 |
| Purchase order | ✅ | Full lifecycle |
| PO receiving | ✅ | Inventory layers |
| Vendor invoice receipt | ✅ | AP bill entry |
| OCR extraction | ✅ | Azure DI (needs activation) |
| AP bill line items | ✅ | Cost codes, VAT |
| Payment against AP bill | ✅ | |
| Expense record creation | ✅ | From AP bill |
| Cost code allocation | ✅ | Direct or pooled |
| Project actual cost | ✅ | |
| Profitability impact | ✅ | |

**Flow health:** ~90% complete. Strong. OCR activation would improve capture speed.

---

### Flow 4: Material Intelligence → Procurement Decision

| Step | Status | Notes |
|------|--------|-------|
| Supplier invoice history | ✅ | In AP/vendor module |
| Item-level price history | ✅ | `material_vendor_prices` table exists |
| Material family classification | ✅ | Trade scoring model |
| External market driver data | ✅ | FRED + CBS live |
| Material pressure score | ✅ | 0–100 per trade |
| Score → Owner dashboard | ✅ | Market intelligence UI |
| Score → Procurement alert | ❌ **MISSING** | No connection |
| Score → Project risk flag | ❌ **MISSING** | No connection |
| Score → Budget impact | ❌ **MISSING** | No connection |
| Supplier signal (15–30% weight) | ❌ **NULL** | Always missing |

**Flow health:** ~40% complete. The intelligence exists but is completely isolated from operations.

---

### Flow 5: Task → Project Progress

| Step | Status | Notes |
|------|--------|-------|
| Task creation + project link | ✅ | |
| Task assignment | ✅ | Multi-assignee |
| Task reminder | ❌ **BROKEN** | Stored but never delivered |
| Task completion | ✅ | Status update |
| Task → Project progress | ⚠️ **PARTIAL** | `contributes_to_progress` defaults false |
| Progress → Dashboard | ✅ | If opted-in |
| Time entry from task | ❌ **MISSING** | No task→time-entry link |

**Flow health:** ~60% complete. Reminders and progress opt-in are main gaps.

---

### Flow 6: Document → Business Event

| Step | Status | Notes |
|------|--------|-------|
| Document upload | ✅ | 4 providers |
| Folder hierarchy | ✅ | Org/client/project |
| Document versioning | ✅ | DB-trigger enforced |
| View / download | ✅ | Streaming |
| Task attachment | ✅ | |
| Document generation | ✅ | Quotes, POs, reports |
| Generated doc → Storage | ⚠️ **PARTIAL** | Fails without cloud provider configured |
| SUMIT invoice PDF → Storage | ❌ **MISSING** | PDFs not saved to org storage |
| Document expiry enforcement | ❌ **MISSING** | Date stored but not enforced |
| External share link | ❌ **MISSING** | Web Share API only |

**Flow health:** ~70% complete.

---

### Flow 7: Project Closeout → Warranty

| Step | Status | Notes |
|------|--------|-------|
| Project closeout checklist | ✅ | |
| Closeout → Warranty prompt | ❌ **MISSING** | No UX trigger |
| Warranty coverage setup | ✅ | Tables exist |
| Warranty reminder | ❌ **MISSING** | `reminderDaysBefore` stored, never fires |

**Flow health:** ~50% complete.

---

## 4. Existing Feature Inventory

### Clients & CRM
- Client master data with tax info and payment terms
- Multi-contact per client with role assignment
- CRM lead pipeline with status tracking
- CRM opportunity Kanban + list view
- CRM activity log
- CRM sales quotes with line items
- Client balance view (open AR)
- Client history / activity timeline

### Quotes & Commercial
- Versioned product quotes with sections and line items
- Quote approval flow
- Quote → Project conversion
- Change order creation with evidence upload
- Contract Current Value event ledger
- Commercial summary per project
- Multi-contract project support

### Projects
- Full lifecycle management (draft → active → closeout → archived)
- Multi-contract support
- Contract versioning
- BOQ with progress billing
- BOQ subcontractor valuations
- Project budget vs actual
- Project financial position page
- Project closeout checklist
- Project-level document folder
- Project activity timeline

### Billing & AR
- Milestone, installment, reference, recurring billing records
- VAT / net / gross with invariant DB checks
- Partial and split payment recording
- Payment allocation to billing records
- Billing plan with scheduled milestones
- Client open balance (derived)
- Overdue detection
- SUMIT invoice issuance (two-phase committed)
- SUMIT receipt / tax receipt issuance
- Recurring billing templates

### AP & Procurement
- Vendor bill entry with line items
- Multi-line VAT handling
- AP payment recording
- PO lifecycle (draft → approved → received → invoiced)
- PO receiving with FIFO inventory layers
- Subcontract management with advances
- Vendor 360 performance view
- Inventory with location tracking
- Vendor portal (read-only client/vendor access)

### Expenses & Allocation
- Expense record creation (manual, AP-derived, import)
- 6 allocation methods
- Allocation audit trail
- Cost code / discipline attribution
- Expense void / adjust / reverse lifecycle
- Cash installment scheduling
- External expense imports (11 entity kinds)
- Budget definition and tracking
- Month close with completeness checks
- Profitability model (CCV-based, two modes)
- Margin snapshots

### Workforce
- Employee master data with rate versioning
- Effective-dated rate changes
- Attendance tracking (manager + employee self-service)
- Time entries with project allocation
- Time entry cost snapshots
- Overtime flagging
- Work calendar configuration
- Monthly employer cost calculation
- Workforce month-close completeness (9 checks)
- Payroll payment confirmation

### Employee App
- PIN-based authentication with lockout
- Attendance self-reporting
- Task list (scoped)
- Task status updates
- Notifications (employee-facing)
- Document access (scoped)

### Tasks / UWM
- Full task CRUD (priorities, statuses, due dates, descriptions)
- Multi-assignee with actor model
- Subtasks / parent-child
- RFC 5545 recurrence
- Task templates
- Labels
- Comments and activity log
- Document attachments
- Workspace + Board + Stage Kanban
- Lexorank ordering
- Planning tasks with UWM link
- Calendar (internal)
- Meetings with action items
- Forms (project/job/planning_task scope)
- Command Center with 8 UWM scanners
- Portfolio + workload + insights aggregation

### Documents & Storage
- Document upload with metadata
- Document versioning (DB-trigger enforced)
- OneDrive integration (full)
- Google Drive integration (full, except native docs)
- Dropbox integration (full)
- Box integration (full)
- Folder hierarchy (org/client/project)
- Document generation (quotes, POs, reports)
- OCR pipeline (Azure DI, Hebrew-native)
- Import: 11 entity kinds
- Export: 14 entity kinds (RTL-safe Excel)
- Task document attachments
- Employee document access (scoped)

### Material Market
- Daily FRED data fetch (9 series)
- Daily CBS Israel data fetch (4 series)
- Pressure score calculation (0–100 per trade)
- Piecewise signal functions
- Trade score drilldowns
- Methodology versioning
- Historical trend charts
- 3 live trades: electrical, steel, plumbing (partial)

### Notifications & Automations
- In-app notification delivery
- 22 notification scanner types (declared)
- Task reminder cron (operational)
- 15 functional automation presets
- Automation preference management per org
- Email notification delivery (configured but unverified)

### Auth / RBAC / Tenancy
- Supabase Auth (owner/manager path)
- PIN auth (employee path)
- 88-key permission catalog
- Two-layer security (app + RLS)
- Module-level permission toggles
- Financial data isolation (`project_profit.read` separate)
- Org-level tenancy with RLS
- Custom fields (for certain entity types)

### Dashboards & Reports
- Owner dashboard (15+ KPI cards)
- Monthly cash flow with drilldown
- Data confidence indicators
- Project health summary
- Global search (10 entity types)
- Financial reports with date range
- Expense reports
- Workforce reports
- Project profitability reports
- CSV/Excel export (14 entity kinds)

---

## 5. Integrations Map

| Integration | Type | Status | Notes |
|-------------|------|--------|-------|
| SUMIT | Accounting / Statutory docs | ✅ Live | Invoice, receipt, tax receipt. No recovery cron |
| OneDrive | Cloud Storage | ✅ Live | Full OAuth, folder hierarchy |
| Google Drive | Cloud Storage | ✅ Live | Full — native docs (Docs/Sheets) crash on download |
| Dropbox | Cloud Storage | ✅ Live | Full |
| Box | Cloud Storage | ✅ Live | Full |
| FRED | Market Data | ✅ Live | 9 series, daily cron |
| CBS Israel | Market Data | ✅ Live | 4 series, daily cron |
| Azure Document Intelligence | OCR | ✅ Implemented | Needs env var `AZURE_DI_ENDPOINT` to activate |
| Supabase Auth | Authentication | ✅ Live | Owner + manager path |
| Hashavshevet | Accounting | 🔴 Declared, not live | Adapter pattern ready, no provider wired |
| Priority | Accounting | 🔴 Declared, not live | Same |
| iCount | Accounting | 🔴 Declared, not live | Same |
| Morning | Accounting | 🔴 Declared, not live | Same |
| Green Invoice | Accounting | 🔴 Declared, not live | Same |
| LLM / AI | AI Assistant | 🔴 Declared, not live | 12 tools built, no `OPENAI_API_KEY` |
| External Calendar | Calendar sync | 🔴 Not implemented | OAuth not built |

---

## 6. Data & Architecture Map

### DB Domain Grouping

| Schema Domain | Key Tables | Migration Range |
|---------------|-----------|-----------------|
| Foundation / Tenancy | orgs, org_members, org_settings | 0000–0001 |
| Tax | tax_rules, tax_rates | 0002, 0007 |
| Billing / AR | billing_records, payment_records, statutory_documents | 0004, 0039, 0077, 0082, 0083, 0094 |
| Workforce | employees, rate_versions, attendance, time_entries | 0005, 0021, 0023, 0066–0068, 0086 |
| RLS Hardening | (policy migrations) | 0006, 0033, 0055, 0073, 0109, 0120, 0124 |
| Scheduling / Recurrence | service_dispatch, recurrence_rules | 0026 |
| Approvals | approval_requests, steps, rules | 0027 |
| Quotes / Estimates | quotes, quote_items, crm_quotes | 0025, 0043, 0053 |
| BOQ | boq_items, sections, progress, valuations | 0032–0035, 0042, 0045 |
| AP / Vendor | ap_bills, lines, inventory_layers | 0012, 0036, 0040, 0125–0127 |
| Documents | documents, versions, attachments | 0013, 0041, 0048, 0087 |
| Allocation Engine | allocation_runs, slices, policies | 0014–0018, 0084–0085 |
| Procurement | purchase_orders, po_lines, receipts | 0010, 0040 |
| Field Ops / Assets | field_ops_logs, assets, inventory | 0011, 0044 |
| RBAC / Permissions | roles, permissions, org_permissions | 0024, 0055, 0109, 0113 |
| True Cost / Profitability | margin_snapshots, true_cost_views | 0069–0071 |
| Workforce Contacts | employee_contacts, workforce_allocations | 0021 |
| Month Close | month_close_records, completeness_checks | 0037, 0027 |
| Change Orders | change_orders, ccv_events | 0038 |
| Retention | retention_holdback_records | 0030 |
| OCR | ocr_tasks, correction_memory | 0031 |
| UWM Tasks | tasks, workspaces, boards, stages, templates | 0097–0118 |
| Meetings / Calendar | meetings, action_items, calendar_events | 0106, 0057 |
| Automations | automation_presets, automation_runs | 0058, 0108 |
| Communications | message_threads, messages | 0057 |
| Portal | vendor_portal, client_portal | 0012 |
| Branding | org_branding | 0062 |
| Billing Plans | billing_plan_templates, items | 0065 |
| Payment Instruments | checks, bank_transfers, credit_cards | 0081 |
| Subcontract Advances | subcontract_advance_records | 0076 |
| Employee App | employee_app_users, pin_seals | 0088–0091 |
| Payroll Obligations | payroll_obligation_payments | 0092 |
| Invoicing (SUMIT) Hardening | sumit_issuance_log | 0093 |
| Quick Capture | quick_capture_items | 0131 |
| Material Market | market_monitors, trade_scores, price_obs | 0132 |

### Architectural Risks

1. **`shared/permissions/authorize.ts` imports from `@/modules/employee-app/`** — illegal downward dependency. Shared layer must not depend on feature modules.

2. **Closeout / Warranty ORM gap** — `project_closeouts` and warranty tables exist only in raw SQL migration `0056`, not in Drizzle schema files. All queries use raw SQL with no type safety.

3. **Duplicate `quick-capture` export in `drizzle/schema/index.ts`** — minor but signals schema index isn't validated.

4. **App-layer-only month close freeze** — no DB triggers prevent writes to closed periods. A single missed `assertPeriodOpen()` call can silently corrupt history.

5. **Notification scanner coupling** — `runNotificationScan` knows about 22 domain concerns. Adding a new scan type requires modifying the central scanner function.

6. **Margin snapshot generation** — triggered on page load, not via batch job. For organizations with many unvisited projects, the org-level margin trend dashboard shows incomplete data.

---

## 7. Gaps / Findings

Full consolidated table from all 10 domain audits. Duplicates resolved (A+B both reported change-order→billing gap — merged to one finding).

| # | Priority | Type | Area | Finding | Current Behavior | Why It Matters | Suggested Direction |
|---|----------|------|------|---------|-----------------|----------------|---------------------|
| 1 | P0 | BUG | Notifications | Full notification scan cron is missing | `ops-worker` only calls `runTaskReminderOpsWorker`. All 20+ other scanners never fire | Billing overdue, warranty expiry, budget overrun, AP due, closeout blocker notifications are all silent | Add `runNotificationScan` to the ops-worker cron schedule |
| 2 | P0 | BUG | Tasks | Task reminders never delivered | `task_reminders` table + UI + logic exist; no scheduler fires `remind_at` | Users set reminders that silently never arrive | Add task reminder processing to ops-worker |
| 3 | P0 | FLOW GAP | CRM | CRM Sales Quotes are a dead end | No conversion path from CRM quote to product quote or project | Entire sales pipeline breaks at the handoff moment | Add `Convert to Product Quote` action that seeds quote items |
| 4 | P0 | FLOW GAP | Billing | Change orders don't flow to AR | Approved change orders update CCV but no billing record is created | Approved revenue is trapped in contract ledger, never reaches invoicing | Implement `ChangeOrderBillingHandoff` backend — auto-suggest billing records on change approval |
| 5 | P0 | INTEGRATION GAP | Documents | SUMIT statutory PDFs not saved to org storage | PDF documents exist only on SUMIT's servers | Legal record gap; if SUMIT changes URL structure or org closes account, invoices are unrecoverable | After successful SUMIT issuance, download PDF and save to org's configured storage folder |
| 6 | P0 | BUG | Documents | Google Drive native docs crash on download | Unhandled `ProviderHttpError 400` when downloading Docs/Sheets/Slides | Any org using Google Drive native docs gets a silent crash | Handle `exportLinks` path for Google Workspace files; export to PDF/XLSX instead |
| 7 | P0 | INTEGRATION GAP | Approvals | Two parallel approval systems | Commercial change approvals use `commercial_approvals` table; unified inbox uses `approval_requests` | Change approvals invisible in inbox; can't use multi-step rules or threshold engine | Migrate commercial approvals to use the unified `approval_requests` engine |
| 8 | P0 | INTEGRATION GAP | Notifications | Task collaboration notifications never emitted | `task_assigned_to_you`, `task_comment_mention`, `task_approval_requested` declared but no emitter in server actions | Assigning tasks, mentioning users, requesting approvals generates zero notifications | Add `emitNotification()` calls to task assignment, comment, and approval server actions |
| 9 | P0 | ARCHITECTURE GAP | Auth | Illegal module import in shared layer | `shared/permissions/authorize.ts` imports 4 symbols from `@/modules/employee-app/` | Circular risk; shared layer must not depend on feature modules | Inject employee-app awareness through `OrgContext` instead |
| 10 | P0 | ARCHITECTURE GAP | Auth | `middleware.ts` session refresh unclear | Supabase cookie-refresh helper defined but root `middleware.ts` wiring may be absent | Sessions can expire silently mid-navigation, causing invisible auth failures | Verify/create root `middleware.ts` that calls Supabase session refresh |
| 11 | P0 | DATA GAP | Expenses | No DB-level freeze on closed months | Only `assertPeriodOpen()` app-layer check; no DB triggers | Any missed guard or direct SQL can silently corrupt closed-period cost history | Add DB-level CHECK or trigger on expense/allocation tables for `period_closed` status |
| 12 | P0 | INTEGRATION GAP | Notifications | AI assistant has no LLM provider | 12 tools built, DB data piped; `UnconfiguredAssistantProvider` formats raw results only | Feature is invisible value — full infrastructure ready, no AI output | Wire `OPENAI_API_KEY` (or equivalent) to complete the adapter |
| 13 | P1 | FLOW GAP | Workforce | Attendance → labor cost bridge is manual | Attendance records exist separately from time entries; no auto-conversion | In field-worker scenarios, managers must manually create time entries from attendance | Add optional "auto-generate time entries from approved attendance" setting per org |
| 14 | P1 | DATA GAP | CRM | Quote lines discarded on project conversion | Only the total amount seeds the contract; all line items (qty, unit price, estimated cost) are lost | BOQ must be rebuilt from scratch; estimated costs from quote are never utilized | Seed BOQ items from quote line items on conversion (with ability to edit) |
| 15 | P1 | BUG | CRM | Quote expiry never enforced | `validityDate` stored; no job or acceptance gate enforces it | Clients can accept expired quotes; stale pricing enters contracts | Add expiry check to quote acceptance server action + cron flag |
| 16 | P1 | FLOW GAP | Projects | Closeout doesn't prompt warranty setup | Project completion date = natural warranty start; no UX moment triggered | Warranty module exists but is never populated from closeout | Add "Setup warranty coverage" step to closeout checklist |
| 17 | P1 | BUG | Projects | Warranty reminders never fire | `reminderDaysBefore` stored; no scanner processes it | Warranty expirations pass without notice — legal / client relations risk | Add warranty expiry scan to notification scanner (cron already needed per finding #1) |
| 18 | P1 | FLOW GAP | Projects | BOQ subcontractor AP reconciliation missing | BOQ valuation creates "proposed AP bill" with no confirmation that AP was actually posted | Committed subcontractor costs can remain permanently unreconciled | Add reconciliation status to BOQ valuation; alert when valuation has no matched AP bill |
| 19 | P1 | ARCHITECTURE GAP | Projects | Closeout/warranty not in Drizzle ORM | `project_closeouts` and warranty tables exist only in migration `0056`, not in schema files | All closeout/warranty queries are raw SQL with no type safety | Add Drizzle schema files for closeout and warranty |
| 20 | P1 | DATA GAP | Expenses | Multi-currency expenses silently dropped | FX expenses excluded from all Actual/Forecast aggregation | Orgs with FX vendors see systematically understated margins | Either convert to ILS at recorded rate or surface FX amounts separately |
| 21 | P1 | DATA GAP | Expenses | Discipline/cost-code budget lines unmapped | Budget lines for trade/discipline have no carrier key to expense records | Advanced budget mode shows actuals for top-level only; no trade-level variance | Add `cost_code_id` FK to budget line items |
| 22 | P1 | DATA GAP | Expenses | Margin snapshots lazy (no batch) | Snapshots triggered on page load only | Org-level margin trend dashboard incomplete for unvisited projects | Add batch snapshot job to ops-worker |
| 23 | P1 | FLOW GAP | Expenses | Recurring drafts require manual generation | No cron/scheduler; operators must manually trigger recurring expense generation | Overhead expenses miss months when operators forget | Add recurring expense generation to ops-worker cron |
| 24 | P1 | DATA GAP | Workforce | `correctsRateVersionId` never populated | Correction chain column exists but is never written by rate-version server actions | Rate correction history chain is broken at data level | Populate `correctsRateVersionId` when creating a correction rate version |
| 25 | P1 | UX GAP | Workforce | Employee attendance correction not available | Employee self-service is today-only; no correction request path | Employees who forget to log attendance have no self-service recourse | Add "Request attendance correction" flow in employee app |
| 26 | P1 | INTEGRATION GAP | Tasks | Forms can't attach to tasks | `FORM_OWNER_TYPES` does not include `task` | Task-level safety checklists / acknowledgement forms can't be wired | Add `task` to `FORM_OWNER_TYPES` enum |
| 27 | P1 | FLOW GAP | Tasks | Meeting → Task creation broken | `source='meeting_action'` is dead code; action items can link to existing tasks but can't create them | Meeting follow-ups require leaving the meeting screen to manually create tasks | Implement "Create task from action item" button |
| 28 | P1 | DATA GAP | Tasks | Progress defaults to opt-in per task | `contributes_to_progress = false` by default | Entire project progress tracking system is de-facto unused | Change default to `true`, or add workspace-level default toggle |
| 29 | P1 | INTEGRATION GAP | Documents | Generated documents fail without cloud provider | "Save to storage" has no Supabase Storage fallback | Orgs that haven't connected a cloud provider can't generate or save docs | Add Supabase Storage as a fallback bucket for generated docs |
| 30 | P1 | INTEGRATION GAP | Material Market | Material intelligence completely isolated | No connection between market pressure scores and procurement, budgets, or project risk | Owner sees score 74/100 for electrical, has no path to act on it | Surface market pressure on procurement screens + procurement-level alerts |
| 31 | P1 | DATA GAP | Material Market | Supplier signal always null | Plumbing supplier signal (15–30% weight) is always missing | Trade scores systematically computed on ~70% of intended data | Connect `material_vendor_prices` (already in DB) as the supplier signal series |
| 32 | P1 | BUG | Material Market | EUR/ILS tagged as electrical trade | Registry entry `trade: 'electrical'` should be `null` (cross-trade FX) | EUR/ILS fluctuation incorrectly inflates electrical trade score | Fix registry entry to `trade: null` |
| 33 | P1 | INTEGRATION GAP | Notifications | No accounting integration live | All 5 accounting adapters (Hashavshevet, Priority, iCount, Morning, Green Invoice) return `connected: false` | Orgs using local accounting software have no data bridge | Wire at least one adapter (Priority is most common in IL construction) |
| 34 | P1 | FLOW GAP | SUMIT | No SUMIT recovery cron | Ambiguous SUMIT outcomes (timeouts) stay stuck in `ambiguous/pending` forever | Statutory docs can be lost; only manual "Refresh Status" recovers them | Add SUMIT status poll to ops-worker cron for `ambiguous` records |
| 35 | P1 | DATA GAP | Search | Only 10 of 41 entity types searchable | Expenses, POs, safety records, inventory items, assets, field ops logs return no search results | Critical operational data invisible in global search | Index remaining high-value entity types (at minimum: expenses, POs, safety records) |
| 36 | P1 | FLOW GAP | Automations | 6 event-based automation presets permanently unavailable | `task_assigned_to_you`, `task_comment_mention`, `task_approval_requested` shown in UI but do nothing | Users configure automations that silently never fire | Either implement event emitters or hide these presets until implemented |
| 37 | P1 | ARCHITECTURE GAP | Performance | API v1 projects pagination is in-memory | Full table scan + JS filter; no cursor pushed to SQL | Will degrade with org scale | Push cursor to SQL query |
| 38 | P2 | UX GAP | Workforce | Timesheet vs time-entry dual approval ambiguous | Two approval paths exist with unclear relationship | Manager confusion about which to use; possible double-counting risk | Document or merge the two approval paths clearly |
| 39 | P2 | UX GAP | Workforce | No onboarding guard for work calendar config | Missing config causes silent failures in daily/monthly rate cost calculations | New orgs with no calendar config get wrong cost figures with no error | Add config completeness check + warning on workforce setup |
| 40 | P2 | ARCHITECTURE GAP | Projects | BOQ finalization state in two places | Finalization flag tracked in DB and in a separate event ledger | Risk of state divergence | Consolidate to single source of truth |
| 41 | P2 | DATA GAP | Billing | Reconciliation mismatches silently stored | `reconciliation_status = mismatch` computed and stored; no alert or dashboard card | Payment mismatches can accumulate unnoticed | Add mismatch card to billing dashboard; trigger notification |
| 42 | P2 | UX GAP | Documents | Document expiry not enforced | `expiry_date` stored; no notification, no gate | Expired documents remain active with no warning | Add expiry check to document scanner; notification before expiry |
| 43 | P2 | UX GAP | Documents | No external share link generation | Web Share API only (device share sheet) | Can't generate a shareable link to a document | Add signed URL generation with expiry |
| 44 | P2 | UX GAP | Tasks | Task followers stored but not notified | `task_followers` table exists; no notification emitted to followers | Following a task has no practical effect | Either implement follower notifications or remove the feature |
| 45 | P2 | UX GAP | Tasks | WIP limits not enforced | Schema column exists; no enforcement logic | Board stages allow unlimited work items | Add WIP limit check on task status transition |
| 46 | P2 | DATA GAP | Tasks | External calendar sync not implemented | Internal calendar only; no OAuth for Google/Outlook | Tasks with due dates invisible in user's primary calendar | Implement calendar OAuth sync (or at minimum, iCal export) |
| 47 | P2 | FLOW GAP | Billing | Banking reconciliation lacks financial write-through | `mutates_financials = false` is a DB CHECK | After reconciling in the banking module, user must duplicate the entry in billing | Implement write-through or clear handoff prompt |
| 48 | P2 | INTEGRATION GAP | Custom Fields | Custom fields missing on tasks / work orders | Entity type enum doesn't include `task`, `work_order`, `work_order_check_item` | Custom metadata for task tracking unavailable | Add entity types to the custom fields enum |
| 49 | P2 | FLOW GAP | Offline | Offline drafts lack Background Sync API | Service worker captures drafts but relies on tab staying open for sync | Field workers lose data if tab closes before sync completes | Implement Background Sync API in service worker |
| 50 | P2 | FLOW GAP | Billing | Recurring billing never auto-finalizes | System explicitly marked "CLOSED BY DESIGN — explicit generate only" | Subscription billing has no automated end-to-end flow | Add auto-finalize option per recurring template |
| 51 | P3 | OPPORTUNITY | Material Market | 5 trades not yet built | Concrete, cement, wood, ceramic, PVC researched but not implemented in score engine | Score coverage limited | Build remaining trade models using same architecture |
| 52 | P3 | CLEANUP | Search | 31 entity types declared but not indexed | Dead declarations in search type catalog | Code confusion | Either implement or remove from catalog |
| 53 | P3 | CLEANUP | Automations | 6 event-preset UX entries permanently unavailable | Shown in UI as configurable but never fire | User frustration and false confidence | Hide behind feature flag until implemented |
| 54 | P3 | CLEANUP | Projects | `project_closeouts` in raw SQL only | No Drizzle ORM for closeout/warranty | Type-safety gap | Generate Drizzle schema from existing SQL |
| 55 | P3 | OPPORTUNITY | Tasks | Quick Capture should also support quick-task | Currently document OCR pipeline only | Expected mobile "fast capture" UX missing | Add quick-task creation mode alongside document capture |

---

## 8. Missing Cross-Module Connections

These are the most impactful data bridges that exist in one module but aren't utilized in another:

### 1. Approved Change Orders → Billing Records
**Data that exists:** Approved change orders with amounts, project linkage, CCV event
**Missing:** Auto-suggestion or creation of billing records reflecting approved revenue  
**Impact:** Revenue approved in commercial module is never reflected in AR until manually entered  
**Effort:** Medium

### 2. CRM Sales Quote → Product Quote → BOQ
**Data that exists:** CRM quote line items (item name, qty, unit price, estimated cost)  
**Missing:** Conversion path from CRM quote to product quote; quote line items to BOQ seeds  
**Impact:** Full sales-to-execution pipeline broken; rework at every deal  
**Effort:** Medium

### 3. Material Vendor Prices → Market Pressure Signal
**Data that exists:** `material_vendor_prices` table in the DB with historical actual purchase prices per item  
**Missing:** This data is not fed into the supplier signal component of trade scores  
**Impact:** Supplier signal (15–30% of score) is always null; scores are systematically incomplete  
**Effort:** Low — the architecture already expects this data source

### 4. Material Pressure Score → Procurement / Project Risk
**Data that exists:** Live market pressure scores per trade (0–100)  
**Missing:** Surface scores on PO screens, project budget pages; alert when buying high-pressure materials  
**Impact:** Market intelligence is informational only — cannot drive procurement decisions  
**Effort:** Low–Medium (display) + Medium (alert engine)

### 5. Task Completion → Project Progress
**Data that exists:** Task completion statuses, project linkage  
**Missing:** `contributes_to_progress` defaults false; no progress aggregation runs automatically  
**Impact:** Project progress tracking is de-facto unused despite full infrastructure  
**Effort:** Low (change default + ensure aggregation query runs)

### 6. Meeting Action Items → Task Creation
**Data that exists:** Meeting action items with text, owner, due date  
**Missing:** "Create task from action item" button; `source='meeting_action'` is dead enum value  
**Impact:** Meeting follow-ups require manual recreation in task module  
**Effort:** Low

### 7. Attendance Records → Time Entries
**Data that exists:** Full attendance records with hours per employee per day  
**Missing:** Auto-conversion bridge to time entries with project allocation  
**Impact:** Field-worker scenarios require manual re-entry of attendance data into time entries  
**Effort:** Medium (needs allocation hints UI)

### 8. SUMIT Statutory PDFs → Org Storage
**Data that exists:** SUMIT document URL + document number on issuance  
**Missing:** PDF download + store to org's configured cloud storage folder  
**Impact:** Statutory invoices not under org control; legal records gap  
**Effort:** Low (same storage infrastructure used for all other docs)

### 9. Document Expiry → Notification / Gate
**Data that exists:** `expiry_date` on document records  
**Missing:** Scanner that fires before/on expiry; no acceptance gate on expired docs  
**Impact:** Expired insurance certificates, permits, contracts remain active with no warning  
**Effort:** Low (add to notification scanner, same architecture as other scanners)

### 10. BOQ Subcontractor Valuation → AP Bill Reconciliation
**Data that exists:** BOQ valuation amounts with vendor references  
**Missing:** Link from valuation to actual AP bill; reconciliation status tracking  
**Impact:** Committed subcontractor costs can remain unreconciled indefinitely  
**Effort:** Medium

---

## 9. Recommended New Features

| # | Priority | Feature | Business Value | Existing Infrastructure Reused | Effort | Why Now |
|---|----------|---------|---------------|-------------------------------|--------|---------|
| R1 | P0 | **Full Notification Cron** — add `runNotificationScan` to ops-worker | All 20+ scanners fire as designed. Billing overdue, warranty expiry, budget overrun, AP due begin working | Notification scanner already written; cron already exists | **Low** | 1-line cron addition unlocks 20+ features |
| R2 | P0 | **Task Reminder Delivery** — add task reminder processor to ops-worker | Users receive reminders they already set | `task_reminders` table fully built; scanner logic exists | **Low** | Same as above — cron gap |
| R3 | P0 | **SUMIT Recovery Cron** — poll `ambiguous` statutory documents on schedule | No broken statutory docs pile up silently | SUMIT adapter, poll endpoint, `statutory_documents` table all exist | **Low** | Prevents legal records gaps |
| R4 | P1 | **CRM Quote → Project Conversion** — convert sales quote to product quote then project | Eliminates full re-entry on every won deal | `crm_quotes` and `quotes` tables both exist; conversion server action pattern already used | **Medium** | Closes the most visible sales pipeline break |
| R5 | P1 | **Quote Lines → BOQ Seed** — convert quote line items into BOQ items on project creation | Estimated costs flow from quote into execution; no manual rebuild | Both `quote_items` and `boq_items` exist; unit/qty/price mapping straightforward | **Medium** | Eliminates rework; connects sales estimates to project budget |
| R6 | P1 | **SUMIT PDF → Storage Archive** — download and store SUMIT PDFs post-issuance | Org controls its own statutory document archive | Storage providers and SUMIT adapter both live; same document versioning infrastructure | **Low** | Legal records gap; one-time pipe addition |
| R7 | P1 | **Attendance → Time Entry Auto-Bridge** — optional org setting to auto-create time entries from approved attendance | Eliminates daily manual re-entry for field orgs | Both modules exist; allocation model already defined | **Medium** | Biggest friction in field-worker workflows |
| R8 | P1 | **Material Pressure → Procurement Alerts** — surface trade score and trend on PO creation screen | Owner sees market context when committing to purchases | Market score engine live; PO module exists; notification system can send alerts | **Low–Medium** | Makes market intelligence actionable without new data |
| R9 | P1 | **Supplier Signal from Vendor Prices** — feed `material_vendor_prices` into material pressure supplier signal | Completes the score model; plumbing score becomes accurate | `material_vendor_prices` already in DB; scoring architecture expects this source | **Low** | Bug fix + data quality improvement |
| R10 | P1 | **Change Order → Billing Auto-Suggest** — when change order approved, suggest billing record creation | Approved revenue reaches AR without manual step | `change_orders`, `billing_records`, CCV events all exist | **Medium** | Closes the most common cause of billing delays |
| R11 | P1 | **Unified Approval Inbox for Changes** — migrate commercial approvals to use unified `approval_requests` engine | Single approval inbox; change approvals get threshold rules and multi-step workflows | `approval_requests` engine fully built; just needs commercial module to use it | **Medium** | Dual system creates confusion and missed approvals |
| R12 | P1 | **OCR Activation** — add `AZURE_DI_ENDPOINT` env var to production | Vendor invoice scanning live | Azure DI pipeline, Hebrew correction memory, durable queue all built | **Low** | Infrastructure complete; just needs env var |
| R13 | P1 | **Supabase Storage Fallback for Generated Docs** — use Supabase bucket when no cloud provider configured | Orgs without OneDrive/GDrive etc. can generate and save docs | Supabase storage already used for other assets | **Low** | Unblocks generated documents for all orgs |
| R14 | P2 | **Google Drive Native Doc Export** — detect Docs/Sheets/Slides and use `exportLinks` path | Prevents crash for Google Workspace users | Google Drive provider already implemented; just needs MIME type branching | **Low** | Bug fix |
| R15 | P2 | **Meeting → Task Creation** — "Create task from action item" in meeting screen | Meeting action items become tasks without leaving context | `tasks` server actions + `meeting_action_items` both exist; `source='meeting_action'` ready | **Low** | Small feature, immediate value |
| R16 | P2 | **Project Progress Opt-Out Default Change** — change `contributes_to_progress` default to `true` | Project progress tracking works without per-task configuration | Progress aggregation query exists | **Low** | Schema default change only |
| R17 | P2 | **Task Collaboration Notifications** — emit notifications on task assignment, mention, approval | Users know when they're assigned or mentioned | Notification types already declared; server action hooks just need `emitNotification()` calls | **Low** | Code addition only; infrastructure complete |
| R18 | P2 | **Billing Reconciliation Alert** — surface `reconciliation_status = mismatch` on dashboard | Payment discrepancies visible immediately | `reconciliation_status` already computed and stored | **Low** | Data is there; just needs display |
| R19 | P2 | **Document Expiry Notification** — alert before permits/certificates expire | No expired document passes unnoticed | `expiry_date` stored; notification scanner pattern established | **Low** | Same scanner pattern as 20 others |
| R20 | P2 | **Extended Search Coverage** — index expenses, POs, safety records in global search | Critical operational data findable from one place | Search infrastructure exists; just needs entity providers | **Medium** | 31 of 41 declared types not yet indexed |
| R21 | P3 | **Calendar Sync Export** — iCal export for tasks with due dates | Tasks visible in user's primary calendar | Calendar module exists; RFC 5545 support already built | **Low** | Low-effort discoverability improvement |
| R22 | P3 | **Material Market: Build Remaining Trades** — concrete, cement, wood, ceramic, PVC | Full coverage of common construction materials | Scoring architecture + CBS/FRED data already in place | **Medium** | Research already done (`research/` folder) |
| R23 | P3 | **WIP Limit Enforcement** — enforce board stage WIP limits | Lean workflow management | `wip_limit` column exists; just needs transition check | **Low** | Schema is ready |

---

## 10. UX / Navigation Review

### Features That Are Hard to Find

| Feature | Where It Lives | Problem |
|---------|---------------|---------|
| BOQ progress billing | `/projects/[id]/boq` sub-tab | Only accessible from inside project; no billing shortcut |
| Material market intelligence | Separate top-nav section | Not connected to procurement or project screens |
| Document expiry date setting | Document metadata panel | Not prompted at upload; no reminder surfaced anywhere |
| Subcontract advances | Vendor/subcontract sub-page | Buried under vendor profile |
| Rate version history | Employee profile sub-tab | No timeline view |
| Change order commercial approval | Commercial module | Separate from unified approval inbox |
| Quick Capture | Separate module | Actually a document pipeline, marketed as task capture |

### Flows With Too Many Manual Steps

| Flow | Extra Steps | Fix |
|------|-------------|-----|
| Won deal → Project start | CRM quote → manually re-enter product quote → manually create project | CRM quote → project direct conversion |
| Approved change → Invoice | Change approved → manually open billing → manually create record | Auto-suggest billing after change approval |
| Attendance → Project cost | Attendance recorded → manually open time entries → manually create entry + allocate | Optional auto-bridge |
| Month close → SUMIT archive | SUMIT issued → no automatic PDF save | Auto-archive on issuance |

### Duplicate / Confusing Screens

- **Two approval flows:** Unified inbox (`/approvals`) vs commercial change approvals (buried in project commercial tab) — user has to check two places
- **Two time tracking paths:** Timesheets vs individual time entries — unclear which is canonical
- **Quick Capture vs Task creation** — Quick Capture is actually document OCR; "quick task" has no mobile FAB

### RTL / Hebrew

- RTL layout is generally applied consistently
- Excel export uses RTL-safe formatting
- OCR has Hebrew-native support (pending activation)
- No flagged RTL layout bugs

---

## 11. Automation Opportunities

Listed by implementation readiness (highest first):

| # | Automation | Trigger | Action | Effort | Value |
|---|-----------|---------|--------|--------|-------|
| A1 | Full notification scan | Cron 06:00 UTC | Run all 20+ scanners | Low | High — unlocks 20+ notifications |
| A2 | Task reminders | Cron (check `remind_at`) | Send in-app/email notification | Low | High |
| A3 | SUMIT ambiguous recovery | Cron (every hour) | Poll SUMIT for status update | Low | High |
| A4 | SUMIT PDF archival | Post-issuance hook | Download + save to org storage | Low | High |
| A5 | Recurring expense generation | Cron (monthly) | Create expense records from templates | Low | Medium |
| A6 | Margin snapshot batch | Cron (nightly) | Compute snapshots for all projects | Low | Medium |
| A7 | Change order → billing suggestion | Change approved event | Create draft billing record | Medium | High |
| A8 | Task collaboration notifications | Task assignment / comment / mention | Emit notification to relevant users | Low | High |
| A9 | Quote expiry enforcement | Cron (daily) | Mark expired quotes; gate acceptance | Low | Medium |
| A10 | Warranty expiry reminder | Cron (check `reminderDaysBefore`) | Notify owner before warranty expires | Low | High |
| A11 | Material pressure alert | Cron (on score change > threshold) | Notify owner when trade score spikes | Medium | Medium |
| A12 | Attendance → time entry bridge | Attendance approved event | Create time entries (if org opt-in) | Medium | High |
| A13 | BOQ valuation reconciliation alert | Cron (check unmatched valuations) | Alert when valuation has no AP bill | Medium | Medium |

---

## 12. Performance / Cost Risks

Only meaningful risks reported:

| # | Area | Risk | Why It Matters | Fix |
|---|------|------|----------------|-----|
| P1 | API v1 Projects | In-memory pagination — full table scan + JS filter | Will degrade O(n) with org project count | Push cursor to SQL; add DB index on `(org_id, created_at)` |
| P2 | Margin Snapshots | Page-load triggered — no batch job | Dashboard aggregation incomplete; O(n) queries on visit | Add nightly batch snapshot to ops-worker |
| P3 | Dashboard Aggregation | Some KPI cards do fresh aggregation queries on load | At scale, dashboard load time will increase | Introduce 15-min snapshot cache for heavy aggregations |
| P4 | Notification Scanner | `runNotificationScan` (when eventually cron'd) scans all 22 types in one pass | Will grow with org data | Shard scanners; run lower-priority ones less frequently |
| P5 | Search | Full-text search not yet indexed on all entity types | Adding more types naively increases search latency | Use Postgres `tsvector` indexes consistently across all searchable tables |

---

## 13. Cleanup Candidates

| # | Item | Type | Reason |
|---|------|------|--------|
| C1 | 31 undeclared search entity types in catalog | Dead code | Types declared but no provider — causes false search expectations |
| C2 | 6 event-based automation presets shown in UI | Dead UX | Always unavailable; creates false confidence |
| C3 | `source='meeting_action'` enum value in tasks | Dead code | Never written; meeting→task not implemented |
| C4 | `task_followers` insert/read without notification emit | Incomplete feature | Followers stored but never notified |
| C5 | Duplicate `quick-capture` export in `drizzle/schema/index.ts` | Code defect | Minor naming collision risk |
| C6 | `mutates_financials = false` DB CHECK in banking | Design decision artifact | The CHECK documents intent but blocks useful write-through; should be reconsidered or documented |
| C7 | `UnconfiguredAssistantProvider` in assistant module | Stub | Returns formatted raw text; entire LLM path is a stub |
| C8 | `UnconfiguredAccountingAdapter` × 5 accounting providers | Stubs | All return `connected: false`; creates dead UI states |
| C9 | `correctsRateVersionId` column never written | Incomplete feature | Data model correct but server actions don't populate it |

---

## 14. Final Prioritized Roadmap

### NOW — Close the Most Impactful Gaps First

These are low-effort, high-value, and fix things that are either broken or actively misleading:

1. **Add `runNotificationScan` to ops-worker cron** — 1-line change; unlocks 20+ notification types (finding #1)
2. **Add task reminder processing to ops-worker** — 1-line change; reminders start working (finding #2)
3. **Add SUMIT recovery cron** — prevents statutory document pile-up (finding #34)
4. **Add SUMIT PDF → storage archive** — closes legal records gap (finding #5)
5. **Fix `middleware.ts` session refresh** — verify/create root middleware (finding #10)
6. **Fix EUR/ILS market registry tag** — 1-line bug fix (finding #32)
7. **Fix Google Drive native doc download** — handle `exportLinks` MIME path (finding #6)
8. **Add `task` to `FORM_OWNER_TYPES`** — 1-line enum addition (finding #26)
9. **Emit notifications on task assign/comment/mention** — add `emitNotification()` to 3 server actions (finding #8)
10. **Fix `shared/permissions/authorize.ts` import** — refactor illegal dependency (finding #9)
11. **Add Supabase Storage fallback for generated docs** — unblocks all orgs without cloud provider (finding #29)
12. **Connect `material_vendor_prices` as supplier signal** — completes score model (finding #31)
13. **Hide unavailable automation presets** — remove false confidence from UI (finding #36, C2)
14. **Activate OCR** — set `AZURE_DI_ENDPOINT` env var; instant AP scanning capability (R12)

### NEXT — Close Flow Gaps and High-Value Feature Completion

These require more implementation but are closely connected to existing infrastructure:

1. **CRM Quote → Project direct conversion** with line item seeding to BOQ (findings #3, #14)
2. **Unified approval inbox for commercial changes** — migrate to `approval_requests` engine (finding #7)
3. **Change order → Billing auto-suggest** — connect approved revenue to AR (finding #4)
4. **Attendance → Time entry optional auto-bridge** (finding #13)
5. **Material pressure scores on procurement screens** — make market intelligence operational (finding #30)
6. **Recurring expense cron** — monthly auto-generation (finding #23)
7. **Margin snapshot batch job** — nightly compute (finding #22)
8. **Closeout → Warranty setup prompt** (finding #16)
9. **Quote expiry enforcement** — cron + acceptance gate (finding #15)
10. **BOQ subcontractor AP reconciliation** — link valuation to AP bill (finding #18)
11. **Meeting → Task creation** (finding #27, R15)
12. **Add `task`, `work_order` to custom fields entity types** (finding #48)
13. **Project progress default: change `contributes_to_progress` default to `true`** (finding #28)
14. **Billing reconciliation mismatch alert** on dashboard (finding #41)
15. **Document expiry notification** (finding #42)
16. **Wire accounting integration adapter** (Priority or iCount recommended for IL market) (finding #33)

### LATER — Strategic Capabilities

These are valuable but less urgent or require more planning:

1. **AI Assistant LLM wiring** — infrastructure complete; wire `OPENAI_API_KEY` (finding #12)
2. **DB-level freeze triggers for closed months** (finding #11)
3. **Extended search coverage** — expenses, POs, safety records (finding #35)
4. **External calendar sync (iCal export)** (finding #46, R21)
5. **Signed document share links** (finding #43)
6. **Material market: build remaining 5 trades** (finding #51, R22)
7. **WIP limit enforcement** (finding #45)
8. **Background Sync API for offline drafts** (finding #49)
9. **Closeout/warranty Drizzle ORM schema** (finding #19, C4)
10. **API v1 pagination SQL cursor fix** (finding #37)

---

*Audit conducted 2026-09-27 by 10 parallel domain agents on ~2,400 source files and 133 migrations. Zero reliance on prior audits. All findings are from first-principles code reading.*
