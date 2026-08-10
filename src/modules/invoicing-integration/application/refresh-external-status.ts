import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import type { ExternalDocumentStatus, ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  refreshExternalStatusSchema,
  type RefreshExternalStatusInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';

function mapProviderStatus(
  status: 'pending' | 'issued' | 'credited' | 'cancelled' | 'failed',
): ExternalDocumentStatus {
  return status;
}

export async function refreshExternalStatutoryStatus(
  context: OrgContext,
  rawInput: RefreshExternalStatusInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  assertStatutoryFeatureEnabled(provider);

  const input = refreshExternalStatusSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to refresh',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const result = await provider.retrieveStatus({
    organizationId: context.organizationId,
    externalId: existing.externalId,
  });

  if (!result.ok) {
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  const updated = await updateExternalDocument(context, existing.id, {
    status: mapProviderStatus(result.value.status),
    externalNumber: result.value.externalNumber,
    externalUrl: result.value.externalUrl,
    pdf: result.value.pdf,
    issuedAt: result.value.issuedAt,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  return updated!;
}
