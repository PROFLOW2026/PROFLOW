# 02 — Domain Model

**Status:** Draft conceptual model with owner decisions applied (not a final database schema)  
**Phase:** Planning only  
**Owner decision batch:** 2026-08-09

---

## 1. Purpose

Catalog the major entities ProjectFlow must understand, their meaning, and first-pass relationships.

This is **not**:

- a SQL schema
- a final API contract
- a final naming standard

Working names may change after further review.

---

## 2. Modeling principles

1. Prefer clear business meaning over premature normalization debates.
2. Separate **people**, **organizations**, and **memberships**.
3. Treat money as structured values (amount + currency).
4. Prefer links/associations over duplicated blobs.
5. Preserve history for financially meaningful records.
6. Allow custom taxonomy (domains, services, roles) per organization.
7. Keep construction-specific ideas as vertical extensions where possible.
8. **Every Project has at least one WorkPackage** (system may auto-create a default/general package; UI may hide until multi-package is used).
9. **Progressive complexity:** support lightweight fields that can upgrade to structured entities later (e.g. supplier name → Vendor) without data loss. See `39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`.

---

## 3. Entity catalog (conceptual)

### 3.1 Identity & tenancy

| Entity | Meaning |
|--------|---------|
| **User** | Authenticated person |
| **Organization** | Business tenant / workspace |
| **OrganizationMembership** | Link of user ↔ organization |
| **Role** | Named bundle of permissions (org-level and/or custom) |
| **Permission** | Atomic capability (e.g. `project.financials.read`) |
| **RoleAssignment** | Membership + role (+ optional scope) |
| **Invitation** | Pending invite to join an organization |

### 3.2 Taxonomy / configuration

| Entity | Meaning |
|--------|---------|
| **ProfessionDomain** | Trade/domain such as Electrical, Plumbing, Design |
| **ServiceType** | Design, Consulting, Execution, Supervision, Maintenance, etc. |
| **ProjectRoleType** | Main contractor, Subcontractor, Consultant, Supplier, etc. |
| **DeliveryMode** | Internal team, Subcontractor, Supplier, Mixed, Client-supplied, TBD |
| **OrganizationDomainSetting** | Domains an organization offers |
| **CountryPack** | Country-level configuration bundle |
| **LocaleSetting** | Language / formatting preferences |
| **UnitSystemPreference** | Metric / imperial display preferences |
| **TaxRule** | Jurisdiction tax definition with effective dates |
| **TaxOverride** | Override at business / project / document / line level |

### 3.3 Commercial structure

| Entity | Meaning |
|--------|---------|
| **Client** | Customer organization or person buying work |
| **Project** | Engagement / job under a client |
| **ProjectDomain** | Domains active on a specific project |
| **WorkPackage** | Mandatory operational/commercial slice inside a project (≥1) |
| **Phase** | Optional stage under a work package (V1-supported, optional) |
| **Task / Activity** | Deferred deeper WBS units (not V1 depth) |
| **Contract** | Commercial agreement for a project (or package) |
| **ContractValueSnapshot** | Historical view of contract value components |
| **Quote** | Commercial offer (project-level or change-level) |
| **QuoteVersion** | Immutable version of a quote |
| **ChangeRequest** | Request/pricing/negotiation workflow object |
| **ChangeOrder** | Approved commercial change that affects contract value |
| **Approval** | Approval action/record on a workflow item |
| **BillingTerm** | Pricing model terms (fixed, hourly, mixed, etc.) |
| **Milestone** | Billable or schedule milestone |
| **BillingRecord** | Basic outgoing client billing record (V1; not statutory issuance suite) |
| **Payment** | Cash movement against billing records / obligations |

### 3.4 Parties & delivery

| Entity | Meaning |
|--------|---------|
| **Vendor** | Optional structured external company (supplier and/or subcontractor) |
| **SupplierName (lightweight)** | Plain-text supplier on Expense/transaction before/without Vendor entity |
| **VendorEngagement** | Contracted relationship of vendor to project/package |
| **Employee / Worker** | Optional internal workforce record (may link to User) |
| **EmploymentTerms** | Engagement type and compensation structure |
| **RateCard / RateVersion** | Effective-dated rates and loaded-cost parameters |
| **LaborCostComponent** | Optional/additional true-cost components (V1 optional; richer later) |
| **TimeEntry** | Reported time against project/package/phase or non-project code |
| **NonProjectTimeCode** | Office, warehouse, training, travel, management, etc. |

