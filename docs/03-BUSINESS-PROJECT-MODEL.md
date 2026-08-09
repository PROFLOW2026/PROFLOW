# 03 — Business & Project Model

**Status:** Draft with owner decisions applied  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Describe how organizations, clients, projects, domains, services, and work packages fit together.

---

## 2. Market posture (owner direction)

Initial product structure supports the broad **Construction / Built Environment** market:

- trade contractors
- subcontractors
- main / turnkey contractors
- architects
- engineers
- designers
- consultants
- supervisors / project managers
- similar project-based professionals

**UX constraint:** do not create heavyweight GC-only UX in V1.  
The same core must remain simple enough for a single-trade contractor or consultant.

---

## 3. Organization / Business

### Meaning

The tenant that owns commercial and operational data.

### Responsibilities

- Holds users/memberships
- Owns clients, projects, vendors, employees, assets
- Defines offered profession domains and defaults
- Has base currency and country/locale defaults
- Has organization-level settings and overrides (tax, units, terminology)
- Owns business overhead / shared cost configuration

### Notes

- Organization is not a User.
- Future: one user can belong to multiple organizations.
- Billing of ProjectFlow itself to the organization is out of product-domain scope for now, but tenancy assumes org as the commercial customer unit.

---

## 4. Client

### Meaning

The party purchasing work from the organization.

### Possible client forms

- Private person
- Company
- Public body / institution
- Internal/intercompany client (future consideration)

### Typical data (conceptual)

- Display name / legal name
- Contacts
- Addresses
- Tax identifiers (country-pack dependent)
- Notes
- Documents
- Project history

### Rules

- A client can have many projects.
- Client data is organization-scoped (tenant isolated).
- Client master data is **progressively enrichable** — do not force full legal/address/tax/contact details merely to create a Project (`39`).

### Client flexibility (recommendation)

| Project create scenario | Recommendation |
|-------------------------|----------------|
| Simple client name only | Allowed |
| Internal/general placeholder client | Allowed as org convenience |
| Client not yet assigned | Allowed for draft/early projects; may be blocked later for customer-facing legal billing/export |

Project-create requirements stay separate from Country Pack requirements for issuing/exporting legally significant documents.

---

## 5. Project / Engagement

### Meaning

A managed body of work, usually for a client, with commercial and operational tracking.

“Project” is the default working term. “Engagement” may fit professional-services wording later. Final label may be terminology-configurable.

### Lightweight create (progressive complexity)

Desired minimum user input:

- Project name

System creates sensible defaults (including auto Default/General WorkPackage).

Optional anytime: client, contract value, domains/services, location, dates, budget, multi-WP, team, documents, tax/billing settings.

### Project should eventually know

- Client (may be minimal / placeholder / later-assigned per recommendation above)
- Status (lifecycle TBD)
- Dates (planned/actual)
- Selected domains
- Contract value components
- Work packages (**mandatory internally**, ≥1; auto default; UI may hide)
- Optional phases under work packages
- Team members / permissions scope
- Budget
- Costs / time / documents / billing
- Location(s) (optional, important for construction)
- Project role of the organization (main contractor, consultant, etc.)

### Lifecycle (V1 DECIDED 2026-08-09 — U4)

Canonical project statuses:

1. Draft  
2. Active  
3. On Hold  
4. Completed  
5. Cancelled  
6. Archived  

Do **not** use `Quoted` as a Project status (belongs to commercial/pre-project/CRM).  
Display labels may be localized.

---

## 6. Profession domains, services, roles, delivery modes

These are four independent axes.

### 6.1 Profession domain

What trade/discipline is involved.

Examples: Electrical, Plumbing, HVAC, Architecture, Structural Engineering, Safety Consulting...

Sources:

- System preset catalog (optional convenience)
- Organization-custom domains (required capability)

### 6.2 Service type

What kind of service is delivered in that domain.

Examples:

- Design
- Consulting
- Execution
- Supervision
- Inspection
- Maintenance
- Supply
- Management

### 6.3 Project role type

Who the organization (or a party) is on that project.

Examples:

- Main contractor
- Subcontractor
- Consultant
- Designer
- Supplier
- Supervisor
- Project manager

### 6.4 Delivery mode

How work is fulfilled.

Examples:

- Internal team
- Subcontractor
- Supplier
- Mixed internal + external
- Client-supplied
- Not yet determined

### Example matrix

Organization offers: Electrical, Plumbing, HVAC.

