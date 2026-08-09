# 70 — Testing & Quality Strategy

**Status:** Planning recommendation  
**Phase:** No test harness installed yet  
**Companion:** Recommended Stack A (`67`)

---

## 1. Test pyramid for ProjectFlow

| Layer | Purpose | Tools (proposed) | When |
|-------|---------|------------------|------|
| **Unit / domain** | Money, CR/CO math, permission predicates, effective-dated rates | Vitest | From first domain modules |
| **Integration** | Use cases + Postgres + RLS + org scoping | Vitest + test DB | Before multi-tenant features ship |
| **Component** | Critical forms/widgets only | Testing Library + Vitest | Where UI logic is non-trivial |
| **E2E** | Critical user journeys | Playwright | Before public beta; smoke on main |

Avoid: 100% E2E coverage, snapshot spam, testing through the browser for pure math.

---

## 2. Critical test themes (must exist before scale)

1. **Tenant isolation** — Org A cannot read/write Org B (API + RLS)  
2. **Permissions** — denied actions never mutate  
3. **Contract / change math** — CR ≠ CO; totals consistent  
4. **Payment / outstanding** — balances correct  
5. **Expense splits** — sum integrity  
6. **Effective-dated** rates/tax — as-of date correctness  
7. **RTL smoke** — Hebrew layout dir + key screens  
8. **Mobile flows** — primary create/list paths  

---

## 3. Multi-tenancy testing pattern

```text
seed OrgA + OrgB
authenticate as member of A
attempt read/write B resource → expect deny / empty
assert DB row counts unchanged for B
repeat with elevated but wrong-org context
```

Include both:

- Application-layer checks  
- Direct query under RLS-bound role (defense in depth)

---

## 4. Money / decimal testing

- Never assert floats with binary equality for money  
- Cover rounding boundaries at Country Pack edges when rules exist  
- Property-style cases for split totals = parent amount  

---

## 5. Authz testing

Table-driven cases:

`role × action × resource scope → allow|deny`

Invitations: only authorized inviters create membership; token single-use.

---

## 6. CI quality gates (later)

Suggested when repo exists:

- Typecheck  
- Unit + domain tests  
- Integration suite against ephemeral DB  
- Lint  
- Playwright smoke on main/preview (subset)  

Migrations applied to test DB from Git — same as prod path.

---

## 7. Manual / exploratory

- Deep Teal visual check (tokens, contrast)  
- Hebrew glossary labels vs `48` UX decisions  
- Progressive complexity: hidden advanced fields stay hidden  

---

## 8. What “done” means for a feature slice

- Domain tests for rules  
- Permission matrix update if new action  
- Tenant isolation covered if new table  
- AuditEvent for sensitive mutations  
- No floating money path  
- i18n keys for EN + HE  

---

## 9. Related

`17` security · `14` audit · `68` boundaries · `69` environments
