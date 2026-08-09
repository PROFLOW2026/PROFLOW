# ProjectFlow — Current site map (owner view)

**Updated:** 2026-08-09  
**Audience:** Non-technical owner  
**Scope:** What exists in the product today (routes under `src/app/[locale]`). No roadmap promises.

### How to read this

- **Route** paths omit the language prefix (`/he-IL` or `/en`). Example: `/projects` is `/he-IL/projects` in Hebrew.
- **Desktop / mobile:** The same web app. Primary items (Dashboard, Projects, Expenses) sit in the mobile bottom bar; other modules are under **More**. Optional modules appear only when turned on (Settings → Features) and when the user has permission.
- **Status meanings**
  - **complete** — usable end-to-end for the stated purpose
  - **partial** — main flow works; some depth or polish still light
  - **hidden/internal** — exists but is not a primary owner journey (auth, redirects, fixtures)
  - **foundation only** — UI/API skeleton; not production-ready for that capability (e.g. stub OCR, internal portal preview)

---

## Dashboard

### לוח בקרה · Dashboard
| | |
|---|---|
| **Route** | `/` |
| **Opens from** | Main nav (always) |
| **For** | Business home: attention items, summary, links into work |
| **Primary actions** | Open projects / expenses; glance at cash and ops summaries when data exists |
| **Desktop / mobile** | Both (mobile primary) |
| **Permission** | Signed-in member (org context) |
| **Status** | complete |

---

## Projects

### פרויקטים · Projects
| | |
|---|---|
| **Route** | `/projects` |
| **Opens from** | Main nav; Dashboard |
| **For** | List and find all projects |
| **Primary actions** | Search/filter; open a project; create project (if allowed) |
| **Desktop / mobile** | Both (mobile primary) |
| **Permission** | `projects.read` (create: `projects.create`) |
| **Status** | complete |

### פרויקט חדש · New project
| | |
|---|---|
| **Route** | `/projects/new` |
| **Opens from** | Projects list; **New** menu |
| **For** | Start a project with a name (details optional) |
| **Primary actions** | Save project |
| **Desktop / mobile** | Both |
| **Permission** | `projects.create` |
| **Status** | complete |

### סביבת פרויקט · Project workspace
| | |
|---|---|
| **Route** | `/projects/[projectId]` |
| **Opens from** | Projects list; CRM convert; links elsewhere |
| **For** | One project’s hub: details, work areas/phases/milestones, tabs for expenses/changes/billing/time/documents (when modules + permissions allow) |
| **Primary actions** | Edit details; manage structure/schedule; open financials; attach documents; jump to field ops |
| **Desktop / mobile** | Both |
| **Permission** | `projects.read` (+ tab-specific permissions) |
| **Status** | complete |

### כספי פרויקט · Project financials
| | |
|---|---|
| **Route** | `/projects/[projectId]/financials` |
| **Opens from** | Project workspace |
| **For** | Project money view (Actual / Committed / Forecast / Commercial labels) |
| **Primary actions** | Review figures; open related records |
| **Desktop / mobile** | Both |
| **Permission** | `project_financials.read` (and/or contracts read as gated in UI) |
| **Status** | complete |

---

## Clients

### רשימת לקוחות · Clients
| | |
|---|---|
| **Route** | `/clients` |
| **Opens from** | Main nav (module **clients** on) |
| **For** | Client directory |
| **Primary actions** | Browse; open profile; add client |
| **Desktop / mobile** | Both |
| **Permission** | `clients.read` / manage: `clients.manage` |
| **Status** | complete |

### לקוח חדש · New client
| | |
|---|---|
| **Route** | `/clients/new` |
| **Opens from** | Clients list; **New** menu |
| **For** | Add a client (name required) |
| **Primary actions** | Save |
| **Desktop / mobile** | Both |
| **Permission** | `clients.manage` |
| **Status** | complete |

