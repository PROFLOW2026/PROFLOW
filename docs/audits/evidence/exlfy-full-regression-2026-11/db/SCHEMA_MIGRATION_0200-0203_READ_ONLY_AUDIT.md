# Schema / migration read-only audit — 0200–0203

**Date:** 2026-11-14  
**Scope:** Drizzle TS schema, SQL migrations `0200`–`0203`, journal, RLS, and application query paths for work packages, planning baselines, project goals, automation presets, and adjacent salary/payroll surfaces.  
**Method:** Repository static analysis only. **No migrations executed.** **No Production/shared DB connection** (credentials target unknown; applied state marked **UNVERIFIED**).  
**Tests run (local, no DB):** `migration-journal.test.ts`, `migration-0200-rls.test.ts`, `migration-0201-rls.test.ts`, `migration-0202-automation-presets.test.ts` — **24/24 passed**.

---

## Applied migration status

| Tag | Journal idx | PREPARED ONLY header in SQL | Live DB applied |
|-----|-------------|----------------------------|-----------------|
| `0200_exlfy_evolution_local` | 198 | Yes | **UNVERIFIED** |
| `0201_planning_baselines_project_goals` | 199 | Yes | **UNVERIFIED** |
| `0202_automation_task_scan_presets` | 200 | No (comment: Owner applies) | **UNVERIFIED** |
| `0203_tasks_work_package_id` | 201 | No | **UNVERIFIED** |

**Journal integrity (repo):** Gate B tail after `0182_expense_installment_payments_grants` matches  
`0190`…`0199`, `0200`, `0201`, `0202`, `0203` in order; consecutive `idx`; unique tags; `0203` is latest.

**Prior wave (context, not re-audited here):** Owner docs (`EXLFY_AUDIT_REMEDIATION_RELEASE_READINESS_2026-11.md`) state **0197–0199 are prepared, not applied** on shared DB. Code deploy before those migrations breaks auth rate limits (fail-closed) and duplicate-warning writes. Historical `owner-full-audit-pack.json` shows **`obligation_source` populated on Production**, implying **0092+** applied at some point — does **not** prove 0200–0203.

**To verify applied status safely:** `SELECT tag, applied_at FROM drizzle.__drizzle_migrations ORDER BY applied_at DESC LIMIT 10;` or `information_schema` / `to_regclass` probes in a **read-only** session after Owner confirms target DB is not Production unless explicitly approved.

---

## Summary matrix — SQL ↔ Drizzle ↔ code

| Artifact | SQL 0200–0203 | Drizzle schema | Application usage |
|----------|---------------|----------------|-------------------|
| `drawing_sheet_marks`, `project_risks`, `supplier_rfq_access_tokens`, `work_permits`, `whatsapp_inbound_events`, `notification_email_log` | `0200` creates + RLS | **Missing** (no `drizzle/schema/*`) | Raw SQL (`sheet-marks.ts`, `project-risks.repository.ts`, …); **work_permits** has `to_regclass` guard |
| `planning_schedule_baselines`, `planning_schedule_baseline_snapshots` | `0201` | `drizzle/schema/planning-baselines.ts` — aligned | `planning-baselines.repository.ts` |
| `project_goals` | `0201` | `drizzle/schema/project-goals.ts` — aligned | `project-goals.repository.ts`, goals page |
| `automation_rules.preset_key` CHECK | `0202` extends list | `next-gen-experience.ts` `automationRules` CHECK — **matches** | `AUTOMATION_PRESET_KEYS`, `manage.ts`, scanners |
| `tasks.work_package_id` | `0203` column + FK + index | `drizzle/schema/tasks.ts` — aligned | Drizzle ORM in `tasks.repository.ts`, filters, forms |

---

## Findings by severity

### BLOCKER

1. **Deploy-before-migrate on shared DB (0200–0203 + 0197–0199)**  
   - **Goals / baselines / sheet marks / risks:** SQL hits tables that do not exist → hard 42P01 on pages and search.  
   - **Tasks:** Drizzle selects `work_package_id` on every task read; column missing → query failure across task UI.  
   - **Automations:** Saving rules with `task_blocked` / `task_reminder_due` without **0202** → CHECK violation (0108 list excludes those keys).  
   - **0199 (salary-adjacent release gate):** Login rate limit fails closed if function missing — auth surfaces degrade (documented separately).

### HIGH

2. **0200 tables absent from Drizzle schema**  
   Six tables exist only in SQL + raw repositories. Drizzle-kit drift risk; no type-safe ORM for those entities. Runtime depends entirely on migrations being applied.

3. **`tasks.work_package_id` FK weaker than DG pattern**  
   `0203` and Drizzle use `REFERENCES work_packages(id)` only. Other domains use `(id, organization_id, project_id)` composite FKs. App validates via `assertWorkPackageMatchesTaskProject`; DB does not enforce org/project alignment on the column alone.

4. **No migration-integration tests for 0200–0203**  
   PGlite suites cover through ~0112 / hardening batches; **no** disposable-DB test applies `0200`–`0203` RLS or DDL smoke.

### MEDIUM

5. **0201 RLS — planning baselines immutable by policy**  
   Only `SELECT` + `INSERT` policies and grants; no `UPDATE`/`DELETE` for `authenticated`. Matches product intent; callers must not expect updates.

