# SCHEMA_REQUEST — Planning / Timeline / Gantt V1 (Agent 6)

Lead designs additive `0020+` after overnight reports. Do **not** edit `0000`–`0019` / journal / schema in this wave.

---

## TABLE `planning_work_items`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | FK → organizations |
| `project_id` | uuid NOT NULL | FK → projects |
| `name` | text NOT NULL | |
| `kind` | text NOT NULL | `task` \| `milestone` |
| `start_date` | date NULL | |
| `target_end_date` | date NULL | milestone date when `kind=milestone` |
| `actual_end_date` | date NULL | |
| `progress_percent` | numeric(5,2) NOT NULL DEFAULT 0 | CHECK 0–100 |
| `phase_id` | uuid NULL | FK → phases (same org/project) |
| `work_package_id` | uuid NULL | FK → work_packages (work area) |
| `sort_order` | int NOT NULL DEFAULT 0 | |
| `archived_at` | timestamptz NULL | |
| `created_at` | timestamptz NOT NULL | |
| `updated_at` | timestamptz NOT NULL | |

**Why:** Schedulable rows with start/target/actual, progress, milestone flag, optional phase/work-area link — beyond light project dates already on `projects` / WP / phases.

**CHECK:** `(start_date IS NULL OR target_end_date IS NULL OR target_end_date >= start_date)`  
**CHECK:** `kind IN ('task','milestone')`  
**CHECK:** `progress_percent BETWEEN 0 AND 100`

**Indexes:**
- `(organization_id, project_id)` WHERE `archived_at IS NULL`
- `(organization_id, project_id, work_package_id)`
- `(organization_id, project_id, phase_id)`

**Same-org integrity:**
- `project_id` must belong to `organization_id` (composite FK in 0020)
- `phase_id` / `work_package_id` when set must share org + project — **app guard**
  (0020 has simple FKs; composite phase/WP FKs are a Lead follow-up if desired)
- Prefer trigger/constraint pattern used elsewhere for tenancy

**RLS:** org-scoped select/insert/update (archive) for members with a planning permission (Lead catalogs — suggestion: `planning.read` / `planning.write`).

### Persistence readiness (PRE-SQL Agent D)

Drizzle repository is wired behind `PLANNING_PERSISTENCE_READY` (**default false**).
In-memory store = **test double only**.

Flip checklist:
1. Owner applies `0020_overnight_foundations`.
2. Verify hierarchy + cycle tests against PGlite.
3. Set `PLANNING_PERSISTENCE_READY = true` in `src/modules/planning/domain/persistence.ts`.

---

## TABLE `planning_dependencies`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | |
| `organization_id` | uuid NOT NULL | |
| `project_id` | uuid NOT NULL | |
| `predecessor_id` | uuid NOT NULL | FK → planning_work_items |
| `successor_id` | uuid NOT NULL | FK → planning_work_items |
| `type` | text NOT NULL DEFAULT `finish_to_start` | V1: FS only |
| `created_at` | timestamptz NOT NULL | |

**Why:** Predecessor edges for dependency chain visualization + cycle validation.

**CHECK:** `predecessor_id <> successor_id`  
**CHECK:** `type IN ('finish_to_start')`  
**UNIQUE:** `(project_id, predecessor_id, successor_id)`

**Same-org integrity:**
- both ends on same `project_id` + `organization_id`
- application still rejects cycles (DB cannot cheaply enforce DAG)

**Indexes:**
- `(organization_id, project_id)`
- `(predecessor_id)`, `(successor_id)`

**RLS:** same as work items.

---

## Not requested (explicit deferrals)

- Working calendars / resource tables
- Lag/lead columns (add later if CPM revisited)
- Baseline snapshots / MS Project interchange
- Job-scoped planning forced on `work_kind=job`
