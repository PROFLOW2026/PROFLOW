# Owner QA Wave — Lead Contract

**Status:** BINDING  
**Commit / push / db:migrate:** FORBIDDEN  
**Migrations 0000–0020:** IMMUTABLE  
**New schema:** 0021+ only after Lead confirms necessity; DO NOT APPLY  

## Goals (owner findings)

1. Site-wide performance (server wait / DB / client / network — not spinner theater)
2. Global immediate press + async feedback via shared primitives
3. Expense VAT inclusive/exclusive — reuse existing tax engine only
4. Project Overview: daily tabs above setup utilities
5. Client/project contact person — reuse existing client_contacts
6. Employee create + project assignment UX clarity — no double labor cost

## File ownership (no overlap)

| Agent | Owns | Must not touch |
|-------|------|----------------|
| **1 Performance** | Data loaders, page.tsx server queries, parallelization, lazy mounts, prefetch — prefer `src/app/**` load paths + module `application/list-*` / repositories called from pages. May touch shared fetch helpers under `src/shared/**` if clearly performance-only. | Button UI redesign, VAT form UX, project overview layout order, employee forms |
| **2 Click feedback** | Shared UI primitives (`src/components/ui/**`, shell nav, shared buttons/links), plus systematic raw-button conversions across app | Financial formulas, schema, expense tax math |
| **3 Expense VAT** | `src/modules/expenses/**`, expense create/edit UI under `src/app/**/expenses/**`, expense tax tests | Project overview layout, employee assignment |
| **4 Project order** | Project workspace / overview / tabs UI under `src/app/**/projects/**` (+ shared project panel pieces only as needed for order) | Expense tax, employee domain |
| **5 Contacts** | `src/modules/clients/**` (+ contacts), client/project create forms | Expense tax, employee cost |
| **6 Employees** | `src/modules/workforce/**` / employees UI, project team assignment if exists | Expense tax, performance batching ownership |

Lead owns: migration numbering if 0021 needed, financial non-negotiables, final integration, report.

## Financial non-negotiables

- Actual Cost profitability = NET
- No stale financial caching
- No alternate VAT formulas — reuse tax engine
- Employee assignment ≠ labor Actual (time/labor rules only)

## Delivery format (each agent)

```
STATUS = COMPLETE | PARTIAL | BLOCKED
Files changed
Schema change required = YES/NO (propose only)
Tests run
Known limitations
BLOCKER / HIGH / MEDIUM
```

NO COMMIT. NO PUSH. NO db:migrate.
