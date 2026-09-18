import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument } from '../data/external-documents';
import { SUMIT_PROVIDER_ID } from '../domain/types';
import { resolveStatutoryProviderForOrg } from './resolve-statutory-provider';
import { SumitStatutoryProvider } from '../providers/sumit/sumit-statutory-provider';

export async function sendExternalStatutoryDocument(
  context: OrgContext,
  input: {
    externalDocumentId: string;
    emailAddress: string;
  },
): Promise<void> {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const email = input.emailAddress.trim();
  if (!email) {
    throw new DomainRuleError(
      'Recipient email is required',
      'invoicingIntegration.errors.sendEmailRequired',
    );
  }

  const doc = await findExternalDocument(context, input.externalDocumentId);
  if (!doc) throw new NotFoundError('ExternalStatutoryDocument');
  if (!doc.externalId || doc.issuanceOutcome !== 'confirmed_created') {
    throw new DomainRuleError(
      'Statutory document is not issued',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  if (doc.providerId !== SUMIT_PROVIDER_ID) {
    throw new DomainRuleError(
      'Send is not supported for this provider',
      'invoicingIntegration.errors.providerFailed',
    );
  }

  const provider = await resolveStatutoryProviderForOrg(context);
  if (!(provider instanceof SumitStatutoryProvider) || !provider.isConfigured()) {
    throw new DomainRuleError(
      'SUMIT provider is not configured',
      'invoicingIntegration.errors.connectionRequired',
    );
  }

  await provider.sendDocument({
    documentId: doc.externalId,
    emailAddress: email,
    original: true,
  });
}
