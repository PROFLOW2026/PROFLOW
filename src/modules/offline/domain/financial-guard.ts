import type { DraftKind } from './types';

/**
 * Offline drafts are candidates only. Financial documents that change issued
 * truth (finalize expense, billing, payment, AP) must not be queued as if posted.
 */
export const OFFLINE_FORBIDDEN_FINANCIAL_ACTIONS = [
  'expense_finalize',
  'billing',
  'payment',
  'ap',
] as const;

export type OfflineForbiddenFinancialAction =
  (typeof OFFLINE_FORBIDDEN_FINANCIAL_ACTIONS)[number];

export class OfflineFinancialGuardError extends Error {
  readonly action: OfflineForbiddenFinancialAction;

  constructor(action: OfflineForbiddenFinancialAction, message?: string) {
    super(message ?? `Offline ${action} is not allowed. Reconnect to finalize financial records.`);
    this.name = 'OfflineFinancialGuardError';
    this.action = action;
  }
}

function flagTrue(value: unknown): boolean {
  return value === true || value === 'true' || value === '1';
}

/**
 * True when a draft payload would try to finalize or issue a financial document.
 * Expense *create* drafts remain allowed; finalize/issue flags are not.
 */
export function isOfflineFinancialFinalization(
  kind: DraftKind,
  payload: Record<string, unknown> | null | undefined,
): boolean {
  if (kind === 'change_request') {
    const action = payload?.financialAction;
    return action === 'billing' || action === 'payment' || action === 'ap';
  }
  if (kind !== 'expense') return false;
  if (!payload) return false;
  return (
    flagTrue(payload.finalize) ||
    flagTrue(payload.finalizeExpense) ||
    payload.status === 'finalized' ||
    payload.action === 'finalize'
  );
}

export function assertOfflineDraftAllowed(
  kind: DraftKind,
  payload: Record<string, unknown> | null | undefined,
): void {
  if (!isOfflineFinancialFinalization(kind, payload)) return;
  const action =
    kind === 'expense' ? 'expense_finalize' : 'billing';
  throw new OfflineFinancialGuardError(action);
}