### פרופיל לקוח · Client profile
| | |
|---|---|
| **Route** | `/clients/[clientId]` |
| **Opens from** | Clients list; project links |
| **For** | Client details and related context |
| **Primary actions** | Edit; manage contacts; attach documents when available |
| **Desktop / mobile** | Both |
| **Permission** | `clients.read` / `clients.manage` |
| **Status** | complete |

---

## CRM

*Module **crm** must be on. Nav: CRM and sales.*

### CRM ומכירות · CRM home (opportunities)
| | |
|---|---|
| **Route** | `/crm` |
| **Opens from** | Main nav |
| **For** | Pre-project sales pipeline (opportunities) |
| **Primary actions** | Open opportunity; create; jump to prospects/leads |
| **Desktop / mobile** | Both |
| **Permission** | `crm.read` / `crm.manage` |
| **Status** | complete |

### מתעניינים · Prospects list / new / detail
| | |
|---|---|
| **Routes** | `/crm/prospects`, `/crm/prospects/new`, `/crm/prospects/[prospectId]` |
| **Opens from** | CRM section |
| **For** | Early interest records before leads |
| **Primary actions** | Create, edit, open |
| **Desktop / mobile** | Both |
| **Permission** | `crm.read` / `crm.manage` |
| **Status** | complete |

### לידים · Leads list / new / detail
| | |
|---|---|
| **Routes** | `/crm/leads`, `/crm/leads/new`, `/crm/leads/[leadId]` |
| **Opens from** | CRM section |
| **For** | Qualified sales leads |
| **Primary actions** | Create, edit, advance |
| **Desktop / mobile** | Both |
| **Permission** | `crm.read` / `crm.manage` |
| **Status** | complete |

### הזדמנות · Opportunity new / detail
| | |
|---|---|
| **Routes** | `/crm/opportunities/new`, `/crm/opportunities/[opportunityId]` |
| **Opens from** | CRM home |
| **For** | Deal with quotes; **convert to project** when won (idempotent) |
| **Primary actions** | Edit; manage quote; convert to client + project + contract |
| **Desktop / mobile** | Both |
| **Permission** | `crm.read` / `crm.manage` |
| **Status** | complete |

---

## Expenses

### הוצאות · Expenses
| | |
|---|---|
| **Route** | `/expenses` |
| **Opens from** | Main nav (always when permitted) |
| **For** | All project and overhead costs |
| **Primary actions** | Filter; open expense; add expense; **Photograph receipt / חילוץ** → `/documents/ocr-review` |
| **Desktop / mobile** | Both (mobile primary) |
| **Permission** | `expenses.read` |
| **Status** | complete |

### הוצאה חדשה · New expense
| | |
|---|---|
| **Route** | `/expenses/new` |
| **Opens from** | Expenses; **New** menu; project expenses |
| **For** | Fast capture (amount first; rest optional) |
| **Primary actions** | Save draft/finalize per form rules |
| **Desktop / mobile** | Both |
| **Permission** | `expenses.create` |
| **Status** | complete |

### הוצאה · Expense detail
| | |
|---|---|
| **Route** | `/expenses/[expenseId]` |
| **Opens from** | Expenses list; project |
| **For** | One expense: summary, finalize/void, vendor promote, documents |
| **Primary actions** | Finalize; void; save as vendor; attach files / take photo (document attachment — not OCR) |
| **Desktop / mobile** | Both |
| **Permission** | `expenses.read` (+ manage/finalize permissions as gated) |
| **Status** | complete |

---

## Vendors

### רשימת ספקים · Vendors & subcontractors
| | |
|---|---|
| **Route** | `/vendors` |
| **Opens from** | Main nav (module **vendors**) |
| **For** | Optional supplier directory (expenses do not require a vendor row) |
| **Primary actions** | Browse; add; open profile |
| **Desktop / mobile** | Both |
| **Permission** | `vendors.read` / `vendors.manage` |
| **Status** | complete |

