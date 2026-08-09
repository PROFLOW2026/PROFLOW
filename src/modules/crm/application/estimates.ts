import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findEstimateById,
  findOpportunityById,
  insertEstimate,
  updateEstimateById,
} from '../data/crm.repository';
import type { EstimateRecord } from '../domain/types';
import {
  createEstimateSchema,
  updateEstimateSchema,
  type CreateEstimateInput,
  type UpdateEstimateInput,
} from '../validation/schemas';

export async function createEstimate(
  context: OrgContext,
  rawInput: CreateEstimateInput,
): Promise<EstimateRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = createEstimateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const opportunity = await findOpportunityById(
    context.db,
    context.organizationId,
    input.opportunityId,
  );
  if (!opportunity) throw new NotFoundError('Opportunity');

  const currency = (input.currency ?? opportunity.currency ?? context.organization.baseCurrency).toUpperCase();

  const estimate = await insertEstimate(context.db, {
    organizationId: context.organizationId,
    opportunityId: input.opportunityId,
    name: input.name,
    internalAmount: input.internalAmount ?? null,
    currency,
    notes: input.notes ?? null,
    status: input.status,
  });

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return estimate;
}

export async function updateEstimate(
  context: OrgContext,
  rawInput: UpdateEstimateInput,
): Promise<EstimateRecord> {
  assertPermission(context, PERMISSIONS.CRM_MANAGE);

  const parsed = updateEstimateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findEstimateById(context.db, context.organizationId, input.estimateId);
  if (!existing) throw new NotFoundError('Estimate');

  const updated = await updateEstimateById(context.db, context.organizationId, input.estimateId, {
    name: input.name,
    internalAmount: input.internalAmount === undefined ? undefined : input.internalAmount,
    currency: input.currency?.toUpperCase(),
    notes: input.notes === undefined ? undefined : input.notes,
    status: input.status,
  });
  if (!updated) throw new NotFoundError('Estimate');

  await noteModuleUsage(context.db, context.organizationId, 'crm');

  return updated;
}
