# ProjectFlow — Complete Capability Map V2

**Overnight close date:** 14 August 2026  
**Baseline parent:** `4b1099eb756d1b2ec366f274be054afeded710f8`  
**Nature:** Post-overnight product truth. Portal remains **OFF**. Migrations **0036–0045 are applied**. **0000–0045 are immutable history.**  
**Nature:** Post-overnight product truth. Portal remains **OFF**. Migrations **0036–0045 are applied**. **0000–0045 are immutable history.**  
**Companion:** [`PROJECTFLOW-CAPABILITY-MATRIX-V2.csv`](./PROJECTFLOW-CAPABILITY-MATRIX-V2.csv)

V1 (pre-overnight, same HEAD): [`PROJECTFLOW-COMPLETE-CAPABILITY-MAP.md`](./PROJECTFLOW-COMPLETE-CAPABILITY-MAP.md)

How to read this document:

- Business meaning is first. File paths are supporting evidence, not the product.
- A database table is **not** a finished feature. A button is **not** a finished feature if the workflow behind it is incomplete.
- Status words are exact: **FULL**, **OPTIONAL-FULL**, **PARTIAL**, **FOUNDATION**, **DISABLED**, **NOT-IMPLEMENTED**.
- Do not inflate: FULL stayed **67**. New work moved PARTIAL / FOUNDATION / NOT-IMPLEMENTED into OPTIONAL-FULL where the workflow is real.

---

## Before overnight vs after overnight

| Status | Before | After |
|---|---|---|
| FULL | **67** | **67** |
| OPTIONAL-FULL | **61** | **79** |
| PARTIAL | **14** | **8** |
| FOUNDATION | **15** | **10** |
| DISABLED | **3** | **3** |
| NOT-IMPLEMENTED | **15** | **8** |
| **Total mapped** | **175** | **175** |

Portal DISABLED policy is unchanged.

### Every prior PARTIAL / FOUNDATION / gap

