# מיפוי תשתיות - מיגרציה 0195 (מוכנה, לא הורצה)

```
SQL / MIGRATION PREPARED = YES
FILE = drizzle/migrations/0195_infra_mapping.sql
PURPOSE = 5 טבלאות חדשות למיפוי תשתיות: infra_folder_mappings (מיקום <-> תיקייה בענן),
          infra_captures (מטא-דאטה של תמונה: מיקום, חדר, קיר, סוג, תיאור, יוצר, משימה),
          infra_capture_versions + infra_markings (גרסאות סימון, מקור נשאר ללא שינוי),
          infra_comparisons (שמירת תוצאת איתור ביוזמת המשתמש)
DATA MUTATION = NONE (לא נקראים, לא נעים ולא נכתבים נתונים קיימים; אין INSERT/UPDATE/DELETE על טבלאות קיימות)
SCHEMA MUTATION = ADDITIVE ONLY: 5 CREATE TABLE IF NOT EXISTS, אינדקסים ייחודיים ורגילים, מפתחות זרים מורכבים,
                  RLS מופעל + FORCE על כל חמש הטבלאות, מדיניות select/insert/update/service, 2 פונקציות טריגר
                  (app.infra_block_update, app.infra_captures_guard) ו-3 טריגרים על הטבלאות החדשות בלבד.
                  אין ALTER על טבלה קיימת.
RISK = LOW-MEDIUM (ראו להלן)
READY FOR OWNER REVIEW = YES
```

הקובץ אינו ב-`_journal.json` (רשימת `PENDING_OFF_JOURNAL` ב-`drizzle/scripts/check-migration-journal.mjs`), כדי שלא יורץ אוטומטית ב-CI / בפריסה. `node drizzle/scripts/check-migration-journal.mjs` עובר (journal parity ok, pendingOffJournal: 1). **שום SQL לא הורץ בשום מסד נתונים.**

## מה נעשה שימוש חוזר (ללא כפל)
- `project_locations` - היררכיית המיקומים.
- `evidence_items` (+ documents / storage_files) - שורת האינדקס של הקובץ. הקובץ עצמו נשמר רק בענן הארגון.
- `tasks` - קישור אופציונלי; אין מערכת משימות חדשה.
- `organization_storage_connections` - החיבור לענן.

## השפעה
- טבלאות חדשות בלבד. אין שינוי בקוד או בטבלאות קיימות ללא המיגרציה; הקוד מזהה סכמה חסרה (`isMissingInfraSchema`) ומציג "ממתין להפעלת מסד נתונים" במקום להיכשל.
- מפתחות זרים מורכבים מפנים לאינדקסים ייחודיים שכבר קיימים במיגרציות קודמות (נבדק סטטית בבדיקת `sql-schema-parity`): `project_locations(id, organization_id, project_id)`, `projects`, `evidence_items`, `tasks`, `vendors`, `organization_storage_connections` - כולם `(id, organization_id)`.
- מחיקה: `infra_captures.evidence_id` -> `ON DELETE CASCADE`. מחיקה רכה מבוצעת ב-`removed_at` (טריגר מונע ביטול מחיקה).
- טבלאות append-only (`infra_capture_versions`, `infra_markings`) חוסמות UPDATE.

## סיכוני תאימות / נקודות לבדיקת הבעלים
1. **סדר/מספור**: 0195 מניח שהמיגרציה האחרונה ביומן היא 0194. אם נוספה מיגרציה אחרת בינתיים - יש להתאים מספר (לא לשנות מיגרציה שהורצה).
2. **פונקציות RLS בשימוש** (חייבות להיות קיימות ב-DB): `app.current_user_id`, `app.is_org_member`, `app.has_project_capability`, `app.external_principal_id`, `app.external_has_scope`, `app.docs_external_capability`. כולן קיימות במיגרציות קודמות, אך מומלץ לוודא מול ה-DB היעד לפני ההרצה.
3. **RLS + FORCE** - נתיבי הקוד פועלים תחת הקשר הארגון/קבלן הקיים. הנתיבים הללו לא נבדקו מול RLS אמיתי (ראו "לא נבדק").
4. **שורות evidence קיימות** - אינן משתנות. תמונות שתועדו לפני המיגרציה (לא קיימות עבור הפיצ'ר החדש) לא יופיעו בגלריה.
5. **המלצה**: להריץ קודם על DB בידוד / staging, ורק אחר כך על Production, עם גיבוי.

## מה לא ניתן לאמת בלי הרצת SQL (ממתינים לאימות DB)
- שאילתות ה-repository (`infra.repository.ts`) מול טבלאות אמיתיות (רק התאמת עמודות סטטית בין SQL לסכמת Drizzle).
- מדיניות RLS בפועל: בידוד ארגונים, גישת עובד/קבלן, חסימת UPDATE בטריגרים.
- אידמפוטנטיות ב-`client_capture_id` / `client_comparison_id` מול אינדקס ייחודי אמיתי.
- מסלולי עובד וקבלן מקצה לקצה (אישור -> העלאה -> גלריה).
- שמירה ופתיחה מחדש של השוואה (sidecar) מול אחסון אמיתי.
- שמירת קישורי תמונה-תיקייה בשינוי שם/העברה מול provider אמיתי (נבדק מול provider מדומה בלבד).

## מה נבדק מקומית (ללא DB)
| בדיקה | תוצאה |
|---|---|
| `tests/unit/infra-mapping` (domain 35, folders 13, use-cases 26, sql-schema-parity 10) | 84/84 עוברות |
| תור העלאה: אין העלאה לפני אישור, מיקום בלבד חובה, ביטול, ניסיון חוזר | עובר |
| תיקיות: יצירה מרוכזת, אידמפוטנטיות, שינוי שם/העברה שומרים מזהה תיקייה, קישור קיים, כשל וניסיון חוזר | עובר (provider מדומה) |
| use-cases עם repo מדומה: עובד/קבלן, בידוד ארגון, מיקום בארכיון, עריכה מאוחרת, גרסאות סימון, אין קישור ענן לקבלן | עובר (mock - לא בדיקת DB) |
| התאמת עמודות SQL <-> Drizzle, RLS מופעל לכל טבלה, מיגרציה תוספתית בלבד, אין caption | עובר (סטטי) |
| Harness דפדפן (Playwright, פעולות שרת מדומות): 37 בדיקות - צילום, אישור, ביטול, כשל+ניסיון חוזר, גלריה (חיפוש/סינון), עריכה, בחירה לאיתור, 390px ו-360px ללא גלילה אופקית, עובד/קבלן ללא לשונית מיקומים וללא אחסון, קבלן צפייה בלבד | 37/37 עוברות |
| איתור: harness קיים - Live (נקודת ייחוס, יישור, ללא גלילה) ושתי תמונות | עובר, ללא שינוי בהתנהגות Live |
| `tsc --noEmit`, eslint ממוקד, בדיקות contractor-portal / connected-projects / i18n / employee-app / project-workspace | נקי / עובר |

תוקן בעקבות הבדיקות: עדכון חלקי של פרטי תמונה היה מאפס שדות שלא נשלחו (`.partial()` על סכמה עם transform) - כעת PATCH אמיתי; בחירת מיקום אחרי הצילום מעדכנת גם תמונות שממתינות לאישור.
