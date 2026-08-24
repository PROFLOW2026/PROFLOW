import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { withTransaction } from '@/shared/db';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { findApBillById } from '../data/ap.repository';
import {
  applyDraftBillAllocations,
  deleteDraftBillAllocations,
  insertBillProjectAllocations,
  listBillProjectAllocations,
  supersedeActiveBillAllocations,
  supersedeAppliedBillAllocations,
  type ApBillProjectAllocationRow,
} from '../data/bill-project-allocations.repository';
import {
  previewBillAllocationStrip,
  resolveBillProjectAllocationLines,
} from '../domain/bill-project-allocation';
import { vendorBillActualAmount } from '../domain/bill-tax';
import { areApBillProjectAllocationsAvailable } from '../domain/vendor-bill-project-attribution';
import { isRecognizedVendorBillStatus } from '../domain/vendor-cost-recognition';
import {
  applyBillProjectAllocationsSchema,
  saveBillProjectAllocationsSchema,
  type ApplyBillProjectAllocationsInput,
  type SaveBillProjectAllocationsInput,
} from '../validation/schemas';

/**
 * App-layer gates for `ap_bill_project_allocations`.
 * Membership alone must never authorize bill project slices - AP_READ / AP_MANAGE only.
 */

export function assertCanReadBillProjectAllocations(context: OrgContext): void {
  assertPermission(context, PERMISSIONS.AP_READ);
}

export function assertCanManageBillProjectAllocations(context: OrgContext): void {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
}

function assertAllocationsGate(): void {
  if (!areApBillProjectAllocationsAvailable()) {
    throw new ValidationError(
      [{ path: 'apBillProjectAllocations', message: 'Bill project allocations are not available yet' }],
      'Bill project allocations are not available yet',
    );
  }
}

export interface BillProjectAllocationReview {
  readonly available: boolean;
  readonly apBillId: string;
  readonly recognizedNet: string;
  readonly currency: string;
  readonly lines: readonly ApBillProjectAllocationRow[];
  readonly preview: ReturnType<typeof previewBillAllocationStrip> | null;
}

export async function loadBillProjectAllocationReview(
  context: OrgContext,
  apBillId: string,
): Promise<BillProjectAllocationReview> {
  assertCanReadBillProjectAllocations(context);

  const bill = await findApBillById(context.db, context.organizationId, apBillId);
  if (!bill) throw new NotFoundError('AP bill');

  if (!areApBillProjectAllocationsAvailable()) {
    return {
      available: false,
      apBillId,
      recognizedNet: vendorBillActualAmount(bill),
      currency: bill.currency,
      lines: [],
      preview: null,
    };
  }

  const lines = await listBillProjectAllocations(context.db, context.organizationId, apBillId, [
    'draft',
    'applied',
  ]);

  const preview = previewBillAllocationStrip({
    recognizedNet: vendorBillActualAmount(bill),
    lines: lines.map((line) => ({
      projectId: line.projectId ?? '',
      method: line.method as 'manual_amount' | 'manual_percent' | 'active_days' | 'equal_split',
      amount: line.amount,
      percent: line.percent,
      days: line.basisDays,
      notes: line.notes,
    })),
  });

  return {
    available: true,
    apBillId,
    recognizedNet: vendorBillActualAmount(bill),
    currency: bill.currency,
    lines,
    preview,
  };
}

/**
 * Replace draft allocation lines for a bill, or supersede applied and write a new set.
 * When `apply=true`, new rows are inserted as applied (financial loaders only read applied).
 */
