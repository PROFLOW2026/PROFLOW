import 'server-only';

import { and, eq } from 'drizzle-orm';
import {
  apBills,
  billingRecords,
  changeOrders,
  changeRequests,
  dailyLogs,
  expenses,
  inspections,
  projects,
  punchListItems,
  purchaseOrders,
} from '@drizzle/schema';
import type { DocumentOwnerType } from '@/modules/documents/domain/types';
import type { DbExecutor } from '@/shared/db/types';

export type UploadFolderEntityContext = {
  readonly entityType: string | null;
  readonly entityId: string | null;
};

async function lookupProjectId(
  db: DbExecutor,
  organizationId: string,
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<string | null> {
  const scoped = and(eq(projects.organizationId, organizationId));

  switch (ownerType) {
    case 'expense': {
      const [row] = await db
        .select({ projectId: expenses.projectId })
        .from(expenses)
        .where(and(eq(expenses.id, ownerId), eq(expenses.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'ap_bill': {
      const [row] = await db
        .select({ projectId: apBills.projectId })
        .from(apBills)
        .where(and(eq(apBills.id, ownerId), eq(apBills.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'billing_record': {
      const [row] = await db
        .select({ projectId: billingRecords.projectId })
        .from(billingRecords)
        .where(and(eq(billingRecords.id, ownerId), eq(billingRecords.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'purchase_order': {
      const [row] = await db
        .select({ projectId: purchaseOrders.projectId })
        .from(purchaseOrders)
        .where(and(eq(purchaseOrders.id, ownerId), eq(purchaseOrders.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'daily_log': {
      const [row] = await db
        .select({ projectId: dailyLogs.projectId })
        .from(dailyLogs)
        .where(and(eq(dailyLogs.id, ownerId), eq(dailyLogs.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'punch_list_item': {
      const [row] = await db
        .select({ projectId: punchListItems.projectId })
        .from(punchListItems)
        .where(and(eq(punchListItems.id, ownerId), eq(punchListItems.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'inspection': {
      const [row] = await db
        .select({ projectId: inspections.projectId })
        .from(inspections)
        .where(and(eq(inspections.id, ownerId), eq(inspections.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'change_request': {
      const [row] = await db
        .select({ projectId: changeRequests.projectId })
        .from(changeRequests)
        .where(and(eq(changeRequests.id, ownerId), eq(changeRequests.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'change_order': {
      const [row] = await db
        .select({ projectId: changeOrders.projectId })
        .from(changeOrders)
        .where(and(eq(changeOrders.id, ownerId), eq(changeOrders.organizationId, organizationId)))
        .limit(1);
      return row?.projectId ?? null;
    }
    case 'project':
    case 'work_order': {
      const [row] = await db
        .select({ id: projects.id })
        .from(projects)
        .where(and(eq(projects.id, ownerId), scoped))
        .limit(1);
      return row?.id ?? null;
    }
    default:
      return null;
  }
}

/** Resolve provider folder entity scope from a document owner (project tree when possible). */
export async function resolveUploadFolderEntityContext(
  db: DbExecutor,
  organizationId: string,
  ownerType: DocumentOwnerType,
  ownerId: string,
): Promise<UploadFolderEntityContext> {
  const projectId = await lookupProjectId(db, organizationId, ownerType, ownerId);
  if (projectId) {
    return { entityType: 'project', entityId: projectId };
  }
  return { entityType: ownerType, entityId: ownerId };
}
