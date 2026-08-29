import { ValidationError } from '@/shared/errors';
import { isExpenseVatMode } from '@/modules/expenses/domain/vat-mode';
import { stripFinalizeFlag } from '../domain/payload';
import type { DraftKind, StoredDraftPayload } from '../domain/types';
import { draftPayloadByKindSchema } from '../validation/schemas';

function coerceMoneyString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value.toFixed(2);
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/,/g, '');
    if (!trimmed) return null;
    return trimmed;
  }
  return null;
}

function normalizeLegacyPayload(kind: DraftKind, raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const record = { ...(raw as Record<string, unknown>) };

  if (kind === 'expense') {
    if (record.amount == null && record.totalAmount != null) {
      record.amount = record.totalAmount;
    }
    const amount = coerceMoneyString(record.amount);
    if (amount != null) record.amount = amount;
    if (typeof record.currency === 'string') {
      record.currency = record.currency.trim().toUpperCase().slice(0, 3);
    }
    if (record.vatMode != null && !isExpenseVatMode(record.vatMode)) {
      delete record.vatMode;
    }
  }

  if (kind === 'vendor_bill') {
    const total = coerceMoneyString(record.totalAmount ?? record.amount);
    if (total != null) record.totalAmount = total;
    if (typeof record.currency === 'string') {
      record.currency = record.currency.trim().toUpperCase().slice(0, 3);
    }
    if (!Array.isArray(record.lines) || record.lines.length === 0) {
      const amount = coerceMoneyString(record.totalAmount) ?? '0';
      const currency = typeof record.currency === 'string' ? record.currency : 'ILS';
      record.lines = [
        {
          description: typeof record.reference === 'string' ? record.reference : 'Line',
          quantity: '1',
          unitAmount: amount,
          lineTotal: amount,
          currency,
        },
      ];
    }
  }

  if (kind === 'billing_record') {
    const amount = coerceMoneyString(record.amount ?? record.totalAmount);
    if (amount != null) record.amount = amount;
    if (typeof record.currency === 'string') {
      record.currency = record.currency.trim().toUpperCase().slice(0, 3);
    }
  }

  return record;
}

export function parseStoredPayload(kind: DraftKind, raw: unknown): StoredDraftPayload {
  const stripped = stripFinalizeFlag(raw);
  const normalized = normalizeLegacyPayload(kind, stripped);
  const parsed = draftPayloadByKindSchema.safeParse({ kind, data: normalized });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return parsed.data as StoredDraftPayload;
}

/**
 * Best-effort parse for read paths (detail/history). Never throws for common legacy shapes.
 */
export function parseStoredPayloadLenient(kind: DraftKind, raw: unknown): StoredDraftPayload {
  try {
    return parseStoredPayload(kind, raw);
  } catch {
    const normalized = normalizeLegacyPayload(kind, stripFinalizeFlag(raw));
    if (kind === 'expense') {
      const data = normalized as Record<string, unknown>;
      return {
        kind: 'expense',
        data: {
          amount: coerceMoneyString(data.amount) ?? '0',
          currency:
            typeof data.currency === 'string' && data.currency.trim()
              ? data.currency.trim().toUpperCase().slice(0, 3)
              : 'ILS',
          description: typeof data.description === 'string' ? data.description : null,
          supplierName: typeof data.supplierName === 'string' ? data.supplierName : null,
          vendorId: typeof data.vendorId === 'string' ? data.vendorId : null,
          projectId: typeof data.projectId === 'string' ? data.projectId : null,
          costFamily:
            data.costFamily === 'direct_project' ||
            data.costFamily === 'shared' ||
            data.costFamily === 'business_overhead' ||
            data.costFamily === 'asset_capital'
              ? data.costFamily
              : null,
          costCategoryId: typeof data.costCategoryId === 'string' ? data.costCategoryId : null,
          notes: typeof data.notes === 'string' ? data.notes : null,
          paymentMethod: typeof data.paymentMethod === 'string' ? data.paymentMethod : null,
          vatMode: isExpenseVatMode(data.vatMode) ? data.vatMode : null,
        },
      };
    }
    throw new ValidationError([{ path: 'payload', message: 'Unsupported legacy payload' }]);
  }
}