### 3.5 Costs, billing, cash

| Entity | Meaning |
|--------|---------|
| **CostRecord** | Any cost event/record |
| **CostCategory** | Classification of cost |
| **CostFamily** | Direct / Shared / Overhead / Asset-capital |
| **Expense** | Purchased expense; Vendor link optional; supplier name optional; document optional; may be non-project |
| **ExpenseAllocationLine** | Split of one expense across projects/packages/overhead/categories |
| **AllocationRule** | How shared/overhead costs are distributed (V1: manual amount / %) |
| **AllocationRun** | Result of applying allocation for a period/context |
| **BillingRecord** | Outgoing billed amount record (basic AR tracking) |
| **BillingRecordLine** | Optional line detail inside billing record |
| **Payment** | Payment received (or paid, by direction) |
| **OutstandingPosition** | Derived or stored outstanding (Invoiced − Paid ± adjustments) |
| **Budget** | Planned amounts at project/package/category levels |
| **RevenueRecognitionEvent** | Future/post-V1 explicit recognition (not used as V1 UI “Revenue”) |

> V1 does **not** present accounting-grade “Revenue” unless a definition is explicit. Prefer Contract Value / Invoiced / Paid / Outstanding / Cost / Forecast Profit labels.

### 3.6 Assets & insurance

| Entity | Meaning |
|--------|---------|
| **Asset** | Equipment / tool / capital item (full module later) |
| **Vehicle** | Specialized asset with vehicle-specific fields (later) |
| **AssetAssignment** | Who/where an asset is assigned |
| **MaintenanceEvent** | Service, repair, inspection |
| **InsurancePolicy** | Insurance contract (full module later) |
| **InsuranceCoverageLink** | What the policy covers |

V1 needs expense categorization readiness for asset/capital-related costs even if full asset registry is deferred.

### 3.7 Documents & capture

| Entity | Meaning |
|--------|---------|
| **Document** | File metadata record |
| **DocumentLink** | Association of one document to one or more entities |
| **DocumentType** | Contract, invoice, photo, insurance, plan, etc. |
| **CaptureJob** | Future OCR/AI processing job |
| **CaptureExtraction** | Proposed extracted fields from capture |
| **StorageObject** | Pointer to binary object in file storage |

### 3.8 Cross-cutting

| Entity | Meaning |
|--------|---------|
| **MoneyValue** | Amount + currency (embedded value object; always) |
| **AuditEvent** | Who/what/when/from/to for important changes |
| **EffectiveDatedConfig** | Generic pattern for dated configuration |
| **SoftDeleteMetadata** | Archived/deleted markers where applicable |
| **Notification** | User/system notification record |
| **BackgroundJob** | Async work record |

---

## 4. Relationship sketch (first pass)

```text
User ---< Membership >--- Organization
Organization ---< Client
Client ---< Project
Organization ---< ProfessionDomain (custom + presets)
Project ---< ProjectDomain
Project ---< WorkPackage (≥1, default/general allowed)
WorkPackage ---< Phase (optional)
WorkPackage --- Domain / ServiceType / DeliveryMode / ProjectRoleType
Project --- Contract
Contract --- ContractValue history
Project ---< ChangeRequest ---< QuoteVersion
ChangeRequest --(on approval)--> ChangeOrder
ChangeOrder affects Contract Value (+ may touch multiple WorkPackages)
Organization ---< Employee
Employee ---< RateVersion (+ optional LaborCostComponents)
Employee ---< TimeEntry >--- Project / WorkPackage / Phase / NonProjectTimeCode
Organization ---< Vendor
Vendor ---< VendorEngagement >--- Project / WorkPackage
Project / WorkPackage / Org ---< CostRecord / Expense
Expense ---< ExpenseAllocationLine (projects and/or overhead)
Shared/Overhead --- AllocationRule/Run --> Project / WorkPackage
Project ---< BillingRecord ---< Payment
Outstanding derived from BillingRecord + Payment
Organization ---< Asset / Vehicle / InsurancePolicy (later full modules)
Any major entity ---< DocumentLink >--- Document --> StorageObject
Sensitive changes --> AuditEvent
```

