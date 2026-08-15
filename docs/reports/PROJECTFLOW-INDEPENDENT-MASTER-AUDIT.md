# ProjectFlow — Independent Master Product / System Audit

**Auditor:** independent, not involved in the previous 3-wave implementation  
**Repository:** `PROFLOW2026/PROFLOW` · branch `main`  
**Inspected commit:** `b8f53f8bfa959574781398a961d1c1a7287f3618`  
**Date:** 15 August 2026  
**Nature:** read-only mapping of what the product actually does today  
**Portal:** intentionally OFF (`isExternalPublicAccessEnabled(): false`)  
**Code / SQL / migrations / commit / push / deploy:** none

This report does **not** trust previous completion reports. Overnight documents claimed many modules as PASS. Where the code, routes, schema, and UI disagree, this report says so.

Status words used throughout:

| Status | Meaning |
|---|---|
| **DOES NOT EXIST** | No usable product surface |
| **FOUNDATION ONLY** | Schema, domain, or unused action exists; a contractor cannot run it |
| **PARTIAL** | Real workflow with a hole that breaks or misleads the user |
| **FUNCTIONAL** | A contractor can complete the job, with known limits |
| **COMPLETE / MATURE** | End-to-end, coherent, and hard to misuse for this product’s purpose |

A route, table, or button is not enough for FUNCTIONAL. The workflow must be usable.

---

# סיכום מנהלים (עברית)

ProjectFlow **כבר מוצר אמיתי** לניהול עסק מבוסס פרויקטים — קבלנים, שירות, תחזוקה, תכנון. זה **לא** תוכנת הנהלת חשבונות, **לא** משכורות, **לא** פורטל לקוחות, ו**לא** חשבונית ישראל.

**מה באמת עובד טוב היום**

- לקוח → פרויקט/עבודה/קריאת שירות → חוזה → עלויות → חיוב → גבייה → רווחיות — המסלול הזה קיים.
- מנוע כספי **אחד**. החיוב אינו תשלום. התחייבות (הזמנת רכש) אינה עלות בפועל. מע״מ אינו רווח. שינוי מאושר משנה חוזה נוכחי; שינוי ממתין לא.
- הוצאות, חשבוניות ספק, תשלומים לספק, BOQ (כתב כמויות), שינויים מסחריים, סגירת חודש — אלה מוצרים אמיתיים, לא מסכים ריקים.
- שטח: יומן יומי, פאנץ׳, בטיחות, טפסים, נוכחות שעון. מסמכים עם גרסאות. חיפוש כללי. עברית RTL ו־PWA.

**מה נראה שלם אבל אינו שלם**

- **מכירות / הצעות מחיר:** יש שלושה עצמים שנקראים “הצעת מחיר”. מסלול ליד → הצעה → לקוח → פרויקט **אינו מסלול אחד**. לוח ה־CRM לא מזיז עסקאות.
- **קבלני משנה:** אפשר לרשום הסכם. אפשר למדוד התקדמות ב־BOQ. אפשר להפיק חשבונית ספק. **שלושתם לא מחוברים.**
- **ריבוי חוזים בפרויקט:** אפשר להוסיף חוזה שני ולשייך BOQ/חיוב. **אי אפשר לערוך חוזה במסך, ואי אפשר לכוון שינוי לחוזה שאינו ראשי.** רווחיות נשארת ברמת הפרויקט.
- **שעות עובד שטח:** אישור שעות למנהל עובד. לעובד עצמו הלולאה שבורה — אין קישור משתמש↔עובד במסך, וטופס השעות דורש הרשאה שהעובד לא מקבל.
- **OCR:** הארכיטקטורה רצינית (תור, Azure, סקירה אנושית, טיוטות בלבד). בלי דגל הפעלה, מפתחות, וקריאת worker — העבודות נשארות בתור.
- **התראות:** פעמון פנימי אמיתי. אין מייל/פוש. רוב ההתראות הולכות למי שפתח את הפעמון, לא לממונה.

**מה מבלבל בעלים רגיל**

- פרויקט / עבודה / קריאת שירות הם **אותה רשומה כספית** עם שלושה תפריטים.
- הוצאה ≠ חשבונית ספק — שני פתחים לכסף יוצא.
- שיבוץ / תכנון גנט / לוח קריאות — שלושה לוחות נפרדים.
- “היום” ופעמון ההתראות — שני תיבות דואר.
- יותר מדי פריטים תחת “עוד” כשכל המודולים דלוקים.

**מה לא לבנות עכשיו**

פורטל חיצוני, הנהלת חשבונות מלאה, התאמות בנק כספרי חשבונות, חשבונית ישראל, מלאי FIFO, פחת, משכורות, שיבוץ בסגנון Microsoft Project, API ציבורי גדול.

**מה כן לבנות אחר כך (בקצרה)**

1. מסלול מכירות אחד ברור (או להסתיר את הכפילות).  
2. לולאת שטח לעובד: קישור משתמש, דיווח שעות עצמי, שיוך פאנץ׳.  
3. שרשרת קבלן משנה אמיתית.  
4. פישוט ניווט ומינוח לבעל עסק.  
5. OCR כתפעול אמיתי + הרשאות פרויקט למסמכים.

**בשורה אחת:** המוצר מוכן לשימוש יומיומי אצל בעלים שמבינים את הכללים הכספיים ומריצים פרויקט אחד / עבודה אחת. הוא **עדיין לא** פשוט מספיק, ועדיין לא שלם במכירות, קבלני משנה, ועבודת שטח של העובד עצמו.

---

## A. What ProjectFlow is today

ProjectFlow is a **Hebrew-first, RTL, multi-tenant operations and commercial-control system** for project-based businesses: contractors, subcontractors, electrical / plumbing / HVAC, maintenance, service companies, architects, designers, consultants, engineers, inspectors, and project managers.

It is **not** a general ledger, payroll system, statutory Israeli invoicing product, warehouse accounting system, or customer/vendor portal.

### What an owner can actually do

1. Create an organization, invite people, turn modules on/off, set tax, currency, timezone, numbering, and a work mix (projects / jobs / mixed).
2. Keep **clients** with contacts, documents, AR snapshot, and a history timeline.
3. Send a **pre-sale quote** with lines, mark it sent/accepted, and convert it to a project or job with an opening contract.
4. Run work as a **project**, a shorter **job**, or a **service call (work order)** — three skins of the **same financial row**.
5. Hold a contract (original vs current), take **change requests**, approve **change orders**, reverse a change order without rewriting history.
6. Build a **BOQ**, activate it, measure progress, approve, and bill through the **same AR engine**.
7. Capture **expenses** (project or overhead), finalize/void/correct, allocate overhead.
8. Buy through **RFQ → supplier quote → purchase order → receiving → vendor bill → pay**. Commitment is on the PO. Actual is on the posted bill. Payment is cash only.
9. Keep a **workforce roster**, rate versions, project assignments, time entries, manager timesheet approval, and a separate **attendance clock**.
10. Dispatch service calls, generate recurring work orders, bill a work order through AR.
11. Keep field **daily logs, punch items, inspections, safety records, forms**.
12. Keep **inventory quantity** (locations, movements, reservations, counts) without inventory accounting.
13. Keep **fleet/assets** and maintenance records (cost is metadata, not Actual).
14. Store **documents** with folders, versions, private signed storage, and entity links.
15. Close a **month** with a checklist, freeze source records, and post explicit corrections.
16. See **Today**, a **home dashboard**, **reports**, global search, Quick Create, and an in-app notification bell.
17. Work from a phone as a **PWA**, with offline **drafts** for a defined list of capture kinds.

### What the overnight reports overstated

| Claim in previous release notes | Independent finding |
|---|---|
| Multi-contract = PASS / complete | **PARTIAL.** Create/list/primary + BOQ/billing scope exist. No contract edit UI. Changes always bind to the primary at create. Profit is project-level. |
| Advanced subcontractors = PASS | **PARTIAL / chain missing.** Agreement, BOQ schedule, and AP bill are three notebooks. |
| Timesheet approval = PASS | **FUNCTIONAL for managers. Worker loop does not close.** |
| CRM kanban = OPTIONAL-FULL | **PARTIAL.** Board is a read-only grouping. Cards do not move. |
| Client timeline = closed | **FUNCTIONAL as a projection.** CRM events never appear. The `activity_events` index has no production writers. |
| OCR background queue = PASS | **FUNCTIONAL architecture, PARTIAL operations.** Off by default; worker must be called; no Vercel cron in repo. |
| Project-level permissions = PASS | **PARTIAL in product terms.** Manager and Finance ship with `projects.access_all`. Roles UI cannot turn it off. |
| Notifications engine = PASS | **FUNCTIONAL in-app.** Most scanners notify the person who opened the bell. Email/push are stubs. |
| Resource scheduling = PASS | **FUNCTIONAL as a people board.** It is not Gantt and not dispatch. |
| Change-request lines | **FOUNDATION ONLY.** Repository exists. No UI and no application callers. |

