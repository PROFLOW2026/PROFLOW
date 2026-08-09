# 72 — V1 Database Blueprint

**Status:** Planning blueprint (not executable schema)  
**Phase:** No migrations / no DB created  
**Companion:** `71`, `74`, `77`

---

## 1. Conventions (all tenant-owned tables)

Unless marked **GLOBAL / SYSTEM**:

| Rule | Requirement |
|------|-------------|
| `organization_id` | `NOT NULL`, FK → `organizations` |
| PK | UUID |
| Soft delete | Prefer `archived_at` / `deleted_at` + status; no casual hard delete when referenced |
| Indexes | Always index `organization_id`; composite unique with org where natural |
| Audit | Sensitive mutations → `audit_events` |
| RLS | Enabled (see `74`) |
| Money | `numeric` + `currency` ISO; never float |
| Timestamps | `created_at`, `updated_at` `timestamptz`; business calendar as `date` |

**GLOBAL / SYSTEM** tables (no org): permission catalog, system role templates seed source, country-pack reference data as designed.

---

## 2. Identity / tenancy

### `profiles` (or `users`)
- `id` UUID PK = `auth.users.id`
- `email` (denormalized for display; Auth is source for login)
- `display_name`, `locale_preference`, `created_at`, …
- **Not tenant-owned** (user can belong to many orgs)
- No password hashes

### `organizations`
- `id`, `name`, `base_currency`, `timezone`, `country_code`, `default_locale`, settings JSON as needed
- Soft archive supported

### `organization_memberships`
- `id`, `organization_id`, `user_id` → profiles
- `status` (active/invited/suspended)
- Unique `(organization_id, user_id)`

### `permissions` (GLOBAL)
- `id` or stable `key` PK (`projects.read`, …)
- `description`, `category`

### `roles`
- Tenant-owned **or** system templates cloned per org
- **V1 recommendation:** org-scoped roles seeded from templates (`Owner`, `Manager`, `Worker`, `Finance`) with `template_key` + `organization_id`
- Unique `(organization_id, key)` where applicable

### `role_permissions`
- `role_id`, `permission_key`
- Unique pair

### `role_assignments`
- `organization_id`, `user_id` / `membership_id`, `role_id`
- Optional `project_id` for scoped grants (nullable = org-wide)
- Unique sensible composite

### `invitations`
- `organization_id`, `email`, `role_id` or template, `token_hash`, `expires_at`, `accepted_at`, `invited_by_user_id`
- Status lifecycle

### Active org context
- Prefer session/cookie **server-validated** against membership; optional `user_preferences.active_organization_id` cache only

---

## 3. Clients & shared contact patterns

### `clients`
- `organization_id`, name, status, optional legal fields, `archived_at`
- Client optional on Project (B6)

### Shared (not a Party superclass)
Reusable tables or embeddable patterns:

- `contacts` / `contact_persons` (polymorphic **link**: `owner_type` + `owner_id` **or** separate join tables `client_contacts`, `vendor_contacts` — prefer **typed join tables** in V1 for clarity)
- `addresses`
- `identifiers` (tax id, company number) with type enum

**F1:** No giant polymorphic Party entity as primary model.

---

## 4. Domains / services

### `organization_domains` (business services catalog)
- `organization_id`, name/key, enabled flag, sort

### `project_domains`
- Link project → domain; may reference org domain **or** ad-hoc name (B3)
- Optional promote copies/links into `organization_domains`

---

## 5. Projects structure

### `projects`
- `organization_id`, name, status (Draft/Active/On Hold/Completed/Cancelled/Archived)
- Optional `client_id`, currency (project path), dates, notes
- `archived_at`

### `work_packages`
- `organization_id`, `project_id`, name, `is_default`, sort
- ≥1 per project; default auto-created

### `phases`
- Optional under work_package: `organization_id`, `work_package_id`, name, dates, sort

---

## 6. Contracts & commercial

### `contracts`
- `organization_id`, `project_id`, `is_primary`, name/ref, status
- Unique: at most one primary per project (partial unique index)

### Contract value
Prefer:

### `contract_value_snapshots` or versioned fields
- Original / approved / current / pending derived or stored with clear rules
- History table if needed: `contract_value_events` (amount, currency, reason, effective_at, actor)

Exact derivation algorithm stays in domain services (`04`, `05`).

### `quotes`
- Linked to ChangeRequest / negotiation context
- `organization_id`, parent refs

### `quote_versions`
- Version number, amounts, tax snapshot fields when finalized, status, selected flag

### `change_requests`
- Statuses: Draft / Awaiting Approval / Approved / Rejected / Cancelled
- `sent_at` event (not a status)
- Links to project/contract; pending value impact fields

