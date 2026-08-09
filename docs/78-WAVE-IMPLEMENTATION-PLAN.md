# 78 — Wave Implementation Plan

**Status:** Planning blueprint  
**Aligned with:** `16-V1-SCOPE.md`  
**Gate:** Wave N+1 starts only after Wave N acceptance (Wave 0 → `80`)

---

## Wave 0 — Foundation

**Goal:** Prove identity, tenancy, RBAC, RLS, shell, i18n/RTL, migrations, money/date, audit base, storage port — **without** exploding business features.

### In scope

- Next.js App Router + TS project setup  
- Lint, typecheck, Vitest, Playwright scaffolding  
- Deep Teal token foundation + minimal shell primitives  
- next-intl EN + he-IL + RTL/LTR shell  
- Supabase client/config (no secrets in client beyond anon)  
- Drizzle schema for identity/tenancy/rbac/audit (+ documents metadata foundation)  
- Migration workflow + system seed (permissions, role templates)  
- Auth flows: sign-up/in/out, verify/reset baseline  
- Organization create; membership; invitations baseline  
- Permission checks infrastructure  
- RLS foundations + cross-tenant isolation tests  
- Active organization context  
- App shell (nav placeholders per U1)  
- Environment separation documented in `.env.example`  
- AuditEvent write helper for sensitive authz/tenancy actions  
- StoragePort + private bucket policy foundation  
- `shared/money` + `shared/dates` primitives  
- EmailPort + Resend adapter stub/real for invitations when ready  
- JobPort stub (sync)  

### Out of scope

- Full Clients/Projects/Expenses/Billing/CR-CO product surfaces  
- Redis/queues  
- Portals, OCR, CRM  
- Custom role builder  
- Production marketing site polish  

### Exit

All items in `80-WAVE0-ACCEPTANCE-CRITERIA.md` PASS.

---

## Wave 1 — Core project economics

Parallel agents (see `79`):

| Agent | Owns |
|-------|------|
| **Projects** | Clients + Projects + default WorkPackage + ad-hoc domain (B3) + phases optional |
| **Expenses** | Expenses + lightweight supplier/vendor + allocations + cost families |
| **Commercial** | Contract (primary) + QuoteVersion + ChangeRequest + ChangeOrder + internal approvals (C3) |
| **Workforce** | Employees + RateVersions + time entries (+ optional user link) |
| **Billing** | BillingRecords + Payments + outstanding |
| **UI** | Shared patterns, dashboards/shell integration, Deep Teal compliance |
| **Lead** | Schema merge, permissions expansion, cross-module integration, build gates |
| **Review** | Security/integrity + UX/doc compliance after convergence |

Progressive complexity: unused modules stay quiet (U2).

---

## Wave 2 — Depth & polish

Potential (keep within `16`):

- Deeper overhead allocation UX  
- Documents UX across entities  
- Project profitability aggregation + coverage disclosure  
- Dashboard integration  
- Permissions refinement / PM profit toggles UX  
- Mobile responsive completion  
- Israel defaults / tax rule basics  
- Stabilization / bugfix  

---

## Wave 3 — V1 closure

- End-to-end critical journeys  
- Data integrity & correction paths (D5)  
- Security / tenancy re-test  
- RTL + Hebrew completeness  
- Mobile + accessibility  
- Performance pass on primary lists  
- Error states  
- Migration rehearsal prod-like  
- Backup/recovery posture documented  
- Deployment readiness  

**Do not** pull future roadmap modules (CRM, PO graph, portals, SSO) into V1.

---

## Related

`16`, `71`, `79`, `80`
