# 18 — Open Questions

**Status:** Active decision log  
**Phase:** Planning only  
**Rule:** No guessing presented as fact. Recommendations are not decisions.  
**Last owner decision batch:** 2026-08-09

---

## How to use this file

For each question:

- state the decision needed
- list options
- note implications
- include recommendation (if any)
- owner marks: `DECIDED` / `OPEN` / `DEFERRED` + date + choice

---

## A. Product positioning & naming

### A1. Final product name
- **Status:** OPEN  
- **Interim note (2026-08-09):** keep **ProjectFlow** as temporary working name  
- **Still undecided:** final brand / rename  
- **OWNER DECISION REQUIRED** for final name only

### A2. Market posture inside construction / built environment
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Broad Construction / Built Environment from the start (trade contractors, subcontractors, main/turnkey contractors, architects, engineers, designers, consultants, supervisors/PMs, similar).  
- **Constraint:** no heavyweight GC-only UX in V1; same core must stay simple for single-trade contractor or consultant.  
- **Still open separately:** first pilot profile (`L1`)

### A3. Progressive complexity / optional capability model
- **Status:** DECIDED (2026-08-09)  
- **Decision:** ProjectFlow follows a progressive-complexity / optional-capability model. Users operate with minimal configuration and progressively adopt structured modules. Internally required technical objects may be auto-created/hidden. Availability ≠ obligation. Financial views must disclose calculation coverage. Detail: `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`.

---

## B. Domain structure

### B1. Are Work Packages mandatory?
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Yes. Every Project must have ≥1 WorkPackage. Simple projects may auto-create one default/general WorkPackage so users avoid unnecessary complexity.

### B2. Contracts per project
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Schema/domain supports **Project 1 → N Contracts** from the beginning. V1 UX defaults to one **Primary Contract**; do not force multi-contract management. Future packages/phases/contracts reuse 1:N without schema replacement.

### B3. Project domain not in org catalog
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Project may use an ad-hoc ProfessionDomain/Service not yet enabled in the Organization catalog. UX may offer “Add this to business services too?” Do not force Settings-first. No destructive duplication.

### B6. Project without assigned client at create time / client gates
- **Status:** DECIDED (2026-08-09) — see also `U6`  
- **Decision:**  
  - Project creation: Client is **not** required (no client / simple name / structured Client all allowed).  
  - Internal V1 BillingRecord: does **not** require a fully enriched Client; may track against Project context.  
  - Customer-facing document/send/export: require appropriate client identity; Country Pack may require legal/tax/address fields at that action only.  
  - Do not push billing/export requirements into Project creation. V1 is not statutory invoice issuance.

### B4. Depth of Phase/Task in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** V1 hierarchy = Project → WorkPackage → optional Phase. Full Task/Activity/WBS/Gantt deferred.

### B5. Canonical vs display terminology
- **Status:** DEFERRED (2026-08-09) — not a V1 implementation blocker  
- **V1 posture:** stable canonical concept keys + approved initial Hebrew UX glossary (`U5`) + localized display terminology.  
- **Later:** organization-level custom aliases where safe.  
- **Invariant:** canonical financial/domain meaning must never be replaced by arbitrary aliases.

---

## C. Commercial / changes

### C1. Change Request vs Change Order entities
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Keep separate canonical concepts.  
  - ChangeRequest = request/pricing/negotiation workflow  
  - ChangeOrder = approved commercial change that affects contract value  
  - V1 UI may present as one seamless workflow

### C2. V1 change lifecycle depth
- **Status:** DECIDED (2026-08-09) — see also `U7`  
- **Decision:** Visible V1 commercial statuses: Draft · Awaiting Approval · Approved · Rejected · Cancelled.  
  - `Sent` is an event/timestamp/action (`sent_at`, evidence), not a required lifecycle status.  
  - Approved ChangeRequest creates/links ChangeOrder.  
  - Operational In Progress / Completed are **not** primary V1 commercial statuses.  
  - Billing state separate: unbilled / partially billed (if supported) / billed. Payment separate.