### ספק חדש / פרופיל ספק · New vendor / Vendor profile
| | |
|---|---|
| **Routes** | `/vendors/new`, `/vendors/[vendorId]` |
| **Opens from** | Vendors list; **New** menu; expense promote |
| **For** | Create and maintain vendor records + documents |
| **Primary actions** | Save; edit type; attach documents |
| **Desktop / mobile** | Both |
| **Permission** | `vendors.manage` / read |
| **Status** | complete |

---

## Workforce

### עובדים ושעות · Workforce (redirects to employees)
| | |
|---|---|
| **Route** | `/workforce` → `/workforce/employees` |
| **Opens from** | Main nav (module **workforce**) |
| **For** | Entry to people & hours |
| **Primary actions** | — (redirect) |
| **Desktop / mobile** | Both |
| **Permission** | `workforce.read` |
| **Status** | complete |

### עובדים · Employees list / new / detail
| | |
|---|---|
| **Routes** | `/workforce/employees`, `/workforce/employees/new`, `/workforce/employees/[employeeId]` |
| **Opens from** | Workforce nav; **New** → Employee |
| **For** | Employee records and cost rates |
| **Primary actions** | Add employee; edit rates; open profile |
| **Desktop / mobile** | Both |
| **Permission** | `workforce.read` / `workforce.manage` |
| **Status** | complete |

### דיווחי שעות · Time entries / new
| | |
|---|---|
| **Routes** | `/workforce/time`, `/workforce/time/new` |
| **Opens from** | Workforce; **New** → Time entry; project time tab |
| **For** | Log hours against projects (labor cost from real time) |
| **Primary actions** | Add entry; browse list |
| **Desktop / mobile** | Both |
| **Permission** | `workforce.read` / `time.manage` |
| **Status** | complete |

---

## Commercial (changes & extras)

### שינויים ותוספות · Changes list
| | |
|---|---|
| **Route** | `/changes` |
| **Opens from** | Main nav (module **changes**) |
| **For** | Cross-project change requests (pending stays out of current contract until approved) |
| **Primary actions** | Open request; create |
| **Desktop / mobile** | Both |
| **Permission** | `changes.read` / `changes.manage` |
| **Status** | complete |

### בקשת שינוי · Change new / detail / price / approve
| | |
|---|---|
| **Routes** | `/changes/new`, `/changes/[changeRequestId]`, `…/price`, `…/approve` |
| **Opens from** | Changes list; project changes tab |
| **For** | Draft, price, and approve extras/reductions |
| **Primary actions** | Edit; set price; approve (separate permission) |
| **Desktop / mobile** | Both |
| **Permission** | `changes.manage` / `changes.approve` |
| **Status** | complete |

---

## Billing / Payments

### חיובים וגבייה · Billing and collections
| | |
|---|---|
| **Route** | `/billing` |
| **Opens from** | Main nav (module **billing**) |
| **For** | AR: billing records, aging, payment history |
| **Primary actions** | Open record; new billing; new payment |
| **Desktop / mobile** | Both |
| **Permission** | `billing.read` / `billing.manage` |
| **Status** | complete |

### חיוב חדש / תשלום חדש / חיוב · New billing / New payment / Billing detail
| | |
|---|---|
| **Routes** | `/billing/new`, `/billing/payments/new`, `/billing/[billingRecordId]` |
| **Opens from** | Billing list; **New** menu; project billing |
| **For** | Create receivables and record collections; credit/void disclosure on detail |
| **Primary actions** | Save billing; record payment; review status |
| **Desktop / mobile** | Both |
| **Permission** | `billing.manage` / read |
| **Status** | complete |

---

## Reports

### דוחות · Reports
| | |
|---|---|
| **Route** | `/reports` |
| **Opens from** | Main nav |
| **For** | Org analytics in base currency (Actual / Committed / Forecast / Commercial / Estimate; VAT never profit) |
| **Primary actions** | Review summaries; CSV export actions; link to **Import data** |
| **Desktop / mobile** | Both |
| **Permission** | `project_financials.read` |
| **Status** | complete |

