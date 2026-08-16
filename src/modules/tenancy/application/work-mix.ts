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
  DEFAULT_WORK_MIX,
  WORK_MIX_SETTING_KEY,
  isWorkMix,
  parseWorkMix,
  type WorkMix,
} from '../domain/work-mix';

/** Soft read for shell / nav - no settings permission required. */
export async function getWorkMixForOrg(context: OrgContext): Promise<WorkMix> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    WORK_MIX_SETTING_KEY,
  );
  return parseWorkMix(raw);
}

export async function saveWorkMix(context: OrgContext, raw: unknown): Promise<WorkMix> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  if (!isWorkMix(raw)) {
    throw new ValidationError([{ path: 'workMix', message: 'Invalid work mix' }]);
  }

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    WORK_MIX_SETTING_KEY,
    raw,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: null,
    after: { key: WORK_MIX_SETTING_KEY, value: raw },
  });

  return raw;
}

export { DEFAULT_WORK_MIX, WORK_MIX_SETTING_KEY };
