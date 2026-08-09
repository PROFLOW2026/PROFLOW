# 80 — Wave 0 Acceptance Criteria

**Status:** Gate checklist — Wave 1 must not start until all **Required** items PASS  
**Phase:** Criteria only (no Wave 0 execution in this documentation task)

---

## 1. Build & quality

- [ ] `typecheck` PASS  
- [ ] `lint` PASS  
- [ ] Unit / domain foundation tests PASS (money/date smoke at minimum)  
- [ ] CI or documented local gate runnable by Lead  

---

## 2. Auth & session

- [ ] Sign-up / sign-in / sign-out works against non-prod Auth  
- [ ] Email verification / password reset baseline works (Auth-owned)  
- [ ] `profiles` row linked to `auth.users.id` created on first session  
- [ ] No service-role key in client bundle / public env  

---

## 3. Organization & membership

- [ ] Authenticated user can create an Organization  
- [ ] Creator receives Owner membership + Owner role template permissions  
- [ ] Active organization context resolves server-side  
- [ ] User without membership is rejected for that org’s actions  
- [ ] Invitation create/accept baseline works (or explicitly deferred with Lead waiver **only** if Auth-only single-user path is temporary — prefer invitations in Wave 0)

---

## 4. Authorization

- [ ] Permission catalog seeded  
- [ ] Role templates seeded per org  
- [ ] Server helper `assertPermission` denies missing permission  
- [ ] Code paths do not authorize by role display name strings  

---

## 5. Tenant isolation (mandatory)

- [ ] **Application:** User in Org A cannot read/mutate Org B via use cases  
- [ ] **RLS:** Direct DB access as RLS-bound Org A user cannot read Org B rows (integration test)  
- [ ] Cross-tenant tests are automated and part of the gate  

---

## 6. i18n / shell

- [ ] Hebrew UI shell renders with `dir=rtl`  
- [ ] English architecture works with `dir=ltr`  
- [ ] No hardcoded Hebrew strings in components (keys used)  
- [ ] App shell navigable per U1 placeholders (links may be stubs)

---

## 7. Migrations & environments

- [ ] Clean database can apply Git migrations reproducibly  
- [ ] System seed idempotent/safe  
- [ ] `.env.example` documents variable classes without secrets  
- [ ] Documented proof that preview/dev cannot casually use production credentials  
- [ ] `drizzle-kit push` is **not** the documented production path  

---

## 8. Audit / storage / ports

- [ ] AuditEvent helper exists; at least org-create / membership / permission-sensitive actions audited  
- [ ] StoragePort exists; private bucket policy foundation testable (deny anonymous public read)  
- [ ] EmailPort boundary exists (Resend adapter may be stubbed behind flag if domain not verified — document)  
- [ ] JobPort stub exists (sync)  

---

## 9. Money / dates

- [ ] Shared money utilities reject float-based persistence patterns  
- [ ] Numeric DB columns used for money in Wave 0 schemas that store amounts (if any)  

---

## 10. Explicit non-goals (must remain undone)

- [ ] Confirmed: no full Projects/Expenses/Billing feature explosion  
- [ ] Confirmed: no Redis/queue  
- [ ] Confirmed: no production customer data in demo seed on prod  

---

## Sign-off

| Role | Name / date | Result |
|------|-------------|--------|
| Lead / Integrator | | PASS / FAIL |
| Owner (optional) | | ACK |

**Rule:** Do not begin Wave 1 until Lead marks PASS on all Required items.
