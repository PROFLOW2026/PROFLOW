# ProjectFlow — System-Wide User Access and Workflow Audit

**כותרת קודמת:** Employee & Contractor Access and Workflow Audit  
**תאריך עדכון:** 2026-10-10  
**מצב:** גילוי read-only (Lead + 6 סוכני מחקר + הרחבת Lead)  
**שינויי קוד/SQL:** 0  

> מסמך זה **מרחיב** את הביקורת הקודמת (עובדים + קבלנים) ל**כל** תפקידי ארגון, תבניות הרשאה, יכולות פרויקט, דומיינים עסקיים וזרימות cross-role. ממצאים קודמים **TL-001 … UX-002** נשמרים.

## מקורות מחקר

| סוכן | תחום | מזהה |
|------|------|------|
| Employee screens/nav | 92 `page.tsx` | [Employee screens](7e7b361a-01ab-4b7e-a814-549d0231563e) |
| Employee roles/RLS | RBAC vs grants | [Employee RLS](9782f081-41b2-49ef-903c-f32b500bfed1) |
| Task lifecycle | approvals | [Task lifecycle](6acd718d-b552-445e-bd2c-1766e40ac539) |
| Contractor portal | PORTAL_ROUTES | [Contractor screens](8cafc2be-2ab4-4d16-acc8-ef254eb2dbb0) |
| Contractor access | isolation | [Contractor access](534b698a-659a-46d7-b06c-a5e868489952) |
| Mobile/RTL/tests | UX | [Mobile RTL](5597879e-fb93-4e65-886b-18c165e27d80) |

**ראיות Lead נוספות:** `role-templates.ts`, `presets.ts`, `project-team/domain/templates.ts`, `components/shell/navigation.ts`, `session.ts`, `experience-persona.ts`, `drizzle/schema/tasks.ts`.

---

## 1. סיכום מנהלים

ProjectFlow מפעיל **ארבעה מישורי זהות** (לא שלושה):

| מישור | כניסה | זהות | הרשאות |
|--------|--------|------|--------|
| **Owner / Back-office** | `/(app)/**` | `organization_memberships` + RBAC | `role_assignments` (+ project-scoped roles) |
| **Employee App** | `/employee/**` | role `employee` + `employee_app_accounts` | `employee_permission_grants` (**מחליפים** org permissions ב-session) |
| **Contractor portal** | `/contractor/**` | `external_principals` | `external_access_grants` (`ext.*`) |
| **Project capabilities** | תוך `(app)` / employee project / GC execution | `project_members` | יכולות per-project (**לא** org role) |

**פרופיל עסקי** (`businessProfileKey`, `operatingRoles` בפרויקט) משנה **מודולים וניווט UX** — **לא** מעניק הרשאות (`experience-persona.ts`, `navigation.ts`).

**ברירת מחדל משימות:** `approval_required DEFAULT false` (`drizzle/schema/tasks.ts`) — **תואם** מדיניות Owner; **אך** Main app מאפשר `done` בלי gate כש-`approvalRequired=true` (**TL-001**), ו**אין UI** להפעלה (**TL-002**).

**סיכונים מערכתיים:** (1) פער אישור משימות Owner vs Employee. (2) בלבול תפקיד org `manager` (תיאור "Project Manager") מול מנהל פרויקט ב-capabilities. (3) משרד/כספים ב-Employee App — חלק מהדומיינים **רק** ב-`(app)` (CRM, SUMIT settings, HR cost manage). (4) ניווט mobile לעובד ללא התראות.

---

## 2. מלאי תפקידים וקטגוריות משתמש (A–W)

**מקרא סוג:**

