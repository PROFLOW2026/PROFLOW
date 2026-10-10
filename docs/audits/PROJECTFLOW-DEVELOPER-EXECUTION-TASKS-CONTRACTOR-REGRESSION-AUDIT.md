# ProjectFlow — ביקורת רגרסיה: Developer/GC, ניהול משימות, גישת קבלנים

**תאריך:** 2026-10-10  
**מצב:** חקירה read-only (קוד + Git). ללא יישום, SQL, commit או deploy.  
**מאגר:** `projectflow` (HEAD `cf67025b` לאחר אינטגרציית סוכני מחקר)  
**אינטגרציה:** ממצאי [Project layout routes audit](54f6edc7-36cc-4689-b260-6dcf87eebb4c), [Six missing task buttons](23087cff-f93c-44d4-a887-d6c4ebcced86), [Execution workspace routing](20fbec8e-5fd7-43c8-b004-018402f188c2), [Contractor access controls audit](437f1f0e-838b-481b-8eab-ab169caa7bc5), [Git regression timeline](af4b7427-8d38-4ff1-9517-1e042687ca7c), [UX financial separation audit](87af829c-63de-46f2-ab6f-dd10ee67e5be) (מלא — §8–§8.1)

---

## 1. סיכום מנהלים

הבעיות שדווחו על ידי הבעלים **מאושרות ברובן בקוד הנוכחי**. יש שלוש שכבות עיקריות:

1. **מסך פרויקט משותף (`layout.tsx`)** — כותרת פרויקט + **מטריקות כספיות** (`ProjectHeaderMetrics`) נטענות **בכל** נתיב תחת `/projects/[projectId]/*`, כולל ביצוע ומשימות. רק `Project360Summary` ולשוניות המסחריות מוסתרים בנתיבי «workspace».
2. **התנגשות סיווג נתיבים (באג לוגי)** — נתיבי UWM (`tasks`, `boards`, `calendar`, `timeline`) רשומים **גם** ב־`EXECUTION_SEGMENTS` (דרך `EXECUTION_HUB_CHILDREN` + `EXTRA_EXECUTION_SEGMENTS`). הפריסה בודקת **קודם** `inExecutionWorkspace`, ולכן **ענף `ProjectWorkNav` (סביבת משימות ייעודית) כמעט לא מופעל** על אותם URLs.
3. **שישה כפתורי ניווט UWM** — הוסרו מהמסך המסחרי ב־commit `b5986c18` (`ProjectUwmLinks` → כפתור כניסה יחיד + 4 טאbs). שני הקישורים (קבצים, ישיבות) **לא הועברו** לסביבת המשימות החדשה.

ניהול גישת קבלנים: **UI ופעולות שרת קיימים** ב־Owner `/contractor-access`, אך **עריכת פרופיל/שם משתמש אחרי הזמנה חסרה ב-UI**; פעולות חשבון (איפוס, השבתה) מוגבלות ל־`isHomeOrganization` + הרשאות `EXTERNAL_ACCESS_MANAGE` / `CONTRACTOR_INVITE`. **Employee:** קישורי «ניהול גישה» מ־`contractors/screen.tsx` מצביעים ל־`/employee/projects/{id}/contractor-access` **ללא `page.tsx`** → **404** (REG-011).

**הבהרה:** `EXECUTION_ROUTE_CATALOG` / Track S (קבוצות nav ישנות) **לא** מחוברים ל-layout; chrome פעיל = 7 hubs ב־`execution-hubs.ts` בלבד.

---

## 2. ארכיטקטורת דף פרויקט (נוכחי)

### היררכיית Layout

| שכבה | קובץ | תפקיד |
|------|------|--------|
| App shell | `(app)/layout` | מעטפת ארגון |
| **Project layout** | `src/app/[locale]/(app)/projects/[projectId]/layout.tsx` | כותרת, מטריקות, שלושה מצבים לפי pathname |
| Page | `.../[segment]/page.tsx` | תוכן מודול |

### שלושה מצבי פריסה (Owner)

```
pathname → inExecutionWorkspace? → inProjectWorkWorkspace? → commercial (ברירת מחדל)
```

