# PROJECTFLOW — התאמת מוצר וניהול משימות (Gap Analysis)

| שדה | ערך |
|-----|-----|
| **תאריך** | 2026-10-09 |
| **סוג משימה** | ניתוח התאמת מוצר + ניהול משימות — **READ ONLY** |
| **Baseline קוד** | `2f13eec60b827c2e34caa5b7b6e1fed19486abff` (`2f13eec6`) |
| **Production** | לא נגע; אין E2E / load tests / SQL |
| **סוכני משנה** | **8** במקביל (A–H) — ראו §0 |
| **מסמכי בסיס** | [PROJECTFLOW-FINAL-SYSTEM-CAPABILITY-MAP-2026-10-09.md](./PROJECTFLOW-FINAL-SYSTEM-CAPABILITY-MAP-2026-10-09.md) · [complete_implementation_master.plan.md](../../.cursor/plans/complete_implementation_master.plan.md) · [PROJECTFLOW_PLANNER_PLUS_CURRENT_STATE_MAP_2026-09-21.md](./PROJECTFLOW_PLANNER_PLUS_CURRENT_STATE_MAP_2026-09-21.md) · [PROJECTFLOW_WORK_MANAGEMENT_PLANNER_AUDIT_2026-09.md](./PROJECTFLOW_WORK_MANAGEMENT_PLANNER_AUDIT_2026-09.md) |

**מקרא ראיות (חובה):**

| תג | משמעות |
|----|--------|
| **מיושם בקוד** | schema + actions + routes |
| **מאומת בבדיקות** | Vitest integration/unit (PGlite) — לא Production |
| **לא אומת** | אין ראיה executable מספקת / לא בדפדפן |
| **חלקי** | יכולת קיימת עם פער UX, קישור, או scale |
| **חסר** | אין מימוש למטרה המוצרית |
| **נדחה על ידי Owner** | החלטת מוצר — לא פגם |

---

## §0 — מתודולוגיה וסוכני משנה

Lead הפעיל **8 סוכני Cursor Task** במקביל (לא חוזר על מלאי 387 routes / 14 סוכנים מגל 2026-10-09):

| סוכן | תחום | מזהה |
|------|------|------|
| A | ליבת ניהול משימות | [94269464-dd49-46c9-a89c-9bcc3d02639f](94269464-dd49-46c9-a89c-9bcc3d02639f) |
| B | השוואה ל-Microsoft Planner | [6d6fb731-907f-4c4a-bf04-6a4880eac53e](6d6fb731-907f-4c4a-bf04-6a4880eac53e) |
| C | קבלני בנייה | [eb711b0b-51d6-4c9f-9044-becf2a7e7a57](eb711b0b-51d6-4c9f-9044-becf2a7e7a57) |
| D | הנדסה ואדריכלות | [94dbe7f9-0a93-4ce9-83ce-1d194c90e639](94dbe7f9-0a93-4ce9-83ce-1d194c90e639) |
| E | מפתחים ומנהלי פרויקטים | [aa8f5e3c-e645-4213-a1cf-8d114418b685](aa8f5e3c-e645-4213-a1cf-8d114418b685) |
| F | Scale & performance | [4bf98f38-e899-49c8-8b0f-31f892b535ee](4bf98f38-e899-49c8-8b0f-31f892b535ee) |
| G | UX, מובייל, RTL | [9a60e4de-5930-4459-991d-3a7c71caa8b6](9a60e4de-5930-4459-991d-3a7c71caa8b6) |
| H | ארכיטקטורת אינטגרציה | [6a7704f3-203c-4b7b-a27d-dce07f84ef47](6a7704f3-203c-4b7b-a27d-dce07f84ef47) |

**הערה:** חלק מממצאי ביקורת ספטמבר 2025 **מיושנים** מול HEAD (גרירה ב-`/work/board`, תקרות 500, cron תזכורות, קבצים בעובד, `clientName` על כרטיס). סוכן B אימת מול הקוד הנוכחי.

---

## A — סיכום מנהלים: מסקנת התאמת מוצר

### A.1 האם ProjectFlow יכול לשרת את תעשיית הבנייה, השיפוצים, ההנדסה והייעוץ?

