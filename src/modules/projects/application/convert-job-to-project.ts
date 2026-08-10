import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  CONVERT_REQUIRES_REVENUE_BASIS_MESSAGE_KEY,
  canConvertJobToProject,
} from '../domain/job-pricing';
import { findOriginalValueEvent } from '../domain/contract-value';
import type { ProjectRecord } from '../domain/types';
import {
  findPrimaryContractByProject,
  listContractValueEvents,
} from '../data/contracts.repository';
import { findProjectById, updateProjectById } from '../data/projects.repository';
import {
  convertJobToProjectSchema,
  type ConvertJobToProjectInput,
} from '../validation/schemas';

/**
 * Converts a job into a classic project UX without losing financial history.
 *
 * RULE: flip `work_kind` to `project` and clear `pricing_mode` (classic = null).
 * Contracts, expenses, billing, time, and documents stay on the same row.
 *
 * RULE: blocked unless a managed revenue basis already exists (fixed price /
 * primary contract managed original / CCV `original` event). Open-price convert
 * would clear `pricing_mode` and invent fake 0 − cost loss in compose.
 */
export async function convertJobToProject(
  context: OrgContext,
  rawInput: ConvertJobToProjectInput,
): Promise<ProjectRecord> {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

  const parsed = convertJobToProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findProjectById(context.db, context.organizationId, parsed.data.jobId);
  if (!existing) throw new NotFoundError('Job');
  assertSameOrganization(context, existing, 'Job');

  if (existing.workKind !== 'job') {
    throw new DomainRuleError(
      'Only jobs can be converted to projects',
      'jobs.convert.notAJob',
      { jobId: existing.id, workKind: existing.workKind },
    );
  }

  const contract = await findPrimaryContractByProject(
    context.db,
    context.organizationId,
    existing.id,
  );
  const events = contract
    ? await listContractValueEvents(context.db, context.organizationId, contract.id)
    : [];
  const hasOriginalValueEvent = findOriginalValueEvent(events) != null;
  const hasManagedOriginalNet = Boolean(contract?.originalValueAmount);

  if (
    !canConvertJobToProject({
      workKind: existing.workKind,
      pricingMode: existing.pricingMode,
      hasPrimaryContract: Boolean(contract),
      hasManagedOriginalNet,
      hasOriginalValueEvent,
    })
  ) {
    throw new DomainRuleError(
      'Cannot convert a job without a managed revenue basis. Set a fixed price first.',
      CONVERT_REQUIRES_REVENUE_BASIS_MESSAGE_KEY,
      {
        jobId: existing.id,
        pricingMode: existing.pricingMode,
        hasPrimaryContract: Boolean(contract),
        hasManagedOriginalNet,
        hasOriginalValueEvent,
      },
    );
  }

  const updated = await updateProjectById(context.db, context.organizationId, existing.id, {
    workKind: 'project',
    pricingMode: null,
  });

  if (!updated) throw new NotFoundError('Job');

  await recordAuditEvent(context, {
    action: 'project.updated',
    entityType: 'project',
    entityId: updated.id,
    before: { workKind: existing.workKind, pricingMode: existing.pricingMode },
    after: {
      workKind: updated.workKind,
      pricingMode: updated.pricingMode,
      convertedFromJob: true,
    },
  });

  return updated;
}
