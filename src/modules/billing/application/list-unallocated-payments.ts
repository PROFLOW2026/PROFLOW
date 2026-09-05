import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { businessDate } from '@/shared/dates';
import { fromNumericString, money } from '@/shared/money';
import {
  listUnallocatedPayments as listUnallocatedPaymentsRepo,
  type UnallocatedPaymentRow as RepoUnallocatedPaymentRow,
} from '../data/payments.repository';
import type { UnallocatedPaymentRow } from '../domain/types';
import { z } from 'zod';

const listUnallocatedPaymentsSchema = z.object({
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

function mapRow(row: RepoUnallocatedPaymentRow): UnallocatedPaymentRow | null {
  const amount = fromNumericString(row.amount, row.currency);
  const appliedAmount = fromNumericString(row.appliedAmount, row.currency);
  const unallocatedAmount = fromNumericString(row.unallocatedAmount, row.currency);
  if (!amount || !appliedAmount || !unallocatedAmount) return null;
  return {
    id: row.id,
    clientId: row.clientId,
    clientName: row.clientName,
    amount,
    appliedAmount,
    unallocatedAmount,
    paymentDate: businessDate(row.paymentDate),
    method: row.method,
    reference: row.reference,
    status: row.status,
    notes: row.notes,
  };
}

export async function listUnallocatedPayments(
  context: OrgContext,
  rawFilters: { readonly clientId?: string; readonly limit?: number } = {},
): Promise<UnallocatedPaymentRow[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const parsed = listUnallocatedPaymentsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const rows = await listUnallocatedPaymentsRepo(
    context.db,
    context.organizationId,
    parsed.data,
  );
  return rows
    .map(mapRow)
    .filter((row): row is UnallocatedPaymentRow => row !== null);
}

/** Convenience for tests / callers that only need a MoneyValue total. */
export function sumUnallocatedFromRows(
  rows: readonly UnallocatedPaymentRow[],
  currency: string,
) {
  return rows
    .filter((row) => row.amount.currency === currency)
    .reduce(
      (acc, row) => money(
        (Number(acc.amount) + Number(row.unallocatedAmount.amount)).toFixed(6),
        currency,
      ),
      money('0', currency),
    );
}