**תשובה מדורגת (מבוססת קוד, לא Production):**

| פלח | התאמה יומיומית | הערה |
|-----|----------------|------|
| **קבלן קטן–בינוני (חשמל, אינסטלציה, שיפוצים)** | **כן — חלקי–טוב** | פרויקטים, משימות UWM, עובדים, הוצאות, חיוב — **מיושם בקוד**; FAB ללא משימה org-wide; תמונות ב-tab נפרד **חסר** |
| **קבלן ראשי / Dev+GC** | **כן — חזק** | hubs ב-`…/execution`, קבלנים, תביעות, RFI, site-log — **מיושם**; profile `developer_gc` נדרש ל-nav מלא |
| **יועץ הנדסי / משרד 15–50 עובדים, מאות פרויקטים** | **כן — חלקי** | פרופיל `ENGINEERING_CONSULTANT`, מסמכים, שרטוטים (`project-plans`), משימות — **מיושם**; **תקרות רשימה** ו-**לוח עבודה cross-project** חלשים ב-700 פרויקטים |
| **משרד אדריכלות / עיצוב** | **כן — חלקי** | תבנית `architecture_project`, CD/review — **מיושם**; לא BIM/markup/transmittal ייעודי |
| **יזם / PMO / משרד ניהול פרויקטים** | **כן — חלקי–טוב ל-GC** | `/portfolio`, `/operations`, `/meetings`, Dev/GC — **חלקי** לתוכנית רב-פרויקטית אחת ואישורי CO ב-`/approvals` |
| **קבלן 300 עובדים / 1,000 פרויקטים** | **סיכון scale — לא מוכח** | אינדקסים סבירים; **prefetch My Work 9×100**, admin `inArray(workspace)`, חיפוש ILIKE — **סיכון בקוד** ללא מדידה |

**מסקנה:** ProjectFlow **אינה** ERP לכל מקצוע בלבד — היא **פלטפורמת פרויקט+כספים+שטח** עם **מנוע משימות UWM בוגר**, הניתן **להצר** בפרופיל עסק (ארכיטקט / יועץ) או **להרחיב** (Dev/GC). **לא** מתאימה כמערכת עיצוב/BIM ייעודית או PMO enterprise מלא ללא עבודה around caps ו-dual schedule.

### A.2 האם ניהול המשימות שווה ל-Microsoft Planner?

**תשובה:** **כן בליבה הטכנית, לא ב-parity חוויית “יום-יום” מלא.**

- **שווה או עדיף** ב: buckets + DnD בלוח פרויקט, multi-assignee, checklist, תלויות, שעות על משימה, workload, portfolio, קישור לפרויקט/לקוח/כספים, Employee App.
- **נמוך מ-Planner** ב: **מרכז עבודה אישי אחד** (My Tasks + My Day + grid עם עמודות שמורות), **Schedule עם רשימת unscheduled + גרירה לתאריך**, **תצוגות שמורות על משימות**, **ingestion מ-Teams/Outlook** (לא נדרש לבנייה — **נדחה** PM-012).
- **שונה במכוון:** `/work/board` = **עמודות סטטוס org-wide**, לא buckets של “תוכנית” — Planner חי בתוך plan buckets; PF דורש **פרויקט → board**.

### A.3 מה חייב להשתפר כדי להגיע לסטנדרט?

ראו **§M–§N**. בקצרה: (1) **מרכז משימות org** עם סינון/תצוגות שמורות + סינון לקוח; (2) **הפחתת פיצול קognitive** (planning vs tasks vs calendar lenses) ב-UI; (3) **מובייל owner** — תוויות My Work, יצירה מהירה מ-FAB; (4) **scale** — lazy My Work, תיקון `assigned_to_me` unbounded; (5) **אופציונלי:** קישור planning↔task (0110 DB קיים, app לא).

---

## B — השוואה מפורטת ל-Microsoft Planner

