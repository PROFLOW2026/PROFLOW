import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { money, toNumericString } from '@/shared/money';
import { resolveRetentionCapture } from '@/modules/retention';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { noteModuleUsage, resolveAllocatedReference } from '@/modules/tenancy';
import {
  parsePaymentTermMetadata,
  resolveArPaymentTermId,
  suggestDueDateFromPaymentTerm,
  getCatalogEntryById,
  resolveOrgDefaultPaymentTermIdForContext,
} from '@/modules/business-catalog';
import { findClientById, listContactsForClient, pickBillingClientContact } from '@/modules/clients';
import { assertBillingCurrencyMatchesProject } from '../domain/currency';
import { resolveTaxAmounts } from '../domain/tax';
import {
  findBillingRecordById,
  findChangeOrdersInProject,
  findProjectInOrganization,
  insertBillingRecord,
  replaceBillingLines,
} from '../data/billing.repository';
import { findContractById, findPrimaryContractByProject } from '@/modules/projects';
import { createBillingRecordSchema, type CreateBillingRecordInput } from '../validation/schemas';
import { finalizeBillingRecordWithPermission } from './finalize-billing-record';

const BILLING_AUDIT_CREATED = 'billing_record.created';

async function resolveCurrency(
  context: OrgContext,
  projectId: string,
  inputCurrency: string | undefined,
): Promise<string> {
  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  const projectCurrency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
  if (inputCurrency) {
    assertBillingCurrencyMatchesProject(inputCurrency, projectCurrency);
    return inputCurrency.toUpperCase();
  }
  return projectCurrency;
}

function buildLines(
  amounts: ReturnType<typeof resolveTaxAmounts>,
  changeOrders: readonly { id: string; reference: string | null }[],
): {
  description: string;
  lineTotal: string;
  currency: string;
  changeOrderId: string | null;
  sortOrder: number;
}[] {
  if (changeOrders.length === 0) {
    return [
      {
        description: 'Billing amount',
        lineTotal: toNumericString(amounts.totalAmount),
        currency: amounts.totalAmount.currency,
        changeOrderId: null,
        sortOrder: 0,
      },
    ];
  }

  return changeOrders.map((changeOrder, index) => ({
    description: changeOrder.reference?.trim() || `Change order ${index + 1}`,
    lineTotal: toNumericString(amounts.totalAmount),
    currency: amounts.totalAmount.currency,
    changeOrderId: changeOrder.id,
    sortOrder: index,
  }));
}

export async function createBillingRecord(context: OrgContext, rawInput: CreateBillingRecordInput) {
  return createBillingRecordWithPermission(context, rawInput, PERMISSIONS.BILLING_MANAGE);
}

/**
 * Same draft/finalize billing path with an alternate capability gate.
 * Used by BOQ progress billing (`boq.billing.create`) so managers can bill
 * progress without broad `billing.manage`.
 */