| Capability (V1 status) | After overnight |
|---|---|
| AP bill net/tax split (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — Actual = NET, payable/aging = GROSS; historical `legacy_undivided` tax=0 |
| AR split payment across invoices (PARTIAL) | **OPTIONAL-FULL** — `payment_applications`; locks; retention collectible cap; same-client |
| Client AR / financial 360 (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — client financial panel uses existing outstanding truth |
| Document numbering settings (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — org sequences; consume ≠ settings-write permission |
| Dedicated mobile BOQ measure (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — `/projects/[id]/boq-measure`; money keys omitted |
| BOQ subcontractor → AP (PARTIAL) | **OPTIONAL-FULL** — explicit **draft** AP only; no Actual until post |
| Overhead owner surface (PARTIAL) | **OPTIONAL-FULL** — `/overhead` on existing expense engine |
| Field photos on create (PARTIAL) | **OPTIONAL-FULL** — staging + attach on save |
| Change Order commercial reversal (PARTIAL) | **OPTIONAL-FULL** — reversing CO insert; scoped BOQ unwind |
| PO receiving (FOUNDATION) | **OPTIONAL-FULL** — qty receipts; no Actual; full qty stays `partially_received` (no `received` status) |
| Inventory qty movements (FOUNDATION) | **OPTIONAL-FULL** — locations + transfer; movement-driven balances; **no costing** |
| Warehouse locations / transfers / costing (NOT-IMPLEMENTED) | **OPTIONAL-FULL** for locations/transfers qty-only; costing/reservations remain excluded |
| WO checklist ↔ Forms (FOUNDATION) | **OPTIONAL-FULL** — required template blocks complete |
| Quote discount approval (FOUNDATION) | **OPTIONAL-FULL** — `quote_discount` gate on send |
| Time correction approval (FOUNDATION) | **OPTIONAL-FULL** — `time_correction` gate; Actual unchanged until approved |
| Month-close DB freeze (PARTIAL, app-only) | **OPTIONAL-FULL** — 0037 DB freeze; payments recorded→void only |
| CRM kanban / follow-ups (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — board + next-action fields; **no email reminders** |
| Search custom fields (NOT-IMPLEMENTED) | **OPTIONAL-FULL** — text/select on project/client/employee/vendor |
| Reports too centralized (FULL but UX gap) | **FULL** — `/reports?section=` deep links; still not a BI catalog |
| Job people free-text (UX gap) | Closed — employee assignment picker on job create |
| Sales/quote confusion (UX gap) | Closed — `/sales` hub; objects not merged |
| Inventory costing / FIFO / average | **INTENTIONALLY EXCLUDED** this wave — qty-only, financial effect NONE |
| Statutory Israeli invoicing | **DISABLED** (unchanged) |
| Public portal login | **DISABLED** (unchanged) |
| BOQ progress → Actual | **DISABLED** (unchanged, Progress ≠ Actual) |
| Multi-contract UX (PARTIAL) | **PARTIAL** (unchanged) |
| Contract `adjustment` kind (FOUNDATION) | **FOUNDATION** (unchanged) |
| Client timeline (PARTIAL) | **PARTIAL** (unchanged) |
| Timesheet submit/approve product (PARTIAL) | **PARTIAL** — time correction gate is separate; no timesheet loop |
| Worker PII privacy mode (PARTIAL) | **PARTIAL** (unchanged) |
| Dedicated WO invoice object (PARTIAL) | **PARTIAL** (unchanged — shared AR) |
| Post-close source supersede APIs (PARTIAL) | **PARTIAL** (unchanged — adjustments fold into compose; sources stay frozen) |
| Invitation email (PARTIAL) | **PARTIAL** (Resend optional) |
| Ops→draft expense links (PARTIAL) | **PARTIAL** (unchanged) |
| Project-scoped roles (FOUNDATION) | **FOUNDATION** (unchanged) |
| Material usage / equipment usage (FOUNDATION) | **FOUNDATION** (unchanged — not Actual) |
| CPM / calendars / lag (FOUNDATION) | **FOUNDATION** (`supported: false`) |
| API keys / public HTTP / webhook fan-out (FOUNDATION) | **FOUNDATION** (unchanged) |
| Banking live feed (FOUNDATION) | **FOUNDATION** (unchanged) |
| Portal grants (FOUNDATION) | **FOUNDATION** — hidden from Settings nav |
| Data purge, contract-level retention, planning assignees, Google/AWS OCR, depreciation, HSE, in-app notifications, push | **NOT-IMPLEMENTED** (unchanged) |

---

## Owner summary — what ProjectFlow actually is after overnight

ProjectFlow is a **Hebrew-first, RTL, multi-tenant operations and commercial-control product** for construction, renovation, trades, and field-service businesses. It is **not** an accounting ledger, **not** payroll, **not** statutory Israeli invoicing, and **not** a customer/vendor portal.

One economic engine sits under three work surfaces that share the same `projects` row:

| Surface (Hebrew) | What it is in the product |
|---|---|
| **פרויקט** (Project) | Longer contracted work. Optional client. Optional contract. Work packages, changes, BOQ, budgets, Gantt. |
| **עבודה** (Job) | Shorter work UX on the **same** financial entity. Client required. Planning/Gantt opted out. Can convert to a project. |
| **קריאת שירות** (Work order) | Service/dispatch UX on the **same** financial entity, plus schedule/assignee/priority. |

**Overnight closed**

- AP VAT: Actual uses **NET**; payable and aging use **GROSS**. Historical undivided rows were not invented VAT.
- Split customer payments cannot over-apply a payment or an invoice, including concurrent transactions, and cannot spend held retention.
- Closed months freeze at the database. Payments in a closed month may **void**, never resurrect.
- Commercial Change Order reversal inserts a reversing CO and unwinds **that CO’s** BOQ allocations only. The reversing INSERT is gated by unforgeable `app.co_reversal_ctx`, not a session GUC. `changes.approve` is not a generic BOQ reverse RPC.
- PO receiving is quantity history (Commitment stays on the PO; Actual stays on the vendor bill).
- Inventory locations/transfers are quantity-only.
- Document numbers are tenant-permissioned; BOQ raw money stays off `authenticated` SELECT; draft BOQ writes go through `app.boq_mutate_draft_node`.

**Main limitations (unchanged policy)**

- Public portal is **off**.
- No general ledger, payroll, bank posting, or חשבונית ישראל.
- No email/push notification product (invites can email only if Resend is configured).
- Inventory has **no costing**. Gantt has **no CPM**. Live API/webhooks remain foundation.

---

## Financial truths the product actually enforces

These are not slogans. They are how the compose engine is written (`composeProjectFinancials`) plus overnight DB guards.

| Truth | Meaning for the owner |
|---|---|
| **Billing ≠ Payment** | An invoice is a billing record. Cash is a separate payment. Outstanding = invoiced − paid − held retention. Split applications cannot exceed collectible cash. |
| **Commitment ≠ Actual** | Issuing a purchase order creates committed cost. Receiving does **not** create Actual. Actual appears when a vendor bill is posted (or an unmatched expense is finalized). |
| **Progress ≠ Actual** | Approving BOQ quantities does **not** create project cost. Only expenses, labor, and posted AP do. |
| **VAT ≠ Profit** | Current contract value and expense/AP Actual are **net**. Profit = CCV − cost. Invoiced / payable KPIs use **gross**. |
| **Retention = cash timing** | Holdback reduces what is due now. It does **not** reduce contract value, invoiced, Actual, or profit. Payments cannot silently consume held retention. |

---

## 1. Product surface and route map

Locales: `/he-IL/...` (default, RTL) and `/en/...`. Paths below omit the locale prefix.

**Counted page files:** 136. **Redirect-only pages:** 5 (`/inbox` → `/today`, `/settings` → first allowed section, `/workforce` → `/workforce/employees`, `/portal/customer` and `/portal/vendor` → `/portal`). **Unique destinations:** 131. New overnight screens include `/sales`, `/overhead`, `/settings/numbering`, `/projects/[id]/boq-measure`. **Project tabs** (query `?tab=`) add extra screens on the same project/job page.

Mobile: the product is a responsive PWA. The bottom bar shows up to four primary destinations (home, today if enabled, projects or jobs by work mix, expenses). Everything else is under **עוד**. Financial pages need a live connection. Offline drafts exist only for listed capture kinds.

### Public / account

| Path | Hebrew name | Purpose | Who | Primary actions | Mobile | Status |
|---|---|---|---|---|---|---|
| `/` (signed out) | דף נחיתה | Marketing homepage | Anyone | Sign in / install PWA | Yes | FULL |
| `/setup` | התחברות עדיין לא מוגדרת | Env not configured | Anyone | — | Yes | FULL (ops gate) |
| `/onboarding` | הגדרת העסק | Create first organization | Signed-in, no org | Name + country; optional profile | Partial | FULL |
| `/sign-in` | כניסה | Login | Anyone | Sign in | Yes | FULL |
| `/sign-up` | יצירת חשבון | Register | Anyone | Create account | Yes | FULL |
| `/forgot-password` | איפוס סיסמה | Request reset | Anyone | Send email | Yes | FULL |
| `/reset-password` | בחירת סיסמה חדשה | Set new password | Token | Save | Yes | FULL |
| `/accept-invite` | הצטרפות לעסק | Join via invitation | Invitee | Accept | Partial | FULL |
| `/portal` | פורטל | Disabled public portal | Anyone | None | Yes | **DISABLED** |
| `/portal/customer` | — | Redirect to `/portal` | — | — | — | DISABLED |
| `/portal/vendor` | — | Redirect to `/portal` | — | — | — | DISABLED |

### Core work

| Path | Hebrew name | Module | Who | Primary actions | Mobile | Status |
|---|---|---|---|---|---|---|
| `/` (signed in) | לוח בקרה | Always | Members | Glance commercial/cost/attention | Partial | FULL |
| `/today` | היום | `command_center` | `command_center.read` | Handle/snooze/open items | Yes | OPTIONAL-FULL |
| `/inbox` | — | alias | — | Redirects to Today | — | redirect |
| `/projects` | פרויקטים | Always | `projects.read` | List/filter | Partial | FULL |
| `/projects/new` | פרויקט חדש | Always | `projects.create` | Create | Partial | FULL |
| `/projects/[id]` | סביבת פרויקט | Always | `projects.read` | Tabs (see below) | Partial | FULL |
| `/projects/[id]/financials` | כספים | Always | `project_financials.read` | Explainability, profit if allowed | Partial | FULL |
| `/projects/[id]/boq-measure` | מדידה בשטח | `boq` | `boq.manage` | Qty capture; money keys omitted | Yes | OPTIONAL-FULL |
| `/sales` | מכירות | `crm` or `quotes` | crm/quotes read | Hub for CRM + quotes (objects not merged) | Partial | OPTIONAL-FULL |
| `/overhead` | תקורה | Always | `expenses.read` | Owner surface on existing expense engine | Partial | OPTIONAL-FULL |
| `/jobs` | עבודות | `jobs` | `projects.read` | List | Partial | OPTIONAL-FULL |
| `/jobs/new` | עבודה חדשה | `jobs` | `projects.create` | Create (client required; employee assignment picker) | Partial | OPTIONAL-FULL |
| `/jobs/[id]` | עבודה | `jobs` | `projects.read` | Same engine; convert to project | Partial | OPTIONAL-FULL |
| `/work-orders` | קריאות שירות | `service` | `service.read` | List | Partial | OPTIONAL-FULL |
| `/work-orders/new` | קריאה חדשה | `service` | `service.manage` | Create; optional Forms checklist template | Partial | OPTIONAL-FULL |
| `/work-orders/[id]` | קריאת שירות | `service` | `service.read` | Status, assignee, complete | Partial | OPTIONAL-FULL |
| `/dispatch` | שיבוץ | `service` | `service.read` or `dispatch.manage` | Board today/tomorrow/week | Partial | OPTIONAL-FULL |
| `/expenses` | הוצאות | Always | `expenses.read` | List | Partial | FULL |
| `/expenses/new` | הוצאה חדשה | Always | `expenses.create` | Capture | Partial | FULL |
| `/expenses/[id]` | הוצאה | Always | `expenses.read` | Edit draft / finalize / void | Partial | FULL |

### Project workspace tabs (`/projects/[id]?tab=` — Hebrew from `projects.json`)

| Tab | Hebrew | Module / permission | Status |
|---|---|---|---|
| overview | סקירה | Always | FULL |
| financials | כספים | `project_financials.read` | FULL |
| expenses | הוצאות | `expenses.read` | FULL |
| changes | שינויים ותוספות | `changes` + `changes.read` | OPTIONAL-FULL |
| boq | כתב כמויות | `boq` + `boq.read` | OPTIONAL-FULL |
| billing | חיובים וגבייה | `billing` + `billing.read` | OPTIONAL-FULL |
| budgets | תקציב | `budgets` + `budgets.read` | OPTIONAL-FULL |
| work | תחומי עבודה | When 2+ work packages | FULL |
| team | צוות | `workforce.read` | FULL |
| schedule | לוח זמנים | `planning.read` (not a module key) | OPTIONAL-FULL (projects only) |
| time | שעות | `workforce.read` | FULL |
| documents | מסמכים | `documents` + `documents.read` | OPTIONAL-FULL |
| details | פרטים | Always | FULL |

Jobs reuse the same tab model with work packages and Gantt hidden.

### Commercial, CRM, money

| Path | Hebrew name | Module | Who | Primary actions | Mobile | Status |
|---|---|---|---|---|---|---|
| `/clients` `/new` `/[id]` | לקוחות | `clients` | `clients.read/manage` | CRUD, contacts, archive | Partial | OPTIONAL-FULL |
| `/changes` `/new` `/[id]` `/price` `/approve` | שינויים ותוספות | `changes` | `changes.read/manage/approve` | Request, price, approve | Partial | OPTIONAL-FULL |
| `/billing` `/new` `/[id]` | חיובים וגבייה | `billing` | `billing.read/manage` | Draft, finalize, void | Partial | OPTIONAL-FULL |
| `/billing/payments/new` | תשלום | `billing` | `billing.manage` | Record payment | Partial | OPTIONAL-FULL |
| `/recurring-drafts` (+ new/edit/id) | טיוטות חוזרות | permission OR | expense/AP/billing perms | Templates; generate **drafts only** | Partial | FULL |
| `/quotes` `/new` `/[id]` | הצעות מחיר | `quotes` | `quotes.read/manage` | Estimate; convert to project/job | Partial | OPTIONAL-FULL |
| `/crm` | מכירות / הזדמנויות | `crm` | `crm.read/manage` | Pipeline board + table | Partial | OPTIONAL-FULL |
| `/crm/leads` `/new` `/[id]` | לידים | `crm` | same | CRUD | Partial | OPTIONAL-FULL |
| `/crm/prospects` `/new` `/[id]` | מתעניינים | `crm` | same | CRUD | Partial | OPTIONAL-FULL |
| `/crm/opportunities/new` `/[id]` | הזדמנות | `crm` | same | Quote versions; convert won | Partial | OPTIONAL-FULL |
| `/reports` | דוחות | Always | `project_financials.read` | Org analytics + aging | Partial | FULL |
| `/imports` | ייבוא | mixed | per-kind manage/create | Preview → confirm | No | FULL |
| `/month-close` | סגירת חודש | `month_close` (nav is permission-only) | `month_close.read/manage` | Ready / close / adjust | Partial | OPTIONAL-FULL |
| `/approvals` | אישורים | `approvals` | `approvals.read/decide` | Approve/reject | Partial | OPTIONAL-FULL |

### Vendors, purchasing, AP, materials

| Path | Hebrew name | Module | Who | Primary actions | Mobile | Status |
|---|---|---|---|---|---|---|
| `/vendors` `/new` `/[id]` | ספקים | `vendors` | `vendors.read/manage` | Master, contacts, engagements | Partial | OPTIONAL-FULL |
| `/procurement` `/new` `/[poId]` | רכש / הזמנת רכש | `procurement` | `procurement.read/manage` | Draft, issue, close, cancel | Partial | OPTIONAL-FULL |
| `/procurement/rfqs` `/new` `/[id]` | בקשות הצעת מחיר | `procurement` | same | RFQ + capture supplier quotes | Partial | OPTIONAL-FULL |
| `/procurement/materials` `/[id]` | חומרים | `materials` | `materials.read/manage` | Catalog + vendor prices | Partial | OPTIONAL-FULL |
| `/procurement/ap` `/new` `/[billId]` | חשבונות ספקים | permission-only | `ap.read/manage` | Create (posts **open**), match, pay | Partial | FULL |
| `/procurement/ap/aging` | גיל יתרות לספקים | permission-only | `ap.read` | Aging | Partial | FULL |
| `/procurement/ap/credits` `/new` `/[id]` | זיכויי ספק | permission-only | `ap.manage` | Credit | Partial | FULL |

### People, field, documents, assets

| Path | Hebrew name | Module | Who | Primary actions | Mobile | Status |
|---|---|---|---|---|---|---|
| `/workforce/employees` `/new` `/[id]` | עובדים | permission-only nav | `workforce.read/manage` | Roster, rates if cost perm | Partial | FULL |
| `/workforce/time` `/new` | דיווחי שעות | permission-only | `time.manage` | Record, bulk, correct | Partial | FULL |
| `/workforce/attendance` | נוכחות | permission-only | attendance read/self/manage | Clock, manual, void | Partial | FULL |
| `/field-ops` | עבודה בשטח | `field_ops` | `field_ops.read` | Hub | Partial | OPTIONAL-FULL |
| `/field-ops/logs` `/new` `/[id]` | יומן שטח | `field_ops` | manage | Create; stage photos on save | Partial | OPTIONAL-FULL |
| `/field-ops/punch` `/new` `/[id]` | ליקויים | `field_ops` | manage | Status/priority; stage photos on save | Partial | OPTIONAL-FULL |
| `/field-ops/inspections` `/new` `/[id]` | ביקורות | `field_ops` | manage | Pass/fail; stage photos on save | Partial | OPTIONAL-FULL |
| `/forms` `/new` `/[id]` | טפסי שטח | `forms` | `forms.read/submit` | Fill/submit | Partial | OPTIONAL-FULL |
| `/service/recurring` `/new` `/[id]` | שירות חוזר | `service` | `service.read/manage` | Pause/resume/end/skip | Partial | OPTIONAL-FULL |
| `/documents` | מסמכים | `documents` | `documents.read` | List/download | Partial | OPTIONAL-FULL |
| `/documents/ocr-review` `/history` | סריקת חשבוניות | `documents` + OCR flag | `documents.manage` + expense/AP | Review, accept draft, reject | Partial | OPTIONAL-FULL (default off) |
| `/assets` `/new` `/[id]` | נכסים | `assets` | `assets.read/manage` | Register | Partial | OPTIONAL-FULL |
| `/assets/fleet` | צי | `assets` | same | Vehicles | Partial | OPTIONAL-FULL |
| `/assets/maintenance` | תחזוקה | `assets` | same | Work orders on assets | Partial | OPTIONAL-FULL |
| `/assets/inventory` `/[id]` | מלאי | `assets` | same | Qty movements + locations/transfers | Partial | OPTIONAL-FULL |
| `/compliance` `/new` `/[id]` | ביטוחים וציות | `compliance` | `compliance.read/manage` | Artifacts + expiry | Partial | OPTIONAL-FULL |

### Settings (Hebrew from `settings.sections`)

| Path | Hebrew | Who | Status |
|---|---|---|---|
| `/settings` | הגדרות (redirect) | Members | redirect |
| `/settings/business` | העסק | `org.read` | FULL |
| `/settings/people` | אנשים ותפקידים | `members.read` | FULL |
| `/settings/profile` | הפרופיל שלכם | Self | FULL |
| `/settings/tax` | מס | `tax.manage` | FULL |
| `/settings/app` | אפליקציה | Self | FULL (PWA) |
| `/settings/approvals` | אישורים | `approvals.manage` | OPTIONAL-FULL |
| `/settings/features` | יכולות | `settings.manage` | FULL |
| `/settings/numbering` | מספור מסמכים | `settings.manage` | OPTIONAL-FULL |
| `/settings/cost-categories` | קטגוריות עלות | `settings.manage` | FULL |
| `/settings/templates` | תבניות מבנה | `settings.manage` | FULL |
| `/settings/catalog` | תחומים וסוגים | `settings.manage` | FULL |
| `/settings/roles` | תפקידים | `roles.manage` | FULL |
| `/settings/custom-fields` | שדות מותאמים | `custom_fields.manage` | OPTIONAL-FULL |
| `/settings/forms` | תבניות טפסים | `forms.manage` | OPTIONAL-FULL |
| `/settings/activity` | יומן פעילות | `audit.read` | FULL |
| `/settings/offline-drafts` | טיוטות לא מקוונות | Self | OPTIONAL-FULL |
| `/settings/banking` | בנקאות | `banking.read` | FOUNDATION |
| `/settings/api` | API ו־webhooks | `api.manage` | FOUNDATION |
| `/settings/portal` | גישת פורטל | `portal.manage` | FOUNDATION, **hidden from Settings nav** |

Non-page product HTTP (not counted as product features): `/manifest.webmanifest`, `/auth/callback`, `/[locale]/exports/[kind]`, `GET /api/v1/health|whoami|projects`.

---

## 2. Organization / account / onboarding

**Status: FULL**, with listed gaps.

**Real first-run path**

1. Sign up (Supabase Auth) or accept an invite.
2. If the environment is not configured → `/setup` (operations, not a business wizard).
3. If signed in with no organization → `/onboarding`: business name and country are required. Currency, timezone, and locale get defaults (Israel → ILS, `Asia/Jerusalem`, Hebrew).
4. One transaction creates the organization, the owner membership, cloned roles (**בעלים / מנהל פרויקטים / כספים / עובד**), cost-category seed, and optional business-profile module flags.
5. Home dashboard. Settings → People to invite. Quick Create (or Projects/Jobs/Work orders) to start work.

**Configured automatically:** owner role with all permissions; four role templates; default cost categories; Hebrew RTL; tax country pack by country; `work_mix` and visible modules if a business profile is applied. **Not** auto-filled: first project fields, BOQ, contract amount, employees.

**Invitations:** hashed token, 14 days. Email sends only if Resend is configured; otherwise the owner copies a one-time link. Removing a person **suspends** membership; historical records stay.

**Locale:** default `he-IL`, RTL. English exists. Org timezone drives “today”. One base currency per organization in V1.

**Not implemented:** data-purge retention policy, project-scoped roles (column reserved). Document numbering settings exist at `/settings/numbering` (internal sequences, not Israeli statutory numbering).

Evidence: `create-organization.ts`, `business-profiles.ts`, `role-templates.ts`, `(auth)/`, `/onboarding`.

---

## 3. Clients / contacts / relationships

**Status: OPTIONAL-FULL** (`clients`). No profile is required; most profiles turn it on.

A business can keep: name, legal name, notes, contacts (primary / billing / site / other), tax identifiers, documents, custom fields, linked projects, soft-archive.

**Client financial 360:** `/clients/[id]` shows outstanding / invoiced / paid / held retention from the existing AR compose. CRM prospects remain a **separate** record until conversion writes `convertedClientId`.

Projects may exist without a client. Jobs and work orders require a client.

Evidence: `src/modules/clients`, `/clients/[clientId]`.

---

## 4. Projects / jobs / work orders

These are **not** three products. They are three UXes on `projects.work_kind`.

| | Project | Job | Work order |
|---|---|---|---|
| Client | Optional | Required | Required |
| Contract | Optional | Fixed price vs open (`priceNotSet` → profit hidden, not fake zero) | Fixed may seed contract; open has none |
| Work packages | Yes (default hidden until a second exists) | Hidden | Hidden |
| Gantt / planning | Permission-gated | Opted out | Opted out |
| Extra fields | — | Employee assignment picker at create (`employee_project_assignments`; Assignment ≠ Actual) | Status, priority, site, assignee, schedule, checklist template |
| Convert | — | Convert job → project exists | — |

Statuses: draft / active / on_hold / completed / cancelled / archived. People via `employee_project_assignments` (assignment is not cost). Documents attach as owner type `project`. Profit lives on project financials.

Business profiles change **chrome** (nav, labels, Quick Create, suggested categories). They do not auto-stamp a full project template onto the first job.

Evidence: `drizzle/schema/projects.ts`, `createJob`, `job-create-employee-picker.tsx`, `createWorkOrder`, `convert-job-to-project.ts`.

---

## 5. Contracts / commercial value

**Status: FULL** for the primary contract. Multi-contract UX is **PARTIAL**. Contract `adjustment` events are **FOUNDATION**. Retention on the contract itself is **NOT-IMPLEMENTED** (by design).

| Number | What it is | What changes it |
|---|---|---|
| Display original | Capture context | Typed at setup; never a KPI |
| Opening reduction | Capture context | Typed at setup; not a payment |
| Managed original | CCV starting point | `upsertPrimaryContractAmount` until the original event is locked |
| **Current contract (CCV)** | Sum of `contract_value_events` | Original event + **approved** change orders (net) |
| Pending | Open change requests | Negotiation; **does not** move CCV |

**Moves CCV:** locking/correcting original (until lock); approving a change request; **reversing** an approved Change Order (`app.reverse_change_order`, opposite net event).

**Does not move CCV:** pending CRs, BOQ create/progress/billing, AR invoices/payments/retention, display original, pre-sale quotes, Gantt % complete. Deleting or rewriting an approved Change Order is not a supported path.

Tax: user may enter inclusive or exclusive; engine stores net/tax/gross and freezes a snapshot. Profit uses **net**.

Evidence: `drizzle/schema/contracts.ts`, `computeCurrentContractValue`, `approveChangeRequest`, `app.reverse_change_order`.

---

## 6. BOQ / Bill of Quantities

**Status: OPTIONAL-FULL.** Module key `boq`. Hebrew: **כתב כמויות / חשבונות חלקיים**. Enabled by General Contractor and Renovation profiles. Lives on the project tab, not main nav. Dedicated field strip: `/projects/[id]/boq-measure` (no unit prices).

### Chronological workflow that actually exists

1. Turn the module on (or apply a GC/renovation profile).
2. Create a project BOQ (`draft`). Choose simple or advanced progress.
3. Build chapters/items by hand **or** import CSV/Excel (draft only; total rows skipped).
4. Optionally map items to work packages, cost categories, budget lines (classification only — **not Actual**).
5. Optionally set opening approved/billed quantities for mid-project start (does **not** invent historic invoices).
6. **Activate** — originals freeze; only one active BOQ per project.
7. Approved change orders may be **allocated** onto items (`current_*` recomputes). Pending COs cannot allocate. Commercial reversal (`app.reverse_change_order`) unwinds **that CO’s** allocations in the same transaction as the reversing CO; standalone scoped unwind is not granted to `authenticated`. Manual single-allocation reverse stays `boq.manage`.
8. Field/office submits a progress batch (`boq.progress.submit`).
9. Approver approves (`boq.progress.approve`). Simple mode: approved = measured. Advanced: approver stamps approved qty.
10. Finance creates **progress billing** (`boq.billing.create`) → a **finalized internal AR invoice**, unique link so the batch cannot be billed twice. VAT and retention use the existing AR helpers.
11. Customer **payment** is a separate billing-module action.
12. Optional: subcontractor rate schedule → valuation → **explicit draft AP bill** (`createDraftApFromSubcontractorValuation`). Draft posts **no Actual** and consumes **no PO commitment**. Canonical post remains a separate permissioned action.

### What BOQ does **not** create

Progress, mappings, opening quantities, and subcontractor valuations do **not** create Actual, Payment, Commitment, or CCV. Progress billing creates an AR invoice only. Automatic Actual from % complete is **intentionally disabled**.

Worker without money permissions sees items and can submit quantities; unit prices are zeroed (`boq_nodes_secure`). Search never returns prices. Export prices require `boq.manage`.

Evidence: `drizzle/schema/boq.ts`, `src/modules/boq/**`, migrations 0032–0045, `tests/integration/boq/**`, Playwright `boq-happy-path.spec.ts` (in `playwright:ci`).

---

## 7. Financial engine — complete map

One compose function owns project numbers. Modules must not invent a second Actual, Forecast, or CCV.

### A. Revenue / customer side

| Concept | Source | Nature | VAT | Retention |
|---|---|---|---|---|
| CCV | Sum of contract value events | Commercial | Net | Unrelated |
| Pending changes | Open CRs | Disclosure | Net | Unrelated |
| Invoiced | Finalized `billing_records.total_amount` | Billing | **Gross** | Does not reduce invoiced |
| Paid | `payments` recorded | Cash | As paid | Unrelated |
| Outstanding AR | invoiced − paid − held remaining | Cash receivable | Gross | Held subtracted here |
| AR aging | Outstanding + due date | Cash | Gross | Uses outstanding |
| Retention release | Billing kind `retention_release` | Cash | — | Reduces held remaining |

Kinds: invoice, credit note, advance, retention release. Draft → finalize (immutable) → void/credit to correct. Payments only on finalized non-credit records. AR payments may be **1:1** (`recordPayment`) or **split** across same-client invoices (`recordCustomerPayment` + `payment_applications`). Held retention is not collectible until the canonical retention-release path. Statutory issuance is **DISABLED** until an external provider exists.

### B. Cost side

```
Actual = finalized expense NET
       + labor (time True Cost and/or applied monthly employer cost)
       + posted AP bill NET (minus applied vendor-credit Actual reductions, minus bill-linked expenses)
       + surviving month-close cost adjustments
```

Not Actual: drafts, issued POs, payments, BOQ progress, attendance, assignments, inventory movements, maintenance metadata.

| Source | When it becomes Actual |
|---|---|
| Expense | Finalize |
| Labor | Time snapshot and/or applied month allocation (month displaces time for that employee-month) |
| Vendor bill | Status open / partially_matched / matched — Actual = NET |
| Vendor credit | Payable reduction = GROSS; Actual reduction = credit NET/GROSS (not the bill VAT ratio) |
| PO | Never Actual — Commitment on issue |
| Subcontractor BOQ valuation | Never until someone posts AP manually |

**AP VAT:** bills and vendor credits carry `net_amount` / `tax_amount` / `gross_amount` / `tax_basis`. Actual = NET. Payable / aging = GROSS. Historical `legacy_undivided` rows keep tax = 0 (no invented VAT).

### C. Planning / forecast

| Number | Formula |
|---|---|
| Budget | `project_budgets` (optional module) |
| Actual | Engine Actual |
| Committed open | Remaining issued PO commitment |
| ETC | Project `expectedRemainingCost` (manual) |
| Forecast final cost | Actual + remaining commitment + ETC |
| Budget variance | Budget − Forecast (positive = favorable) |
| Actual margin | CCV − Actual |
| Forecast margin | CCV − Forecast |
| Open AP payable | Bill − pay − credit − held — **disclosure, not in Forecast** |

Gantt % complete is schedule progress, not financial Actual.

Evidence: `src/modules/financials/application/compose-project-financials.ts`.

---

## 8. Expenses

**Status: FULL.** Always in navigation.

Lifecycle: **draft** (editable, including allocations) → optional approval gate → **finalize** (Actual recognized, net, month must be open) → **void** or **reversal** (negative row) or **adjustment** (reversal + replacement).

May attach: project, work package, phase, vendor or free-text supplier, category, tax, documents, OCR draft origin. Amount + currency is the only hard capture requirement. Project vs non-project vs overhead family is supported.

Recurring drafts generate **drafts only**. OCR confirm creates a **draft** expense and never finalizes.

Evidence: `finalizeExpense`, `voidExpense`, `/expenses`.

---

## 9. Vendors / accounts payable

| Entity | Meaning | Actual? | Commitment? | Cash? |
|---|---|---|---|---|
| **Vendor** | Supplier/subcontractor master | No | No | No |
| **Engagement** | Vendor works on a project | No | No | No |
| **Purchase order** | Intent to buy | No | Yes when issued | No |
| **Vendor bill** | Payable obligation | **Yes when posted** | Consumes PO | Outstanding |
| **Vendor credit** | Reduces what you owe and economic cost | Reduces cost | No | Not a payment |
| **Vendor payment** | Cash out | **Never** | No | Yes |
| **Expense** | Capture path; may later match a bill | Yes if finalized and not linked to a recognized bill | No | Optional |

Bill statuses: draft / open / partially_matched / matched / void. **Create posts as `open`** unless an approval rule blocks — that is why BOQ must not auto-call bill create.

Aging, project allocations, PO matches, documents, OCR → draft bill or draft credit: all exist. Subcontractor valuation may explicitly create a **draft** AP bill (`createDraftApFromSubcontractorValuation`); the draft creates **no Actual** and consumes **no** PO commitment. Posting remains a separate canonical AP action.

Evidence: `drizzle/schema/ap.ts`, `/procurement/ap`.

---

## 10. Procurement / purchasing

**Status: OPTIONAL-FULL** for RFQ → quote compare → PO issue → commitment, and for quantity receiving.

```
RFQ → supplier quotes → compare totals → PO draft
  → optional approval → issue PO  ★ Commitment, never Expense
  → receive quantities (history)  ★ not Actual
  → vendor bill against PO        ★ Actual + consume commitment
  → close / cancel
```

Receipt lines are immutable. Direct `received_quantity` mutation is blocked. Some received → `partially_received`. Full quantity received stays `partially_received` (the catalog has no `received` status). Close remains an explicit lifecycle action. Receiving never creates Actual.

GC profile turns procurement on. AP bills remain reachable even if procurement is hidden (permission-only nav).

---

## 11. Materials / inventory

| Piece | Status |
|---|---|
| Catalog + vendor prices | OPTIONAL-FULL (`materials`) |
| Inventory qty + receive/issue/adjust/return/transfer | OPTIONAL-FULL (`/assets/inventory`; locations in 0044) |
| Project usage records | FOUNDATION (not Actual) |
| Locations + transfers (qty-only) | OPTIONAL-FULL — same-org FKs; movement-driven balances |
| Reservations, FIFO/AVG costing | NOT-IMPLEMENTED (intentionally excluded this wave) |
| Mobile stock app | NOT-IMPLEMENTED |

Inventory is forbidden as an expense kind on the ops-finance bridge.

---

## 12. Employees / workforce

Employees nav is **always discoverable** if the viewer has `workforce.read` (so a first employee can be created). The `workforce` module key still exists for other chrome.

**How time becomes project labor cost**

1. Employee has effective-dated **rate versions** plus optional burden components (org defaults copy onto new versions).
2. A time entry snapshots `cost_amount` using the rate in force that day (project or non-project code).
3. If monthly **employer cost** is entered and allocated for that employee-month, the allocation **replaces** time snapshots for costing (Mode C wins). Assignment to a project does not itself create Actual. Attendance does not create Actual.

Worker role: record time and expenses; **no** rates, profit, or billing. `workforce.cost.read/manage` is separate from roster read.

Timesheet **approval as a product** is only a named approval type — not a submit/approve loop (**PARTIAL**).

Bulk entry, weekday expand, void+replacement corrections, and non-project time exist.

Evidence: `labor-recognition.ts`, `/workforce/time`, `/workforce/attendance`.

---

## 13. Scheduling / planning / Gantt

| Capability | Classification |
|---|---|
| Project/WP/phase/milestone dates | Light planning — **FULL** |
| Tasks + finish-to-start + Gantt chart | **OPTIONAL-FULL** for `work_kind=project`, permission `planning.read/write` (not a module key) |
| Jobs / work orders on Gantt | DISABLED |
| Critical path, calendars, lag, SS/FF, float, leveling, capacity | FOUNDATION / NOT-IMPLEMENTED (`supported: false`) |
| Task assignees | NOT-IMPLEMENTED |
| Service dispatch windows | OPTIONAL-FULL (not a company calendar) |

---

## 14. Service / dispatch / recurring work

**Status: OPTIONAL-FULL** (`service`).

Maintenance workflow that exists: client → work order → dispatch board → technician assignee → time/expense on the same engine → complete. Recurrence definitions generate work-order projects (daily/weekly/monthly/quarterly/yearly); pause, resume, end, skip exist.

**Partial:** no dedicated work-order invoice object; billing uses shared AR. Team assignee column was requested and is not in schema.

Checklist templates from Forms are wired: selecting a required template blocks complete until a submitted (non-void) submission exists for that work order.

---

## 15. CRM / sales

**Status: OPTIONAL-FULL** if the owner turns `crm` on. **No business profile enables CRM automatically.**

Exists: prospects + contacts, leads, opportunities (stage enum) with a **pipeline board and table** (`opportunity-pipeline-views.tsx`), stored next-action date/text with overdue/due badges (**no email is sent**), notes, internal estimates, sales quotes with **immutable issued versions**, convert won deal → Client + Project + Contract from accepted quote. Hub at `/sales` (CRM and quotes stay separate objects).

**Does not exist:** activity timeline product, email/push follow-up reminders, automatic conversion without the explicit action.

**Three quote-like objects** (easy to confuse, conversions are explicit and separate):

1. CRM sales quotes (pre-project)
2. Standalone Quotes/Estimates module (`/quotes`) — also converts to project or job
3. In-project commercial quotes on change requests

Quote ≠ Billing ≠ Change Order ≠ Revenue.

---

## 16. Change management

**Status: OPTIONAL-FULL** (`changes`).

Example: draft change request with lines → send/awaiting approval → manager records approval → **Change Order** writes a **net** contract value event → CCV moves → optional BOQ allocation updates current quantities/prices. Original stays frozen.

Pending never moves CCV. Internal approval is recorded who/when; there is **no** customer e-sign and portal approval is off.

Commercial reversal exists: `app.reverse_change_order` (`changes.approve`) inserts a reversing Change Order + opposite `contract_value_event` and unwinds **that CO’s** BOQ allocations in **one transaction**. A reversing row cannot be inserted by a forged session GUC; only the canonical DEFINER path writes `app.co_reversal_ctx`. Change Orders are not deleted or silently rewritten. Manual single-allocation reverse stays `boq.manage`. The scoped unwind RPC is **not** granted to `authenticated`.

---

## 17. Budgets

**Status: OPTIONAL-FULL** (`budgets`). Hebrew: **תקציבים בפרויקט / עבודה**. Project tab, not a main-nav item. GC and Mixed profiles enable it.

Manager use: create a budget with lines (category / work package / discipline / cost code) → see Actual and Forecast from the **same engine** → variance = budget − forecast → revise (optional approval type `budget_revision`). Actual is never recalculated inside the budget module.

---

## 18. Field operations

**Status: OPTIONAL-FULL** (`field_ops`).

| Tool | Who uses it | Notes |
|---|---|---|
| Daily log (יומן שטח) | Site / supervisor | Text + photos staged on create; bytes upload on save |
| Punch list (ליקויים) | Site / PM | open / in_progress / done / cancelled; photos staged on create |
| Inspections (ביקורות) | QC on a project | scheduled → passed/failed — not HSE; photos staged on create |
| Offline drafts | Field | IndexedDB; sync when online |

Mobile is the same PWA, not a native app.

---

## 19. Forms / checklists / templates

**Status: OPTIONAL-FULL** (`forms`). Templates at `/settings/forms`. Submissions: draft / submitted / void. Field types include checklist, yes/no, text, number, date, photo, notes, signature.

**Signature is an acknowledgement** (name/time/note), not legal e-sign. Org **project structure** templates (phases/work packages) are a different Settings area.

---

## 20. Documents / files

**Status: OPTIONAL-FULL** for the documents center; storage itself is used by many modules.

Private Supabase Storage only. Upload: `documents.manage` → signed URL → finalize metadata. Download: `documents.read` → short-lived signed URL. Soft-delete metadata; byte cleanup is best-effort.

Owner types include project, client, vendor, expense, change request/order, approval, billing, quote version, employee, organization, RFQ, PO, AP bill, daily log, punch, inspection, compliance, asset, inventory, form submission. `portalVisible` exists but public portal is off. Max 25MB; PDF, images, Word, Excel. Mobile camera via `capture="environment"`. HEIC stores but is not browser-previewed.

---

## 21. OCR

**Status: OPTIONAL-FULL architecture; production live OCR is env-gated and OFF by default.**

| Layer | Reality now |
|---|---|
| Infrastructure | Azure Document Intelligence HTTP path is wired (`AZURE_OCR_LIVE_HTTP_READY = true`) |
| Credentials | Server env names exist; this audit did not read secret values |
| Production enabled | `OCR_INGESTION_ENABLED` defaults **false**. Flag + non-stub credentials required |
| Google / AWS | Registry stubs only — NOT-IMPLEMENTED |
| UI | `/documents/ocr-review` hidden unless live, fixture, or pending-config |

**Flow:** upload/camera or existing document → extract in the **same HTTP request** (not a background worker) → job `needs_review` → human accepts selected fields → **draft** Expense or AP Bill or Vendor Credit. Duplicate warnings (checksum / vendor+reference / amount+date+vendor) and wrong-customer tax-id warning **never auto-reject**.

Extracted fields: vendor, company/VAT ids, dates, invoice number, order number, document type, description, subtotal, discount, net, tax, VAT rate, gross, amount due, currency, line items.

**OCR never:** finalizes an expense, posts an AP bill, recognizes Actual, writes project/category UUIDs, or applies a customer party automatically.

Evidence: `src/modules/ocr`, `feature-gate.ts`, `drizzle/schema/ocr.ts`.

---

## 22. Approvals

**Status: OPTIONAL-FULL** for the ops approval inbox and wired gates. Expense finalize, AP post, PO issue, vendor credit, budget revision, **quote discount on send** (`quote_discount`), and **time correction** (`time_correction`) all go through `assertApprovalAllowsAction` when a matching rule exists. No matching rule → action allowed. The remaining gap is a timesheet submit/approve **product** (separate PARTIAL row), not unused catalog types.

States: submitted → approved | rejected | cancelled. Rules: entity type + optional currency + amount threshold. No matching rule → action allowed. Permission `approvals.decide` to decide; `approvals.manage` to configure.

| Entity | Blocks until approved | After approve |
|---|---|---|
| Expense | Finalize | Finalize may proceed |
| Vendor bill | Post | Post may proceed |
| Purchase order | Issue | Issue may proceed (then Commitment) |
| Vendor credit | Credit action | May proceed |
| Budget revision | Revision | May proceed |
| `quote_discount` | Sending a quote when a matching rule exists | Send may proceed |
| `time_correction` | Applying a time correction when a matching rule exists | Correction may proceed; Actual unchanged until approved |

Commercial change-request approval is a **separate** recorded approval on the change, not this ops engine. No customer portal approval.

---

## 23. Today / Owner Command Center

**Status: OPTIONAL-FULL.** Path `/today`. Hebrew: **היום**. Permission `command_center.read`. **Does not change financial data.** Handle/snooze/dismiss only hide cards. Primary action is navigate.

| Card | WHAT | WHY | WHERE | Handle? |
|---|---|---|---|---|
| `overdue_ar` | Collect | Past due + outstanding | Billing | No (snooze only) |
| `vendor_bill_due` | Pay vendor | Due + outstanding | Vendor bills | No |
| `unallocated_employee_cost` | Allocate labor | Employer cost remainder | Workforce | No |
| `unallocated_vendor_bill` | Assign bill | Posted, no project | Vendor bills | No |
| `project_over_budget` | Review | Actual vs budget | Project | No |
| `credit_void_issue` | Resolve credit | Collection status | Billing | No |
| `open_approval` | Decide | Pending request | Approvals | Yes |
| `attendance_open` | Close clock | No clock-out | Workforce | Yes |
| `overdue_planning` | Update plan | Target end + % | Project | Yes |
| `expiring_compliance` | Renew | Expiry | Compliance | Yes |
| `overdue_maintenance` | Complete | Scheduled | Assets | Yes |
| `stale_project` | Check work | 14+ days quiet | Project | Yes |
| `month_close_incomplete` | Finish close | Completeness % | Month close | Yes |
| `boq_measurement_awaiting_approval` | Approve measure | Certificate waiting | BOQ | Yes |
| `boq_progress_ready_to_bill` | Create progress bill | Approved, unbilled | BOQ | Yes |
| `boq_vs_contract_mismatch` | Reconcile | BOQ vs CCV diverge | BOQ | Yes |

Collectors skip silently without permission/module. Cap 15 per source. `/inbox` is only an alias.

---

## 24. Month close / financial controls

**Status: OPTIONAL-FULL** operational close (not a statutory GL close). 0037 adds database freeze triggers.

`open` → `ready` (requires 100% completeness) → `closed` (does not silently reopen). Completeness checks include missing employer cost, unallocated employee cost, unallocated vendor bills, open time corrections, AP anomalies, missing project allocations, unresolved expense drafts, incomplete attendance, open overhead allocation.

App code still asserts (`assertMonthOpenForRewrite`). **Database triggers** also freeze closed-period rewrites on expenses, AP bills, vendor credits, billing records, AR/AP payments, time entries, and contract value events. Draft INSERT in a closed month remains allowed for expense/AP/billing/credits. Payments have no draft: closed-month INSERT of a recorded payment is forbidden. Recorded → void is allowed; void → recorded is blocked. `archived_at` is not a global bypass.

Post-close **adjustments** fold into compose as cost/revenue net. They record intent; they do **not** automatically unlock expense/AP supersede APIs.

Nav for month close is **permission-only** (visible if you have `month_close.read` even if the module preference is off).

---

## 25. Financial explainability

**Status: FULL.**

Each major number (Actual, Forecast, CCV, margins, outstanding AR/AP, unallocated business cost) can show **why this number**, sources, and a confidence badge:

- **High** — enough complete data
- **Medium** — open drafts, unallocated remainder, FX exclusions
- **Needs data** — e.g. missing employer month cost

This is explainability of the **same** composed figures, not a second calculator. Profit widgets require `project_profit.read`.

---

## 26. Reports / dashboards

There is **one** organization reports page, not a library of named `/reports/[slug]` reports.

| Report | Path | Filters | Export | Permission | Mobile |
|---|---|---|---|---|---|
| Home dashboard | `/` | workKind | No dedicated | Progressive | Partial |
| Org analytics | `/reports` | workKind | Yes via `/exports/[kind]` | `project_financials.read` (sections gated) | Partial |
| Project financials | `/projects/[id]/financials` | Project | `project-financials` | financials; profit separate | Partial |
| AP aging | `/procurement/ap/aging` | — | ap-bills | `ap.read` | Partial |
| AR aging | Embedded on `/reports` | — | `receivables-aging` | `billing.read` | Partial |

Shown where permitted: commercial, cash, cost, profitability, operations (milestones, POs, field, compliance, assets), project rollup, cash-flow, AR aging. Source of truth is the compose engine + billing/AP repos — not a warehouse.

Export kinds: projects, clients, vendors, expenses, billing, project-financials, employees, time-entries, payments, receivables-aging, purchase-orders, ap-bills, audit, boq. Employee rates omitted without `workforce.cost.read`.

---

## 27. Search

**Global search: FULL.** Org-scoped. Never returns Actual, profit, employee cost, overhead, or BOQ prices.

| Kind | Fields | Permission |
|---|---|---|
| project / job | name, location | `projects.read` |
| work_order | name, location | `service.read` |
| client | name, legalName | `clients.read` |
| contact | name, email, phone | `clients.read` |
| employee | name, email, number, title (**no rates**) | `workforce.read` |
| vendor | name, email | `vendors.read` |
| AP bill | reference, vendor name (**no amounts**) | `ap.read` |
| AR billing | reference (**no amounts**) | `billing.read` |
| document | filename | `documents.read` |
| asset | name, identifier, serial, model | `assets.read` |
| boq_item | itemCode, description (**never prices**) | `boq.read` |

List pages also have local `?q=` filters. **Text and select** custom fields on project, client, employee, and vendor are searched with the parent entity’s read permission (`custom_fields.manage` is not required). Money, number, date, boolean, and reference custom fields are never searchable, so Actual / profit / rates cannot leak through hits.

---

## 28. Import / export

### Imports (`/imports`, CSV/Excel, preview + mapping + row errors, batches of 25)

| Kind | Required | Creates | Financial safety |
|---|---|---|---|
| clients | name | Client | Master data |
| contacts | clientName, name | Contact | Master data |
| vendors | name | Vendor | Master data |
| employees | name | Employee | Optional `baseRate` via employee create (see gap) |
| projects | name | Project | No invented Actual |
| opening_values | contract value + project | Contract opening via existing API | Never invents Actual |
| cost_categories | name, family | Catalog | Skip key collision |
| expenses | date, description, amount | **Draft expense only** | Tax columns unmapped; not finalized |
| boq_items | description | BOQ nodes | Draft BOQ; skip totals |

Error rows are never written. In-file and existing duplicates are flagged.

### Exports

Cookie-authenticated `GET /[locale]/exports/[kind]` (csv|xlsx). Kinds listed in §26. Aliases include `time`, `ar`, `ap`, `po`, `audit-log`, `bill-of-quantities`.

---

## 29. Custom fields

**Status: OPTIONAL-FULL.** Entities: client, project, vendor, employee, opportunity, expense. Types: text, number, money, date, select, multi_select, boolean, reference. Required flag, archive, reserved keys block canonical money/status names. **Text/select** values on project, client, employee, and vendor participate in global search. Custom fields are **not** a reports dimension.

---

## 30. Assets / fleet / equipment

**Status: OPTIONAL-FULL** as an operations register, not asset accounting.

Exists: kinds equipment/vehicle/tool/other; statuses; fleet plate/VIN/odometer; maintenance records (planned → completed). `cost_amount` on maintenance is **metadata, not an Expense** unless someone uses the ops-finance bridge to create a **draft** expense and then finalizes it.

Equipment usage hours/days/mileage: **FOUNDATION**, not Actual. Depreciation: **NOT-IMPLEMENTED**.

---

## 31. Compliance / safety

**Status: OPTIONAL-FULL** registry; safety program **NOT-IMPLEMENTED**.

Insurance / license / certification on org, employee, vendor, or project, with expiry buckets and document evidence. Expiry appears on Today and reports counts. **No email/push reminders** (explicitly deferred). Field inspections are site QC, not HSE. No `safety` module key.

---

## 32. Notifications / reminders

| Channel | Status |
|---|---|
| In-app notification product | **NOT-IMPLEMENTED** (`/inbox` = Today) |
| Command Center | FULL as an action inbox, not a notification feed |
| Invitation email | **PARTIAL** — port exists; default driver `console` does not send; Resend optional |
| Push | NOT-IMPLEMENTED |
| Scheduled expiry / assignment / approval mail | NOT-IMPLEMENTED |

**Plainly: there is no notification/reminder delivery product. Default environments do not send mail.**

---

## 33. API / webhooks / integrations

| Surface | Status |
|---|---|
| Customer public API | **FOUNDATION** — only `GET /api/v1/health`, `whoami`, `projects` |
| API keys | Hashed keys, prefix, expiry, revoke in Settings |
| Webhook events allowlisted | `test.ping`, `project.created/updated`, `client.updated`, `billing.invoice.issued`, `api.key.revoked` |
| HTTP delivery | **FOUNDATION** — enqueue + retry **state machine**; comment: no HTTP fan-out |
| Azure OCR | Optional integration; see §21 |
| Supabase | Auth, Postgres, RLS, Storage — platform, not a customer connector |
| Vercel | Hosting implicit; no integration module |
| Statutory invoicing | **DISABLED** until a real provider; BillingRecord ≠ legal invoice |

Internal Next.js server actions are **not** a supported customer API.

---

## 34. PWA / mobile / offline

Installable PWA (manifest, standalone, locale start URL, install CTA). Service worker caches **shell only** and **never** caches financial routes.

**Works offline:** queued drafts of expense, time entry, change request, daily log, punch, inspection, form submission, photo capture; conflict detection; no silent overwrite.

**Needs connection:** all financial pages, documents, reports, OCR extract, signed uploads, search, Today collectors, anything not in those draft kinds.

Mobile navigation: four primary slots; More for the rest; card layouts on many lists; camera on document/OCR capture.

---

## 35. Audit / history / immutability

Append-only `audit_events` (no `updated_at`; app roles cannot UPDATE/DELETE). Settings → יומן פעילות. Export kind `audit`.

Users **cannot silently rewrite** finalized expenses, issued quote versions, applied allocation runs, billed BOQ progress, or recorded payments. Corrections are void / reversal / adjustment / supersede / new rate version / new budget revision.

Soft-archive for clients, employees, projects. Soft-delete for documents. Membership suspend rather than erase history.

---

## 36. Multi-tenancy / security

- Every tenant table has `organization_id`. Server actions take org from **session**, not from a client-supplied org id.
- RLS from migration `0001` onward; `app.is_org_member` is SECURITY DEFINER to avoid recursion.
- Authorization is **permission keys**, never role display names.
- Worker masking: no profit, no rates, BOQ prices zeroed, search without amounts.
- Documents: private signed URLs, org-prefixed storage keys.
- Composite FKs `(id, organization_id)` on sensitive OCR links.
- `service_role` is server-only (never `NEXT_PUBLIC_`). `anon` / `authenticated` are constrained by RLS.
- Portal public login cannot start an ExternalPrincipal session.

Secrets were not printed in this audit.

---

## 37. Role capability matrix

Default roles actually cloned (Hebrew): **בעלים**, **מנהל פרויקטים**, **כספים**, **עובד**.

Legend: Full = typical read+write for the area · Read · — = none · Toggle = off unless owner enables.

| Area | Owner בעלים | Manager מנהל פרויקטים | Finance כספים | Worker עובד |
|---|---|---|---|---|
| Clients | Full | Full | Full | — |
| Projects | Full | Full | Read | Read |
| Ops financials | Full | Read | Read | — |
| Profit | Full | **Toggle (off)** | Full | — |
| Expenses | Full | Full | Full | Read + create (no finalize) |
| Billing / AR payments | Full | Read; manage **Toggle** | Full | — |
| AP bills | Full | Full | **Read only** | — |
| Procurement / materials | Full | Full | Read | — |
| Employees | Full | Roster read; cost **read**; no master manage | Roster + **cost manage**; no master manage | — |
| Time | Full | Full | — | Full |
| Attendance | Full | Read/manage/self | Read | Self |
| CRM / quotes | Full | Full | Read | — |
| Budgets | Full | Full | Full | — |
| BOQ | Full | Full | Read + approve + bill (**no** manage/submit) | Read + submit |
| Approvals | Full | Read + decide (no rule config) | Read + decide | — |
| Reports | Yes | Yes | Yes | — |
| Documents / OCR confirm | Full | If expense/AP perms | If expense/AP perms | Upload docs; confirm needs expense/AP |
| Settings / tax / roles / API / portal | Full | — | Tax + audit | — |
| Changes / contracts | Full | Full | Changes read; contracts manage **Toggle** | — |
| Field ops / forms | Full | Full | Field read | Full field; forms submit |
| Service / dispatch | Full | Full | — | Service read (no dispatch) |
| Month close | Full | Read | Full | — |
| Today | Full | Read | Read | — |
| Banking | Full | Read | Full | — |
| Planning | Full | Full | Read | — |
| Assets | Full | Full | Read | — |
| Compliance | Full | Read | Read | — |

Evidence: `src/shared/permissions/role-templates.ts`.

---

## 38. Optional module matrix

24 keys in `OPTIONAL_MODULE_KEYS`. Default: **hidden** until first use or an explicit on, unless a business profile sets `enabled=true`. **Hiding never deletes data.** No code dependency graph between modules. Always-on (not in the list): Projects, Expenses, Settings, Dashboard.

| Key | Hebrew | Default | Profiles that turn it on | Maturity |
|---|---|---|---|---|
| `billing` | חיובים וגבייה | Auto/off | Almost all 12 | OPTIONAL-FULL |
| `workforce` | עובדים ושעות | Auto/off | All listed | FULL nav is permission-only |
| `vendors` | ספקים וקבלני משנה | Auto/off | All listed | OPTIONAL-FULL |
| `clients` | ספריית לקוחות | Auto/off | All listed | OPTIONAL-FULL |
| `documents` | מרכז מסמכים | Auto/off | GC, renovation, mixed | OPTIONAL-FULL |
| `changes` | רשימת שינויים חוצת פרויקטים | Auto/off | GC, renovation, mixed | OPTIONAL-FULL |
| `overhead` | כלי תקורה עסקית | Auto/off | **None** | OPTIONAL-FULL (`/overhead` nav home on existing expense engine) |
| `crm` | CRM ומכירות טרום־פרויקט | Auto/off | **None** | OPTIONAL-FULL if enabled |
| `compliance` | ביטוחים וציות | Auto/off | None | OPTIONAL-FULL registry |
| `portal` | גישת פורטל | Auto/off | None | DISABLED public / FOUNDATION admin |
| `api` | API ו־webhooks | Auto/off | None | FOUNDATION |
| `procurement` | רכש והזמנות רכש | Auto/off | GC only | OPTIONAL-FULL |
| `materials` | קטלוג חומרים | Auto/off | Reno + trades | OPTIONAL-FULL |
| `field_ops` | תפעול שטח | Auto/off | Trades, service, mixed | OPTIONAL-FULL |
| `assets` | נכסים וצי רכב | Auto/off | HVAC, maintenance, FM | OPTIONAL-FULL |
| `jobs` | עבודות (קצרות / יומיות) | Auto/off; also work-mix | All except GC | OPTIONAL-FULL |
| `quotes` | הצעות מחיר (לפני מכירה — לא חיוב) | Auto/off | GC, reno, trades, mixed | OPTIONAL-FULL |
| `service` | קריאות שירות | Auto/off | Trades + service profiles | OPTIONAL-FULL |
| `approvals` | אישורים | Auto/off | GC, FM, mixed | OPTIONAL-FULL / PARTIAL engine |
| `month_close` | סגירת חודש | Auto/off | GC, FM, mixed | OPTIONAL-FULL (nav permission-only) |
| `budgets` | תקציבים בפרויקט | Auto/off | GC, mixed | OPTIONAL-FULL (project tab) |
| `boq` | כתב כמויות / חשבונות חלקיים | Auto/off | GC, renovation | OPTIONAL-FULL (project tab) |
| `forms` | טפסי שטח | Auto/off | Trades + service | OPTIONAL-FULL |
| `command_center` | היום | Auto/off | GC, reno, maintenance, field service, FM, mixed | OPTIONAL-FULL |

12 business profiles: GENERAL_CONTRACTOR, RENOVATION, ELECTRICAL, PLUMBING, HVAC, MAINTENANCE, FIELD_SERVICE, FACILITY_MANAGEMENT, LANDSCAPING, CLEANING, INSTALLATION, MIXED_PROJECT_SERVICE.

---

## 39. Business-type fit (from implemented workflows only)

| Type | Fit | Why |
|---|---|---|
| General contractor | **GOOD FIT** | Projects, COs, BOQ + progress billing, procurement, budgets, AP, vendors, workforce, month close |
| Subcontractor / trade | **PARTIAL FIT** | Jobs, materials, field, quotes, AR/BOQ billing exist; no “we are the sub to a GC” product (back-charges, using a GC portal as the *user*) |
| Renovation | **GOOD FIT** | Mixed projects/jobs, changes, quotes, materials, BOQ |
| Service / maintenance | **GOOD FIT** | Work orders, dispatch, recurrence, assets, forms, Today |
| Electrician | **GOOD FIT** | Electrical profile: jobs-first, quotes, field, forms, materials |
| Plumber | **GOOD FIT** | Jobs + service-forward, emergency category, forms |
| HVAC | **GOOD FIT** | Jobs/service, assets, refrigerant category, forms |
| Architect | **PARTIAL FIT** | Time, quotes, documents, mixed profile labels; **no** BIM/CAD/drawing authoring |
| Designer | **PARTIAL FIT** | Maps toward renovation + checklist labels; not an FF&E studio product |
| Engineer | **NOT YET A GOOD FIT** | No profile, no calc/spec engine |
| Consultant | **PARTIAL FIT** | Time + billing + CRM exist; no retainer product; safety_consultant legacy maps to FM |
| Inspector | **PARTIAL FIT** | Site inspections on a project, not a standalone inspection firm loop |
| Project manager (firm) | **PARTIAL FIT** | Manager is a **role**. Light Gantt exists; CPM unsupported; GC-shaped org is closer |

---

## 40. Complete end-to-end business flows

### A. General contractor project

Lead/client → quote → project → contract → budget → BOQ → procurement → employees/subs → expenses/AP → progress → billing → payment → profitability → close

| Step | Support |
|---|---|
| Lead | OPTIONAL-FULL only if CRM enabled (profiles do **not** enable CRM) |
| Client | OPTIONAL-FULL |
| Quote | OPTIONAL-FULL (standalone or CRM); not billing |
| Project | FULL |
| Contract | FULL |
| Budget | OPTIONAL-FULL |
| BOQ | OPTIONAL-FULL |
| Procurement / PO commitment | OPTIONAL-FULL |
| Employees / time | FULL |
| Subcontractor BOQ schedule | OPTIONAL-FULL; AP must be posted manually |
| Expenses / AP | FULL |
| BOQ progress | OPTIONAL-FULL; **not** Actual |
| Progress billing | OPTIONAL-FULL |
| Payment | OPTIONAL-FULL (AR) |
| Profitability | FULL |
| Month close | OPTIONAL-FULL operational close |

**Not fully supported:** CRM-on-by-default, auto AP from valuations (draft AP only), statutory invoice, GL close, customer portal approvals. PO receiving qty exists (Commitment stays on the PO; Actual stays on the vendor bill).

### B. Trade subcontractor job

Client → job/project → estimate → workforce/material → expense → invoice → payment

Supported if modules on: client, job, quote, time, materials catalog, expense, billing, payment. **Partial:** materials usage is not Actual; inventory costing absent; no GC-portal-as-user.

### C. Service / maintenance call

Client → work order → dispatch → technician/time → materials/expense → completion → billing

Supported: WO, dispatch, time, expense, complete, bill via shared AR, checklist ↔ Forms gate. **Partial:** dedicated WO invoice, inventory issue-to-job as Actual. Recurrence for maintenance contracts: OPTIONAL-FULL.

### D. Consultancy / design project

Client → project → assignments/time → expenses → milestone/billing → profitability

Supported: project, assignments, time as labor Actual, expenses, contract, billing (including advances), profit. **Not fully supported:** design-stage fee engine, drawing/BIM, retainer product, Gantt as MS Project, CRM email reminders.

---

## 41. NOT CURRENTLY SUPPORTED / INTENTIONALLY DISABLED

- **Customer/vendor external portal login = OFF** (`isExternalPublicAccessEnabled(): false`)
- BIM / CAD / drawing authoring
- Statutory Israeli invoicing / חשבונית ישראל / Green Invoice / Morning (tables exist; issuance throws until a real provider; local ids forbidden)
- Payroll, payslips, net pay, statutory salary
- General ledger / chart of accounts / double-entry / accounting period close
- Bank reconciliation that **posts** the books (matches must not mutate truth; live feed is a stub)
- Automatic Actual from BOQ progress (**intentional**)
- Automatic Actual from PO, attendance, assignment, inventory, maintenance metadata
- Automatic AP from subcontractor valuation (**intentional** safe boundary)
- Customer e-sign / magic-link approval
- Notification/reminder delivery product (email/push)
- Native App Store / Play apps
- Webhook HTTP delivery to customer URLs
- Broad public REST (only three `/api/v1` routes)
- Stock reservations, inventory valuation / FIFO / AVG costing (qty locations and transfers exist)
- Critical path, resource leveling, working calendars
- Data purge / GDPR-style retention policy (cash “retention” is holdback)
- Israeli statutory document numbering (internal sequences exist at `/settings/numbering`)
- Safety incident / toolbox-talk module
- Geocoding (location is free text)

---

## 42. Foundation-only / partial features

Schema or stub exists, complete owner workflow does not. Overnight-closed items are **not** listed here.

| Feature | What exists | What is missing |
|---|---|---|
| Public portal | Disabled page, grants, redaction, vendor candidates | Login, sessions, customer self-serve |
| Statutory invoicing | `external_statutory_documents` | Provider + legal PDF issuance |
| Banking | Accounts, file import, match decisions | Live feed; posting cash to AR/AP |
| Webhooks | Rows, signatures, retry states | HTTP worker |
| Public API | Keys + 3 routes | clients/billing HTTP, write APIs |
| Critical path | Function always `supported: false` | Real CPM |
| Inventory costing | Qty + locations + transfers | FIFO / AVG / Actual from stock |
| Equipment usage | Records | Cost recognition |
| Project-scoped roles | `projectId` column | Seeding / UI |
| Contract `adjustment` events | Enum | App writer |
| Multi-contract | Schema | Primary-only UX |
| Notifications | Invite email port | Product |
| OCR queue | In-request extract | Durable worker |
| Ops→expense links | Draft creation | Always-obvious UI on every ops record |
| Dedicated WO invoice | Shared AR billing | Separate WO invoice object |
| Timesheet loop | Named approval type | Submit/approve product |
| Client timeline | Contacts + projects on the client | Activity timeline product |

Closed overnight (now OPTIONAL-FULL, kept out of this table): PO receiving qty, `/overhead` home, quote-discount gate, time-correction gate, WO checklist ↔ Forms, month-close DB freeze (0037), document numbering settings, CRM board/next-action, custom-field search.

---

## 43. Test / quality map

**Do not treat a test filename as runtime proof.** Sampled assertions were inspected for financials, RLS, BOQ, and portal.

| Layer | What runs |
|---|---|
| Unit / UI (Vitest) | `npm run test:unit`, `test:ui` — **in CI** |
| Integration (PGlite) | `npm run test:integration` — **in CI** |
| Migration hardening | `npm run test:migration` serial — **in CI** |
| Typecheck, lint, production build | **in CI** (`.github/workflows/ci.yml`) |
| Playwright critical e2e | `npm run playwright:ci` — **in CI** (PGlite + auth stub; owner/worker/BOQ/master journeys; no live Supabase secrets) |
| Playwright full e2e | `npm run test:e2e` — local/full suite, not the CI job |
| `npm run verify` | typecheck + lint + unit only (not integration) |

**Strong coverage:** financial compose (Actual ≠ committed; bill-linked expenses excluded), RLS/tenant isolation, BOQ integrity 0032–0035 (over-measurement throws; unique billing link), expenses/billing/AP/tax/retention, workforce rates and month displacement, portal policy `enabled === false`.

**Moderate:** OCR unit + some integration, CRM/quotes/service unit, planning unit, banking “matches do not mutate”, shell/i18n UI. Playwright critical journeys run in CI; they are not a substitute for the full local e2e catalog.

**Weak / absent from CI:** remaining Playwright files outside `playwright:ci`, webhook HTTP, statutory provider, live bank feed, public API breadth.

Migrations on disk: **0000–0045, numbering skips 0003** (journal 0002 → 0004). 45 SQL files. **0036–0045 are applied.** **0000–0045 are immutable history.**

---

## 44. Database / schema inventory

~142 tables across `drizzle/schema/*.ts`. Grouped for owners (not a SQL dump):

| Business area | What is stored |
|---|---|
| Identity / tenancy | Profiles, last-org hint, organizations, memberships, invitations, module prefs, JSON settings, `document_number_sequences` |
| RBAC | Permission catalog, cloned roles, grants (`projectId` reserved) |
| Audit | Append-only activity |
| Clients / vendors | Masters, contacts, identifiers, vendor engagements |
| Projects | One `projects` row for project/job/work_order; domains; work packages; phases; milestones; service details |
| Contracts / changes | Contract amounts, value events, CRs, CO quotes/versions, recorded approvals, change orders (reversing CO is a new row; `reversal_of_change_order_id`) |
| Expenses | Categories, expenses, allocations, frozen allocation runs |
| Workforce | Employees, assignments, rates, burden, month employer cost, time, attendance |
| Billing | Internal billing records/lines, customer payments, `payment_applications` |
| Tax | Dated rules, per-document overrides |
| Documents | Metadata + links (bytes in Storage) |
| CRM / quotes product | Prospects, leads, opportunities (incl. next-action fields), sales quotes; separate pre-sale `estimates` |
| Portal | External people, grants, vendor candidates (cannot write financials) |
| Compliance / custom fields | Artifacts; field definitions/values |
| API | Clients, hashed keys, webhook endpoints/deliveries |
| Procurement | Materials, RFQs, supplier quotes, POs, **committed_costs**, `po_receipts` / `po_receipt_lines` |
| Field / assets | Logs, punch, inspections, assets, fleet, maintenance, inventory qty + `inventory_locations` |
| AP | Bills (net/tax/gross), matches, payments/applications, credits (net/tax/gross), bill allocations |
| Banking | Accounts, import batches, transactions, match decisions |
| Planning | Work items, FS dependencies |
| OCR | Extraction jobs (draft FKs only) |
| Ops finance | Links from ops records to **draft** expenses |
| Statutory | External document status (disabled until provider) |
| Approvals / month close / budgets / forms / Today / recurring drafts / retention | Rules/requests; periods/adjustments; budgets; form templates/submissions; inbox state; draft runs; retention releases |
| BOQ | Baselines, nodes, change allocations, progress batches, billing links, subcontractor schedules/valuations |

**Financial source-of-truth:** `contracts` + `contract_value_events`; finalized `expenses`; labor snapshots / applied labor runs; posted `ap_bills`; finalized `billing_records` − `payments`; `committed_costs` for commitment only.

**Immutable/history:** audit, value events, issued quote versions, void/adjust chains, applied allocation runs, rate versions, BOQ allocations and billed links, retention releases, bank match decisions.

---

## 45. Master capability matrix

The full 175-row table is in [`PROJECTFLOW-CAPABILITY-MATRIX-V2.csv`](./PROJECTFLOW-CAPABILITY-MATRIX-V2.csv).

Columns: AREA, CAPABILITY, USER-FACING?, BACKEND COMPLETE?, UI COMPLETE?, MOBILE?, PERMISSION-GATED?, OPTIONAL MODULE?, FINANCIAL EFFECT?, STATUS, EVIDENCE, NOTES.

Status counts (must match the CSV and the opening table):

| STATUS | Count |
|---|---|
| FULL | 67 |
| OPTIONAL-FULL | 79 |
| PARTIAL | 8 |
| FOUNDATION | 10 |
| DISABLED | 3 |
| NOT-IMPLEMENTED | 8 |

DISABLED three: public portal login; statutory invoicing issuance; automatic Actual from BOQ progress.

---

## 49. Remaining gaps after overnight (not inflated)

Closed overnight items are listed as closed. Remaining rows are still real.

### Financial-truth

| Area | Severity | Expected | Actual | Evidence | Affects |
|---|---|---|---|---|---|
| AP VAT | — closed overnight | Vendor Actual = NET | Bills and vendor credits carry net/tax/gross; Actual uses NET; credit Actual uses the credit's own NET/GROSS | 0036; `bill-tax.ts`; `vendor-credits.ts` | Financial truth |
| Invoiced vs profit VAT basis | MEDIUM | Operators may treat Invoiced as revenue | Invoiced is **gross**; profit uses **net CCV** (labeled in UI) | `signedBillingAmount` vs `computeProfitPosition` | Financial truth if unlabeled |
| Quote-discount approval | — closed overnight | Large discounts gated | `quote_discount` gate on send | quotes send path | Financial process |
| Time-correction approval | — closed overnight | Corrections gated | `time_correction` gate; Actual unchanged until approved | workforce time | Financial process |
| Month-close adjustments | MEDIUM | Adjustment unlocks source supersede | Rows fold in compose; expense/AP rows unchanged | `economic-corrections.ts` | Financial truth / usability |

### Security gaps (2)

| Area | Severity | Expected | Actual | Evidence | Affects |
|---|---|---|---|---|---|
| Employee import rates | LOW | Cost fields extra-gated | Optional `baseRate` on employee import with `workforce.manage` | import field-defs | Security / privacy |
| BOQ base table | — closed overnight | All reads via secure view | `authenticated` has no DML/SELECT on `boq_nodes`; draft writes via `app.boq_mutate_draft_node`; numbering consume is permissioned | 0042 + 0043 + 0045 | Security |

### Data-integrity gaps (3)

| Area | Severity | Expected | Actual | Evidence | Affects |
|---|---|---|---|---|---|
| Month-close DB freeze | — closed overnight | Closed period immutable at DB | 0037 freeze; payments recorded→void only | `0037_month_close_db_freeze.sql` | Data integrity |
| Change Order reversal | — closed overnight | Undo approved CO / CCV | `app.reverse_change_order` inserts reversing CO + opposite event + scoped BOQ unwind in one transaction. Reversing INSERT requires unforgeable `app.co_reversal_ctx` (not a session GUC). `changes.approve` cannot unwind BOQ alone. | `0045`; `reverse-change-order.ts` | Data integrity / financial |
| Document byte cleanup | LOW | Delete bytes with metadata | Soft-delete plus storage cleanup path | `storage-cleanup.ts`; 0041 | Data (orphan objects) |

### Usability gaps remaining (intentional or out of overnight scope)

Forms acknowledgement is not legal e-sign (wording is explicit). Reports remain one page with section deep links, not a BI catalog. Webhooks/API do not leave the box. No notifications. Email default off. OCR default off. Inventory is qty-only (labeled). Gantt is not MS Project (labeled). Settings country pack is IL/US/GB. Portal Settings page stays hidden. Attendance completeness is a presence heuristic (labeled). CRM has no email reminders. Timesheet submit/approve loop is not a product. Multi-contract UX remains primary-only.

Overnight closed: BOQ field strip, PO receiving, draft AP from valuation, client AR 360, CRM board/next-action, numbering settings, field photos on create, overhead home, job employee picker, split AR, `/sales` hub, custom-field search, WO checklist wiring.

### Other product gaps

Google/AWS OCR unimplemented; live bank feed stub; multi-contract UX primary-only; contract `adjustment` kind unused; project-scoped roles unused. Playwright critical suite is in CI (`playwright:ci`, PGlite harness, no live secrets).

---

## Evidence rule used

Every FULL / OPTIONAL-FULL claim required a usable route or UI **and** application/domain logic **and** schema where money or tenancy is involved. Tests were used as supporting evidence, not as the feature. Documentation-only or type-only surfaces were marked FOUNDATION or NOT-IMPLEMENTED.

Inspected: app routes, navigation, settings access, permission catalog, role templates, optional modules, business profiles, Drizzle schema, migrations 0000–0045, locales `he-IL`, domain modules (financials, BOQ, billing, AP, expenses, workforce, portal, OCR, command-center, search, imports, exports), CI workflow, sampled tests.

---

These reports are part of the overnight release.

Portal = OFF

