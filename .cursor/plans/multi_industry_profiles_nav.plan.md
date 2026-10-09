---
name: Multi-industry profiles & nav
overview: Reuse org business profiles, project experience profiles, and project delivery modes to tune navigation, modules, templates, and execution chrome for construction/engineering/consulting—without separate products or disabling modules that already have data. Baseline 2f13eec6.
todos:
  - id: profile-audit-doc
    content: "Document DEVELOPER_GC vs GENERAL_CONTRACTOR (project mode vs org profile) in implementation notes"
    status: pending
  - id: consulting-uwm-modules
    content: "Additive work_management: GENERAL_CONTRACTOR, RENOVATION, ELECTRICAL, PLUMBING, HVAC, SMALL_WORKS, ARCHITECT, DESIGNER, ENGINEERING_CONSULTANT, PROJECT_MANAGEMENT"
    status: pending
  - id: persona-nav-portfolio
    content: "Elevate portfolio/myWork in consulting+architecture persona primary nav (experience-nav-layout)"
    status: pending
  - id: fab-task-quick-create
    content: "Add task action to buildQuickCreateActions (TASKS_CREATE + work_management)"
    status: pending
  - id: gc-execution-defaults
    content: "GC project-create guidance + smart defaults only; NO auto developer_gc; NO lite hub SEC-004 bypass; reuse existing execution when mode explicit"
    status: pending
  - id: profile-task-template-seeds
    content: "Seed org project task templates per business profile on apply (new file + seed hook)"
    status: pending
  - id: consultant-scale-ux
    content: "Saved views + clientId filter on /work; portfolio pagination (reuse portfolio pattern)"
    status: pending
  - id: tests-acceptance
    content: "Unit tests: profiles, nav visibility, execution gate, quick-create task gating"
    status: pending
isProject: true
---

# Multi-industry business profiles — implementation plan (annex)

> **Authority:** [planner_plus_multi_industry_master.plan.md](planner_plus_multi_industry_master.plan.md). Approved profile list + GC guidance only (no auto developer_gc, no lite hub bypass).

**Baseline:** `2f13eec6` · **Scope:** configuration + nav/UX only · **Out of scope:** merge planning↔tasks, new ERP forks, SQL without Owner approval.

## Architecture (reuse, do not fork)

| Layer | Source | Role |
|-------|--------|------|
| Org business profile | `src/modules/tenancy/domain/business-profiles.ts` | `visibleModules`, terminology, quick-create emphasis, cost categories, domains |
| Apply profile | `apply-business-profile.ts` | Settings JSON + **additive** module ON + `seedBusinessProfileSetup` |
| Module visibility | `resolveModuleVisibility` in `types.ts` | Explicit `enabled` wins; else `firstUsedAt` → visible; **never auto-OFF modules with usage** |
| UX persona | `experience-persona.ts` | Maps profile → `architecture` / `consulting` / `project_contractor` / `service` / … |
| Nav catalog | `src/components/shell/navigation.ts` + `experience-nav-layout.ts` | Permission + `module` gate + persona primary/mobile grouping + `experience-complexity` |
| Project tabs | `project-profiles.ts` | `consulting` allowlist for design/engineering org profiles |
| Execution chrome | `management-mode.ts` + `select-execution-nav-links.ts` | **`developer_gc` = both `developer` + `general_contractor` operating roles on the project** — not an org profile key |
| Structure templates | `business-profile-setup.ts` → org bag in settings | Work packages, milestones, BOQ skeleton on apply |
| Task templates | `settings/project-task-templates` + `instantiate-org-project-task-templates.ts` | Canonical tasks on **project create** (separate from structure templates) |

**Important:** There is **no** `DEVELOPER_GC` in `BUSINESS_PROFILE_KEYS`. Legacy `main_contractor` → `GENERAL_CONTRACTOR`. Dev/GC execution is **per-project** delivery profile.

---

## Gap analysis (audit §D, §E, §F + capability B.5)

