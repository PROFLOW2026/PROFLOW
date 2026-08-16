import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  assets,
  complianceArtifacts,
  projectMilestones,
  purchaseOrders,
  punchListItems,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';

/**
 * Lightweight org operations counts for reports (application projections - no new schema).
 */

export interface OperationsReportCounts {
  readonly milestonesPlanned: number;
  readonly milestonesMissed: number;
  readonly milestonesOverdue: number;
  readonly openPunchItems: number;
  readonly purchaseOrdersOpen: number;
  readonly purchaseOrdersIssued: number;
  readonly complianceExpired: number;
  readonly complianceExpiringSoon: number;
  readonly complianceMissingEvidence: number;
  readonly assetsActive: number;
  readonly assetsAssignedToProjects: number;
  readonly assetsInMaintenance: number;
}

export async function loadOperationsReportCounts(
  db: DbExecutor,
  organizationId: string,
  asOf: BusinessDate,
): Promise<OperationsReportCounts> {
  const [milestoneRow] = await db
    .select({
      planned: sql<number>`count(*) filter (where ${projectMilestones.status} = 'planned')::int`,
      missed: sql<number>`count(*) filter (where ${projectMilestones.status} = 'missed')::int`,
      overdue: sql<number>`count(*) filter (
        where ${projectMilestones.status} = 'planned'
          and ${projectMilestones.targetDate} is not null
          and ${projectMilestones.targetDate} < ${asOf}
      )::int`,
    })
    .from(projectMilestones)
    .where(
      and(
        eq(projectMilestones.organizationId, organizationId),
        isNull(projectMilestones.archivedAt),
      ),
    );

  const [punchRow] = await db
    .select({
      open: sql<number>`count(*) filter (
        where ${punchListItems.status} in ('open', 'in_progress')
      )::int`,
    })
    .from(punchListItems)
    .where(
      and(eq(punchListItems.organizationId, organizationId), isNull(punchListItems.archivedAt)),
    );

  const [poRow] = await db
    .select({
      open: sql<number>`count(*) filter (
        where ${purchaseOrders.status} in ('draft', 'issued', 'partially_received')
      )::int`,
      issued: sql<number>`count(*) filter (
        where ${purchaseOrders.status} in ('issued', 'partially_received')
      )::int`,
    })
    .from(purchaseOrders)
    .where(
      and(eq(purchaseOrders.organizationId, organizationId), isNull(purchaseOrders.archivedAt)),
    );

  const [complianceRow] = await db
    .select({
      expired: sql<number>`count(*) filter (where ${complianceArtifacts.status} = 'expired')::int`,
      expiringSoon: sql<number>`count(*) filter (
        where ${complianceArtifacts.status} = 'expiring_soon'
      )::int`,
      missingEvidence: sql<number>`count(*) filter (
        where ${complianceArtifacts.documentId} is null
          and ${complianceArtifacts.status} <> 'revoked'
      )::int`,
    })
    .from(complianceArtifacts)
    .where(
      and(
        eq(complianceArtifacts.organizationId, organizationId),
        isNull(complianceArtifacts.archivedAt),
      ),
    );

  const [assetRow] = await db
    .select({
      active: sql<number>`count(*) filter (where ${assets.status} = 'active')::int`,
      assigned: sql<number>`count(*) filter (
        where ${assets.assignedProjectId} is not null
          and ${assets.status} in ('active', 'in_maintenance')
      )::int`,
      inMaintenance: sql<number>`count(*) filter (where ${assets.status} = 'in_maintenance')::int`,
    })
    .from(assets)
    .where(and(eq(assets.organizationId, organizationId), isNull(assets.archivedAt)));

  return {
    milestonesPlanned: milestoneRow?.planned ?? 0,
    milestonesMissed: milestoneRow?.missed ?? 0,
    milestonesOverdue: milestoneRow?.overdue ?? 0,
    openPunchItems: punchRow?.open ?? 0,
    purchaseOrdersOpen: poRow?.open ?? 0,
    purchaseOrdersIssued: poRow?.issued ?? 0,
    complianceExpired: complianceRow?.expired ?? 0,
    complianceExpiringSoon: complianceRow?.expiringSoon ?? 0,
    complianceMissingEvidence: complianceRow?.missingEvidence ?? 0,
    assetsActive: assetRow?.active ?? 0,
    assetsAssignedToProjects: assetRow?.assigned ?? 0,
    assetsInMaintenance: assetRow?.inMaintenance ?? 0,
  };
}

/** Optional: verify schema symbols stay tree-shake friendly for empty orgs. */
export async function hasAnyPurchaseOrders(
  db: DbExecutor,
  organizationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: purchaseOrders.id })
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.organizationId, organizationId),
        isNull(purchaseOrders.archivedAt),
        inArray(purchaseOrders.status, ['draft', 'issued', 'partially_received', 'closed']),
      ),
    )
    .limit(1);
  return Boolean(row);
}