### C3. Client-side approval in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** No Customer Portal, email approval workflow, or e-signature in V1. V1 supports **internal recording** of external approval: approved/rejected, approved by / approver text or linked party, approval date/time, notes, selected QuoteVersion, optional evidence/document (signed quote, PDF, email evidence, WhatsApp screenshot, etc.). Future: customer link, portal, e-sign — not V1.

---

## D. Financial policy

### D1. Revenue recognition meaning in-product
- **Status:** DECIDED (2026-08-09) for V1 posture  
- **Decision:** Do **not** implement accounting-grade Revenue Recognition in V1. V1 UI focuses on explicit concepts: Original/Approved/Current/Pending Contract Value, Invoiced, Paid, Outstanding, Actual Cost to Date, Estimated/Forecast Final Cost, Estimated/Forecast Profit. Do not label a number “Revenue” unless definition is explicit.  
- **Still open later:** post-V1 recognition policy (progress vs invoice vs explicit events)

### D2. Invoicing depth in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Basic outgoing billing/payment tracking is **in V1** (not full statutory accounting/invoice issuance). Must record billing record, amount, date, project/change relation, status, payments received, outstanding, attached external invoice/document. Preserve Contract Value / Invoiced / Paid / Outstanding separation.

### D3. Multi-currency timing
- **Status:** DECIDED (2026-08-09)  
- **Decision:** V1 uses one organization base currency and one project currency path. All money remains Amount + Currency structurally. Multi-currency conversion deferred, not blocked.

### D4. Overhead allocation in V1
- **Status:** DECIDED (2026-08-09); usage clarified by A3  
- **Decision:** Business overhead capability is **not** deferred. V1 must support Direct / Shared / Business Overhead / Asset-Capital categorization, recurring/general expenses, non-project expenses, splits across projects and overhead, and at least simple allocation via **manual amount** and **manual percentage**. Advanced Cost Allocation Engine deferred; architecture preserved for hours, revenue/contract basis, labor cost, duration, headcount, custom formulas.  
- **Usage:** Organizations are **not forced** to configure/use overhead on day one; metrics must disclose when overhead is not included (`A3`, `39`).

### D5. Correction style for issued financial docs
- **Status:** DECIDED (2026-08-09)  
- **Decision:**  
  - **Draft** records: editable normally with appropriate audit where sensitive.  
  - **Finalized/approved** financially meaningful records: do not silently rewrite historical meaning — use void / reversal / adjustment / replacement as appropriate.  
  - **Internal BillingRecord:** ProjectFlow controls tracking history; corrections after finalization preserve old state/effect (no destructive overwrite).  
  - **External accounting invoice/document:** may attach/reference; ProjectFlow must **not** pretend it can legally alter an external issued document. Corrected external invoices = new external doc/reference + appropriate internal adjustment history.

---

## E. Workforce

### E1. True-cost completeness in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Stronger than base wage only. V1 supports base hourly/daily/monthly cost, simple employer burden/loaded %, optional additional cost components, effective dates, historical rate integrity. Ready for detailed components later. Not payroll/statutory payroll software.

### E2. Employee must be a User?
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Employee ≠ User.** Employee does not require login. User does not require Employee. Optional Employee↔User link. Worker who logs time may have both. Owner/admin/accounting User may have no workforce-cost Employee. Do not merge concepts.

### E3. Past rate correction policy
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Future rate changes use effective-dated **RateVersion**; historical entries use historically applicable version. Past configuration mistakes prefer explicit correction/adjustment — no silent rewrite of historical costing. Future controlled recalculation tooling may exist only if explicit, permissioned, audited, and visibly distinguishable from original calculations.

---

## F. Vendors & parties

### F1. Party model shape
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Do **not** build a giant universal polymorphic Party as the primary V1 model. Keep distinct canonical concepts: Client, Vendor, Employee, User. Share reusable patterns (contacts, contact persons, addresses, identifiers, documents, communication details). Future verticals may extend shared infrastructure without replacing these concepts.

