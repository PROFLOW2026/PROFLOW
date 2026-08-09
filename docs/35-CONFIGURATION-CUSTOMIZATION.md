# 35 — Configuration & Customization

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** foundational config in V1; custom fields / deeper builders V2–V3  
**Class:** Core extension  
**Hard rule:** Do not turn ProjectFlow into an uncontrolled no-code database

---

## 1. Purpose

Plan controlled customization that improves fit per organization without destroying canonical domain meaning, reporting integrity, or upgradeability.

Aligned with progressive complexity (`39`):

- configure as little as possible to start
- enable depth later
- presets and module preferences are changeable
- unused capabilities stay quiet (no punishment UX)

---

## 1.1 Module / capability preferences

Future configuration may include:

- explicitly enabled/disabled capability areas
- auto-surface when first used
- recommendations from org profile / preset

Navigation and empty-state widgets should respect these preferences.  
Onboarding checkboxes (Employees, Time, Suppliers, Overhead, Billing, Documents, …) must never permanently lock the org.

---

## 2. Customizable areas (future/progressive)

- custom profession domains
- service types
- roles / permission bundles
- expense categories
- WorkPackage templates
- phases
- statuses (where safe)
- document types
- cost components
- notification rules
- terminology
- custom fields

---

## 3. Canonical vs customizable

### Stay canonical (stable meaning)

- Organization, User, Membership
- Client, Project, WorkPackage
- Contract value components
- ChangeRequest / ChangeOrder
- MoneyValue
- CostFamily concepts
- BillingRecord / Payment / Outstanding separation
- Tax override ladder mechanics
- AuditEvent
- Tenant isolation rules

### Safe to customize (labels/presets/values)

- display names / terminology
- domain/service catalogs
- category lists
- templates
- non-financial statuses ( cautiously )
- optional attributes via custom fields
- notification thresholds/templates

### Customize only with governance

- financial statuses that affect integrity
- tax behavior
- permission capabilities (can group, not invent unsafe bypasses)

---

## 4. Custom fields

Possible types:

- text
- number
- money
- date
- select
- multi-select
- boolean
- relation/reference

### Rules

1. Custom fields attach to allowed entity types only.
2. Custom fields are not a substitute for canonical commercial fields.
3. Permissions can hide sensitive custom fields.
4. Reporting support may lag and should be explicit.
5. Avoid unbounded per-row schema explosions (meta storage strategy TBD at implementation).

---

## 5. Configuration packaging

Sources of defaults:

- system presets
- Country Pack defaults
- Vertical presets
- Organization settings
- Project overrides where appropriate

Effective dating applies when configuration changes calculation outcomes.

---

## 6. V1 impact

V1 already needs org-custom domains/services and role templates.  
Full custom-field builder and status designers are not required in V1.  
V1 UX should still follow progressive disclosure and avoid forcing unused module setup (`39`, `16`).

---

## 7. Related documents

- Flexible workflows → `39`
- Domain model → `02`
- Users/roles → `12`
- Country packs → `30`
- Templates → `36`
- Capability map → `19`