| Project | Domains on project | Notes |
|---------|--------------------|-------|
| A | Electrical only | Simple trade job → usually 1 default WorkPackage |
| B | Electrical + Plumbing | Multi-trade → multiple WorkPackages |
| C | Full turnkey set | Many domains / packages — without forcing GC-only UX on everyone |

---

## 7. Organization domains vs project domains

### Organization level

Defines what the business generally does / can sell.

### Project level

Chooses which of those (or additionally needed) domains apply to this project.

### Open point

Can a project use a domain not listed on the organization profile?

- **Option A:** No — must enable domain on organization first  
- **Option B:** Yes — project can add ad-hoc domain and optionally promote it to org catalog  
- **Recommendation:** Option B with prompt to save into org catalog  
- **OWNER DECISION REQUIRED**

---

## 8. Work Package / Service Area

### Meaning

A manageable commercial/operational slice inside a project, often aligned to a domain and delivery setup.

### Decided rules (2026-08-09)

1. **WorkPackage is mandatory internally.**
2. Every Project has **at least one** WorkPackage.
3. For simple projects, the system **automatically creates one default/general WorkPackage**.
4. UI may **hide** WorkPackage complexity until the user opts into multiple packages (**internal mandatory ≠ user configuration** — `39`).
5. Complex projects may have many WorkPackages (Electrical, Plumbing, HVAC, Architecture, Safety, etc.).
6. Default package can later be split/enriched into multiple packages without recreating the Project.

### Example

Private house project:

| Work package | Delivery mode |
|--------------|---------------|
| Electrical | Internal team |
| Plumbing | Subcontractor |
| HVAC | Supplier + subcontractor |
| Drywall | Internal team |

Simple consulting engagement:

| Work package | Delivery mode |
|--------------|---------------|
| General (auto-created) | Internal team |

### A work package should eventually hold

- Budget
- Contract portion / billing relation (policy details TBD)
- Costs
- Workers
- Time
- Materials
- Subcontractors
- Suppliers
- Equipment usage
- Documents
- Progress
- Changes
- Profitability

### Naming / display

- Internal canonical term: **WorkPackage**
- Display aliases (Service Area / Trade Package / Discipline) remain an open terminology question (`B5` in open questions)

### Cost/time targeting

Operational records in V1 should target WorkPackage (and optional Phase).  
Project-level views aggregate from packages (and default package for simple projects).

---

## 9. Phase / Task / Activity

### Decided V1 hierarchy (2026-08-09)

```text
Project
  → WorkPackage (mandatory)
    → Phase (optional)
```

### Deferred

- Full Task / Activity model
- Deep WBS
- Gantt / full schedule engine

### Meaning when Phase is used

| Level | Meaning | Example |
|-------|---------|---------|
| Phase | Stage under a package | Rough-in, Finishing, Handover |

---

## 10. Project team and access scope

A project may have assigned users with scoped permissions:

- Project manager sees selected projects
- Worker can enter time/expenses on assigned projects
- Finance may see financial fields across projects without project-management rights

Details in `12-USERS-ROLES-PERMISSIONS.md`.

---

## 11. Progress (conceptual)

Progress may later be represented by:

- % complete (manual)
- milestone completion
- quantity completion
- earned value style metrics

No decision yet on calculation method.  
Model should allow storing progress snapshots later without rewriting core project structure.

---

## 12. Multi-party construction reality

Real projects may include hierarchies:

```text
Client
  → Main contractor
    → Subcontractor
      → Lower-tier subcontractor
```

ProjectFlow’s user organization may play any role in that chain.  
The model should allow representing counterparties and vendor relationships.  
V1 UX must not assume every user is a heavy main contractor.

See `07-VENDORS-SUBCONTRACTORS.md`.

---

## 13. Non-goals for this model (now)

- Full construction schedule/Gantt engine
- Full BIM integration
- Public project collaboration portal for all parties on site
- Hardcoded trade checklists as mandatory core structure
- GC-only default workflows that burden simple trades/consultants

---

## 14. Related documents

- Flexible / optional usage → `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`
- Domain catalog → `02-DOMAIN-MODEL.md`
- Contracts/changes → `05-CONTRACTS-QUOTES-CHANGES.md`
- Financial overlay → `04-FINANCIAL-MODEL.md`
- Permissions → `12-USERS-ROLES-PERMISSIONS.md`
- V1 scope → `16-V1-SCOPE.md`
