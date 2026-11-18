# ביקורת אבטחה ממוקדת — מיגרציה 0215 (חקירה בלבד)

**תאריך:** 2026-11-18  
**קומיט נבדק:** `4b6d088f`  
**קובץ:** `drizzle/migrations/0215_demo_session_cleanup.sql`  
**מצב:** בדיקה בלבד — לא שונה קוד, לא הורץ SQL, לא Push/Deploy

---

## פסק דין

| # | שאלה | מסקנה |
|---|---|---|
| 1 | ניצול `app.demo_provisioner` למחיקת תקציבים של ארגון אמיתי | **לא** — bypass דורש גם `demo_kind='session'`; ארגון אמיתי (`NULL`) / template חסומים |
| 2 | שמירת הגנות לתקציבים אמיתיים בשלוש הפונקציות | **כן** — לנתיבי real-org הזהים ל־0029/0212; התוספת היא early-return מותנה בלבד |
| 3 | זהות מחיקת דמו מעבר ל־`demo_kind` | **ברמת מחיקת org בקוד: כן**; **ברמת bypass תקציב ב־SQL: חלקי** (ראו ממצא A) |
| 4 | קוד לפני 0215 | **פריסה בטוחה לכניסת דמו**, אבל soft-abandon החדש **נשבר** בלי העמודה — **מומלץ להחיל 0215 לפני/יחד עם הקוד** |
| 5 | Sweeper ב־Prod אחרי מיגרציה | **נשאר כבוי** — cron לא מעביר `includeAbandonedSessionOrgs` |

**ממצא אבטחה אחד (חומרה נמוכה–בינונית, לא שובר ארגונים אמיתיים):** ראו §ממצא A.

---

## 1. מי יכול להגדיר `app.demo_provisioner=on`?

### ראיות קוד
- `withDemoProvisioner` / `deleteDemoSessionOrganization` קוראים  
  `set_config('app.demo_provisioner', 'on', true)` — **מקומי לטרנזקציה**  
  (`src/modules/demo/application/provision.ts` L19, `delete-session.ts` L147).
- הקריאות האלה רצות על **חיבור שרת/admin** (`getAdminDb`, `asService`), לא דרך מסלול UI של משתמש קצה.
- Postgres מאפשר לרוב תפקידים `set_config` על GUC מותאם; ב־Supabase, תפקיד `authenticated` יכול בדרך כלל לקרוא `set_config` אם יש לו ערוץ SQL/RPC.

### האם זה מספיק למחיקת תקציבים של ארגון אמיתי?

`app.demo_session_budget_purge_allowed(org_id)` (0215 L13–26):

```sql
current_setting('app.demo_provisioner', true) = 'on'
AND EXISTS (
  SELECT 1 FROM organizations o
  WHERE o.id = p_org_id AND o.demo_kind = 'session'
)
```

| תרחיש | תוצאה |
|---|---|
| `authenticated` + provisioner + org אמיתי (`demo_kind NULL`) | bypass **נדחה** → נשארות הגנות 0029 |
| אותו דבר על `template` | bypass **נדחה** |
| `authenticated` משנה `demo_kind` ל־`session` | **חסום** ע״י `app.demo_kind_guard` (0211) גם עם provisioner — `current_user IN ('authenticated','anon')` תמיד נכשל |
| service/admin פרוץ | יכול הכול גם בלי 0215 — לא סיכון חדש ייחודי |

**מסקנה:** משתמש/חיבור לא מורשה **לא** יכול לנצל את הדגל למחיקת תקציבים של ארגון עסקי אמיתי.

---

## 2. שלוש הפונקציות מול ההגנות הקיימות

### `app.project_budgets_guard` (מול 0029)
- INSERT / UPDATE / מעברי status / immutable identity — **זהים** ל־0029.
- DELETE: נוסף רק  
  `IF app.demo_session_budget_purge_allowed(...) THEN RETURN OLD;`  
  לפני בדיקות draft/history. לארגון שאינו session — אותן חריגות בדיוק.