### `change_orders`
- Created/linked when CR approved; affects contract value
- `organization_id`, `change_request_id`, amounts, effective dates

### `approvals` (internal — C3)
- Target type/id (CR / QuoteVersion)
- Decision approved/rejected
- Approver text and/or linked party
- `decided_at`, notes
- Optional `evidence_document_id`

---

## 7. Vendors

### `vendors`
- `organization_id`, name, status
- Optional: `tier`, `parent_vendor_id` (self-FK, **no graph engine**), notes

### `vendor_engagements` (or project_vendors)
- `organization_id`, `vendor_id`, `project_id`, role/notes

---

## 8. Expenses & cost structure

### `cost_families` (GLOBAL enum/table)
- Direct / Shared / Business Overhead / Asset-Capital (canonical keys)

### `cost_categories`
- Org-scoped or system+org custom; maps to family

### `expenses`
- `organization_id`, amount, currency, date, supplier text or `vendor_id`
- Optional project/work_package/phase
- Family/category, status (draft/finalized), notes
- Soft archive; finalized correction via void/adjust (D5)

### `expense_allocations` (splits)
- `expense_id`, target (project / overhead bucket), amount or %, currency
- Sum integrity enforced in domain + DB checks where practical

### Overhead V1
- Support non-project expenses + allocation rows (manual amount/%)
- Defer advanced allocation engine tables

---

## 9. Workforce

### `employees`
- `organization_id`, name, status, optional `user_id` (nullable unique per org if set)
- **E2:** no login required

### `rate_versions`
- `employee_id`, `organization_id`, effective_from/to, base rate, unit, burden %, currency
- Historical integrity (E3)

### `labor_cost_components` (optional rows on rate version)
- Type/key, amount or %, effective with parent version

### `time_entries`
- `organization_id`, `employee_id`, date, hours/qty, project/wp/phase nullable
- Cost snapshot fields at entry time (rate version ref + computed cost)
- Non-project time: `time_code_id` optional

### `non_project_time_codes`
- Org-scoped codes (admin, training, …)

---

## 10. Billing

### `billing_records`
- Internal tracking (not statutory invoice issuer)
- `organization_id`, project, optional client, amounts, currency, dates, status (draft/finalized/void…)
- Links to changes/contract as needed
- External document reference / `document_id`

### `billing_lines` (if needed V1)
- Line description, amount, tax snapshot when finalized

### `payments`
- `billing_record_id`, amount, currency, date, method notes, status
- Outstanding = domain calculation from finalized billing − payments (define void rules)

---

## 11. Documents

### `documents`
- `organization_id`, storage_bucket, storage_path/key, mime, size, checksum
- `original_filename` (display only), uploaded_by, created_at
- Soft delete

### `document_links`
- `document_id`, `organization_id`, owner_type + owner_id (expense, approval, billing, project, …)
- Or typed FKs for V1 primary owners

---

## 12. Tax

### `tax_rules`
- Org or country-pack scoped; rate/method; effective dating

### `tax_overrides`
- Auditable overrides on draft docs

### Finalized snapshot
- Columns or `tax_snapshots` JSON/table on quote_version / billing_line / etc.: rule id, rate, basis, amounts, override flag (G1)

---

## 13. Audit & configuration

### `audit_events` (append-only)
- `organization_id` (nullable only for rare system-global events — prefer always set when tenant action)
- `actor_user_id`, action, entity_type, entity_id
- `before`/`after` JSONB (careful with PII)
- `created_at`
- **No updates/deletes** in normal app paths

### `organization_module_preferences`
- Module visibility / enable flags (U2)

### Settings
- Org settings columns or `organization_settings` key/value with typed keys

---

## 14. Quantity fields (G2)

Where commercial quantities exist (quote lines later, etc.):

- `quantity_entered` numeric  
- `unit_entered` text/enum  
- Optional `quantity_normalized`, `unit_normalized`

---

## 15. Wave scoping of tables

| Wave 0 must exist | Wave 1 adds | Wave 2+ |
|-------------------|-------------|---------|
| profiles, organizations, memberships, permissions, roles, role_permissions, role_assignments, invitations | clients, projects, work_packages, phases, contracts, CR/CO/quotes/approvals, expenses/allocations, vendors, employees/rates/time, billing/payments | richer tax UI, overhead tools, document UX depth |
| audit_events base | domain audit coverage | |
| documents metadata + storage path foundation | links from features | |
| org module prefs skeleton | | |

Do **not** create future CRM/PO/portal tables in V1.

---

## 16. Related

`02`, `04`–`07`, `11`–`13`, `74`, `77`