| סוג | משמעות |
|-----|--------|
| **ORG-RBAC** | תבנית `ROLE_TEMPLATES` — 5 מפתחות |
| **EMP-PRESET** | `EMPLOYEE_PRESETS` — 14 תבניות + custom |
| **PROJ-CAP** | `PROJECT_CAPABILITY_TEMPLATES` — 16 תבניות |
| **EXT-GRANT** | `EXTERNAL_GRANT_TEMPLATES` — 4 |
| **BIZ-PROFILE** | `BusinessProfileKey` — UX/modules בלבד |
| **CONFIG** | Owner מגדיר grants/capabilities ידנית |
| **N/A** | אין תפקיד ייעודי בקוד |

| # | קטגוריה Owner | מימוש בקוד | מישור כניסה טיפוסי |
|---|----------------|------------|---------------------|
| A | Owner / מנהל ארגון | **ORG-RBAC** `owner` — `ALL_PERMISSION_KEYS` | `(app)` |
| B | מנהל כללי | **ORG-RBAC** `manager` (שם בקוד: "Project Manager") + **CONFIG** toggles | `(app)` |
| C | מנהל פרויקט | **ORG-RBAC** `manager` ו/או **PROJ-CAP** `project_manager_*` ו/או **EMP-PRESET** `project_manager` | `(app)` + project; employee אופציונלי |
| D | מנהל אתר / מפקח בנייה | **PROJ-CAP** `site_manager`; **EMP-PRESET** `foreman`/`supervisor_inspector` (חלקי) | `(app)` / `/employee` |
| E | מנהל עבודה / ר"צ | **EMP-PRESET** `foreman`, `team_lead`; **PROJ-CAP** `foreman` | `/employee` / `(app)` |
| F | עובד שטח | **EMP-PRESET** `field_worker`; **ORG-RBAC** `worker` (**מישור שונה**) | `/employee` אם role `employee`; אחרת `(app)` worker |
| G | חשמלאי / אינסטלציה / מיזוג | **BIZ-PROFILE** `ELECTRICAL`, `PLUMBING`, `HVAC` → persona `electrical`/`service` | `(app)` לפי RBAC |
| H | מזכירה / מנהלת משרד | **EMP-PRESET** `secretary`, `office_admin`/`office` | `/employee` (אין CRM ב-editor) |
| I | מנהל משרד | **EMP-PRESET** `management`, `office_admin` | `/employee` + `(app)` אם גם org role |
| J | הנהלת חשבונות | **ORG-RBAC** `finance` (חלקי); **EMP-PRESET** `office_admin` (AP/billing) | `(app)` מלא; employee חלקי |
| K | רואה חשבון / כספים | **ORG-RBAC** `finance` | `(app)` |
| L | רכש | **ORG-RBAC** `manager` (`PROCUREMENT_*`); **EMP** `management` read | `(app)` |
| M | HR / שכר | **ORG-RBAC** `manager`/`finance` (`WORKFORCE_*`, `WORKFORCE_COST_*`); **לא** ב-employee editor | `(app)` — `/workforce/*` |
| N | אדריכל | **BIZ-PROFILE** `ARCHITECT` | `(app)` |
| O | מהנדס / יועץ הנדסה | **EMP-PRESET** `external_consultant`; **PROJ-CAP** `consultant`, `execution_engineer` | `(app)` / `/employee` / portal |
| P | מעצב / תכנון | **BIZ-PROFILE** `DESIGNER` → persona architecture | `(app)` |
| Q | כמאי / בקר עלויות | **PROJ-CAP** `quantity_surveyor` | `(app)` project execution |
| R | PM מפתח | **PROJ-CAP** `developer_representative` + `operatingRoles` developer | `(app)` GC execution |
| S | PM קבלן ראשי | **PROJ-CAP** `project_manager_full` + GC profile | `(app)` |
| T | קבלן חיצוני | **EXT-GRANT** `site_contractor` / `contractor_admin` | `/contractor` |
| U | קבלן משנה | אותו portal; grant scoped ל-vendor/agreement | `/contractor` |
| V | יועץ חיצוני | **EXT-GRANT** read_only / claims_only; **EMP** `external_consultant`; **PROJ-CAP** `consultant` | portal / employee / app |
| W | נוספים | **PROJ-CAP:** document_controller, safety_manager, quality_manager, project_secretary, client_coordinator, senior_project_manager, viewer, project_accountant | `(app)` |

