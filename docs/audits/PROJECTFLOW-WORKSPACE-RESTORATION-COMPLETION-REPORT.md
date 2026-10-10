# ProjectFlow — דוח השלמת תיקון רגרסיות Workspace / משימות / ביצוע / קבלנים

**תאריך:** 2026-10-10  
**מצב:** יישום מקומי + אימות ממוקד (ללא commit / push / deploy / הרצת SQL ב-Production)  
**מקור דרישות:** `docs/audits/PROJECTFLOW-DEVELOPER-EXECUTION-TASKS-CONTRACTOR-REGRESSION-AUDIT.md`

---

## תקציר מנהלים

שוחזרו שלוש חוויות פרויקט נפרדות ברמת layout וסיווג נתיבים: **מסחרי**, **ניהול משימות (Project Work)**, **ביצוע Developer/GC**. תוקן **REG-006** (עדיפות work לפני execution), הוחזרו **6** פעולות ניווט משימות, הוסר chrome כספי/מסחרי ממסלולים תפעוליים, הושלם ניהול חשבון קבלן ב-UI, ונפתח דף Employee ל-`contractor-access`.

---

## מדדי השלמה (§17)

| מדד | תוצאה |
|-----|--------|
| **SUBAGENTS LAUNCHED** | **6/6** (A–F במהלך הגל) |
| **REG FINDINGS RESOLVED** | **8 DONE · 8 PRESERVE · 0 N/A · 0 BLOCKED** (מתוך 16) |
| **PROJECT WORKSPACE** | **COMPLETE** (Owner app + Employee work shell) |
| **SIX TASK BUTTONS** | **6/6** (Owner `ProjectWorkNavTabs`) |
| **DEVELOPER/GC EXECUTION** | **COMPLETE** (7 hubs + nav; ללא panel כספי בדשבורד) |
| **SEVEN EXECUTION HUBS** | **7/7** (`EXECUTION_HUBS`) |
| **MULTI-INDUSTRY TASK ISOLATION** | **PASS** (סיווג נתיבים; UWM תמיד Project Work) |
| **CONTRACTOR ACCOUNT MANAGEMENT** | **COMPLETE** (UI + actions; SQL מוכן — לא הופעל) |
| **EMPLOYEE BROKEN ROUTES** | **FIXED** (`contractor-access/page.tsx`) |
| **COMMERCIAL FINANCIAL SEPARATION** | **PASS** (תפעולי ללא `ProjectHeaderMetrics`; מסחרי שומר metrics/360) |
| **PROJECT OVERVIEW PRESERVED** | **YES** |
| **GLOBAL FAB PRESERVED** | **YES** (לא הוסר; `quick-create` ללא שינוי הרסני) |
| **HE/EN/AR/RU** | **PASS** (מפתחות `tasks.projectWork.nav.*`, `contractorAccess` — לא נבדק דפדפן) |
| **TARGETED TESTS** | **PASS** (`tests/unit/project-workspace/*` — 60 בדיקות) |
| **TYPECHECK** | **PASS** |
| **BUILD** | **PASS** (`next build --webpack`) |
| **SQL REQUIRED** | **YES** — `drizzle/migrations/0178_contractor_username_org_update.sql` (**לא הופעל**) |
| **OPEN BLOCKERS** | **2** (ראו למטה) |

---

## REG-001 … REG-016 — סטטוס