The financial invariants those reports listed are **real**. The “module completed” stamps are **not all real as owner products**.

---

## B. Complete Capability Map

### B1. Clients / CRM / Quotes

| Capability | Status | What exists | What is partial | What is missing | Quality |
|---|---|---|---|---|---|
| Clients | **FUNCTIONAL** | List/create/edit/archive/restore; search; custom fields | Company vs contact phone is easy to mix | Merge, CSV from client screen (import wizard exists separately) | Solid CRUD |
| Multiple contacts | **FUNCTIONAL** | Roles primary / billing / site / other; mark primary | Add-contact form has no role picker (defaults to primary) | Unique billing/site contact | Domain clear; add UX sloppy |
| Billing / site contacts | **PARTIAL** | Labels on the client card | Roles are labels only | Billing issuance does not read `role=billing` | Schema ahead of product |
| Client ↔ project | **FUNCTIONAL** | `projects.client_id`; client card lists work | Client page cannot create a project | Client’s quotes list on the card | Real relationship |
| Client timeline | **FUNCTIONAL** | Live projection: projects, product quotes, contracts, changes, BOQ, billing, payments, documents | `activity_events` unused in production; CRM never appears; status-change heuristic | Lead/opportunity/CRM-quote history | Good AR/history; incomplete sales story |
| Client documents | **FUNCTIONAL** | Canonical documents panel | Needs storage configured | Required-docs checklist | Correct reuse |
| Client AR snapshot | **FUNCTIONAL** | Invoiced / paid / outstanding / overdue | Hidden without `billing.read` | Full statement export on the card | Honest collections glance |
| Leads | **PARTIAL** | Create + status; link toward opportunity | List is thin; cannot attach prospect on create; little edit | Lead→client convert | Notepad, not a sales tool |
| Prospects | **PARTIAL** | Company + contacts | No edit/archive; contacts do not copy on convert | Convert-to-client without an opportunity | Dead-end unless user already knows CRM |
| Opportunities | **PARTIAL** | Detail, notes, estimates, sales quotes, convert, mark lost | Stage stored but **no stage picker on the follow-up form**; board does not drag | Pipeline movement; won without convert | Conversion rules are careful; board is theater |
| CRM kanban | **PARTIAL** | Columns for all stages; next-action badge | Read-only grouping | Drag, filters, owner, WIP | Presentation only |
| Next-action | **FUNCTIONAL** (narrow) | Date + text; overdue badge | No Today/notification hook | Reminders | Sticky note, not a follow-up system |
| CRM internal estimates | **FOUNDATION ONLY** | Name + internal amount on opportunity | Create only | Lines, status, convert | Easy to confuse with `/quotes` |
| CRM sales quotes + revisions | **PARTIAL** | One-line create; issue; accept; version rules in domain | `createSalesQuoteVersion` has **no UI** | Multi-line editor, print, listing on `/quotes` | Backend unused |
| Product Quotes (`/quotes`) | **FUNCTIONAL** | Lines, tax, discount, lifecycle, convert, print | `updateQuoteAction` has **no edit form**; no contact picker | Revisions, email, PDF file | The path a contractor can actually run |
| Quote discount approval | **PARTIAL** | Gate on send via generic approvals | Error, not a submit-for-approval screen on the quote | Clear UX on the quote page | Correctly scoped to product quotes |
| Quote → project | **FUNCTIONAL** (two paths) | `/quotes` convert; CRM convert won | Two objects, two permissions, two results | One wizard | Money/VAT rules are serious |
| Commercial in-project quotes | **FUNCTIONAL** | `/changes/.../price`; versions; accept → change order | Not a bid | Does not create a project | Correctly isolated |
| Unified Lead → Quote → Project | **DOES NOT EXIST** | Two parallel paths | — | One sales journey | Naming collision is the defect |
| `/sales` hub | **PARTIAL** | Cards exist | **Not in main nav** | One workspace | Duplicate door |

**Could a contractor use it without docs?** Yes for **Clients + `/quotes` → Convert**. No for **Sales**.

---

### B2. Projects / Jobs / Work Orders

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Shared financial entity | **COMPLETE / MATURE** | One `projects` row; `work_kind` = project / job / work_order | Three menus confuse owners | Engine is identical and correct |
| Project types | **PARTIAL** | Real type is work kind; role/delivery are free text | No type catalog | Weak |
| Work-type defaults | **FUNCTIONAL** | Org default + create hint | Does not hide other forms | Fine |
| Lifecycle / status | **FUNCTIONAL** | draft / active / on_hold / completed / cancelled / archived; WO has a service sidecar status | Restore always returns to `active` | High |
| Project / job / WO numbering | **DOES NOT EXIST** | Sequences exist for estimates, CRs, POs, bills, AR | No project number | Gap for contractors who say “פרויקט 104” |
| Contacts | **FUNCTIONAL** | Primary contact must belong to the client; WO also has site name/phone | Not billing vs site split | Medium |
| Team | **FUNCTIONAL** | Assignments on jobs/projects; WO best-effort | WO assignment can fail silently without `workforce.manage` | Medium |
| Archive / restore | **FUNCTIONAL** | Soft archive | Prior status lost on restore | Medium |
| Recurring service | **FUNCTIONAL** | Definitions generate new WO rows | Always open-price; inserts projects directly | Usable with caveats |
| Dispatch | **FUNCTIONAL** | `/dispatch` board + reschedule | Does not write resource bookings | Usable |
| Clone / duplicate | **PARTIAL** | Structure clone (WPs / phases / milestones) | No financials, docs, assignments | Not “duplicate project” |
| Jobs commercial surface | **PARTIAL** | Jobs hide changes / BOQ / work tabs | Convert to project required for full commercial UI | By design, but easy to miss |
| WO billing (“חייב את העבודה”) | **FUNCTIONAL** | Composes labor/materials/call-out/extras → **existing AR** | Does not set `contract_id`; one live bill per WO | High — not a second engine |

---

### B3. Contracts

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Multiple contracts per project | **PARTIAL** | Schema + create additional/secondary + make primary + list cards | `updateContractAction` **never used by a form**. No close/cancel/edit after create | Not schema-only; not owner-complete |
| Original vs current value | **COMPLETE / MATURE** | Events: original + approved change orders / adjustments; pending CR shown not added | FX contracts excluded with coverage | High |
| Amendments | **DOES NOT EXIST** | — | No amendment entity | Do not confuse with event kind `adjustment` |
| `contract_type=adjustment` | **DOES NOT EXIST** | Allowed types: primary / additional / secondary | Adjustment is a **value-event kind**, not a contract type | Overnight wording was misleading |
| Retention % on contract | **PARTIAL** | Stored; billing can inherit | Not a contract retention ledger | Metadata + AR |
| Contract-level billing | **PARTIAL** | Optional `contract_id` on AR; picker when >1 contract | WO billing skips it | Tagging, not a second AR |
| Contract-level BOQ | **FUNCTIONAL** | One active BOQ per contract | Jobs/WOs do not host BOQ workspace | Yes when multi-contract is used |
| Multi-contract profitability | **PARTIAL** | CCV summed per live contract | Cost/labor/AP stay **project-level** | Coherent project P&L; not contract P&L |
| Change targeting | **PARTIAL** | Approve can use CR `contractId` | Create always binds **primary**; no picker | Weak |

**Verdict:** multi-contract is **usable for identity + scoped BOQ/AR**, not a complete multi-contract commercial product.

---

