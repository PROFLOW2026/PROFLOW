# PROJECTFLOW FINAL LAUNCH READINESS VERIFICATION

**Date:** 2026-10-03  
**Scope:** Full public launch of ProjectFlow as implemented today (all listed capabilities in scope).  
**Method:** Code trace, read-only tests references, read-only DB migration count (local `.env.local` → production Supabase ref `rnjeggpsjchayprygkcw`), Vercel production env **names** via CLI (no secret values).  
**No code / DB / env / deploy changes.**

---

## Header

| Field | Value |
|--------|--------|
| **CURRENT CODE REMAPPED** | **YES** |
| **PRODUCTION STATE VERIFIED** | **PARTIAL** (migrations + Vercel env names verified; cron **last successful run** not verified — no log access in this session) |
| **CODE CHANGES** | **NONE** |
| **DB MUTATIONS** | **NONE** |
| **ENV CHANGES** | **NONE** |

---

## A. EXECUTIVE VERDICT

| | |
|--|--|
| **LAUNCH READY NOW** | **NO** |
| **TOTAL CONFIRMED PRE-LAUNCH BLOCKERS** | **2** (B1, B3) |
| **TOTAL CONFIRMED PRE-LAUNCH HIGH** (required before public launch in full scope) | **6** (B2-product, B4, H1-custom-domain/legal ops, H2, H3, H6 + infra rows — see §P) |
| **TOTAL POST-LAUNCH** | **22+** (see §Q) |
| **TOTAL FALSE POSITIVES REMOVED** | **8** (see §N) |

**Why NO:** The product can run in production for a single-org operator today, but **public B2B launch** lacks **Terms/Privacy surfaces**, and **SUMIT statutory recovery after ambiguous issuance is broken in code** — a confirmed defect on the payment/tax path. Employee login does not switch active org (confirmed multi-membership gap). Several items are **config/process**, not bugs (custom domain, published legal text, support deletion channel).

---

## B. PRODUCTION REALITY

### Migrations (resolved)

| Field | Value |
|--------|--------|
| **LATEST REPO MIGRATION** | `0153_quote_text_blocks_rls` (152 journal entries) |
| **LATEST PRODUCTION MIGRATION** | **Same** — `drizzle.__drizzle_migrations` count **152**, tail **0153** (read-only query via `.env.local` DB, Supabase ref matches `NEXT_PUBLIC_SUPABASE_URL`) |
| **JOURNAL PARITY** | **YES** (`node drizzle/scripts/check-migration-journal.mjs` OK) |
| **MISSING MIGRATIONS** | **NONE** |

**Previous audit stale item removed:** “Apply migrations through 0153” is **not** a launch action — already applied in production DB.

### Three-layer state (summary)

| Topic | CODE | PRODUCTION CONFIG | PRODUCTION RUNTIME |
|--------|------|-------------------|---------------------|
| Migrations 0153 | Yes | N/A | **Applied** (152/152) |
| Vercel crons (3) | `vercel.json` | Deployed with project | **Last run not verified** (UNVERIFIABLE without Vercel logs) |
| `CRON_SECRET` | Required for workers | **PRESENT** (name listed) | Auth fails closed if wrong |
| `STORAGE_PROVISION_WORKER_SECRET` | Required for provision kick | **PRESENT** | Same |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Required | **PRESENT** | Pre-launch **vercel.app** works for auth (see H1) |
| `WEBHOOK_SECRET_KEK` | Required if `APP_ENV=production` | **NOT in Vercel prod env list** | **Runtime uses default `APP_ENV=local`** unless set elsewhere → production guards **not enforced** on Vercel |
| `APP_ENV=production` | Schema supports | **NOT in Vercel prod env list** | Server boot does not run `assertProductionGuards` |
| Storage OAuth (Google/Dropbox/MS) | Yes | Client IDs/secrets **PRESENT** | Per-org connect |
| SUMIT | Code + live API host | Org-level credentials in DB | Used by live tenants |
| Resend / `EMAIL_FROM` | Code | **NOT in Vercel prod env list** | Invites use **console driver** or fail Resend guard only if `EMAIL_DRIVER=resend` |
| Material market global data | Cron refresh in ops-worker | Cron scheduled | Depends on ops-worker |
| Portal | `notFound()` | Disabled | **By design** |

