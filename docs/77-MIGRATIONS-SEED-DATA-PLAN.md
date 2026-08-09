# 77 — Migrations & Seed Data Plan

**Status:** Planning blueprint  
**Locked:** Drizzle + Git SQL migrations; no `push` as production authority  
**Phase:** No migrations executed yet

---

## 1. Authoritative workflow

```text
1. Lead updates drizzle/schema (TS)
2. drizzle-kit generate → SQL migration file
3. Human/Lead inspects SQL
4. Manually add/review RLS policies, indexes, partial uniques, grants
5. Commit migration to Git
6. Run integration tests against clean DB apply
7. Apply to env via controlled migrate command (local → preview → prod)
```

**Forbidden as normal path:**

- Manual production schema edits in dashboard  
- `drizzle-kit push` as production source of truth  
- Feature agents inventing parallel migration histories  

Rollback posture: prefer **forward-fix** migrations; disaster = restore from backup.

---

## 2. Migration ownership

| Role | May |
|------|-----|
| Lead / Integrator | Create/merge migrations; touch `drizzle/` |
| Feature agents | Propose schema; provide SQL notes; **do not** land conflicting migrations alone |
| Review agents | Review RLS/integrity; no primary authoring |

One linear migration chain per main branch.

---

## 3. What belongs in migrations

- Tables, FKs, indexes, uniques  
- Enums / check constraints  
- RLS enable + policies  
- Grants  
- Stable permission seed **keys** (system) if required for deploy  

What does **not**:

- Demo businesses  
- Fake projects/expenses  
- One-off data fixes (use scripts)

---

## 4. Seed classes

### System seed (safe for all envs)

Deterministic, idempotent where possible:

- Permission catalog  
- Role template definitions  
- Canonical cost families  
- Minimal Country Pack / Israel defaults stubs as approved  
- Profession/domain presets if product requires  

Location: `drizzle/seed/system.ts` (or SQL) invoked explicitly.

### Demo / dev seed

- Fake orgs, projects, expenses  
- **Never** run against production  
- Separate command: `seed:demo`  

---

## 5. Environment apply order

```text
local: migrate + system seed (+ optional demo)
preview: migrate + system seed (no prod data; demo optional)
production: migrate + system seed only
```

CI: apply migrations to ephemeral DB for integration tests.

---

## 6. RLS co-management

Options (Lead picks in Wave 0):

- A. RLS SQL in same migration files after generated DDL  
- B. Companion `drizzle/policies/*.sql` included by migration  

Either way: policies are versioned in Git and reviewed.

---

## 7. Related

`72`, `74`, `79`, `80`