### B4. BOQ / כתב כמויות

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Draft / import | **FUNCTIONAL** | Create draft; import items on draft | — | Medium–high |
| Activate | **FUNCTIONAL** | Draft-only activate; one active per contract | — | High |
| Progress (prev / current / cumulative) | **FUNCTIONAL** | Progress certificates | — | High |
| Approval | **FUNCTIONAL** | `boq.progress.approve` | Separate from `/approvals` inbox | High |
| Progress billing | **FUNCTIONAL** | Approved batch → existing AR; VAT is AR’s job | — | High |
| Original vs current quantities | **FUNCTIONAL** | Post-activate current mutates via allocate RPC | — | High |
| Approved change allocation | **FUNCTIONAL** | Manual after CO approve | Not automatic | Medium |
| Retention on progress bill | **FUNCTIONAL** | Optional; cash timing only | — | High |
| Reversals | **PARTIAL** | Must go through change-order reverse; allocation reverse RPC exists | **No reverse-allocation control in BOQ UI** | Domain stronger than UI |
| Immutability | **FUNCTIONAL** | Baseline locked; billed/superseded/voided locked | — | High |
| Jobs / WO BOQ | **PARTIAL / missing** | Measure-entry link on jobs if module on | No BOQ workspace on WOs | By design |
| Reporting | **PARTIAL** | Panel KPIs; comparison **reads** `getProjectFinancials` | Not a certificate pack | Honest: Progress ≠ Actual |

**Lifecycle draft → activate → progress → approval → billing is real on classic projects.**

---

### B5. Change management

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Change requests | **FUNCTIONAL** | `/changes`, project tab, draft edit | — | High |
| CR lines | **FOUNDATION ONLY** | Table + `replaceChangeRequestLines` | **Zero application callers; detail never renders lines** | Schema PASS, product FAIL |
| Approvals | **FUNCTIONAL** | draft → awaiting → approved / rejected / cancelled | “Sent” is a timestamp, not a status | High |
| Commercial effect | **COMPLETE / MATURE** | Approval inserts CO + signed CCV event (NET). VAT ≠ CCV | — | High |
| Current contract | **COMPLETE / MATURE** | Only approved COs move CCV | Pending shown separately | High |
| BOQ allocation | **FUNCTIONAL** | Manual after approve | — | Medium |
| Reversals | **FUNCTIONAL** | Reversing CO + opposite event + unwind that CO’s BOQ allocations; blocked if billed/already reversed | Month-close aware | High |
| Audit | **FUNCTIONAL** | Created / submitted / approved / CO / reversed | — | High |

---

### B6. Budget / forecast / profitability

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Project budget + revisions | **FUNCTIONAL** | Create active; revise snapshots new revision | Approval gate `budget_revision` | Medium |
| Categories / WPs / cost codes | **PARTIAL** | Line types exist | Form is category + raw WP id; **no cost-code / discipline inputs** | Lightweight yes |
| Committed / actual / ETC / forecast / variance | **FUNCTIONAL** | Copied from engine `CostPosition` | — | High |
| Unallocated | **FUNCTIONAL** | Disclosed, not forced into profit | — | Medium |
| Explainability (“why this number”) | **FUNCTIONAL** | From composed figures only | — | High |
| Confidence | **FUNCTIONAL** | Coverage: FX, missing labor, drafts | — | Medium |
| Cost-code actuals | **DOES NOT EXIST** | Keys are not on expenses/AP | Mapping would be invented | Honest refusal |
| One financial truth engine | **COMPLETE / MATURE** | `composeProjectFinancials` is the project P&L | Org dashboard uses same formulas at org grain | High |

Formulas the product actually uses:

- **Actual** = unmatched expenses + approved recorded labor + recognized vendor bills + month-close cost adjustments  
- **Forecast** = Actual + open commitments + expected remaining  
- **Current contract** = original ± approved additions/reductions  
- **Margin** = CCV − cost (net; VAT excluded)  
- Open-price jobs/WOs without a price: profit is **null**, not a fake loss  

---

### B7. Expenses / Vendors / AP / Procurement / Subcontractors

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Expense draft / finalize / void | **FUNCTIONAL** | Capture form; month-close gate; optional approval | — | High |
| Adjustments / reversals | **FUNCTIONAL** | Void+replace; correction dialog | VAT-aware correction is incomplete (forced net) | Mixed |
| Allocations | **FUNCTIONAL** | Overhead only; several weight drivers | Project expenses cannot carry allocation lines | High |
| Tax net / gross | **FUNCTIONAL** | Shared tax engine; snapshot at finalize | Legacy undivided = net=gross | Mixed |
| Project vs overhead | **FUNCTIONAL** | XOR targeting; `/overhead` | — | High |
| Expense documents | **PARTIAL** | On detail after save | Not on create | Mixed |
| OCR → expense draft | **FUNCTIONAL** (gated) | Confirm creates **draft only** | Needs OCR live | Never auto-Actual |
| Expense “recurrence” field | **FOUNDATION ONLY** | Encodes a cadence string | **Does not generate rows** | Misleading if used |
| Recurring drafts module | **FUNCTIONAL** | expense / vendor_bill / billing_record templates; generate **now** | **No cron worker** | Safe (always draft) |
| Vendors + contacts | **FUNCTIONAL** | Types supplier / subcontractor / both / other | Type **not enforced** on subcontract create | Mixed |
| Engagements | **FUNCTIONAL** | Dated vendor↔project; not cost | — | Roster, not money |
| Vendor compliance | **PARTIAL** | Flags on documents | Expired insurance is a badge, not a gate | Weak as a register |
| Vendor card AP / credits / aging | **DOES NOT EXIST** | AP lives under Procurement | Outstanding helper unused on vendor page | Hole |
| Subcontract agreements | **PARTIAL** | Header, original, retention %, status, append-only value events, docs | No scopes; no approvals; no AP post; cash display is vendor+project not agreement | Thin commitment record |
| BOQ subcontractor schedule | **FUNCTIONAL** | Valuations → **draft AP** only | Linked to **engagement**, not agreement (`subcontract_agreement_id` unused in app) | The only progress→bill path |
| Subcontract end-to-end | **DOES NOT EXIST** as one product | Three pieces | Agreement % does not flow to bill retention | Manual stitching |
| AP bills / lines | **FUNCTIONAL** | Create, post, void, documents | — | High |
| Bill ≠ Payment ≠ Actual | **COMPLETE / MATURE** | Posted bill → Actual; payment never Actual; receiving never Actual | — | High |
| PO / expense matching | **PARTIAL** | Amount match; partial OK; never creates expense | **Not 3-way** (receipts unused) | Mixed |
| AP credits + applications | **FUNCTIONAL** | Reduce outstanding **and** Actual (credit NET) | — | High |
| AP payments + applications | **FUNCTIONAL** | Cash only; immutable applications | — | High |
| AP aging | **FUNCTIONAL** | From outstanding (bill − payments − credits − held retention) | `?vendorId=` / `?projectId=` disclosure-only, not filters | Mixed |
| AP project allocations | **FUNCTIONAL** | Slice bill NET | Preview uses JS Number | Mixed |
| AP retention | **FUNCTIONAL** | Capture / release; payable-now reduced; Actual unchanged | Not copied from subcontract | High |
| AP VAT | **FUNCTIONAL** | Actual = NET; payable/aging = GROSS | — | High |
| RFQ → quotes → PO | **FUNCTIONAL** | Draft/sent/closed; accept quote builds PO | — | Mixed |
| Supplier comparison | **PARTIAL** | Header totals sorted | No line-by-line / lead time | Weak–mixed |
| Receiving | **FUNCTIONAL** | Partial yes; **over-receive rejected** | Does not move inventory or Actual | Mixed |
| PO revisions | **DOES NOT EXIST** | Status updates only | No amend lines after issue | — |
| PO cancel / close | **FUNCTIONAL** | Zeros / closes remaining commitment | — | High |

**Owner-usable payables: yes. Owner-usable subcontractor OS: no.**

---

