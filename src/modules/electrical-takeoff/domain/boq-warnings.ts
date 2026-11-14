/** Hebrew warning strings for BOQ completeness / export (pure constants). */

export const BOQ_WARNING_DRAFT = 'טיוטה — הכמויות אינן מאומתות עד לאישור המשתמש.';

export const BOQ_WARNING_SCALE_UNVERIFIED = 'קנה מידה לא אומת — אורכים במטרים לא נכללו בכתב הכמויות.';

export const BOQ_WARNING_PARTIAL_SHEET = (name: string) => `גיליון ${name} נותח חלקית בלבד.`;

export const BOQ_WARNING_SKIPPED_SHEET = (name: string) => `גיליון ${name} דולג בניתוח.`;

export const BOQ_WARNING_XREF_MISSING = (name: string) => `חסר קובץ ייחוס (xref): ${name}.`;

export const BOQ_WARNING_UNCLASSIFIED = 'קיימים זיהויים ללא סיווג — שורות ללא מפתח סוג אינן מתומחרות אוטומטית.';

export const BOQ_WARNING_NEEDS_REVIEW = 'קיימים פריטים הדורשים בדיקה לפני אימות סופי.';

export const BOQ_WARNING_PDF_ONLY_NOT_COUNTED = (n: number) =>
  `${n} זיהויי PDF לא נספרו (pdf_only) — יש לבדוק ולאשר כדי לכלול בכמויות.`;

export const BOQ_WARNING_PDF_DWG_UNPAIRED = (n: number) =>
  `${n} סמלי PDF מגיליון תוכנית לא שויכו ל-DWG (pdf_only) — צמד את הקבצים לפני ניתוח או אשר ידנית; כמויות הטיוטה מבוססות DWG בלבד.`;

export const BOQ_XLSX_DRAFT_BANNER = 'טיוטה — לא מאומת';