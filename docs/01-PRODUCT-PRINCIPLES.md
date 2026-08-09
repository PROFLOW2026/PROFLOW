# 01 — Product Principles

**Status:** Draft with owner direction applied (2026-08-09)  
**Phase:** Planning only

---

## 1. Purpose of this document

Defines the product rules that constrain design and future implementation.  
If a feature conflicts with these principles, the principle wins unless the owner explicitly changes it.

---

## 2. Core product rules

### 2.1 Plan wide — develop gradually

- Architecture and domain model must anticipate future modules.
- V1 must remain a **useful, narrow slice**.
- Absence from V1 is not absence from the model.

### 2.2 General core + vertical pack

- Core entities must model project-based businesses generally.
- Construction / built-environment concepts are a **vertical layer**, not the only possible universe.
- Do not hardcode UX or data to one trade (e.g. electrician-only fields as required core fields).

### 2.3 Configuration-first

Prefer:

- configurable domains / service types
- configurable roles and permissions
- configurable tax rules
- configurable units, currencies, terminology
- country packs

Avoid:

- hardcoded Israeli assumptions in core
- hardcoded tax percentages
- hardcoded profession workflows as the only path

### 2.4 Global-first, Israel-first delivery

| Layer | Rule |
|-------|------|
| Product core | Country-agnostic |
| Canonical language (keys / source copy) | English |
| First shipped UI | Hebrew |
| First country pack | Israel |
| Money | Amount + currency always |
| Text / locale | Never assumed to be Israel-only |

### 2.5 Historical integrity

Never silently overwrite history for:

- contract values
- quote versions
- tax rates
- employee rates
- approved financial documents
- permission-sensitive changes

Use effective dating, versioning, and audit trails.

### 2.6 Separate financial concepts

Do not collapse these into one number:

- Original contract value
- Approved changes
- Current contract value
- Pending changes
- Invoiced amount
- Paid amount
- Outstanding amount
- Direct cost
- Shared / business overhead
- Allocated overhead
- Actual cost to date
- Estimated / forecast final cost
- Estimated / forecast profit
- “Revenue” only when explicitly defined (not a casual V1 label)

### 2.7 True cost over naive cost

Labor cost is not only base wage.  
Aim for **fully loaded / true cost** over time (employer costs, benefits, tools, etc.), even if V1 starts simpler.

### 2.8 Document-aware from day one

Files are first-class.  
Metadata lives in the database; binary content lives in storage.  
A document may link to multiple contexts.

### 2.9 Mobile-field reality

V1 can be responsive web only, but key field actions must be designed for phone use:

- time entry
- expense / invoice capture
- site photos
- change request creation
- approvals

### 2.10 Security and tenancy are not optional

Organization A must never read or mutate Organization B data.  
This is a product principle, not only an infrastructure detail.

### 2.11 Progressive complexity / optional capability usage (DECIDED 2026-08-09)

**Offer many capabilities; force as little configuration as possible.**

- Users start simple and adopt depth over time on the same product.
- **Internal mandatory ≠ user must manually configure it** (e.g. auto Default WorkPackage, hidden until multi-package is used).
- Module availability is not module obligation.
- Prefer lightweight capture with upgrade-to-structured paths (supplier name → Vendor, generic labor → employees/time).
- Progressive disclosure in UX; adaptive navigation; minimal onboarding (no long mandatory wizard).
- Presets customize defaults only — never schema restrictions.
- Financial metrics must disclose calculation basis / missing inputs; never fake “True Profit” completeness.
- Do not punish unused modules with banners, blockers, or clutter.
- Optional usage must not create invalid money/security records; contextual mandates stay minimal and explained.

Full detail: [`39-FLEXIBLE-OPTIONAL-WORKFLOWS.md`](./39-FLEXIBLE-OPTIONAL-WORKFLOWS.md)

---

## 3. What we do

- Help project-based businesses track work, money, people, vendors, and changes — at the depth they choose.
- Preserve financial and contractual history.
- Support custom professions, services, and terminology.
- Design for Hebrew/RTL first delivery with English-canonical i18n.
- Keep the door open for additional countries and verticals.
- Prefer soft archive / controlled deletion for meaningful records.

---

## 4. What we do not do (at least not as core identity)

- Become a full ERP / payroll / statutory accounting replacement in V1.
- Become CAD / BIM authoring software.
- Become a marketplace for finding contractors.
- Become a government permitting system.
- Hardcode one profession’s workflow as the product.
- Force every organization through the complete module surface.
- Ship AI/OCR as a V1 dependency (design for it; do not require it).
- Assume all money is ILS.
- Assume all measurements are metric-only forever.
- Use only `admin` / `user` roles.
- Present incomplete financial views as fully loaded “true” results without disclosure.

---

## 5. Modularity principles

### Module categories (conceptual)

| Category | Examples | V1 expectation |
|----------|----------|----------------|
| Core identity | Org, users, roles, clients, projects | Required |
| Commercial | Contracts, quotes, ChangeRequest, ChangeOrder | Required (simplified) |
| Costing | Direct/shared/overhead/capital expense families, labor time, True Cost | Required |
| Billing (basic) | Outgoing billing records, payments, outstanding | Required (not statutory suite) |
| Vendors | Subcontractors / suppliers as entities | Partial |
| Documents | Upload + attach | Required (basic) |
| Allocation | Manual amount + manual % for shared/overhead | Required (simple) |
| Advanced allocation engine | Hours/revenue/duration/etc. automation | Deferred |
| Assets / vehicles | Full equipment registry | Deferred (expense categorization in V1) |
| Insurance module | Full policies module | Deferred or minimal |
| OCR / AI capture | Invoice extraction | Deferred |
| Advanced forecasting | Predictive alerts | Deferred |
| Native mobile apps | iOS / Android | Deferred |
| Extra country packs | US / UK / etc. | Deferred |

Modules may be packaged later as:

- always-on core
- optional modules
- country packs
- vertical packs

**OWNER DECISION REQUIRED** on packaging/commercial packaging model. See `18-OPEN-QUESTIONS.md`.

---

## 6. Global-first checklist for every future feature

Before accepting a feature into design:

1. Does it assume one country?
2. Does it assume one currency?
3. Does it hardcode UI text?
4. Does it hardcode tax?
5. Does it hardcode units?
6. Does it break RTL?
7. Does it destroy history when values change?
8. Does it leak across tenants?
9. Does it assume one profession?
10. Can a simpler V1 exist without blocking the full design?

If any answer is risky, redesign before implementation.

---

## 7. Configuration-first examples

| Instead of... | Prefer... |
|---------------|-----------|
| “Electrician project type” as core enum only | Organization domains + project-selected domains |
| VAT = 17% constant | Tax rules with effective dates + overrides |
| Role = admin/user | Role templates + permissions + optional project scope |
| Status labels hardcoded in components | Translation keys + configurable status model where needed |
| Soft-coded Israel address fields in core | Address model + country pack formats |

---

## 8. Decision discipline

When multiple approaches exist:

1. Document Option A / Option B (and more if needed).
2. List pros / cons.
3. Provide a recommendation.
4. Mark `OWNER DECISION REQUIRED`.
5. Do **not** pretend a choice was finalized.

This documentation set follows that rule.

---

## 9. Related documents

- Overview → `00-PROJECT-OVERVIEW.md`
- V1 scope → `16-V1-SCOPE.md`
- Open questions → `18-OPEN-QUESTIONS.md`
