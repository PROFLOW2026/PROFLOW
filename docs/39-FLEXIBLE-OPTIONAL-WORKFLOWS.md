# 39 — Flexible Product Usage & Progressive Complexity

**Status:** Owner product principle — DECIDED 2026-08-09  
**Phase:** Planning only  
**Scope effect:** Defines **how** capabilities are consumed — does **not** expand V1 module list

---

## 1. Core principle

**ProjectFlow should offer many capabilities, but force users to configure as little as possible.**

The product adapts to the business.  
It does not force every business into the complete ProjectFlow model.

### Progressive Complexity

A user should start extremely simply and gradually enable deeper functionality — on the **same underlying product**.

#### Example — minimal path (self-employed electrician)

May use only:

- Projects
- Contract value
- Expenses
- Change Requests / extras
- Billing / payments
- Profit view (with honest coverage labeling)

May skip:

- Employees / timesheets
- Vendor registry
- Phases
- Equipment registry
- Advanced overhead configuration
- Inventory, CRM, portals, AI, etc.

#### Example — full path

Another organization may use all modules over time.

Both are first-class ProjectFlow users.

---

## 2. Internal mandatory ≠ user-configured

Some structural entities remain technically mandatory for consistency and reporting integrity.

### Canonical example (already decided — do not reverse)

**WorkPackage is mandatory internally.**

Every Project has ≥1 WorkPackage.

If the user creates a simple project and does not care about packages:

1. System auto-creates `Default / General` WorkPackage
2. UI may hide WorkPackage complexity until the user opts into multiple packages
3. User is not forced to name/configure packages up front

Apply this pattern elsewhere whenever safe:

| Layer | Rule |
|-------|------|
| Technical integrity | Keep required structure |
| UX | Auto-create defaults; hide until needed |
| User obligation | Only configure what they choose to use |

---

## 3. Optional capability usage

Availability ≠ obligation.

Unless logically required for a **specific action** the user is performing, these are not required for every org/project:

- Employees
- Time tracking
- Vendors / subcontractors
- Detailed clients
- Project phases
- Budgets
- Documents / expense documents
- Overhead allocations
- Detailed tax overrides
- Billing / payment tracking
- Assets / vehicles / insurance
- Inventory / procurement
- CRM / scheduling
- External portals
- AI/OCR
- Advanced reporting

Organizations may enable, ignore, or adopt later.

---

## 4. Flexible data capture — lightweight → structured

Where safe, allow lightweight entry first; upgrade later without recreate/delete.

### Vendor / supplier modes on an Expense

1. No supplier specified  
2. Supplier name as plain text information  
3. Existing Vendor linked  
4. New Vendor created from the transaction  

**Do not require Vendor creation merely to save an Expense.**

Upgrade path:

```text
Expense.supplier_name = "ABC Electrical Supplies"
  → prompt: Save / link as Vendor?
  → create/link Vendor
  → historical Expense remains valid and linked
```

### Employee / labor modes

| Mode | Meaning |
|------|---------|
| **A — No workforce tracking** | Costs from expenses/subs/etc. only |
| **B — Generic labor cost** | e.g. `Labor = 8,000` expense/line without employees |
| **C — Employee-level costing** | Employees → rates → burden → time → WP → True Cost |

Users may move A → B → C later without rewriting history destructively.

### Client flexibility

Project creation should not force complete legal customer master data.

Progressive enrichment:

- simple client name
- later address / tax ID / contacts / documents

#### Recommendation for “client not fully ready”

| Option | Recommendation |
|--------|----------------|
| Project with simple Client name only | **Allowed** |
| Project with internal/general placeholder Client | **Allowed** as org-configurable convenience |
| Project with client not yet assigned | **Allowed for drafts / early ops**; may be restricted when issuing customer-facing financial documents |

**Distinguish:**

- Project creation requirements (minimal)
- Legally significant billing/export requirements (Country Pack may add contextual fields)

Do not infect Project Core with invoice-only mandates.

---

## 5. Lightweight Project creation

Desired experience:

```text
+ New Project
→ Project name (primary user input)
→ Save
```

Optional enrichment (anytime):

- Client
- contract value
- profession/domain
- service
- location
- dates
- budget
- WorkPackages (or reveal multi-package UI)
- team
- documents
- tax settings
- billing settings

### Genuinely required (integrity / security)

| Requirement | Why |
|-------------|-----|
| Organization (tenant) ownership | Multi-tenant isolation |
| Project identity (name or equivalent label) | Human-referenceable record |
| Internal WorkPackage (≥1, auto default OK) | Costing/reporting consistency (hidden if unused) |
| Money amounts always carry Currency when money exists | Financial integrity |
| Actor/authz on writes | Security |

Almost everything else is optional at create time.

---

## 6. Fast expense capture

Simplest flow:

```text
+ Expense
→ amount
→ optional description
→ optional project
→ optional supplier (name or none)
→ save
```