| מצב | תנאי | מה מוצג מעל `{children}` |
|-----|------|---------------------------|
| **Commercial** | לא execution ולא project-work | `DeveloperGcExecutionEntry`, `ProjectWorkManagementEntry`, `Project360Summary`, `ProjectTabsShell` |
| **Execution workspace** | `isOwnerExecutionWorkspacePath` | `ProjectExecutionNav` (אם GC) |
| **Task work workspace** | `!execution && isOwnerProjectWorkWorkspacePath` | `ProjectWorkNav` (**בפועל לא מופעל** על UWM URLs — REG-006) |

**תמיד (כל המצבים):** `PageHeader` + `ProjectHeaderMetrics` (ערכי חוזה כשיש `PROJECT_FINANCIALS_READ` / `CONTRACTS_READ`).

### Employee shell

`src/app/[locale]/employee/(shell)/projects/[projectId]/layout.tsx` — execution entry + `ProjectExecutionNav`; **ללא** `ProjectWorkNav`, **ללא** hub tabs מסחריים, **ללא** `Project360Summary`. משימות: `/employee/projects/{id}/tasks` (רשימה בלבד). גישת קבלנים: **אין דף** (REG-011).

---

## 3. סיבת תוכן Overview / כספי חוזר

| Finding ID | חומרה | קובץ/פונקציה | Commit |
|------------|--------|--------------|--------|
| **REG-001** | HIGH | `layout.tsx` — `ProjectHeaderMetrics` + `loadProjectDetail` | `ec377f29` (הפרדת workspace; הכותרת נשארה משותפת) |
| **REG-002** | HIGH | `project-360-summary.tsx` + `get-project-360-summary.ts` — נטען רק ב־commercial | מכוון ב־`ec377f29` |
| **REG-003** | MEDIUM | `execution/screen.tsx` — בלוק `execution.financialTitle` + `loadExecutionPayableTotals` | `57aea87f` / `4c9e5a49` |

**התנהגות צפויה (בעלים):** בביצוע/משימות — ללא סיכומים מסחריים חוזרים.  
**התנהגות נוכחית:** כותרת פרויקט + שורת מטריקות כספיות בכל נתיב; בדשבורד ביצוע גם פanel כספי ייעודי; ב־commercial — `Project360Summary` מלא.

**טעינת נתונים (לא רק תצוגה):** `loadProjectDetail` / `getProjectDetailChrome` (ערכי חוזה כש-`CONTRACTS_READ`) + `ProjectHeaderMetrics` ב-layout **על כל** `/projects/{id}/*`; `getProject360Summary` → `getProjectOverviewPayload` → `getProjectFinancials` רק ב-commercial; `loadExecutionPayableTotals` / `loadProjectCostControl` ב-execution **רק** עם project capabilities (`PAYMENT_VIEW`, `PROJECT_BUDGET_VIEW`, …).

**כפילות headers (מבני):** layout `PageHeader` + metrics; דף משימות `_project-tasks-page.tsx` — `PageHeader` נוסף; `/execution` — `PageHeader` שני + `execution.financialTitle`; commercial overview — **360 +** `OverviewFinancialSnapshotPanel` (אותו compose כמו טאb כספים) **+** metrics (REG-015).

---

## 4. סביבת ביצוע ייעודית — נוכחי מול מיועד

| נושא | מיועד | נוכחי |
|------|--------|--------|
| כניסה | workspace נפרד עם ניווט 7 hubs | `DeveloperGcExecutionEntry` → `/execution`; `ProjectExecutionNav` על נתיבי execution |
| הפרדה מסחרית | ללא לשוניות overview | לשוניות + 360 **מוסתרים**; **כותרת + מטריקות כספיות נשארים** |
| מודולים | contractors, RFI, submittals, … | routes קיימים; hub links ב־`ExecutionHubLinks` / children ב־`execution-hubs.ts` |
| `/execution` | דשבורד תפעולי | `ProjectExecutionDashboardScreen` + מטריקות + **סיכום כספי** |

