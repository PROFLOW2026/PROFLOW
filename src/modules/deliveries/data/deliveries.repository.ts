import { and, asc, desc, eq, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import {
  deliveryItemReports,
  deliveryItems,
  projectLocations,
  vendors,
  workPackages,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  OPEN_DELIVERY_STATES,
  type DeliveryActorType,
  type DeliveryItemKind,
  type DeliveryItemRecord,
  type DeliveryReportKind,
  type DeliveryReportRecord,
  type DeliveryState,
} from '../domain/types';

const I = deliveryItems;
const P = deliveryItemReports;

function mapItem(row: typeof I.$inferSelect): DeliveryItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    vendorId: row.vendorId,
    subcontractAgreementId: row.subcontractAgreementId,
    itemName: row.itemName,
    description: row.description,
    itemKind: row.itemKind as DeliveryItemKind,
    isCritical: row.isCritical,
    supplierVendorId: row.supplierVendorId,
    supplierName: row.supplierName,
    quantity: row.quantity,
    unit: row.unit,
    orderDate: row.orderDate,
    originalExpectedDate: row.originalExpectedDate,
    expectedDate: row.expectedDate,
    actualDate: row.actualDate,
    state: row.state as DeliveryState,
    locationId: row.locationId,
    workPackageId: row.workPackageId,
    purchaseOrderId: row.purchaseOrderId,
    notes: row.notes,
    contractorVisible: row.contractorVisible,
    delayNotifiedFor: row.delayNotifiedFor,
    createdActorType: row.createdActorType as DeliveryActorType,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapReport(row: typeof P.$inferSelect): DeliveryReportRecord {
  return {
    id: row.id,
    deliveryItemId: row.deliveryItemId,
    reportKind: row.reportKind as DeliveryReportKind,
    reportedState: (row.reportedState as DeliveryState | null) ?? null,
    newExpectedDate: row.newExpectedDate,
    actualDate: row.actualDate,
    note: row.note,
    actorType: row.actorType as DeliveryActorType,
    actorUserId: row.actorUserId,
    actorPrincipalId: row.actorPrincipalId,
    createdAt: row.createdAt,
  };
}

export interface DeliveryListFilter {
  readonly projectId: string;
  readonly vendorId?: string;
  readonly states?: readonly DeliveryState[];
  readonly limit?: number;
}

export async function listDeliveryItems(
  db: DbExecutor,
  organizationId: string,
  filter: DeliveryListFilter,
): Promise<DeliveryItemRecord[]> {
  const rows = await db
    .select()
    .from(I)
    .where(
      and(
        eq(I.organizationId, organizationId),
        eq(I.projectId, filter.projectId),
        isNull(I.archivedAt),
        filter.vendorId ? eq(I.vendorId, filter.vendorId) : undefined,
        filter.states && filter.states.length > 0 ? inArray(I.state, [...filter.states]) : undefined,
      ),
    )
    .orderBy(sql`${I.expectedDate} asc nulls last`, asc(I.itemName))
    .limit(Math.min(Math.max(filter.limit ?? 300, 1), 500));
  return rows.map(mapItem);
}

export async function findDeliveryItem(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<DeliveryItemRecord | null> {
  const [row] = await db
    .select()
    .from(I)
    .where(and(eq(I.organizationId, organizationId), eq(I.id, id), isNull(I.archivedAt)))
    .limit(1);
  return row ? mapItem(row) : null;
}

/** No RETURNING: external principals insert under RLS (re-read through their select policy). */
export async function insertDeliveryItem(db: DbExecutor, values: typeof I.$inferInsert): Promise<void> {
  await db.insert(I).values(values);
}

export async function updateDeliveryItemRow(
  db: DbExecutor,
  organizationId: string,
  id: string,
  patch: Partial<typeof I.$inferInsert>,
): Promise<void> {
  await db
    .update(I)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(I.organizationId, organizationId), eq(I.id, id)));
}

export async function insertDeliveryReport(db: DbExecutor, values: typeof P.$inferInsert): Promise<void> {
  await db.insert(P).values(values);
}

export async function listDeliveryReports(
  db: DbExecutor,
  organizationId: string,
  deliveryItemId: string,
): Promise<DeliveryReportRecord[]> {
  const rows = await db
    .select()
    .from(P)
    .where(and(eq(P.organizationId, organizationId), eq(P.deliveryItemId, deliveryItemId)))
    .orderBy(desc(P.createdAt))
    .limit(200);
  return rows.map(mapReport);
}

export async function vendorNames(
  db: DbExecutor,
  organizationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: vendors.id, name: vendors.name })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, [...ids])));
  return new Map(rows.map((row) => [row.id, row.name]));
}

export async function vendorExists(db: DbExecutor, organizationId: string, vendorId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), eq(vendors.id, vendorId)))
    .limit(1);
  return Boolean(row);
}

export async function locationOnProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  locationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projectLocations.id })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        eq(projectLocations.id, locationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function workPackageOnProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  workPackageId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: workPackages.id })
    .from(workPackages)
    .where(
      and(
        eq(workPackages.organizationId, organizationId),
        eq(workPackages.projectId, projectId),
        eq(workPackages.id, workPackageId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

/** Scan (service role): open items whose expected date passed and were not yet notified for it. */
export async function listDelayCandidates(
  db: DbExecutor,
  input: { readonly today: string; readonly organizationId?: string; readonly limit: number },
): Promise<DeliveryItemRecord[]> {
  const rows = await db
    .select()
    .from(I)
    .where(
      and(
        isNull(I.archivedAt),
        inArray(I.state, [...OPEN_DELIVERY_STATES]),
        lt(I.expectedDate, input.today),
        or(isNull(I.delayNotifiedFor), sql`${I.delayNotifiedFor} <> ${I.expectedDate}`),
        input.organizationId ? eq(I.organizationId, input.organizationId) : undefined,
      ),
    )
    .orderBy(asc(I.expectedDate))
    .limit(input.limit);
  return rows.map(mapItem);
}

/** Delayed open items across the caller's visible projects (Command Center). */
export async function listDelayedOpenItems(
  db: DbExecutor,
  organizationId: string,
  input: { readonly today: string; readonly projectId?: string; readonly criticalOnly: boolean; readonly limit: number },
): Promise<DeliveryItemRecord[]> {
  const rows = await db
    .select()
    .from(I)
    .where(
      and(
        eq(I.organizationId, organizationId),
        isNull(I.archivedAt),
        inArray(I.state, [...OPEN_DELIVERY_STATES]),
        lt(I.expectedDate, input.today),
        input.projectId ? eq(I.projectId, input.projectId) : undefined,
        input.criticalOnly ? eq(I.isCritical, true) : undefined,
      ),
    )
    .orderBy(asc(I.expectedDate))
    .limit(input.limit);
  return rows.map(mapItem);
}
