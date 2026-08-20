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
  EXPERIENCE_COMPLEXITY_SETTING_KEY,
  isExperienceComplexityKey,
  parseExperienceComplexity,
  type ExperienceComplexityKey,
} from '../domain/experience-complexity';

/** Soft read for shell — no settings permission required. Missing → full (backward safe). */
export async function getExperienceComplexityForOrg(
  context: OrgContext,
): Promise<ExperienceComplexityKey> {
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    EXPERIENCE_COMPLEXITY_SETTING_KEY,
  );
  return parseExperienceComplexity(raw) ?? 'full';
}

export async function saveExperienceComplexity(
  context: OrgContext,
  raw: unknown,
): Promise<ExperienceComplexityKey> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  if (typeof raw !== 'string' || !isExperienceComplexityKey(raw)) {
    throw new ValidationError([{ path: 'complexity', message: 'Invalid experience complexity' }]);
  }

  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    EXPERIENCE_COMPLEXITY_SETTING_KEY,
    raw,
  );

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: null,
    after: { key: EXPERIENCE_COMPLEXITY_SETTING_KEY, value: raw },
  });

  return raw;
}