| Finding ID | חומרה | קובץ | Commit | השפעה |
|------------|--------|------|--------|--------|
| **REG-004** | HIGH | `layout.tsx` L169–260 | `ec377f29` | «ביצוע» אינו workspace «נקי» — chrome מסחרי חוזר |
| **REG-005** | MEDIUM | `execution/screen.tsx` L98+ | — | כספי בתוך workspace ביצוע |
| **REG-012** | MEDIUM | `select-execution-nav-links.ts` / `load-execution-nav.ts` | `57aea87f` | פרויקט עם הסכמי קבלן בלבד (לא `developer_gc`) **איבד** execution chrome — שינוי מוצר מכוון, עדיין רגרסיה לעומת חוויה קודמת |

---

## 5. ניהול משימות — נוכחי מול מיועד

| נושא | מיועד | נוכחי |
|------|--------|--------|
| Workspace ייעודי | `ProjectWorkNav` + 4 routes | **Nav לא מוצג** על `/tasks|boards|calendar|timeline` בגלל REG-006 |
| כניסה מהפרויקט | 6 קיצורי דרך | **כפתור יחיד** `ProjectWorkManagementEntry` |
| דף משימות | רשימה + ניווט | `_project-tasks-page.tsx` — רק «צפה בלוחות» בכותרת |

| Finding ID | חומרה | קובץ | Commit |
|------------|--------|------|--------|
| **REG-006** | **CRITICAL** | `execution-workspace-path.ts` + `layout.tsx` L161–163 | `b5986c18` + `57aea87f` |
| **REG-007** | HIGH | מחיקת `project-uwm-links.tsx` | `b5986c18` |

### REG-006 — מנגנון

- `PROJECT_WORK_WORKSPACE_SEGMENTS`: `tasks`, `boards`, `calendar`, `timeline`
- אותם segments ∈ `EXECUTION_SEGMENTS` (children של hub «planning» + `EXTRA`: `boards`, `timeline`)
- `inProjectWorkWorkspace = !inExecutionWorkspace && …` → **תמיד false** על UWM URLs
- פרויקט **לא GC**: `inExecutionWorkspace` עדיין true → **ללא** execution nav, **ללא** tabs, **ללא** work nav (עמוד יתום)

---

## 6. שישה כפתורי הניווט החסרים — זיהוי מדויק

**TASK BUTTONS FOUND = 6/6** (היסטורית ב־`ProjectUwmLinks`; לא «6 טאbs» ב־`ProjectWorkNav`)

| # | מפתח i18n (לפני `b5986c18`) | עברית | Route | רכיב מקורי |
|---|------------------------------|--------|-------|------------|
| 1 | `tasks.projectWork.tasksLink` | משימות פרויקט | `/projects/[id]/tasks` | `ProjectUwmLinks` |
| 2 | `tasks.projectWork.boardsLink` | לוחות פרויקט | `/projects/[id]/boards` |同上 |
| 3 | `tasks.projectWork.calendarLink` | לוח שנה משימות | `/projects/[id]/calendar` |同上 |
| 4 | `tasks.projectWork.timelineLink` | ציר זמן משימות | `/projects/[id]/timeline` |同上 |
| 5 | `tasks.projectWork.filesLink` | קבצי פרויקט | `/projects/[id]?tab=documents` |同上 |
| 6 | `tasks.projectWork.meetingsLink` | ישיבות פרויקט | `/projects/[id]/site-meetings` |同上 |

| # | מצב נוכחי | Commit |
|---|-----------|--------|
| 1–4 | routes קיימים; **ניווט workspace שבור** (REG-006); 4 טאbs ב־`project-work-nav-tabs.tsx` **לא נראים** | `b5986c18` |
| 5–6 | **לא** ב־`ProjectWorkNav`; ב־commercial רק דרך לשוניות/hub ביצוע | `b5986c18` |

**מחזור חיים (`git log -S ProjectUwmLinks`):** `3c3c381d` — יצירה (**2** כרטיסים: tasks, boards); `4117381f` — הרחבה ל-**6**; `b5986c18` — מחיקת הקומפוננטה + החלפה ב-workspace entry/nav.

---

## 7. ציר זמן Git (רגרסיות)

