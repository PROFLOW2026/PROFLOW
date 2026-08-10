# Pre-0021 — Agent 2: Permissions / RLS Security

**STATUS = COMPLETE**  
**Agent:** 2 — Permissions / RLS  
**Contract:** `_PRE0021-LEAD-CONTRACT.md`  
**Forbidden (obeyed):** edit `0021_*.sql`; invent parallel auth; commit / push / `db:migrate`; modify 0000–0020  

---

## 1. Verdict

Today’s 0021 RLS loop gates the five new tables with **`app.is_org_member` only**. That is a **BLOCKER** for compensation / employer cost: any authenticated org member (including a worker) could SELECT private rates / month costs / allocation runs on a client or JWT-bound path.

**Fix (app + RLS proposal):**

| Surface | Gate |
|---------|------|
| Assignments / team | `workforce.read` / `workforce.manage` (+ `projects.read` / `time.manage` for roster pickers — already in app) |
| Compensation / employer cost | **`workforce.cost.read` / `workforce.cost.manage`** (new catalog keys) |
| Vendor bill project allocations | `ap.read` / `ap.manage` |

Service-role server sessions still require **app asserts** (implemented). RLS still matters for authenticated / client paths.

---

## 2. Why new keys (least inventiveness that matches ProjectFlow)

| Option | Why rejected / chosen |
|--------|------------------------|
| Reuse `workforce.read` for rates | Catalog historically bundled rates; **ordinary workforce.read must not unlock employer cost** (locked EMP ≠ COMPENSATION). |
| Reuse `project_financials.read` alone | OK for project totals, but does **not** give finance a write path without also granting `workforce.manage` (employee archive/create). Conflates project ops financials with compensation master. |
| Reuse `workforce.manage` for cost write | Finance template lacks it; granting it would let finance mutate employee master. |
| **`workforce.cost.read` / `workforce.cost.manage`** | **Chosen.** Same READ/MANAGE pattern as AP/billing; clean EMP ≠ COMPENSATION split; finance gets cost manage without employee-master manage. |

UI helpers: `canViewWorkforceCosts` no longer treats `workforce.read` as sufficient.

---

## 3. Role templates (worker cannot read/write employer cost)

| Role | Cost read | Cost manage |
|------|-----------|-------------|
| owner | yes (full catalog) | yes |
| manager | **yes** | **no** |
| finance | **yes** | **yes** |
| worker | **no** | **no** |

Worker still lacks `workforce.read` / `workforce.manage` / `project_financials.read` / AP keys.

**Lead note — existing orgs:** templates are cloned at provision time. New keys appear in `permissions` catalog via seed; **existing** org `role_permissions` need a one-time backfill (ops/seed) for manager/finance. New orgs get them automatically from `ROLE_TEMPLATES`.

---

## 4. App-layer changes (files)

| File | Change |
|------|--------|
| `src/shared/permissions/catalog.ts` | Add `WORKFORCE_COST_READ` / `WORKFORCE_COST_MANAGE`; update workforce descriptions; extend `FINANCIAL_PERMISSIONS` |
| `src/shared/permissions/role-templates.ts` | Manager + finance grants as above |
| `src/locales/en|he-IL/organization.json` | Permission labels |
| `src/modules/workforce/application/workforce-cost-authz.ts` | Assert helpers |
| `src/modules/workforce/application/employer-month-costs.ts` | Month cost / labor allocation assert gates |
| `src/modules/workforce/application/rate-versions.ts` | Read/write → cost keys |
| `src/modules/workforce/application/employees.ts` | Redact list rates; omit `rateVersions` without cost read; create-with-rate needs cost manage |
| `src/modules/workforce/application/project-labor-cost.ts` | Drop `workforce.read`; require financials **or** cost read |
| `src/modules/workforce/ui/employees-table.tsx` | `canViewWorkforceCosts` uses cost/financials |
| `src/modules/ap/application/bill-project-allocations.ts` | AP assert gates |
| `src/modules/exports/.../build-csv-export.ts` | Redact rate/cost columns without cost permission |
| `src/modules/tenancy/.../labor-cost-defaults.ts` | Apply defaults: manage **or** cost manage |
| Employee detail page | Call `listRateHistory` only when costs visible |
| Tests | `tests/unit/workforce/worker-compensation-authz.test.ts` + catalog template asserts |

**Unchanged correctly:** `project-team.ts` assignment asserts (`WORKFORCE_READ` / `MANAGE` / project / time).

---

## 5. Schema asks for Lead (exact RLS — paste into 0021)

**Replace** the current membership-only `DO $$ … FOREACH` RLS block for the five tables with permission-aware policies. Keep `ENABLE` + `FORCE ROW LEVEL SECURITY` and `service_role` ALL.

### 5.1 Helper (optional but recommended — paste once near RLS section)

```sql
-- Optional: OR-helper for multi-permission SELECT policies.
CREATE OR REPLACE FUNCTION app.has_any_org_permission(org_id uuid, VARIADIC required_permissions text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_assignments ra
    INNER JOIN public.role_permissions rp ON rp.role_id = ra.role_id
    WHERE ra.organization_id = org_id
      AND ra.user_id = app.current_user_id()
      AND rp.permission_key = ANY (required_permissions)
  );
$$;

REVOKE ALL ON FUNCTION app.has_any_org_permission(uuid, text[]) FROM public;
GRANT EXECUTE ON FUNCTION app.has_any_org_permission(uuid, text[]) TO authenticated, service_role;
```

If Lead prefers zero new helpers, expand each policy with `(has_org_permission(…, 'a') OR has_org_permission(…, 'b') OR …)`.

### 5.2 `employee_project_assignments` (team / roster — not money)