- בונוס: `SET search_path = pg_catalog, public` (חיזוק).

### `app.project_budget_history_guard` (מול 0029)
- INSERT מותר; UPDATE עדיין תמיד נחסם.
- DELETE: bypass רק כש־`demo_session_budget_purge_allowed`; אחרת אותה חריגת immutability.

### `app.demo_takeoff_purge_proof_write` (מול 0212)
- 0212: proof רק אם `demo_kind='session'` **ו־** יש שורת `demo_sessions`.
- 0215: מוסיף גם `OR demo_abandoned_at IS NOT NULL` (לסשן נטוש בלי session row).
- ארגון אמיתי / template: עדיין **לא** נכתב proof → מחיקת takeoff append-only נשארת חסומה כמו קודם.

---

## 3. זהות מחיקת דמו

### מחיקת שורת `organizations` (קוד `4b6d088f`)
`hardDeleteDemoSessionOrganizationRow` דורש **כולם**:
1. `demo_kind = 'session'`
2. **וגם** אחד מ:
   - קיימת `demo_sessions`, **או**
   - `demo_abandoned_at IS NOT NULL` **ו־** אין `demo_sessions`

שם `[דמו-נטוש]` **לא** נכנס לתנאי המחיקה.  
סשן פעיל עם session row לא נבחר ל־sweeper (`isAbandonedDemoSessionOrgForSweeper`).

### Bypass תקציבים ב־SQL (0215)
דורש רק: provisioner + `demo_kind='session'`.  
**לא** דורש `demo_sessions` / `demo_abandoned_at` / שלילת `authenticated`.

זה מספיק להגנת ארגונים אמיתיים, אבל ראו ממצא A לגבי משתמש authenticated בתוך סשן דמו.

---

## ממצא A — פער מוצע לתיקון (לא לביצוע)

**תיאור:** `demo_session_budget_purge_allowed` לא חוסם `current_user IN ('authenticated','anon')`, בניגוד ל־`demo_kind_guard` / `demo_marker_guard`.  
אם משתמש דמו (JWT `authenticated`) עם הרשאת `budgets.manage` יכול להריץ `set_config` + `DELETE` על `project_budgets` של **אותו** org דמו, ה־trigger יאפשר מחיקת תקציבים עם היסטוריה.

**השפעה:** פגיעה בשלמות סשן דמו / vandalism — **לא** מחיקת תקציבים של לקוח אמיתי.

**תיקון מוצע (SQL בלבד, אחרי אישור):**

```sql
CREATE OR REPLACE FUNCTION app.demo_session_budget_purge_allowed(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT current_setting('app.demo_provisioner', true) = 'on'
    AND current_user IS DISTINCT FROM 'authenticated'
    AND current_user IS DISTINCT FROM 'anon'
    AND EXISTS (
      SELECT 1 FROM public.organizations AS o
      WHERE o.id = p_org_id
        AND o.demo_kind = 'session'
    );
$$;
```

אופציונלי להחמרה: לדרוש גם  
`(EXISTS demo_sessions) OR (demo_abandoned_at IS NOT NULL)`  
בתוך הפונקציה — יישור מלא עם זהות המחיקה בקוד.

---

## 4. קוד `4b6d088f` לפני החלת 0215

| מסלול | בלי 0215 | עם 0215 |
|---|---|---|
| מחיקת budgets ישירה | נכשלת ב־guard (אין פונקציית bypass) | עוברת תחת provisioner+session |
| fallback `session_replication_role` | נדחה ב־Supabase כמו היום | נדיר |
| soft-abandon (`UPDATE ... demo_abandoned_at`) | **נכשל** — עמודה לא קיימת | מצליח |
| כניסת דמו (`enter-demo` catch) | ממשיכה גם אם cleanup נכשל | עדיף: hard-delete מצליח |
| nightly rows | עלול להיכשל יותר (אין soft-abandon יציב) | hard-delete או soft-abandon תקין |
| sweeper | כבוי | כבוי עד flag |

