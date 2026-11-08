# אימות SQL מקומי — 0197, 0198, 0199

תאריך: 8 בנובמבר 2026
ענף: `remediation/audit-2026-11`
מסד: PostgreSQL 16 מקומי ומבודד, `127.0.0.1:56012`, בסיס `remed`, קונטיינר `exlfy-remed-schema-0199`.

לא הורץ SQL על Production. אין Push ואין Deploy.

## אישור

שלוש המיגרציות `0197`, `0198` ו־`0199` מוכנות להרצה ב־Production.

הן הורצו לפי הסדר אחרי הסכמה המלאה `0000` עד `0196` והסתיימו בהצלחה. לא נדרש תיקון לקבצי ה־SQL.

## מה אומת

- הפונקציות קיימות: `app.is_organization_owner`, `app.mark_linked_opportunity_won`, `app.external_principal_display_name`, `app.consume_auth_rate_limit`.
- `app.closed_period_rewrite_guard` כולל את חריגת הבעלים `app.is_organization_owner`.
- 16 טריגרים של חודש סגור, מחזור חיי תשלום וחסינות כלכלית פעילים.
- מדיניות `duplicate_warning_acknowledgements_ack` חלה רק על שורה ממתינה בלי מאשר, ואישור נשמר רק כאשר `approver_user_id = app.current_user_id()`.
- הטבלאות החדשות `duplicate_warning_acknowledgements` ו־`auth_rate_limits` נוצרו ריקות.

## נתונים

לפני `0197` נשמרה שורת ארגון מסומנת. אחרי שלוש המיגרציות השורה נשארה `remediation-marker`, וספירת השורות בכל טבלה שהייתה קיימת לא השתנתה מעבר לשורת הסימון. אין בקבצים פקודת `UPDATE`, `DELETE`, `TRUNCATE` או `INSERT` מחוץ לגוף פונקציה.

## סביבה מקומית

PostgreSQL הרשמי אינו כולל את סכמת `auth` של Supabase. לפני הסכמה נוצרה פונקציית `auth.uid` מקומית, כי מיגרציה `0120` שכבר הוחלה ב־Production מפנה אליה. קבצי המיגרציות ההיסטוריות לא שונו. הקונטיינר נמחק בסוף הבדיקה.
