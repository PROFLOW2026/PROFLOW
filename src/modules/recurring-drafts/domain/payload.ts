/**
 * Payload shaping for recurring financial DRAFT templates.
 *
 * HARD RULE: stored payloads never carry `finalize: true`. Generation always
 * creates draft entities first. Optional `auto_finalize_expense` on the template
 * may finalize an expense afterward when the month is open (application layer).
 * Vendor bills and billing records are never auto-posted.
 */

import { addDays, businessDate, type BusinessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import type { CreateBillingRecordInput } from '@/modules/billing/validation/schemas';
import type { CreateExpenseInput } from '@/modules/expenses/validation/schemas';
import type {
  BillingRecordDraftPayload,
  DraftKind,
  ExpenseDraftPayload,
  StoredDraftPayload,
  VendorBillDraftPayload,
} from './types';

export interface VendorBillDraftInsert {
  readonly vendorId: string;
  readonly projectId: string | null;
  readonly reference: string | null;
  readonly status: 'draft';
  readonly billDate: BusinessDate;
  readonly dueDate: BusinessDate | null;
  readonly currency: string;
  readonly totalAmount: string;
  readonly notes: string | null;
  readonly recognizedVendorActual: false;
  readonly lines: readonly {
    readonly description: string;
    readonly quantity: string;
    readonly unitAmount: string;
    readonly lineTotal: string;
    readonly currency: string;
    readonly purchaseOrderLineId: null;
  }[];
}

export interface BillingDraftCreateInput extends CreateBillingRecordInput {
  readonly finalize: false;
}

/** Removes any `finalize` flag so stored / generated payloads cannot auto-post. */
export function stripFinalizeFlag(payload: unknown): unknown {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  const { finalize: _ignored, ...rest } = payload as Record<string, unknown>;
  return rest;
}

export function assertNoFinalizeFlag(payload: unknown): void {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return;
  if ('finalize' in payload && (payload as { finalize?: unknown }).finalize === true) {
    throw new DomainRuleError(
      'Recurring templates cannot store auto-finalize',
      'recurringDrafts.errors.finalizeForbidden',
    );
  }
}

export function assertGeneratedEntityIsDraft(input: {
  readonly kind: DraftKind;
  readonly status: string;
}): void {
  if (input.status !== 'draft') {
    throw new DomainRuleError(
      'Recurring generation may only create draft records',
      'recurringDrafts.errors.mustRemainDraft',
      { kind: input.kind, status: input.status },
    );
  }
}

function dueDateFromOffset(runDate: BusinessDate, dueDays: number | null | undefined): BusinessDate | null {
  if (dueDays == null || !Number.isFinite(dueDays) || dueDays < 0) return null;
  return addDays(runDate, Math.trunc(dueDays));
}

export function expenseInputFromPayload(
  data: ExpenseDraftPayload,
  runDate: BusinessDate,
): CreateExpenseInput {
  return {
    amount: data.amount,
    currency: data.currency,
    description: data.description ?? null,
    expenseDate: runDate,
    supplierName: data.supplierName ?? null,
    vendorId: data.vendorId ?? null,
    projectId: data.projectId ?? null,
    costFamily: data.costFamily ?? null,
    notes: data.notes ?? null,
    paymentMethod: data.paymentMethod ?? null,
  };
}

/** Current template amount/currency from stored payload (fallback for versions). */
export function extractTemplateAmount(payload: StoredDraftPayload): {
  readonly amount: string;
  readonly currency: string;
} {
  switch (payload.kind) {
    case 'expense':
      return { amount: payload.data.amount, currency: payload.data.currency };
    case 'vendor_bill':
      return { amount: payload.data.totalAmount, currency: payload.data.currency };
    case 'billing_record':
      return {
        amount: payload.data.amount,
        currency: (payload.data.currency ?? 'ILS').toUpperCase(),
      };
  }
}

/** Apply a resolved amount onto a stored payload clone for one generation run. */
export function withResolvedAmount(
  payload: StoredDraftPayload,
  amount: string,
  currency: string,
): StoredDraftPayload {
  const ccy = currency.toUpperCase();
  switch (payload.kind) {
    case 'expense':
      return { kind: 'expense', data: { ...payload.data, amount, currency: ccy } };
    case 'vendor_bill':
      return {
        kind: 'vendor_bill',
        data: {
          ...payload.data,
          totalAmount: amount,
          currency: ccy,
          lines:
            payload.data.lines.length === 1
              ? [
                  {
                    ...payload.data.lines[0]!,
                    unitAmount: amount,
                    lineTotal: amount,
                    currency: ccy,
                  },
                ]
              : payload.data.lines,
        },
      };
    case 'billing_record':
      return {
        kind: 'billing_record',
        data: { ...payload.data, amount, currency: ccy },
      };
  }
}

export function vendorBillDraftInsertFromPayload(
  data: VendorBillDraftPayload,
  runDate: BusinessDate,
  templateTitle: string,
): VendorBillDraftInsert {
  const currency = data.currency.toUpperCase();
  const lines: VendorBillDraftInsert['lines'] =
    data.lines.length > 0
      ? data.lines.map((line) => ({
          description: line.description,
          quantity: line.quantity,
          unitAmount: line.unitAmount,
          lineTotal: line.lineTotal,
          currency: line.currency.toUpperCase(),
          purchaseOrderLineId: null,
        }))
      : [
          {
            description: templateTitle,
            quantity: '1',
            unitAmount: data.totalAmount,
            lineTotal: data.totalAmount,
            currency,
            purchaseOrderLineId: null,
          },
        ];

  const noteParts = [
    data.notes?.trim() || null,
    `Generated from recurring draft “${templateTitle}”. Draft only - not posted.`,
  ].filter(Boolean);

  return {
    vendorId: data.vendorId,
    projectId: data.projectId ?? null,
    reference: data.reference ?? null,
    status: 'draft',
    billDate: runDate,
    dueDate: dueDateFromOffset(runDate, data.dueDays),
    currency,
    totalAmount: data.totalAmount,
    notes: noteParts.join('\n').slice(0, 2000),
    recognizedVendorActual: false,
    lines,
  };
}

export function billingInputFromPayload(
  data: BillingRecordDraftPayload,
  runDate: BusinessDate,
): BillingDraftCreateInput {
  const stripped = stripFinalizeFlag(data) as BillingRecordDraftPayload;
  return {
    projectId: stripped.projectId,
    amount: stripped.amount,
    currency: stripped.currency,
    issueDate: runDate,
    dueDate: dueDateFromOffset(runDate, stripped.dueDays),
    reference: stripped.reference ?? null,
    notes: stripped.notes ?? null,
    finalize: false,
  };
}

export function previewPayloadForRun(
  stored: StoredDraftPayload,
  runDate: string,
  templateTitle: string,
): {
  readonly kind: DraftKind;
  readonly runDate: BusinessDate;
  readonly expense?: CreateExpenseInput;
  readonly vendorBill?: VendorBillDraftInsert;
  readonly billing?: BillingDraftCreateInput;
} {
  const date = businessDate(runDate);
  switch (stored.kind) {
    case 'expense':
      return { kind: 'expense', runDate: date, expense: expenseInputFromPayload(stored.data, date) };
    case 'vendor_bill':
      return {
        kind: 'vendor_bill',
        runDate: date,
        vendorBill: vendorBillDraftInsertFromPayload(stored.data, date, templateTitle),
      };
    case 'billing_record':
      return {
        kind: 'billing_record',
        runDate: date,
        billing: billingInputFromPayload(stored.data, date),
      };
  }
}
