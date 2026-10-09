# ProjectFlow — דוח סגירת Build מקומי (מאסטר 2026-10-09)

**גרסה:** Closeout + SQL 0174 + **סגירת RBAC אפליקציה** (2026-10-09, UTC+3)  
**תוכנית:** `.cursor/plans/complete_implementation_master.plan.md`  
**מצב:** יישום מקומי **הושלם** · **SQL Production 0173–0176 הוחל** (2026-10-09) · **לא** commit · **לא** push · **לא** deploy

---

## 1. מוכנות שחרור (הצהרה)

| שער | סטטוס |
|-----|--------|
| קוד Build + תיקוני closeout | **מוכן לסקירת Owner** (diff מקומי) |
| `npm run typecheck` | **0 שגיאות** (ראו §2) |
| חבילת בדיקות ממוקדת (§6) | **415/415 עברו** |
| Journal / PGlite migrations | **175 קבצים, journal OK** |
| SQL 0173–0176 | **הוחל ב-Production** (ראו §4.1) · journal **175/175** |
| שער 0174 `contracts.read` (project-scoped) | **תוקן in-place** · **10/10** בדיקות RLS ממוקדות (§4, §6) |
| RBAC אפליקציה ↔ RLS (project-scoped) | **נסגר** · `loadEffectivePermissionsForProject` + `scopeOrgContextToProject` · **1/1** integration (§6) |
| CI GitHub מלא | **EXTERNAL** — לא הורץ ב-closeout |
| E2E דפדפן / smoke Production | **EXTERNAL** |
| SUMIT / OAuth חי | **EXTERNAL** (mock/static ירוק) |

**Production READY:** **לא** — נדרשים אישור Owner נפרד ל-SQL, ואחריו commit + push + preflight CI + deploy.

---

## 2. TypeScript — סטטוס סופי

```powershell
npm run typecheck   # tsc --noEmit
# Exit code: 0 · 0 diagnostics (2026-10-09 closeout)
```

### תיקונים ב-closeout (קשורים ל-Build / audit)

