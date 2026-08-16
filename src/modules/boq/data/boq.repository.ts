import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  type boqNodes,
  changeOrders,
  boqProgressBatches,
  boqProgressBillingLinks,
  boqProgressLines,
  boqSubcontractorScheduleLines,
  boqSubcontractorSchedules,
  boqSubcontractorValuationLines,
  boqSubcontractorValuations,
  projectBoqs,
  projects,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BoqBatchStatus, BoqNodeKind, BoqPricingType, BoqStatus } from '../domain/types';

export type ProjectBoqRow = typeof projectBoqs.$inferSelect;
export type BoqNodeRow = typeof boqNodes.$inferSelect;
export type BoqProgressBatchRow = typeof boqProgressBatches.$inferSelect;
export type BoqProgressLineRow = typeof boqProgressLines.$inferSelect;

export async function findProjectInOrganization(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
) {
  const [row] = await db
    .select({
      id: projects.id,
      organizationId: projects.organizationId,
      currency: projects.currency,
      name: projects.name,
      workKind: projects.workKind,
    })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function findBoqById(db: DbExecutor, organizationId: string, boqId: string) {
  const [row] = await db
    .select()
    .from(projectBoqs)
    .where(and(eq(projectBoqs.id, boqId), eq(projectBoqs.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function findActiveBoqForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  contractId?: string | null,
) {
  const [row] = await db
    .select()
    .from(projectBoqs)
    .where(
      and(
        eq(projectBoqs.organizationId, organizationId),
        eq(projectBoqs.projectId, projectId),
        eq(projectBoqs.status, 'active'),
        isNull(projectBoqs.archivedAt),
        contractId
          ? eq(projectBoqs.contractId, contractId)
          : undefined,
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listBoqsForProject(db: DbExecutor, organizationId: string, projectId: string) {
  return db
    .select()
    .from(projectBoqs)
    .where(
      and(eq(projectBoqs.organizationId, organizationId), eq(projectBoqs.projectId, projectId)),
    )
    .orderBy(desc(projectBoqs.versionNumber));
}

export async function listProjectChangeOrdersForBoq(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
) {
  return db
    .select({
      id: changeOrders.id,
      reference: changeOrders.reference,
      direction: changeOrders.direction,
      amount: changeOrders.amount,
      currency: changeOrders.currency,
    })
    .from(changeOrders)
    .where(and(eq(changeOrders.organizationId, organizationId), eq(changeOrders.projectId, projectId)))
    .orderBy(desc(changeOrders.createdAt));
}

export async function insertProjectBoq(
  db: DbExecutor,
  organizationId: string,
  values: {
    projectId: string;
    versionNumber: number;
    title: string | null;
    currency: string;
    progressMode: string;
    notes: string | null;
    createdByUserId: string | null;
    contractId?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(projectBoqs)
    .values({
      organizationId,
      projectId: values.projectId,
      versionNumber: values.versionNumber,
      title: values.title,
      currency: values.currency,
      progressMode: values.progressMode,
      notes: values.notes,
      status: 'draft',
      createdByUserId: values.createdByUserId,
      contractId: values.contractId ?? null,
    })
    .returning({ id: projectBoqs.id });
  if (!row) throw new Error('Failed to insert project BOQ');
  return row.id;
}

export async function updateProjectBoqStatus(
  _db: DbExecutor,
  _organizationId: string,
  _boqId: string,
  _patch: {
    status: BoqStatus;
    activatedAt?: Date | null;
    activatedByUserId?: string | null;
    supersededByBoqId?: string | null;
    archivedAt?: Date | null;
  },
): Promise<never> {
  throw new Error('updateProjectBoqStatus is removed - use activateProjectBoqRpc / archiveProjectBoqRpc');
}

export async function updateProjectBoqContractId(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
  contractId: string | null,
): Promise<void> {
  await db
    .update(projectBoqs)
    .set({ contractId, updatedAt: new Date() })
    .where(and(eq(projectBoqs.id, boqId), eq(projectBoqs.organizationId, organizationId)));
}

export async function activateProjectBoqRpc(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.activate_project_boq(${organizationId}::uuid, ${boqId}::uuid)
  `);
}

export async function listBoqNodes(db: DbExecutor, organizationId: string, boqId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM public.boq_nodes_secure
    WHERE organization_id = ${organizationId}::uuid
      AND boq_id = ${boqId}::uuid
      AND archived_at IS NULL
    ORDER BY sort_order ASC, item_code ASC NULLS LAST
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list.map(mapSecureBoqNode);
}

export async function findBoqNodeById(db: DbExecutor, organizationId: string, nodeId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM public.boq_nodes_secure
    WHERE id = ${nodeId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const raw = list[0] as Record<string, unknown> | undefined;
  return raw ? mapSecureBoqNode(raw) : null;
}

function mapSecureBoqNode(raw: Record<string, unknown>): BoqNodeRow {
  return {
    id: String(raw.id),
    organizationId: String(raw.organization_id ?? raw.organizationId),
    boqId: String(raw.boq_id ?? raw.boqId),
    parentId: (raw.parent_id ?? raw.parentId ?? null) as string | null,
    nodeKind: String(raw.node_kind ?? raw.nodeKind) as BoqNodeRow['nodeKind'],
    itemCode: (raw.item_code ?? raw.itemCode ?? null) as string | null,
    description: String(raw.description),
    unit: (raw.unit ?? null) as string | null,
    pricingType: String(raw.pricing_type ?? raw.pricingType) as BoqNodeRow['pricingType'],
    originalQuantity: String(raw.original_quantity ?? raw.originalQuantity ?? '0'),
    originalUnitPrice: String(raw.original_unit_price ?? raw.originalUnitPrice ?? '0'),
    originalAmount: String(raw.original_amount ?? raw.originalAmount ?? '0'),
    currentQuantity: String(raw.current_quantity ?? raw.currentQuantity ?? '0'),
    currentUnitPrice: String(raw.current_unit_price ?? raw.currentUnitPrice ?? '0'),
    currentAmount: String(raw.current_amount ?? raw.currentAmount ?? '0'),
    openingApprovedQuantity: String(
      raw.opening_approved_quantity ?? raw.openingApprovedQuantity ?? '0',
    ),
    openingBilledQuantity: String(
      raw.opening_billed_quantity ?? raw.openingBilledQuantity ?? '0',
    ),
    workPackageId: (raw.work_package_id ?? raw.workPackageId ?? null) as string | null,
    costCategoryId: (raw.cost_category_id ?? raw.costCategoryId ?? null) as string | null,
    budgetLineId: (raw.budget_line_id ?? raw.budgetLineId ?? null) as string | null,
    sourceChangeOrderId: (raw.source_change_order_id ?? raw.sourceChangeOrderId ?? null) as
      | string
      | null,
    status: String(raw.status ?? 'active'),
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    notes: (raw.notes ?? null) as string | null,
    archivedAt: (raw.archived_at ?? raw.archivedAt ?? null) as Date | null,
    createdAt: (raw.created_at ?? raw.createdAt ?? new Date()) as Date,
    updatedAt: (raw.updated_at ?? raw.updatedAt ?? new Date()) as Date,
  };
}

async function mutateDraftBoqNodeRpc(
  db: DbExecutor,
  organizationId: string,
  action: 'insert' | 'update' | 'delete' | 'archive',
  nodeId: string | null,
  payload: Record<string, unknown>,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.boq_mutate_draft_node(
      ${organizationId}::uuid,
      ${action}::text,
      ${nodeId}::uuid,
      ${JSON.stringify(payload)}::jsonb
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const id = list[0] ? String((list[0] as Record<string, unknown>).id ?? '') : '';
  if (!id || id === 'null') throw new Error(`Failed BOQ node ${action}`);
  return id;
}

export async function insertBoqNode(
  db: DbExecutor,
  organizationId: string,
  values: {
    boqId: string;
    parentId: string | null;
    nodeKind: BoqNodeKind;
    itemCode: string | null;
    description: string;
    unit: string | null;
    pricingType: BoqPricingType;
    originalQuantity: string;
    originalUnitPrice: string;
    originalAmount: string;
    currentQuantity: string;
    currentUnitPrice: string;
    currentAmount: string;
    openingApprovedQuantity: string;
    openingBilledQuantity: string;
    workPackageId: string | null;
    costCategoryId: string | null;
    budgetLineId: string | null;
    sourceChangeOrderId: string | null;
    sortOrder: number;
    notes: string | null;
  },
): Promise<string> {
  return mutateDraftBoqNodeRpc(db, organizationId, 'insert', null, {
    boq_id: values.boqId,
    parent_id: values.parentId,
    node_kind: values.nodeKind,
    item_code: values.itemCode,
    description: values.description,
    unit: values.unit,
    pricing_type: values.pricingType,
    original_quantity: values.originalQuantity,
    original_unit_price: values.originalUnitPrice,
    original_amount: values.originalAmount,
    current_quantity: values.currentQuantity,
    current_unit_price: values.currentUnitPrice,
    current_amount: values.currentAmount,
    opening_approved_quantity: values.openingApprovedQuantity,
    opening_billed_quantity: values.openingBilledQuantity,
    work_package_id: values.workPackageId,
    cost_category_id: values.costCategoryId,
    budget_line_id: values.budgetLineId,
    source_change_order_id: values.sourceChangeOrderId,
    sort_order: values.sortOrder,
    notes: values.notes,
  });
}

export async function updateBoqNodeDraft(
  db: DbExecutor,
  organizationId: string,
  nodeId: string,
  values: Partial<{
    parentId: string | null;
    itemCode: string | null;
    description: string;
    unit: string | null;
    pricingType: BoqPricingType;
    originalQuantity: string;
    originalUnitPrice: string;
    originalAmount: string;
    currentQuantity: string;
    currentUnitPrice: string;
    currentAmount: string;
    openingApprovedQuantity: string;
    openingBilledQuantity: string;
    workPackageId: string | null;
    costCategoryId: string | null;
    budgetLineId: string | null;
    sortOrder: number;
    notes: string | null;
  }>,
) {
  const payload: Record<string, unknown> = {};
  if (values.parentId !== undefined) payload.parent_id = values.parentId;
  if (values.itemCode !== undefined) payload.item_code = values.itemCode;
  if (values.description !== undefined) payload.description = values.description;
  if (values.unit !== undefined) payload.unit = values.unit;
  if (values.pricingType !== undefined) payload.pricing_type = values.pricingType;
  if (values.originalQuantity !== undefined) payload.original_quantity = values.originalQuantity;
  if (values.originalUnitPrice !== undefined) payload.original_unit_price = values.originalUnitPrice;
  if (values.originalAmount !== undefined) payload.original_amount = values.originalAmount;
  if (values.currentQuantity !== undefined) payload.current_quantity = values.currentQuantity;
  if (values.currentUnitPrice !== undefined) payload.current_unit_price = values.currentUnitPrice;
  if (values.currentAmount !== undefined) payload.current_amount = values.currentAmount;
  if (values.openingApprovedQuantity !== undefined) {
    payload.opening_approved_quantity = values.openingApprovedQuantity;
  }
  if (values.openingBilledQuantity !== undefined) {
    payload.opening_billed_quantity = values.openingBilledQuantity;
  }
  if (values.workPackageId !== undefined) payload.work_package_id = values.workPackageId;
  if (values.costCategoryId !== undefined) payload.cost_category_id = values.costCategoryId;
  if (values.budgetLineId !== undefined) payload.budget_line_id = values.budgetLineId;
  if (values.sortOrder !== undefined) payload.sort_order = values.sortOrder;
  if (values.notes !== undefined) payload.notes = values.notes;
  await mutateDraftBoqNodeRpc(db, organizationId, 'update', nodeId, payload);
}

export async function updateBoqNodeCurrent(
  db: DbExecutor,
  organizationId: string,
  nodeId: string,
  values: {
    currentQuantity: string;
    currentUnitPrice: string;
    currentAmount: string;
  },
) {
  await mutateDraftBoqNodeRpc(db, organizationId, 'update', nodeId, {
    current_quantity: values.currentQuantity,
    current_unit_price: values.currentUnitPrice,
    current_amount: values.currentAmount,
  });
}

export async function archiveBoqNode(db: DbExecutor, organizationId: string, nodeId: string) {
  await mutateDraftBoqNodeRpc(db, organizationId, 'archive', nodeId, {});
}

export async function deleteDraftBoqNode(db: DbExecutor, organizationId: string, nodeId: string) {
  await mutateDraftBoqNodeRpc(db, organizationId, 'delete', nodeId, {});
}

export async function sumItemAmounts(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
  field: 'original' | 'current',
): Promise<string> {
  const column = field === 'original' ? 'original_amount' : 'current_amount';
  const result = await db.execute(sql`
    SELECT coalesce(sum(${sql.raw(column)}), 0)::text AS total
    FROM public.boq_nodes_secure
    WHERE organization_id = ${organizationId}::uuid
      AND boq_id = ${boqId}::uuid
      AND node_kind = 'item'
      AND archived_at IS NULL
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return String((list[0] as Record<string, unknown> | undefined)?.total ?? '0');
}

export async function insertChangeAllocation(
  _db: DbExecutor,
  _organizationId: string,
  _values: {
    boqId: string;
    projectId: string;
    changeOrderId: string;
    boqNodeId: string | null;
    allocationKind: string;
    quantityDelta: string;
    unitPriceDelta: string;
    amountDelta: string;
    currency: string;
    notes: string | null;
    createdByUserId: string | null;
  },
): Promise<never> {
  throw new Error('insertChangeAllocation is removed - use allocateChangeRpc / reverseChangeAllocationRpc');
}

export async function listChangeAllocationsForBoq(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
) {
  const result = await db.execute(sql`
    SELECT
      id,
      organization_id AS "organizationId",
      project_id AS "projectId",
      boq_id AS "boqId",
      change_order_id AS "changeOrderId",
      boq_node_id AS "boqNodeId",
      allocation_kind AS "allocationKind",
      quantity_delta::text AS "quantityDelta",
      unit_price_delta::text AS "unitPriceDelta",
      amount_delta::text AS "amountDelta",
      currency,
      notes,
      reverses_allocation_id AS "reversesAllocationId",
      created_via AS "createdVia",
      created_by_user_id AS "createdByUserId",
      created_at AS "createdAt"
    FROM public.boq_change_allocations_secure
    WHERE organization_id = ${organizationId}::uuid
      AND boq_id = ${boqId}::uuid
    ORDER BY created_at ASC
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list as Array<{
    id: string;
    organizationId: string;
    projectId: string;
    boqId: string;
    changeOrderId: string;
    boqNodeId: string | null;
    allocationKind: string;
    quantityDelta: string;
    unitPriceDelta: string;
    amountDelta: string;
    currency: string;
    notes: string | null;
    reversesAllocationId: string | null;
    createdVia: string | null;
    createdByUserId: string | null;
    createdAt: Date;
  }>;
}

export async function listChangeAllocationsForChangeOrder(
  db: DbExecutor,
  organizationId: string,
  changeOrderId: string,
) {
  const result = await db.execute(sql`
    SELECT
      id,
      organization_id AS "organizationId",
      project_id AS "projectId",
      boq_id AS "boqId",
      change_order_id AS "changeOrderId",
      boq_node_id AS "boqNodeId",
      allocation_kind AS "allocationKind",
      quantity_delta::text AS "quantityDelta",
      unit_price_delta::text AS "unitPriceDelta",
      amount_delta::text AS "amountDelta",
      currency,
      notes,
      reverses_allocation_id AS "reversesAllocationId",
      created_via AS "createdVia",
      created_by_user_id AS "createdByUserId",
      created_at AS "createdAt"
    FROM public.boq_change_allocations_secure
    WHERE organization_id = ${organizationId}::uuid
      AND change_order_id = ${changeOrderId}::uuid
    ORDER BY created_at ASC
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list as Awaited<ReturnType<typeof listChangeAllocationsForBoq>>;
}

export async function nextCertificateNumber(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${boqProgressBatches.certificateNumber}), 0)`,
    })
    .from(boqProgressBatches)
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        eq(boqProgressBatches.boqId, boqId),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

export async function insertProgressBatch(
  db: DbExecutor,
  organizationId: string,
  values: {
    projectId: string;
    boqId: string;
    certificateNumber: number;
    periodLabel: string;
    periodStart: string | null;
    periodEnd: string | null;
    notes: string | null;
    createdByUserId: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(boqProgressBatches)
    .values({
      organizationId,
      ...values,
      status: 'draft',
    })
    .returning({ id: boqProgressBatches.id });
  if (!row) throw new Error('Failed to insert progress batch');
  return row.id;
}

export async function insertProgressLines(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
  lines: readonly {
    boqNodeId: string;
    previousApprovedQuantity: string;
    measuredQuantity: string;
    approvedQuantity: string;
    unitPriceSnapshot: string;
    periodAmount: string;
    currency: string;
    notes: string | null;
  }[],
) {
  if (lines.length === 0) return;
  await db.insert(boqProgressLines).values(
    lines.map((line) => ({
      organizationId,
      batchId,
      ...line,
    })),
  );
}

export async function findProgressBatchById(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
) {
  const [row] = await db
    .select()
    .from(boqProgressBatches)
    .where(
      and(eq(boqProgressBatches.id, batchId), eq(boqProgressBatches.organizationId, organizationId)),
    )
    .limit(1);
  return row ?? null;
}

export async function listProgressLines(db: DbExecutor, organizationId: string, batchId: string) {
  const result = await db.execute(sql`
    SELECT
      id,
      organization_id AS "organizationId",
      batch_id AS "batchId",
      boq_node_id AS "boqNodeId",
      measured_quantity::text AS "measuredQuantity",
      previous_approved_quantity::text AS "previousApprovedQuantity",
      approved_quantity::text AS "approvedQuantity",
      unit_price_snapshot::text AS "unitPriceSnapshot",
      period_amount::text AS "periodAmount",
      currency,
      notes,
      created_at AS "createdAt",
      updated_at AS "updatedAt"
    FROM public.boq_progress_lines_secure
    WHERE organization_id = ${organizationId}::uuid
      AND batch_id = ${batchId}::uuid
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list as Array<{
    id: string;
    organizationId: string;
    batchId: string;
    boqNodeId: string;
    measuredQuantity: string;
    previousApprovedQuantity: string;
    approvedQuantity: string;
    unitPriceSnapshot: string;
    periodAmount: string;
    currency: string;
    notes: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

export async function listProgressBatchesForBoq(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
) {
  return db
    .select()
    .from(boqProgressBatches)
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        eq(boqProgressBatches.boqId, boqId),
      ),
    )
    .orderBy(desc(boqProgressBatches.certificateNumber));
}

export async function updateProgressBatchStatus(
  _db: DbExecutor,
  _organizationId: string,
  _batchId: string,
  _patch: {
    status: BoqBatchStatus;
    approvedAt?: Date | null;
    approvedByUserId?: string | null;
  },
): Promise<never> {
  throw new Error('updateProgressBatchStatus is removed - use approveProgressBatchRpc / claim / supersede RPCs');
}

export async function cumulativeApprovedForNode(
  db: DbExecutor,
  organizationId: string,
  boqNodeId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${boqProgressLines.approvedQuantity}), 0)`,
    })
    .from(boqProgressLines)
    .innerJoin(
      boqProgressBatches,
      and(
        eq(boqProgressBatches.id, boqProgressLines.batchId),
        eq(boqProgressBatches.organizationId, boqProgressLines.organizationId),
      ),
    )
    .where(
      and(
        eq(boqProgressLines.organizationId, organizationId),
        eq(boqProgressLines.boqNodeId, boqNodeId),
        or(
          inArray(boqProgressBatches.status, ['approved', 'billed']),
          sql`exists (
            select 1 from boq_progress_billing_links l
            where l.progress_batch_id = ${boqProgressBatches.id}
              and l.organization_id = ${boqProgressBatches.organizationId}
              and l.voided_at is null
          )`,
        ),
      ),
    );
  return row?.total ?? '0';
}

export async function nodeHasProgressHistory(
  db: DbExecutor,
  organizationId: string,
  boqNodeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: boqProgressLines.id })
    .from(boqProgressLines)
    .where(
      and(
        eq(boqProgressLines.organizationId, organizationId),
        eq(boqProgressLines.boqNodeId, boqNodeId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function nodeHasBillingLinkedProgress(
  db: DbExecutor,
  organizationId: string,
  boqNodeId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: boqProgressBillingLinks.id })
    .from(boqProgressBillingLinks)
    .innerJoin(
      boqProgressBatches,
      and(
        eq(boqProgressBatches.id, boqProgressBillingLinks.progressBatchId),
        eq(boqProgressBatches.organizationId, boqProgressBillingLinks.organizationId),
      ),
    )
    .innerJoin(
      boqProgressLines,
      and(
        eq(boqProgressLines.batchId, boqProgressBatches.id),
        eq(boqProgressLines.organizationId, boqProgressBatches.organizationId),
      ),
    )
    .where(
      and(
        eq(boqProgressBillingLinks.organizationId, organizationId),
        eq(boqProgressLines.boqNodeId, boqNodeId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function findBillingLinkForBatch(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
) {
  const [row] = await db
    .select()
    .from(boqProgressBillingLinks)
    .where(
      and(
        eq(boqProgressBillingLinks.organizationId, organizationId),
        eq(boqProgressBillingLinks.progressBatchId, batchId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function insertProgressBillingLink(
  db: DbExecutor,
  organizationId: string,
  values: {
    progressBatchId: string;
    billingRecordId: string;
    periodNetAmount: string;
    currency: string;
    createdByUserId: string | null;
  },
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.insert_boq_progress_billing_link(
      ${organizationId}::uuid,
      ${values.progressBatchId}::uuid,
      ${values.billingRecordId}::uuid,
      ${values.periodNetAmount}::numeric,
      ${values.currency}::char(3)
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const id = list[0] ? String((list[0] as Record<string, unknown>).id) : '';
  if (!id) throw new Error('Failed to insert progress billing link');
  return id;
}

export async function finalizeProgressBillingRpc(
  db: DbExecutor,
  organizationId: string,
  values: {
    progressBatchId: string;
    billingRecordId: string;
    periodNetAmount: string;
    currency: string;
  },
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.finalize_boq_progress_billing(
      ${organizationId}::uuid,
      ${values.progressBatchId}::uuid,
      ${values.billingRecordId}::uuid,
      ${values.periodNetAmount}::numeric,
      ${values.currency}::char(3)
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const id = list[0] ? String((list[0] as Record<string, unknown>).id) : '';
  if (!id) throw new Error('Failed to finalize progress billing');
  return id;
}

export async function approveProgressBatchRpc(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
  lineApprovals?: Readonly<Record<string, string>> | null,
): Promise<void> {
  const approvalsJson =
    lineApprovals && Object.keys(lineApprovals).length > 0
      ? JSON.stringify(lineApprovals)
      : null;
  await db.execute(sql`
    SELECT app.approve_boq_progress_batch(
      ${organizationId}::uuid,
      ${batchId}::uuid,
      ${approvalsJson}::jsonb
    )
  `);
}

export async function activateSubcontractorScheduleRpc(
  db: DbExecutor,
  organizationId: string,
  scheduleId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.activate_boq_subcontractor_schedule(
      ${organizationId}::uuid,
      ${scheduleId}::uuid
    )
  `);
}

export async function proposeSubcontractorValuationApRpc(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
  vendorBillId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.propose_boq_subcontractor_valuation_ap(
      ${organizationId}::uuid,
      ${valuationId}::uuid,
      ${vendorBillId}::uuid
    )
  `);
}

export async function voidSubcontractorValuationRpc(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.void_boq_subcontractor_valuation(
      ${organizationId}::uuid,
      ${valuationId}::uuid
    )
  `);
}

export async function approveSubcontractorValuationRpc(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.approve_boq_subcontractor_valuation(
      ${organizationId}::uuid,
      ${valuationId}::uuid
    )
  `);
}

export async function allocateChangeRpc(
  db: DbExecutor,
  input: {
    organizationId: string;
    boqId: string;
    changeOrderId: string;
    allocationKind: string;
    boqNodeId: string | null;
    quantityDelta: string;
    unitPriceDelta: string;
    amountDelta: string;
    notes: string | null;
    newItem: Record<string, unknown> | null;
  },
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.boq_allocate_change(
      ${input.organizationId}::uuid,
      ${input.boqId}::uuid,
      ${input.changeOrderId}::uuid,
      ${input.allocationKind}::text,
      ${input.boqNodeId ? sql`${input.boqNodeId}::uuid` : sql`NULL::uuid`},
      ${input.quantityDelta}::numeric,
      ${input.unitPriceDelta}::numeric,
      ${input.amountDelta}::numeric,
      ${input.notes}::text,
      ${input.newItem ? JSON.stringify(input.newItem) : null}::jsonb
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const id = list[0] ? String((list[0] as Record<string, unknown>).id) : '';
  if (!id) throw new Error('Failed to allocate change');
  return id;
}

export async function reverseChangeAllocationRpc(
  db: DbExecutor,
  organizationId: string,
  allocationId: string,
  notes?: string | null,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.boq_reverse_change_allocation(
      ${organizationId}::uuid,
      ${allocationId}::uuid,
      ${notes ?? null}::text
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return String((list[0] as Record<string, unknown> | undefined)?.id ?? '');
}

export async function supersedeProgressBatchRpc(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
  periodLabel?: string | null,
): Promise<string> {
  const result = await db.execute(sql`
    SELECT app.supersede_boq_progress_batch(
      ${organizationId}::uuid,
      ${batchId}::uuid,
      ${periodLabel ?? null}::text
    ) AS id
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return String((list[0] as Record<string, unknown> | undefined)?.id ?? '');
}

/**
 * Optimistic claim: approved → billed via SECURITY DEFINER.
 * Tenant RLS intentionally has no approved→billed UPDATE policy (0034).
 */
export async function claimProgressBatchForBilling(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT app.claim_boq_progress_batch_for_billing(
      ${organizationId}::uuid,
      ${batchId}::uuid
    ) AS claimed
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const raw = list[0] as Record<string, unknown> | undefined;
  return Boolean(raw?.claimed);
}

/** Revert billed→approved only when no billing link exists (failed create path). */
export async function revertProgressBatchBillingClaim(
  db: DbExecutor,
  organizationId: string,
  batchId: string,
): Promise<void> {
  await db.execute(sql`
    SELECT app.revert_boq_progress_batch_billing_claim(
      ${organizationId}::uuid,
      ${batchId}::uuid
    )
  `);
}

export async function nextBoqVersionNumber(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  contractId?: string | null,
): Promise<number> {
  const [row] = await db
    .select({
      max: sql<number>`coalesce(max(${projectBoqs.versionNumber}), 0)`,
    })
    .from(projectBoqs)
    .where(
      and(
        eq(projectBoqs.organizationId, organizationId),
        eq(projectBoqs.projectId, projectId),
        contractId
          ? eq(projectBoqs.contractId, contractId)
          : isNull(projectBoqs.contractId),
      ),
    );
  return Number(row?.max ?? 0) + 1;
}

/** Mapping FKs only - never original or current money/qty columns. */
export async function updateBoqNodeMappings(
  db: DbExecutor,
  organizationId: string,
  nodeId: string,
  values: {
    workPackageId?: string | null;
    costCategoryId?: string | null;
    budgetLineId?: string | null;
  },
) {
  await mutateDraftBoqNodeRpc(db, organizationId, 'update', nodeId, {
    ...(values.workPackageId !== undefined ? { work_package_id: values.workPackageId } : {}),
    ...(values.costCategoryId !== undefined ? { cost_category_id: values.costCategoryId } : {}),
    ...(values.budgetLineId !== undefined ? { budget_line_id: values.budgetLineId } : {}),
  });
}

export type BoqSubScheduleRow = typeof boqSubcontractorSchedules.$inferSelect;
export type BoqSubScheduleLineRow = typeof boqSubcontractorScheduleLines.$inferSelect;
export type BoqSubValuationRow = typeof boqSubcontractorValuations.$inferSelect;
export type BoqSubValuationLineRow = typeof boqSubcontractorValuationLines.$inferSelect;

export async function insertSubcontractorSchedule(
  db: DbExecutor,
  organizationId: string,
  values: {
    projectId: string;
    boqId: string;
    vendorEngagementId: string;
    subcontractAgreementId?: string | null;
    title: string | null;
    currency: string;
    notes: string | null;
    createdByUserId: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(boqSubcontractorSchedules)
    .values({
      organizationId,
      ...values,
      status: 'draft',
    })
    .returning({ id: boqSubcontractorSchedules.id });
  if (!row) throw new Error('Failed to insert subcontractor schedule');
  return row.id;
}

export async function findSubcontractorScheduleById(
  db: DbExecutor,
  organizationId: string,
  scheduleId: string,
) {
  const [row] = await db
    .select()
    .from(boqSubcontractorSchedules)
    .where(
      and(
        eq(boqSubcontractorSchedules.id, scheduleId),
        eq(boqSubcontractorSchedules.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listSubcontractorSchedulesForBoq(
  db: DbExecutor,
  organizationId: string,
  boqId: string,
) {
  return db
    .select()
    .from(boqSubcontractorSchedules)
    .where(
      and(
        eq(boqSubcontractorSchedules.organizationId, organizationId),
        eq(boqSubcontractorSchedules.boqId, boqId),
        isNull(boqSubcontractorSchedules.archivedAt),
      ),
    )
    .orderBy(desc(boqSubcontractorSchedules.createdAt));
}

export async function insertSubcontractorScheduleLine(
  db: DbExecutor,
  organizationId: string,
  values: {
    scheduleId: string;
    boqNodeId: string;
    unit: string | null;
    agreedQuantity: string;
    unitRate: string;
    amount: string;
    currency: string;
    notes: string | null;
    sortOrder: number;
  },
): Promise<string> {
  const [row] = await db
    .insert(boqSubcontractorScheduleLines)
    .values({ organizationId, ...values })
    .returning({ id: boqSubcontractorScheduleLines.id });
  if (!row) throw new Error('Failed to insert subcontractor schedule line');
  return row.id;
}

export async function listSubcontractorScheduleLines(
  db: DbExecutor,
  organizationId: string,
  scheduleId: string,
) {
  const result = await db.execute(sql`
    SELECT *
    FROM public.boq_subcontractor_schedule_lines_secure
    WHERE organization_id = ${organizationId}::uuid
      AND schedule_id = ${scheduleId}::uuid
    ORDER BY sort_order ASC
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list.map(mapSecureSubScheduleLine);
}

export async function findSubcontractorScheduleLineById(
  db: DbExecutor,
  organizationId: string,
  lineId: string,
) {
  const result = await db.execute(sql`
    SELECT *
    FROM public.boq_subcontractor_schedule_lines_secure
    WHERE id = ${lineId}::uuid
      AND organization_id = ${organizationId}::uuid
    LIMIT 1
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const raw = list[0] as Record<string, unknown> | undefined;
  return raw ? mapSecureSubScheduleLine(raw) : null;
}

function mapSecureSubScheduleLine(raw: Record<string, unknown>) {
  return {
    id: String(raw.id),
    organizationId: String(raw.organization_id ?? raw.organizationId),
    scheduleId: String(raw.schedule_id ?? raw.scheduleId),
    boqNodeId: String(raw.boq_node_id ?? raw.boqNodeId),
    unit: (raw.unit ?? null) as string | null,
    agreedQuantity: String(raw.agreed_quantity ?? raw.agreedQuantity ?? '0'),
    unitRate: String(raw.unit_rate ?? raw.unitRate ?? '0'),
    amount: String(raw.amount ?? '0'),
    currency: String(raw.currency),
    notes: (raw.notes ?? null) as string | null,
    sortOrder: Number(raw.sort_order ?? raw.sortOrder ?? 0),
    createdAt: (raw.created_at ?? raw.createdAt) as Date,
    updatedAt: (raw.updated_at ?? raw.updatedAt) as Date,
  };
}

export async function cumulativeSubValuationApprovedForLine(
  db: DbExecutor,
  organizationId: string,
  scheduleLineId: string,
): Promise<string> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(${boqSubcontractorValuationLines.approvedQuantity}), 0)`,
    })
    .from(boqSubcontractorValuationLines)
    .innerJoin(
      boqSubcontractorValuations,
      and(
        eq(boqSubcontractorValuations.id, boqSubcontractorValuationLines.valuationId),
        eq(boqSubcontractorValuations.organizationId, boqSubcontractorValuationLines.organizationId),
      ),
    )
    .where(
      and(
        eq(boqSubcontractorValuationLines.organizationId, organizationId),
        eq(boqSubcontractorValuationLines.scheduleLineId, scheduleLineId),
        inArray(boqSubcontractorValuations.status, ['draft', 'approved', 'proposed_ap']),
      ),
    );
  return row?.total ?? '0';
}

export async function insertSubcontractorValuation(
  db: DbExecutor,
  organizationId: string,
  values: {
    scheduleId: string;
    periodLabel: string;
    notes: string | null;
    createdByUserId: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(boqSubcontractorValuations)
    .values({
      organizationId,
      ...values,
      status: 'draft',
    })
    .returning({ id: boqSubcontractorValuations.id });
  if (!row) throw new Error('Failed to insert subcontractor valuation');
  return row.id;
}

export async function insertSubcontractorValuationLines(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
  lines: readonly {
    scheduleLineId: string;
    previousApprovedQuantity: string;
    approvedQuantity: string;
    unitRateSnapshot: string;
    periodAmount: string;
    currency: string;
    notes: string | null;
  }[],
) {
  if (lines.length === 0) return;
  await db.insert(boqSubcontractorValuationLines).values(
    lines.map((line) => ({
      organizationId,
      valuationId,
      ...line,
    })),
  );
}

export async function listSubcontractorValuationsForSchedule(
  db: DbExecutor,
  organizationId: string,
  scheduleId: string,
) {
  return db
    .select()
    .from(boqSubcontractorValuations)
    .where(
      and(
        eq(boqSubcontractorValuations.organizationId, organizationId),
        eq(boqSubcontractorValuations.scheduleId, scheduleId),
      ),
    )
    .orderBy(desc(boqSubcontractorValuations.createdAt));
}

export async function findSubcontractorValuationById(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
) {
  const [row] = await db
    .select()
    .from(boqSubcontractorValuations)
    .where(
      and(
        eq(boqSubcontractorValuations.id, valuationId),
        eq(boqSubcontractorValuations.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function listSubcontractorValuationLines(
  db: DbExecutor,
  organizationId: string,
  valuationId: string,
) {
  return db
    .select()
    .from(boqSubcontractorValuationLines)
    .where(
      and(
        eq(boqSubcontractorValuationLines.organizationId, organizationId),
        eq(boqSubcontractorValuationLines.valuationId, valuationId),
      ),
    )
    .orderBy(boqSubcontractorValuationLines.createdAt);
}

export async function listDraftProgressBatchesForOrg(db: DbExecutor, organizationId: string) {
  return db
    .select({
      id: boqProgressBatches.id,
      projectId: boqProgressBatches.projectId,
      boqId: boqProgressBatches.boqId,
      periodLabel: boqProgressBatches.periodLabel,
      certificateNumber: boqProgressBatches.certificateNumber,
      status: boqProgressBatches.status,
    })
    .from(boqProgressBatches)
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        eq(boqProgressBatches.status, 'draft'),
        isNull(boqProgressBatches.archivedAt),
      ),
    )
    .limit(40);
}

export async function listApprovedUnbilledProgressBatchesForOrg(
  db: DbExecutor,
  organizationId: string,
) {
  return db
    .select({
      id: boqProgressBatches.id,
      projectId: boqProgressBatches.projectId,
      boqId: boqProgressBatches.boqId,
      periodLabel: boqProgressBatches.periodLabel,
      certificateNumber: boqProgressBatches.certificateNumber,
      status: boqProgressBatches.status,
    })
    .from(boqProgressBatches)
    .leftJoin(
      boqProgressBillingLinks,
      and(
        eq(boqProgressBillingLinks.progressBatchId, boqProgressBatches.id),
        eq(boqProgressBillingLinks.organizationId, boqProgressBatches.organizationId),
      ),
    )
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        eq(boqProgressBatches.status, 'approved'),
        isNull(boqProgressBatches.archivedAt),
        isNull(boqProgressBillingLinks.id),
      ),
    )
    .limit(40);
}

export async function listActiveBoqsWithTotalsForOrg(db: DbExecutor, organizationId: string) {
  const result = await db.execute(sql`
    SELECT
      b.id AS boq_id,
      b.project_id AS project_id,
      b.currency AS currency,
      b.title AS title,
      coalesce((
        SELECT sum(n.original_amount)
        FROM public.boq_nodes_secure n
        WHERE n.boq_id = b.id
          AND n.organization_id = b.organization_id
          AND n.node_kind = 'item'
          AND n.archived_at IS NULL
      ), 0)::text AS original_boq_total,
      coalesce((
        SELECT sum(n.current_amount)
        FROM public.boq_nodes_secure n
        WHERE n.boq_id = b.id
          AND n.organization_id = b.organization_id
          AND n.node_kind = 'item'
          AND n.archived_at IS NULL
      ), 0)::text AS current_boq_total,
      coalesce((
        SELECT sum(a.amount_delta)
        FROM public.boq_change_allocations_secure a
        WHERE a.boq_id = b.id
          AND a.organization_id = b.organization_id
      ), 0)::text AS allocated_approved_changes
    FROM public.project_boqs b
    WHERE b.organization_id = ${organizationId}::uuid
      AND b.status = 'active'
      AND b.archived_at IS NULL
    LIMIT 40
  `);
  const list = Array.isArray(result)
    ? result
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  return list.map((raw) => {
    const row = raw as Record<string, unknown>;
    return {
      boqId: String(row.boq_id ?? row.boqId),
      projectId: String(row.project_id ?? row.projectId),
      currency: String(row.currency),
      title: row.title == null ? null : String(row.title),
      originalBoqTotal: String(row.original_boq_total ?? row.originalBoqTotal ?? '0'),
      currentBoqTotal: String(row.current_boq_total ?? row.currentBoqTotal ?? '0'),
      allocatedApprovedChanges: String(
        row.allocated_approved_changes ?? row.allocatedApprovedChanges ?? '0',
      ),
    };
  });
}
