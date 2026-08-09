# 79 — Multi-Agent Implementation Protocol

**Status:** Planning / process blueprint  
**Constraint:** Cursor agents only (Auto / Composer per project policy). No API/other-model agent runners unless owner explicitly approves separately.

---

## 1. Roles

### Lead / Integrator

Owns:

- Architecture compliance with `71`–`77`  
- `shared/`, `drizzle/`, dependencies, lockfile  
- Final migrations + RLS merge  
- Cross-module integration  
- Build/typecheck/test gates  
- Env contract (`.env.example`)  
- Wave acceptance sign-off checklist facilitation  

### Feature agents

Own explicit modules/files per wave assignment (`76`, `78`).

Must:

1. Read assigned SoT docs first (`16`, domain docs, `71`–`75`, UX as needed)  
2. Not change owner product decisions  
3. Not invent alternate tenancy/auth models  
4. Propose schema changes to Lead; not fork migrations  
5. Keep business logic in application/domain layers  

### Review agents

Do **not** implement primary feature work.

Review for:

- Security / tenant isolation / data integrity  
- UX / V1 scope / documentation compliance  
- Permission misuse (role-name checks)  
- Money/float mistakes  

---

## 2. Required reading before coding (by role)

| Role | Minimum docs |
|------|----------------|
| Any | `01`, `18` (relevant IDs), `71`, `76`, `79` |
| Lead Wave 0 | `72`–`75`, `77`, `80`, `67`, `69` |
| Feature Wave 1 | Module domain doc + `72` slice + `73` permissions + UX wireframes |
| Review | `15`, `74`, `80`, `16`, relevant UX |

---

## 3. Parallel work rules

1. **One owner per file set** — avoid two agents editing same module.  
2. **Lead serializes migrations.**  
3. Locale `common.json` and design tokens = Lead/UI Lead only.  
4. Permission key additions require Lead + migration/seed update.  
5. If blocked on shared schema, stop and hand proposal to Lead — do not invent local tables outside Drizzle.  

---

## 4. Conflict policy

| Conflict | Resolution |
|----------|------------|
| Migration timestamp clash | Lead rebases into single chain |
| Permission naming clash | Lead owns catalog |
| Duplicate UI patterns | UI agent consolidates into `components/patterns` |
| Product ambiguity | Escalate to owner; do not guess as fact |

---

## 5. Definition of done (feature slice)

- Use cases behind application layer  
- Server Zod validation  
- Permission checks  
- Tenant scope on queries  
- Tests: domain + relevant isolation  
- EN + HE keys for user-visible strings  
- AuditEvent for sensitive mutations  
- No float money math  
- Docs/decisions not contradicted  

---

## 6. Wave 1 assignment template

```text
Agent Projects: modules/clients, modules/projects
Agent Expenses: modules/expenses, modules/vendors (lightweight)
Agent Commercial: modules/contracts, modules/changes, modules/tax (as needed)
Agent Workforce: modules/workforce
Agent Billing: modules/billing
Agent UI: components/*, shell integration, dashboards
Lead: drizzle, shared, integration, gates
Review: post-merge security + UX compliance
```

---

## 7. Related

`68`, `76`, `78`, `80`