**ORG-RBAC (5):** `owner`, `manager`, `finance`, `worker`, `employee` — `src/shared/permissions/role-templates.ts`.  
**EMP-PRESET (14+custom):** `presets.ts` — `field_worker`, `field_worker_time`, `technical_professional`, `professional_employee`, `foreman`, `team_lead`, `project_manager`, `office_admin`, `office`, `secretary`, `management`, `read_only_project`, `external_consultant`, `supervisor_inspector`, `custom`.  
**PROJ-CAP (16):** `PROJECT_TEMPLATE_KEYS` ב-`templates.ts`.  
**EXT-GRANT (4):** `site_contractor`, `contractor_admin`, `claims_only`, `read_only`.

---

## 3. מטריצת אימות / מישורים

| משתמש | Auth | Surface guard | Context |
|--------|------|---------------|---------|
| Org member (לא employee פעיל) | Supabase + org picker | `(app)/layout` → `assertOwnerAppSurface` | `OrgContext`, `getShellContext` |
| Employee App | username/PIN | `(shell)/layout` → `assertEmployeeAppContext` | `employeeApp.grants` replaces permissions |
| Contractor | username/password | `decideContractorSurface`, `requireExternalContext` | `ExternalContext`, no OrgContext |
| Revoked / disabled | — | redirect login / `session_revoked` / inactive principal | grants filtered |

**שינוי הרשאות retroactive:** grants/capabilities נקראים בכל request; שינוי Owner → session הבא (אין cache ארוך של grants). **Employee:** `enrich-context.ts`. **Contractor:** `listLiveGrantsForPrincipal`. **RLS:** מיידי ב-DB.

---

## 4. מטריצת ניווט

### 4.1 Owner app (`NAV_ITEMS` ~60 entries)

מקור: `src/components/shell/navigation.ts`. כל פריט: `permission` / `anyPermissions` + `module` visibility.  
דוגמאות: `today` → `COMMAND_CENTER_READ`; `crm` → `CRM_READ`; `reports` → `PROJECT_FINANCIALS_READ`; `settings` → תמיד (core).  
**Mobile:** `primaryOnMobile` + persona/work_mix (`experience-nav-layout.ts`).  
**246** routes תחת `(app)/`.

### 4.2 Employee app

`buildEmployeeNavItems` — 17 פריטים אפשריים (planner + management). **92** routes.  
אין CRM, אין settings org, אין workforce admin.

### 4.3 Contractor portal

38 `PORTAL_ROUTES`; nav = capabilities union per project.

---

## 5. מטריצת הרשאות ו-scopes (תמצית מערכתית)

### 5.1 Org RBAC — יכולות לפי תבנית

| תחום | owner | manager | finance | worker | employee (org role בלבד) |
|------|-------|---------|---------|--------|-------------------------|
| Settings / roles | ✓ | ✗ | ✗ | ✗ | ✗ |
| Profit / month close manage | ✓ | חלקי | ✓ | ✗ | ✗ |
| Projects all | ✓ | ✓ (toggle) | toggle | ✗ | ✗ |
| Tasks approve | ✓ | ✓ | ✗ | ✗ | ✗ |
| CRM | ✓ | ✓ | read | ✗ | ✗ |
| Billing manage | ✓ | toggle | ✓ | ✗ | ✗ |
| AP / procurement | ✓ | ✓ | ✓ | ✗ | ✗ |
| Workforce cost | ✓ | read | read/manage | ✗ | ✗ |
| Field / service | ✓ | ✓ | read | ✓ | ✗ |
| Employee App baseline | ✗ | ✗ | ✗ | ✗ | attendance.self |

**Toggleable (V1):** `TOGGLEABLE_PERMISSIONS` — manager: profit, billing manage, invitations, projects all, workforce manage, project_team.admin.

