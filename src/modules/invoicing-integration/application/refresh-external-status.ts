import { getBillingRecord } from '@/modules/billing';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, updateExternalDocument } from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import { reconcileExternalAmounts } from '../domain/reconcile-external-amounts';
import type { ExternalDocumentStatus, ExternalStatutoryDocument } from '../domain/types';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  refreshExternalStatusSchema,
  type RefreshExternalStatusInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';
import { buildStatutoryBridgeFromBillingRecord } from './build-statutory-bridge';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';

function mapProviderStatus(
  status: 'pending' | 'issued' | 'credited' | 'cancelled' | 'failed',
): ExternalDocumentStatus {
  return status;
}

export async function refreshExternalStatutoryStatus(
  context: OrgContext,
  rawInput: RefreshExternalStatusInput,
  provider?: StatutoryInvoicingProvider,
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  let resolvedProvider = provider;
  if (!resolvedProvider) {
    const fromOrg = await resolveStatutoryProviderForOrg(context);
    resolvedProvider = fromOrg.isConfigured() ? fromOrg : getStatutoryInvoicingProvider();
  }
  assertStatutoryFeatureEnabled(resolvedProvider);

  const input = refreshExternalStatusSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to refresh',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const result = await resolvedProvider.retrieveStatus({
    organizationId: context.organizationId,
    externalId: existing.externalId,
  });

  if (!result.ok) {
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  let reconciliationStatus = existing.reconciliationStatus;
  let reconciliationMetadata = existing.reconciliationMetadata;

  if (
    resolvedProvider.id === SUMIT_PROVIDER_ID &&
    resolvedProvider instanceof SumitStatutoryProvider
  ) {
    const billing = await getBillingRecord(context, existing.billingRecordId);
    const { bridge } = buildStatutoryBridgeFromBillingRecord(context, billing);
    const details = await resolvedProvider.fetchDocumentDetails(existing.externalId);
    const providerAmounts = resolvedProvider.mapProviderAmounts(bridge, details);
    const reconciliation = reconcileExternalAmounts(bridge, providerAmounts);
    reconciliationStatus = reconciliation.status;
    reconciliationMetadata = reconciliation.metadata;
  }

  const updated = await updateExternalDocument(context, existing.id, {
    status: mapProviderStatus(result.value.status),
    externalNumber: result.value.externalNumber,
    externalUrl: result.value.externalUrl,
    pdf: result.value.pdf,
    issuedAt: result.value.issuedAt,
    reconciliationStatus,
    reconciliationMetadata,
    lastErrorCode: null,
    lastErrorMessage: null,
  });
  return updated!;
}