---

## 5. Important distinctions

### 5.1 User ≠ Employee ≠ Vendor contact

- **User**: login identity
- **Employee/Worker**: workforce cost & time subject
- **Vendor**: external company entity
- A person might eventually be more than one of these; do not force them to be the same record.

### 5.2 Domain ≠ ServiceType ≠ ProjectRole ≠ DeliveryMode

| Concept | Example |
|---------|---------|
| Profession domain | Electrical |
| Service type | Execution |
| Project role | Subcontractor |
| Delivery mode | Internal team |

These must remain independent axes.

### 5.3 Quote ≠ Change Request ≠ Change Order ≠ Billing Record

| Concept | Meaning |
|---------|---------|
| Quote | Priced offer, versioned |
| Change Request | Negotiation/pricing workflow |
| Change Order | Approved commercial amendment affecting contract value |
| Billing Record | Basic outgoing billed amount tracking (V1) |

### 5.4 Contract value ≠ invoiced ≠ paid ≠ outstanding

Do not collapse these. “Revenue” is not a default V1 label.

See `04-FINANCIAL-MODEL.md` and `05-CONTRACTS-QUOTES-CHANGES.md`.

### 5.5 WorkPackage is mandatory internally (UX may hide it)

- Complex projects: many packages (Electrical, Plumbing, HVAC, Architecture, Safety, …)
- Simple projects: one auto `Default / General` package
- Progressive-complexity rule: **internal mandatory ≠ user must configure it** (`39`)

### 5.6 Lightweight vs structured parties

- Expense may exist with no supplier, plain supplier name, or linked Vendor
- Labor cost may exist as generic expense without Employee records
- Client profile may start minimal and enrich later

---

## 6. Modeling forks status

### 6.1 Is `WorkPackage` mandatory on every project?

- **Status:** DECIDED (2026-08-09); UX clarification DECIDED (2026-08-09 progressive-complexity)  
- **Decision:** Yes (≥1). Auto default/general package allowed; UI may hide until multi-package use.

### 6.2 Are Contract and Project 1:1?

- **Status:** OPEN  
- **Option A:** One primary contract per project  
- **Option B:** Multiple contracts per project  
- **Recommendation:** Support multiple in the model; V1 UI may start with one primary  
- **OWNER DECISION REQUIRED**

### 6.3 Vendor model shape

- **Status:** OPEN  
- **Option A:** Single `Party` model with types  
- **Option B:** Separate `Client`, `Vendor`, with shared profile capabilities  
- **Recommendation:** Separate business concepts with shared address/contact patterns  
- **OWNER DECISION REQUIRED**

### 6.4 Employee linked to User

- **Status:** OPEN  
- **Option A:** Optional link  
- **Option B:** Every employee must be a user  
- **Recommendation:** Option A  
- **OWNER DECISION REQUIRED**

### 6.5 V1 work breakdown depth

- **Status:** DECIDED (2026-08-09)  
- **Decision:** Project → WorkPackage → optional Phase. Task/Activity/WBS/Gantt deferred.

More decision detail: `18-OPEN-QUESTIONS.md`.

---

## 7. What is intentionally not finalized

- Table names
- Primary keys / IDs strategy details beyond needing stable IDs
- Event-sourcing vs CRUD+audit implementation
- Exact enum lists
- Whether derived financial positions are stored or computed
- Final Hebrew/English business terminology per entity
- Exact cloud/auth/storage providers

---

## 8. Related documents

- Business/project structure → `03-BUSINESS-PROJECT-MODEL.md`
- Money model → `04-FINANCIAL-MODEL.md`
- Contracts/changes → `05-CONTRACTS-QUOTES-CHANGES.md`
- Workforce → `06-WORKFORCE-COSTS.md`
- Vendors → `07-VENDORS-SUBCONTRACTORS.md`
- V1 scope → `16-V1-SCOPE.md`