### 5.2 Employee presets — משרד (CONFIRMED IN CODE + test)

| Preset | Management nav | CRM | Billing/AP | Meetings | Tasks |
|--------|----------------|-----|------------|----------|-------|
| secretary | ✓ | ✗ (no grant key) | read/create expenses, billing read | read | read/comment |
| office_admin / office | ✓ | ✗ | read/manage billing, AP, expenses | read | read/update/comment |
| management | ✓ | ✗ | broad financial ops | read | full task ops + approve |

Test: `management-office-personas.test.ts`.

### 5.3 Project capabilities

43 מפתחות ב-`PROJECT_CAPABILITIES`; templates מגדירים subsets. Financial caps **never implied** operationally.  
Gate: `requireProjectCapabilityPage` / `assertProjectCapability`.  
Org admin bypass: `isOrgProjectAdmin` → all caps (`resolve.ts`).

### 5.4 External

`requireExternalScope` + RLS `app.external_has_scope`; financial `ext.*` explicit.

### 5.5 Enforcement layers

1. UI nav filter — **לא** אבטחה בלבד.  
2. Page `notFound()` / `authorize()`.  
3. Server actions `assertPermission` / employee helpers.  
4. RLS `has_org_permission`, `has_project_permission`, `uwm_has_permission`, `external_*`.

---

## 6. אפליקציית עובדים

(נשמר מהביקורת הקודמת — פירוט routes: [Employee screens](7e7b361a-01ab-4b7e-a814-549d0231563e).)

- **92** מסכים; hub פרויקט + ~40 DG execution mirrors.  
- **אין** notifications, profile, CRM, SUMIT, workforce manage.  
- Project scope: assignments / granted_projects / all_organization.

---

## 7. משרד ומנהלה (Secretary / Office)

**ממשק:** `/employee` עם presets `secretary` / `office_*` / `management`.

| יכולת עבודה | secretary | office_admin | management | פער |
|-------------|-----------|--------------|------------|-----|
| לקוחות | ✓ manage/read | ✓ | ✓ | Employee `(app)` clients mirror |
| ישיבות | read | read | read | create/manage — **Owner** `/meetings` עם `MEETINGS_MANAGE` |
| מסמכים | read | read/manage | read/manage | ✓ |
| משימות משרד | read/comment | update | full | ✓ |
| CRM / leads | **MISSING** | **MISSING** | **MISSING** | `CRM_*` **לא** ב-`permission-editor.ts` |
| לוח שנה org | partial | partial | partial | `/employee/meetings` לא `/calendar` org |
| תזכורות | partial | partial | partial | `(app)/notifications` — **לא** employee |

**מסקנה:** מזכירה **לא** יכולה לבצע CRM/leads **דרך Employee App**; צריך org role עם `CRM_READ` על `(app)` **או** הרחבת editor (לא קיים).

---

## 8. הנהלת חשבונות וכספים

### 8.1 Owner `(app)` — role `finance`

Routes: `/billing`, `/ap`, `/expenses`, `/reports`, `/workforce/*`, month close, SUMIT (`settings/integrations`, `invoicing-integration/providers/sumit`).  
Permissions: `FINANCE_PERMISSIONS` — profit, banking manage, tax, audit read, month_close manage.

### 8.2 Employee App — office_admin / management

AP, billing, expenses, vendors, project financials read — **CONFIRMED IN CODE** (`presets.ts`).  
**אין:** `TAX_MANAGE`, `MONTH_CLOSE_MANAGE`, `BANKING_MANAGE`, `AUDIT_READ`, SUMIT settings, `WORKFORCE_COST_MANAGE`.

### 8.3 SUMIT

Integration UI: `(app)/settings/integrations` — דורש org session + הרשאות settings/integrations (Owner/manager). **NOT** on employee surface.

**מסקנה:** רואה חשבון / הנה"ח מלא → **חייב** `(app)` + role `finance` (או owner). Employee preset = **תפעול חשבונאי שטחי**, לא סגירת חודש/SUMIT.

