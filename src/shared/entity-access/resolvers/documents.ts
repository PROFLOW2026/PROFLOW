import { and, eq } from 'drizzle-orm';
import { documentShares, drawingRevisions, drawings } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'documents' track. One resolver per entity type that supports threads/attachments/evidence. */
export const DOCUMENTS_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    // Project-wide: contractors reach it through `drawings_select` RLS (visibility / distribution).
    entityType: 'drawing',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ organizationId: drawings.organizationId, projectId: drawings.projectId })
        .from(drawings)
        .where(and(eq(drawings.organizationId, organizationId), eq(drawings.id, entityId)))
        .limit(1);
      return row ? { organizationId: row.organizationId, projectId: row.projectId, vendorId: null } : null;
    },
  },
  {
    entityType: 'drawing_revision',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: drawingRevisions.organizationId,
          projectId: drawingRevisions.projectId,
          status: drawingRevisions.status,
        })
        .from(drawingRevisions)
        .where(and(eq(drawingRevisions.organizationId, organizationId), eq(drawingRevisions.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: null,
        internalOnly: row.status === 'draft' || row.status === 'withdrawn',
      };
    },
  },
  {
    // A share addressed to one agreement / principal belongs to that contractor company.
    entityType: 'shared_document',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: documentShares.organizationId,
          projectId: documentShares.projectId,
          vendorId: documentShares.vendorId,
          agreementId: documentShares.subcontractAgreementId,
          revokedAt: documentShares.revokedAt,
        })
        .from(documentShares)
        .where(and(eq(documentShares.organizationId, organizationId), eq(documentShares.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId ?? null,
        subcontractAgreementId: row.agreementId ?? null,
        internalOnly: row.revokedAt !== null,
      };
    },
  },
];
