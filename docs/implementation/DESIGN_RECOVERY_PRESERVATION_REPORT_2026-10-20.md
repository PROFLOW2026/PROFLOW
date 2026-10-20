# Design work recovery — preservation & regression inventory

**Date:** 2026-10-20  
**Scope:** Preserve local work; inventory Phase 2 damage. **No** push, deploy, SQL, commit.  
**Vendors:** Frozen at owner-recovered state (not modified in this task).

---

## 1. Recovery point created

### Off-tree backup (explicit)

```
C:\Users\ERAN YOSEF\AppData\Local\Cursor\AgentStores\cursor_agent_stores\u296407457\files\projectflow-design-recovery-2026-10-20\
```

Contains: `HEAD.txt` (`d9b79f4c`), `git-status-sb.txt`, `changed-files.txt`, `changed-design-scope.txt`, `untracked-files.txt`, **`worktree-vs-head.patch`** (full diff), `MAIN_APP_ROUTE_MANIFEST.snapshot.json`.

In-repo pointer: [`docs/implementation/backups/design-recovery-2026-10-20/README.md`](backups/design-recovery-2026-10-20/README.md)

**No** `checkout` / `reset` / `clean` was run.

---

## 2. Files preserved (current working tree)

| Bucket | Count / note |
|--------|----------------|
| **All paths diff vs HEAD** | **360 files** (+2,799 / −1,455 lines) |
| **Main App pages** `(app)/` | ~182 page files touched (manifest `codeTouched`) |
| **Modules + patterns** | CRM, billing, expenses, workforce, reports, project-workspace, vendors data layer, etc. |
| **Design docs / scripts** | `MAIN_APP_*`, codemods, sync scripts, forensic reports |
| **Untracked (design-relevant)** | e.g. `src/app/[locale]/(app)/vendors/vendors-list-owner.css`, backup README, progress tracking doc |
| **Unrelated noise in diff** | `.cursor/plans`, CAD audit, `tests/e2e/.world.json`, `public/pf-cad/fonts/.gitkeep` — **not** design rollout |

**FAB:** `src/components/shell/quick-create*.tsx` — **no diff vs HEAD**.

---

## 3. Regression scope (Phase 2 vs today)

### Confirmed incident chain

1. **`git checkout` on `(app)/`** — dropped **uncommitted** deep UI (not in `d9b79f4c`).
2. **Recovery codemods** — re-wrapped many routes with `MainAppPage` / `MainAppSection` only → **574 TS errors**, then partial file restore from `git show HEAD:path`.
3. **False progress** — manifest briefly showed **~250 COMPLETE/IMPLEMENTED** from pattern scan; **not** equivalent to pre-checkout quality.

### Vendors (documented + repaired earlier)

Regression and repair: [`VENDORS_REGRESSION_FORENSIC_2026-10-20.md`](VENDORS_REGRESSION_FORENSIC_2026-10-20.md).  
**Current:** 8 columns, owner CSS wired, 10/20/50, mobile Popover, «ספק חדש» — **do not rework** until Owner approves.

### Likely loss pattern (other routes)

| Area | High risk | Why |
|------|-----------|-----|
| **Project workspace tabs** | Many `screen.tsx` | Checkout reverted page/tab wrappers; codemods may not restore tab **content** depth |
| **Lists** | Ops, assets, field-ops | Table shell without restored columns/toolbars/pagination |
| **Forms** | Long captures (expenses) | `MainAppFormGrid` partial vs full grid layout pre-Phase 2 |
| **Reports** | `/reports` | Module workspace may survive; pre-checkout page layout uncertain |
| **Settings** | Panels | `MainAppSection` on pages; list panels (people, API) may lack table shells |
| **Mobile** | Per-route | Only vendors has verified owner mobile contract in code |

**201 routes** → `completionStatus: WRAPPER_ONLY` (shell only in trace).  
**44** → `PARTIAL`.  
**5** → `STRUCTURE_COMPLETE` (code minimum, **not** owner-approved):

- `/vendors` (owner list contract)
- `/reports`, `/reports/preview`
- `/dispatch`
- (one additional LIST meeting report workspace — verify in manifest)

**7** → `NOT_STARTED` (redirect-only aliases).

---

## 4. What can be restored with confidence

| Source | Restore |
|--------|---------|
| **`worktree-vs-head.patch`** | Entire current tree vs `d9b79f4c` (already applied as working tree) |
| **`git show HEAD:path`** | Per-file **pre-design** baseline (destructive for that file only) |
| **Module files still in diff** | CRM/financials/billing/report-packs sections — likely kept Phase 2 module work |
| **Vendors** | Repository list fields + repaired UI + untracked CSS |
| **Commit `d9b79f4c`** | Last committed Main App baseline (narrow list tightenings) |

---

## 5. What cannot be restored without missing data

- **Uncommitted UI never committed and overwritten by checkout** — not in git, not in patch unless re-applied manually; **no stash** contained design work (`stash@{0}` = audit JSON only).
- **Owner pixel-approved state** per screen — never recorded (`visualVerified: 0`, `ownerApproved: 0`).
- **Exact pre-Phase 2 per-route column/toolbar specs** except vendors (documented in chat/forensic).

---

## 6. Progress tracking (fixed)

See [`MAIN_APP_PROGRESS_TRACKING.md`](MAIN_APP_PROGRESS_TRACKING.md).

| Metric | Count (after conservative sync) |
|--------|----------------------------------|
| **`codeTouched`** (git diff) | **182** routes |
| **`implementationPipeline: CODE_TOUCHED`** | **182** |
| **`VISUALLY_VERIFIED` / `OWNER_APPROVED`** | **0** |
| **`completionStatus: WRAPPER_ONLY`** | **201** |
| **`PARTIAL`** | **44** |
| **`STRUCTURE_COMPLETE`** | **5** (code minimum only) |
| **Legacy `COMPLETE` / auto `IMPLEMENTED` flood** | **Removed** from sync rules |

Phase 2 report claim **250 COMPLETE** — **retracted**; it counted patterns, not product-ready UI.

---

## 7. Git state (exact)

```
Branch: main (ahead of origin/main by 1)
HEAD:   d9b79f4c — "Tighten main-app lists and hide saved-view controls."
Working tree: 360 files modified vs HEAD; untracked includes vendors-list-owner.css + backup/progress docs
Commit: none in this preservation task
```

---

## 8. Stop

**No further design fixes** in this task.  
**Broad design rollout:** paused.  
Await Owner: confirm backup location, review vendors, then decide next selective recovery targets.
