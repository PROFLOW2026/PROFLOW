import { and, eq, inArray } from 'drizzle-orm';
import { billingRecords, projects, workOrderBillingSources } from '@drizzle/schema';
import { createBillingRecord } from '@/modules/billing';
import { assertCanAccessProject } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { isZeroMoney, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  composeWorkOrderBillingAmount,
  type WorkOrderBillingCompositionInput,
} from '../domain/work-order-billing';
import { createWorkOrderBillingSchema, type CreateWorkOrderBillingInput } from '../validation/schemas';

export interface CreateWorkOrderBillingResult {
  readonly billingRecordId: string;
  readonly alreadyBilled: boolean;
}

async function findLiveWorkOrderBilling(
  db: OrgContext['db'],
  organizationId: string,
  workOrderId: string,
): Promise<{ id: string; billingRecordId: string; status: string } | null> {
  const [row] = await db
    .select({
      id: workOrderBillingSources.id,
      billingRecordId: workOrderBillingSources.billingRecordId,
      status: billingRecords.status,
    })
    .from(workOrderBillingSources)
    .innerJoin(
      billingRecords,
      and(
        eq(billingRecords.id, workOrderBillingSources.billingRecordId),
        eq(billingRecords.organizationId, workOrderBillingSources.organizationId),
      ),
    )
    .where(
      and(
        eq(workOrderBillingSources.organizationId, organizationId),
        eq(workOrderBillingSources.workOrderId, workOrderId),
        inArray(billingRecords.status, ['draft', 'finalized']),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function createWorkOrderBilling(
  context: OrgContext,
  rawInput: CreateWorkOrderBillingInput,
): Promise<CreateWorkOrderBillingResult> {
  assertPermission(context, PERMISSIONS.SERVICE_MANAGE);
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = createWorkOrderBillingSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const [project] = await tx
      .select({
        id: projects.id,
        workKind: projects.workKind,
        currency: projects.currency,
        clientId: projects.clientId,
      })
      .from(projects)
      .where(
        and(eq(projects.id, input.workOrderId), eq(projects.organizationId, context.organizationId)),
      )
      .for('update')
      .limit(1);

    if (!project) throw new NotFoundError('Work order');
    await assertCanAccessProject(txContext, input.workOrderId);
    if (project.workKind !== 'work_order') {
      throw new DomainRuleError(
        'Only work orders can be billed from this flow',
        'service.billing.notWorkOrder',
      );
    }

    const existing = await findLiveWorkOrderBilling(tx, context.organizationId, input.workOrderId);
    if (existing) {
      throw new ConflictError(
        'This work order already has a live billing record',
        'service.billing.alreadyBilledError',
        { billingRecordId: existing.billingRecordId },
      );
    }

    const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
    const compositionInput: WorkOrderBillingCompositionInput = {
      currency,
      laborHours: input.laborHours,
      laborRate: input.laborRate,
      materialsAmount: input.materialsAmount,
      callOutFee: input.callOutFee,
      additionalCharges: input.additionalCharges,
      discountAmount: input.discountAmount,
      notes: input.notes,
    };
    const composition = composeWorkOrderBillingAmount(compositionInput);
    if (isZeroMoney(composition.netAmount)) {
      throw new DomainRuleError(
        'Work order billing amount must be greater than zero',
        'service.billing.zeroAmount',
      );
    }

    const issueDate = input.issueDate ?? todayInTimeZone(context.organization.timezone);
    const created = await createBillingRecord(txContext, {
      projectId: input.workOrderId,
      amount: toNumericString(composition.netAmount),
      currency,
      issueDate,
      notes: composition.notes,
    });

    await tx
      .update(billingRecords)
      .set({
        sourceKind: 'work_order',
        sourceId: input.workOrderId,
      })
      .where(
        and(
          eq(billingRecords.id, created.id),
          eq(billingRecords.organizationId, context.organizationId),
        ),
      );

    await tx.insert(workOrderBillingSources).values({
      organizationId: context.organizationId,
      workOrderId: input.workOrderId,
      billingRecordId: created.id,
      compositionJson: {
        laborAmount: composition.laborAmount.amount,
        materialsAmount: composition.materialsAmount.amount,
        callOutFee: composition.callOutFee.amount,
        additionalCharges: composition.additionalCharges.amount,
        discountAmount: composition.discountAmount.amount,
        netAmount: composition.netAmount.amount,
        currency,
        notes: composition.notes,
      },
    });

    return { billingRecordId: created.id, alreadyBilled: false };
  });
}

export async function getWorkOrderBillingLink(
  context: OrgContext,
  workOrderId: string,
): Promise<{ billingRecordId: string; status: string } | null> {
  assertPermission(context, PERMISSIONS.SERVICE_READ);
  await assertCanAccessProject(context, workOrderId);
  const live = await findLiveWorkOrderBilling(context.db, context.organizationId, workOrderId);
  if (!live) return null;
  return { billingRecordId: live.billingRecordId, status: live.status };
}
