import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  LABOR_COST_DEFAULTS_SETTING_KEY,
  emptyLaborCostDefaults,
  laborCostDefaultsSchema,
  parseLaborCostDefaults,
  type LaborCostDefaults,
} from '../domain/labor-cost-defaults';

export async function getLaborCostDefaults(context: OrgContext): Promise<LaborCostDefaults> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  return parseLaborCostDefaults(raw);
}

/** Used when creating employees / rate versions - soft read. */
export async function getLaborCostDefaultsForApply(
  context: OrgContext,
): Promise<LaborCostDefaults> {
  assertAnyPermission(context, [PERMISSIONS.WORKFORCE_MANAGE, PERMISSIONS.WORKFORCE_COST_MANAGE]);
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  return parseLaborCostDefaults(raw);
}

export async function saveLaborCostDefaults(
  context: OrgContext,
  rawInput: unknown,
): Promise<LaborCostDefaults> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = laborCostDefaultsSchema.safeParse(rawInput ?? emptyLaborCostDefaults());
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  for (const component of parsed.data.components) {
    if (component.basis === 'percent' && (component.percent == null || component.percent === '')) {
      throw new ValidationError([
        { path: 'components', message: 'Percent components need a percent value' },
      ]);
    }
    if (component.basis === 'fixed' && (component.amount == null || component.amount === '')) {
      throw new ValidationError([
        { path: 'components', message: 'Fixed components need an amount' },
      ]);
    }
  }

  const value = parseLaborCostDefaults(parsed.data);
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
    value,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'labor_cost_defaults',
    entityId: context.organizationId,
    after: {
      burdenPercent: value.burdenPercent,
      componentCount: value.components.length,
    },
  });

  return value;
}
