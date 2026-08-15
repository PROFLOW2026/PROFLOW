import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { DocumentLinkRecord } from '../domain/types';
import {
  deleteDocumentLink,
  findDocumentById,
  findDocumentLinkById,
  insertDocumentLink,
  updateDocumentById,
} from '../data/documents.repository';
import { documentOwnerExistsInOrganization } from '../data/verify-document-owner';
import { resolveUploadPrivacyClass } from '../domain/privacy';
import { linkDocumentSchema, unlinkDocumentSchema } from '../validation/schemas';
import { assertCanReadStoredDocument, canReadCompensationDocuments } from './document-visibility';

export async function linkDocumentToEntity(
  context: OrgContext,
  rawInput: {
    documentId: string;
    ownerType: DocumentLinkRecord['ownerType'];
    ownerId: string;
    label?: string | null;
    privacyClass?: 'standard' | 'compensation' | null;
  },
): Promise<DocumentLinkRecord> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = linkDocumentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const document = await findDocumentById(context.db, context.organizationId, parsed.data.documentId);
  if (!document || document.status === 'deleted') throw new NotFoundError('Document');
  await assertCanReadStoredDocument(context, document);

  const ownerExists = await documentOwnerExistsInOrganization(
    context.db,
    context.organizationId,
    parsed.data.ownerType,
    parsed.data.ownerId,
  );
  if (!ownerExists) throw new NotFoundError('Document owner');

  const privacyClass = resolveUploadPrivacyClass({
    ownerType: parsed.data.ownerType,
    requested: parsed.data.privacyClass,
    canReadWorkforceCost: canReadCompensationDocuments(context),
  });
  if (privacyClass === 'compensation' && document.privacyClass !== 'compensation') {
    await updateDocumentById(context.db, context.organizationId, document.id, {
      privacyClass: 'compensation',
    });
  }

  return insertDocumentLink(context.db, {
    organizationId: context.organizationId,
    documentId: parsed.data.documentId,
    ownerType: parsed.data.ownerType,
    ownerId: parsed.data.ownerId,
    label: parsed.data.label ?? null,
  });
}

export async function unlinkDocumentFromEntity(
  context: OrgContext,
  rawInput: { linkId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_MANAGE);

  const parsed = unlinkDocumentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const link = await findDocumentLinkById(context.db, context.organizationId, parsed.data.linkId);
  if (!link) throw new NotFoundError('Document link');

  await deleteDocumentLink(context.db, context.organizationId, parsed.data.linkId);
}