### F2. Multi-tier hierarchy depth in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** V1 models the organization's **direct** Vendor/Subcontractor relationships. Optional metadata: tier, parent/upstream contractor reference, notes, project role. No general graph/network engine in V1. Architecture must not prevent richer hierarchy later.

---

## G. Tax & localization

### G1. Draft document tax recalculation
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Draft** financial/commercial calculations may recalculate using the currently applicable TaxRule when edited/recalculated. **Finalized/issued** snapshots freeze applied tax rule identity, rate/method, effective basis, and manual override if any. Changing a TaxRule later must never silently change finalized historical records. Overrides remain auditable.

### G2. Unit storage strategy for commercial quantities
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Preserve entered quantity + entered unit for commercially meaningful quantities. Optionally also store/derive normalized quantity + normalized unit for analytics/calculation. Never destroy original commercial meaning by storing only a converted number.

### G3. First non-Hebrew UI completeness target
- **Status:** DECIDED (2026-08-09) as product direction  
- **Decision:** English is canonical source language; Hebrew is first complete UI; RTL/LTR first-class; global-first i18n. Exact English UI polish timing beyond “keys always present / Hebrew complete first” can still be refined in delivery planning.

---

## H. Access control

### H1. Custom role builder in V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** V1 role templates: **Owner**, **Manager / PM**, **Worker**, **Finance / Bookkeeping**. Underlying Permission model remains atomic/canonical. V1 UI may expose limited permission toggles/scopes. Full visual custom-role builder deferred.

### H2. Project financial visibility defaults for PM
- **Status:** DECIDED (2026-08-09)  
- **Decision (defaults; all permission-configurable):**  
  - **Owner:** all allowed business/project financials including profit/margin.  
  - **Finance:** financial access per assigned role/permissions.  
  - **Manager / PM:** operational/project info; project costs may be visible per config; **profit/margin hidden by default**; Owner can explicitly enable.  
  - **Worker:** no project/company profit or margin by default.  
  Authorization uses **Permissions**, not hardcoded role-name string checks.

---

## I. Integrity & deletion

### I1. Soft-delete restore policy
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Major meaningful records: archive / soft delete; hidden from normal active UI; owner/admin restore. No normal hard delete when financially/historically referenced. Pure unused drafts may be permanently deletable where safe. Legal/privacy deletion is a separate controlled process. Do not invent fixed retention periods yet.

### I2. Audit storage approach
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Normal relational CRUD + append-only AuditEvent.** Do not use full Event Sourcing for V1. Audit meaningful financial changes, contract/change approvals, permission changes, tax/rate configuration, deletion/archive/restore, and other sensitive actions. Audit log does not replace domain history/version tables where those are required.

---

## J. Technical stack

> **Stack A APPROVED by owner 2026-08-09.** Detail: `66`–`70`, blueprints `71`–`80`.  
> ORM, email, i18n, styling, tables, validation, testing, jobs posture approved with Stack A (see `67`).

### J1. Frontend framework
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Next.js App Router + TypeScript**

### J2. Backend shape
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Modular monolith inside Next.js** — UI → Application/Use Cases → Domain Services/Policies → Repositories → PostgreSQL. Business rules must not live in React components.

### J3. Database
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Relational system of record = **PostgreSQL** hosted as **Supabase PostgreSQL**. Data access: **Drizzle ORM** with version-controlled generated SQL migrations. `drizzle-kit push` is **not** the normal production migration workflow.

### J4. Auth approach / provider
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Supabase Auth** answers “Who is this user?” It is **not** the canonical ProjectFlow authorization system. Authorization lives in ProjectFlow DB (Organization, Membership, Role, Permission, RoleAssignment) with mandatory server-side checks.

