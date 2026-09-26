import { and, eq } from 'drizzle-orm';
import { payments } from '@drizzle/schema';
import { findPaymentById } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import type { ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  allocateExternalReferenceSchema,
  type AllocateExternalReferenceInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';
import { scheduleStatutoryAfterPayment } from './trigger-statutory-after-payment';

const PAYMENT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function resolveCommittedPaymentId(
  context: OrgContext,
  allocationReference: string,
  existingPaymentId: string | null,
): Promise<string | null> {
  const queryable = typeof (context.db as { select?: unknown }).select === 'function';
  if (!queryable) return existingPaymentId;

  if (existingPaymentId) {
    const linked = await findPaymentById(context.db, context.organizationId, existingPaymentId);
    if (linked?.status === 'recorded') return linked.id;
  }

  if (PAYMENT_UUID.test(allocationReference)) {
    const byId = await findPaymentById(
      context.db,
      context.organizationId,
      allocationReference,
    );
    if (byId?.status === 'recorded') return byId.id;
  }

  const byReference = await context.db
    .select({ id: payments.id })
    .from(payments)
    .where(
      and(
        eq(payments.organizationId, context.organizationId),
        eq(payments.reference, allocationReference),
        eq(payments.status, 'recorded'),
      ),
    )
    .limit(2);

  return byReference.length === 1 ? byReference[0]!.id : null;
}

function scheduleReceiptForResolvedPayment(
  context: OrgContext,
  paymentId: string | null,
  billingRecordId: string,
): void {
  if (!paymentId) return;
  scheduleStatutoryAfterPayment(
    context.userId,
    context.organizationId,
    paymentId,
    billingRecordId,
  );
}

/**
 * Store / sync an allocation or payment-application reference on the external doc.
 * Does not record customer payments in ProjectFlow Billing.
 */
export async function allocateExternalStatutoryReference(
  context: OrgContext,
  rawInput: AllocateExternalReferenceInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);

  const input = allocateExternalReferenceSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to allocate',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const paymentId = await resolveCommittedPaymentId(
    context,
    input.allocationReference,
    existing.paymentId,
  );

  const result = await provider.allocateReference({
    organizationId: context.organizationId,
    externalId: existing.externalId,
    allocationReference: input.allocationReference,
    billingRecordId: existing.billingRecordId,
  });

  if (!result.ok) {
    await updateExternalDocument(context, existing.id, {
      lastErrorCode: result.errorCode,
      lastErrorMessage: result.message,
    });
    scheduleReceiptForResolvedPayment(context, paymentId, existing.billingRecordId);
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  const updated = await updateExternalDocument(context, existing.id, {
    allocationReference: result.value.allocationReference,
    status: existing.status === 'issued' ? 'allocated' : existing.status,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  scheduleReceiptForResolvedPayment(context, paymentId, existing.billingRecordId);
  return updated!;
}