---

## 9. מנהלים ומנהלי פרויקט

| פרופיל | הרשאה | GC execution | Work UWM |
|--------|--------|--------------|----------|
| Org `manager` | רחב org-wide | project caps נפרד | `/work/*`, command center |
| Project PM full | PROJ-CAP all | ✓ | tasks + financials on project |
| Project PM operational | OPS caps only | ✓ | ללא profit on project |
| Employee `project_manager` | assigned_only tasks/financials read | mirrors if caps | `/employee/projects/.../execution` |

**Developer/GC:** `operatingRoles` developer + general_contractor → 7 execution hubs (`execution-hubs.ts`).

---

## 10. אדריכלים, מהנדסים, יועצים

| פרופיל | גישה |
|--------|------|
| BIZ `ARCHITECT` / `DESIGNER` | Module visibility + nav emphasis — `(app)` |
| EMP `external_consultant` | `granted_projects`: tasks comment, docs, meetings |
| PROJ `consultant` | RFI/submittal/schedule view |
| PROJ `execution_engineer` | תיאום, submittals, quality |

**לא** portal אלא אם גם external grant.

---

## 11. קבלנים וקבלני משנה

(נשמר — [Contractor screens](8cafc2be-2ab4-4d16-acc8-ef254eb2dbb0), [Contractor access](534b698a-659a-46d7-b06c-a5e868489952).)

- 38 routes; isolation **CONFIRMED BY TARGETED TEST**.  
- Subcontractor = אותו portal, grant על vendor/agreement.  
- Approvals = submit → internal review (לא org approvals module).

---

## 12. Developer / General Contractor workflows

| זרימה | Owner `(app)` | Employee mirror | Contractor |
|--------|---------------|-----------------|------------|
| Invite contractor | `contractor-access` + caps | project_secretary template caps | activate |
| RFI/submittal | project routes | employee DG routes | portal |
| Claims/payments | financial caps | cost-control if cap | claims_only grant |
| Tender | `(app)` tenders | employee tenders | portal partial |

Gate: `requireProjectCapabilityPage` + RLS.

---

## 13. מחזור משימות ואישור אופציונלי (מדיניות Owner)

| כלל Owner | מימוש |
|-----------|--------|
| Default `approvalRequired=false` | **CONFIRMED IN CODE** — `tasks.approvalRequired` default false |
| משימה רגילה → done | Employee: gate רק if approvalRequired; Main: **ללא gate** (**TL-001**) |
| משימה עם אישור | submit → decide → done | Employee path **PARTIAL** test; UI configure **MISSING** (**TL-002**) |
| Contractor tasks | מנוע collaboration נפרד; לא `approvalRequired` PM זהה |

Paths: `employee-pm-tasks.ts`, `update-task.ts`, `submit-task-approval.ts`, `task-approval-auth.ts`.

---

## 14. זרימות עסקיות cross-role

| # | זרימה | סטטוס | הערות |
|---|--------|--------|-------|
| W1 | Secretary → meeting → tasks | **PARTIAL** | meetings read employee; create meeting `(app)` MEETINGS_MANAGE |
| W2 | AP bill → approve → payment | **EXISTS AND CONNECTED** (app) | approvals module; employee AP limited |
| W3 | Manager task → employee → optional approval | **PARTIAL** | TL-001/002/003 |
| W4 | GC → contractor task → evidence | **CONFIRMED BY TARGETED TEST** | collaboration test |
| W5 | RFI consultant → team | **CONNECTED** (code) | NOT VERIFIED browser |
| W6 | Attendance → payroll cost | **PARTIAL** | finance/workforce `(app)`; employee time approve |
| W7 | Expense → project cost | **CONNECTED** | RLS 0073/0124 |
| W8 | SUMIT invoice sync | **PARTIAL** | integration owner-only settings |
| W9 | Lead → opportunity → project | **CONNECTED** (app) | CRM permissions; employee N/A |
| W10 | Command center approvals → task | **PARTIAL** | links to `/tasks` not `/employee/tasks` |

