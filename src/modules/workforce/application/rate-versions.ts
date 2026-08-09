import { addDays, businessDate, isBefore } from '@/shared/dates';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findEmployeeById } from '../data/employees.repository';
import {
  closeOpenRateVersionBefore,
  insertLaborCostComponent,
  insertRateVersion,
  listComponentsByRateVersion,
  listRateVersionsByEmployee,
} from '../data/rate-versions.repository';
import type { LaborCostComponentRecord, RateVersionRecord } from '../domain/types';
import { createRateVersionSchema, type CreateRateVersionInput } from '../validation/schemas';

export interface RateVersionDetail extends RateVersionRecord {
  readonly components: readonly LaborCostComponentRecord[];
}

export async function listRateHistory(
  context: OrgContext,
  employeeId: string,
): Promise<RateVersionDetail[]> {
  assertPermission(context, PERMISSIONS.WORKFORCE_READ);

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

export async function createRateVersion(
  context: OrgContext,
  rawInput: CreateRateVersionInput,
): Promise<RateVersionDetail> {
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);

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
  const openVersion = existingVersions.find((version) => version.validTo === null);

  if (openVersion) {
    const openFrom = businessDate(openVersion.validFrom);
    if (!isBefore(openFrom, validFrom)) {
      throw new ValidationError([
        {
          path: 'validFrom',
          message: 'A new rate must start after the current open rate begins.',
        },
      ]);
    }

    await closeOpenRateVersionBefore(context.db, {
      organizationId: context.organizationId,
      rateVersionId: openVersion.id,
      validTo: addDays(validFrom, -1),
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

  return { ...rateVersion, components };
}