| קובץ | תיקון |
|------|--------|
| `src/modules/reports/application/generate-labor-by-period-report.ts` | `ReportPayload`: `locale`, `dir`, `omitted` (לא `direction`) |
| `tests/integration/audit-verification/business-flow-chains.test.ts` | Flow 5: הוסר `projectId` לא חוקי מ-`createEmployee` |
| `tests/unit/audit-verification/fin-005-gross-line-sumit-mapping.test.ts` | `CustomerSnapshot.name`, `taxAmount!` |
| `tests/unit/audit-verification/finance-crm-pm-executable-proof-2026-10-09.test.ts` | `taxAmount!`, טיפוס `body.Items` |
| `tests/e2e/harness/audit-fixtures.ts` | `orgEq(AnyColumn)` — תיקון Drizzle column typing |
| `tests/e2e/fixtures/world.ts` | שדות GC אופציונליים (`gcOpsUsername` וכו') |
| `tests/e2e/audit/verification-route-personas.spec.ts` | אתחול `allResults` לפי persona |
| `src/locales/ar/*`, `src/locales/ru/*` | parity ל-RPT/FIN/WF/invoicing/projectTeam (ראו §3) |

### ראיות לשגיאות שהיו לפני closeout

לפני closeout היו **15** diagnostics ב-`docs/audits/_tsc-closeout-2026-10-09.txt` (גרסה ראשונה):

- **10** בקבצי audit E2E **לא במעקב git** (`git status`: `?? tests/e2e/audit/`, `?? tests/e2e/harness/audit-fixtures.ts`) — artifacts מגל audit/Build, **לא** מ-main מcommitted.
- **3** ב-`tests/unit/audit-verification/fin-005*` / `finance-crm-pm*` — קבצי EXEC proof מה-Build (`??` / עדכוני disposition).
- **2** ב-personas spec — typing `SeededWorld` / `allResults` (אותו audit E2E bundle).

**אין שגיאות TypeScript פתוחות ב-`src/` לאחר closeout.**

---

## 3. תיקוני closeout אחרונים (סיכום)

- **RPT-001 / ReportPayload** — יישור ל-`generate-monthly-workforce-report`.
- **Flow 5** — attendance → submit/approve → `getProjectLaborCost` > 0 (integration).
- **i18n** — `tests/unit/shared/i18n-messages.test.ts`: **272/272** (ar/ru: reports `labor_by_period`, `invoicedNet`, invoicing `confirm.*`, workforce banners, dashboard `lifetimeRollupNote`, financial `vendorsRecognized`, projectTeam `operational_approve`).

---

## 4. SQL — סקירת בטיחות (0173–0176, ללא הרצה)

### 0173 — FORCE RLS (5 טבלאות)

- **שינוי:** `FORCE ROW LEVEL SECURITY` בלבד.
- **מדיניות:** ללא שינוי grants/policies.
- **גישה:** Owner/manager/employee/contractor — **ללא שינוי התנהגות RLS**; רק אכיפת RLS גם ל-table owner (invariant migrations.test).

### 0174 — audit + contracts SELECT + RBAC helpers

**פסק דין שער הרשאות (contracts):** גרסת 0174 שדרשה **רק** `has_org_permission(..., 'contracts.read')` הייתה **שגויה** למשתמש עם `contracts.read` **בהקצאת פרויקט** (Project A) — false negative ב-SELECT גולמי. **תוקן in-place** ב-`drizzle/migrations/0174_audit_events_contracts_select_rls.sql` (לא Production).

| רכיב | השפעה |
|------|--------|
| `has_org_permission` | רק `role_assignments.project_id IS NULL` — **תואם** `roles.repository.ts` (SEC-003). org-wide `contracts.read` / `audit.read` — כן. |
| `has_project_permission(org, project_id, key)` | **חדש ב-0174** — EXISTS על `role_assignments` עם `project_id` מדויק + `role_permissions`. |
| `audit_events` SELECT | `audit.read` **org-wide בלבד** + חברות — **מגביל** leak לעומת membership-only. |
| `contracts` SELECT | `(has_org_permission contracts.read **OR** has_project_permission על project_id)` **AND** `(project_id IS NULL OR can_access_project)` — **שומר** 0051; Project B **לא** נחשף ללא grant/גישה. |

**מדיניות `public.contracts` (authenticated):** רק `contracts_tenant_select` ל-SELECT (0174 מחליף את policy מ-0001+0051); INSERT/UPDATE/DELETE נשארים `*_tenant_*` + `can_access_project` מ-0051 — **ללא** bypass permissive נוסף. `contracts_service_all` (service_role) — **ללא שינוי** (BYPASSRLS pattern 0001).

**נשמר:** Owner/manager עם org-wide הרשאות; גישה org-wide מורשית; גישה project-scoped מורשית; **הפרדה כספית** — gate הוא `contracts.read` בלבד, לא `financial.*`; פעולות service_role.

**שכבת app (post-close):** `loadEffectivePermissions` — org-wide בלבד (ללא הרחבה). **`loadEffectivePermissionsForProject`** / **`scopeOrgContextToProject`** — org ∪ project-scoped לפרויקט אחד, אחרי `can_access_project` (כולל fallback `app.can_access_project` כש-grant rows חסומים ב-RLS). **`withProjectOrgContext` / `getShellContextForProject`** — מסלולי פרויקט. **לא** מרחיב הרשאות org-wide.

**אימות ממוקד (PGlite, לא Production):**

| קובץ | תוצאה |
|------|--------|
| `tests/integration/audit-verification/rls-permission-gaps.test.ts` | **5/5** — SEC-001, SEC-002, **SEC-002b** (project-scoped A כן / B לא), SEC-003, SEC-006 |
| `tests/integration/database/migrations.test.ts` | **5/5** |

### 0175 — `attendance_correction_requests` service_role

- **מדיניות:** `service_role` ALL (pattern 0137 אחרי FORCE RLS).
- **authenticated:** נשאר `attendance_correction_requests_org_isolation` (0137) — חברות org; **אישור/דחייה** scoped ב-app (`scoped-operational-approval`, PT-05) + elevation service_role **אחרי** בדיקות app.
- **employee:** submit/read דרך app + RLS org; **לא** EMC/payroll דרך `client_coordinator`.

### 0176 — `project_access_mode` default `selected`

- **SQL + app:** ברירת מחדל `selected` (לא `all`) — **מצמצם** exposure פרויקטים ללא grant.
- **Owner:** גישה מלאה; onboarding חדש כבר `selected`.

**שירות:** 0175 מפורש ל-service worker paths; 0174 לא נוגע ב-service_role grants קיימים.

```
SQL / MIGRATION PREPARED = YES (0173, 0174, 0175, 0176)
PRODUCTION APPLY = YES (Owner gate 2026-10-09)
```

### 4.1 Production apply — תוצאה מדויקת (Owner SQL gate)

| שדה | ערך |
|-----|-----|
| **יעד** | Supabase `rnjeggpsjchayprygkcw` · pooler `aws-1-eu-west-1` (מ-`.env.local` `DIRECT_DATABASE_URL`) |
| **לפני** | `drizzle.__drizzle_migrations` count **171** · אחרון `created_at` **1789714500000** (= **0172**) · `has_project_permission` **לא** |
| **פעולה** | `tsx drizzle/scripts/migrate.ts` (Drizzle migrator, 4 קבצים pending) |
| **אחרי** | count **175** · tail `1789714560000`…`1789714740000` (= **0173**…**0176**) |
| **0173** | `attendance_correction_requests` + 4 טבלאות — **FORCE RLS** (0173) |
| **0174** | `app.has_project_permission` **קיים** · `contracts_tenant_select` כולל org **OR** project `contracts.read` |
| **0175** | service policy attendance corrections (post-FORCE RLS) |
| **0176** | `app.project_access_mode` default **`selected`** (דגימת org ללא setting) |

**בדיקת שלמות קצרה (read-only):** כל 4 hashes ב-journal תואמים קבצי repo · policy contracts SELECT תואם 0174 · **ללא** שינוי speculative.

**לא בוצע:** commit · push · deploy · audit מחודש · regression מלא.

---

## 5. 84 ממצאים

כל שורות §B בתוכנית מסומנות `Done = ✓`.  
פירוט disposition: `docs/audits/_verification-84-findings-final-disposition-2026-10-09.md`.

**DEFER (ללא יישום):** UI-001/002 (portal), PM-012 (calendar חיצוני).

---

## 6. בדיקות ממוקדות — תוצאות מדויקות

```powershell
npm run db:check-journal
# journal parity ok { files: 175, last: '0176_project_access_mode_default_selected' }

npx vitest run `
  tests/integration/audit-verification `
  tests/unit/audit-verification `
  tests/unit/audit/verification-81-findings-execution-2026-10-09.test.ts `
  tests/integration/month-close `
  tests/integration/project-team `
  tests/unit/project-team `
  tests/integration/coordination/coordination.test.ts `
  tests/unit/financials/labor-expense-integrity.test.ts `
  tests/integration/database/migrations.test.ts `
  tests/unit/shared/i18n-messages.test.ts `
  tests/integration/audit-verification/business-flow-chains.test.ts
```

| מדד | תוצאה |
|-----|--------|
| קבצים | **25 passed** |
| בדיקות | **415 passed** |
| i18n | **272/272** |
| audit-verification (integration+unit) | **34/34** |
| verification-81 | **27/27** |
| migrations.test | **5/5** |
| labor-expense-integrity | **6/6** |
| coordination (Oct-3) | **4/4** |

**לא בוצע ב-closeout:** Playwright regression מלא, `npm run verify` שלם, load Production.

### שער SQL 0174 (נפרד מ-closeout, ללא matrix מלא)

```powershell
vitest run tests/integration/audit-verification/rls-permission-gaps.test.ts `
  tests/integration/database/migrations.test.ts
```

| מדד | תוצאה |
|-----|--------|
| קבצים | **2 passed** |
| בדיקות | **10 passed** (5 RLS gaps + 5 migrations) |
| SEC-002b | project-scoped `contracts.read` + grant על A → רואה חוזה A, **0** שורות ל-B |

### סגירת RBAC אפליקציה (נפרד, ללא matrix מלא)

```powershell
vitest run tests/integration/audit-verification/project-rbac-app-rls-parity.test.ts
```

| מדד | תוצאה |
|-----|--------|
| קובץ | **1 passed** |
| בדיקה | **1/1** — חמש אבני דרך: A מותר, B חסום, org-wide נשמר, financial נדחה, grant בוטל |

---

## 7. 15 זרימות עסקיות — רמות אימות (ללא הגזמה)

**מקרא:**

| רמה | משמעות |
|-----|--------|
| **E2E-INT** | שרשרת PGlite integration (מספר צעדים, DB אמיתי מקומי) |
| **INT** | integration ממוקד (תרחיש אחד / gate) |
| **UNIT/MOCK** | vitest unit או static source proof |
| **MOCK-PROV** | SUMIT/statutory mock — לא API חי |
| **EXT** | דפדפן / Production / OAuth / CI |

| Flow | תיאור | רמה | עדות |
|------|--------|-----|------|
| O-01 | תפקיד → task → revoke | **E2E-INT** | `tests/integration/project-team/*.test.ts` |
| O-02 | operational PM בלי financials | **INT** | capabilities + deny financial read |
| O-03 | employee retro → manager approve | **INT** | wf-006/007, correction requests |
| O-03b | client_coordinator approve | **E2E-INT** | `o-03b-client-coordinator-operational-approve.test.ts` |
| O-04 | manager retro ישיר | **INT** | `employee-actual-employer-cost.test.ts` |
| O-05 | subcontractor claim | **UNIT** | `tests/unit/subcontract-claims/assessments.test.ts` — **לא** chain מלא claims→pay |
| O-06 | coordination READY/NOT READY | **E2E-INT** | `coordination.test.ts` 4/4 |
| O-07 | retro expense + P&L | **INT** | month-close + FIN2-001 PRESERVE warn |
| O-08 | close אופציונלי + retro | **E2E-INT** | `closed-period-source-corrections`, ops-b-002 |
| O-09 | employer actual → allocations | **UNIT** | labor-expense-integrity 6/6 |
| O-10 | change approved vs pending | **UNIT/MOCK** | PM-004 static + port; **לא** UI E2E |
| O-11 | SUMIT NET/VAT + cancel/credit | **MOCK-PROV** | fin-003-004, sumit-credit-cancel, fin-005 |
| Audit Flow 1 | CRM→convert→project | **E2E-INT** | `business-flow-chains.test.ts` |
| Audit Flow 5 | attendance→labor cost | **E2E-INT** | `business-flow-chains.test.ts` (post closeout) |

**לא טוענים** «15/15 E2E מלא בדפדפן» — רוב הזרימות מכוסות PGlite/vitest לפי §O.

---

## 8. אימות חיצוני שנותר

| פריט | סוג |
|------|-----|
| Apply SQL 0173–0176 ב-Production / shared DB | Owner gate |
| SEC-009/010 journal Production | EXT |
| SUMIT cancel/credit/receipt חי | EXT |
| Google Drive OAuth retry ב-production | EXT |
| RPT-002/003 money-chain harness מורחב | TEST-ONLY (לא הורחב) |
| `tests/e2e/audit/*` personas matrix | EXT (Playwright; tsc ירוק, לא הורץ) |
| GitHub CI + Vercel deploy ל-commit זה | EXT |

---

## 9. עלות Vercel / Supabase

- **ללא** cron חדש / polling DB.
- ops-worker: concurrency ≤4, kick debounce 60s, daily bundle — **6 gates** (ראו §F בתוכנית).

---

## 10. פקודות Owner לשלב הבא

1. סקירת diff + דוח זה.  
2. אישור **מפורש** להרצת migrations 0173–0176.  
3. אישור **מפורש** ל-commit / push → `npm run verify` (CI-equivalent) → deploy.

---

*Lead closeout — ProjectFlow workspace only · 2026-10-09*