**Production domain (current):** Vercel project `proflow` — `APP_URL` / `NEXT_PUBLIC_APP_URL` configured (values not read). **Custom domain** is a **launch business step**, not a code defect.

---

## C. PREVIOUS BLOCKERS — FINAL VERDICT

### B1 — Terms / Privacy

| Field | Value |
|--------|--------|
| **TERMS EXISTS** | **NO** (no `/terms` or equivalent route) |
| **PRIVACY EXISTS** | **NO** |
| **PUBLICLY ACCESSIBLE** | **NO** |
| **LINKED FROM SIGNUP/AUTH** | **NO** (`sign-up-form.tsx` has no legal links; `landing-footer.tsx` → sign-in/employee only) |
| **Existing legal text** | Org **legal identity** for documents only (`settings/business/legal-identity-form.tsx`) — not ToS/Privacy |

| | |
|--|--|
| **FINAL** | **CONFIRMED** |
| **SEVERITY** | **BLOCKER** for **public B2B SaaS product requirement** (contract + privacy disclosure before taking paying customers). This is **product/operational**, not “run GDPR program” in this audit. |
| **REQUIRED BEFORE LAUNCH** | **YES** — publish pages + link from marketing footer + sign-up |

### B2 — Account / data deletion

| Capability | Exists? |
|------------|---------|
| Self-service delete user | **NO** |
| Self-service delete organization | **NO** |
| Remove member from org | **YES** — `removeMemberAccess` / `settings/people` |
| Employee deactivate/block | **YES** — workforce/employee-app |
| Soft delete patterns | Partial (archive on many entities) |
| Admin tooling | Owner settings only |
| Data export | Partial CSV/XLSX exports (not full tenant bundle) |
| Documented support workflow | **NO** product page/email |

| | |
|--|--|
| **FINAL** | **DOWNGRADED from BLOCKER** |
| **SEVERITY** | **HIGH** (public launch) |
| **REQUIRED BEFORE LAUNCH** | **YES** — **Option B acceptable:** documented **support-request deletion/erasure process** + contact channel **in Privacy Policy** (no self-service button required for v1). **Option A** (in-app delete) is post-launch enhancement unless Owner mandates otherwise (§O). |

### B3 — SUMIT ambiguous recovery

**Trace (code, current):**

1. **Issuance:** `requestExternalStatutoryDocument` → `executeProviderCreateAndPersistOutcome` → success → `persistConfirmedCreated` sets `issuanceOutcome: 'confirmed_created'`. Timeout/5xx → `persistAmbiguousOutcome` → `issuanceOutcome: 'ambiguous'`. Non-ambiguous create errors also persisted as `ambiguous` (lines 239–245).
2. **Refresh:** `refreshExternalStatutoryStatus` updates `status`, numbers, PDF fields — **does not set `issuanceOutcome`** (`refresh-external-status.ts` ~86–96).
3. **PDF:** `resolveStatutoryPdfBytes` requires `issuanceOutcome === 'confirmed_created'` (~63–68).
4. **UI:** `isDocIssued` = `confirmed_created` + `externalId` — preview/PDF actions gated (`statutory-document-card.tsx` ~39–40, ~90).
5. **Ops worker:** `runSumitRecoveryOpsWorker` → `refreshExternalStatutoryStatus` → counts resolved only if `refreshed.issuanceOutcome !== 'ambiguous'` (~170–171) — **never increments resolved** after successful refresh while outcome stays ambiguous.
6. **Manual refresh UI:** same action (`refreshExternalStatutoryStatusAction`).
7. **External URL in UI:** card does **not** expose `doc.externalUrl` link; user cannot open SUMIT URL from card when `issued=false`.
8. **Duplicate issuance:** `ambiguous` ∈ `BLOCKING_ISSUANCE_OUTCOMES` → `assertIssuanceEligible` blocks new tax invoice for same billing (`types.ts` ~67–71, `assert-issuance-eligible.ts`).
9. **Test covering ambiguous→confirmed via refresh:** **NO** — `adapter-contract.test.ts` refreshes doc already `confirmed_created`; `issuance-durability.test.ts` asserts ambiguous stays blocking, not recovery.

