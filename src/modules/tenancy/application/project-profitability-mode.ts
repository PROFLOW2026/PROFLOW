import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import {
  DEFAULT_PROJECT_PROFITABILITY_MODE,
  PROJECT_PROFITABILITY_MODE_SETTING_KEY,
  isProjectProfitabilityMode,
  parseProjectProfitabilityMode,
  type ProjectProfitabilityMode,
} from '../domain/project-profitability-mode';

/** Soft read for financial compose / project UI - no settings permission required. */
export async function getProjectProfitabilityModeForOrg(
  context: OrgContext,
): Promise<ProjectProfitabilityMode> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    PROJECT_PROFITABILITY_MODE_SETTING_KEY,
  );
  return parseProjectProfitabilityMode(raw);
}

export async function saveProjectProfitabilityMode(
  context: OrgContext,
  raw: unknown,
): Promise<ProjectProfitabilityMode> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  if (!isProjectProfitabilityMode(raw)) {
    throw new ValidationError([
      { path: 'projectProfitabilityMode', message: 'Invalid project profitability mode' },
    ]);
  }

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    PROJECT_PROFITABILITY_MODE_SETTING_KEY,
    raw,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: null,
    after: { key: PROJECT_PROFITABILITY_MODE_SETTING_KEY, value: raw },
  });

  return raw;
}

export { DEFAULT_PROJECT_PROFITABILITY_MODE, PROJECT_PROFITABILITY_MODE_SETTING_KEY };
