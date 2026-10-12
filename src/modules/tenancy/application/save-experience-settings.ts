'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { withOrgContext } from '@/shared/auth/session';
import { canManageSection } from '@/app/[locale]/(app)/settings/_lib/access';
import { upsertOrganizationSettingValue } from '../data/organization-settings.repository';
import {
  CAPABILITY_CUSTOMIZATION_MODES,
  CAPABILITY_MODE_SETTING_KEY,
} from '../domain/capability-overrides';
import {
  EXPERIENCE_FAMILY_KEYS,
  EXPERIENCE_FAMILY_SETTING_KEY,
  EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
} from '../domain/experience-family';
import { parseOverridesFormData } from '../domain/experience-ui-registry';
import { loadShellOrgSettings } from './shell-org-settings';

/** Presentation-only: family, UI mode, and toggle overrides — never business profile or modules. */
const saveExperienceSchema = z.object({
  family: z.enum(EXPERIENCE_FAMILY_KEYS),
  capabilityMode: z.enum(CAPABILITY_CUSTOMIZATION_MODES),
});

export async function saveExperienceSettingsAction(formData: FormData): Promise<{ ok: boolean }> {
  const parsed = saveExperienceSchema.safeParse({
    family: formData.get('family'),
    capabilityMode: formData.get('capabilityMode'),
  });
  if (!parsed.success) return { ok: false };

  const overridesFromForm = parseOverridesFormData(formData);
  const resetUi = formData.get('resetUi') === '1';

  await withOrgContext(async (context) => {
    if (!canManageSection(context, 'features')) return;

    const { family, capabilityMode } = parsed.data;

    await upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      EXPERIENCE_FAMILY_SETTING_KEY,
      family,
    );
    await upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      CAPABILITY_MODE_SETTING_KEY,
      capabilityMode,
    );

    if (resetUi) {
      await upsertOrganizationSettingValue(
        context.db,
        context.organizationId,
        EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
        {},
      );
    } else if (Object.keys(overridesFromForm).length > 0) {
      const existing = await loadShellOrgSettings(context.db, context.organizationId);
      const merged = { ...existing.experienceUiOverrides, ...overridesFromForm };
      await upsertOrganizationSettingValue(
        context.db,
        context.organizationId,
        EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
        merged,
      );
    }
  });

  revalidatePath('/', 'layout');
  return { ok: true };
}

export async function resetExperienceUiOverridesAction(): Promise<{ ok: boolean }> {
  await withOrgContext(async (context) => {
    if (!canManageSection(context, 'features')) return;
    await upsertOrganizationSettingValue(
      context.db,
      context.organizationId,
      EXPERIENCE_UI_OVERRIDES_SETTING_KEY,
      {},
    );
  });
  revalidatePath('/', 'layout');
  return { ok: true };
}