| SHA | קובץ(ים) | לפני | אחרי | השפעה |
|-----|-----------|------|------|--------|
| `3c3c381d` | `project-uwm-links.tsx` | — | 6 כרטיסי קישור | כניסה מהירה UWM |
| `3e197a49` | DG experience | פרויקט רגיל | חוויית GC | hubs ביצוע |
| `57aea87f` | `execution-hubs.ts` | — | children: tasks/boards/calendar/timeline | URLs → execution segments |
| `ec377f29` | `layout.tsx`, `execution-workspace-path.ts` | nav על כל הדף | commercial vs execution | הסתרת 360/tabs; כותרת משותפת |
| `b5986c18` | `layout.tsx`, מחיקת UWM links, `project-work-*` | 6 כפתורים | כניסה + work nav | **REG-006** + **REG-007** |
| `9659afbf` | contractor portal UX | — | — | גישת קבלנים (לא מחיקת UI) |
| `705438a1` | `layout.tsx` | `getShellContext()` | `getShellContextForProject(projectId)` | visibility לשוניות/מטריקות לפי RBAC פרויקט (REG-013) |
| `87c86a31` | `layout.tsx` | `WithClientMessages` | `WithAppClientMessages` | namespace חסר → copy ריק ב-nav לקוח (REG-014) |
| `fa562271` | `select-execution-nav-links.ts` | fallback ל־`/contractors/{id}/changes` | רק רשימת קבלנים | nav «קבלנים» נעלם אם list חסום |
| `4117381f` | `project-uwm-links.tsx` | 2 קישורים | **6** קישורים (קבצים, ישיבות נוספו) | baseline ל-6 כפתורים |
| `b5986c18` | `project-work-nav-tabs.tsx` | — | `PROJECT_WORK_ROUTES` (4 segments בלבד) | **מעולם לא** 6 טאbs ב-git (`git log -S PROJECT_WORK_ROUTES` → commit יחיד) |

---

## 8. הפרדה תפעולית / כספית

| אזור | הרשאות טypical | טעינת כספי |
|------|----------------|------------|
| Commercial tabs | `PROJECT_FINANCIALS_READ`, מודולים | `Project360Summary`, טאbs |
| Layout header | כנ"ל | `ProjectHeaderMetrics` **בכל מסלול** |
| Execution dashboard | `PROJECT_VIEW` + payables caps | `loadExecutionPayableTotals` |
| Task pages | `TASKS_READ` | רשימת משימות; **ללא** panel 360 — אך layout metrics |

**מסקנה:** ההפרדה **חלקית** — authorization נשמר; **UX** מערבב כספי ב-workspace תפעולי דרך layout.

### 8.1 טעינת כספי — execution / tasks (מ [UX financial separation audit](87af829c-63de-46f2-ab6f-dd10ee67e5be))

**שתי מילוני הרשאה (מכוון):**

| שכבה | מקור | שימוש |
|------|------|--------|
| Org permissions | `shared/permissions/catalog.ts` | לשוניות מסחר, `getProjectFinancials`, `ProjectHeaderMetrics` (`PROJECT_FINANCIALS_READ` / `CONTRACTS_READ`) |
| Project capabilities | `project-team/domain/capabilities.ts` | GC execution: `loadExecutionPayableTotals`, `loadProjectCostControl`, hub gates |

**משימות — אין `getProjectFinancials` בדף:** `listAccessibleTasksPage`, `mapTasksToCardDataForOrg` (שעות בלבד). **אך** layout עדיין טוען chrome חוזה דרך org permissions.

| Route | Loaders כספיים |
|-------|----------------|
| `/projects/{id}/tasks`, boards, calendar, timeline | **דף:** לא; **layout:** `getProjectDetailChrome` / metrics |
| `/projects/{id}/activity?domain=task` | `ActivityFeed` בלבד |
| `/projects/{id}/execution` | `loadExecutionPayableTotals`, commitments (`CONTRACT_FINANCIAL_VIEW`) |
| `/projects/{id}/cost-control` | `loadProjectCostControl` (capabilities) |
| `/tasks/{taskId}` (גלובלי) | ללא layout פרויקט — ללא metrics strip |

**REG-006 — הערת מבחן:** `tests/unit/project-workspace/project-work-workspace-path.test.ts` מתאר במפורש ש-work path **«defers to execution workspace»** כש-segment בשניהם — כלומר עדיפות execution **מקודדת בבדיקה**, לא רק טעות merge; **עדיין** סותר את copy המוצר (`projectWork.identityHint`: workspace משימות נפרד) ואת `ProjectWorkNav` שלא מוצג על `/tasks`.

