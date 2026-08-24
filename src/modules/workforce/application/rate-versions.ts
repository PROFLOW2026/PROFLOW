import { businessDate } from '@/shared/dates';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { planEmployeeSalarySave } from '../domain/employment-compensation';
import { findEmployeeById } from '../data/employees.repository';
import {
  closeOpenRateVersionBefore,
  deleteRateVersionById,
  insertLaborCostComponent,
  insertRateVersion,
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
  updateOpenRateVersionCompensation,
  updateRateVersionValidTo,
} from '../data/rate-versions.repository';
import type { LaborCostComponentRecord, RateVersionRecord } from '../domain/types';
import { createRateVersionSchema, type CreateRateVersionInput } from '../validation/schemas';
import { reconcileMissingTimeEntryCosts } from './time-entry-cost-reconcile';
import {
  assertCanManageWorkforceCost,
  assertCanReadWorkforceCost,
} from './workforce-cost-authz';

export interface RateVersionDetail extends RateVersionRecord {
  readonly components: readonly LaborCostComponentRecord[];
}

export async function listRateHistory(
  context: OrgContext,
  employeeId: string,
): Promise<RateVersionDetail[]> {
  assertCanReadWorkforceCost(context);

  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee) throw new NotFoundError('Employee');

  const versions = await listRateVersionsByEmployee(context.db, context.organizationId, employeeId);

  return Promise.all(
    versions.map(async (version) => ({
      ...version,
      components: await listComponentsByRateVersion(context.db, context.organizationId, version.id),
    })),
  );
}

/**
 * Owner/admin salary save: salary + effective-from is authoritative.
 * Retroactive corrections update the open compensation in place; forward
 * changes close the open version and insert a new one.
 */
export async function createRateVersion(
  context: OrgContext,
  rawInput: CreateRateVersionInput,
): Promise<RateVersionDetail> {
  assertCanManageWorkforceCost(context);

  const parsed = createRateVersionSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const employee = await findEmployeeById(context.db, context.organizationId, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');

  const currency = (input.currency ?? context.organization.baseCurrency).toUpperCase();
  const validFrom = businessDate(input.validFrom);

  const existingVersions = await listRateVersionsByEmployee(
    context.db,
    context.organizationId,
    input.employeeId,
  );
  const plan = planEmployeeSalarySave({ versions: existingVersions, validFrom });

  if (plan.kind === 'correct_open') {
    const before = existingVersions.find((version) => version.id === plan.openRateVersionId);
    if (!before) throw new NotFoundError('Rate version');

    if (plan.priorRateVersionId && plan.priorNewValidTo) {
      await updateRateVersionValidTo(context.db, {
        organizationId: context.organizationId,
        rateVersionId: plan.priorRateVersionId,
        validTo: plan.priorNewValidTo,
      });
    }

    for (const rateVersionId of plan.supersedeRateVersionIds) {
      const removed = await deleteRateVersionById(context.db, {
        organizationId: context.organizationId,
        rateVersionId,
      });
      if (removed) {
        await recordAuditEvent(context, {
          action: AUDIT_ACTIONS.RATE_VERSION_CREATED,
          entityType: 'rate_version',
          entityId: rateVersionId,
          before: removed,
          after: {
            superseded: true,
            employeeId: input.employeeId,
            replacedByOpenCorrection: true,
            validFrom: input.validFrom,
          },
        });
      }
    }

    const updated = await updateOpenRateVersionCompensation(context.db, {
      organizationId: context.organizationId,
      rateVersionId: plan.openRateVersionId,
      validFrom: input.validFrom,
      baseRate: input.baseRate,
      rateUnit: input.rateUnit,
      currency,
      burdenPercent: input.burdenPercent ?? null,
      workingDaysPerMonth:
        input.rateUnit === 'monthly'
          ? input.workingDaysPerMonth?.trim() || null
          : null,
      notes: input.notes ?? null,
    });
    if (!updated) throw new NotFoundError('Rate version');

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.RATE_VERSION_CREATED,
      entityType: 'rate_version',
      entityId: updated.id,
      before: {
        employeeId: input.employeeId,
        validFrom: before.validFrom,
        validTo: before.validTo,
        baseRate: before.baseRate,
        rateUnit: before.rateUnit,
        currency: before.currency,
        burdenPercent: before.burdenPercent,
      },
      after: {
        employeeId: input.employeeId,
        validFrom: updated.validFrom,
        validTo: updated.validTo,
        baseRate: updated.baseRate,
        rateUnit: updated.rateUnit,
        currency: updated.currency,
        burdenPercent: updated.burdenPercent,
        correction: true,
      },
    });

    await reconcileMissingTimeEntryCosts(context, { employeeId: input.employeeId });
    const { recomputeOpenMonthsAfterCompensationChange } = await import(
      './monthly-cost-recompute'
    );
    await recomputeOpenMonthsAfterCompensationChange(context, input.employeeId);

    return {
      ...updated,
      components: await listComponentsByRateVersion(
        context.db,
        context.organizationId,
        updated.id,
      ),
    };
  }

  if (plan.kind === 'forward_change') {
    await closeOpenRateVersionBefore(context.db, {
      organizationId: context.organizationId,
      rateVersionId: plan.openRateVersionId,
      validTo: plan.closeValidTo,
    });
  }

  const rateVersion = await insertRateVersion(context.db, {
    organizationId: context.organizationId,
    employeeId: input.employeeId,
    validFrom: input.validFrom,
    validTo: input.validTo ?? null,
    baseRate: input.baseRate,
    rateUnit: input.rateUnit,
    currency,
    burdenPercent: input.burdenPercent ?? null,
    workingDaysPerMonth:
      input.rateUnit === 'monthly' ? input.workingDaysPerMonth?.trim() || null : null,
    notes: input.notes ?? null,
  });

  const components: LaborCostComponentRecord[] = [];
  for (const component of input.components ?? []) {
    const row = await insertLaborCostComponent(context.db, {
      organizationId: context.organizationId,
      rateVersionId: rateVersion.id,
      key: component.key,
      label: component.label,
      basis: component.basis,
      amount: component.amount ?? null,
      percent: component.percent ?? null,
      currency: component.currency?.toUpperCase() ?? currency,
    });
    components.push(row);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.RATE_VERSION_CREATED,
    entityType: 'rate_version',
    entityId: rateVersion.id,
    after: {
      employeeId: input.employeeId,
      validFrom: input.validFrom,
      validTo: input.validTo ?? null,
      baseRate: input.baseRate,
      rateUnit: input.rateUnit,
      currency,
    },
  });

  await reconcileMissingTimeEntryCosts(context, { employeeId: input.employeeId });
  const { recomputeOpenMonthsAfterCompensationChange } = await import(
    './monthly-cost-recompute'
  );
  await recomputeOpenMonthsAfterCompensationChange(context, input.employeeId);

  return { ...rateVersion, components };
}
