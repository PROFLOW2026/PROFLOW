# 24 — Insurance, Compliance, Certifications & Licenses

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** V2–V3  
**Class:** Optional module + Country Pack hooks  
**Cross-reference:** `08-ASSETS-VEHICLES-INSURANCE.md`, `23-ASSETS-FLEET-MAINTENANCE.md`

---

## 1. Purpose

Plan insurance and compliance tracking that is jurisdiction-aware, attachable to many entity types, and never hardcoded to Israeli license lists in core.

---

## 2. Insurance policies

Types (examples, configurable):

- business insurance
- professional liability
- employer liability
- third-party liability
- vehicle
- equipment
- project insurance
- contractor works policies
- custom policies

Policy data:

- insurer, policy number, coverage amounts
- period start/end, premium cost (MoneyValue)
- documents
- coverage links
- allocation method for premium cost
- renewal reminders

Premiums feed Shared/Overhead/Direct allocation via existing financial patterns (`04`).

---

## 3. Licenses, certifications & compliance artifacts

Track:

- organization licenses
- professional certifications
- employee certifications
- subcontractor / vendor certifications
- expiry dates
- required documents
- project-specific compliance requirements
- renewal reminders
- missing document warnings
- validity periods
- jurisdiction / country sensitivity

### Requirement targets (polymorphic)

Compliance requirements may apply to:

- Organization
- Employee
- Vendor
- Project
- WorkPackage
- Asset
- Vehicle

### Conceptual entities

| Entity | Meaning |
|--------|---------|
| **ComplianceRequirementType** | Configurable requirement definition (Country Pack + org custom) |
| **ComplianceRequirement** | Applied requirement on a target |
| **ComplianceArtifact** | License/cert/policy evidence record |
| **ComplianceCheck** | Pass/fail/missing/expired evaluation snapshot |

---

## 4. Country Pack rule

**Do not hardcode Israeli licenses into core.**

Israel Pack (and future packs) may ship default requirement catalogs and document naming.  
Organizations can customize. Overrides and effective dating apply.

---

## 5. Notifications & portals

- expiry / missing document events → `26`
- vendors may upload certs via vendor portal → `25`
- field inspections may create compliance evidence → `22`

---

## 6. V1 impact

**No full module in V1.**  
Documents can already store insurance/cert files. Structured expiry/requirement engine is future.

---

## 7. Related documents

- Assets/insurance intro → `08`
- Fleet → `23`
- Country packs → `30`
- Vendors → `07`
- Notifications → `26`
- Capability map → `19`