| ID | סטטוס | הערות |
|----|--------|--------|
| **REG-001** | **DONE** | `layout.tsx`: מסלול תפעולי → `loadProjectLayoutIdentity` + `ProjectOperationalContextHeader`; **ללא** `PageHeader` / `ProjectHeaderMetrics`. |
| **REG-002** | **PRESERVE** | `Project360Summary` נטען רק בענף commercial — התנהגות מכוונת (`ec377f29`). |
| **REG-003** | **DONE** | `execution/screen.tsx`: הוסר בלוק `execution.financialTitle`; קישורים ל-`contractor-payments` / `cost-control`. |
| **REG-004** | **DONE** | אותו ענף תפעולי — ללא לשוניות overview / 360 / metrics strip. |
| **REG-005** | **DONE** | אין panel כספי ייעודי בדשבורד ביצוע (נשארו מטריקות תפעוליות + רשימת קבלנים עם סכומים **רק** ב-`canViewFinancial`). |
| **REG-006** | **DONE** | `execution-workspace-path.ts`: UWM + `site-meetings` מוחרגים מ-execution; layout: `inProjectWorkWorkspace` **לפני** execution. |
| **REG-007** | **DONE** | `project-work-nav-tabs.tsx`: tasks, boards, calendar, timeline, `?tab=documents`, `site-meetings`. |
| **REG-008** | **DONE** | `AccountProfileForm` + `updateContractorPrincipalProfileAction` / `updateHomeContractorPrincipal` (displayName, username, email, phone). |
| **REG-009** | **PRESERVE** | פקודות חשבון רק `isHomeOrganization` + הודעת `homeOrgOnly` — גבול אבטחה מכוון. |
| **REG-010** | **PRESERVE** | גישת קבלנים דרך hub «קבלנים» / `contractor-access` — לא hub ראשי (כמו בביקורת). |
| **REG-011** | **DONE** | `employee/.../contractor-access/page.tsx` + actions; capability gating. |
| **REG-012** | **PRESERVE** | `select-execution-nav-links.ts` / `load-execution-nav.ts`: chrome ביצוע לפרופיל GC — שינוי מוצר מאושר בביקורת. |
| **REG-013** | **PRESERVE** | `getShellContextForProject(projectId)` ב-layout מסחרי — RBAC פרויקט. |
| **REG-014** | **PRESERVE** | `WithAppClientMessages` + `PROJECT_SURFACE_CLIENT_MESSAGE_NAMESPACES` בענפי layout. |
| **REG-015** | **PRESERVE** | כפילות 360 + snapshot במסך מסחרי **לא** טופלה (מחוץ להפרדה תפעולית שהבעלים דרש ב-§7). |
| **REG-016** | **PRESERVE** | הפרדת capability (ביצוע) vs permission (org) ב-backend — ללא שינוי ארכיטקטוני. |

---

## קבצים שנוגעו (עיקריים)

**Layout / נתיבים:**  
`src/app/[locale]/(app)/projects/[projectId]/layout.tsx`, `load-project-detail.ts`,  
`src/modules/project-workspace/domain/execution-workspace-path.ts`, `project-work-workspace-path.ts`,  
`src/modules/project-workspace/ui/project-operational-context-header.tsx`, `project-work-nav.tsx`, `project-work-nav-tabs.tsx`, `project-execution-nav.tsx`,  
`src/app/[locale]/employee/(shell)/projects/[projectId]/layout.tsx`

**ביצוע:**  
`src/app/[locale]/(app)/projects/[projectId]/execution/screen.tsx`, `execution-hub-frame.tsx`, `execution-hubs.ts`, …

**קבלנים:**  
`src/modules/contractor-access/ui/contractor-access-manager.tsx`, `manage-contractor-access.ts`, `validation/schemas.ts`,  
`src/app/.../contractor-access/actions.ts`,  
`src/app/[locale]/employee/(shell)/projects/[projectId]/contractor-access/*`

**i18n:** `src/locales/{he-IL,en,ar,ru}/tasks.json`, `contractorAccess.json`, `projectWorkspace.json`

**בדיקות:**  
`tests/unit/project-workspace/*.test.ts` (כולל `multi-industry-workspace-routing.test.ts`, `project-work-nav-links.test.ts`)

**SQL (מוכן, לא הופעל):**  
`drizzle/migrations/0178_contractor_username_org_update.sql`, `drizzle/migrations/meta/_journal.json`

---

## OPEN BLOCKERS

1. **SQL / migration 0178** — נדרש לאישור Owner נפרד לפני `db:migrate` / Production.  
2. **אימות דפדפן** — לא בוצע smoke על: 6 כפתורים end-to-end, עריכת username ב-Production auth, Employee contractor-access עם הרשאות אמיתיות.

---

## זרימות שלא אומתו בדפדפן

- מעבר commercial → tasks → boards עם `ProjectWorkNav` גלוי (GC ו-trade).  
- קישור «קבצים» → `?tab=documents` (יוצא מ-workspace — מכוון לפי spec הביקורת).  
- Employee: 5 כפתורי work (ללא timeline) + `files` → `/employee/projects/{id}/files`.  
- שינוי username קבלן לאחר migration 0178.

---

## SQL / MIGRATION (עצירה לפני Production)

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations/0178_contractor_username_org_update.sql
PURPOSE = לאפשר עדכון username לקבלן (זהות auth) תוך שמירה על immutability של auth_user_id / home_organization_id
DATA MUTATION = NO (פונקציית trigger בלבד)
SCHEMA MUTATION = YES (REPLACE FUNCTION)
RISK = MEDIUM — דורש בדיקה על DB משותף לפני apply
READY FOR OWNER REVIEW = YES
```

---

*סוף דוח — ממתין לאישור שחרור Production מהבעלים.*