### J5. File storage approach / vendor
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Supabase Storage** — private buckets/objects; DB holds metadata/ownership/permissions/relationships/storage pointer; binary in storage; authorization-aware access; no public permanent URL as the security model.

### J6. Tenant isolation strategy
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Shared PostgreSQL; tenant-owned records use `organization_id NOT NULL`. Defense layers: (1) active organization context, (2) OrganizationMembership validation, (3) permission validation, (4) tenant-scoped queries, (5) PostgreSQL RLS. **Organization A must never read or mutate Organization B data.** RLS is defense in depth — not permission to omit server-side authorization.

### J7. Hosting platform
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Vercel.** Separate development/preview and production configuration. Preview deployments must never accidentally operate on production data.

---

## K. Packaging / business model (product ops)

### K1. Module packaging for customers
- **Status:** OPEN  
- **Options:** all-in one price / modular paid modules / country packs priced separately  
- **Implications:** architecture feature flags, billing later  
- **Recommendation:** defer commercial packaging; keep technical modularity  
- **OWNER DECISION REQUIRED**

---

## L. Pilot definition

### L1. Who is the first pilot customer profile?
- **Status:** OPEN  
- **Notes after 2026-08-09:** market is broad by design; pilot still needs a concrete first customer profile for validation sequencing  
- **OWNER DECISION REQUIRED**

### L2. What is the minimum pilot success metric?
- **Status:** OPEN  
- **Examples:** replace spreadsheet for N projects; weekly active use by owner+PM; X change requests logged; overhead allocated at least once  
- **OWNER DECISION REQUIRED**

---

## U. V1 UX decisions

Detail: `40`–`48`, wireframes `49`–`55`. Owner closed 2026-08-09.

### U1. Primary navigation structure
- **Status:** DECIDED (2026-08-09)  
- **Always:** Home · Projects · Expenses · Settings · adaptive `+ New`  
- **Conditional:** Billing · Workforce · Vendors · Clients · Documents · cross-project Changes  
- Unused areas stay hidden/quiet

### U2. Module visibility mechanism
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Hybrid Option C — enable in Settings and/or auto-surface on meaningful first use; hide affects nav/widgets only; never deletes data; re-enable restores access; no unused-module warnings

### U3. Changes placement in IA
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Primary home = `Project → Changes`. Cross-project Changes optional/adaptive for heavy users. Not permanent top-level nav for every org

### U4. Project status set for V1
- **Status:** DECIDED (2026-08-09)  
- **Decision:** Draft · Active · On Hold · Completed · Cancelled · Archived  
- Do **not** add `Quoted` as Project status (belongs to commercial/pre-project/CRM). Labels localizable

### U5. Hebrew user-facing terminology glossary
- **Status:** DECIDED (2026-08-09) as **initial V1 UX glossary** (polishable later; canonical English unchanged)  
- **Decision:** See glossary table in `48-V1-UX-RULES-VALIDATION.md` and wireframe map `49`. Do not expose technical `WorkPackage` in Hebrew UI — use `תחום עבודה`

### U6. Client completeness gate before billing/export
- **Status:** DECIDED (2026-08-09) — same as `B6`  
- **Decision:** See B6. Internal BillingRecord ≠ statutory/customer-facing export gate

### U7. V1 Change commercial lifecycle (visible statuses)
- **Status:** DECIDED (2026-08-09) — same as `C2`  
- **Decision:** See C2

---

## V. Visual design (V1)

Detail: `56`–`64`. Structure/wireframes already closed (U1–U7). Brand look is **not** locked.

### V1. Visual direction family
- **Status:** DECIDED (2026-08-09)  
- **Decision:** **Direction B — Deep Teal** for V1 (`56`).  
- Direction A kept as historical alternative only. Direction C not selected.  
- Exact production hex, logo, and final brand name remain unlocked (`V3`).

### V2. Production font family
- **Status:** OPEN — **non-blocking**  
- **Notes:** May be selected during Wave 0 / implementation setup without reopening product architecture. System-font interim OK. Hebrew+Latin UI sans with strong table/numeral behavior (`58`).

