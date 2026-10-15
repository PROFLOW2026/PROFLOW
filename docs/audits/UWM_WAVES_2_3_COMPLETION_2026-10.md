# UWM Waves 2–3 — דוח השלמה

**תאריך:** 15 באוקטובר 2026  
**היקף:** Wave 2 (Planner UX) + Wave 3 (Business Integration)  
**Wave 1:** לא נוגע — ללא QA חוזר

---

## 1. מה הושלם

### Wave 2 — Planner UX

| תחום | סטטוס | תיאור |
|------|--------|--------|
| A. Saved views | ✅ | תצוגות שמורות (`listKey=tasks`) על לוחות **פרויקט** ו-**workspace**, כולל `boardId`, `projectId` ומפתחות פילטר משותפים |
| B. Board pagination | ✅ | כפתור **Load more** + מיזוג משימות ללא כפילות (`mergeTaskCardsById`) בלוחות פרויקט/workspace |
| C. Task detail consistency | ✅ | דף `/tasks/[id]` — ניווט hub, שעות, קישור פרויקט; sheet מלא עם postpone + time log |
| D. Comments / attachments | ✅ | עוגנים `#comments` / `#activity`; מסמכים + evidence ללא שינוי מנגנון |
| E. Mobile | ✅ | `min-w-0` / `max-w-full` בפילטרים ולוח; גלילה אופקית רק בעמודות Kanban (desktop) |

### Wave 3 — Business Integration

| תחום | סטטוס | תיאור |
|------|--------|--------|
| A. Central task detail | ✅ | Hub nav, related work, מסמכים, תגובות, activity, שעות (ב-sheet וב-hub) |
| B. Related work | ✅ | entity links + planning + **אבן דרך**; תוויות/קישורים ל-quote, project (כולל work order) |
| C. Quotes → tasks | ✅ | רשימת משימות מקושרות בדף הצעה; **קישור ידני** (UUID) אחרי המרה לפרויקט — ללא יצירה אוטומטית |
| D. Work orders → tasks | ✅ | קישור `entityType=project` לאותו `projectId` (work order) דרך `linkTaskToBusinessEntity` |
| E. Task Gantt deps | ✅ | `TaskTimelineGantt` + timeline work surface — תלויות FS מ-`task_dependencies` |
| F. Permissions | ✅ | קריאה/קישור דרך `TASKS_READ` + `PROJECT_CAPABILITIES.TASKS_MANAGE`; הצעות — `QUOTES_READ` / `canManage` |

---

## 2. קבצים ששונו (עיקריים)

- לוחות: `_project-board-shell.tsx`, `_board-shell.tsx`, `projects/.../boards/.../page.tsx`, `workspaces/.../boards/.../page.tsx`
- פילטרים/תצוגות: `board-task-filter-keys.ts`, `parse-board-task-list-filters.ts`, `board-url-filters-bar.tsx`, `board-saved-views-chrome.tsx`, `board-task-load-more.tsx`, `board-view.tsx`
- Timeline/Gantt: `task-timeline-gantt.tsx`, `task-timeline-view.tsx`, `task-work-surface-client.tsx`, `list-task-gantt-dependencies.ts`, `map-task-dependencies-to-gantt.ts`, `work/actions.ts`
- עסקי: `list-task-related-work.ts`, `resolve-related-entity-labels.ts`, `task-related-work-href.ts`, `link-task-to-business-entity.ts`, `quote-linked-tasks-section.tsx`, `quote-task-link-actions.ts`
- דף משימה: `tasks/[taskId]/page.tsx`, `task-detail-hub-nav.tsx`, `_task-detail-page-client.tsx`
- i18n: `en/he-IL tasks.json`, `en/he-IL quotes.json`
- בדיקות: `parse-board-task-list-filters.test.ts`, `merge-task-cards-for-ui.test.ts`, `map-task-dependencies-to-gantt.test.ts`

---

## 3–5. יכולות, משטחים, תאימות

- **משתמשים פנימיים:** Work Lens timeline (גantt deps), לוחות פרויקט/workspace (פילטר URL + saved views + load more), דף משימה מרכזי.
- **יזמים/קבלנים:** משימות פרויקט, קישור להצעה אחרי convert, related work (RFI, defects, milestones…).
- **Workspace / יועצים:** לוחות ללא `projectId` — saved views + pagination; לא נכפה project על משימות workspace.
- **Global Quick Create, recurrence, planning engine, contractor/employee presets:** לא שונו במכוון.

---

## 6. בדיקות נקודתיות

| בדיקה | תוצאה |
|--------|--------|
| `parse-board-task-list-filters.test.ts` | ✅ |
| `merge-task-cards-for-ui.test.ts` | ✅ |
| `map-task-dependencies-to-gantt.test.ts` | ✅ |

לא הורצו מחדש בדיקות Wave 1 / E2E / build מלא.

---

## 7. SQL

**לא נדרש.** שימוש ב-`entity_links`, `task_dependencies`, `estimates` קיים.

---

## 8. פערים (תחום UWM בלבד)

- קישור הצעה→משימה: דורש **המרת הצעה לפרויקט** + הזנת UUID (אין picker חכם / חיפוש כותרת).
- WO→משימה: אין UI ייעודי בדף work order — רק API קישור + related work מהמשימה.
- Gantt UWM: קווי תלות FS בלבד; `blocked_by` לא מוצג כ-edge; ללא critical path.
- Assignee/label בפילטר URL של לוח: חלקית (סטטוס, עדיפות, bucket, overdue, blocked).

---

## 9. Git

שינויים מקומיים — לא בוצע commit/push/deploy במסגרת גל זה.

---

## 10. מוכנות Commit / Push / Deploy

**מוכן ל-review מקומי.** Push/deploy רק באישור Owner; לפני release — preflight CI לפי מדיניות הפרויקט.
