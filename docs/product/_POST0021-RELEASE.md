# POST-0021 Workforce Release

**תאריך:** 2026-08-10  
**Commit:** `ade9c06c6c8b9867d99e534f61094692a898a8e1`  
**db:migrate בזמן שחרור:** לא הורץ

```
POST-0021 WORKFORCE RELEASE = RELEASED
FINAL STATUS = PASS
```

---

## Released

| פריט | |
|------|--|
| Performance improvements | YES |
| Global click feedback | YES |
| Expense VAT | YES |
| Project page ordering | YES |
| Project-specific contacts | YES |
| Employee creation | YES |
| Employee assignments | YES |
| Project Team | YES |
| Compensation history | YES |
| Monthly employer cost | YES |
| Cost allocation | YES |
| Labor displacement | YES |
| Unallocated workforce cost | YES |
| Vendor/subcontractor allocations | YES |
| Vendor Payment separation | YES |
| Worker compensation security | YES |
| Mobile UX | YES |
| Optionality | YES |

---

## Migration

| | |
|--|--|
| Migration 0021 already applied to Supabase | **YES** |
| Migration 0021 committed | **YES** (`0021_workforce_contacts_and_allocations.sql` + journal) |
| 0000–0021 modified after application | **NO** |
| EMPLOYEE_MONTH_COSTS_READY | **true** |
| AP_BILL_PROJECT_ALLOCATIONS_READY | **true** |

---

## Git / CI / Vercel

| | |
|--|--|
| Files committed | **301** |
| Unrelated staged | **0** |
| Unexpected staged | **0** |
| Secrets staged | **0** |
| Commit hash | `ade9c06c6c8b9867d99e534f61094692a898a8e1` |
| Push origin/main | **YES** |
| HEAD = origin/main | **YES** |
| GitHub CI | **PASS** |
| GitHub CI run ID | **31431526640** |
| Vercel | **SUCCESS** (Production deployment `5839837963`) |

Release gate (pre-commit): TypeScript / Lint / Unit(1095) / UI(86) / Integration(163) / Build / Playwright desktop+mobile+worker(77) = **PASS**

---

## Remaining

**BLOCKER:** אין

**HIGH:** Open-project repeated ≈**1002ms** (יעד &lt;700; מאושר לשחרור לבדיקות live)

**MEDIUM:** Dependabot דיווח 2 moderate על ה-repo (קיים; לא חלק מגל זה)