export async function saveBillProjectAllocations(
  context: OrgContext,
  rawInput: SaveBillProjectAllocationsInput,
): Promise<{ readonly lines: readonly ApBillProjectAllocationRow[] }> {
  assertAllocationsGate();
  assertCanManageBillProjectAllocations(context);

  const parsed = saveBillProjectAllocationsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const bill = await findApBillById(context.db, context.organizationId, parsed.data.apBillId);
  if (!bill) throw new NotFoundError('AP bill');
  if (bill.status === 'void') {
    throw new DomainRuleError('Cannot allocate a void bill', 'ap.errors.voidBill');
  }

  const resolved = resolveBillProjectAllocationLines({
    recognizedNet: vendorBillActualAmount(bill),
    currency: bill.currency,
    lines: parsed.data.lines.map((line) => ({
      projectId: line.projectId,
      method: line.method ?? 'manual_amount',
      amount: line.amount,
      percent: line.percent,
      days: line.days,
      notes: line.notes,
    })),
  });

  const apply = parsed.data.apply === true;
  if (apply && !isRecognizedVendorBillStatus(bill.status)) {
    throw new DomainRuleError(
      'Bill must be recognized before applying allocations',
      'ap.errors.billNotRecognized',
    );
  }

  if (apply) {
    const freezeDate = bill.billDate ?? bill.createdAt.toISOString().slice(0, 10);
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));
  }

  const billDate = bill.billDate ?? bill.createdAt.toISOString().slice(0, 10);

  const result = await withTransaction(context.db, async (tx) => {
    // Supersede applied + clear drafts so conservation cap does not double-count.
    await supersedeActiveBillAllocations(tx, context.organizationId, bill.id);
    await deleteDraftBillAllocations(tx, context.organizationId, bill.id);

    if (resolved.lines.length === 0) {
      return { lines: [] };
    }

    // Overhead persist is available on insertBillProjectAllocations (targetType).
    // This save path stays project-only: resolveBillProjectAllocationLines requires
    // projectId, and under-NET already lands in sumRecognizedApGeneralRemainders.
    const lines = await insertBillProjectAllocations(
      tx,
      context.organizationId,
      bill.id,
      bill.currency,
      apply ? 'applied' : 'draft',
      resolved.lines.map((line) => ({
        projectId: line.projectId,
        targetType: 'project' as const,
        method: line.method,
        amount: line.amount,
        percent: line.percent,
        basisDays: line.basisDays,
        notes: line.notes,
        sortOrder: line.sortOrder,
      })),
    );

    return { lines };
  });

  if (apply) {
    const { tryRecomputeOpenGeneralCostMonth } = await import(
      '@/modules/financials/application/recompute-general-cost-month'
    );
    await tryRecomputeOpenGeneralCostMonth(context, { date: billDate });
  }

  return result;
}

/** Promote existing draft lines to applied (superseding prior applied first). */
export async function applyBillProjectAllocations(
  context: OrgContext,
  rawInput: ApplyBillProjectAllocationsInput,
): Promise<{ readonly lines: readonly ApBillProjectAllocationRow[] }> {
  assertAllocationsGate();
  assertCanManageBillProjectAllocations(context);

  const parsed = applyBillProjectAllocationsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const bill = await findApBillById(context.db, context.organizationId, parsed.data.apBillId);
  if (!bill) throw new NotFoundError('AP bill');
  if (!isRecognizedVendorBillStatus(bill.status)) {
    throw new DomainRuleError(
      'Bill must be recognized before applying allocations',
      'ap.errors.billNotRecognized',
    );
  }

  const freezeDate = bill.billDate ?? bill.createdAt.toISOString().slice(0, 10);
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

  const billDate = freezeDate;

  const result = await withTransaction(context.db, async (tx) => {
    const existing = await listBillProjectAllocations(tx, context.organizationId, bill.id, [
      'draft',
      'applied',
    ]);
    const drafts = existing.filter((row) => row.status === 'draft');
    const applied = existing.filter((row) => row.status === 'applied');

    if (drafts.length === 0 && applied.length > 0) {
      return { lines: applied };
    }
    if (drafts.length === 0) {
      throw new DomainRuleError('No draft allocations to apply', 'ap.errors.noDraftAllocations');
    }

    await supersedeAppliedBillAllocations(tx, context.organizationId, bill.id);
    const lines = await applyDraftBillAllocations(tx, context.organizationId, bill.id);
    return { lines };
  });

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: billDate });

  return result;
}
