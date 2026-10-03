import { and, eq } from 'drizzle-orm';
import {
  coordinationEventParticipants,
  coordinationEvents,
  coordinationResponses,
} from '@drizzle/schema';
import type { EntityAccessResolver } from '../types';

/**
 * Entity access resolvers owned by the 'coordination' track.
 *
 * - coordination_event: multi-party, so it carries no vendor and is internal-only for threads /
 *   evidence (otherwise every invited contractor would share one contractor-audience thread).
 * - coordination_participant: one contractor's invitation to an event (contractor-facing thread).
 * - coordination_response: one immutable answer (contractor evidence attaches here).
 */
export const COORDINATION_ENTITY_RESOLVERS: readonly EntityAccessResolver[] = [
  {
    entityType: 'coordination_event',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({ organizationId: coordinationEvents.organizationId, projectId: coordinationEvents.projectId })
        .from(coordinationEvents)
        .where(and(eq(coordinationEvents.id, entityId), eq(coordinationEvents.organizationId, organizationId)))
        .limit(1);
      if (!row) return null;
      return { organizationId: row.organizationId, projectId: row.projectId, vendorId: null, internalOnly: true };
    },
  },
  {
    entityType: 'coordination_participant',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: coordinationEventParticipants.organizationId,
          projectId: coordinationEventParticipants.projectId,
          kind: coordinationEventParticipants.kind,
          vendorId: coordinationEventParticipants.vendorId,
          subcontractAgreementId: coordinationEventParticipants.subcontractAgreementId,
        })
        .from(coordinationEventParticipants)
        .where(
          and(
            eq(coordinationEventParticipants.id, entityId),
            eq(coordinationEventParticipants.organizationId, organizationId),
          ),
        )
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
        internalOnly: row.kind !== 'contractor',
      };
    },
  },
  {
    entityType: 'coordination_response',
    async resolve(db, organizationId, entityId) {
      const [row] = await db
        .select({
          organizationId: coordinationResponses.organizationId,
          projectId: coordinationResponses.projectId,
          vendorId: coordinationResponses.vendorId,
          subcontractAgreementId: coordinationResponses.subcontractAgreementId,
        })
        .from(coordinationResponses)
        .where(and(eq(coordinationResponses.id, entityId), eq(coordinationResponses.organizationId, organizationId)))
        .limit(1);
      if (!row) return null;
      return {
        organizationId: row.organizationId,
        projectId: row.projectId,
        vendorId: row.vendorId,
        subcontractAgreementId: row.subcontractAgreementId,
      };
    },
  },
];