### V3. Exact brand hex / logo / marketing brand
- **Status:** OPEN / DEFERRED  
- Token candidates in `57` are not locked. Final logo and marketing brand out of V1 design-system planning.

---

## M. Future-architecture hygiene (before implementation)

These came from the future capability architecture batch (`19`–`38`).  
They do **not** expand V1 feature scope; they protect the core from dead-ends.

### M1. External collaborator identity model
- **Status:** OPEN (decide before building portals; not needed for V1 coding start)  
- **Decision needed:** confirm ExternalPrincipal / grant model separate from OrganizationMembership (`25`)  
- **Recommendation:** keep separate  
- **OWNER DECISION REQUIRED** only when portals are scheduled

### M2. Committed cost vs actual expense
- **Status:** DECIDED as architecture principle (2026-08-09 capability planning)  
- **Decision:** Purchase Orders / commitments must remain distinct from Expense/Actual Cost (`21`, `19`)  
- **V1 implication:** V1 expenses stay actuals; do not overload them to mean PO commitments

### M3. SaaS subscription billing bounded context
- **Status:** DECIDED as architecture principle (2026-08-09 capability planning)  
- **Decision:** ProjectFlow subscription/plan/seat billing is a separate domain from customer project BillingRecord (`38`)  
- **Pricing itself:** still OPEN under `K1`

### M4. Pre-project quote storage vs project quotes
- **Status:** OPEN (not V1-blocking)  
- **Options:** unified Quote with context discriminator / separate SalesQuote entities (`20`)  
- **Recommendation:** shared versioning patterns; clear product boundary  
- **OWNER DECISION REQUIRED** when CRM slice is scheduled

---

## Decision checklist before development starts

Resolved by 2026-08-09 owner batches (including pre-impl + Stack A approval):

- [x] Market posture (A2); progressive complexity (A3)  
- [x] B1/B2/B3/B4/B6; B5 deferred (non-blocking)  
- [x] C1/C2/C3  
- [x] D1–D5  
- [x] E1–E3  
- [x] F1/F2  
- [x] G1–G3  
- [x] H1/H2  
- [x] I1/I2  
- [x] U1–U7; Visual Deep Teal (V1)  
- [x] Stack A: J1–J7 (+ Drizzle, Resend EmailPort, next-intl, Tailwind tokens, Radix-class primitives, TanStack Table, Zod, Vitest/Playwright, light jobs)

Pre-implementation pack: **`65`** — owner approved 2026-08-09.  
Stack: **`66`–`70`** — Stack A approved.  
Implementation Blueprint: **`71`–`80`** — awaiting owner review before first code.

**Do NOT block Wave 0 on:** A1 final brand, V2 font, V3 hex/logo, K1 packaging, L1/L2 pilot, M1 portals, M4 CRM quote boundary, B5 org aliases, full role builder, future provider abstractions beyond planned ports.

**Before first application code:** owner reviews Blueprint (`71`–`80`) and explicitly authorizes leaving planning / starting Wave 0.

---

## Decided log