---

## Procurement

### רכש · Purchase orders
| | |
|---|---|
| **Route** | `/procurement` |
| **Opens from** | Main nav (module **procurement**) |
| **For** | POs = **committed cost**, not expense |
| **Primary actions** | List/issue POs; section tabs → RFQs, Materials, AP |
| **Desktop / mobile** | Both |
| **Permission** | `procurement.read` / `procurement.manage` |
| **Status** | complete |

### הזמנת רכש חדשה / פרטי הזמנה · New PO / PO detail
| | |
|---|---|
| **Routes** | `/procurement/new`, `/procurement/[purchaseOrderId]` |
| **Opens from** | Procurement list |
| **For** | Draft lines; issue to commit; attach documents |
| **Primary actions** | Save draft; issue; open detail |
| **Desktop / mobile** | Both |
| **Permission** | `procurement.manage` / read |
| **Status** | complete |

### בקשות הצעת מחיר · RFQs list / new / detail
| | |
|---|---|
| **Routes** | `/procurement/rfqs`, `/procurement/rfqs/new`, `/procurement/rfqs/[rfqId]` |
| **Opens from** | Procurement section nav |
| **For** | Request and compare supplier quotes, then create PO |
| **Primary actions** | Create RFQ; add quotes; proceed to PO |
| **Desktop / mobile** | Both |
| **Permission** | `procurement.read` / `procurement.manage` |
| **Status** | complete |

---

## AP (accounts payable)

### חשבונות ספקים · Vendor bills (AP)
| | |
|---|---|
| **Route** | `/procurement/ap` |
| **Opens from** | Procurement section tab **AP** |
| **For** | Payable obligations; match to PO and/or **existing** expenses — never invents an expense |
| **Primary actions** | List bills; create; open matching |
| **Desktop / mobile** | Both |
| **Permission** | `ap.read` / `ap.manage` |
| **Status** | complete |

### חשבון ספק חדש / פרטי חשבון · New AP bill / Bill detail
| | |
|---|---|
| **Routes** | `/procurement/ap/new`, `/procurement/ap/[billId]` |
| **Opens from** | AP list |
| **For** | Create payable; propose/accept matches |
| **Primary actions** | Save; accept matches |
| **Desktop / mobile** | Both |
| **Permission** | `ap.manage` / read |
| **Status** | complete |

---

## Materials / Inventory

### חומרים · Materials catalog
| | |
|---|---|
| **Route** | `/procurement/materials` |
| **Opens from** | Main nav (module **materials**) or Procurement tab |
| **For** | Material catalog + optional vendor prices (not stock GL) |
| **Primary actions** | Browse; open material; manage prices |
| **Desktop / mobile** | Both |
| **Permission** | `materials.read` / `materials.manage` |
| **Status** | complete |

### פרטי חומר · Material detail
| | |
|---|---|
| **Route** | `/procurement/materials/[materialId]` |
| **Opens from** | Materials list |
| **For** | One material and vendor price rows |
| **Primary actions** | Edit; manage vendor prices |
| **Desktop / mobile** | Both |
| **Permission** | `materials.read` / manage |
| **Status** | complete |

### מלאי · Inventory list / item
| | |
|---|---|
| **Routes** | `/assets/inventory`, `/assets/inventory/[itemId]` |
| **Opens from** | Assets section nav |
| **For** | On-hand quantities; movements update quantity only — **never** GL/expense |
| **Primary actions** | Browse; adjust quantity; open item |
| **Desktop / mobile** | Both |
| **Permission** | `assets.read` / `assets.manage` |
| **Status** | complete |

---

## Field Ops

### עבודה בשטח · Field operations home
| | |
|---|---|
| **Route** | `/field-ops` |
| **Opens from** | Main nav (module **field_ops**); project links |
| **For** | Hub for daily logs, punch, inspections |
| **Primary actions** | Open section; create log/punch/inspection |
| **Desktop / mobile** | Both |
| **Permission** | `field_ops.read` / `field_ops.manage` |
| **Status** | complete |

