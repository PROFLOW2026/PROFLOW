import { createHash } from 'node:crypto';
import { normalizeSupplierReference } from '@/modules/expenses/domain/supplier-cost-guidance';

export const DUPLICATE_WARNING_TYPES = [
  'expense_ap_overlap',
  'duplicate_vendor_reference',
] as const;

export type DuplicateWarningType = (typeof DUPLICATE_WARNING_TYPES)[number];

export type DuplicateWarningStatus = 'pending' | 'acknowledged';

/** Material fields. A change to any of them produces a new snapshot hash. */
export interface DuplicateWarningSnapshot {
  readonly amount: string | null;
  readonly vendorId: string | null;
  readonly reference: string | null;
  readonly projectId: string | null;
  readonly date: string | null;
}

export interface StoredDuplicateWarning {
  readonly id: string;
  readonly warningType: DuplicateWarningType;
  readonly snapshotHash: string;
  readonly status: DuplicateWarningStatus;
}

export interface PendingDuplicateWarning {
  readonly outcome: 'pending_duplicate_warning';
  readonly pendingDuplicateWarning: true;
  readonly recordId: string;
  readonly caseKey: string;
  readonly snapshotHash: string;
  readonly warnings: readonly {
    readonly warningType: DuplicateWarningType;
    readonly acknowledgementId: string;
    readonly status: 'pending';
  }[];
}

function emptyToNull(value: string | null | undefined): string | null {
  const text = value?.trim() ?? '';
  return text.length > 0 ? text : null;
}

/** Stable amount text so 100 and 100.00 share a hash, while 100.01 does not. */
export function canonicalDuplicateWarningAmount(value: string | null | undefined): string | null {
  const text = emptyToNull(value);
  if (!text || !/^-?\d+(\.\d+)?$/.test(text)) return text;
  const negative = text.startsWith('-');
  const unsigned = negative ? text.slice(1) : text;
  const [wholeRaw, fracRaw = ''] = unsigned.split('.');
  const whole = (wholeRaw ?? '').replace(/^0+(?=\d)/, '') || '0';
  const frac = fracRaw.replace(/0+$/, '');
  const canonical = frac ? `${whole}.${frac}` : whole;
  return negative && canonical !== '0' ? `-${canonical}` : canonical;
}

export function normalizeDuplicateWarningSnapshot(
  snapshot: DuplicateWarningSnapshot,
): DuplicateWarningSnapshot {
  const reference = normalizeSupplierReference(snapshot.reference);
  const date = emptyToNull(snapshot.date);
  return {
    amount: canonicalDuplicateWarningAmount(snapshot.amount),
    vendorId: emptyToNull(snapshot.vendorId),
    reference: reference.length > 0 ? reference : null,
    projectId: emptyToNull(snapshot.projectId),
    date: date ? date.slice(0, 10) : null,
  };
}

export function duplicateWarningSnapshotHash(snapshot: DuplicateWarningSnapshot): string {
  const normalized = normalizeDuplicateWarningSnapshot(snapshot);
  return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export function duplicateWarningCaseKey(kind: 'expense' | 'ap_bill', recordId: string): string {
  return `${kind}:${recordId}`;
}

export function isDuplicateWarningType(value: string): value is DuplicateWarningType {
  return (DUPLICATE_WARNING_TYPES as readonly string[]).includes(value);
}

/**
 * One acknowledgement clears only its own warning type and snapshot hash.
 * Any other type, or the same type after a material-field change, stays pending.
 */
export function resolveDuplicateWarningStatuses(input: {
  readonly warningTypes: readonly DuplicateWarningType[];
  readonly snapshotHash: string;
  readonly stored: readonly StoredDuplicateWarning[];
}): readonly { readonly warningType: DuplicateWarningType; readonly status: DuplicateWarningStatus }[] {
  const seen = new Set<DuplicateWarningType>();
  const statuses: { warningType: DuplicateWarningType; status: DuplicateWarningStatus }[] = [];
  for (const warningType of input.warningTypes) {
    if (seen.has(warningType)) continue;
    seen.add(warningType);
    const acknowledged = input.stored.some(
      (row) =>
        row.warningType === warningType &&
        row.snapshotHash === input.snapshotHash &&
        row.status === 'acknowledged',
    );
    statuses.push({
      warningType,
      status: acknowledged ? 'acknowledged' : 'pending',
    });
  }
  return statuses;
}

export function isPendingDuplicateWarning(value: unknown): value is PendingDuplicateWarning {
  if (!value || typeof value !== 'object') return false;
  const record = value as { outcome?: unknown; pendingDuplicateWarning?: unknown };
  return record.outcome === 'pending_duplicate_warning' && record.pendingDuplicateWarning === true;
}

export function readPendingDuplicateWarning(value: unknown): PendingDuplicateWarning | null {
  if (isPendingDuplicateWarning(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const nested = (value as { pendingDuplicateWarning?: unknown }).pendingDuplicateWarning;
  return isPendingDuplicateWarning(nested) ? nested : null;
}