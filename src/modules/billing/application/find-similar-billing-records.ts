import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { ValidationError } from '@/shared/errors';
import { findSimilarBillingRecords } from '../data/billing.repository';
import { previewSimilarBillingSchema, type PreviewSimilarBillingInput } from '../validation/schemas';

export interface SimilarBillingRecordMatch {
  readonly id: string;
  readonly reference: string | null;
  readonly issueDate: string;
  readonly subtotalAmount: string;
}

export async function listSimilarBillingRecords(
  context: OrgContext,
  rawInput: PreviewSimilarBillingInput,
): Promise<SimilarBillingRecordMatch[]> {
  const parsed = previewSimilarBillingSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const rows = await findSimilarBillingRecords(context.db, context.organizationId, {
    excludeBillingRecordId: input.billingRecordId,
    issueDate: businessDate(input.issueDate),
    subtotalAmount: input.subtotalAmount,
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
  });

  return rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    issueDate: row.issueDate,
    subtotalAmount: row.subtotalAmount,
  }));
}