---

## 15. Mobile / RTL — כל סוגי משתמש

| Persona | Shell | Mobile nav | RTL | PWA / offline |
|---------|-------|------------|-----|----------------|
| Owner/PM | AppShell | icons + More | he-IL global | settings/offline-drafts `(app)` |
| Employee | max-w-lg | text tabs | ✓ | employee.webmanifest, install UI |
| Contractor | portal-shell | icons | ✓ | dashboard PWA CTA |
| Office on employee | same as employee | same gaps | ✓ | same |

**NOT VERIFIED:** contractor body scroll fix; wide tables on mobile; task board `(app)` on phone.

[Mobile RTL](5597879e-fb93-4e65-886b-18c165e27d80).

---

## 16. אבטחה ובידוד

| נושא | סטטוס |
|------|--------|
| Org tenancy | session org picker — **CONFIRMED IN CODE** |
| Project access mode + caps | **CONFIRMED IN CODE** |
| Employee scope → NotFound | **CONFIRMED IN CODE** + integration |
| Contractor cross-vendor | **CONFIRMED BY TARGETED TEST** |
| Financial RLS | permission + project access |
| Payroll docs | `workforce.cost.read` + privacy |
| URL bypass UI hidden nav | server gates required — **mostly CONFIRMED**; **EA-005** TaskActivity exception |
| Session revoke contractor | **CONFIRMED BY TARGETED TEST** |

---

## 17. מסכים / פעולות מנותקים (תמצית)

| פער | משתמש |
|-----|--------|
| Employee CRM/leads | Secretary |
| Employee notifications | All employees |
| SUMIT / tax / month close on employee | Bookkeeper |
| Workforce cost manage on employee | HR |
| Task approvalRequired UI | Manager |
| Contractor tender bid / handover submit | Contractor |
| Main app done without approval | Manager |
| Command center → employee task URL | Employee approver |

---

## 18. ראיות אימות

| סוג | דוגמאות |
|-----|---------|
| Unit | employee-app (28), contractor-portal (4), project-workspace, task-approval-auth |
| Integration | employee-pm-task-lifecycle, contractor-access lifecycle/session-security, contractor-tasks |
| E2E | employee-multi-org-browser, verification-route-personas — **limited** |

**לא** הורצו: Playwright מלא, browser matrix לכל תפקיד.

---

## 19. רישום ממצאים (מלא)

