import 'server-only';

import { randomUUID } from 'node:crypto';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { findExternalDocument } from '../data/external-documents';
import { insertStatutoryShareLink } from '../data/statutory-share-links.repository';
import {
  assertStatutoryShareAvailable,
  hashStatutoryShareToken,
} from './statutory-share-availability';
import {
  STATUTORY_SHARE_TTL_MS,
  buildStatutoryShareUrl,
  createStatutoryShareToken,
} from './statutory-share-token';

export async function createStatutoryShareLinkForDocument(
  context: OrgContext,
  externalDocumentId: string,
): Promise<{ shareUrl: string }> {
  await assertStatutoryShareAvailable();
  const doc = await findExternalDocument(context, externalDocumentId);
  if (!doc) {
    throw new NotFoundError('ExternalStatutoryDocument');
  }
  if (doc.issuanceOutcome !== 'confirmed_created' || !doc.externalId) {
    throw new NotFoundError('ExternalStatutoryDocument');
  }

  const linkId = randomUUID();
  const expiresAt = new Date(Date.now() + STATUTORY_SHARE_TTL_MS);
  const token = createStatutoryShareToken({
    organizationId: context.organizationId,
    externalDocumentId: doc.id,
    linkId,
  });
  await insertStatutoryShareLink(context, {
    id: linkId,
    externalDocumentId: doc.id,
    tokenHash: hashStatutoryShareToken(token),
    createdByUserId: context.userId,
    expiresAt,
  });
  return { shareUrl: buildStatutoryShareUrl(token) };
}
