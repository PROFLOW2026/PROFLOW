import { ConflictError, DomainRuleError, NotFoundError, ServiceUnavailableError, AuthorizationError } from '@/shared/errors';
import type { TakeoffErrorCode } from './contracts';

export const TAKEOFF_MESSAGES_HE: Record<TakeoffErrorCode, string> = {
  revision_conflict: 'הניתוח עודכן על ידי משתמש אחר. רענן ונסה שוב.',
  analysis_locked_approved: 'הניתוח אושר ואינו ניתן לעריכה. פתח מחדש כדי להמשיך.',
  file_type_unsupported: 'סוג הקובץ אינו נתמך. העלה PDF, DWG או DXF בלבד.',
  file_too_large: 'הקובץ גדול מדי לניתוח.',
  worker_unavailable: 'שירות הניתוח אינו זמין כרגע. פנה למנהל המערכת.',
  job_failed: 'הניתוח נכשל. התוצאות הקודמות והעריכות נשמרו.',
  forbidden: 'אין הרשאה לפעולה זו.',
  not_found: 'הפריט לא נמצא.',
  approval_blocked_review:
    'אי אפשר לאשר כתב כמויות כל עוד יש פריטים ללא סוג או פריטים שדורשים אישור.',
  approval_blocked_plan_review:
    'אי אפשר לאשר כתב כמויות לפני אישור שבדקתם גם אביזרים שלא זוהו אוטומטית.',
  catalog_duplicate: 'שם האביזר כבר קיים בארגון. בחרו שם אחר.',
  catalog_invalid: 'לא ניתן לשמור את סוג האביזר.',
  catalog_type_archived: 'סוג האביזר בארכיון. שחזרו אותו לפני שמירה לספרייה.',
};

export class TakeoffError extends DomainRuleError {
  readonly takeoffCode: TakeoffErrorCode;

  constructor(takeoffCode: TakeoffErrorCode, detail?: string) {
    super(detail ?? TAKEOFF_MESSAGES_HE[takeoffCode], `takeoff.errors.${takeoffCode}`);
    this.takeoffCode = takeoffCode;
    this.name = 'TakeoffError';
  }
}

export function takeoffNotFound(): never {
  throw new TakeoffError('not_found');
}

export function takeoffForbidden(): never {
  throw new TakeoffError('forbidden');
}

export function takeoffRevisionConflict(): never {
  throw new TakeoffError('revision_conflict');
}

export function takeoffApprovedLocked(): never {
  throw new TakeoffError('analysis_locked_approved');
}

export function takeoffWorkerUnavailable(): never {
  throw new ServiceUnavailableError(TAKEOFF_MESSAGES_HE.worker_unavailable, 'takeoff.errors.worker_unavailable');
}

export function mapTakeoffCaught(error: unknown): never {
  if (error instanceof TakeoffError) throw error;
  if (error instanceof ConflictError) throw new TakeoffError('revision_conflict');
  if (error instanceof NotFoundError) throw new TakeoffError('not_found');
  if (error instanceof AuthorizationError) throw new TakeoffError('forbidden');
  if (error instanceof ServiceUnavailableError) throw error;
  throw error;
}

/** Returned from catalog server actions so Next.js does not digest a thrown TakeoffError into React #441. */
export type CatalogActionFailure = {
  readonly ok: false;
  readonly code: TakeoffErrorCode;
  readonly message: string;
};

export function catalogActionFailure(error: TakeoffError): CatalogActionFailure {
  return { ok: false, code: error.takeoffCode, message: error.message };
}

export function isCatalogActionFailure(value: unknown): value is CatalogActionFailure {
  if (!value || typeof value !== 'object') return false;
  const row = value as { ok?: unknown; code?: unknown; message?: unknown };
  return row.ok === false && typeof row.code === 'string' && typeof row.message === 'string';
}