**מסקנה:** הקוד **לא** פותח חור אבטחה בלי המיגרציה, אבל soft-abandon החדש **תלוי בעמודה**.  
**סדר בטוח:** להחיל 0215 **לפני או מיד עם** פריסת הקוד — לא להשאיר את הקוד ב־Prod בלי העמודה.

---

## 5. האם הניקוי נשאר כבוי ב־Production?

ראיות:
- `runNightlyReset(..., options?)` — `includeAbandonedSessionOrgs` אופציונלי, default לא מופעל (`nightly-reset.ts` L71–115).
- `src/app/api/internal/demo-reset/route.ts` קורא `runNightlyReset(getAdminDb(), { ports... })` **בלי** ה־flag.
- האימות ל־cron: `rejectUnauthorizedInternalWorker(..., 'demo-reset')` + `CRON_SECRET` בלבד.

גם אחרי החלת 0215, ארגוני `[דמו-נטוש]` / `demo_abandoned_at` **לא** נכנסים לתור עד שינוי קוד מפורש שמעביר `includeAbandonedSessionOrgs: true` + אישור Owner.

---

## סדר פריסה בטוח (מומלץ)

1. **אישור Owner ל־SQL 0215** → החלה על Production (additive; אין data mutation מלבד עמודה NULL).  
2. **אם מאושר ממצא A:** לכלול תיקון הפונקציה באותה החלה או מיגרציה 0216 מייד אחריה.  
3. **Push + Deploy** של `4b6d088f` (או HEAD שכולל אותו).  
4. אימות ידני: כניסת דמו + החלפת פרופיל; ELECTRICAL billed≤CCV.  
5. **Sweeper:** נשאר כבוי. אישור נפרד מאוחר יותר + ספירת `demo_kind=session AND demo_abandoned_at IS NOT NULL` לפני הפעלה.

**אין** להפעיל sweeper כחלק מפריסת העקביות העסקית.

---

## עדכון — ממצא A תוקן מקומית (2026-11-18, באישור Owner)

`app.demo_session_budget_purge_allowed` ב־0215 הוקשחה (plpgsql, invoker):
1. `app.demo_provisioner` חייב להיות `on` — תנאי הכרחי בלבד, לא זהות.
2. `current_user` ב־`authenticated` / `anon` / `authenticator` → `false` מיד, לפני קריאת טבלה כלשהי.
3. `current_user` חייב להיות `rolsuper` או `rolbypassrls` לפי `pg_roles` — תכונת תפקיד שאי אפשר לשנות דרך `set_config`.
4. ארגון `demo_kind='session'` **וגם** (`demo_sessions` קיימת **או** `demo_abandoned_at IS NOT NULL`) — אותה זהות שהקוד דורש למחיקת שורת הארגון.
5. `GRANT EXECUTE` ל־`authenticated`, `service_role` — מונע regression שבו מחיקת draft לגיטימית בארגון אמיתי נכשלת על "permission denied" (הגרסה הקודמת עשתה רק `REVOKE FROM PUBLIC`).

בדיקות: `tests/integration/demo/demo-budget-purge-guard-security.test.ts` (S1–S9) — כולן עברו; C1–C4 עברו.

## סיכום לאישור פריסה

- אין ממצא שחוסם פריסת **קוד העקביות** מבחינת סיכון לארגונים אמיתיים.  
- מומלץ **לא לאשר Deploy בלי 0215** בגלל תלות soft-abandon בעמודה.  
- מומלץ לאשר את **תיקון ממצא A** (שלילת authenticated/anon ב־purge_allowed) באותו גל SQL אם רוצים הגנה ברמת DB גם מפני vandalism בסשן דמו.
