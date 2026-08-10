import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  createExternalDocument,
  findExternalDocument,
  updateExternalDocument,
} from '../data/external-documents';
import type { StatutoryInvoicingProvider } from '../domain/provider';
import type { ExternalStatutoryDocument } from '../domain/types';
import { getStatutoryInvoicingProvider } from '../domain/unconfigured-provider';
import {
  cancelExternalDocumentSchema,
  creditExternalDocumentSchema,
  type CancelExternalDocumentInput,
  type CreditExternalDocumentInput,
} from '../validation/schemas';
import { assertStatutoryFeatureEnabled } from './assert-feature-enabled';

/**
 * Credit where the provider supports it. Does not rewrite BillingRecord totals —
 * callers may create an internal credit_note billing record separately.
 */
export async function creditExternalStatutoryDocument(
  context: OrgContext,
  rawInput: CreditExternalDocumentInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<{
  readonly original: ExternalStatutoryDocument;
  readonly credit: ExternalStatutoryDocument;
}> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);

  const input = creditExternalDocumentSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to credit',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const result = await provider.creditDocument({
    organizationId: context.organizationId,
    externalId: existing.externalId,
    reason: input.reason ?? null,
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.ok) {
    if (result.errorCode === 'unsupported') {
      throw new DomainRuleError(
        result.message,
        'invoicingIntegration.errors.creditUnsupported',
        { errorCode: result.errorCode },
      );
    }
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  const original = (await updateExternalDocument(context, existing.id, {
    status: 'credited',
  }))!;

  const credit = await createExternalDocument(context, {
    billingRecordId: existing.billingRecordId,
    providerId: provider.id,
    kind: 'credit_note',
    status: result.value.status === 'credited' ? 'credited' : 'pending',
    externalId: result.value.creditExternalId,
    externalNumber: result.value.creditExternalNumber,
    externalUrl: result.value.externalUrl,
  });

  return { original, credit };
}

export async function cancelExternalStatutoryDocument(
  context: OrgContext,
  rawInput: CancelExternalDocumentInput,
  provider: StatutoryInvoicingProvider = getStatutoryInvoicingProvider(),
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  assertStatutoryFeatureEnabled(provider);

  const input = cancelExternalDocumentSchema.parse(rawInput);
  const existing = await findExternalDocument(context, input.externalDocumentId);
  if (!existing) throw new NotFoundError('ExternalStatutoryDocument');
  if (!existing.externalId) {
    throw new DomainRuleError(
      'External document has no provider id to cancel',
      'invoicingIntegration.errors.missingExternalId',
    );
  }

  const result = await provider.cancelDocument({
    organizationId: context.organizationId,
    externalId: existing.externalId,
    reason: input.reason ?? null,
    idempotencyKey: input.idempotencyKey,
  });

  if (!result.ok) {
    if (result.errorCode === 'unsupported') {
      throw new DomainRuleError(
        result.message,
        'invoicingIntegration.errors.cancelUnsupported',
        { errorCode: result.errorCode },
      );
    }
    throw new DomainRuleError(result.message, 'invoicingIntegration.errors.providerFailed', {
      errorCode: result.errorCode,
    });
  }

  return (await updateExternalDocument(context, existing.id, {
    status: result.value.status === 'cancelled' ? 'cancelled' : 'pending',
  }))!;
}