### B8. Workforce / Time / Attendance / Scheduling

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Employee profile | **FUNCTIONAL** | Name, job title, email, phone, notes, active, archive | — | Medium |
| Employment HR file | **DOES NOT EXIST** | `rateUnit` labeled “employment style” | Hire date, dept, ID | — |
| User link / employee number | **FOUNDATION ONLY** | Columns + actions accept them | **No form fields** in employee UI | Blocks Attendance.self |
| Compensation / rate versions | **FUNCTIONAL** | Dated versions, overlap trigger, burden % | Hidden behind Advanced + `workforce.cost.read` | High |
| Employer month costs | **FUNCTIONAL** | Allocation runs; not payroll | — | Medium–high |
| Project assignments | **FUNCTIONAL** | Temporal; assignment ≠ Actual | Planned % is a hint, not a cost weight | High |
| Employee privacy | **FUNCTIONAL** | Rates redacted without `workforce.cost.read` | Employee-owned documents not cost-gated | High for rates |
| Time entry | **FUNCTIONAL** | Project + non-project codes; snapshot rate | Worker cannot load list/quick-log (`workforce.read` required) | High for managers |
| Submit → timesheet → approve / return | **FUNCTIONAL** | Weekly Sunday sheet; manager queue; bulk approve; return needs note | **No self-approval block**; no worker timesheet page | High for owner/manager |
| Recorded labor Actual | **COMPLETE / MATURE** | Only `recorded` **and** `approved`; DB lock on approved | Grandfathered historical rows approved in 0047 | High |
| Correction / void | **FUNCTIONAL** | Void+replace; closed month → month-close adjustment | Replacement of approved **auto-approves** | High with a shortcut |
| Bulk / retro | **FUNCTIONAL** / **PARTIAL** | Date range bulk; any open-month date | No “retro” type | Medium |
| Overtime pay | **DOES NOT EXIST** | Board `over_capacity` is calendar only | Multiplier / premium | — |
| Worker self time | **PARTIAL** | Worker has `time.manage` | List, codes, and quick-log assert `workforce.read` → **AuthorizationError** | Broken field loop |
| Attendance clock | **FUNCTIONAL** | In/out, org TZ, large buttons | Needs linked `employees.user_id` | High if linked |
| Breaks | **PARTIAL** | Domain events exist | **Clock UI has no break buttons** | Medium |
| Attendance vs time | **COMPLETE / MATURE** | Different tables, permissions, costing | Completing a day does not submit a timesheet | Intentional and correct |
| Resource scheduling board | **FUNCTIONAL** | Day/week; bookings; leave; overlap confirm; 8h capacity | WO are read-only projections; no per-employee calendars | Medium |
| Planning / Gantt | **FUNCTIONAL** | Work items, FS dependencies, overdue; jobs opt out | CPM `supported: false` | Lightweight — correct for this product |
| Dispatch vs scheduling vs Gantt | **Useful specialization** | Three products | Hebrew both scheduling words collide | Confusing, not duplicate engines |

**Manager/Owner can run hours. A field Worker cannot complete the advertised time loop.**

---

### B9. Field operations / Safety / Forms

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Daily logs | **FUNCTIONAL** | Draft → submitted → finalized; one per project-day; photos; lock | Weather/crew/materials/equipment/visitors/incidents are **text**, not registers | Usable site diary |
| Daily log corrections | **PARTIAL** | Append-only notes on finalized | **Detail page never shows `correctionNotes`** | Backend yes, display weak |
| Daily log ↔ safety | **DOES NOT EXIST** | Separate modules | Incidents text does not create safety records | Manual |
| Punch list | **FUNCTIONAL** | Priority, complete, cancel, photos, concurrency | **No assignment**; location/due not editable after create | Tracker, not an ops board |
| Punch assignment | **DOES NOT EXIST** | — | Who owns the item | Highest field-ops hole |
| Inspections | **PARTIAL** | Kind enum, schedule date, pass/fail, notes, photos | No templates, checklists, inspector, recurrence | Thin record |
| Safety / HSE | **FUNCTIONAL** | Incidents, near miss, accident, hazard, observation, toolbox, PPE; attendees; acknowledgements; corrective actions; overdue; project filter; documents | No PDF/regulator pack; hazard is a type not a register; no worker self-sign; no offline safety drafts | Real notebook with workflow — not a compliance suite |
| Forms | **FUNCTIONAL** | Templates + submissions; WO checklist can **block complete** | Daily logs do not host forms despite `field_log` owner | WO gate is real |
| Field photos on create | **FUNCTIONAL** | Staging + attach on save | — | Good |

---

### B10. Inventory / Materials / Assets

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Inventory items / SKU / barcode | **FUNCTIONAL** | Reorder / min stock | Not in global search | High qty product |
| Locations | **FUNCTIONAL** | Warehouse / site / vehicle; default Main | Cannot archive if stock remains | High |
| Movements | **FUNCTIONAL** | receive / issue / return / adjust / transfer; immutable | **Not client-idempotent** | High |
| Reservations consume / release | **FUNCTIONAL** | Available = on hand − reserved; CAS release | Movements do not store WO id (copied to project) | High |
| Counts + finalize | **FUNCTIONAL** | Draft → adjust movements; concurrent finalize claimed | Cannot void a finalized count | High |
| FIFO / WAVG / GL / warehouse accounting | **DOES NOT EXIST (intentional)** | Explicitly refused | Do not recommend | Correct for this product |
| Inventory → Expense | **DOES NOT EXIST (intentional)** | Issue is qty only | — | Correct |
| Inventory import | **DOES NOT EXIST** | Not in `IMPORT_KINDS` | — | Onboarding gap |
| Materials catalog | **FUNCTIONAL** | Units, default price, vendor prices | Usage ≠ Actual; usage does not auto-issue stock | Medium–high |
| Assets / fleet | **FUNCTIONAL** | Equipment / vehicle / tool; assignment; usage hours/mileage | Search href wrongly goes to inventory | High operational |
| Maintenance | **FUNCTIONAL** | Planned → completed; vendor + costAmount **metadata** | Not an expense; no meter PM engine | Not a CMMS |
| Asset compliance subject | **DOES NOT EXIST** | Compliance subjects: org / employee / vendor / project | Fleet licenses as artifacts | — |

---

### B11. Documents / OCR

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Private storage | **FUNCTIONAL** | Signed upload/download; org-prefixed keys | Gated on storage config | High |
| Folders + metadata | **FUNCTIONAL** | Nested folders; category, tags, expiry, required | — | High |
| Multi-owner links | **FUNCTIONAL** | Many owner types including field-ops and safety | — | High |
| Versions + current | **FUNCTIONAL** | Immutable historical versions; transactional prepare→PUT→finalize | HEAD commit flushed version guards in the same upload transaction | High |
| Delete / cleanup | **FUNCTIONAL** | Soft delete + storage cleanup retry | Documents lack a separate archive state | High |
| Permissions | **PARTIAL** | Org `documents.read/manage`; RLS owner helper for project owners | **No project-scoped document ACL in the documents module**; org library visible to any member with read | Medium |
| Search | **PARTIAL** | Filename ILIKE; documents in global search | No tags/category/OCR-text | Weak as DMS search |
| Preview | **PARTIAL** | Image + PDF | HEIC/Office weak | Medium |
| **DMS vs attachments** | **Genuine DMS foundation** | Not mere attachment storage | Next level: project ACL + real search | — |
| OCR pipeline | **FUNCTIONAL** (architecture) | Upload enqueue; claim/lease; Azure; review; draft expense / vendor bill / vendor credit | Off by default; worker route exists; **no `vercel.json` cron** | Production-shaped |
| OCR retries / idempotency / stale lease | **FUNCTIONAL** | Max retries, unique keys, 600s lease reclaim | Long Azure calls not continuously heartbeaten | High |
| Duplicate prevention | **PARTIAL** | Warnings | Does not hard-block confirm | Medium |
| Provider abstraction | **FUNCTIONAL** | `OcrProvider`; Azure live; Google/AWS unimplemented stubs | Do not add providers before Azure is proven in ops | Correct |
| OCR settings UI | **DOES NOT EXIST** | Env: `OCR_INGESTION_ENABLED`, `OCR_PROVIDER`, key, endpoint | — | Ops-only |
| OCR production-turnkey | **PARTIAL** | Code path yes | Flag + secrets + scheduled worker required | Not proven live by repo alone |

---