**מקורות Planner (מאומתים חיצונית):** [Buckets](https://support.microsoft.com/en-us/planner/create-buckets-to-sort-your-tasks), [Labels](https://support.microsoft.com/en-us/planner/flag-your-tasks-with-labels), [My Tasks / My Day](https://support.office.com/en-us/article/Manage-tasks-in-Planner-ee61ecb0-a0bb-4c39-8682-f47fe7674f05), [Schedule view](https://support.microsoft.com/en-us/planner/training/use-schedule-view-in-microsoft-planner).

| יכולת Planner (workflow) | ProjectFlow | ראיה (route + קוד) | פער |
|--------------------------|-------------|-------------------|-----|
| Kanban buckets | **HAS** (פרויקט/workspace) | `/projects/[id]/boards/[boardId]`, `board-view.tsx`, `move-task-to-bucket.ts` | Global board = סטטוס, לא buckets |
| Drag between buckets | **HAS** | `BoardView` + `onMoveTask` | — |
| Group by assignee/label/priority | **HAS** | `board-view.tsx` GroupBy | רק בלוח פרויקט |
| Labels + filter | **HAS** | `task_labels`, filters | — |
| Progress / status | **HAS** (עשיר יותר) | `lifecycle.ts`: todo…done + in_review/blocked | יותר מ-3 מצבי Planner |
| Multi-assignee | **HAS** | `task_assignees` | — |
| Checklist | **HAS** | `task_checklist_items` | — |
| Comments + attachments | **HAS** | `/tasks/[id]`, `document_links` | M365 vs cloud folders |
| My Tasks (כל התוכניות) | **PARTIAL** | `/work` — `my-work-view.tsx` | אין My Day נפרד; Today מעורב |
| Board in personal hub | **PARTIAL** | `/work/board` status columns | לא grouped by plan |
| Grid / spreadsheet | **PARTIAL** | `task-list-view.tsx` | אין hide/reorder columns כמו Planner |
| Schedule + unscheduled sidebar | **PARTIAL** | `/work/calendar` | read-mostly; **אין** drag-to-date |
| Timeline / Gantt ב-Planner sense | **PARTIAL** | `/work/timeline` = tasks | Gantt = `?tab=schedule` נפרד |
| Saved filter views | **MISSING** (tasks) | `SavedListViewsBar` רק `/portfolio` | — |
| Search in plan | **PARTIAL** | `global-search.ts`, cap 8/kind | — |
| Charts | **PARTIAL** | `/work/insights` | project-level ב-portfolio |
| Recurring | **PARTIAL** | `task-recurrence-ops-worker.ts` | העתקים דלים (תזכורות/קבצים) |
| Workload / capacity | **HAS** (מעבר ל-Planner בסיסי) | `/workload`, `get-team-workload.ts` | reassign stub |
| Teams/Outlook tasks | **MISSING** | — | **נדחה** PM-012 |
| Dependencies | **HAS** (Planner אין FS אמיתי) | `task_dependencies` | **לא** enforce אוטומטי |

**חמישה יתרונות PF להקשר בנייה (לא להעתיק מ-Planner):** קישור P&L/חיוב; Employee App + שעות; WIP buckets; תלויות FS; שכבת Gantt נפרדת ל-%/אבני דרך.

---

## C — מטריצת יכולות משימות ProjectFlow (UWM)

מקור: `drizzle/schema/tasks.ts`, `src/modules/tasks/`, סוכן A.

| יכולת | סטטוס | ראיה |
|--------|--------|------|
| יצירה / עריכה | **מיושם בקוד** | `create-task.ts`, `update-task.ts`, `/work/actions.ts` |
| מחיקה | **חלקי** | `archive-task.ts` בלבד — אין hard delete |
| lifecycle / status | **מיושם בקוד** | `domain/lifecycle.ts` |
| priority, due, start, completion | **מיושם בקוד** | עמודות `tasks` |
| multi-assignee | **מיושם בקוד** | `task_assignees` |
| checklist | **מיושם בקוד** | `manage-checklist.ts` |
| subtasks (depth 1) | **מיושם בקוד** | `parent_task_id`, `subtasks.ts` |
| recurring | **חלקי** | `process-recurrence-occurrences.ts`, cron יומי |
| templates | **מיושם בקוד** | `/settings/task-templates`, org project templates |
| comments | **מיושם בקוד** | `task_comments` |
| attachments / cloud | **מיושם בקוד** | `task-attachments.ts` — **מאומת בבדיקות** `task-attachments.test.ts` |
| activity | **מיושם בקוד** | `task_activity` |
| notifications | **חלקי** | `scanTaskReminders`, `runTaskReminderOpsWorker` — **לא אומת** Production; inbox עובד חלש |
| permissions | **מיושם בקוד** | `tasks.*`, module `work_management` |
| dependencies | **חלקי** | `set-dependency.ts` — **ללא** auto-block |
| duplicate | **חלקי** | ללא comments/files/time |
| followers | **חלקי** | org_member בלבד |
| client on card | **מיושם בקוד** | `map-tasks-for-ui.ts` → `clientName` |
| vendor on task | **חסר** | אין שדה; קבלן via `task_external_assignments` / collaboration |

---

## D — התאמה: קבלני בנייה (סוכן C)

| סוג | התאמה | מסכים / מודולים |
|-----|--------|------------------|
| Dev+GC / קבלן ראשי גדול | **FIT** | `…/execution`, claims, contractors, site-log, portal |
| GC ללא profile Dev+GC | **PARTIAL** | tabs פרויקט + `/field-ops`; **אין** execution nav |
| שיפוצים / trades קטנים | **PARTIAL** | `?tab=work`, tasks, employee; **POOR** אם מצפים FAB+crew |
| קבלן משנה (portal) | **FIT** scoped | `/contractor/projects/…/tasks` — **מאומת בבדיקות** collaboration |

**קישור משימה → שטח:** חזק ל-**אנשים, קבלן, תמונות (portal), שעות**; **חלש** ל-**חומרים, יומן שטח, claim אוטומטי, instruction→CO** (PM-004).

---

## E — התאמה: הנדסה ואדריכלות (סוכן D)

| צורך | מצב |
|------|-----|
| מאות פרויקטים במקביל | **חלקי** — `/portfolio` default 25; task list cap 50–500 |
| שרטוטים / revisions | **חזק** — `src/modules/project-plans/` |
| RFI / submittals | **מיושם** — semantics GC; vendor-centric |
| משימות review (`in_review`) | **מיושם** |
| BIM / markup / transmittal | **חסר** — לא יעד המוצר |
| פורטל לקוח חיצוני | **נדחה** UI-001/002 |

פרופילים: `business-profiles.ts` — `ARCHITECT`, `DESIGNER`, `ENGINEERING_CONSULTANT`.

---

## F — התאמה: מפתחים ומנהלי פרויקטים (סוכן E)

| יכולת | Route | מצב |
|--------|-------|-----|
| מרכז פקודה | `/today` | **מיושם** — tasks + planning overdue + DG |
| portfolio משימות | `/portfolio` | **מיושם** — KPI משימות, לא P&L תוכנית |
| operations | `/operations` | **מיושם** |
| meetings → tasks | `/meetings` | **מיושם** |
| approvals | `/approvals` | **חלקי** — task כן; **CO לא** ( `/changes` ) |
| Dev/GC hubs | `…/execution` | **מיושם** — gate `developer_gc` |
| דוחות | `/reports` | **מיושם** — portfolio/milestone packs |

**חסר ל-PMO:** entity תוכנית, escalation workflow, רישום החלטות org-wide, קישור planning↔tasks.

---

## G — שמונה תרחישי עולם אמיתי

### תרחיש 1 — חשמלאי solo, 10 עבודות

| | |
|--|--|
| **יום עבודה** | בוקר: `/` או `/today`; פתיחת פרויקט → `…/tasks`; עדכון סטטוס; צילום → `?tab=documents` (תיקיית photos) |
| **מסכים** | `/projects`, `…/tasks`, `/employee` אם יש עובד |
| **נתמך** | משימות, due, checklist, מובייל employee |
| **עקיפות** | אין משימה ב-FAB org; My Work ב-mobile More |
| **חסר** | tab תמונות; יצירה מהירה global |
| **מעשי?** | **כן** אם נכנסים דרך פרויקט |
| **שיפור** | FAB משימה; קיצור photos |

### תרחיש 2 — קבלן שיפוצים, 20 אתרים

| | |
|--|--|
| **יום עבודה** | `/projects` + סינון; לכל אתר tasks/board; `/workforce/time`; `/field-ops` לליקויים |
| **מסכים** | `?tab=usage`, `?tab=time`, `…/boards`, `/work` ל-overdue |
| **נתמך** | Kanban פרויקט, multi-assignee, workload |
| **עקיפות** | planning vs tasks; שני מסלולי שטח |
| **חסר** | crew entity; קישור חומרים↔משימה |
| **מעשי?** | **כן–חלקי** ל-GC בינוני |
| **שיפור** | PM-003 תיעוד/איחוד field UX; execution nav ל-GC-only org |

### תרחיש 3 — יועץ חשמל, 15 עובדים, 400 פרויקטים פעילים

| | |
|--|--|
| **יום עבודה** | `/portfolio` + `/work` (assigned/overdue); `…/plans`; משימות `in_review` |
| **מסכים** | `/work`, `/portfolio`, `/projects/[id]/tasks`, `/documents` |
| **נתמך** | UWM, שרטוטים, פרופיל יועץ |
| **עקיפות** | load more בכל tab; אין saved views |
| **חסר** | סינון לקוח ב-API; 400 פרויקטים ב-portfolio pagination |
| **מעשי?** | **חלקי** — דורש משמעת סינון |
| **שיפור** | saved views על `/work`; portfolio limit; filter clientId |

### תרחיש 4 — יועץ אינסטלציה, 700 פרויקטים

| | |
|--|--|
| **יום עבודה** | כמו 3 + דוחות `/reports` |
| **מסכים** | portfolio, work, project hub |
| **נתמך** | אותו מנוע |
| **עקיפות** | חיפוש global cap 8 |
| **חסר** | org-wide task queue ללא תקרות |
| **מעשי?** | **בסיכון** ללא API/export — סוכן F |
| **שיפור** | server-side filters; אינדекс חיפוש; lazy My Work |

### תרחיש 5 — משרד אדריכלות — deliverables, revisions, approvals

| | |
|--|--|
| **יום עבודה** | `…/plans`; משימות DD/CD; `/meetings` action items |
| **מסכים** | plans, tasks, documents, changes |
| **נתמך** | revision supersede; templates architecture |
| **עקיפות** | approval משימה vs CO נפרד |
| **חסר** | transmittal; markup |
| **מעשי?** | **כן** לניהול משרד+מסירות |
| **שיפור** | קישור task ↔ drawing revision (אופציונלי) |

### תרחיש 6 — יזם, 50 פרויקטים, יועצים וקבלנים

| | |
|--|--|
| **יום עבודה** | `/portfolio`, `/operations`, `/today`; פרויקט Dev+GC `…/execution` |
| **מסכים** | execution quality/planning, `/changes`, billing plan |
| **נתמך** | RFI, submittals, contractor portal |
| **עקיפות** | CO לא ב-approvals מרכזי |
| **חסר** | program rollup; PM-004 |
| **מעשי?** | **כן** ל-GC/יזם בנייה |
| **שיפור** | dashboard תוכנית; instruction→CO |

### תרחיש 7 — קבלן 300 עובדים, 1,000 פרויקטים

| | |
|--|--|
| **יום עבודה** | `/workload`, `/work`, employee app, `/operations` |
| **מסכים** | workload, portfolio, project boards |
| **נתמך** | RBAC, batch assignee load |
| **עקיפות** | admin full workspace scope |
| **חסר** | virtualization; מדידת ביצועים |
| **מעשי?** | **לא מוכח** ב-scale — **סיכון** |
| **שיפור** | R1–R8 סוכן F |

### תרחיש 8 — משרד PM, portfolios לקוחות

| | |
|--|--|
| **יום עבודה** | `/portfolio`, `/meetings`, `/reports`, `/work` |
| **מסכים** | portfolio saved views **יש**; task saved views **אין** |
| **נתמך** | multi-client projects, meetings→tasks |
| **עקיפות** | אין program entity |
| **חסר** | client filter tasks; decision register |
| **מעשי?** | **חלקי–טוב** |
| **שיפור** | SavedListViewsBar על `/work/*` |

---

## H — ניהול משימות cross-project

| דרישה | מצב @ 2f13eec6 | ראיה |
|--------|----------------|------|
| workspace מרכזי אחד | **חלקי** | `/work` — דורש module `work_management` |
| כל הפרויקטים המורשים | **מיושם בקוד** | `listAccessibleTasks`, `getMyWorkPage` |
| שלי / צוות / באיחור / היום | **מיושם בקוד** | `MY_WORK_VIEWS`, limits 100/view |
| סינון לקוח | **חלקי** | `clientName` תצוגה; **אין** `clientId` ב-`TaskListFilters` (`types.ts`) |
| סינון מחלקה | **חסר** | — |
| מאות פרויקטים בלי כניסה לכל אחד | **חלקי** | `/work` + portfolio; caps + load more |
| תצוגות שמורות | **חסר** (tasks) | portfolio only |

**מסקנה:** cross-project **קיים ושימושי** ל-PM עם הרשאות; **לא** ברמת Planner My Tasks + saved grid לכל המשרד ב-700 פרויקטים.

---

## I — תכנון / Gantt / לוח שנה

**עקרון מוצר (PM-005, PM-011):** שני מנועים — **לא למזג**.

| שכבה | SSOT | UI |
|------|------|-----|
| UWM tasks | `tasks` | `/work/*`, `…/tasks`, `…/boards` |
| Gantt | `planning_work_items` | `?tab=schedule`, `ProjectSchedulePanel` |
| Org calendar | federated read | `/calendar` — `source-dates.repository.ts` |
| Bookings | `resource_bookings` | `/scheduling` — **אין** task_id (PM-006) |

**סיכון:** אותה עבודה יכולה להופיע **פעמיים** ב-`/calendar` (planning + task due). **Timeline** בפרויקט = tasks, **לא** Gantt — בלבול מונחים (`…/timeline/page.tsx`).

**0110 `planning_work_items.task_id`:** קיים ב-DB — **לא** ב-Drizzle/app.

---

## J — Scale וארכיטקטורת ביצועים (READ ONLY)

| Tier | הערכה | הערות |
|------|--------|--------|
| 1–5 users | **Likely OK** | caps, cache auth 45s |
| 20–100, עד ~1k projects | **Likely OK** member scope | load more |
| 100–500 emp, 5k projects, 50k+ tasks | **Risk** | prefetch 9×100; unbounded assignee IDs; ILIKE; no virtualization |

**אינדקסים:** `tasks_org_workspace_idx`, `tasks_due_date_idx`, `tasks_portfolio_rollup_idx` — `drizzle/schema/tasks.ts`. **פער:** אין index על `board_id`.

**Egress:** crons יומיים — `docs/audits/_vercel-supabase-consumption-audit-2026-10-09.md` — **לא** נמדד מחדש.

**לא נטען:** ביצועים ב-Production מוכח.

---

## K — מובייל, עברית RTL, UX (סוכן G)

| נושא | מצב |
|------|-----|
| RTL | **חזק** — logical CSS, `he-IL/tasks.json` |
| Owner mobile tasks | **בינוני** — cards בלי inline edit; sheet ארוך |
| Employee | **טוב ברשימות** — bottom nav `/employee/tasks` |
| FAB משימה | **חסר** org-level — `quick-create.tsx` |
| My Work mobile | tabs **icon-only** `< sm` |
| DnD | global board: desktop; project board: touch — **לא עקבי** |
| תמונות tab | **חסר** — shortcuts ב-`?tab=documents` (map B.4) |
| UI-MOB-001 `/reports` | **mitigated בקוד** — **לא אומת** Playwright |

**שימור:** dashboard owner + tabs פרויקט — **לא נפגעו** ב-baseline.

---

## L — אבטחה, הרשאות, שיתוף

| נושא | מצב |
|------|-----|
| RBAC tasks | **מיושם** — `catalog.ts`, workspace scope |
| Project team capabilities | **מיושם** — 0174+ |
| Contractor portal | **מיושם** — grants, scoped tasks |
| External client portal | **נדחה** |
| RLS tasks | additive DG — app layer primary |
| SEC-004 execution URLs | **חלקי** — nav vs deep link (map §K) |

**שיתוף על משימה:** comments, followers (org_member), attachments — **מיושם**; @mentions **חלקי**.

---

## M — פערים לפי חומרה

| Severity | ID / נושא | השפעה עסקית |
|----------|-----------|-------------|
| **CRITICAL** | Cross-project @ 700+ projects + admin scope | PMO לא יכול לסמוך על תמונה מלאה בלי export/API |
| **CRITICAL** | Dual schedule (planning vs tasks) ב-Today/calendar | כפילות “באיחור”, אובדן אמון |
| **HIGH** | אין saved views על `/work` | חיכוך יומי vs Planner |
| **HIGH** | אין סינון לקוח/מחלקה ב-task API | PMO / יועצים עם מאות לקוחות |
| **HIGH** | My Work 9× prefetch | latency / egress ב-org גדול |
| **HIGH** | Dependencies לא enforce | לוחות לא משקפים FS אמיתי |
| **HIGH** | PM-004 instruction→CO | פער מסחרי GC |
| **HIGH** | Execution nav רק Dev+GC | GC ישראלי “רגיל” לא רואה hubs |
| **MEDIUM** | FAB ללא משימה | solo contractor friction |
| **MEDIUM** | Employee notification inbox | שטח מפספס due |
| **MEDIUM** | Workload reassign stub | capacity לא נסגר |
| **MEDIUM** | PM-009 owner evidence parity | א-סימטריה מול קבלן |
| **MEDIUM** | Calendar Schedule parity (drag dates) | פחות “Planner day” |
| **LOW** | Hard delete policy | compliance / טעויות |
| **LOW** | Recurring copy gaps | תחזוקה ידנית |
| **LOW** | תוויות My Work mobile | RTL scanability |

**נדחה (לא פגם):** פורטל לקוח UI-001/002; סנכרון Google/Outlook PM-012.

---

## N — מפת דרכים מינימלית לשיפור

**עקרון:** reuse → complete partial → dedupe UX → add רק where justified.

### גל 1 — Quick wins (ללא schema כבד)

1. **SavedListViewsBar** על `/work`, `/work/board`, `/work/calendar` — reuse portfolio pattern.
2. **סינון `clientId`** — derive מ-project join; expose ב-`TaskListFilters` + `task-filters-bar.tsx`.
3. **FAB “משימה”** — deep link `/work` create או `?new=1` עם בחירת פרויקט.
4. **תוויות My Work במובייל** — `my-work-view.tsx`.
5. **Copy/labels:** “ציר משימות” vs “לוח זמנים Gantt” — PM-011 doc → UI strings.
6. **Workload reassign** — wire ל-`assign-task.ts` (הסר stub).

### גל 2 — Planner parity ממוקד

7. **Context-preserving nav** — share query params בין `/work/*` routes.
8. **Calendar drag reschedule** (tasks only) — optional, לא למזג planning.
9. **Lazy My Work** — load active tab only (`work/page.tsx`).
10. **Dependency enforcement** — org flag: auto `blocked` when FS open (optional).

### גל 3 — תעשייה / scale (רק עם אישור Owner)

11. **Pagination fix** `assigned_to_me` — SQL limit, לא unbounded IDs.
12. **Trigram/GIN** on title search — migration prepared only per policy.
13. **Optional planning↔task link** — wire 0110 + UI opt-in (PM-005).
14. **Execution nav** for `general_contractor` profile — product decision, לא rewrite.
15. **PM-004** conversion port — commercial, לא task core.

**לא לעשות:** merge `planning_work_items` → `tasks`; Outlook ingestion; ERP נפרד לכל מקצוע.

---

## O — מיפוי 20 קriterions קבלה (PRODUCT)

| # | קriterion | מצב | הערה |
|---|-----------|-----|------|
| 1 | workspace מרכזי אחד | **חלקי** | `/work` — module gate |
| 2 | משימות across projects | **מיושם בקוד** | `listAccessibleTasks` |
| 3 | משימות שלי | **מיושם בקוד** | My Work views |
| 4 | משימות צוות | **חלקי** | filters / workload — אין “team board” ייעודי |
| 5 | באיחור | **מיושם בקוד** | + planning נפרד ב-Today |
| 6 | היום / השבוע | **מיושם בקוד** | |
| 7 | סינון client/project/employee/dept/status/priority/date | **חלקי** | **אין client/dept** ב-API |
| 8 | board/list/calendar/timeline בלי אובדן context | **חלקי** | routes נפרדים; filters לא נשמרים |
| 9 | create/edit מהיר | **חלקי** | desktop טוב; mobile sheet |
| 10 | workflow transitions | **מיושם בקוד** | boards + lifecycle |
| 11 | comments/docs/activity | **מיושם בקוד** | |
| 12 | delegate + track | **מיושם בקוד** | assignees, owner |
| 13 | notifications שימושיות | **חלקי** | cron **מיושם בקוד**; employee inbox **חלש** |
| 14 | קישור לפעילות פרויקט | **חלקי** | project strong; materials/planning weak |
| 15 | מאות פרויקטים | **חלקי** | caps, load more |
| 16 | workload / bottlenecks | **חלקי** | `/workload` — reassign stub |
| 17 | permissions עקביים | **חלקי** | portal scoped — **מיושם**; SEC-004 **לא אומת** |
| 18 | mobile parity | **חלקי** | employee **טוב**; owner **בינוני** |
| 19 | avoid duplicate task records | **חלקי** | row יחיד ב-`tasks`; **concept** כפול planning |
| 20 | persistence across views | **מיושם בקוד** ל-UWM | planning/calendar **lens נפרד** |

**ציון ג rough:** ~11 **מיושם**, ~9 **חלקי**, 0 **חסר מוחלט** ל-core UWM.

---

## P — תשובות סופיות ל-Owner

### האם ProjectFlow יכול לשרת **כל** עסק בנייה, שיפוץ, הנדסה או ייעוץ?

**לא “כל” — כן לרוב הסpectra עם הגדרות:**

- **כן בביטחון גבוה:** קבלן execution / Dev+GC, קבלן משנה (portal), קבלן מקצועי קטן–בינוני (דרך פרויקט), יועץ/אדריכל (פרופיל מצומצם).
- **בתנאים:** PMO גדול / 700+ פרויקטים — **דורש** roadmap scale + saved views; לא **מוכח** היום.
- **לא כ substitute:** BIM, markup, payroll, accounting מלא.

### האם ניהול המשימות ** באמת ** comparable ל-Microsoft Planner?

**Comparable ב-~70–80% מה-workflows הליבתיים** (assign, bucket board, due, labels, my work lists) **ובעדיפות** בקontext בנייה (שעות, workload, dependencies schema).

**לא comparable** ב-**My Day**, **Schedule drag**, **saved personal grid**, **מקור משימות M365**.

**מסקנה:** **Planner-like על לוח פרויקט**; **Planner daily hub** — **עדיין לא**.

### מה **בדיוק** חייב להשתפר?

1. **מרכז `/work` ברמת PMO** — saved views + client filter + lazy load.  
2. **בהירות dual schedule** — labels + Today dedupe policy (לא merge tables).  
3. **מובייל owner + FAB משימה** — שימוש יומי solo/super.  
4. **Scale hardening** — assigned_to_me, search index, virtualization (מדוד אחרי).  
5. **אופציונלי מותנה:** planning↔task link; dependency enforce; PM-004.

---

## נספח — סוכני משנה ו-Build Oct-9

תוכנית המאסטר **BUILD COMPLETE (local)** — **לא** deploy/SQL Production ([complete_implementation_master.plan.md](../../.cursor/plans/complete_implementation_master.plan.md)). ממצאי PM-001–PM-012 ב-register 84 **נשארים GAP לוגיים** או **DOC** — לא נפתחו מחדש בגל זה.

**Production baseline `2f13eec6`:** יכולות task **מיושמות בקוד**; **0/15** תרחישי Owner בדפדפן (map §J.2) — **לא** משנה מסקנת fit, מגביל “מוכן לשחרור”.

---

*דוח זה הוא deliverable סופי לגל Product Fit — **ללא יישום**. המשך Build רק באישור Owner מפורש על §N.*