| Finding ID | חומרה | תיאור |
|------------|--------|--------|
| **REG-015** | MEDIUM | Commercial overview: `Project360Summary` + `OverviewFinancialSnapshotPanel` — כפילות טעינה/תצוגה כספית + metrics מעל |
| **REG-016** | INFO | הפרדה capability vs permission תקינה ב-backend; רגרסיית UX = layout chrome org-level על נתיבי capability-gated |

---

## 9. ניהול גישת קבלנים — UI / פעולות / הרשאות

**Route:** `/projects/[projectId]/contractor-access`  
**Page:** `contractor-access/page.tsx` → `ContractorAccessManager`

| יכולת | UI | Backend | הערות |
|--------|-----|---------|--------|
| הזמנה + username ביצירה | `InviteForm` | `inviteContractor` | ✅ |
| עריכת displayName/phone אחרי הזמנה | ❌ | `external_update_own_profile` (פורטל) | ❌ למנהל פרויקט |
| שינוי username | ❌ | יצירה בלבד | Finding **REG-008** MEDIUM |
| איפוס סיסמה (קישור) | `issue_reset` | `issueContractorPasswordReset` | ✅ אם `canHomeManage` |
| השבתה/הפעלה | disable/enable | `setContractorAccountDisabled` | ✅ |
| ביטול grants | revoke + edit caps | `updateContractorGrant` | ✅ `EXTERNAL_ACCESS_MANAGE` |
| הצגת סיסמה | ❌ | — | ✅ |

**Authority:** `loadContractorAccessAuthority` — `canView = invite \|\| manage`; `canManage = EXTERNAL_ACCESS_MANAGE`.

**ניווט:** קישור מ־`contractors/screen.tsx` → `contractorAccessHref`; **לא** ב־7 hubs הראשיים — route execution segment `contractor-access` (Owner). Employee: `contractor-access` **לא** ב־`EMPLOYEE_EXECUTION_PATHS` — אין ב-nav; קישורים inline עדיין מובילים ל-URL ללא page.

**הפרדת הרשאות:** `CONTRACTOR_INVITE` בלבד — הזמנה/reissue; **ללא** revoke/reset/disable. `EXTERNAL_ACCESS_MANAGE` — grants + פקודות חשבון; **ללא** invite חדש.

**לא אותו מוצר:** Settings → Portal (`PORTAL_MANAGE`) — grants לקוח/ספק; **לא** `contractor-access`.

| Finding ID | חומרה | תיאור |
|------------|--------|--------|
| **REG-008** | MEDIUM | אין UI לעדכון פרטי חשבון קבלן (מלבד grant); `contactEmail` ב-summary לא מוצג ב-`AccountCard` |
| **REG-009** | MEDIUM | פעולות חשבון רק `isHomeOrganization` — חשבונות cross-org: הודעה בלבד |
| **REG-010** | LOW | Owner: דף גישה תלוי URL / מסך קבלנים (לא hub ראשי) |
| **REG-011** | **HIGH** | Employee: `contractorAccessHref` → `/employee/.../contractor-access` **404** (אין page, אין parity) |
| **REG-013** | MEDIUM | `705438a1` — gating לשוניות/מטריקות project-scoped; שינוי visibility לפי חברות בפרויקט |
| **REG-014** | LOW | `87c86a31` — רגרסיית i18n client אם namespace חסר ב-`WithAppClientMessages` |

---

## 10. מטריצת routes / ניווט (Owner — עיקרי)

