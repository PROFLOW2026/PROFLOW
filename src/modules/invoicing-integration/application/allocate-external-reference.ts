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

  const result = await provider.allocateReference({
    organizationId: context.organizationId,
    externalId: existing.externalId,
    allocationReference: input.allocationReference,
    billingRecordId: existing.billingRecordId,
  });

  if (!result.ok) {
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  return (await updateExternalDocument(context, existing.id, {
    allocationReference: result.value.allocationReference,
    status: existing.status === 'issued' ? 'allocated' : existing.status,
  }))!;
}
