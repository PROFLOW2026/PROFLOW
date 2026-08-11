import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { z } from 'zod';
import {
  BUSINESS_PROFILE_KEYS,
  resolveBusinessProfileKey,
  type BusinessProfileKey,
} from '../domain/business-profiles';
import { PROFESSION_PRESET_KEYS, type ProfessionPresetKey } from '../domain/profession-presets';
import { applyBusinessProfileConfig } from './apply-business-profile';
import { applyProfessionPreset } from './apply-profession-preset';

const applyPresetSchema = z.object({
  professionPreset: z.enum(PROFESSION_PRESET_KEYS).optional(),
  businessProfile: z.enum(BUSINESS_PROFILE_KEYS).optional(),
});

/**
 * Applies a starter preset to an existing organization.
 * Prefers business profiles (config presets); legacy profession keys still work.
 */
export async function applyOrganizationProfessionPreset(
  context: OrgContext,
  rawInput: { professionPreset?: string; businessProfile?: string },
): Promise<{ presetKey: ProfessionPresetKey | BusinessProfileKey; profileKey?: BusinessProfileKey }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = applyPresetSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const locale = context.organization.defaultLocale === 'en' ? 'en' : 'he-IL';
  const profileKey =
    resolveBusinessProfileKey(parsed.data.businessProfile) ??
    resolveBusinessProfileKey(parsed.data.professionPreset);

  if (profileKey) {
    const result = await applyBusinessProfileConfig(
      context.db,
      context.organizationId,
      profileKey,
      locale,
    );
    if (!result.applied) {
      throw new ValidationError([{ path: 'businessProfile', message: 'Unknown profile' }]);
    }
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: 'organization_business_profile',
      entityId: context.organizationId,
      after: { profileKey: result.profileKey },
    });
    return { presetKey: result.profileKey, profileKey: result.profileKey };
  }

  if (!parsed.data.professionPreset) {
    throw new ValidationError([{ path: 'businessProfile', message: 'Unknown preset' }]);
  }

  const result = await applyProfessionPreset(
    context.db,
    context.organizationId,
    parsed.data.professionPreset,
    locale,
  );

  if (!result.applied) {
    throw new ValidationError([{ path: 'professionPreset', message: 'Unknown preset' }]);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_profession_preset',
    entityId: context.organizationId,
    after: { presetKey: result.presetKey },
  });

  return { presetKey: result.presetKey };
}
