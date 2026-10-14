import 'server-only';

import { timingSafeEqual } from 'node:crypto';
import { externalStatutoryDocuments } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { runInOrgContext } from '@/shared/auth/session';
import { getAdminDb } from '@/shared/db/client';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { hasPermission } from '@/shared/permissions/assert';
import {
  findStatutoryShareLinkById,
  recordStatutoryShareAccess,
} from '../data/statutory-share-links.repository';
import {
  areStatutoryShareLinksTablesAvailable,
  refreshStatutoryShareLinksTableAvailability,
} from '../data/statutory-share-persistence';
import { hashStatutoryShareToken, statutoryShareSigningKey } from './statutory-share-availability';
import { verifyStatutoryShareToken } from './statutory-share-token';

export type ResolvedStatutoryShareAccess = {
  readonly organizationId: string;
  readonly externalDocumentId: string;
  readonly createdByUserId: string;
  readonly linkId: string;
};

function tokenHashMatches(storedHash: string, token: string): boolean {
  const expected = hashStatutoryShareToken(token);
  const a = Buffer.from(storedHash, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

async function isIssuedStatutoryDocument(
  organizationId: string,
  externalDocumentId: string,
): Promise<boolean> {
  const db = getAdminDb();
  const [row] = await db
    .select({
      issuanceOutcome: externalStatutoryDocuments.issuanceOutcome,
      externalId: externalStatutoryDocuments.externalId,
    })
    .from(externalStatutoryDocuments)
    .where(
      and(
        eq(externalStatutoryDocuments.organizationId, organizationId),
        eq(externalStatutoryDocuments.id, externalDocumentId),
      ),
    )
    .limit(1);
  return row?.issuanceOutcome === 'confirmed_created' && Boolean(row.externalId);
}

async function creatorCanReadBilling(
  createdByUserId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    return await runInOrgContext(createdByUserId, organizationId, async (context) =>
      hasPermission(context, PERMISSIONS.BILLING_READ),
    );
  } catch {
    return false;
  }
}

/** Returns null for any failed check — public route maps to uniform 404. */
export async function resolveStatutoryShareAccess(
  token: string,
): Promise<ResolvedStatutoryShareAccess | null> {
  if (!statutoryShareSigningKey()) {
    return null;
  }
  await refreshStatutoryShareLinksTableAvailability();
  if (!areStatutoryShareLinksTablesAvailable()) {
    return null;
  }

  let verified: ReturnType<typeof verifyStatutoryShareToken>;
  try {
    verified = verifyStatutoryShareToken(token);
  } catch {
    return null;
  }

  const link = await findStatutoryShareLinkById(verified.organizationId, verified.linkId);
  if (!link) return null;
  if (link.revokedAt || link.expiresAt.getTime() <= Date.now()) return null;
  if (link.externalDocumentId !== verified.externalDocumentId) return null;
  if (!tokenHashMatches(link.tokenHash, token)) return null;

  if (!(await isIssuedStatutoryDocument(verified.organizationId, verified.externalDocumentId))) {
    return null;
  }

  if (!(await creatorCanReadBilling(link.createdByUserId, verified.organizationId))) {
    return null;
  }

  return {
    organizationId: verified.organizationId,
    externalDocumentId: verified.externalDocumentId,
    createdByUserId: link.createdByUserId,
    linkId: link.id,
  };
}

export async function touchStatutoryShareAccess(
  organizationId: string,
  linkId: string,
): Promise<void> {
  try {
    await recordStatutoryShareAccess(linkId, organizationId);
  } catch {
    // Access telemetry must not block PDF delivery.
  }
}