| Question | Answer |
|----------|--------|
| Outcome stays non-`confirmed_created` after successful recovery refresh? | **YES** — stays **`ambiguous`** |
| Other path fixes later? | **NO** in codebase |
| Ops/manual same path? | **YES** |
| Duplicate if user retries? | **Blocked** while ambiguous row exists |
| Exists in current code? | **YES** |

| | |
|--|--|
| **FINAL** | **CONFIRMED** |
| **SEVERITY** | **BLOCKER** (SUMIT in full launch scope) |
| **USER IMPACT** | After network/timeout ambiguous issuance: **no in-app PDF**, **no re-issue**, refresh/ops **do not unblock**; finance must use manual SUMIT portal + DB/support intervention |

### B4 — Employee multi-org login

**Trace:**

- `employeeLogin` succeeds → **does not** call `setActiveOrganization(account.organizationId)` (`employee-login.ts`, `employee/actions.ts`).
- `activeOrganizationId` = `preferredOrganizationId` if member, else first membership (`session.ts` ~81–85).
- `/employee` shell: `withOrgContext` uses **active** org → `assertEmployeeAppContext` requires `roleKeys.includes('employee')` **and** `employeeApp` loaded for **that** org (`session-guard.ts`, `enrich-context.ts`).
- **Single org, employee only:** active org = that org → **works**.
- **Two memberships: owner in B (preferred), employee in A:** after employee login, active **B** → no employee role in B context → `assertEmployeeAppContext` → redirect **`/`** → owner shell on B — **employee app unreachable** without manually switching org in owner UI (`setActiveOrganization`).
- **Redirect infinite loop:** **NOT reproduced in code trace** — previous “loop” finding is **FALSE POSITIVE**. Failure mode is **wrong surface / blocked employee app**, not loop.

| | |
|--|--|
| **FINAL** | **CONFIRMED** (functional gap); **PARTIAL** on “redirect loop” claim |
| **SEVERITY** | **HIGH** (Workforce + Employee App in scope) |
| **REQUIRED BEFORE LAUNCH** | **YES** — set active org to employee account org on successful login (or equivalent guaranteed mechanism) |

---

## D. PREVIOUS HIGH FINDINGS — FINAL VERDICT