### B12. Notifications / Today / Approvals / Month close

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| In-app notifications | **FUNCTIONAL** | Dedupe, unread, resolve stale, bell, `/notifications` | `dismissedAt` schema-only (no dismiss action) | High engine |
| Recipient model | **PARTIAL** | WO assigned has a named recipient | Almost all scanners emit to **the user who opened the bell** | Not a routing matrix |
| Email / push | **FOUNDATION ONLY** | Channel adapters no-op | Not required now | Intentional |
| Coverage | **FUNCTIONAL** with gaps | AR overdue, AP due, threshold approvals, timesheets, expiring docs, overdue tasks, BOQ awaiting, WO assigned, low stock, safety actions | Asset assignment, maintenance overdue (Today only), attendance, month close (Today only), generic assignments | 11 scanned types |
| Today / command center | **FUNCTIONAL** | Inbox: AR, AP, attendance open, unallocated, over-budget, approvals, planning, compliance, maintenance, stale project, month-close, BOQ | Financial items cannot be dismissed | High |
| Notifications vs Today | **Useful specialization** | Bell = conditions; Today = actionable work | Two inboxes; `/inbox` aliases Today | Overlap in the user’s head |
| Threshold approvals engine | **FUNCTIONAL** | expense, vendor_bill, PO, vendor_credit, quote_discount, budget_revision, time_correction | No steps, no named approver, no escalation | Lightweight gates |
| Timesheet approval | **FUNCTIONAL** | Separate domain | **Not in `/approvals`** | Coherent split, confusing inbox |
| BOQ progress approval | **FUNCTIONAL** | Separate domain | **Not in `/approvals`** | Same |
| Attendance approval | **DOES NOT EXIST** | Completeness check on month close | — | Intentional |
| Month close Open / Ready / Closed | **FUNCTIONAL** | Completeness 9 checks; 100% required | Language is still finance-ops | High |
| Period lock | **COMPLETE / MATURE** | App + DB freeze (0037); closed never reopens | — | High |
| Correction after close | **FUNCTIONAL** | `month_close_adjustments`; supersede | Source records stay frozen | High |
| Simple enough for non-accountants? | **PARTIAL** | Copy says “use a correction, don’t rewrite” | Checklist talks employer cost, allocations, AP anomalies | Usable with a bookkeeper; not a consumer “close the month” button |

---

### B13. Planning / Reporting / Search / Import / Export / Settings / API / Banking

| Capability | Status | What exists | Partial / missing | Quality |
|---|---|---|---|---|
| Home dashboard | **FUNCTIONAL** | Org commercial / cost / forecast / attention | Same compose formulas | High |
| Reports | **FUNCTIONAL** | Sections: commercial, cash, cost, profitability, operations, comparison; work-kind filter; deep links | Not a BI catalog; not customizable | Medium–high |
| Project financials page | **FUNCTIONAL** | Explainability, coverage, per-contract CCV | Per-contract cost missing | High |
| Cash-flow outlook | **FUNCTIONAL** | Incoming / collected / outgoing coverage | Not a treasury product | Medium |
| AR aging / AP aging | **FUNCTIONAL** | Real derived outstanding | AP aging filters weak | Medium–high |
| Labor / attendance reports | **PARTIAL** | Time export; attendance in Today | No dedicated labor utilization report | — |
| Inventory / safety reports | **PARTIAL** | In-app counts | No export packs | — |
| Global search | **FUNCTIONAL** | Ctrl/Cmd+K; permission-gated; custom-field text | No inventory/materials; **excludes profit/cost** | Good |
| Command palette | **DOES NOT EXIST** | Quick Create is separate | No command actions in search | — |
| Import wizard | **FUNCTIONAL** | clients, contacts, vendors, employees, projects, opening_values, cost_categories, expenses (draft), boq_items | **No inventory**; project import refuses contract amounts (use opening_values) | High for listed kinds |
| Export | **FUNCTIONAL** | XLSX/CSV for core lists + financials + audit + BOQ | No inventory/assets; **no org backup** | High operational |
| Settings (usable) | **FUNCTIONAL** | Business, people, tax, numbering, app/PWA, approvals, features/work mix, cost categories, templates, catalog, roles (few toggles), custom fields, forms, activity, offline drafts, banking, API | — | Good coverage |
| Settings without UI | **FOUNDATION ONLY** | Legal identity / tax ID (used by OCR); OCR provider env; notification prefs; statutory invoicing | Portal 404 | Holes |
| Roles UI | **PARTIAL** | 3 toggles per non-owner role | Cannot toggle `projects.access_all` or `workforce.manage` | Not a role builder |
| API / webhooks | **FOUNDATION ONLY** | Keys, 3 HTTP routes (health, whoami, projects.read), signed payload builder | **No HTTP delivery worker**; no write APIs | Do not call this a public platform |
| Banking | **FUNCTIONAL** (import) | CSV/XLSX; suggestions; human Approve/Change/Ignore | Live feed stub; **does not create payments or Actual** | Honest non-accounting |
| Custom fields | **FUNCTIONAL** | 6 entities; reserved keys block money collisions | Not on assets/inventory/bills | Governed |
| Compliance artifacts | **FUNCTIONAL** | Insurance/license/cert; org/employee/vendor/project | Not assets | Good register |
| Statutory Israeli invoicing | **FOUNDATION ONLY / disabled** | Unconfigured provider; feature off | Do not enable | Correct |
| Tax rules | **FUNCTIONAL** | % / exempt / zero-rated; country pack | Not legal invoice numbering | High |
| Numbering | **FUNCTIONAL** | Org sequences for commercial docs | Not projects | High |
| Onboarding | **PARTIAL** | Name + country; currency/TZ inferred | Rest is discover-through-use | Fine for solo; thin for a hired bookkeeper |

---

### B14. Portal (intentionally disabled)

| Capability | Status | Classification |
|---|---|---|
| Public customer / vendor login | **FOUNDATION ONLY** | **Portal intentionally disabled** — not a defect |
| `/portal`, `/portal/customer`, `/portal/vendor` | 404 | `notFound()` |
| Settings → Portal | Hidden + 404 | Even `portal.manage` cannot open it |
| Grants / safe projections / vendor candidates | Foundation remains in `src/modules/portal` | Do not enable as a priority |

---

### Capability totals (this map)

Counted from the capability-map tables above (each feature row is one capability). Overlap classifications and score tables are not included.

| Status | Count |
|---|---|
| **COMPLETE / MATURE** | 9 |
| **FUNCTIONAL** | 121 |
| **PARTIAL** | 45 |
| **FOUNDATION ONLY** | 10 |
| **DOES NOT EXIST** | 19 |
| **Total mapped** | **204** |

Portal-off is classified as foundation, not as a missing-feature defect.

---

## C. User Journey Map

### C1. Lead → Quote → Client → Project → Contract → Work → Cost → Billing → Payment → Profit

**This is not one journey.** Two sales machines plus a third in-project quote object.

**Path that works for a contractor (tell them this):**

1. **Clients** → new client (+ contact).  
2. **Quotes** → lines → Mark sent (status, not email) → Accept → Convert to project or job.  
3. Opening **contract** is created from quote net.  
4. Do the work (team, time, expenses, PO/AP, field logs).  
5. **Billing** → finalize invoice.  
6. **Payment** (separate). Outstanding = invoiced − paid − held retention.  
7. **Profit** on project financials = current contract − Actual (net).

**Path that looks like “Sales” and mostly fails the owner:**

1. Lead (cannot attach prospect).  
2. Prospect (optional, separate).  
3. Opportunity (stuck in Qualify — board does not move).  
4. CRM one-line “quote” (never appears on `/quotes`).  
5. Convert won → new client + project + contract. Prospect contacts **not** copied.

**Breaks / manual jumps**

- No Lead → product Quote wizard.  
- Billing/site contact roles do not drive billing.  
- Jobs hide BOQ/changes — convert to project to get the commercial surface.  
- Work-order billing uses AR but does not tag `contract_id`.  
- Pending changes do not move current contract (correct) — owner must approve.  
- Profit hidden from Manager unless owner toggles `project_profit.read`.

### C2. Vendor → RFQ → Quote → PO → Receiving → AP Bill → Payment

**Works as separate steps.** Owner can buy materials.

**Breaks**

- Comparison is header totals only.  
- Issued PO cannot be revised.  
- Receiving does not move inventory (must receive stock separately if they use inventory).  
- Matching is amount, not 3-way qty.  
- Vendor card has no bills/aging — jump to Procurement → Vendor bills.  
- Payment does not create Actual (correct) — owner may think “I paid so cost appeared.”

### C3. Employee → Assignment → Time → Approval → Cost

**Works for Owner/Manager** if they log time themselves or for the team.

**Breaks for Worker**

1. No UI to link login → employee (`userId` unused in forms).  
2. Quick Create → Time → `loadQuickLogFormData` → `listEmployeesForOrg` requires `workforce.read` → worker **cannot open the form**.  
3. Time list also requires `workforce.read`. Worker nav shows Attendance, not Time.  
4. Attendance clock, even if linked, **never creates** project time or Actual.

**Correct behavior that still surprises people:** clocking 9 hours and never logging time leaves **Actual = 0**.

### C4. Work Order → Dispatch → Work → Billing

**Works.** Create WO → dispatch board → status → “חייב את העבודה” → AR draft/finalized. Duplicate live bill blocked. Void then recreate to correct.

**Breaks**

- Recurring generation is open-price; template price is a note.  
- Dispatch does not write the resource-scheduling board.  
- Checklist form can block complete (good) — easy to miss if no template is set.  
- No dedicated WO invoice object — shared AR (intentional, still a wording gap).