| Gap | Audit | Root cause today | Planned fix (minimal) |
|-----|-------|------------------|------------------------|
| GC without Dev+GC profile | §D PARTIAL | `shouldShowExecutionNavGroup` requires `isDeveloperGcMode` (both roles) | **Owner approved:** project-create **guidance** + smart defaults only; **no** auto `developer_gc`; **no** SEC-004 bypass; execution when mode **explicitly** set |
| Solo contractor FAB | §G scenario 1 | `buildQuickCreateActions` has no task; My Work behind `work_management` | Task FAB entry → `/work?new=1` (or equivalent); enable `work_management` on trade/small profiles **additively** where tasks are day-one |
| Consultant ~400 projects nav | §E, §G scenario 3 | `ENGINEERING_CONSULTANT` omits `work_management`; `/portfolio` module-gated; list caps | Add `work_management` to consulting profiles; persona-primary `portfolio`; wave-2 saved views + `clientId` filter (audit §N wave 1–2) |
| Task template defaults | B.5 + PM-001 | Structure templates seeded; **org project task templates not profile-seeded** | Profile-specific task template seeds on apply + Settings editable copies |
| Schedule ↔ tasks | B.5 PM-005 | Known partial | **Out of this plan** (optional later) |

---

## Implementation phases

### Phase 0 — Product decisions (Owner, before code)

1. **GC execution without dual role:** Prefer (A) onboarding/create defaults + copy in management mode panel, or (B) expose a **reduced** execution link set for GC org profile on `standard_project` (claims/coordination only). (B) touches `execution-route-catalog.ts` + SEC-004 deep-link audit.
2. **Consulting module breadth:** Confirm `work_management` ON by default for new consulting/architecture orgs (existing orgs: additive apply or Settings toggle only — **no forced OFF**).

### Phase 1 — Profile & module visibility (no data loss)

- **`business-profiles.ts`:** Add `work_management` to `visibleModules` for `GENERAL_CONTRACTOR`, `RENOVATION`, `ELECTRICAL`, `PLUMBING`, `HVAC`, `SMALL_WORKS`, `ARCHITECT`, `DESIGNER`, `ENGINEERING_CONSULTANT`, `PROJECT_MANAGEMENT` (additive only).
- **`apply-business-profile.ts`:** Keep default `moduleMode: 'additive'`. Document that re-applying profile must not set `enabled: false` for keys with `firstUsedAt` (extend `setModulePreference` path if any backfill uses `replace`).
- **`experience-complexity.ts`:** Verify `portfolio`, `myWork` remain in `SIMPLE_SHELL_NAV_KEYS` for consulting personas (already present).
- **`experience-nav-layout.ts`:** Adjust `PERSONA_PRIMARY_NAV_KEYS` for `architecture` / `consulting` to surface `portfolio` or `myWork` in mobile core (replace lower-priority slot, e.g. `time` → `portfolio` for consulting).

### Phase 2 — Quick wins (FAB + GC hint)

- **`quick-create-actions.ts` + locales:** New action `task` when `permissions.has(TASKS_CREATE)` && `modules.work_management`; href `/work` with create query; respect `limitQuickCreateForPersona` if extended.
- **`QuickCreateEmphasisKey`:** Optional `task` key + profile emphasis for `SMALL_WORKS`, trades, consulting (ordering only).
- **`project-create-form.tsx`:** Default `managementMode` from org profile (`GENERAL_CONTRACTOR` → keep `standard_project` but show recommended `developer_gc` when org also has dev-like modules — or default `developer_gc` only when Owner chooses option A).

### Phase 3 — Template defaults per profile (tasks)

- **New:** `src/modules/tenancy/domain/profile-task-template-seeds.ts` (or extend `business-profile-setup.ts`) with per-profile checklist titles (e.g. architecture: Concept review, Client review, IFC; consulting: Kickoff, Analysis, Draft report, Delivery).
- **`seed-business-profile-setup.ts` or dedicated seeder:** Insert org project task templates (idempotent by name) via existing repository patterns in `manage-org-project-task-templates.ts`.
- **`settings/templates`:** No change required; structure templates already seeded via `projectTemplateKeys` (`architecture_project`, `consulting_engagement`, etc.).
- **Verify:** `create-project.ts` continues to call `instantiate-org-project-task-templates` after create.

### Phase 4 — Consultant scale (nav UX, not schema)

- Reuse audit §N items 1–2: `SavedListViewsBar` on `/work/*`, `clientId` on task filters.
- `/portfolio` default page size + load-more (read existing portfolio list API caps).

### Phase 5 — Execution nav (conditional on Owner Phase 0)

- If (A): docs + default mode only.
- If (B): `select-execution-nav-links.ts` + `execution-hubs.ts` — new predicate e.g. `shouldShowGcExecutionLite(profile, deliveryProfile, orgBusinessProfile)`; keep `requireDeveloperGcExecutionPage` on full hubs; add guards to any new lite routes.

---

## File ownership