### יומני עבודה · Daily logs list / new / detail
| | |
|---|---|
| **Routes** | `/field-ops/logs`, `/field-ops/logs/new`, `/field-ops/logs/[logId]` |
| **Opens from** | Field ops |
| **For** | What happened on site for a project day |
| **Primary actions** | Create; edit; attach photos **after save** (documents) |
| **Desktop / mobile** | Both |
| **Permission** | `field_ops.read` / manage |
| **Status** | complete |

### פאנץ׳ · Punch list / new / detail
| | |
|---|---|
| **Routes** | `/field-ops/punch`, `/field-ops/punch/new`, `/field-ops/punch/[punchId]` |
| **Opens from** | Field ops |
| **For** | Open items before handover |
| **Primary actions** | Create; update status; attach files |
| **Desktop / mobile** | Both |
| **Permission** | `field_ops.read` / manage |
| **Status** | complete |

### בדיקות · Inspections list / new / detail
| | |
|---|---|
| **Routes** | `/field-ops/inspections`, `/field-ops/inspections/new`, `/field-ops/inspections/[inspectionId]` |
| **Opens from** | Field ops |
| **For** | Schedule and record inspections |
| **Primary actions** | Create with optional date; update; attach files |
| **Desktop / mobile** | Both |
| **Permission** | `field_ops.read` / manage |
| **Status** | complete |

---

## Assets / Fleet / Maintenance

### נכסים וציוד · Assets
| | |
|---|---|
| **Route** | `/assets` |
| **Opens from** | Main nav (module **assets**) |
| **For** | Equipment/vehicles; snapshot of maintenance |
| **Primary actions** | List assets; add; jump to fleet / maintenance / inventory |
| **Desktop / mobile** | Both |
| **Permission** | `assets.read` / `assets.manage` |
| **Status** | complete |

### נכס חדש / פרטי נכס · New asset / Asset detail
| | |
|---|---|
| **Routes** | `/assets/new`, `/assets/[assetId]` |
| **Opens from** | Assets list |
| **For** | Asset record; maintenance metadata (cost is **not** an expense) |
| **Primary actions** | Create; edit; log maintenance |
| **Desktop / mobile** | Both |
| **Permission** | `assets.manage` / read |
| **Status** | complete |

### צי רכב · Fleet
| | |
|---|---|
| **Route** | `/assets/fleet` |
| **Opens from** | Assets section |
| **For** | Vehicles (plate, VIN, odometer) |
| **Primary actions** | Browse vehicle assets |
| **Desktop / mobile** | Both |
| **Permission** | `assets.read` |
| **Status** | complete |

### לוח תחזוקה · Maintenance schedule
| | |
|---|---|
| **Route** | `/assets/maintenance` |
| **Opens from** | Assets section / assets home |
| **For** | Overdue and upcoming maintenance |
| **Primary actions** | Review schedule; open asset |
| **Desktop / mobile** | Both |
| **Permission** | `assets.read` |
| **Status** | complete |

---

## Compliance

### ביטוחים וציות · Insurance and compliance
| | |
|---|---|
| **Route** | `/compliance` |
| **Opens from** | Main nav (module **compliance**) |
| **For** | Policies, licenses, certifications; expiry visibility |
| **Primary actions** | Browse; add; open artifact |
| **Desktop / mobile** | Both |
| **Permission** | `compliance.read` / `compliance.manage` |
| **Status** | complete |

### רשומת ציות חדשה / פרטים · New / detail
| | |
|---|---|
| **Routes** | `/compliance/new`, `/compliance/[artifactId]` |
| **Opens from** | Compliance list |
| **For** | Register and update one artifact; documents |
| **Primary actions** | Save; update status/dates; attach files |
| **Desktop / mobile** | Both |
| **Permission** | `compliance.manage` / read |
| **Status** | complete |

---

## Documents