| ID | CONFIRMED | FINAL SEVERITY | REQUIRED BEFORE LAUNCH | Notes |
|----|-----------|----------------|------------------------|-------|
| **H1** Domain/email/auth URLs | **YES** (partial) | **HIGH** (custom domain + transactional email for **public** launch); **MEDIUM** for current vercel.app E2E | **YES** for public marketing domain; **NO** for “app broken today” | Vercel has `APP_URL`, Supabase keys, storage keys. **Missing from Vercel list:** `APP_ENV`, `WEBHOOK_SECRET_KEK`, `EMAIL_*`, `RESEND_*`. Pre-launch domain **works**; custom domain = **launch checklist**, not code bug |
| **H2** Storage OAuth callback | **YES** | **HIGH** | **YES** | Callback unauthenticated; completes as `state.userId` without browser session match. **Org tampering:** prevented by HMAC. **Exploit:** stolen `code`+`state` can bind wrong Microsoft/Google account to victim org connection (`connection-service.ts` ~369) |
| **H3** CRM `won` blocks convert | **YES** | **HIGH** | **YES** (UX guard or status rule) | `isOpportunityAlreadyConverted` treats `status==='won'` as converted (`conversion.ts` ~35–41); `canConvertOpportunity` requires `status==='open'` |
| **H4** Dual quotes | **YES** | **HIGH** (training/UX) | **YES** (product guardrails) | **TWO ACTIVE SYSTEMS:** CRM `crm_sales_quotes` vs owner `/quotes` → `estimates` (`product-path.ts`). Win conversion uses **estimates only** |
| **H5** Void billing vs SUMIT | **YES** | **MEDIUM** | **NO** (blocker) | `voidBillingRecord` voids AR only — **EXPECTED**. SUMIT credit/cancel exists separately (`credit-or-cancel-external.ts`). **MISSING UX:** guided void→statutory workflow |
| **H6** Material market `getDb()` | **YES** | **HIGH** (reliability/security hygiene) | **YES** | Page loads snapshots via `getDb()` outside RLS tx (`material-market/page.tsx`). Global snapshot RLS needs `app.current_user_id()` — without tx, reads **deny** → empty/pending. **Not** a cross-tenant leak on page; supplier aggregate runs in **admin refresh**, by design |
| **H7** Provision secret silent skip | **YES** | **MEDIUM** | **NO** (secret **present** in prod) | Kick skips if secret missing — **silent** |
| **H8** Supplier signal cross-tenant | **BY DESIGN** | **N/A security leak** | **NO** | See §F |
| **H9** Errors → ambiguous | **YES** | **MEDIUM** | **NO** | Broad catch persists ambiguous |
| **H10** Board 500 cap | **YES** | **MEDIUM** | **NO** | Message only, no pagination |
| **H11** Cron secrets not in startup assert | **YES** | **MEDIUM** | **PARTIAL** — set `APP_ENV=production` + guards | Secrets exist on Vercel; guards not active without `APP_ENV` |
| **H12** SEO robots/sitemap | **YES** | **MEDIUM** | **YES** for public launch hygiene | No `robots.txt` / sitemap in repo |

---

## E. SECURITY FINAL (confirmed only)

| ID | Issue | Exploitable | Severity |
|----|--------|-------------|----------|
| S1 | Storage OAuth callback without session binding | **YES** — with intercepted redirect | HIGH |
| S2 | Internal workers (`CRON_SECRET`) | **YES** — if secret leaked | HIGH (ops) |
| S3 | API keys use admin DB | **Mitigated** — org pinned in auth layer | MEDIUM (architecture) |
| S4 | Statutory share token (7d HMAC) | **YES** — if URL leaked | MEDIUM |
| S5 | `APP_ENV` not production on Vercel | Production KEK guards **skipped** | MEDIUM |

**IDOR / org tampering on main session APIs:** **No confirmed unscoped tenant read** on reviewed routes when using `withOrgContext` + repositories.

**CAN TENANT A READ TENANT B PRIVATE DATA (session app):** **NO** — under normal RLS + org context paths.

---

## F. MULTI-TENANT FINAL

| Question | Answer |
|----------|--------|
| **CAN ORG B SEE ORG A PRIVATE SUPPLIER DATA (names, invoices, history)?** | **NO** |
| **What is shared?** | (A) Global market indices/snapshots (CBS/FRED-driven); (B) **Platform aggregate** `avg(unit_price)` by trade/month from `material_vendor_prices` across orgs — **no vendor names, no org ids** in output (`repositories.ts` ~320–367, comment “Aggregates across ALL orgs”) |
| **SUPPLIER SIGNAL classification** | **B — shared anonymized aggregate by design**, not a leak |
| **WORKERS** | **Cross-tenant by design** — per-org iteration with owner impersonation / admin scan; **leak risk NO** if iteration scoped (code uses org id per loop) |

