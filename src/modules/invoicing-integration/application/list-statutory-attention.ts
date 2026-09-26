import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  getProviderConnectionsRepository,
  listExternalDocumentsByIssuanceOutcome,
} from '../data/external-documents';
import { areInvoicingIntegrationTablesAvailable } from '../domain/persistence';
import type { ExternalStatutoryDocument } from '../domain/types';
import type { ProviderConnectionRow } from '../data/external-documents.repository';

/** Documents whose provider outcome is ambiguous (do not retry create blindly). */
export async function listAmbiguousStatutoryDocuments(
  context: OrgContext,
): Promise<ExternalStatutoryDocument[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  return listExternalDocumentsByIssuanceOutcome(context, 'ambiguous');
}

/** Provider connections stored with status error for this organization. */
export async function listInvoicingConnectionsInError(
  context: OrgContext,
): Promise<ProviderConnectionRow[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  if (!areInvoicingIntegrationTablesAvailable()) return [];
  return getProviderConnectionsRepository().listByStatus(
    context.db,
    context.organizationId,
    'error',
  );
}
