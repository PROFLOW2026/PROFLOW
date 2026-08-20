import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ValidationError } from '@/shared/errors';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '../data/organization-settings.repository';
import { isOptionalModuleKey } from '../domain/types';
import {
  UNUSED_CAPABILITY_DISMISSALS_SETTING_KEY,
  parseUnusedCapabilityDismissals,
} from '../domain/unused-capability-suggestions';

export async function getUnusedCapabilityDismissals(
  context: OrgContext,
): Promise<readonly string[]> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    UNUSED_CAPABILITY_DISMISSALS_SETTING_KEY,
  );
  return parseUnusedCapabilityDismissals(raw);
}

export async function dismissUnusedCapabilitySuggestion(
  context: OrgContext,
  moduleKey: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  if (!isOptionalModuleKey(moduleKey)) {
    throw new ValidationError([{ path: 'moduleKey', message: 'Unknown module' }]);
  }

  const current = await getUnusedCapabilityDismissals(context);
  if (current.includes(moduleKey)) return;

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    UNUSED_CAPABILITY_DISMISSALS_SETTING_KEY,
    [...current, moduleKey],
  );
}
