export class TakeoffRevisionConflictError extends Error {
  readonly code = 'revision_conflict' as const;
  constructor() {
    super('revision_conflict');
    this.name = 'TakeoffRevisionConflictError';
  }
}

export function isRevisionConflictError(error: unknown): boolean {
  if (error instanceof TakeoffRevisionConflictError) return true;
  if (error && typeof error === 'object') {
    const code = (error as { takeoffCode?: string; code?: string }).takeoffCode ?? (error as { code?: string }).code;
    if (code === 'revision_conflict') return true;
  }
  if (error instanceof Error) {
    if (error.message === 'revision_conflict') return true;
    if (error.message.includes('takeoff.errors.revision_conflict')) return true;
    if (error.message.includes('הניתוח עודכן')) return true;
  }
  return false;
}