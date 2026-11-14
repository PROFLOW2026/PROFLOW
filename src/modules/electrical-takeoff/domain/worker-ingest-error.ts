import { ZodError } from 'zod';

/** Safe, localized message shown on {@link AnalysisView.lastJob.error} — never a raw Zod dump. */
export const WORKER_INGEST_ERROR_MESSAGE = 'שגיאה בעיבוד תוצאות הניתוח. נסה להריץ שוב או פנה לתמיכה.';

export class WorkerIngestError extends Error {
  constructor(message: string, override readonly cause: unknown) {
    super(message);
    this.name = 'WorkerIngestError';
  }
}

export function isWorkerIngestError(err: unknown): err is WorkerIngestError {
  return err instanceof WorkerIngestError;
}

function isPgUniqueViolation(err: unknown): boolean {
  const cause = err && typeof err === 'object' && 'cause' in err ? (err as { cause?: unknown }).cause : err;
  if (!cause || typeof cause !== 'object') return false;
  const code = (cause as { code?: string }).code;
  return code === '23505';
}

export function formatWorkerIngestError(err: unknown): string {
  if (err instanceof ZodError) return WORKER_INGEST_ERROR_MESSAGE;
  if (isPgUniqueViolation(err)) return WORKER_INGEST_ERROR_MESSAGE;
  if (err instanceof WorkerIngestError) return err.message;
  return WORKER_INGEST_ERROR_MESSAGE;
}