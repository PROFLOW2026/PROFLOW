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

/** Soft read for workforce create/apply and Owner framework UI. */
export async function getLaborCostDefaultsForApply(
  context: OrgContext,
): Promise<LaborCostDefaults> {
  assertAnyPermission(context, [
    PERMISSIONS.WORKFORCE_MANAGE,
    PERMISSIONS.WORKFORCE_COST_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
  ]);
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  return parseLaborCostDefaults(raw);
}

/**
 * Workforce Owner path: set org daily work hours (attendance / excess framework).
 * workingDaysPerMonth is optional legacy metadata — not required for monthly project cost.
 */
export async function saveOrgWorkFrameworkHours(
  context: OrgContext,
  input: {
    readonly standardHoursPerDay: string;
    readonly workingDaysPerMonth?: string | null;
    /** Explicit org work week; omit to leave existing; null clears to canonical default. */
    readonly workWeekdays?: readonly number[] | null;
  },
): Promise<LaborCostDefaults> {
  assertAnyPermission(context, [
    PERMISSIONS.WORKFORCE_MANAGE,
    PERMISSIONS.WORKFORCE_COST_MANAGE,
    PERMISSIONS.SETTINGS_MANAGE,
  ]);

  const hours = input.standardHoursPerDay.trim();
  if (!/^\d+(\.\d{1,4})?$/.test(hours) || Number(hours) <= 0) {
    throw new ValidationError([
      { path: 'standardHoursPerDay', message: 'Invalid hours per day' },
    ]);
  }

  const existing = await getLaborCostDefaultsForApply(context);
  const daysRaw = input.workingDaysPerMonth?.trim() ?? '';
  let workingDaysPerMonth = existing.workingDaysPerMonth;
  if (daysRaw !== '') {
    if (!/^\d+(\.\d{1,4})?$/.test(daysRaw) || Number(daysRaw) <= 0) {
      throw new ValidationError([
        { path: 'workingDaysPerMonth', message: 'Invalid working days per month' },
      ]);
    }
    workingDaysPerMonth = daysRaw;
  }

  let workWeekdays = existing.workWeekdays ?? null;
  if (input.workWeekdays !== undefined) {
    if (input.workWeekdays === null || input.workWeekdays.length === 0) {
      workWeekdays = null;
    } else {
      const cleaned = [
        ...new Set(input.workWeekdays.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)),
      ].sort((a, b) => a - b);
      if (cleaned.length === 0) {
        throw new ValidationError([
          { path: 'workWeekdays', message: 'Select at least one weekday' },
        ]);
      }
      workWeekdays = cleaned;
    }
  }

  return saveLaborCostDefaults(context, {
    ...existing,
    standardHoursPerDay: hours,
    workingDaysPerMonth,
    workWeekdays,
  });
}

export async function saveLaborCostDefaults(
  context: OrgContext,
  rawInput: unknown,
): Promise<LaborCostDefaults> {
  assertAnyPermission(context, [
    PERMISSIONS.SETTINGS_MANAGE,
    PERMISSIONS.WORKFORCE_MANAGE,
    PERMISSIONS.WORKFORCE_COST_MANAGE,
  ]);

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

  const previousRaw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    LABOR_COST_DEFAULTS_SETTING_KEY,
  );
  const previous = parseLaborCostDefaults(previousRaw);

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
      standardHoursPerDay: value.standardHoursPerDay,
      workingDaysPerMonth: value.workingDaysPerMonth,
    },
  });

  const frameworkChanged =
    previous.standardHoursPerDay !== value.standardHoursPerDay ||
    previous.workingDaysPerMonth !== value.workingDaysPerMonth;
  if (frameworkChanged) {
    // Daily framework unlocks daily/excess + hourly overtime warnings; backfill hourly snapshots.
    const { reconcileMissingTimeEntryCosts } = await import(
      '@/modules/workforce/application/time-entry-cost-reconcile'
    );
    await reconcileMissingTimeEntryCosts(context);
  }

  return value;
}
