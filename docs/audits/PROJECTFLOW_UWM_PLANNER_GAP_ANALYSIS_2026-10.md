# ProjectFlow — ניתוח UWM / Planner: יכולות, פערים והמלצות שיפור

**תאריך:** 15 באוקטובר 2026  
**סוג:** Read-only (מוצר בלבד — ללא פיתוח, SQL, E2E, deploy)  
**מאגר:** `projectflow`  
**שיטה:** סוכן ראשי + 4 סוכני explore (Tasks, Boards/Workspaces, Planning/Calendar, Recurrence/Collab/Integrations) + השוואת Planner ממקורות Microsoft (תווית **טעון אימות חיצוני** לפרטי רישוי/מחיר).

**קהלי יעד לניתוח:** קבלני חשמל, אינסטלציה, שלד, שיפוצים ומקצועות ביצוע; יזמים; יועצי חשמל/אינסטלציה/הנדסה; אדריכלים ומשרדי תכנון.

---

## א. סיכום מנהלים — מה המערכת עושה היום

ProjectFlow מציעה **שכבת UWM (Universal Work Management)** מלאה בקוד: משימות עם סטטוסים, עדיפות, buckets, תלויות (`finish_to_start` + `blocked_by`), חזרתיות RRULE, תזכורות, תגובות ו-mentions, activity, bulk ב-`/work/list`, ולוחות Kanban ב-workspace/פרויקט. במקביל קיימת **שכבת Planning נפרדת** (`planning_work_items`) עם Gantt, תלויות FS, progress ו-overdue — **בלי סנכרון אוטומטי** למשימות UWM (קישור `taskId` ידני בלבד; dedupe ביומן C1).

**משטחי עבודה:**

| משטח | נתיבים | תפקיד |
|------|--------|--------|
| Work Lens | `/work`, `/work/list`, `/work/board`, `/work/calendar`, `/work/timeline`, `/work/insights` | portfolio ארגוני, פילטרים URL + **תצוגות שמורות** |
| Workspace boards | `/workspaces/.../boards/...` | Kanban buckets, משימות ללא חובת פרויקט |
| Project work | `/projects/.../tasks`, `boards`, `calendar`, `timeline` | ביצוע scoped לפרויקט |
| Planning | טאb `schedule` / `ProjectSchedulePanel` | תוכנית זמנים (לא UWM) |

