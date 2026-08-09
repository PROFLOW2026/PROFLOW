import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertCommittedAmountMatchesLines,
  assertIssueCreatesCommittedNotExpense,
  isCommittedCostActualExpense,
} from '../domain/committed-cost';
import {
  assertVendorInOrganization,
  findOpenCommittedCostForPo,
  findPurchaseOrderById,
  insertCommittedCost,
  insertPurchaseOrder,
  insertPurchaseOrderLines,
  listCommittedCostsForPurchaseOrders,
  listPurchaseOrderLines,
  listPurchaseOrders,
  updatePurchaseOrderStatus,
} from '../data/procurement.repository';
import {
  createPurchaseOrderSchema,
  issuePurchaseOrderSchema,
  type CreatePurchaseOrderInput,
} from '../validation/schemas';
import { assertOptionalProjectRefsInOrg } from './assert-project-refs';

export async function listPurchaseOrdersForOrg(context: OrgContext, projectId?: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  return listPurchaseOrders(context.db, context.organizationId, projectId);
}

export async function getPurchaseOrderById(context: OrgContext, purchaseOrderId: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const order = await findPurchaseOrderById(context.db, context.organizationId, purchaseOrderId);
  if (!order) throw new NotFoundError('Purchase order');
  const lines = await listPurchaseOrderLines(context.db, context.organizationId, purchaseOrderId);
  return { order, lines };
}

export async function listPurchaseOrdersWithCommittedForOrg(
  context: OrgContext,
  projectId?: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const orders = await listPurchaseOrders(
    context.db,
    context.organizationId,
    projectId,
    options,
  );
  const costs = await listCommittedCostsForPurchaseOrders(
    context.db,
    context.organizationId,
    orders.map((order) => order.id),
  );
  const byPoId = new Map(costs.map((cost) => [cost.purchaseOrderId, cost]));
  return orders.map((order) => ({
    ...order,
    committedCost: byPoId.get(order.id) ?? null,
  }));
}

export async function listPurchaseOrderLinesForOrg(
  context: OrgContext,
  purchaseOrderId: string,
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  return listPurchaseOrderLines(context.db, context.organizationId, purchaseOrderId);
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
  assertCommittedAmountMatchesLines({
    currency: input.currency,
    committedAmount: input.committedAmount,
    lines: input.lines,
  });

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  await assertOptionalProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const currency = input.currency.toUpperCase();
  const po = await insertPurchaseOrder(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    projectId: input.projectId ?? null,
    workPackageId: input.workPackageId ?? null,
    supplierQuoteId: input.supplierQuoteId ?? null,
    reference: input.reference ?? null,
    status: 'draft',
    currency,
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
      currency: line.currency.toUpperCase(),
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
 * Issue PO → open committed cost row. Does NOT create an Expense.
 * CommittedCost != Expense (doc 21).
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
  assertIssueCreatesCommittedNotExpense(issued.status as 'issued');
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
    after: {
      id: issued.id,
      status: issued.status,
      committed: true,
      expenseCreated: isCommittedCostActualExpense(),
    },
  });
  return issued;
}