### C5. Document → OCR → Review → Financial Draft

**Works when ops is on:** upload → job queued → worker claims → Azure → needs_review → human confirm → **draft** expense / vendor bill / vendor credit. Never Actual.

**Breaks**

- `OCR_INGESTION_ENABLED` default off.  
- No Settings UI.  
- No cron in repo — jobs sit queued.  
- OCR review not in main nav.  
- Duplicates warn, do not block.

### C6. Subcontract → Progress → Bill → Retention

**Broken as a chain.**

1. Create vendor (type cosmetic).  
2. Create engagement (not cost).  
3. Create subcontract agreement (header + % + value events).  
4. **Separately** create BOQ subcontractor schedule from the **engagement**.  
5. Value progress → draft AP.  
6. Enter retention **again** on the bill.  
7. Mentally match AP cash to the agreement (query is vendor+project).

Approvals on subcontract changes: **missing**. Scopes: **missing**.

### C7. Inventory → Reservation → Consumption → Project

**Works as quantity.** Reserve to project/WO → issue consumes reservation → qty on hand falls. **Does not create Expense.** Material usage log also does not auto-issue or create Actual.

**Breaks in the owner’s head:** “we used materials on site” can mean catalog usage, inventory issue, or an expense/AP bill — three different truths.

---

## D. Financial Truth Review

**The system remains coherent.** There is **one project compose engine** (`composeProjectFinancials`), reused by project financials, org rollup, billing position, budgets (read-only Actual), BOQ comparison, and explainability.

### Invariants verified in application code (not slogans)

| Invariant | Status |
|---|---|
| Billing ≠ Payment | **Held.** Separate records; outstanding derived; split applications cannot over-apply. |
| Commitment ≠ Expense | **Held.** PO issue → committed cost; receiving ≠ Actual; bill post → Actual. |
| VAT ≠ Profit | **Held.** CCV and Actual are net; invoiced/payable KPIs use gross. |
| Approved changes affect Current Contract | **Held.** |
| Pending changes do not | **Held.** |
| Payments do not create Actual | **Held** (AR cash and AP cash). |
| Inventory movement does not create Expense | **Held.** |
| Attendance does not create project Actual | **Held.** |
| Assignments do not create Actual | **Held.** |
| Progress ≠ Actual | **Held.** |
| History not silently rewritten | **Held** for commercial/AP/time/month-close; corrections use void / reversal / adjustment / supersede. |

### Where duplicated financial logic exists

| Area | Nature |
|---|---|
| Org dashboard aggregators | Same formulas, different grain — **not** a second P&L |
| Budget variance | Reads engine cost — **not** a second Actual |
| Subcontract “billed/paid” display | Reads **all** AP for vendor+project — can **look like** a second ledger and **double-count in the user’s head** across two agreements |
| Multi-contract CCV vs project Actual | Revenue can be tagged per contract; cost cannot — **one project truth, not two calculators** |
| Banking match | Explicitly `mutatesFinancials: false` |
| Ops-finance | Maps ops snapshots into **draft expenses** only |
| CRM estimates vs product quotes vs commercial quotes | Three commercial objects; only product quotes and commercial COs enter the financial engine as intended |

**Do not rebuild the financial engine.** Tighten the **user-facing** holes (subcontract display, multi-contract P&L expectations, Expense vs Bill wording).

---

## E. Permissions / Security Map

### Who can see what / change what (default templates)

| Role | Sees | Changes | Money |
|---|---|---|---|
| **Owner** | Everything | Everything | Profit, rates, settings |
| **Manager** | Almost everything except profit, settings, tax, audit, API, members-manage | Runs projects, field, procurement, AP, time approve | **Sees employer rates** (`workforce.cost.read`); **not** profit unless toggled |
| **Finance** | Financial + commercial read | Billing, tax, month close, employer cost | Profit **yes**; no project create; no field manage |
| **Worker** | Assigned work surfaces | Expenses create, time (broken in UI), docs, field, forms, BOQ progress submit | **No** roster, **no** rates, **no** totals |

Settings → Roles can only toggle:

- Manager: profit read, billing manage, invitations manage  
- Finance: profit read, contracts manage  
- Worker: time manage, documents manage, vendors read  
- Owner: immutable  

**`projects.access_all` and `workforce.manage` are not toggleable.** Manager/Finance therefore **bypass** selected/assigned project mode. Creating employees is **Owner-only** on the default templates.

### What can be restricted per project

Modes on Settings → People: `all` (default) / `selected` / `assigned`.

RLS `app.can_access_project` **is real** and is ANDed onto project child tables (contracts, billing, expenses, time, changes, logs, POs, AP, budgets, planning, safety, …) and through parent for lines. Fail-closed. Documents with a project owner go through the same helper.

**Product catch:** anyone with `projects.access_all` still sees everything. That is Manager and Finance by default. Grants have `read|manage` in schema; the SQL helper **ignores access_level**.

### What employee information is private

- Rates, month costs, allocation runs: `workforce.cost.*` + dedicated RLS.  
- Roster name/phone/email/job title: `workforce.read`.  
- **Gap:** a document linked as owner `employee` is not cost-gated. A compensation PDF in the library can leak to anyone with `documents.read`.

### Tenancy

- Every browser request sets `authenticated` and JWT sub so **RLS runs**.  
- Service role is for jobs/migrations/storage, not the browser path.  
- Same-org composite FKs are widespread.  
- SECURITY DEFINER helpers are fail-closed.

This is **not permission theater at the database**. The theater is in the **Roles / People UI**, which cannot express the restrictions the database already supports.

### Confusing overlaps

1. Manager “restricted to assigned projects” while still holding `projects.access_all`.  
2. Three approve verbs: commercial `approvals`, generic `approval_requests`, `time.approve` / `boq.progress.approve`.  
3. Worker default `documents.manage` is wide.  
4. `role_assignments.project_id` is used in SQL assigned-mode and **ignored** by the app permission loader.

---

## F. UX / Mobile Assessment

### Navigation

Adaptive nav is real: Home, Projects, Expenses, Settings always; everything else gated by permission **and** module. Mobile bar **caps at 4** + More.

**Discoverability problems**

- A fully enabled org dumps 30+ destinations into More.  
- **Imports** has no nav item. **OCR review** has no nav item. **Time list** is subnav only. **Vendor bills** sit in Advanced.  
- `/sales` exists and is unused by nav.  
- Workforce is split: Employees + Attendance + Timesheets in More, plus an inner tab strip.  
- Recurring drafts vs expense recurrence field: two stories.

### Terminology a contractor will get wrong

| Label | Reality |
|---|---|
| Projects / Jobs / Service calls | Same financial row |
| Sales vs Quotes | Two products |
| Quote | Three tables |
| Vendor bills vs Expenses vs Procurement | Three outbound-money doors |
| שיבוץ (dispatch) vs שיבוץ משאבים | Two boards |
| Today vs Notifications | Two inboxes |
| Sent (quotes/changes) | Status or timestamp, **not email** |

### Could a contractor understand major modules without docs?

| Module | Without docs? |
|---|---|
| Clients, expenses, a single work mix | **Yes** |
| Product quotes → convert | **Yes** |
| Jobs vs Projects vs Service | **No** |
| Expense vs Vendor bill | **No** |
| Sales CRM | **No** |
| BOQ / month close / approvals rules | Specialist |
| Subcontracts | **No** — looks complete, is not |

Empty states, ResponsiveTable cards, Quick Create, breadcrumbs (many but not all lists), Hebrew RTL (`dir` from locale), and permission-aware FAB are **real and good**.

**No saved views.** Filters are query-string only.

### Mobile / PWA / offline

| Item | Assessment |
|---|---|
| Responsive UI | **FUNCTIONAL** |
| PWA install | **FUNCTIONAL** (manifest, BIP, iOS manual, Settings → App) |
| Splash | **PARTIAL** (theme colors, not a branded splash set) |
| Mobile nav | **FUNCTIONAL** with overflow hiding field tools |
| Field workflows | Usable online (logs, punch, forms, attendance, camera) |
| Offline | **limited drafts / partial** — IndexedDB drafts for expense, time, change, daily log, punch, inspection, form, capture photos. **Not** safety. **Not** OCR extract. Financial pages need a live connection. SW caches shell + `/offline.html` only. |
| OCR from mobile | Camera on **online** review panel |

**Offline classification: partial** (field draft queue + installable shell), not strong.

---

## G. Technical Health

