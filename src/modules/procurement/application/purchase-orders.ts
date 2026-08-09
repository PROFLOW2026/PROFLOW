import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { shouldCreateCommittedCostOnIssue } from '../domain/committed-cost';
import {
  findOpenCommittedCostForPo,
  findPurchaseOrderById,
  insertCommittedCost,
  insertMaterialItem,
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  listMaterialItems,
  listPurchaseOrders,
  updatePurchaseOrderStatus,
} from '../data/procurement.repository';
import {
  createMaterialItemSchema,
  createPurchaseOrderSchema,
  issuePurchaseOrderSchema,
  type CreateMaterialItemInput,
  type CreatePurchaseOrderInput,
} from '../validation/schemas';

export async function listMaterialsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.MATERIALS_READ);
  return listMaterialItems(context.db, context.organizationId);
}

export async function createMaterialItem(context: OrgContext, raw: CreateMaterialItemInput) {
  assertPermission(context, PERMISSIONS.MATERIALS_MANAGE);
  const parsed = createMaterialItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const item = await insertMaterialItem(context.db, {
    organizationId: context.organizationId,
    name: parsed.data.name,
    sku: parsed.data.sku ?? null,
    manufacturer: parsed.data.manufacturer ?? null,
    model: parsed.data.model ?? null,
    unit: parsed.data.unit,
    defaultUnitPrice: parsed.data.defaultUnitPrice ?? null,
    currency: parsed.data.currency ?? null,
    notes: parsed.data.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'materials');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_CREATED,
    entityType: 'material_item',
    entityId: item.id,
    after: { id: item.id, name: item.name },
  });
  return item;
}

export async function listPurchaseOrdersForOrg(context: OrgContext, projectId?: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  return listPurchaseOrders(context.db, context.organizationId, projectId);
}

export async function createPurchaseOrder(context: OrgContext, raw: CreatePurchaseOrderInput) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
  const parsed = createPurchaseOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const po = await insertPurchaseOrder(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    projectId: input.projectId ?? null,
    workPackageId: input.workPackageId ?? null,
    supplierQuoteId: input.supplierQuoteId ?? null,
    reference: input.reference ?? null,
    status: 'draft',
    currency: input.currency,
    committedAmount: input.committedAmount,
    orderedOn: input.orderedOn ?? null,
    notes: input.notes ?? null,
  });

  await insertPurchaseOrderLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      purchaseOrderId: po.id,
      description: line.description,
      materialItemId: line.materialItemId ?? null,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency,
      sortOrder: index,
    })),
  );

  await noteModuleUsage(context.db, context.organizationId, 'procurement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PURCHASE_ORDER_CREATED,
    entityType: 'purchase_order',
    entityId: po.id,
    after: { id: po.id, status: po.status, committedAmount: po.committedAmount },
  });
  return po;
}

/**
 * Issue PO â†’ open committed cost row. Does NOT create an Expense.
 */
export async function issuePurchaseOrder(context: OrgContext, raw: { purchaseOrderId: string }) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);
  const parsed = issuePurchaseOrderSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findPurchaseOrderById(
    context.db,
    context.organizationId,
    parsed.data.purchaseOrderId,
  );
  if (!existing) throw new NotFoundError('Purchase order');
  if (existing.status !== 'draft') {
    throw new DomainRuleError('Only draft purchase orders can be issued', 'procurement.errors.notDraft');
  }

  const issued = await updatePurchaseOrderStatus(
    context.db,
    context.organizationId,
    existing.id,
    'issued',
  );
  if (!issued) throw new NotFoundError('Purchase order');

  if (!shouldCreateCommittedCostOnIssue(issued.status as 'issued')) {
    throw new DomainRuleError('Issued PO must create committed cost', 'procurement.errors.committedRequired');
  }

  const already = await findOpenCommittedCostForPo(context.db, context.organizationId, issued.id);
  if (!already) {
    await insertCommittedCost(context.db, {
      organizationId: context.organizationId,
      purchaseOrderId: issued.id,
      projectId: issued.projectId,
      workPackageId: issued.workPackageId,
      amount: issued.committedAmount,
      currency: issued.currency,
      status: 'open',
    });
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PURCHASE_ORDER_ISSUED,
    entityType: 'purchase_order',
    entityId: issued.id,
    after: { id: issued.id, status: issued.status, committed: true, expenseCreated: false },
  });

  return issued;
}
