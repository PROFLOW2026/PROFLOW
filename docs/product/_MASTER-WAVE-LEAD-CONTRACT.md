# Master Wave — Workforce + True Cost + Allocation

**Status:** BINDING  
**Commit / push / db:migrate / apply 0021:** FORBIDDEN  
**0000–0020:** IMMUTABLE  
**0021:** UNAPPLIED — Lead may replace/redesign entirely. Agents MUST NOT edit migrations.

## Product principle

Advanced workforce/cost is OPTIONAL. Simple mode (client/project/expenses/billing/basic time) must keep working without compensation, assignments, or allocations.

## Locked concepts (separate)

EMPLOYEE MASTER ≠ COMPENSATION HISTORY ≠ PROJECT ASSIGNMENT ≠ TIME ENTRY ≠ MONTHLY EMPLOYER COST ≠ COST ALLOCATION  

VENDOR ≠ VENDOR BILL ≠ VENDOR PAYMENT ≠ PROJECT COST ALLOCATION  

ASSIGNMENT ≠ Actual. PAYMENT ≠ Actual. Bill recognition may create Actual (existing AP rules).

## Agent ownership

| # | Owns | Must not |
|---|------|----------|
| 1 Compensation | Domain proposal + optional domain TS under workforce (no migration) | migrations, Actual formulas |
| 2 Temporal assignments | Domain proposal; may stub app against proposed types | migrations; create Actual from assignment |
| 3 Monthly true-cost | Accounting invariant + domain proposal | migrations; double-count labor |
| 4 Vendor allocation | Domain proposal reusing AP + expense allocation patterns | migrations; make payment Actual |
| 5 Mobile UX | UX structure + UI scaffolding if schema-agnostic | migrations; force advanced fields |
| 6 Contact FK audit | Proposal to fix composite ON DELETE SET NULL | edit 0021 SQL |
| 7 Perf | Dashboard warm + open-project RSC only | migrations; weaken finance |

## Lead owns

- Final coherent `0021_*.sql` + Drizzle schema
- Shared allocation invariants
- Integration after agent reports
- Reviewers + Full Gate + Hebrew report

## Delivery (each agent)

```
STATUS = COMPLETE | PARTIAL | BLOCKED
Proposal / files
Schema asks for Lead (tables/columns only)
Tests run
BLOCKER / HIGH / MEDIUM
```

Write proposals under `docs/product/_MASTER-WAVE-AGENT{N}-*.md`.
