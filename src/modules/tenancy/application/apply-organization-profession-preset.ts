import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { z } from 'zod';
import { PROFESSION_PRESET_KEYS, type ProfessionPresetKey } from '../domain/profession-presets';
import { applyProfessionPreset } from './apply-profession-preset';

const applyPresetSchema = z.object({
  professionPreset: z.enum(PROFESSION_PRESET_KEYS),
});

/** Applies a starter preset to an existing organization (additive catalogs). */
export async function applyOrganizationProfessionPreset(
  context: OrgContext,
  rawInput: { professionPreset: string },
): Promise<{ presetKey: ProfessionPresetKey }> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

  const parsed = applyPresetSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const locale = context.organization.defaultLocale === 'en' ? 'en' : 'he-IL';
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
