import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import type { VendorRecord } from '../domain/types';
import {
  findExpenseById,
  findVendorByNormalizedName,
  insertVendor,
  linkExpenseToVendor,
} from '../data/vendors.repository';
import {
  promoteVendorFromTransactionSchema,
  type PromoteVendorFromTransactionInput,
} from '../validation/schemas';

export interface PromoteVendorFromTransactionResult {
  readonly vendor: VendorRecord;
  /** True when a new vendor row was created; false when an existing vendor was linked. */
  readonly created: boolean;
  /** True when an expense was linked via `expenseId`. */
  readonly expenseLinked: boolean;
}

/**
 * Promotes a plain supplier name from an expense (or similar capture) into a
 * structured Vendor, optionally linking the originating expense (doc 07 §2, 43 flow 6).
 *
 * Historical supplier text on the expense is preserved; only `vendor_id` is set.
 */
export async function promoteVendorFromTransaction(
  context: OrgContext,
  rawInput: PromoteVendorFromTransactionInput,
): Promise<PromoteVendorFromTransactionResult> {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);

  const parsed = promoteVendorFromTransactionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const linkToExisting = input.linkToExisting !== false;

  let vendor: VendorRecord | null = null;
  let created = false;

  if (linkToExisting) {
    vendor = await findVendorByNormalizedName(
      context.db,
      context.organizationId,
      input.supplierName,
    );
  }

  if (!vendor) {
    vendor = await insertVendor(context.db, {
      organizationId: context.organizationId,
      name: input.supplierName.trim(),
      type: input.type ?? 'supplier',
    });
    created = true;

    await noteModuleUsage(context.db, context.organizationId, 'vendors');

    await recordAuditEvent(context, {
      action: 'vendor.created',
      entityType: 'vendor',
      entityId: vendor.id,
      after: vendor,
      metadata: { source: 'promote_from_transaction' },
    });
  }

  let expenseLinked = false;
  if (input.expenseId) {
    const expense = await findExpenseById(context.db, context.organizationId, input.expenseId);
    if (!expense) throw new NotFoundError('Expense');

    expenseLinked = await linkExpenseToVendor(
      context.db,
      context.organizationId,
      input.expenseId,
      vendor.id,
    );

    if (expenseLinked) {
      await recordAuditEvent(context, {
        action: 'vendor.linked_from_expense',
        entityType: 'vendor',
        entityId: vendor.id,
        metadata: { expenseId: input.expenseId, created },
      });
    }
  }

  return { vendor, created, expenseLinked };
}
