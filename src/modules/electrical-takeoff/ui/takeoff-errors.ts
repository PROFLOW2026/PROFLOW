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

export function takeoffErrorCode(error: unknown): string | null {
  if (error && typeof error === 'object') {
    const o = error as { takeoffCode?: string; code?: string; message?: string };
    if (o.takeoffCode) return o.takeoffCode;
    if (o.code?.startsWith('takeoff.')) {
      const tail = o.code.split('.').pop();
      if (tail) return tail;
    }
    if (typeof o.message === 'string') {
      const m = o.message;
      if (m.includes('takeoff.errors.')) {
        const match = /takeoff\.errors\.([a-z_]+)/.exec(m);
        if (match?.[1]) return match[1];
      }
    }
  }
  if (error instanceof Error) {
    if (error.message === 'approval_blocked_plan_review') return 'approval_blocked_plan_review';
    if (error.message === 'needs_review_remaining' || error.message === 'approval_blocked_review') {
      return 'approval_blocked_review';
    }
    if (error.message.includes('takeoff.errors.approval_blocked_review')) return 'approval_blocked_review';
    if (error.message.includes('אי אפשר לאשר כתב כמויות')) return 'approval_blocked_review';
    if (error.message.includes('שם האביזר כבר קיים')) return 'catalog_duplicate';
  }
  return null;
}