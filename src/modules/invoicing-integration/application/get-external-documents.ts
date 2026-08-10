import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findExternalDocument, listExternalDocuments } from '../data/external-documents';
import type { ExternalStatutoryDocument } from '../domain/types';
import {
  listExternalDocumentsSchema,
  type ListExternalDocumentsInput,
} from '../validation/schemas';

export async function getExternalStatutoryDocument(
  context: OrgContext,
  externalDocumentId: string,
): Promise<ExternalStatutoryDocument> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const row = await findExternalDocument(context, externalDocumentId);
  if (!row) throw new NotFoundError('ExternalStatutoryDocument');
  return row;
}

export async function listExternalStatutoryDocumentsForBilling(
  context: OrgContext,
  rawInput: ListExternalDocumentsInput,
): Promise<ExternalStatutoryDocument[]> {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const input = listExternalDocumentsSchema.parse(rawInput);
  return listExternalDocuments(context, input.billingRecordId);
}
