# 25 — External Portals & Collaboration

**Status:** Future architecture planning  
**Phase:** Planning only  
**Timing intent:** Customer portal V2–V3; Vendor portal V3; e-sign Later  
**Class:** Optional module  
**Critical rule:** External collaborators are **not** ordinary internal Organization members

---

## 1. Purpose

Plan scoped external access for customers and vendors/subcontractors without weakening tenant isolation or internal permission models.

---

## 2. Identity model (architectural requirement)

Introduce a distinct concept such as:

| Concept | Meaning |
|---------|---------|
| **ExternalPrincipal** | Login identity for an outside person |
| **ExternalAccessGrant** | Scoped permission to specific objects |
| **PortalSession** | External authenticated session |

Do **not** reuse internal `OrganizationMembership` for customers/vendors by default.  
If a person is both external and later invited internally, link explicitly; do not collapse roles accidentally.

Least privilege and object-scoped grants are mandatory.

---

## 3. Customer portal

Possible abilities:

- view project summary (permissioned fields only)
- receive quote
- approve/reject quote
- approve Change Request / acknowledge Change Order (policy-dependent)
- see billing
- see outstanding amounts
- download documents
- upload requested documents
- view progress/photos
- communicate/comment
- e-signature later

### Data exposure rules

- Never expose internal True Cost, burden rates, or overhead allocation internals by default
- Show customer-appropriate commercial fields only
- All actions audited

---

## 4. Vendor / subcontractor portal

Possible abilities:

- receive RFQ
- submit quotation
- see assigned scope
- upload invoices
- upload insurance/certification documents
- report progress
- submit change request (vendor-side proposal)
- submit payment claim
- see requested corrections

Vendor portal actions create **candidate** records for internal review; they do not auto-post financial truth without internal acceptance rules.

---

## 5. Security requirements

- strict object scoping (project/WP/RFQ/etc.)
- tenant isolation unchanged
- separate permission vocabulary from internal roles
- document access mediated like internal files (`15`, `09`)
- rate limiting and abuse controls
- optional expiry of grants
- no lateral movement across customers/vendors

---

## 6. Relationship to core workflows

| Portal action | Internal result |
|---------------|-----------------|
| Customer approves sales/project quote | Acceptance event → conversion or contract baseline |
| Customer approves change | May satisfy approval step on ChangeRequest |
| Vendor submits quote | SupplierQuotation candidate (`21`) |
| Vendor uploads invoice | Document + AP candidate (`28`) |
| Vendor uploads cert | Compliance artifact candidate (`24`) |

---

## 7. V1 impact

**None.**  
V1 keeps internal users only; approvals can be recorded manually with uploaded evidence.

---

## 8. Related documents

- Users/roles → `12-USERS-ROLES-PERMISSIONS.md`
- Security → `15-SECURITY-MULTITENANCY.md`, `33-ENTERPRISE-SECURITY-GOVERNANCE.md`
- Contracts/changes → `05`
- Procurement → `21`
- Capability map → `19`