### מסמכים · Documents hub
| | |
|---|---|
| **Route** | `/documents` |
| **Opens from** | Main nav (module **documents**) |
| **For** | Org-wide browse of files linked to records |
| **Primary actions** | Search/filter by owner type; open **Photograph receipt / חילוץ** |
| **Desktop / mobile** | Both |
| **Permission** | `documents.read` |
| **Status** | complete |

### צילום קבלה / בדיקת חילוץ · Receipt photo / extraction review
| | |
|---|---|
| **Route** | `/documents/ocr-review` |
| **Opens from** | Documents header; Expenses header (**צילום קבלה לחילוץ** / Photograph receipt) |
| **For** | Upload or photograph a receipt → review candidates → optional draft expense (see OCR section below) |
| **Primary actions** | Photograph receipt; upload receipt/invoice; seed fixture; accept fields; preview mapping; confirm draft expense |
| **Desktop / mobile** | Both (camera capture strongest on phone) |
| **Permission** | View: `documents.read`; extract/fixture: `documents.manage`; confirm expense: `expenses.create` |
| **Status** | foundation only |

**Note:** On any record’s **Documents** panel, **Upload** / **Take photo** create a normal **Document** attachment. That path does **not** open OCR review.

---

## Scheduling

*No standalone “Scheduling” nav item. Light scheduling is embedded.*

### לוח זמנים בפרויקט · Project schedule (embedded)
| | |
|---|---|
| **Route** | Inside `/projects/[projectId]` (overview schedule summary + work-area/phase date forms) |
| **Opens from** | Project workspace |
| **For** | Light dates/milestones — not a full Gantt product |
| **Primary actions** | Set work-area/phase dates; view overdue milestones |
| **Desktop / mobile** | Both |
| **Permission** | `projects.read` / `projects.update` |
| **Status** | partial |

### תאריכי בדיקה / תחזוקה · Inspection dates & maintenance schedule
| | |
|---|---|
| **Routes** | Field-ops inspections; `/assets/maintenance` |
| **Opens from** | Field ops; Assets |
| **For** | Operational dates, not resource leveling |
| **Primary actions** | Set scheduled-on; review overdue/upcoming maintenance |
| **Desktop / mobile** | Both |
| **Permission** | field ops / assets permissions |
| **Status** | partial |

---

## Settings

### הגדרות · Settings index
| | |
|---|---|
| **Route** | `/settings` |
| **Opens from** | Main nav |
| **For** | Redirects to the first section the user can access |
| **Primary actions** | — (redirect) |
| **Desktop / mobile** | Both |
| **Permission** | Signed-in |
| **Status** | complete |

| Hebrew | English | Route | Opens from | For | Primary actions | D/M | Permission | Status |
|--------|---------|-------|------------|-----|-----------------|-----|------------|--------|
| העסק | Business | `/settings/business` | Settings | Org profile | Edit business | Both | `org.read` / update | complete |
| אנשים ותפקידים | People | `/settings/people` | Settings | Members & invites | Invite; manage membership | Both | `members.read` / manage | complete |
| תפקידים | Roles | `/settings/roles` | Settings | V1 roles + profit toggle | Adjust toggles | Both | `roles.manage` | complete |
| יכולות | Features | `/settings/features` | Settings | Show/hide modules; starter preset | Toggle modules; apply preset | Both | `settings.manage` | complete |
| קטגוריות עלות | Cost categories | `/settings/cost-categories` | Settings | Optional cost grouping | Add/rename/archive | Both | `settings.manage` | complete |
| תחומים וסוגים | Domains & types | `/settings/catalog` | Settings | Domains, document types, labor defaults | Add/archive; save labor defaults | Both | `settings.manage` | complete |
| מס | Tax | `/settings/tax` | Settings | Tax configuration | Edit tax settings | Both | `tax.manage` | complete |
| יומן פעילות | Activity log | `/settings/activity` | Settings | Sensitive change audit | Browse; export CSV | Both | `audit.read` | complete |
| הפרופיל שלכם | Your profile | `/settings/profile` | Settings / user menu | Personal profile | Edit profile | Both | self | complete |

