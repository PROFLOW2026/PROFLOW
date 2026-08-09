# 76 — Codebase Module Boundaries

**Status:** Planning blueprint  
**Companion:** `71`, `68`, `79`

---

## 1. Ownership map

| Path | Owner | Notes |
|------|-------|-------|
| `src/app/` | Lead + thin feature wiring | No business rules |
| `src/modules/identity` | Lead / Tenancy agent | Profile bridge |
| `src/modules/tenancy` | Tenancy agent | Org, membership, invitations |
| `src/modules/rbac` | Tenancy agent | Roles/permissions |
| `src/modules/clients` | Projects agent | |
| `src/modules/projects` | Projects agent | WP, phases, domains |
| `src/modules/contracts` | Commercial agent | |
| `src/modules/changes` | Commercial agent | Quotes, CR, CO, approvals |
| `src/modules/expenses` | Expenses agent | |
| `src/modules/billing` | Billing agent | |
| `src/modules/workforce` | Workforce agent | |
| `src/modules/vendors` | Expenses or Vendors (assign one) | Prefer Expenses agent for lightweight V1 supplier |
| `src/modules/documents` | Lead Wave 0; Documents/UI Wave 2 | |
| `src/modules/tax` | Lead / Commercial as needed | |
| `src/modules/notifications` | Lead (thin) | |
| `src/shared/**` | **Lead / Integrator** | |
| `src/components/**` | UI agent + Lead | Tokens/primitives shared |
| `src/locales/**` | Feature agents add keys in their namespaces; Lead resolves conflicts | |
| `drizzle/**` | **Lead / Integrator only** for merge | Feature agents propose diffs |
| `tests/integration` security | Lead + Review | |
| `package.json` / lockfile | **Lead only** | |

---

## 2. Dependency direction

```text
app → modules/*/application → modules/*/domain
                ↓
         modules/*/data → shared/db
                ↓
         shared/* ports (auth, storage, email, audit, money)
```

Forbidden:

- `domain` importing Next.js or React  
- `components` importing `modules/*/data`  
- Feature module A importing feature module B’s `data` layer (use application API or shared kernel)  
- Cross-module deep relative imports into another module’s internals

Allowed:

- `changes/application` calling `contracts/application` public functions  
- Shared money/date/permission helpers  

---

## 3. Public surface per module

Each module should expose a small `index.ts` (or `public.ts`) for cross-module use:

- Use case functions  
- Selected domain types  

Not exported: raw table schemas (live in `drizzle/schema`), internal repos.

---

## 4. UI boundaries

| Kind | Location |
|------|----------|
| Design tokens, buttons, inputs, dialogs | `components/ui` |
| App shell, nav | `components/app-shell` |
| Reusable business patterns (money field, status badge) | `components/patterns` |
| Screen-specific composition | `modules/*/ui` or `app/[locale]/(app)/...` |

Deep Teal tokens are single-sourced. No per-module color systems.

---

## 5. Locale namespaces

```text
locales/en/common.json
locales/en/auth.json
locales/en/projects.json
locales/en/expenses.json
...
locales/he-IL/*.json  (same namespaces)
```

Feature agents own their namespace files; avoid editing `common` without Lead.

---

## 6. Schema change protocol

1. Feature agent opens a **schema proposal** (PR note / doc snippet / patch under module `data/schema-proposal.md` optional)  
2. Lead updates `drizzle/schema` + generates migration  
3. Feature agent must not commit competing migration timestamps in the same wave without assignment  
4. Integrator rebases migrations serially  

See `77`, `79`.

---

## 7. Related

`71`, `78`, `79`
