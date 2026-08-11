import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertEditable } from '../domain/lifecycle';
import { assertBillingCurrencyMatchesProject } from '../domain/currency';
import { resolveTaxAmounts } from '../domain/tax';
import { money, toNumericString } from '@/shared/money';
import { assertRetentionFitsTotal, resolveRetentionCapture } from '@/modules/retention';
import { businessDate } from '@/shared/dates';
import {
  findBillingRecordById,
  findChangeOrdersInProject,
  findProjectInOrganization,
  replaceBillingLines,
  updateBillingRecordRow,
} from '../data/billing.repository';
import { updateBillingRecordSchema, type UpdateBillingRecordInput } from '../validation/schemas';
import { resolveCurrency } from './create-billing-record';

const BILLING_AUDIT_UPDATED = 'billing_record.updated';

export async function updateBillingRecord(context: OrgContext, rawInput: UpdateBillingRecordInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = updateBillingRecordSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');
  assertEditable(existing.status);

  const projectId = input.projectId ?? existing.projectId;
  if (!projectId) throw new NotFoundError('Project');

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const currency = input.currency
    ? input.currency.toUpperCase()
    : await resolveCurrency(context, projectId, undefined);

  if (input.currency) {
    assertBillingCurrencyMatchesProject(currency, project.currency ?? context.organization.baseCurrency);
  }

  const amount = input.amount ?? existing.totalAmount.amount;
  const amounts = resolveTaxAmounts({
    amount,
    netAmount: input.netAmount,
    taxAmount: input.taxAmount,
    currency,
  });

  const changeOrderIds = input.changeOrderIds;
  if (changeOrderIds) {
    const changeOrders = await findChangeOrdersInProject(
      context.db,
      context.organizationId,
      projectId,
      changeOrderIds,
    );
    if (changeOrderIds.length !== changeOrders.length) {
      throw new NotFoundError('Change order');
    }

    await replaceBillingLines(
      context.db,
      context.organizationId,
      input.billingRecordId,
      changeOrders.map((changeOrder, index) => ({
        description: changeOrder.reference?.trim() || `Change order ${index + 1}`,
        lineTotal: toNumericString(amounts.totalAmount),
        currency,
        changeOrderId: changeOrder.id,
        sortOrder: index,
      })),
    );
  }

  const retentionTouched =
    input.retentionAmount !== undefined || input.retentionPercent !== undefined;
  const retention = retentionTouched
    ? resolveRetentionCapture({
        totalAmount: toNumericString(amounts.totalAmount),
        currency,
        retentionAmount: input.retentionAmount,
        retentionPercent: input.retentionPercent,
        side: 'ar',
      })
    : (existing.retentionAmount ?? money('0', currency));
  assertRetentionFitsTotal(retention, amounts.totalAmount, 'ar');

  await updateBillingRecordRow(context.db, context.organizationId, input.billingRecordId, {
    projectId,
    reference: input.reference === undefined ? undefined : input.reference?.trim() || null,
    issueDate: input.issueDate ? businessDate(input.issueDate) : undefined,
    dueDate:
      input.dueDate === undefined ? undefined : input.dueDate ? businessDate(input.dueDate) : null,
    subtotalAmount: toNumericString(amounts.subtotalAmount),
    taxAmount: amounts.taxAmount ? toNumericString(amounts.taxAmount) : null,
    totalAmount: toNumericString(amounts.totalAmount),
    currency,
    retentionAmount: toNumericString(retention),
    retentionHeldRemaining: toNumericString(money('0', currency)),
    externalDocumentId:
      input.externalDocumentId === undefined ? undefined : input.externalDocumentId ?? null,
    notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
  });

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_UPDATED,
    entityType: 'billing_record',
    entityId: input.billingRecordId,
    before: { status: 'draft', totalAmount: existing.totalAmount.amount },
    after: { status: 'draft', totalAmount: amounts.totalAmount.amount, currency },
  });

  const updated = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!updated) throw new NotFoundError('Billing record');
  return updated;
}