```sql
ALTER TABLE public.employee_project_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employee_project_assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS employee_project_assignments_tenant_select ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_insert ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_update ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_tenant_delete ON public.employee_project_assignments;
DROP POLICY IF EXISTS employee_project_assignments_service_all ON public.employee_project_assignments;

CREATE POLICY employee_project_assignments_tenant_select ON public.employee_project_assignments
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_any_org_permission(
      organization_id,
      VARIADIC ARRAY['workforce.read', 'projects.read', 'time.manage']::text[]
    )
  );

CREATE POLICY employee_project_assignments_tenant_insert ON public.employee_project_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_tenant_update ON public.employee_project_assignments
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_tenant_delete ON public.employee_project_assignments
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.manage')
  );

CREATE POLICY employee_project_assignments_service_all ON public.employee_project_assignments
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 5.3 Compensation / employer cost tables

Apply the **same** permission predicates to:

- `employee_month_costs`
- `labor_allocation_runs`
- `labor_allocation_run_lines`

```sql
-- Template: substitute <table> for each of the three tables above.

ALTER TABLE public.<table> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<table> FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS <table>_tenant_select ON public.<table>;
DROP POLICY IF EXISTS <table>_tenant_insert ON public.<table>;
DROP POLICY IF EXISTS <table>_tenant_update ON public.<table>;
DROP POLICY IF EXISTS <table>_tenant_delete ON public.<table>;
DROP POLICY IF EXISTS <table>_service_all ON public.<table>;

CREATE POLICY <table>_tenant_select ON public.<table>
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.cost.read')
  );

CREATE POLICY <table>_tenant_insert ON public.<table>
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.cost.manage')
  );

CREATE POLICY <table>_tenant_update ON public.<table>
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.cost.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.cost.manage')
  );

CREATE POLICY <table>_tenant_delete ON public.<table>
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'workforce.cost.manage')
  );

CREATE POLICY <table>_service_all ON public.<table>
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 5.4 `ap_bill_project_allocations`

```sql
ALTER TABLE public.ap_bill_project_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ap_bill_project_allocations FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_select ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_insert ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_update ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_tenant_delete ON public.ap_bill_project_allocations;
DROP POLICY IF EXISTS ap_bill_project_allocations_service_all ON public.ap_bill_project_allocations;

CREATE POLICY ap_bill_project_allocations_tenant_select ON public.ap_bill_project_allocations
  FOR SELECT TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.read')
  );

CREATE POLICY ap_bill_project_allocations_tenant_insert ON public.ap_bill_project_allocations
  FOR INSERT TO authenticated
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_tenant_update ON public.ap_bill_project_allocations
  FOR UPDATE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  )
  WITH CHECK (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_tenant_delete ON public.ap_bill_project_allocations
  FOR DELETE TO authenticated
  USING (
    app.is_org_member(organization_id)
    AND app.has_org_permission(organization_id, 'ap.manage')
  );

CREATE POLICY ap_bill_project_allocations_service_all ON public.ap_bill_project_allocations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
```

### 5.5 Also recommend in same 0021 pass (existing compensation spine)

`rate_versions` + `labor_cost_components` remain membership-only from earlier migrations. Lead should **re-policy** them in 0021 to `workforce.cost.read` / `workforce.cost.manage` (same predicates as §5.3). Agent 2 did **not** edit 0000–0020.

### 5.6 Catalog seed

No migration inventiveness required beyond RLS: `PERMISSION_CATALOG` already drives `drizzle/seed/system.ts`. After merge, run system seed (or ensure migrate path seeds new permission rows) before relying on `has_org_permission(..., 'workforce.cost.*')`.

---

## 6. Tests run

```text
npx vitest run tests/unit/workforce/worker-compensation-authz.test.ts tests/unit/shared/permissions.test.ts
```

(See shell output in session.)

**Proven:**

- Worker compensation / employer cost **READ = NO** (even if `workforce.read` is added)
- Worker compensation / employer cost **WRITE = MUST BE NO**
- Worker AP allocation read/write = NO
- Finance: cost read+manage YES; Manager: cost read YES / manage NO

---

## 7. Findings

### BLOCKER

1. **0021 RLS membership-only on cost tables** — Lead must paste §5.3 / §5.4 before apply. Membership alone exposes private employer cost.

### HIGH

2. **`rate_versions` / `labor_cost_components` still membership-only** in applied migrations — re-policy in 0021 (§5.5) or residual client-path leak remains even after app asserts.
3. **Existing-org role_permissions backfill** for `workforce.cost.*` on manager/finance (and owner already has all only if re-provisioned / backfilled).

### MEDIUM

4. Time-entry export / list APIs still load `cost_amount` under `workforce.read` at the repository; export now redacts columns without cost/financials — full list API redaction not done (snapshotted Actual vs compensation master).
5. Employee CSV import gated by `workforce.manage` only — if import carries rates, should also require `workforce.cost.manage` when Agent 3 wires advanced import.
6. Optional `app.has_any_org_permission` helper (§5.1) — Lead call.

### Not findings / explicit non-goals

- No parallel permission system invented.
- No 0021 SQL edited by this agent.
- Assignment ≠ Actual unchanged; payment ≠ Actual unchanged.

---

### Lead integration (2026-08-10)

BLOCKER closed in unapplied `0021_workforce_contacts_and_allocations.sql`:

- Seed `workforce.cost.read` / `workforce.cost.manage`
- Backfill owner/manager/finance `role_permissions`
- `app.has_any_org_permission`
- Permission-aware RLS on assignments, month costs, labor runs/lines, AP bill allocations
- Re-policy `rate_versions` + `labor_cost_components` to cost keys (HIGH §5.5)

App asserts from Agent 2 remain in place. **0021 still unapplied.**
