import { and, eq } from 'drizzle-orm';
import { rfis, submittalRevisions, submittals } from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/** Entity access resolvers owned by the 'rfi' track. One resolver per entity type that supports threads/attachments/evidence. */
export const RFI_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'rfi',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: rfis.projectId,
          vendorId: rfis.vendorId,
          agreementId: rfis.subcontractAgreementId,
          status: rfis.status,
          raisedActorType: rfis.raisedActorType,
        })
        .from(rfis)
        .where(and(eq(rfis.organizationId, organizationId), eq(rfis.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
        // Internal RFIs without a contractor, and internal drafts, are never contractor-facing.
        internalOnly: !row.vendorId || (row.status === 'draft' && row.raisedActorType === 'internal'),
      };
    },
  },
  {
    entityType: 'submittal',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: submittals.projectId,
          vendorId: submittals.vendorId,
          agreementId: submittals.subcontractAgreementId,
        })
        .from(submittals)
        .where(and(eq(submittals.organizationId, organizationId), eq(submittals.id, entityId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
      };
    },
  },
  {
    entityType: 'submittal_revision',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          projectId: submittals.projectId,
          vendorId: submittals.vendorId,
          agreementId: submittals.subcontractAgreementId,
        })
        .from(submittalRevisions)
        .innerJoin(
          submittals,
          and(
            eq(submittals.id, submittalRevisions.submittalId),
            eq(submittals.organizationId, submittalRevisions.organizationId),
          ),
        )
        .where(
          and(eq(submittalRevisions.organizationId, organizationId), eq(submittalRevisions.id, entityId)),
        )
        .limit(1);
      if (!row) return null;
      return {
        organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.agreementId,
      };
    },
  },
];
