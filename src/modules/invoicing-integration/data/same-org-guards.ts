/**
 * APP GUARDS for external statutory documents — billing_record + PDF document same-org.
 */

import { and, eq } from 'drizzle-orm';
import { billingRecords, documents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';

export async function assertBillingRecordSameOrg(
  db: DbExecutor,
  organizationId: string,
  billingRecordId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: billingRecords.id })
    .from(billingRecords)
    .where(
      and(
        eq(billingRecords.id, billingRecordId),
        eq(billingRecords.organizationId, organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'Billing record does not belong to this organization',
      'invoicingIntegration.errors.billingOrgMismatch',
    );
  }
}

export async function assertPdfDocumentSameOrg(
  db: DbExecutor,
  organizationId: string,
  pdfStorageDocumentId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(eq(documents.id, pdfStorageDocumentId), eq(documents.organizationId, organizationId)),
    )
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'PDF storage document does not belong to this organization',
      'invoicingIntegration.errors.pdfDocumentOrgMismatch',
    );
  }
}
