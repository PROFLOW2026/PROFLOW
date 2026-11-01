# מיפוי תשתיות - מיגרציה 0195 (הורצה באישור הבעלים, 2026-11-01)

```
FILE = drizzle/migrations/0195_infra_mapping.sql   (journal idx 193, tag 0195_infra_mapping)
STATUS = APPLIED via `npm run db:migrate` (MIGRATION_APPROVED_TAGS=0195_infra_mapping), single run, ledger 193 -> 194
TARGET = Supabase rnjeggpsjchayprygkcw (eu-west-1), PostgreSQL 17.6
DATA MUTATION = NONE (no INSERT/UPDATE/DELETE on existing rows)
SCHEMA MUTATION = ADDITIVE: 5 new tables + one unique index on evidence_items (id, organization_id, project_id)
```

## טבלאות
`infra_folder_mappings`, `infra_captures`, `infra_capture_versions`, `infra_markings`, `infra_comparisons` - RLS מופעל + FORCE.

## מודל שלמות (project-aware)
- כל הפניה ל-`evidence_items`, `infra_captures`, `infra_capture_versions`, `project_locations` היא FK מורכב שמצמיד גם `organization_id` וגם `project_id`.
- סימון (`infra_markings`) קשור לגרסה של אותה תמונה בדיוק: `(version_id, capture_id, organization_id, project_id)`.
- `task_id` מאומת בטריגר (`app.infra_task_link_guard`, SECURITY DEFINER) ולא ב-FK, כי `tasks.project_id` ניתן להעברה וניתן ל-NULL ו-FK מוצמד היה חוסם העברת משימות. פער שיורי: משימה שמועברת לפרויקט אחר אחרי התיעוד אינה נחסמת ברמת DB (הטריגר רץ רק בכתיבה לשורת infra).
- `infra_comparisons_guard` / `infra_captures_guard`: זהות (org, project, מיקום, יוצר, ספק, מצב) בלתי ניתנת לשינוי; קישורים ניתנים למילוי פעם אחת או לניקוי בלבד; `removed_at` סופי.
- מדיניות קבלן: SELECT / INSERT / UPDATE דורשים הרשאה פעילה בפרויקט (`external_has_scope` + `docs_external_capability`); זהות יוצר לבדה אינה מספיקה אחרי ביטול הרשאה. לכל UPDATE יש WITH CHECK.
- הוסר CHECK `has_subject` על `infra_comparisons` (התנגש עם `ON DELETE SET NULL`); הכלל נאכף ב-use-case.

## אימות
סטטי (ללא הרצת SQL): `tests/unit/infra-mapping` (sql-integrity + sql-schema-parity + use-cases + domain + folders), `tsc`, eslint ממוקד, `db:check-journal`.

אחרי ההרצה, על ה-DB היעד:
- קטלוג: 5 טבלאות, RLS+FORCE, 33 FK (כולם validated), 8 טריגרים, 20 מדיניות, 5 פונקציות, אין אינדקס לא תקין, GRANT ל-authenticated / service_role בלבד.
- בדיקת התנהגות בתוך טרנזקציה שבוטלה (ROLLBACK, 0 שורות נשארו): 14/14 - דחיית evidence/capture/task מפרויקט אחר, חסימת שינוי org/project/קישורים/סוג יוצר, והכנסות תקינות מתקבלות; role `authenticated` ללא הקשר משתמש לא רואה שורות ו-RLS מתקמפל.

לא נבדק מול DB: מדיניות RLS של עובד/קבלן עם הרשאה פעילה ושל קבלן אחרי ביטול (נבדקה סטטית בלבד).