Only debt that will slow the product:

1. **Two (really three) quote stacks** — `estimates`, `crm_sales_quotes`, commercial `quotes`. Highest product-coherence debt.  
2. **Dead production paths:** `recordActivityEvent` writers, `createSalesQuoteVersion` UI, `updateQuoteAction` UI, `updateContractAction` UI, `replaceChangeRequestLines`, `subcontract_agreement_id` writes, employee `userId` form.  
3. **Permission logic triplicated by design** (app assert + SQL permission + `can_access_project`). 0051 parity matrix exists; Roles UI has drifted from what SQL can enforce.  
4. **Notification scan-on-bell** with no cron — fine for in-app; will not scale to email later without a worker.  
5. **OCR worker must be scheduled externally** — serverless-safe SQL lease, but ops is outside the app.  
6. **Oversized files** worth knowing, not rewriting: `0051_review_integrity_closure.sql`, compose financials, OCR review panel.  
7. **Migration SQL headers still say UNAPPLIED** on 0046–0051 even though this audit’s baseline is “applied / released.” Comments can mislead the next agent. Do not rewrite historical SQL; fix comments only if the owner asks.  
8. **Portal and invoicing-integration modules** remain in tree while hard-off — acceptable as dormant foundation.  
9. **No scattered FEATURE_FLAG soup** — visibility is module prefs + hard portal off + OCR env. This is healthy.  
10. **Do not rewrite modules.** Incremental wiring (dead UI, subcontract FK, worker time authz) is cheaper than new engines.

Duplicate status machines (project vs service status) are **appropriate**, not debt.

---

## H. Missing / Improvement Backlog

Every item includes problem, user value, foundation, complexity, priority.

### CRITICAL PRODUCT GAP

1. **Worker time loop is broken**  
   **Problem:** Worker has `time.manage` but cannot load time UI (`workforce.read`). Employee↔user link has no form, so Attendance.self often cannot start.  
   **User value:** Field people can report hours; labor Actual becomes true.  
   **Foundation:** Timesheets, locks, Actual filter already exist.  
   **Complexity:** LOW–MEDIUM  
   **Priority:** CRITICAL  

2. **Sales vs Quotes is two products with the same words**  
   **Problem:** Contractors will enter Sales and never produce a `/quotes` project, or vice versa. Kanban does not move.  
   **User value:** One obvious path from bid to job.  
   **Foundation:** Product quotes convert already works; CRM convert works in isolation.  
   **Complexity:** MEDIUM (product decision) + LOW–MEDIUM UI  
   **Priority:** CRITICAL for coherence  

3. **Subcontract agreement ↛ BOQ ↛ AP**  
   **Problem:** Three records; retention % unused; cash shared across agreements.  
   **User value:** Pay a sub against progress without a spreadsheet.  
   **Foundation:** Agreements, BOQ schedules, draft AP, retention on bills.  
   **Complexity:** MEDIUM  
   **Priority:** CRITICAL for contractors who use subs  

### HIGH-VALUE NEXT

4. **Punch assignment + editable due/location**  
   **Problem:** Punch list has no owner.  
   **User value:** Site closeout actually gets done.  
   **Foundation:** Punch status machine, notifications, workforce roster.  
   **Complexity:** LOW–MEDIUM  
   **Priority:** HIGH  

5. **Vendor card = AP 360**  
   **Problem:** Bills/credits/aging exist but not on the vendor.  
   **User value:** “What do I owe this supplier?”  
   **Foundation:** `getVendorApOutstanding`, aging domain, AP pages.  
   **Complexity:** LOW  
   **Priority:** HIGH  

6. **Make project access real for Manager**  
   **Problem:** People can set selected/assigned while PMs still see all.  
   **User value:** Restrict a PM to their jobs.  
   **Foundation:** RLS already enforces if `projects.access_all` is absent.  
   **Complexity:** LOW (toggle + copy)  
   **Priority:** HIGH  

7. **Multi-contract edit + change targeting**  
   **Problem:** Second contract cannot be edited; changes always start on primary.  
   **User value:** Two agreements on one site become usable.  
   **Foundation:** `updateContractAction`, contract_id on CR/BOQ/AR.  
   **Complexity:** LOW–MEDIUM  
   **Priority:** HIGH  

8. **Nav / terminology / hide unused doors**  
   **Problem:** Expense vs bill, three work kinds, Sales vs Quotes, missing Imports/OCR/Time.  
   **User value:** Owner finds the next button.  
   **Foundation:** Adaptive nav + work mix already exist.  
   **Complexity:** LOW–MEDIUM  
   **Priority:** HIGH  

9. **CRM stage movement — or hide the fake board**  
   **Problem:** Board implies a pipeline it does not run.  
   **User value:** Either a real pipeline or less lying UI.  
   **Foundation:** `updateOpportunity` already accepts `stage`; form does not send it.  
   **Complexity:** LOW  
   **Priority:** HIGH  

10. **OCR as an operated feature**  
    **Problem:** Queue without a scheduled worker and Settings UI.  
    **User value:** Photo → draft bill actually finishes.  
    **Foundation:** Worker route, Azure adapter, review UI.  
    **Complexity:** MEDIUM (ops + small Settings)  
    **Priority:** HIGH if Azure is in use; else defer  

11. **Recurring drafts without a monthly click**  
    **Problem:** Generate now only.  
    **User value:** Rent/retainer drafts appear.  
    **Foundation:** Templates already force draft-only.  
    **Complexity:** MEDIUM (worker + month-close interaction)  
    **Priority:** HIGH for overhead-heavy businesses  

12. **Document project restrictions + search**  
    **Problem:** Org-wide document read; filename-only search.  
    **User value:** Subcontractor should not see every file.  
    **Foundation:** Versioning, links, `can_access_document_owner`.  
    **Complexity:** MEDIUM  
    **Priority:** HIGH as soon as non-owners use Documents  

### USEFUL ENHANCEMENT

13. Daily log correction history on the detail page; optional link to safety records. **LOW.**  
14. Quote edit-after-create + PDF (print exists). **LOW–MEDIUM.**  
15. Manager `workforce.manage` toggle so a PM can add people. **LOW.**  
16. Attendance break buttons on the clock. **LOW.**  
17. Saved list views / filters. **MEDIUM.**  
18. Project/job/WO numbering sequences. **LOW.**  
19. Named notification recipients (approver, assignee) instead of scanner-user. **MEDIUM.**  
20. Inspection checklist templates (forms already exist). **MEDIUM.**  
21. Dispatch ↔ resource booking write-through (lightweight). **MEDIUM.**  
22. Supplier quote line comparison. **MEDIUM.**  
23. Show change-request lines or delete the dead UI expectation. **LOW.**  
24. Legal identity / tax ID on Settings → Business (OCR already wants it). **LOW.**  
25. Inventory in import + global search. **LOW–MEDIUM.**  
26. Onboarding work-mix wizard that hides Sales/BOQ until chosen. **MEDIUM.**

### OPTIONAL / LATER

- Email/push notifications (channel stubs exist).  
- Quote email send.  
- E-signature (forms acknowledgement is not legal sign).  
- Google/Microsoft calendar.  
- Custom dashboards / KPI builder.  
- Reusable full project templates (structure clone exists).  
- Workflow automation engine.  
- Data import “wizard 2.0” beyond current kinds.  
- Advanced resource capacity (per-person calendars).  
- Client communication history / email ingest.  
- Document templates.  
- Automated scheduled PDF reports.

### NOT RECOMMENDED (now)

- External customer/vendor portal  
- Full GL / bank posting / depreciation  
- Israeli statutory tax invoicing  
- FIFO / WAVG inventory accounting  
- Full payroll from attendance  
- Microsoft Project / CPM  
- Large public API / webhook fan-out  
- Second OCR provider before Azure is proven in production  
- Merging Expense and AP into one object (they are correctly separate)  
- Merging Attendance and Time (they are correctly separate)

---

## I. Top 20 Recommended Next Improvements

Ranked by user value, product coherence, usefulness, existing foundation, effort, and risk — **not** by ease alone.