---

## Templates

### תבניות מבנה · Structure templates
| | |
|---|---|
| **Route** | `/settings/templates` |
| **Opens from** | Settings |
| **For** | Reusable project / work-area / phase packs (copies on apply) |
| **Primary actions** | Save packs; delete; apply from project UI |
| **Desktop / mobile** | Both |
| **Permission** | `settings.manage` |
| **Status** | complete |

*(Starter preset also lives under Features — adds suggested domains/categories without deleting data.)*

---

## Custom Fields

### שדות מותאמים · Custom fields
| | |
|---|---|
| **Route** | `/settings/custom-fields` |
| **Opens from** | Settings |
| **For** | Governed custom field definitions |
| **Primary actions** | Define/manage fields |
| **Desktop / mobile** | Both |
| **Permission** | `custom_fields.manage` |
| **Status** | complete |

---

## Imports / Exports

### ייבוא נתונים · Import data
| | |
|---|---|
| **Route** | `/imports` |
| **Opens from** | Reports export/import actions (not main nav) |
| **For** | CSV/Excel import for clients/vendors/employees/projects with mapping + preview |
| **Primary actions** | Upload; map columns; preview; confirm create |
| **Desktop / mobile** | Both (desktop easier for files) |
| **Permission** | As enforced by import actions (org manage / entity create) |
| **Status** | complete |

**Exports:** CSV from Reports and Activity log (and similar list actions) — no separate “Exports” screen.

---

## API / Webhooks

### API ו־webhooks · API and webhooks
| | |
|---|---|
| **Route** | `/settings/api` |
| **Opens from** | Settings (module/feature as configured) |
| **For** | API keys + webhook endpoint foundation |
| **Primary actions** | Create/manage keys; configure webhooks |
| **Desktop / mobile** | Both |
| **Permission** | `api.manage` |
| **Status** | foundation only |

---

## Customer Portal

### גישת פורטל · Portal access (internal)
| | |
|---|---|
| **Route** | `/settings/portal` |
| **Opens from** | Settings |
| **For** | Grants + **internal** preview of customer-safe / vendor-safe projections; candidate review — **not** a public login portal |
| **Primary actions** | Manage grants; preview; internal candidate review |
| **Desktop / mobile** | Both |
| **Permission** | `portal.manage` |
| **Status** | foundation only |

*Public customer portal login is deferred.*

---

## Vendor Portal

Covered on the same **Portal access** screen (`/settings/portal`): vendor-safe preview and grant-scoped candidate submit paths (quote / AP / compliance). **Status:** foundation only. No separate public vendor app URL yet.

---

## PWA / Offline

### טיוטות לא מקוונות · Offline drafts
| | |
|---|---|
| **Route** | `/settings/offline-drafts` |
| **Opens from** | Settings |
| **For** | Local offline draft queue visibility |
| **Primary actions** | Review/sync drafts (as implemented) |
| **Desktop / mobile** | Both (field/mobile intent) |
| **Permission** | Signed-in (section always listed) |
| **Status** | partial |

*Not a full offline-first native PWA product yet.*

---

## OCR

See detailed Q&A in the next section. Product screen: `/documents/ocr-review` — **foundation only** (StubOcrProvider; in-memory jobs).

---

## Auth / onboarding (supporting, not product modules)

| Hebrew | English | Route | Status |
|--------|---------|-------|--------|
| כניסה | Sign in | `/sign-in` | complete |
| יצירת חשבון | Sign up | `/sign-up` | complete |
| איפוס סיסמה | Forgot / reset password | `/forgot-password`, `/reset-password` | complete |
| קבלת הזמנה | Accept invite | `/accept-invite` | complete |
| הגדרת העסק | Onboarding / setup | `/onboarding`, `/setup` | complete |

---

# OCR / receipt photo — exact current state

