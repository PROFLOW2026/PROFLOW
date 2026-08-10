# Pre-0021 Closure — Lead Contract

**Status:** BINDING  
**Commit / push / db:migrate / apply 0021:** FORBIDDEN  
**0000–0020:** IMMUTABLE  
**0021:** UNAPPLIED — **LEAD ONLY** may edit `drizzle/migrations/0021_workforce_contacts_and_allocations.sql`

## Locked economic rules

EMPLOYEE MASTER ≠ COMPENSATION ≠ ASSIGNMENT ≠ TIME ≠ MONTH COST ≠ ALLOCATION  
VENDOR ≠ BILL ≠ BILL ALLOCATION ≠ PAYMENT  

Assignment ≠ Actual. Payment ≠ Actual. Known employer cost appears once (Displacement).  
100% known = Σ project lines + visible unallocated.  
Bill allocations ≤ recognized bill NET (existing AP authority).

## Agent ownership (no shared-file fights)

| Agent | Owns | Must not |
|-------|------|----------|
| 1 Integrity | Proposal doc + disposable concurrency/integrity **tests** (under `tests/`) | Edit `0021_*.sql`; invent 0022 |
| 2 Permissions | App permission asserts, catalog/role defaults, worker tests; **RLS proposal text for Lead** | Edit 0021 SQL; invent parallel auth |
| 3 UX | Workforce/AP UI + locales + actions (schema-agnostic or behind existing types) | Migrations; force advanced fields; payroll/net |
| 4 Perf | Measure production Playwright; fix dashboard/open-project RSC only | Migrations; weaken finance; fake with spinners |

## Lead owns

- Final edits to `0021_workforce_contacts_and_allocations.sql` + Drizzle sync
- Integrating Agent 1 SQL asks + Agent 2 RLS policies into 0021
- Reviewers + Final Gate + Hebrew pre-migration report

## Delivery format (each agent)

```
STATUS = COMPLETE | PARTIAL | BLOCKED
Proposal / files
Schema asks for Lead (exact SQL intent)
Tests run
BLOCKER / HIGH / MEDIUM
```

Write under `docs/product/_PRE0021-AGENT{N}-*.md`.