| Route | Layout mode | PageHeader+Metrics | 360 / Tabs | Nav משני | הערות |
|-------|-------------|-------------------|------------|----------|--------|
| `/projects/[id]` | commercial | ✅ | ✅ | hub tabs | overview |
| `/projects/[id]/tasks` | **execution*** | ✅ | ❌ | **Execution** (GC) / **אין** (!GC) | *REG-006 |
| `/projects/[id]/boards` | **execution*** | ✅ | ❌ | כ同上 | * |
| `/projects/[id]/calendar` | **execution*** | ✅ | ❌ | כ同上 | * |
| `/projects/[id]/timeline` | **execution*** | ✅ | ❌ | כ同上 | * |
| `/projects/[id]/execution` | execution | ✅ | ❌ | 7 hubs | + כספי בדף |
| `/projects/[id]/contractors` | execution | ✅ | ❌ | 7 hubs | |
| `/projects/[id]/contractor-access` | execution | ✅ | ❌ | 7 hubs | ניהול פורטל |
| `/projects/[id]/contractors/[agreementId]` | execution | ✅ | ❌ | 7 hubs | 360 קבלן |
| `/projects/[id]/execution-planning` | execution | ✅ | ❌ | hub links | כולל קישורי tasks… |
| `/projects/[id]/rfi`, `/submittals`, … | execution | ✅ | ❌ | hub / ישיר | |
| `/projects/[id]/financials` | commercial | ✅ | ✅ | tabs | |

| `/employee/projects/[id]/contractor-access` | — | — | — | **אין page** | REG-011 — קישור ש broken מ-contractors |
| `/employee/projects/[id]/contractors` | execution* | header מינימלי | ❌ | 7 hubs | קישור manage access → 404 |

Employee: `/employee/projects/[id]/…` — מקביל; boards → `board`; ללא `ProjectWorkNav`; financials ב־`/financials` נפרד.

---

## 11. רגרסיות מאושרות

ראה Findings REG-001 … REG-014 למעלה.

---

## 12. יכולות שעובדות — **אסור למחוק**

- 7 hubs Developer/GC + `ExecutionHubLinks` / children
- routes מודוליים (RFI, submittals, defects, safety, …)
- `ContractorAccessManager` + server actions
- רשימת משימות / boards / calendar / timeline (עמודים)
- `Project360Summary` + hub tabs **במסך מסחרי**
- RLS / `PROJECT_CAPABILITIES` — לא לש rewrite

---

## 13. ממצאים לפי חומרה

| חומרה | IDs |
|--------|-----|
| **CRITICAL** | REG-006 |
| **HIGH** | REG-001, REG-004, REG-007, REG-011 |
| **MEDIUM** | REG-002, REG-003, REG-005, REG-008, REG-009, REG-012, REG-013, REG-015 |
| **LOW** | REG-010, REG-014 |
| **INFO** | REG-016 |

---

## 14. תיקונים מומלצים (כיוון בלבד — **לא** תוכנית יישום)

1. **REG-006:** לשנות סדר/לוגיקת סיווג — UWM segments יגברו על execution, או להסיר `tasks/boards/calendar/timeline` מ־`EXECUTION_SEGMENTS` לצורך layout בלבד.
2. **REG-001/004:** ב־execution + project-work — layout «רזה» (ללא `ProjectHeaderMetrics` / כותרת מלאה).
3. **REG-007:** להחזיר 6 כניסות (או 4+2) **בתוך** `ProjectWorkNav` / commercial entry.
4. **REG-005:** להעביר כספי ביצוע ל־hub payments / cost-control בלבד.
5. **REG-008:** UI עריכת פרופיל קבלן למנהל (ללא הצגת סיסמה).
6. **REG-011:** Employee — דף `contractor-access` או הפניה ל-Owner surface; אל תשאיר href ש broken.
7. **REG-012:** להחליט מוצרית: execution רק `developer_gc` vs החזרת chrome לפרויקטי subcontract בלבד.

---

## 15. לא מאומת / דורש ראיות

| פריט | סטטוס |
|------|--------|
| 3 צילומי מסך הבעלים | **לא נמצאו** במאגר — מסקנות מקוד + Git |
| Production / role ספציפי | לא נבדק בדפדפן |
| `modules.work_management` / `TASKS_READ` כבויים | gates ב־`layout.tsx` L120–121 |
| Employee UWM | **לא** נבדק E2E |

---

## נספח — תבנית Finding

כל REG-xx למעלה כולל: Severity, File, Commit (where known), Expected vs Current, Correction direction, Verification = static code review ✅.

---

*סוף דוח — המתנה לאישור בעלים לפני תוכנית תיקון מתואמת אחת.*