### 1) Is there a visible photograph receipt/invoice action?
**Yes.** After discoverability labels/links:

- Expenses → **Photograph receipt (OCR)** / **צילום קבלה לחילוץ**
- Documents → same link
- On `/documents/ocr-review`: **Photograph receipt** (camera) and **Upload receipt or invoice**

Separate from OCR: record **Documents** panels have **Take photo** / **צילום** (attachment only).

### 2) Exact route / screen
`/documents/ocr-review` — **Receipt photo / extraction review** (`documents.ocr`).

### 3) Camera direct vs upload
- OCR review: **both** — `capture="environment"` for photo; file picker for image/PDF upload.
- Document attachments: upload + camera; **not** OCR.

### 4) Creates Document?
**OCR extract path:** does **not** create a `documents` row. Job keeps source filename/mime (and optional `documentId` if supplied).  
**Attachment Take photo / Upload:** **yes**, creates a Document on that owner.

### 5) Enters OCR review?
Only when the user opens `/documents/ocr-review` and runs extract (or seeds a fixture). Attachment upload/photo does **not** auto-open OCR.

### 6) Creates only draft Expense?
**Yes, and only after explicit confirm.** Confirm calls expense create as **draft** — never finalized / ledger-posted from OCR. Preview mapping creates **no** expense.

### 7) Explicit confirmation steps
1. Extract (or load fixture) → job `needs_review`  
2. Accept at least one field (checkboxes)  
3. Optional: **Preview expense mapping** (`confirm: false`)  
4. **Confirm draft expense** (`confirm: true`) → draft expense only  

OCR never auto-posts.

### 8) StubOcrProvider usage
Default provider is **`StubOcrProvider`** (`getOcrProvider` / `createDefaultOcrProvider`).

- No `OCR_PROVIDER_API_KEY` → `not_configured` (no invented amounts)  
- Key present → still stub → `empty_result` (does not fake OCR)  
- Demos/tests: **Load fixture candidate** (not provider output) or `ScriptedOcrProvider` in tests  

### 9) What doesn’t work without a real provider
- Real field extraction from photos/PDFs (vendor, amounts, dates, etc.)  
- Production confidence/provenance from a vendor model  
- Meaningful review queue from live captures (jobs fail or empty unless fixture)  

Review UI, permissions, and draft-expense confirm **do** work with fixtures.

### 10) In-memory only?
**Yes** for extraction jobs — process-local store (`in-memory-ocr.store`). Draft expenses created on confirm are normal DB expenses.

### 11) Survives refresh / redeploy?
- **Jobs / candidates:** **No** — lost on process restart, refresh against another instance, or redeploy.  
- **Draft expense after confirm:** **Yes** — persisted like any expense.  
- **Document attachments:** **Yes** (when storage configured).

### 12) Needed later for a real provider
- Real OCR adapter implementing `OcrProvider` (not stub)  
- `OCR_PROVIDER_API_KEY` (server-only) wired to that adapter  
- Optional durable jobs: proposed `0014_ocr_foundations` (see `docs/implementation/0014-OCR-FOUNDATIONS-PROPOSAL.md`) — Lead assigns migration number  
- Optional: link extract to real Document upload retention  
- Do **not** auto-finalize expenses or write project/category IDs from suggestions  

---

## Discoverability fix applied (this pass)

Labels/links only — **no live OCR provider wiring**:

| File | Change |
|------|--------|
| `src/locales/en/documents.json` | Clearer OCR title, description, extract/capture/review link labels |
| `src/locales/he-IL/documents.json` | Same in Hebrew |
| `src/locales/en/expenses.json` | `actions.receiptPhoto` |
| `src/locales/he-IL/expenses.json` | `actions.receiptPhoto` |
| `src/app/[locale]/(app)/expenses/page.tsx` | Link to `/documents/ocr-review` |
| `src/modules/ocr/ui/ocr-review-panel.tsx` | Visible **Photograph receipt** control (`capture`) alongside upload |