| ID | Sev | Role | Domain | Expected | Actual | Evidence | Verify |
|----|-----|------|--------|----------|--------|----------|--------|
| TL-001 | CRITICAL | Manager | Tasks | done blocked if approval pending | Main `updateTask` no gate | `update-task.ts` | CONFIRMED IN CODE |
| TL-002 | CRITICAL | Manager/Employee | Tasks | UI set approvalRequired | No field in create/edit UI | work actions, task create pages | CONFIRMED IN CODE |
| TL-003 | MEDIUM | Approver | Notifications | notify on approval | No emit | approvals/tasks | CONFIRMED IN CODE |
| TL-004 | LOW | All | Tasks | default no approval | DB default false | `schema/tasks.ts` | CONFIRMED IN CODE |
| EA-001 | HIGH | Employee | Tasks | cards show approval | hardcoded false | map-employee-pm-task-card.ts | CONFIRMED IN CODE |
| EA-002 | MEDIUM | Employee | Notifications | in-app center | no route | vs contractor | CONFIRMED IN CODE |
| EA-003 | HIGH | Employee | Tasks | lifecycle transitions | direct status SQL | employee-pm-tasks.ts | CONFIRMED IN CODE |
| EA-004 | MEDIUM | Employee | Tasks | error UX | plain forms | task detail | CONFIRMED IN CODE |
| EA-005 | MEDIUM | Employee | Security | activity scoped | loadTaskActivityForDisplay only | task-activity.tsx | CONFIRMED IN CODE |
| CP-001 | MEDIUM | Contractor | Tenders | submit bid | list only | portal tenders | CONFIRMED IN CODE |
| CP-002 | MEDIUM | Contractor | Handover | submit | read-only | handover page | CONFIRMED IN CODE |
| UX-001 | MEDIUM | Employee | Mobile | icon nav | text only | employee-bottom-nav | CONFIRMED IN CODE |
| UX-002 | LOW | Contractor | Mobile | no double scroll | missing body fix | portal-shell vs globals | CONFIRMED IN CODE |
| OFF-001 | HIGH | Secretary/Office | CRM | CRM via authorized UI | CRM not in employee grant editor | permission-editor.ts grep | CONFIRMED IN CODE |
| OFF-002 | HIGH | HR/Payroll | Workforce | cost manage | not grantable on employee | permission-editor vs finance role | CONFIRMED IN CODE |
| OFF-003 | MEDIUM | Bookkeeper | SUMIT | configure/send | settings only on (app) | settings/integrations | CONFIRMED IN CODE |
| SYS-001 | MEDIUM | All | RBAC UX | clear GM vs PM | org template `manager` named "Project Manager" | role-templates.ts L220-226 | CONFIRMED IN CODE |
| SYS-002 | MEDIUM | Field | Surfaces | one field experience | org `worker` uses (app); `field_worker` uses /employee | role-templates + presets | CONFIRMED IN CODE |
| SYS-003 | LOW | PM approver | Command center | deep link to approver surface | `/tasks/{id}` only | collect-tasks.ts | CONFIRMED IN CODE (Mission C) |

---

## 20. תיקון מומלץ (קבוצות — לא תוכנית יישום)

1. **Tasks & approval policy:** TL-001, TL-002, EA-001, EA-003, EA-004, TL-003, SYS-003.  
2. **Office/finance surfaces:** OFF-001, OFF-002, OFF-003 — החלטת Owner: הרחבת employee editor vs חובת (app) role.  
3. **Employee parity:** EA-002, UX-001.  
4. **Contractor completion:** CP-001, CP-002.  
5. **Clarity:** SYS-001, SYS-002 — תיעוד/UX labels (לא בהכרח קוד).

---

## נספח — כיסוי 41 דומיינים (Owner app baseline)

מפתח: **App** = `(app)`; **Emp** = `/employee`; **Ext** = `/contractor`; **Cap** = project capability.

