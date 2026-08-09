# 13 — Audit, History & Data Integrity

**Status:** Draft for owner review  
**Phase:** Planning only

---

## 1. Purpose

Define how ProjectFlow preserves trust in historical data: audit trail, versioning, effective dating, soft delete/archive, and immutable financial concepts.

---

## 2. Why this is critical

The product’s promise depends on answering:

- Who changed this?
- What changed?
- When?
- From what → to what?
- Why (if provided)?

Especially for money, contracts, permissions, and taxes.

---

## 3. Audit Trail requirements

### Must cover (at least)

- money fields and financial documents
- contracts and contract value effects
- change requests / quote versions / approvals
- expenses and allocations
- employee rates and loaded cost parameters
- tax rules and overrides
- role/permission changes
- deletions/archives
- document upload/replace/delete events

### Audit event conceptual fields

- organization_id
- actor_user_id (or system actor)
- timestamp
- entity type + entity id
- action
- before snapshot / patch
- after snapshot / patch
- reason (optional/required by policy)
- request/session metadata (later)
- correlation id for multi-row changes

### Fork: storage style

- **Option A:** generic audit log table with JSON diff/snapshots  
- **Option B:** event-sourced domain where audit is the ledger  
- **Recommendation:** Option A for V1 speed + clarity; revisit event sourcing only if needed  
- **OWNER DECISION REQUIRED**

---

## 4. Versioning vs effective dating vs audit

These are related but different:

| Mechanism | Purpose |
|-----------|---------|
| **Audit trail** | Who changed what, for accountability |
| **Versioning** | Parallel versions of a business artifact (e.g. Quote V1/V2) |
| **Effective dating** | Which configuration applied on which date |
| **Immutability policy** | Which issued records cannot be silently rewritten |

All four appear in ProjectFlow.

---

## 5. Effective-dated configuration

Use for values that affect calculations over time:

- taxes
- employee rates / burden
- vendor prices (where tracked)
- insurance premiums/allocations
- allocation methods
- business parameters
- other calc-driving settings

Rule: a future change must not silently alter past meaning.

---

## 6. Immutable financial concepts

Candidates for strong immutability after issuance/approval:

- issued quote versions
- approved change orders’ commercial effect records
- issued invoices
- recorded payments (corrections via reversal/adjustment)
- tax snapshots on issued docs

### Correction style fork

- **Option A:** edit in place with audit  
- **Option B:** reversing documents + new documents  
- **Recommendation:** Option B for invoices/payments; controlled amendments for drafts; never delete approved commercial history  
- **OWNER DECISION REQUIRED**

---

## 7. Soft delete / archive policy (proposed)

For meaningful entities, prefer:

- archive / soft delete
- hide from default UI
- retain for history and restore under permission

Hard delete may be reserved for:

- pure drafts never used
- spam/erroneous uploads under policy
- legal deletion requests (with careful process)

### Proposed default posture

| Entity class | Proposed default |
|--------------|------------------|
| Projects, clients, vendors, employees | Soft delete / archive |
| Issued financial docs | No hard delete; void/cancel states |
| Quote versions | Immutable; supersede by new version |
| Time entries | Soft delete + audit |
| Documents | Soft delete; storage retention policy TBD |
| Audit events | Append-only; no delete |

**Not a final per-entity legal policy.** Country packs and owner decisions may refine this.

**OWNER DECISION REQUIRED** on restore windows and hard-delete admin tools.

---

## 8. Referential integrity of business meaning

Deleting/archiving a vendor used on historical invoices must not destroy invoice meaning.  
Historical screens should still show names/snapshots as needed.

Consider storing display snapshots for critical party names on issued documents.

---

## 9. Recalculation policy

When configuration changes:

- draft calculations may refresh
- issued/final values remain
- optional explicit “recalculate period” tools later for non-issued analytics

Never hide that a number is recalculated vs original.

---

## 10. V1 recommendation

Must have:

- audit log for sensitive entities
- quote version immutability
- contract value history
- soft delete for major master data
- tax/rate effective dating

Defer:

- full event sourcing
- advanced legal hold workflows
- user-facing full forensic explorer (basic history views may suffice)

---

## 11. Related documents

- Contracts → `05-CONTRACTS-QUOTES-CHANGES.md`
- Tax → `11-TAX-CONFIGURATION.md`
- Security → `15-SECURITY-MULTITENANCY.md`
- Open questions → `18-OPEN-QUESTIONS.md`
