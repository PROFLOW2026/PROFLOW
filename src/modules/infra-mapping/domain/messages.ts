/**
 * User-facing (Hebrew) messages for infrastructure mapping errors. Keyed by the AppError messageKey
 * thrown by the use-cases, so the screens can show something precise instead of a generic failure.
 */
export const INFRA_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  'infraMapping.errors.locationArchived': 'המיקום הזה בארכיון. בחרו מיקום פעיל.',
  'infraMapping.errors.captureRemoved': 'התמונה הזו הוסרה.',
  'infraMapping.errors.photoNotUploaded': 'התמונה עדיין לא הועלתה לענן. נסו שוב בעוד רגע.',
  'infraMapping.errors.uploadIncomplete': 'לא כל הקבצים הועלו לענן. נסו שוב.',
  'infraMapping.errors.comparisonRemoved': 'תוצאת האיתור הזו הוסרה.',
  'infraMapping.errors.folderInUse': 'התיקייה הזו כבר משמשת מיקום אחר.',
  'infraMapping.errors.projectFolder': 'תיקיית הפרויקט בענן עדיין לא מוכנה. נסו שוב בעוד רגע.',
  'infraMapping.errors.videoType': 'סוג הסרטון אינו נתמך. בחרו סרטון MP4, MOV, WEBM או 3GP.',
  'infraMapping.errors.videoEmpty': 'הסרטון ריק.',
  'infraMapping.errors.videoTooLarge': 'הסרטון גדול מדי (עד 120MB). צלמו שוב או בחרו סרטון קצר יותר.',
  'infraMapping.errors.videoTooLong': 'הסרטון ארוך מ-30 שניות. בחרו סרטון קצר יותר.',
  'infraMapping.errors.videoDuration': 'לא ניתן לקרוא את הסרטון. בחרו סרטון אחר או צלמו מחדש.',
  'infraMapping.errors.videoNoMarks': 'סימונים זמינים לתמונות בלבד. אפשר להשתמש בתמונה מתוך הסרטון לאיתור.',
  'infraMapping.errors.videoChunk': 'חלק מהסרטון לא התקבל כראוי. נסו שוב.',
  'infraMapping.errors.videoSession': 'חיבור ההעלאה פג. נסו שוב - ההעלאה תתחיל מחדש.',
  'infraMapping.errors.videoProviderLimit':
    'אחסון הענן המחובר מקבל כרגע סרטונים עד 4MB בלבד. צלמו סרטון קצר יותר או חברו OneDrive, Google Drive או Dropbox.',
  'externalStorage.errors.notConnected': 'אחסון הענן של הארגון לא מחובר. יש לחבר אחסון בהגדרות.',
  'externalStorage.errors.fileUnavailable': 'הקובץ לא זמין כרגע בענן.',
  'projectPlans.evidence.errors.fileType': 'סוג הקובץ אינו נתמך. בחרו תמונה (JPG, PNG, WEBP, HEIC).',
  'projectPlans.evidence.errors.empty': 'הקובץ ריק.',
  'projectPlans.evidence.errors.tooLarge': 'התמונה גדולה מדי (עד 25MB).',
  'projectPlans.evidence.errors.contentMismatch': 'תוכן הקובץ אינו תמונה תקינה.',
};

/** Adding a location needs the organization's cloud: the folder is created together with it. */
export const INFRA_LOCATION_NEEDS_CLOUD = 'אי אפשר להוסיף מיקום בלי חיבור לענן הארגון. יש לחבר אחסון בהגדרות ולנסות שוב.';
export const INFRA_LOCATION_FOLDER_FAILED = 'התיקייה בענן לא נוצרה, ולכן המיקום לא נוסף. נסו שוב.';

export const INFRA_DB_PENDING_MESSAGE = 'ממתין להפעלת מסד נתונים: מיפוי התשתיות עדיין לא הופעל בסביבה זו.';
export const INFRA_GENERIC_ERROR = 'הפעולה נכשלה. נסו שוב.';
export const INFRA_FORBIDDEN = 'אין לך הרשאה לפעולה הזו.';
export const INFRA_NOT_FOUND = 'הפריט לא נמצא.';

const MISSING_RELATION_PATTERN = /relation ["']?(?:public\.)?infra_[a-z_]+["']? does not exist/i;

/** True when a Postgres error says the (not yet applied) 0195 tables are missing. */
export function isMissingInfraSchema(error: unknown): boolean {
  const seen = new Set<unknown>();
  let cursor: unknown = error;
  for (let depth = 0; depth < 6 && cursor && typeof cursor === 'object' && !seen.has(cursor); depth += 1) {
    seen.add(cursor);
    const item = cursor as { code?: unknown; message?: unknown; cause?: unknown };
    const message = typeof item.message === 'string' ? item.message : '';
    if (MISSING_RELATION_PATTERN.test(message)) return true;
    if (item.code === '42P01' && /infra_/i.test(message)) return true;
    cursor = item.cause;
  }
  return false;
}
