import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { ProjectRecord } from '../domain/types';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import {
  setJobFixedPriceSchema,
  type SetJobFixedPriceInput,
} from '../validation/schemas';
import { upsertPrimaryContractAmount } from './contract-amount';

export interface SetJobFixedPriceResult {
  readonly project: ProjectRecord;
  readonly netAmount: string;
}

/**
 * Scenario D path: open-price job → fixed price via managed contract upsert.
 * Uses existing {@link upsertPrimaryContractAmount} (opening reduction 0 until Agent 1 API lands).
 */
export async function setJobFixedPrice(
  context: OrgContext,
  rawInput: SetJobFixedPriceInput,
): Promise<SetJobFixedPriceResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);

  const parsed = setJobFixedPriceSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findProjectById(context.db, context.organizationId, input.jobId);
  if (!existing) throw new NotFoundError('Job');
  assertSameOrganization(context, existing, 'Job');

  if (existing.workKind !== 'job') {
    throw new DomainRuleError(
      'Fixed price can only be set on a job',
      'jobs.pricing.notAJob',
      { jobId: existing.id },
    );
  }

  const currency = (
    input.priceCurrency ??
    existing.currency ??
    context.organization.baseCurrency
  ).toUpperCase();

  const project =
    (await updateProjectById(context.db, context.organizationId, existing.id, {
      pricingMode: 'fixed',
      currency,
    })) ?? existing;

  const { netAmount } = await upsertPrimaryContractAmount(context, {
    projectId: existing.id,
    enteredAmount: input.priceAmount,
    currency,
    amountIncludesTax: input.amountIncludesTax ?? false,
    openingReductionAmount: null,
  });

  await recordAuditEvent(context, {
    action: 'project.updated',
    entityType: 'project',
    entityId: existing.id,
    before: { pricingMode: existing.pricingMode },
    after: { pricingMode: 'fixed', netAmount, currency, jobPriceSet: true },
  });

  const refreshed = await findProjectById(context.db, context.organizationId, existing.id);
  return { project: refreshed ?? project, netAmount };
}