---

## G. NEW CUSTOMER / NEW ORG READINESS

| | |
|--|--|
| **NEW ORG WITHOUT DEVELOPER/DB ACCESS** | **YES** for core CRM → quote → project → billing → work (code path `createOrganization` seeds RBAC, catalogs, branding, `work_management`) |
| **MANUAL STEPS STILL REQUIRED** | (1) Connect **external storage** for generated PDFs / quote file artifacts; (2) Configure **SUMIT** per org; (3) Optional **OCR** credentials; (4) **Material market** global data via daily cron or one-time `scripts/material-market-bootstrap.ts` (ops, not per-tenant); (5) Manager **profit toggles** if needed; (6) **Invitation email** needs Resend + domain for production email |

**CRM FLOW:** **VALID** if user follows open → product quote → convert; **BROKEN PATH** if opportunity `status=won` set before convert (H3).

**QUOTE ARCHITECTURE:** **TWO ACTIVE SYSTEMS** (CRM sales quotes + `/quotes` estimates); estimates are **win/conversion** path, not legacy-only.

---

## H. FEATURE LAUNCH MATRIX

| Capability | IMPLEMENTED | PROD CONFIGURED | MULTI-TENANT SAFE | NEW-ORG READY | 4-LANG UI | MOBILE | LAUNCH READY | BLOCKING |
|------------|-------------|-----------------|-------------------|---------------|-----------|--------|--------------|----------|
| Marketing | YES | YES | N/A | YES | YES | YES | NO | B1, H12 |
| Auth | YES | YES | YES | YES | YES | YES | PARTIAL | B1 |
| Onboarding | YES | YES | YES | YES | YES | YES | YES | — |
| CRM | YES | YES | YES | YES | YES | PARTIAL | NO | H3, H4 |
| Clients | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Quotes | YES | YES | YES | YES | YES | PARTIAL | YES | H4 UX |
| Projects | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Contracts | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Changes | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Billing | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Payments | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| SUMIT | YES | Per org | YES | Manual connect | YES | PARTIAL | **NO** | **B3** |
| Profitability | YES | YES | YES | YES (owner toggles) | YES | PARTIAL | YES | — |
| Expenses | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Procurement/AP | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Documents | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| External Storage | YES | OAuth env | YES | Manual OAuth | YES | YES | PARTIAL | H2 |
| Work Management | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Employees | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| Attendance | YES | YES | YES | YES | YES | YES | YES | — |
| Employee App | YES | YES | YES | YES | YES | YES | **NO** | **B4** |
| Material Market | YES | Cron | YES | Global cron | YES | YES | PARTIAL | H6 |
| Notifications | YES | Cron | YES | YES | YES | YES | YES | — |
| Email | YES | **Partial** | N/A | Console/default | **EN invites only** | N/A | NO | H1 |
| Reports | YES | YES | YES | YES (print w/o storage) | YES | PARTIAL | YES | — |
| Settings | YES | YES | YES | YES | YES | PARTIAL | YES | — |
| PWA | YES | YES | N/A | YES | YES | YES | YES | — |

---

## I. LEGAL / PRIVACY FINAL

| ITEM | EXISTS | REQUIRED BEFORE LAUNCH | MANUAL PROCESS OK | MUST BE UI | NOT REQUIRED |
|------|--------|------------------------|-------------------|------------|--------------|
| Terms | NO | YES | NO | YES (pages) | |
| Privacy | NO | YES | NO | YES | |
| Deletion request | NO | YES | **YES** (email/support) | NO (v1) | |
| Support/contact | NO dedicated | YES | YES | YES (footer/email) | |
| Data export | Partial | NO | YES | | |
| Cookie consent | NO | | | | **YES** — no third-party analytics cookies in `src/` |
| Security contact | NO | RECOMMENDED | YES | | |
| Processor disclosure | NO | YES (in Privacy) | | YES (text) | |