6. **0201 RLS — project goals write vs read asymmetry**  
   - Read: `has_project_capability(..., 'project.view')`.  
   - Write: `projects.update` **OR** `planning.write` (org permissions).  
   Users with project capability but without those org keys can list goals but not mutate — by design; verify role templates grant writers `planning.write` or `projects.update`.

7. **0200 `supplier_rfq_access_tokens`**  
   No composite FK on `rfq_id`; integrity enforced in INSERT policy `EXISTS (procurement_rfqs)`. Orphan `rfq_id` possible if RFQ deleted without token cleanup.

8. **0202 ordering dependency**  
   Requires existing `automation_rules` + constraint from **0058/0108**. Safe if journal applied in order; re-run is idempotent (`DROP CONSTRAINT IF EXISTS`).

### LOW

9. **Constraint naming cosmetic drift (0201 snapshots)**  
   SQL: `planning_schedule_baseline_snapshots_one_per_baseline` UNIQUE. Drizzle: `planning_schedule_baseline_snapshots_baseline_uq`. Same semantics.

10. **0203 lacks “PREPARED ONLY” banner**  
    Unlike 0200/0201; still subject to Owner SQL approval policy before apply.

11. **Graceful degradation inconsistency**  
    `work_permits` and `supplier_rfq_access_tokens` probe `to_regclass`; **project goals, baselines, drawing marks, project risks do not** — harsher failure if 0200/0201 missing.

---

## RLS review (0200–0201)

**0200 — positive patterns**

- FORCE RLS on all new tables; per-operation policies (not blanket `FOR ALL` to members).
- Drawing marks tied to `documents.view` / `documents.share` + revision existence.
- Work permits: contractor read via `ext.safety.report` grant path; writes gated on `safety.manage`.
- WhatsApp / notification email: no authenticated INSERT; service_role only.

**0200 — watch items**

- `project_risks` writes use org-level `projects.update` (not project-scoped capability) — consistent with risks admin pattern.
- `supplier_rfq_access_tokens`: no DELETE policy for authenticated (manage via UPDATE only).

**0201 — watch items**

- Baselines/snapshots: insert requires `planning.write` and snapshot insert verifies parent baseline row — good cross-row check.
- `project_goals`: DELETE allowed with same write permissions as UPDATE.

**0203**

- No RLS change (inherits existing `tasks` policies). New column visible under existing task SELECT/UPDATE rules.

---

## Salary / payroll (outside 0200–0203, crash-relevant)

| Concern | Migration | Code | Risk if not applied |
|---------|-----------|------|---------------------|
| `obligation_source` on insert | **0092** | `payroll-payments.ts` Drizzle insert sets `obligationSource` | Column missing → insert fails on accrual sync |
| Closed-period owner override | **0198** | Owner corrections on expenses/payments | Owner edits rejected in closed months |
| Auth rate limit on login | **0199** | `consume-auth-rate-limit.ts` fail-closed | Not salary, but blocks access |

**0200–0203 do not alter payroll tables.** Salary approval UI depends on **0078+ / 0092** and month-close guards, not this wave.

---

## Nullability / type alignment (0201–0203)

- **`project_goals`:** `title` NOT NULL + trim check; `progress_percent` 0–100; `status` enum check; `owner_user_id` / `due_on` nullable — matches TS and repositories (no forced non-null reads).
- **Baselines:** `label` nullable; `items` jsonb array check — repository parses string or array.
- **`work_package_id`:** nullable on tasks — mappers use `?? null`; filters use partial index when set.

---

## Existing artifacts consulted

- `drizzle/migrations/meta/_journal.json` (entries 198–201)
- `docs/audits/EXLFY_AUDIT_REMEDIATION_RELEASE_READINESS_2026-11.md` (0197–0199 prepared)
- `docs/audits/local-tool-artifacts/exlfy-ci-migration-preflight.txt` (PGlite through earlier migrations; not 0200+)
- `scripts/local-audit/live-audit-readonly.mjs` — **not executed** (Production `DATABASE_URL` risk)

---

## Recommended verification (Owner-approved, read-only)

```sql
-- Applied tags
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations
WHERE id IN (
  '0200_exlfy_evolution_local',
  '0201_planning_baselines_project_goals',
  '0202_automation_task_scan_presets',
  '0203_tasks_work_package_id'
);

-- Object presence
SELECT relname FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND relname IN (
    'drawing_sheet_marks', 'project_goals', 'planning_schedule_baselines',
    'planning_schedule_baseline_snapshots'
  );

SELECT column_name, is_nullable, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'tasks'
  AND column_name = 'work_package_id';

-- 0202 CHECK includes new keys (inspect pg_constraint condef)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.automation_rules'::regclass
  AND conname = 'automation_rules_preset_known';
```

---

## Audit conclusion

- **Repo consistency:** Journal and static SQL ↔ Drizzle alignment for **0201–0203** and automation CHECK are **good**; unit migration tests pass.
- **Production applied state:** **UNVERIFIED** — treat 0200–0203 as **prepared-only** until Owner-run read-only probes confirm.
- **Primary operational risk:** Shipping application code that queries new objects **before** SQL 0197–0203 (and especially **0203** for tasks) is applied on the target database.