| Area | Primary files | Notes |
|------|---------------|--------|
| Profile definitions | `business-profiles.ts`, `business-profile-setup.ts`, `profile-catalog-seeds.ts` | Single source of preset lists |
| Apply / seed | `apply-business-profile.ts`, `seed-business-profile-setup.ts`, `onboarding-experience.ts` | Additive modules only for existing tenants |
| Module prefs API | `organizations.repository.ts`, `settings` features panel | Owner toggles override profile |
| Nav | `navigation.ts`, `experience-nav-layout.ts`, `experience-complexity.ts`, `shell-org-settings.ts` | No new routes required for phase 1 |
| Persona / preview | `experience-persona.ts`, `experience-preview.ts` | Tests in `tests/unit/tenancy/` |
| Project UX | `project-profiles.ts`, project layout tab filter | Consulting tab set already mapped |
| Execution gate | `management-mode.ts`, `select-execution-nav-links.ts`, `require-developer-gc-execution.ts`, `execution-route-catalog.ts` | SEC-004 alignment |
| Quick create | `quick-create-actions.ts`, `experience-quick-create.ts`, `quick-create.tsx` | FAB already `data-pf-quick-create="fab"` |
| Task templates | `instantiate-org-project-task-templates.ts`, `manage-org-project-task-templates.ts`, `settings/project-task-templates/*` | Seed on profile apply |
| Structure templates | `projects/domain/templates.ts`, `apply-org-template.ts`, `settings/templates/*` | PM-001 coverage in tests |
| Tests | `business-profiles.test.ts`, `persona-ux-matrix.test.ts`, `project-profiles.test.ts`, nav unit tests | Extend matrix for new modules |

---

## Dependencies

- **Permissions:** `TASKS_READ` / `TASKS_CREATE`, `OPERATIONS_READ` for UWM surfaces unchanged.
- **Foundations:** Enabling `work_management` may require no extra foundations (not in `requiredFoundationsFor` chain for core modules — verify in `capability-registry.ts` before implement).
- **Project create:** Delivery profile / management mode persisted via existing project-profile flows.
- **i18n:** `shell.json` / `quickCreate` keys for task FAB; no new business profile enum → no migration of stored profile keys.
- **Audit follow-ups:** PM-011 labels (schedule vs task timeline) orthogonal; PM-003 field dual-stack unchanged.

---

## Migrations

**Likely none** for Phases 1–3 (org settings JSON + module preference rows only).

**Prepared-only (Phase 4+, Owner approval):** trigram/GIN for task title search per audit §N — not required for nav/profile work.

**Do not:** run backfill that sets `enabled: false` on modules with existing `firstUsedAt` or tenant data.

---

## Acceptance criteria

1. New org selecting `ENGINEERING_CONSULTANT` / `ARCHITECT` / `DESIGNER` sees **`/portfolio` and `/work`** in nav (with permissions), without enabling unrelated ERP modules (procurement, boq, etc.).
2. Existing org with data: re-run profile apply in **additive** mode does not hide modules that were used (`firstUsedAt` set).
3. Solo trade user (`SMALL_WORKS` or `ELECTRICAL` if in scope) can create a task from global Quick Create FAB without opening a project first.
4. New consulting org receives **editable** org project task templates matching profile seeds; creating a project instantiates template tasks once.
5. Structure templates from profile still appear under Settings → Templates; apply on project unchanged.
6. Project with `developer_gc` management mode shows execution nav; project with GC org but `standard_project` mode behaves as today **unless** Owner-approved Phase 0 option (B) shipped.
7. Unit tests updated for profile `visibleModules`, persona primary nav keys, and quick-create task gating.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Turning `work_management` ON exposes large UWM surface to calm consulting UX | Persona nav keeps money/procurement demoted; complexity `simple` hides permission-only overflow |
| GC execution lite bypasses SEC-004 | Keep `requireDeveloperGcExecutionPage` on sensitive routes; lite set explicitly allowlisted |
| `replace` module mode on profile switch disables modules | Never use `replace` for existing org backfill; UI warning on “reset profile” |
| Task FAB without project context | Require project picker sheet on `/work?new=1`; match mobile patterns |
| 400-project scale still slow after nav fix | Phase 4 pagination/saved views required for acceptance of scenario 3 “production ready” |

---

## References

- `docs/audits/PROJECTFLOW-PRODUCT-FIT-TASK-MANAGEMENT-2026-10-09.md` — §D, §E, §F, §N
- `docs/audits/PROJECTFLOW-FINAL-SYSTEM-CAPABILITY-MAP-2026-10-09.md` — §B.5, §B.12, §C