| ID | Date | Decision | Notes |
|----|------|----------|-------|
| A2 | 2026-08-09 | Broad Built Environment market; no GC-only heavy UX | Pilot profile still L1 OPEN |
| A3 | 2026-08-09 | Progressive complexity / optional capability model | See `39` |
| B6 / U6 | 2026-08-09 | Client optional on project create; contextual gate on customer-facing export | Internal BillingRecord OK without rich Client |
| C2 / U7 | 2026-08-09 | CR statuses: Draft/Awaiting/Approved/Rejected/Cancelled; Sent=event | Billing/payment separate |
| U1 | 2026-08-09 | Primary nav always + adaptive modules | |
| U2 | 2026-08-09 | Module visibility Option C | hide ≠ delete |
| U3 | 2026-08-09 | Changes primary in Project | cross-project optional |
| U4 | 2026-08-09 | Project statuses Draft…Archived; no Quoted | |
| U5 | 2026-08-09 | Initial Hebrew UX glossary | polishable; no WorkPackage in HE UI |
| V1 visual | 2026-08-09 | Direction B Deep Teal | Hex/logo/name still open; A historical only |
| A1 interim | 2026-08-09 | Keep temporary name ProjectFlow | Final brand OPEN |
| B1 | 2026-08-09 | WorkPackage mandatory; auto default package allowed | |
| B4 | 2026-08-09 | Project → WP → optional Phase; Task/WBS deferred | |
| C1 | 2026-08-09 | Separate ChangeRequest and ChangeOrder | Seamless V1 UI OK |
| D1 | 2026-08-09 | No accounting-grade revenue recognition in V1; explicit labels only | |
| D2 | 2026-08-09 | Basic outgoing billing + payments + outstanding in V1 | Not statutory invoicing suite |
| D3 | 2026-08-09 | One org base currency + one project currency path; MoneyValue always | Conversion deferred |
| D4 | 2026-08-09 | Overhead in V1 + manual amount/% allocation | Advanced engine deferred |
| E1 | 2026-08-09 | True Cost = base + burden% + optional components + effective dates | Not payroll software |
| G3 | 2026-08-09 | English canonical; Hebrew first complete UI; RTL/LTR | |
| J3 | 2026-08-09 | PostgreSQL SoR on **Supabase PostgreSQL**; Drizzle + Git migrations | Stack A |
| J1 | 2026-08-09 | Next.js App Router + TypeScript | Stack A |
| J2 | 2026-08-09 | Modular monolith in Next.js | Stack A |
| J4 | 2026-08-09 | Supabase Auth = identity only; PF DB = authorization | Stack A |
| J5 | 2026-08-09 | Supabase Storage private + DB metadata | Stack A |
| J6 | 2026-08-09 | Shared DB + organization_id + app authz + RLS | Stack A |
| J7 | 2026-08-09 | Vercel; preview ≠ prod data | Stack A |
| B2 | 2026-08-09 | Project 1→N Contracts; V1 Primary Contract UX | Pre-impl pack |
| B3 | 2026-08-09 | Ad-hoc project domain + optional promote to org | Pre-impl pack |
| B5 | 2026-08-09 | DEFERRED org aliases; canonical keys + U5 glossary | Non-blocking |
| C3 | 2026-08-09 | Internal approval + evidence; no portal/e-sign V1 | Pre-impl pack |
| D5 | 2026-08-09 | Draft edit; finalized void/reverse/adjust; external docs immutable | Pre-impl pack |
| E2 | 2026-08-09 | Employee ≠ User; optional link | Pre-impl pack |
| E3 | 2026-08-09 | RateVersion effective dates; adjustments not silent rewrite | Pre-impl pack |
| F1 | 2026-08-09 | Separate Client/Vendor/Employee/User + shared patterns | Pre-impl pack |
| F2 | 2026-08-09 | Direct vendors; optional tier/parent metadata; no graph | Pre-impl pack |
| G1 | 2026-08-09 | Draft tax recalculates; finalized tax snapshot frozen | Pre-impl pack |
| G2 | 2026-08-09 | Store entered qty+unit; optional normalized | Pre-impl pack |
| H1 | 2026-08-09 | Role templates + limited toggles; atomic permissions | Pre-impl pack |
| H2 | 2026-08-09 | PM costs OK; profit/margin hidden by default | Pre-impl pack |
| I1 | 2026-08-09 | Soft delete/archive + owner restore; no casual hard delete | Pre-impl pack |
| I2 | 2026-08-09 | CRUD + append-only AuditEvent; not event sourcing | Pre-impl pack |
| M2 | 2026-08-09 | CommittedCost ≠ Expense/Actual | Future procurement hygiene |
| M3 | 2026-08-09 | SaaS billing ≠ customer BillingRecord | Separate bounded context |