---

## J. INFRASTRUCTURE FINAL

| Area | READY | Notes |
|------|-------|-------|
| Domain (vercel.app) | **YES** | Custom domain = launch task |
| Email | **NOT READY** | Resend/`EMAIL_FROM` not on Vercel prod list |
| Redirects/auth | **YES** | Callback route + env URLs present |
| Cron | **CONFIGURED** | 3 crons; last run unverified |
| Workers | **CONFIGURED** | Secrets present |
| Storage integrations | **YES** | OAuth env present |
| SUMIT | **Per org** | Live API in code |
| Backups | **PLATFORM** | Supabase/Vercel; no in-app tenant restore |

---

## K. 4-LANGUAGE FINAL

| Surface | HE | EN | AR | RU |
|---------|----|----|----|-----|
| UI (next-intl) | YES | YES | YES | YES |
| Supabase auth emails | Supabase project config | | | |
| Invitation email (Resend) | **NO** | **YES only** | NO | NO |
| Generated docs/reports | YES (RTL PDF/HTML paths) | YES | Partial via locale | Partial |
| Marketing | YES | YES | YES | YES |

---

## L. MOBILE FINAL

**Functional blockers:** **NONE** confirmed (auth, employee, core forms usable).

**UX inconvenience (scroll tables, no blocker):** e.g. `meetings/page.tsx`, `portfolio/page.tsx`, `jobs/page.tsx`, `subcontracts/page.tsx`, many procurement/assets pages (~30+ with `<Table` without `ResponsiveTable`). **Core paths** (projects, clients, CRM leads, timesheets) use **ResponsiveTable**.

---

## M. PERFORMANCE FINAL

| Hotspot | Launch severity | Evidence |
|---------|-----------------|----------|
| My Work 9× queries | **POST-LAUNCH** | `work/page.tsx`; bounded 100/view |
| `listEmployees` unbounded | **POST-LAUNCH** | Large org roster |
| Board 500 cap | **MEDIUM** (H10) | Not perf — completeness |

---

## N. FALSE POSITIVES / DOWNGRADES

1. **Migration 0153 apply** — production already at 0153.  
2. **B4 infinite redirect loop** — not supported by code.  
3. **H8 cross-tenant leak** — anonymized aggregate by design.  
4. **Task “Agent A” backend missing** — backend wired; comments stale.  
5. **Portal disabled** — intentional (`external-access-policy.ts`).  
6. **Custom domain as code bug** — launch ops, not defect.  
7. **H5 auto SUMIT cancel on void** — not required accounting behavior.  
8. **Cookie banner required** — no non-essential analytics cookies in app code.

---

## O. OWNER DECISIONS REQUIRED

| DECISION | OPTION A | OPTION B | LAUNCH CONSEQUENCE | RECOMMENDATION |
|----------|----------|----------|--------------------|----------------|
| Account deletion v1 | Self-service in-app delete | Support-request only (documented in Privacy) | A = more eng; B = faster launch | **B** for v1 + published process |
| Public launch domain | Stay on vercel.app briefly | Custom domain day-1 | Trust/branding | **Custom domain** for public marketing |
| CRM `won` handling | Auto-sync won stage → conversion wizard | Block manual `status=won` in UI | H3 dead-end | **Block or auto-fix status** in UI |

---

## P. EXACT MINIMUM REQUIRED BEFORE LAUNCH (confirmed only)