| # | דומיין | App | Emp | Ext | הרשאות/org caps עיקריות |
|---|--------|-----|-----|-----|-------------------------|
| 01 | Dashboard/nav | ✓ | hub | dash | org read / command_center |
| 02 | Clients CRM | ✓ | ✓* | ✗ | CLIENTS_* (*emp preset) |
| 03 | Leads/opportunities | ✓ | ✗ | ✗ | CRM_* |
| 04 | Quotes | ✓ | ✓ | ✗ | QUOTES_* |
| 05 | Contracts/changes | ✓ | ✓ | detail | CONTRACTS_*, CHANGES_* |
| 06 | Projects setup | ✓ | ✓ | home | PROJECTS_*, PROJECT_VIEW |
| 07 | Project teams | ✓ | team | ✗ | PROJECT_TEAM_MANAGE cap |
| 08 | Tasks/work | ✓ | ✓ | ✓ | TASKS_*, ext.task.* |
| 09 | Task approvals | ✓ | ✓ | N/A | TASKS_APPROVE, approvals |
| 10 | Planning/schedule | ✓ | GC | schedule | PLANNING_*, SCHEDULE_* caps |
| 11 | Calendar/meetings | ✓ | ✓ | ✗ | MEETINGS_* |
| 12 | Attendance | ✓ | ✓ | ✗ | ATTENDANCE_* |
| 13 | Project hours | ✓ | ✓ | ✗ | TIME_* |
| 14 | Employees HR | ✓ | ✗ | ✗ | WORKFORCE_* |
| 15 | Payroll/labor cost | ✓ | ✗ | ✗ | WORKFORCE_COST_* |
| 16 | Expenses | ✓ | ✓ | ✗ | EXPENSES_* |
| 17 | Procurement | ✓ | ✓ | ✗ | PROCUREMENT_* |
| 18 | Vendors/AP | ✓ | ✓ | payments view | AP_*, VENDORS_* |
| 19 | Inventory/materials | ✓ | ✗ | ✗ | MATERIALS_* |
| 20 | Billing/collections | ✓ | ✓ | ✗ | BILLING_* |
| 21 | Payments schedule | ✓ | partial | ext payment | BANKING_*, PAYMENT_* caps |
| 22 | SUMIT/accounting | ✓ settings | ✗ | ✗ | INTEGRATIONS_*, finance |
| 23 | Profitability reports | ✓ | partial | ✗ | PROJECT_PROFIT_*, FINANCIAL_VIEW |
| 24 | Documents/storage | ✓ | ✓ | ✓ | DOCUMENTS_*, ext.document.* |
| 25 | Drawings/plans | ✓ | GC | ✓ | PLAN_* caps |
| 26 | RFI/submittals | ✓ | GC | ✓ | RFI/SUBMITTAL caps |
| 27 | Site instructions | ✓ | GC | ✓ | SITE_INSTRUCTION ack |
| 28 | Inspections/punch | ✓ | GC | partial | QUALITY_* caps |
| 29 | Quality/defects/safety | ✓ | GC | ✓ | DEFECTS/SAFETY caps |
| 30 | Contractor comms | ✓ | GC | tasks | CONTRACTOR_* caps |
| 31 | DG/GC execution | ✓ | mirror | N/A | execution hubs |
| 32 | Tendering | ✓ | ✓ | partial | BID cap / ext.bid |
| 33 | Handover/closeout | ✓ | ✓ | partial | HANDOVER cap |
| 34 | Notifications | ✓ | ✗ | ✓ | NOTIFICATIONS_READ |
| 35 | Automations | ✓ | ✗ | ✗ | AUTOMATIONS_* |
| 36 | Org settings | ✓ | ✗ | ✗ | SETTINGS_MANAGE |
| 37 | Project permissions | ✓ | caps | grants | team manage |
| 38 | External invites | ✓ | ✗ | auth | EXTERNAL_ACCESS_MANAGE |
| 39 | Mobile/PWA | all shells | emp PWA | portal | — |
| 40 | Reports/exports | ✓ | financials | ✗ | REPORTS/financials read |
| 41 | Service/jobs/dispatch | ✓ | ✗ | ✗ | SERVICE_*, DISPATCH_* |

---

## סטטוס סופי (Completeness gate)

```
ROLES MAPPED = 23 קטגוריות Owner (A–W) → 5 ORG + 14 EMP presets + 16 PROJ + 4 EXT + BIZ profiles
PERMISSION PRESETS (ORG) = 5
EMPLOYEE PRESETS = 14 + custom
PROJECT CAPABILITY TEMPLATES = 16
EXTERNAL GRANT TEMPLATES = 4
APPLICATION SURFACES = 4 (app, employee, contractor, project-cap layer)
OWNER APP ROUTES = 246 page.tsx
EMPLOYEE ROUTES = 92
CONTRACTOR ROUTES = 38
DOMAINS COVERED = 41 / 41 (matrix above)
WORKFLOWS TRACED = 10 major (+ employee/contractor prior)
CRITICAL FINDINGS = 2 (preserved)
HIGH FINDINGS = 5 (+ OFF-001, OFF-002, EA-001, EA-003)
MEDIUM FINDINGS = 10
UNVERIFIED FLOWS = 15+ (browser/E2E per role)
CODE CHANGES = 0
SQL CHANGES = 0
```

**STOP — אין תוכנית יישום. ממתין לסקירת Owner.**