Optional enrichment later:

- upload invoice/photo
- tax
- category / cost family
- WorkPackage (defaults to project’s default/general package)
- Vendor link / promote supplier name
- split allocation
- payment details
- notes

Country/org defaults may supply currency/tax defaults where safe.  
Simple flow must not depend on completing every accounting field.

---

## 7. Progressive disclosure UX

Hide advanced fields until relevant.

Patterns:

- Basic
- More details
- Advanced
- Optional

Example — Expense:

**Basic:** Amount, Supplier, Project, Save  
**Advanced:** Tax, Cost Family, Allocation, WorkPackage, Document, Payment Method, Custom fields, Notes

Apply across ProjectFlow forms.

---

## 8. Dynamic navigation / modules

Navigation should adapt to organization usage.

If employees are unused: do not emphasize Employees / Timesheets / Workforce Costs.  
If used: surface them.

Same principle for Procurement, Inventory, Assets, Fleet, Insurance, CRM, Scheduling, etc.

Possible future mechanisms (exact UX TBD):

- explicitly enabled/disabled modules
- auto-surface when first used
- recommendations from org profile / preset

Selections must remain changeable later.

---

## 9. Onboarding — minimal, not a gauntlet

**Do not** create a long mandatory setup wizard.

Suggested minimal path:

1. Create organization  
2. Choose country / language / default currency  
3. Optional business type / profession (preset defaults only)  
4. Enter product  

Optional prompt:

`What would you like to manage?`  
(Employees, Time, Suppliers, Overhead, Billing, Documents, …)

All choices changeable later. **No lock-in from onboarding.**

---

## 10. Presets, not restrictions

Profession/business selection customizes **defaults only**.

Users can remove, add, rename (where allowed), create custom, enable later.

Preset ≠ schema restriction.  
See `36-TEMPLATES-PRESETS.md`.

---

## 11. Financial truth with incomplete input

Critical rule:

Because modules are optional, ProjectFlow must **not** pretend calculations are complete when source data was never entered or configured.

### Bad

```text
True Profit = 80,000
```

(when workforce and overhead were never used)

### Good (conceptual)

```text
Estimated profit based on entered data: 80,000

Included:
✓ Direct expenses

Not included / not configured:
○ Workforce costs
○ Allocated overhead
```

Exact copy/UI later. Requirement is **transparency**.

---

## 12. Calculation / data coverage concept

Plan a generic explanation surface for metrics:

- calculation basis
- included cost families / inputs
- missing or unconfigured inputs
- last calculation timestamp
- forecast assumptions (when forecasts exist)

Possible future labels: `Cost coverage` / `Calculation completeness`.

Do **not** invent a misleading arbitrary “completeness %” unless there is a defensible method.  
Honesty > fake precision.

---

## 13. No punishment for unused modules

Unused capabilities must not produce:

- constant warning banners
- incomplete-setup blockers
- dashboard clutter
- “Employees: 0 — action required”
- meaningless zero widgets

Omit irrelevant widgets. Silence is correct UX for unused modules.

---

## 14. Upgrade path without data loss

Lightweight → structured without delete/recreate:

| From | To |
|------|----|
| Plain supplier name | Vendor entity |
| Generic labor expense | Employee/time True Cost later |
| Default WorkPackage | Split into multiple packages |
| Simple Client | Full legal/customer profile |
| Simple Project | Budget, phases, team, docs, billing |

Architecture should preserve links and history across upgrades.

---

## 15. Optional ≠ structurally unsafe

Contextual mandates remain for integrity/security/legal operations:

| Example | Why |
|---------|-----|
| Money amount needs currency | Financial integrity |
| Payment needs amount/date | Cash truth |
| Issued/export legally significant docs | Country Pack rules |
| Tax docs may need jurisdiction fields | Legal |
| Tenant ownership always | Security |

These must be:

- contextual (tied to the action)
- explained
- minimal

**Intended rule:** do not require optional business setup merely to use the product.  
**Not intended:** invalid financial or insecure records.

---

## 16. Country Pack compatibility

Flexibility remains compatible with Country Packs.

- Creating a Project may require very little
- Issuing/exporting a legally significant document may require more country-specific fields

Keep these separate.  
Country-specific mandates must not infect generic Project Core create flows.

---

## 17. Relationship to V1

This principle shapes V1 **UX and defaults**, not module expansion.

V1 still **supports** overhead, workforce True Cost, vendors, billing, etc.  
Users are **not forced** to configure/use all of them on day one.

See `16-V1-SCOPE.md` usage posture section.

---

## 18. Related documents

- Principles → `01-PRODUCT-PRINCIPLES.md`
- Domain / WP → `02`, `03`
- Financial coverage → `04`
- Workforce modes → `06`
- Vendors lightweight → `07`
- Expense capture → `09`
- V1 scope → `16`
- Configuration → `35`
- Presets → `36`
- Open questions → `18`