export async function createBillingRecordWithPermission(
  context: OrgContext,
  rawInput: CreateBillingRecordInput,
  permission: typeof PERMISSIONS.BILLING_MANAGE | typeof PERMISSIONS.BOQ_BILLING_CREATE,
) {
  assertPermission(context, permission);

  const parsed = createBillingRecordSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const project = await findProjectInOrganization(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('Project');

  let contractId = input.contractId ?? null;
  let contractRetentionPercent: string | null = null;
  let contractPaymentTermId: string | null = null;
  if (contractId) {
    const contract = await findContractById(context.db, context.organizationId, contractId);
    if (!contract || contract.projectId !== input.projectId) {
      throw new NotFoundError('Contract');
    }
    contractRetentionPercent = contract.retentionPercent;
    contractPaymentTermId = contract.paymentTermId;
  } else {
    const primary = await findPrimaryContractByProject(
      context.db,
      context.organizationId,
      input.projectId,
    );
    contractId = primary?.id ?? null;
    contractRetentionPercent = primary?.retentionPercent ?? null;
    contractPaymentTermId = primary?.paymentTermId ?? null;
  }

  const currency = await resolveCurrency(context, input.projectId, input.currency);
  const amounts = resolveTaxAmounts({
    amount: input.amount,
    netAmount: input.netAmount,
    taxAmount: input.taxAmount,
    currency,
  });

  const changeOrderIds = input.changeOrderIds ?? [];
  const changeOrders = await findChangeOrdersInProject(
    context.db,
    context.organizationId,
    input.projectId,
    changeOrderIds,
  );
  if (changeOrderIds.length !== changeOrders.length) {
    throw new NotFoundError('Change order');
  }

  const issueDate = businessDate(input.issueDate);
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(issueDate));
  const client = project.clientId
    ? await findClientById(context.db, context.organizationId, project.clientId)
    : null;
  let notes = input.notes?.trim() || null;
  if (!notes && project.clientId) {
    const contacts = await listContactsForClient(context, project.clientId);
    const billingContact = pickBillingClientContact(contacts);
    if (billingContact) {
      notes = `Bill to: ${billingContact.name}`;
    }
  }
  const orgDefaultId = await resolveOrgDefaultPaymentTermIdForContext(context);
  const paymentTermId = resolveArPaymentTermId({
    explicitId: input.paymentTermId,
    contractTermId: contractPaymentTermId,
    clientDefaultId: client?.defaultPaymentTermId ?? null,
    orgDefaultId,
  });
  let paymentTermMeta = null;
  if (paymentTermId) {
    const termEntry = await getCatalogEntryById(
      context.db,
      context.organizationId,
      paymentTermId,
    );
    if (!termEntry || termEntry.kind !== 'payment_term' || !termEntry.isActive) {
      throw new NotFoundError('Payment term');
    }
    paymentTermMeta = parsePaymentTermMetadata(termEntry.metadata);
  }
  const dueDateRaw = suggestDueDateFromPaymentTerm({
    baseDateIso: issueDate,
    dueDate: input.dueDate,
    term: paymentTermMeta,
  });
  const dueDate = dueDateRaw ? businessDate(dueDateRaw) : null;

  const callerSetRetention =
    input.retentionAmount !== undefined || input.retentionPercent !== undefined;
  const retention = resolveRetentionCapture({
    totalAmount: toNumericString(amounts.totalAmount),
    currency,
    retentionAmount: input.retentionAmount,
    retentionPercent: callerSetRetention
      ? input.retentionPercent
      : (contractRetentionPercent ?? undefined),
    side: 'ar',
  });

  const billingRecordId = await insertBillingRecord(context.db, context.organizationId, {
    projectId: input.projectId,
    clientId: project.clientId ?? null,
    contractId,
    sourceKind: input.sourceKind ?? 'manual',
    sourceId: input.sourceId ?? null,
    kind: 'invoice',
    reference: await resolveAllocatedReference(context, 'billing_record', input.reference),
    issueDate,
    dueDate,
    paymentTermId,
    subtotalAmount: toNumericString(amounts.subtotalAmount),
    taxAmount: amounts.taxAmount ? toNumericString(amounts.taxAmount) : null,
    totalAmount: toNumericString(amounts.totalAmount),
    currency,
    retentionAmount: toNumericString(retention),
    retentionHeldRemaining: toNumericString(money('0', currency)),
    externalDocumentId: input.externalDocumentId ?? null,
    notes,
    voidsBillingRecordId: null,
    createdByUserId: context.userId,
  });

  await replaceBillingLines(
    context.db,
    context.organizationId,
    billingRecordId,
    buildLines(amounts, changeOrders),
  );

  await noteModuleUsage(context.db, context.organizationId, 'billing');

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_CREATED,
    entityType: 'billing_record',
    entityId: billingRecordId,
    after: {
      status: 'draft',
      projectId: input.projectId,
      contractId,
      totalAmount: toNumericString(amounts.totalAmount),
      currency,
      viaPermission: permission,
    },
  });

  if (input.finalize) {
    // Same financial finalization engine; capability already asserted above.
    return finalizeBillingRecordWithPermission(context, billingRecordId, permission);
  }

  const created = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!created) throw new NotFoundError('Billing record');
  return created;
}

export { resolveCurrency };