| Rank | Improvement | Why this rank |
|---|---|---|
| **1** | Fix worker self-service time + employee↔user link | Field Actual is the most expensive lie in the product today |
| **2** | One obvious sales path (Quotes as default; CRM as optional advanced, or stage UI + hide duplicate quote object) | Owners will otherwise create the wrong quote forever |
| **3** | Wire subcontract agreement → BOQ schedule → AP + retention | Highest unused foundation relative to contractor value |
| **4** | Punch assignment (person + due date edit) | Field closeout is why punch exists |
| **5** | Vendor financial panel (outstanding, bills, credits, aging) | AP is strong but undiscoverable |
| **6** | Roles: allow toggling `projects.access_all` and `workforce.manage` | Security UI currently contradicts RLS |
| **7** | Navigation/terminology pass (Expense vs Bill, work kinds, Sales vs Quotes, add Imports / Time / OCR) | Features exist and are unused |
| **8** | CRM board: move stages or stop calling it a pipeline | Trust; LOW effort |
| **9** | Multi-contract: edit form + change-request contract picker | Makes 0046 true as a product |
| **10** | OCR Settings + scheduled worker runbook | Turns a real pipeline into a used one |
| **11** | Recurring draft generation on a schedule (still draft-only) | Overhead businesses live on this |
| **12** | Document visibility per project + better search | Next useful DMS level |
| **13** | Quote: edit draft in UI + clearer “print is not send” | Completes the path that already converts |
| **14** | Daily log: show corrections; optional safety link | Cheap honesty |
| **15** | Attendance breaks on the clock | Completes the clock that already exists |
| **16** | Named notification recipients for approvals / assignments | Makes the bell useful for a team |
| **17** | Project numbering | How contractors talk |
| **18** | Saved views on core lists | Cuts clicks without a BI project |
| **19** | Inspection/forms templates on inspections | Reuse forms; don’t build a new engine |
| **20** | Lightweight dispatch↔scheduling connection | One calendar feeling without MS Project |

---

## J. Top 5 Recommended Next Development Waves

### Wave 1 — Field worker loop  
**Goal:** The person on site can report time, clock presence, and own punch items.  
**Features:** employee↔user link UI; worker time list/self scope without granting full roster; punch assignment; clock breaks; keep Attendance ≠ Time.  
**Why together:** One user (Worker) and one set of permissions.  
**Expected improvement:** Labor Actual and site closeout become true.  
**Complexity:** LOW–MEDIUM  

### Wave 2 — Commercial coherence  
**Goal:** Bid, buy, and pay subs without parallel notebooks.  
**Features:** Sales vs Quotes IA; vendor AP 360; subcontract chain; multi-contract edit + CR targeting; quote draft edit.  
**Why together:** Same owner job — money in/out on a job.  
**Expected improvement:** The core chain in the product brief becomes teachable.  
**Complexity:** MEDIUM  

### Wave 3 — Owner simplicity  
**Goal:** A contractor understands the next click.  
**Features:** nav/terminology; work-mix hiding; onboarding; Roles toggles for access_all / workforce.manage; CRM stage or hide board; project numbering; saved views.  
**Why together:** IA and permissions, not new engines.  
**Expected improvement:** Ease-of-use score; fewer support conversations.  
**Complexity:** LOW–MEDIUM  

### Wave 4 — Documents + OCR in production  
**Goal:** Files and paper invoices become daily tools.  
**Features:** project document ACL; metadata search; OCR settings; cron/worker; legal identity on Business settings.  
**Why together:** Same files pipeline.  
**Expected improvement:** Less typing of bills/expenses.  
**Complexity:** MEDIUM  

### Wave 5 — Lightweight operations calendar  
**Goal:** “Who is where this week” without Microsoft Project.  
**Features:** named notification recipients; dispatch writing optional bookings; inspection form templates; recurring draft worker if not done in wave 2; daily-log → safety optional link.  
**Why together:** Operations rhythm, still lightweight.  
**Expected improvement:** Service and crew businesses feel the product as a day board.  
**Complexity:** MEDIUM  

Do **not** implement these waves in this audit.

---

## K. What NOT to Build Yet

| Distraction | Why not now |
|---|---|
| External customer/vendor portal | Owner decision OFF; foundation exists; enabling is a security program, not a feature |
| Full accounting / GL | Product invariant; AP/AR/expenses are enough |
| Bank reconciliation as books | Import+intent exists; posting would become a GL |
| Israeli statutory invoicing | Adapter disabled on purpose |
| FIFO / WAVG / warehouse GL | Qty engine is the right product |
| Depreciation | Assets are operational |
| Full payroll | Employer cost ≠ payslip; attendance ≠ time |
| Microsoft Project / CPM | Planning explicitly `supported: false`; Gantt is enough |
| Large public API / webhook platform | Keys + 3 routes are foundation; no delivery worker |
| Multiple OCR providers | Azure is not ops-proven yet |
| Merging Project/Job/WO into one menu without work-mix | Specialization is useful; fix wording, don’t collapse the engine |
| Merging Expense and AP | Correctly separate; fix discoverability |
| Email/push as a first wave | In-app + Today already cover the job if routing is fixed |
| Custom dashboard builder | Reports sections exist; builders are a product of their own |

---

## L. Final Product Maturity Assessment

Scores are 0–10 for **this product’s intended customer**, not for SAP/Procore/QuickBooks completeness.

| Area | Score | Why |
|---|---|---|
| Core project management | **8** | Shared entity, lifecycle, team, jobs/WO skins, planning. Numbering and clone-as-duplicate missing. |
| Financial control | **8.5** | One compose engine, real invariants, month-close freeze, explainability. Multi-contract P&L and subcontract cash display are the holes. |
| Client / CRM | **5** | Clients are solid. CRM pipeline is a display. Three quote objects. |
| Vendor / AP | **8** | Bills, credits, payments, VAT, retention, matching — strong. Vendor card and 3-way match weak. |
| Workforce | **6.5** | Roster, rates, privacy, manager timesheets are real. Worker loop and HR file are not. |
| Field operations | **7** | Usable logs, punch, inspections, forms. Punch assignment and structured diary missing. |
| Service / work orders | **7.5** | Dispatch, recurrence, WO billing via AR. Open-price recurrence and calendar split remain. |
| Subcontractors | **4** | Headers and BOQ valuations exist; the operating chain does not. |
| Inventory / materials | **7** | Honest qty + catalog. No costing (correct). Import/search gaps. |
| Documents | **7** | Genuine DMS foundation. Project ACL and search are the next level. |
| OCR | **5** | Architecture 8 / operations 3. Gated off; worker unscheduled in repo. |
| Planning / scheduling | **6.5** | Three useful boards; no single calendar; CPM correctly absent. |
| Approvals | **7** | Threshold engine wired; timesheet/BOQ separate. Inbox fragmentation. |
| Permissions / security | **8** | Tenancy/RLS/fail-closed are real. Roles UI cannot express them. |
| Reporting | **7** | Home, reports, project financials, aging, Today. Not customizable; some data has no report (inventory, safety pack). |
| Mobile / PWA | **7** | Real installable app and field capture. Offline is drafts-only; field tools live under More. |
| Ease of use | **5.5** | Excellent bones (RTL, Quick Create, adaptive nav). Too many doors and colliding words for a normal owner. |
| **Overall product readiness** | **7** | Ready for daily use on the **Clients → Quotes → Project → Cost → Bill → Pay** path with an Owner/Manager. Not ready to turn every module on and hand the phone to a worker + a salesperson + a subcontractor coordinator without training. |

---

## Appendix — Inspection method

- Commit `b8f53f8` on `main` verified.  
- 44 `src/modules/*/index.ts` public modules.  
- ~167 `page.tsx` files under `src/app`.  
- Drizzle journal includes `0000`–`0051`.  
- Previous reports (`PROJECTFLOW-COMPLETE-CAPABILITY-MAP-V2.md`, `PROJECTFLOW-3-WAVE-OVERNIGHT-FINAL.md`) were **compared**, then **contradicted where code differed**.  
- Independent parallel inspection of CRM, commercial/BOQ, AP/procurement, workforce, field/OCR/docs, inventory/approvals/month-close, and RLS/UX.  
- Spot-checked: portal hard-off, compose engine, worker `workforce.read` on time list/quick-log, unused `updateContractAction` / `replaceChangeRequestLines` / `subcontract_agreement_id` / `recordActivityEvent` production writers, OCR worker without cron, Settings portal 404, `TOGGLEABLE_PERMISSIONS`, CRM board without stage controls.

**Tests:** large unit/integration/e2e estate (~380 spec files). Strongest on money invariants, migrations, documents, OCR pipeline, AP. Weakest on CRM UI, worker time authz, subcontract E2E, safety UX, punch assignment (because it does not exist).

---

*End of independent audit. No code, SQL, migrations, commits, pushes, or deploys were performed. Portal remains OFF.*
