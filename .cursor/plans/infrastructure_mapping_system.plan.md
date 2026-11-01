---
name: מערכת מיפוי ותיעוד תשתיות (EXLFY) - מערכת מלאה
overview: מערכת מלאה לתיעוד ואיתור תשתיות בפרויקט - מיקומים חופשיים ותיקיות אמיתיות בענן הארגון, צילום רציף עם אישור לפני העלאה, עריכה מאוחרת עם שמירת המקור וגרסה מסומנת, גלריה וחיפוש, שני מצבי איתור (Live ושתי תמונות) ושמירת תוצאה רק לפי בחירה, חיבור למשימות הקיימות, ותמיכה באפליקציה הראשית, אפליקציית העובדים וממשק הקבלן. הקוד מפותח מקומית. מיגרציה 0195 מוכנה ואינה מורצת - ממתינה לאישור SQL נפרד של הבעלים. אין push / merge / deploy.
todos:
  - id: inspect
    content: "בדיקת המבנה הקיים: evidence, external-storage, project_locations, הרשאות, אפליקציות עובדים וקבלנים"
    status: completed
  - id: migration-prepared
    content: "מיגרציה 0195_infra_mapping.sql (5 טבלאות, אינדקסים, יחסים, RLS, טריגרים) + schema Drizzle + allowlist off-journal - מוכנה, לא מורצת"
    status: completed
  - id: domain
    content: "דומיין: סוגים, ולידציה, מסנני גלריה, תור העלאה (אין העלאה בלי אישור), סימונים, רשומת יישור"
    status: completed
  - id: folders
    content: "תיקיות בענן: עץ מיקומים = עץ תיקיות, יצירה מרוכזת, קישור תיקייה קיימת, שינוי שם/העברה בלי לשבור קישורים"
    status: completed
  - id: server-usecases
    content: "שרת: begin capture (פנימי וקבלן), רשימה/חיפוש/סינון, עדכון מאוחר, גרסאות סימון, מחיקה רכה, קישור לענן, שמירת השוואה"
    status: completed
  - id: capture-ui
    content: "UI צילום: מצלמה/מערכת/גלריית טלפון/אחסון מחובר, תצוגה מקדימה, אישור/צילום מחדש/ביטול, תור ושחזור כשלים, צילום רציף"
    status: completed
  - id: gallery-ui
    content: "UI גלריה: ממוזערות, חיפוש, סינון, פתיחה ועריכה, מי ומתי, בחירה לאיתור"
    status: completed
  - id: marking-editor
    content: "עורך סימונים: נקודה/חץ/קו/מלבן/אליפסה/יד חופשית/טקסט, מקור מקורי + גרסה מסומנת"
    status: completed
  - id: locate-integration
    content: "חיבור שני מצבי האיתור (Live לא שונה) + שמירת תוצאה ביוזמת המשתמש בלבד + פתיחה מחדש"
    status: completed
  - id: surfaces
    content: "שלוש הממשקים: ראשי, עובדים, קבלן + כניסה ממשימה קיימת"
    status: completed
  - id: local-tests
    content: "בדיקות מקומיות: דומיין, תיקיות, use-cases עם mock, התאמת SQL לסכמה (סטטי), harness דפדפן (נייד, שני מצבי איתור, הרשאות)"
    status: completed
  - id: owner-sql-approval
    content: "ממתין: אישור SQL נפרד של הבעלים להרצת 0195 (קודם על בסיס נתונים מבודד / staging)"
    status: pending
  - id: db-verification
    content: "אחרי אישור SQL: אימות מול DB אמיתי - RLS, בידוד ארגונים, שמירת קישורי תמונה-תיקייה, מסלולי עובד/קבלן מקצה לקצה"
    status: pending
  - id: owner-release-decision
    content: "ממתין: החלטה נפרדת של הבעלים על push / deploy"
    status: pending
isProject: true
---

# מערכת מיפוי ותיעוד תשתיות - מערכת מלאה

## עקרונות
- קבצים רק באחסון הענן של הארגון (evidence + external-storage הקיימים). DB מחזיק מטא-דאטה לניהול/חיפוש/הרשאות והפניות לקבצים בלבד.
- אין JSON בשדה `caption`; כל שדה הוא עמודה אמיתית.
- מיקום = שדה חובה יחיד. תמונה שלא אושרה לא עולה לענן.
- מצב Live הקיים לא שונה. ההרחבה היא תוספתית (`InfraTrialIntegration`).
- אין הרצת SQL בשום מסד נתונים ללא אישור נפרד. אין push / merge / deploy.

## מבנה
- דומיין/אפליקציה/נתונים/UI: `src/modules/infra-mapping/`
- סכמה ומיגרציה: `drizzle/schema/infra-mapping.ts`, `drizzle/migrations/0195_infra_mapping.sql`
- נקודות כניסה: לשונית `infra` בפרויקט, `/employee/projects/[id]/infrastructure`, `/contractor/projects/[id]/infrastructure`, קישור "תיעוד תשתיות למשימה" בדפי משימה.

## סטטוס
פיתוח הושלם מקומית. ראו `docs/audits/infra-mapping-sql-0195.md` למיגרציה המוכנה ולמה שממתין לאימות DB.
