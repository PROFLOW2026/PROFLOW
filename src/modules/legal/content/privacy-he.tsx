/**
 * Hebrew Privacy Policy (launch v1). Support-managed erasure — no self-service delete UI.
 */
export function PrivacyHebrewContent() {
  return (
    <>
      <p className="mb-4 text-sm text-[var(--pf-text-secondary)]">
        עודכן: 3 באוקטובר 2026 · גרסת השקה ראשונה
      </p>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">1. מי אנחנו</h2>
        <p>
          ProjectFlow מעבדת מידע עבור לקוחות עסקיים (ארגונים) ומשתמשיהם. מדיניות זו מתארת כיצד
          המערכת מטפלת במידע במסגרת השירות כפי שהוא מיושם היום.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">2. קטגוריות מידע</h2>
        <ul className="list-disc space-y-2 pe-5">
          <li>
            <strong>חשבון והתחברות:</strong> דוא&quot;ל, שם, העדפות שפה, מזהי Supabase Auth,
            ארגונים וחברויות.
          </li>
          <li>
            <strong>נתוני עסק:</strong> לקוחות, הזדמנויות, הצעות מחיר, פרויקטים, חוזים, שינויים,
            חשבוניות פנימיות, תשלומים, הוצאות, רכש, דוחות.
          </li>
          <li>
            <strong>כוח אדם:</strong> עובדים, נוכחות, שעות, הרשאות אפליקציית עובד, PIN (לא
            נשמר בטקסט גלוי — מנגנון Auth).
          </li>
          <li>
            <strong>מסמכים וקבצים:</strong> מטא-דאטה במערכת; תוכן קבצים באחסון חיצוני שאתם
            מחברים (OneDrive, Google Drive, Dropbox, Box) או בנתיבים מוגדרים אחרים.
          </li>
          <li>
            <strong>אינטגרציות:</strong> credentials מוצפנים ל-SUMIT, OCR, דיוור (Resend) וכדומה
            כאשר מופעלים.
          </li>
          <li>
            <strong>טכני:</strong> יומני שרת (ללא סיסמאות/טוקנים מלאים במודע), cookies הכרחיים
            לסשן ושפה.
          </li>
        </ul>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">3. מטרות עיבוד</h2>
        <p>
          מתן השירות, אבטחה, בידוד בין ארגונים, תמיכה, גיבוי תשתיתי (Supabase/Vercel), עיבוד
          רקע (cron/workers), ושיפור יציבות. אין שימוש ב-cookies פרסומיים של צד שלישי במוצר
          כפי שמיושם כיום.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">4. שיתוף וספקים</h2>
        <p>
          מידע עשוי להיות מעובד אצל Supabase (מסד נתונים ו-Auth), Vercel (אירוח), Resend (דוא&quot;ל
          כאשר מוגדר), ספקי אחסון שבחרתם, SUMIT (חשבוניות מס כאשר מחובר), ו-OCR (כאשר מופעל).
          נתוני &quot;שוק חומרים&quot; כוללים אגרגטים אנונימיים ממחירי ספקים (ללא שמות ספק/ארגון
          בחישוב המוצג).
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">5. אבטחה</h2>
        <p>
          Row Level Security, הרשאות ארגון, הצפנת credentials, workers מאומתים, והפרדת תפקידים
          בין משתמש ל-admin DB. אין אבטחה מוחלטת; דווחו על חשד לincident דרך ערוץ התמיכה.
        </p>
      </section>

      <section className="mb-6 space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">6. שמירה ומחיקה</h2>
        <p>
          נתונים נשמרים כל עוד החשבון/הארגון פעילים ולפי צרכים תפעוליים, גיבוי תשתית, וחובות
          שמירה חוקיות (למשל רישומים פיננסיים). <strong>אין מחיקה עצמית (self-service)</strong>{' '}
          בממשק בגרסה זו.
        </p>
        <p>
          <strong>בקשת מחיקה/מימוש זכויות:</strong> פנו דרך ערוץ התמיכה שסופק לכם עם הצטרפות
          לשירות, או דרך מנהל/ת הארגון. נאמת זהות וסמכות, נגדיר scope (משתמש / ארגון), ונבצע
          מחיקה/סגירה במידת האפשר תוך שמירה על רישומים שנדרשים בדין או לצורך ספקים חיצוניים
          (למשל מסמך מס שהונפק ב-SUMIT). אישור בסיום התהליך.
        </p>
      </section>

      <section className="space-y-3 text-sm leading-relaxed">
        <h2 className="text-lg font-semibold">7. יצירת קשר</h2>
        <p>
          לשאלות פרטיות ומחיקה: אותו ערוץ תמיכה כמפורט בסעיף 6. פרטי מפעיל/ DPO יפורסמו בחוזה
          או onboarding כאשר יוגדרו.
        </p>
      </section>
    </>
  );
}
