# Owner expense classification review (corrected for 0070 backfill)

**Mode:** recommendations only — no DB mutation, no password.

**Rule:** Never auto-classify from description / notes / supplier free text. Structured `cost_category` + `classification_status` only.

**Backfill rule (0070 corrected):**
- `classified` iff `cost_category_id` present AND category.key ∉ {`labor`,`internal_employee_payroll`} AND category.family = expense.cost_family
- else `needs_classification` (amount still in Actual)

**Live Owner org simulation (READ-ONLY, 2026-08-27):**

| Status | Count |
|--------|------:|
| classified | **51** |
| needs_classification | **3** |
| Finalized | **54** |

### Needs classification (exact)

| Date | Description | Vendor | Cat | Note |
|------|-------------|--------|-----|------|
| 2026-02-27 | עובדים | התותחים | (null) | Keep in Project Actual; suggest subcontractor after Owner pick — do not infer from text |
| 2026-03-31 | — | התותחים | (null) | Same |
| 2026-03-01 | גילוי אש | קרני | labor | Legacy ambiguous `labor` → needs_classification; do NOT exclude for workforce; suggest `external_service` after review |

### Classified (summary by key)

| Key | Count |
|-----|------:|
| materials | 16 |
| shared_equipment | 15 |
| subcontractor | 6 |
| shared_logistics | 4 |
| vehicle_fuel | 3 |
| permits_electrical | 3 |
| software | 2 |
| office_supplies | 1 |
| rent | 1 |

> Earlier probe listed many rows as `(null)` and claimed 5/49. That probe was incomplete. Corrected numbers above match live `cost_categories` joins and the migration SQL rule.

### Policy highlights

- **התותחים + structured `subcontractor`** → classified; description `עובדים` ignored.
- **התותחים + null category** → needs_classification; still in Actual.
- **גילוי אש + `labor`** → needs_classification; still in Actual.
- No description-based auto classification.
