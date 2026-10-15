# UWM Safe Improvement Wave 1 — דוח השלמה

**תאריך:** 2026-10-15  
**היקף:** R1, R2, R3, R4, R5, R8, R16 בלבד  
**SQL / Deploy / Push:** לא בוצע

## 1. שיפורים שהושלמו

| מזהה | סטטוס | סיכום |
|------|--------|--------|
| R1 Checklist | הושלם | UI מחובר ל-`addChecklistItemAction`, `toggleChecklistItemAction`, `removeChecklistItemAction`, `reorderChecklistItemAction` |
| R2 Labels | הושלם | UI מחובר ל-`addLabelAction` / `removeLabelAction` + `listOrgTaskLabelsAction`; מיפוי `labelAssignments` ב-`mapTaskDetailToUi` |
| R3 Archive | הושלם | כפתור ארכיון ב-`TaskDetailActions` → `archiveTaskAction` (soft archive, `TASKS_DELETE`) |
| R4 Assignees | הושלם | `listTaskAssigneeOptionsAction` (פרויקט / חברי workspace); טעינה ב-`TaskDetailSheet` + `syncTaskAssigneesAction` |
| R5 Planning vs Tasks | הושלם | רמז ניווט בלבד (`PlanningVsTasksHint`) — Work, משימות פרויקט, לוח זמנים |
| R8 Buckets | הושלם | `BoardBucketsPanel` — יצירה, שינוי שם, סידור (`createBucketAction`, `updateBucketAction`, `reorderBucketsAction`) |
| R16 Workspace | הושלם | `CreateWorkspaceForm` ב-`/workspaces` → `createWorkspaceAction` (`WORKSPACES_MANAGE`) |

## 2. קבצים עיקריים

- **UI משותף:** `task-detail-sheet.tsx`, `task-checklist-section.tsx`, `task-labels-section.tsx`, `task-detail-actions.tsx`, `task-api.ts`
- **Actions:** `work/actions.ts` (labels org, assignee options, reorder checklist)
- **לוחות:** `board-buckets-panel.tsx`, `_board-shell.tsx`, `_project-board-shell.tsx`
- **Workspaces:** `workspaces/page.tsx`, `_create-workspace-form.tsx`
- **R5:** `planning-vs-tasks-hint.tsx`, `project-schedule-panel.tsx`, `work/page.tsx`, `_project-tasks-page.tsx`
- **i18n:** `he-IL/tasks.json`, `en/tasks.json`
- **בדיקה:** `tests/unit/tasks/map-task-detail-labels.test.ts`

## 3. משטחי משימות שהושפעו

- Hub Work: My Work, לוח גלובלי, רשימה (דרך sheet משותף), לוח שנה, ציר זמן
- Workspaces: רשימה + לוח Kanban
- פרויקט: רשימת משימות, לוח פרויקט, דף משימה מלא `/tasks/[taskId]`
- Planning: טאב לוח זמנים (הסבר + קישורים בלבד)

**לא שונה:** Employee App, Contractor Portal, Quick Create גלובלי, מנוע Planning/UWM, סכמת DB.

## 4. תאימות

- אותה ישות משימה ו-actions קיימים; אין שינוי משמעות `projectId` / `workspaceId` / `bucketId`
- הרשאות: assign/delete/manage workspace כמו בשרת; picker assignees לא מרחיב הרשאות
- ארכיון: soft only; **אין שחזור בממשק** (אין API unarchive בקוד)
- משימות workspace-only: אפשרויות assignee = חברי workspace בלבד

## 5. בדיקות

- `npx vitest run tests/unit/tasks/map-task-detail-labels.test.ts` — **עבר**

## 6. סגירה Wave 1 (2026-10-15 — closeout)

### Archive / Unarchive
- `unarchive-task.ts` + `unarchiveTaskAction` — `TASKS_DELETE`, ללא מחיקה פיזית
- צפייה: מסנן Work `archived=true` → `archivedOnly` ברשימות (`listTasksPage` / `countTasksMatching`)
- UI: שחזור ב-`TaskDetailActions`; משימה בארכיון — צפייה + שחזור, עריכה חסומה
- פעילות: `automation_changed` עם `{ action: 'unarchived' }` (ללא שינוי enum DB)

### Work list
- `/work/list` מעביר `canAssign` / `canArchive` ל-`TaskDetailSheet`
- במצב ארכיון: bulk ו-inline edit מושבתים; sheet + שחזור פעילים למורשים

### בדיקות closeout
- `map-task-detail-labels.test.ts`, `work-task-archived-filter.test.ts`, `unarchive-task.test.ts` — **עברו**

## 7. פערים שנותרו (מכוון / מחוץ scope)

- אין יצירת תגית חדשה מתוך sheet
- אין מחיקת bucket
- Checklist/buckets/workspace — ללא unit tests ייעודיים נוספים (לוגיקה דרך actions קיימים)

## 8. SQL

**לא נדרש.** לא הורץ migration.

## 9. Git / Release

שינויים מקומיים; **לא commit, לא Push, לא Deploy** (אלא אם Owner אישר בנפרד).