**מצב בשורה אחת:** **מנוע UWM בוגר** (schema + application + ~43 unit tests) עם **פערי חיבור UI** (ארכוב, צ'קליסט, תגיות, assignees בחלק מהמשטחים) ו**בלבול מוצרי** בין Work / Planning / Tasks / «משימות פרויקט». **אינטגרציה עסקית חזקה** לפרויקט, אבני דרך, מסמכים, שעות workforce; **חלשה** להצעות מחיר ו-work orders ברמת משימה. **Offline/PWA** — shell כללי; **אין** טיוטות offline למשימות.

**מול Microsoft Planner (2025–2026, מקור Microsoft Support):** Basic = לוח/Grid/Schedule/Charts, recurring, 9K tasks/plan. Premium (Plan 1) = Timeline/Gantt, dependencies FS, milestones, goals, People view, **ללא** Schedule/recurring (פער ידוע ב-Microsoft). ProjectFlow **לא מחליף Planner** בתוך M365, אך **מציע עומק קבלני** (פרויקט, כסף, DG, שעות) ש-Planner לא נותן — במחיר **מורכבות UX** ו**כפילות Planning↔Tasks**.

---

## ב. קטלוג יכולות UWM מלא (עם ראיות)

### ב.1 Tasks — CRUD ומטא-דאטה

| יכולת | מה עושה | UI פעיל | מימוש | ראיות |
|--------|---------|---------|--------|--------|
| יצירה | draft, project/workspace/board/bucket | כן (boards, work, project) | מלא | `application/create-task.ts`, `work/actions.ts` |
| עריכה | title, description, due, status… | כן (sheet + דף) | מלא | `update-task.ts`, `task-detail-sheet.tsx` |
| ארכוב | soft archive | **לא** (action ללא כפתור) | backend מלא | `archive-task.ts`, `archiveTaskAction` |
| מחיקה קשה | — | לא | לא קיים (by design) | — |
| סטטוסים | todo→done + gates | כן | מלא | `domain/lifecycle.ts`, `apply-task-status-change.ts` |
| עדיפות | none/low/med/high/urgent | כן | מלא | `taskPriorityEnum` |
| תגיות (labels) | org labels + assignments | **שbroken** (updateTask ללא labels) | backend מלא | `manage-labels.ts`, `addLabelAction` לא ב-UI |
| מוקצים מרובים | task_assignees | **חלקי** (project board; לא My Work/דף task) | מלא | `assign-task.ts`, `task-assignee-picker.tsx` |
| תת-משימות | parentTaskId, עומק 2 | כן | מלא | `subtasks.ts`, `task-subtasks-section.tsx` |
| צ'קליסט | items + toggle | **שbroken** (toggle via updateTask) | backend מלא | `manage-checklist.ts`, actions לא מחוברים |
| קבצים | document_links | מלא ב-`/tasks/[id]`; read-only ב-sheet | מלא | `task-document-attachments.tsx` |
| הערות + mentions | comments | כן (דף + drawer) | מלא | `ui/actions.ts`, `create-task-comment.ts` |
| Activity | append-only feed | דף מלא בלבד | מלא | `task-activity.tsx`, `task_activity` |
| Bulk | status/priority/due/assignee | `/work/list` בלבד | מלא | `bulk-update-tasks.ts`, `task-table-view.tsx` |
| אישורים על משימה | approval gate | כן | מלא | `TaskApprovalGate` |
| Duplicate task | | | מלא | `duplicate-task.ts`, tests |

### ב.2 Boards & Workspaces

| יכולת | UI | מימוש | ראיות |
|--------|-----|--------|--------|
| Workspace CRUD | רשימה; **יצירה בלי טופס UI** | backend | `workspaces/application/*`, `workspaces/page.tsx` |
| Board CRUD | new board form | מלא | `manage-boards.ts`, `boards/new` |
| Buckets | server load; **אין UI ניהול עמודות** | backend | `manage-buckets.ts`, `workspaces/actions.ts` |
| Kanban DnD | desktop HTML5 | מלא | `board-view.tsx`, `use-desktop-board-drag.ts` |
| Group by | bucket/assignee/priority/label | מלא; label drop disabled | `board-drop-position.ts` |
| Global board (status) | `/work/board` | מלא | `_global-board-view.tsx` |
| פילטרים URL + saved views | **רק `/work/*`** | מלא שם | `WorkLensChrome`, `saved-list-views.ts` |
| Load more tasks | Work board | חלקי ב-bucket boards | `loadMoreWorkLensTasksAction` vs `hasMore` hint |
| תבניות | UWM project template, task template | מלא backend | `apply-project-template.ts`, `manage-task-templates.ts` |
| העתקת plan | duplicate task | לא «copy board» | — |

### ב.3 Calendar / Timeline / Gantt

| יכולת | Planning | UWM Tasks | ראיות |
|--------|----------|-----------|--------|
| Org calendar | milestones + planning rows + task due | task due בלבד (לא start) | `calendar/source-dates.repository.ts` |
| Dedupe C1 | מוסתר אם task linked+due | canonical | `planning-dedupe.ts` |
| Work calendar | — | `/work/calendar` | `task-calendar-view.tsx` |
| Timeline | — | `/work/timeline`, project timeline | `task-timeline-view.tsx` |
| Gantt + deps | Project schedule tab | UWM Gantt **ללא edges** | `planning/gantt-chart.tsx` vs `task-timeline-gantt.tsx` (`dependencies: []`) |
| Critical path | foundation `supported: false` | לא | `critical-path-foundation.ts`, `LIMITATION.md` |
| Milestones | planning kind milestone | `tasks.milestoneId` → project_milestones | schema |
| ICS | My Work export | | `build-my-work-ics.ts` |

### ב.4 Recurrence & Automations

| יכולת | מימוש | UI | ראיות |
|--------|--------|-----|--------|
| RRULE + materialize | מלא + daily worker | כן | `process-recurrence-occurrences.ts`, `task-recurrence-ops-worker.ts` |
| Reminders | on_due, day_before, custom | כן | `manage-reminders.ts`, `scanTaskReminders` |
| Automation overdue | scan | | `collect-matches.ts` |
| Automation status/assigned/template | presets **UNAVAILABLE** | UI only | `UNAVAILABLE_AUTOMATION_PRESETS` |
| dependency_resolved → notify | מלא | | `notify-task-dependency-resolved.ts` |

### ב.5 Collaboration & הרשאות

| יכולת | מימוש | ראיות |
|--------|--------|--------|
| Task RBAC | TASKS_READ/MANAGE/DELETE… | `permissions/catalog.ts` |
| Comments employee | scoped | `employee-app/presets.ts` |
| Entity linked tasks | RFI, defects, meetings… | `collaboration/createLinkedTask` |
| Contractor task lifecycle | portal + internal | `contractor-tasks.ts` |
| Discussions on entities | לא task-native בכל מקום | `entity-discussion-panel.tsx` |

### ב.6 Mobile / PWA / Offline

| יכולת | מימוש | ראיות |
|--------|--------|--------|
| PWA install | כן | `sw.js`, `pwa-bootstrap.tsx` |
| Mobile board | accordion, no drag | `board-view.tsx` |
| Offline task draft | **לא** | `offline/domain/types.ts` (no task kind) |
| Offline time on task | כן | `time-entry-form.tsx` + offline payloads |

### ב.7 Business integration (משימות)

| קישור | סטטוס | ראיות |
|--------|--------|--------|
| פרויקט | FK `projectId` | מלא |
| לקוח | filter via project | חלקי |
| הצעת מחיר | **לא** entity link | — |
| Work order | project `work_kind` only | חלקי |
| אבן דרך | `milestoneId` | מלא (UI בעיקר מ-milestone panel) |
| מסמכים | owner task/comment | מלא |
| שעות | `time_entries.task_id` | מלא (לא בדף task owner) |
| Planning row | optional `taskId` | link ידני |

---

## ג. טבלת השוואה — ProjectFlow UWM מול Microsoft Planner

**מקור Planner:** [Compare Basic vs Premium](https://support.microsoft.com/en-us/planner/compare-microsoft-planner-basic-vs-premium-plans), [Advanced premium capabilities](https://support.microsoft.com/en-us/planner/teams/advanced-capabilities-with-premium-plans-in-planner) — **טעון אימות חיצוני** לשינויים אחרי 2026 ולרישוי M365.

| יכולת | ProjectFlow היום | Planner Basic | Planner Premium (Plan 1) | הערה |
|--------|------------------|---------------|---------------------------|------|
| Board / Kanban | כן (3 משטחים) | כן | כן | PF: buckets + status board |
| Grid / list | `/work/list` + bulk | Grid | Grid | PF bulk חזק יותר |
| Schedule calendar | `/work/calendar`, `/calendar` | **כן** | **לא** (פער MS) | PF יתרון על Premium |
| Charts | `/work/insights`, workload | Charts | People (workload) | PF workload נפרד |
| Recurring tasks | RRULE מלא | **כן** | **לא** (פער MS) | PF יתרון על Premium |
| Timeline / Gantt | Planning tab + UWM timeline (חלש) | לא | **כן** | PF: deps רק ב-planning |
| Task dependencies | UWM + planning (נפרדים) | לא | FS | PF: אין איחוד גраф |
| Critical path | לא shipped | לא | **כן** (Premium) | PF: foundation only |
| Milestones | project + planning | מוגבל | **כן** | |
| Subtasks | כן (2 levels) | checklists | **subtasks** (Premium) | |
| Checklists | backend, UI שbroken | כן | כן | PF IMPROVE |
| Labels / colored buckets | labels; buckets לא צבעוניים | labels | colored buckets Premium | |
| Comments | כן + mentions | conversations | conversations | |
| Attachments | documents module | כן | כן | PF: versioning |
| My Tasks | `/work` | Assigned to me | Assigned to me | |
| Copy / export plan | templates; exports module | copy plan, Excel | copy | PF: 15 export kinds |
| Task limit | org-scoped DB | 9,000/plan | 3,000/plan | PF: לא אותה מגבלה |
| Goals | לא | לא | **כן** | |
| Sprints / backlog | לא | לא | **כן** | |
| Custom fields on task | custom-fields entity | מוגבל | **כן** (Premium) | PF: entity-level |
| Copilot | Assistant unconfigured | לא | Copilot (license) | |
| Outlook / SharePoint embed | לא | Basic | לא Premium | irrelevant ל-PF |
| **פרויקט + כסף + שעות + DG** | **כן — ליבה** | **לא** | **לא** | **יתרון PF מכ decisive** |

---

## ד. אינטגרציות משימות עם ProjectFlow

| מודול | איך נוגע ב-UWM | עוצמה |
|--------|----------------|--------|
| Projects | tabs tasks/boards/calendar; milestones; planning | חזק |
| Clients | filter `clientId` ב-Work Lens | בינוני |
| Quotes | אין task link | חלש |
| Service / WO | פרויקט work_order; dispatch נפרד | חלש למשימה |
| Workforce | time_entries.task_id; employee task pages | חזק |
| Subcontractor portal | contractor tasks + discussions | חזק |
| DG entities | linked tasks מ-RFI/defect/… | חזק |
| Documents | attachments | חזק |
| BOQ / billing-plan | לא task-native | נפרד |
| Automations | create/assign/status task | בינוני |
| Command Center / Today | overdue, recurrence | בינוני |
| Financials | אין task cost roll-up ישיר | חלש |

---

## ה. חוויית שימוש — חמישה personas

### 1. קבלן ביצוע (חשמל/אינסטלציה/שלד)

**שימוש:** `/projects/.../tasks`, boards, employee `/time`, deliveries/safety.  
**עובד:** נוכחות + משימות שדה.  
**כאב:** Planning vs Tasks — «איפה שמים את לוח הזמנים?»; checklist/labels לא עובדים ב-sheet; ארכוב אין.  
**Planner:** Basic מספיק ללוח צ팀; **לא** מחבר ל-Actual/שעות.

### 2. שיפוצניק / עבודות קטנות

**שימוש:** jobs, `/work`, `/dispatch`, work orders.  
**עובד:** My Work + mobile board ללא drag.  
**כאב:** הרבה נתיבים (`/work` vs `/projects/.../tasks`); saved views רק ב-work hub.

### 3. יזם (מנהל קבלנים)

**שימוש:** portfolio, `/operations`, claims, financial tabs — פחות UWM יומי.  
**צריך:** timeline מחודש, milestones, דוחות.  
**PF:** planning Gantt + milestones; **לא** goals כמו Premium Planner.

### 4. יועץ הנדסי / אדריכל

**שימוש:** RFI, submittals, plans, linked tasks, meetings→action items.  
**עובד:** collaboration חזק על entities.  
**כאב:** task detail לא מרכז «related work» בכל המשטחים; אין קישור quote.

### 5. משרד תכנון (צוותים)

**שימוש:** workspaces, `/work/list`, templates.  
**כאב:** אין UI create workspace; buckets לא ניתנים לעריכה; People view = `/workload` נפרד מ-board.

---

## ו. כפילויות, חוסרים, פערי חיבור

| סוג | תיאור |
|-----|--------|
| **כפילות** | Planning Gantt vs UWM Timeline; `/calendar` vs `/work/calendar`; global status board vs bucket board |
| **פער חיבור** | checklist/labels/archive actions ↔ UI |
| **פער מידע** | `docs/product/planning-vs-tasks.md` — לא בולט enough ב-UI |
| **פער אינטגרציה** | quote/WO ↔ task |
| **פער Planner-parity** | Goals, sprints, colored buckets, task history UI |
| **פער offline** | משימות בשטח בלי רשת |

---

## ז. דירוג שיפורים P0–P3

| ID | המלצה | P | KEEP/IMPROVE/ADD/MERGE/DEFER | ערך עסקי | מורכבות | סיכון |
|----|--------|---|------------------------------|-----------|---------|--------|
| R1 | חיבור UI ל-checklist (toggle/add/reorder actions) | **P0** | IMPROVE | גבוה — שימוש יומי | נמוך | נמוך |
| R2 | חיבור UI ל-labels (add/remove actions) | **P0** | IMPROVE | גבוה | נמוך | נמוך |
| R3 | כפתור ארכוב משימה + סינון «מארכב» | **P0** | IMPROVE | בינוני-גבוה | נמוך | נמוך |
| R4 | Assignee picker ב-My Work, `/tasks/[id]`, global board | **P0** | IMPROVE | גבוה לשטח | בינוני | נמוך |
| R5 | מדריך/UX «תכנון או משימה?» + deep link | **P0** | ADD (UX) | מפחית טעויות | נמוך | נמוך |
| R6 | איחוד מסלול תגובות (attachments vs text-only) | **P1** | MERGE | בינוני | בינוני | בינוני |
| R7 | Saved views + Work Lens filters על project boards | **P1** | ADD | גבוה למשרדים | בינוני | נמוך |
| R8 | UI ניהול buckets (create/rename/reorder) | **P1** | IMPROVE | גבוה | בינוני | נמוך |
| R9 | Load more / pagination ב-boards | **P1** | IMPROVE | בינוני | בינוני | נמוך |
| R10 | Task Gantt: הצגת task dependencies | **P1** | IMPROVE | גבוה לתזמון | בינוני | בינוני |
| R11 | «Related work» + שעות מדווחות בדף task | **P1** | IMPROVE | גבוה לקבלן | בינוני | נמוך |
| R12 | קישור entity: quote / WO → task | **P1** | ADD | גבוה למכירות→ביצוע | בינוני | בינוני |
| R13 | סנכרון תאריכים אופציונלי planning↔task (one-way policy) | **P1** | ADD | גבוה | גבוה | גבוה |
| R14 | Wire automation presets (assigned, status changed) | **P2** | IMPROVE | בינוני | בינוני | בינוני |
| R15 | Offline draft create/edit task | **P2** | ADD | שטח | גבוה | בינוני |
| R16 | UI create workspace | **P2** | IMPROVE | בינוני | נמוך | נמוך |
| R17 | Task history view (כמו Premium) | **P2** | IMPROVE | בינוני | בינוני | נמוך |
| R18 | Goals / OKR lightweight (לא מלא Planner) | **P3** | DEFER | נמוך לקבלן | גבוה | — |
| R19 | Sprints/backlog | **P3** | DEFER | נישה | גבוה | — |
| R20 | Critical path productization | **P3** | DEFER | נמוך עד CPM | גבוה | גבוה |
| — | **Global Quick Create** | — | **KEEP** | חובה | — | — |
| — | שכבת Planning נפרדת | — | **KEEP** (MERGE UX only) | נכון ל-Gantt | — | — |

---

## ח. עשר השיפורים המומלצים ביותר (שפה פשוטה)

1. **תקנו את הצ'קליסט** — היום אי אפשר להוסיף פריטים מהמסך; הטoggle לא שומר. לחבר ל-actions הקיימים. *(P0)*  
2. **תקנו תגיות** — בחר תגית מהרשימה במקום «עדכון» שבור. *(P0)*  
3. **אפשרו ארכוב משימה** — הbackend מוכן; צריך כפתור «העבר לארכיון». *(P0)*  
4. **שיוך אחראים בכל מקום** — לא רק בלוח פרויקט; גם «המשימות שלי» ודף משימה. *(P0)*  
5. **הסבירו מתי Planning ומתי Tasks** — באנר קצר + קישור ל-docs; מפחית בלבול לקבלן וליועץ. *(P0)*  
6. **פילטרים שמורים גם בלוח פרויקט** — כמו ב-`/work/list`. *(P1)*  
7. **עריכת עמודות Kanban** — ליצור/לשנות buckets בלי SQL. *(P1)*  
8. **Gantt של משימות עם חיצי תלות** — כבר יש תלויות ב-UWM; רק לא מצוירים. *(P1)*  
9. **דף משימה = מרכז** — שעות, קישורים ל-RFI, מסמכים, related work בפריסה אחת. *(P1)*  
10. **קשר הצעה/הזמנת עבודה למשימות** — «משימות מהצעה» לשיפוצניק ויזם. *(P1)*  

---

## ט. יכולות ב-ProjectFlow עם יתרון על Planner

1. **משימות בתוך פרויקט קבלני** — תקציב, הוצאות, BOQ, claims (Planner לא).  
2. **שעות workforce על משימה** — Actual לרווחיות.  
3. **משימות קבלן + פורטל** — lifecycle חיצוני.  
4. **קישור DG** (RFI, ליקוי, ישיבת אתר) → task.  
5. **חזרתיות RRULE** — Premium Planner **ללא** recurring (לפי Microsoft).  
6. **Schedule/calendar ארגוני** — גם כש-Premium Planner מוותר על Schedule view.  
7. **Bulk update ברשימה** — שינוי סטטוס/אחראי המוני.  
8. **תלות `blocked_by` + policy** — מעבר ל-FS של Planner.  
9. **RBAC + project capabilities** — לא רק «member of plan».  
10. **מסמכים enterprise** — גרסאות, ענן, OCR.  
11. **אוטומציות org-level** — overdue, dependency resolved.  
12. **Persona/work_mix** — UI מותאם לשיפוצניק vs GC.  
13. **עברית / RTL / דוחות PDF**.  
14. **Multi-board workspaces** — לא מוגבל ל-«plan» אחד ב-M365 group.  
15. **אינטגרציה מ-monolith** — לא צורך לעבור Planner→Excel→ERP.

---

## י. יכולות שלא כדאי לפתח **כרגע**

| יכולת | סיבה |
|--------|------|
| **Clone מלא של Planner Premium** (Goals, Sprints, Dataverse-style) | לא core לקבלן ישראלי; עלות/opportunity גבוהה |
| **Critical path / CPM מלא** | כבר מסומן unsupported; דורש scheduling engine |
| **LLM Assistant לפני provider** | unconfigured — קודם תשתית |
| **WhatsApp transactional tasks** | communications = email + wa.me |
| **REST API tasks נפרד** | Server Actions מספיקים כרגע; scope creep |
| **החלפת Planning ב-UWM** | MERGE מסוכן; Planning נכון ל-baseline |
| **Offline-first tasks** | P2 — אחרי תיקוני P0 UI |
| **Task limit artificial כמו Planner** | לא relevent ל-DB model |
| **Loop/SharePoint web parts** | ecosystem Microsoft — לא PF |
| **ביטול Global Quick Create** | **אסור** — דרישת מוצר |

---

## יא. הצעה למבנה מוצר עתידי (ללא קוד)

```
┌─────────────────────────────────────────────────────────┐
│  «עבודה» (Work) — נקודת כניסה אחת ל-UWM                  │
│  ├─ שלי / Today (assignee lens)                          │
│  ├─ רשימה + bulk + saved views                           │
│  ├─ לוח (בחר: סטטוס | buckets)                         │
│  ├─ לוח שנה + ציר זמן (+ deps בגרף)                      │
│  └─ תובנות / עומס (/workload מקושר)                     │
├─────────────────────────────────────────────────────────┤
│  «פרויקט» — execution + schedule                         │
│  ├─ משימות (= work scoped, אותו task entity)             │
│  ├─ לוח buckets (ברירת מחדל לקבלן)                       │
│  └─ תוכנית (Planning) — tab עם קישור «צור/קשר משימה»   │
├─────────────────────────────────────────────────────────┤
│  «Workspace» — צוותים/משרד (אדריכל, יועץ)               │
│  └─ boards פנימיים, templates                            │
└─────────────────────────────────────────────────────────┘
```

**עקרונות:**  
- **ישות אחת:** `tasks` — Planner «plan» ≈ `board` + `workspace`.  
- **Planning = baseline**, **Tasks = execution** — לא לאחד DB; לאחד **UX labels** בעברית («תוכנית» / «ביצוע»).  
- **Quick Create** נשאר — יצירת משימה/פרויקט/ליד.  
- **אינטגרציה עסקית** בדף task אחד (שעות, מסמכים, entities, milestone).

---

## יב. סיכום מספרי

| מדד | כמות |
|-----|------|
| יכולות UWM **קיימות** (backend+UI עובד) | **~52** |
| **חלקיות** (backend או UI שbroken) | **~18** |
| **חסרות** (מול Planner או ציפיית קבלן) | **~12** |
| **כפולות/מבלבלות** (Planning/UWM/calendar) | **~6** |
| **עדיפויות P0** | **5** (R1–R5) |
| **P1** | **8** |
| **P2** | **4** |
| **P3 / DEFER** | **3+** |

**10 עדיפויות מרכזיות:** R1, R2, R3, R4, R5, R7, R8, R10, R11, R12.

---

## נספח — סוכני משנה

| סוכן | תחום | Agent ID |
|------|------|----------|
| Tasks deep dive | CRUD, checklist, labels, archive | 6460d900-8f50-49a2-97f7-cc574db8fbfc |
| Workspaces & boards | 3 board types, DnD, saved views | 7686e5dd-b3c9-4b3b-9205-c571200e272e |
| Planning vs UWM | Calendar, Gantt, CPM, sync | 52fbea29-59af-4dc6-a124-a6894a85b256 |
| Recurrence, collab, offline, links | integrations | b9cf41a4-57ef-44a8-85fc-0e1946edb645 |

**מגבלות:** לא בוצע E2E; Planner ממקור Microsoft Support (אוקטובר 2026); לא נבדקו כל 169 קבצי tasks אחד-אחד.

---

*דוח מוצר בלבד — אין בו הוראות implement או אישור פיתוח.*