| # | Item |
|---|------|
| **L1** | Publish **Terms of Service** + **Privacy Policy** (4 locales or EN+HE minimum per product policy) and link from marketing footer + sign-up |
| **L2** | Privacy includes **data deletion/erasure request process** + **support contact** (B2 Option B) |
| **L3** | Fix **SUMIT ambiguous recovery**: set `issuanceOutcome` to `confirmed_created` on successful refresh/recovery (+ test) (**B3**) |
| **L4** | **Employee login** sets active organization to employee account org (**B4**) |
| **L5** | **Material market pages** use `context.db` (or equivalent correct RLS session) (**H6**) |
| **L6** | **CRM:** prevent or recover **opportunity `status=won`** dead-end before convert (**H3**) |
| **L7** | **Storage OAuth:** bind callback to authenticated session user === state userId (**H2**) |
| **L8** | **Public launch infra:** custom domain, **Resend + EMAIL_FROM**, Supabase redirect URLs on that domain (**H1**) |
| **L9** | **`robots.txt` + sitemap** for public locales; **`noindex`** on authenticated app shells (**H12**) |
| **L10** | Set **`APP_ENV=production`** + **`WEBHOOK_SECRET_KEK`** on Vercel (and any other missing production guards) |

**Count: 10 items.**

---

## Q. POST-LAUNCH (selection)

- Self-service account/org deletion (Option A)  
- H5 void→SUMIT guided workflow  
- H10 board pagination  
- My Work / listEmployees perf  
- H9 narrow ambiguous classification  
- Portal  
- Full cookie policy if analytics added  
- Tenant export bundle  
- Invitation email 4-language  

---

## R. FINAL ANSWER

| | |
|--|--|
| **PROJECTFLOW CAN BE MADE LAUNCH-READY BY CLOSING** | **10 confirmed items (L1–L10)** |
| **NO OTHER KNOWN TECHNICAL LAUNCH QUESTIONS** | **YES** (within access limits: cron last-run unverified, not blocking decision) |

---

## RELEASE

| | |
|--|--|
| FILES CHANGED | **NONE** |
| MIGRATIONS CREATED | **NONE** |
| DB MUTATIONS | **NONE** (one read-only SELECT count on migration table) |
| ENV CHANGES | **NONE** |
| COMMIT / PUSH / DEPLOY | **NONE** |

---

## Appendix: Worker / cron table (H7/H11)

| JOB | TRIGGER | ROUTE | SECRET | PROD NAME PRESENT | STARTUP ASSERT | IF MISSING |
|-----|---------|-------|--------|-------------------|----------------|------------|
| OCR recovery | Cron 05:00 UTC | `/api/internal/ocr-worker` | CRON or OCR_WORKER | CRON only listed | NO | 401 silent |
| Ops bundle | Cron 06:00 UTC | `/api/internal/ops-worker` | CRON/OCR | CRON | NO | 401 |
| SUMIT expense | Cron 06:30 UTC | `/api/internal/sumit-expense-worker` | CRON/OCR | CRON | NO | 401 |
| Storage provision chain | HTTP kick | `/api/internal/storage-provision-worker` | STORAGE_PROVISION_* | YES | NO | skip kick |
| Material refresh | Inside ops-worker | — | via ops auth | — | — | no refresh |
| SUMIT ambiguous recovery | Inside ops-worker | — | via ops auth | — | — | stuck ambiguous |

**CROSS-TENANT PROCESSING BY DESIGN:** YES (ops workers). **DATA LEAK RISK:** NO in reviewed loops.

---

## Appendix: Documents without storage

| Action | Works without external storage? |
|--------|----------------------------------|
| Quote/report **HTML preview + print** | **YES** (`reports/preview`) |
| Save **generated PDF** to cloud | **NO** (`save-generated-report.ts` ~40–46) |
| Upload business documents | **NO** (org storage gate) |
| Statutory PDF from SUMIT | **YES** (API route; gated on B3 outcome) |

**New org can operate** CRM/quotes/billing; **file PDF persistence** requires storage connect.

---

## Appendix: Material market bootstrap

| | |
|--|--|
| **NEW TENANT MATERIAL MARKET WORKS AUTOMATICALLY** | **YES** (UI shows pending until global cron/bootstrap fills snapshots — not per-org DB seed) |
