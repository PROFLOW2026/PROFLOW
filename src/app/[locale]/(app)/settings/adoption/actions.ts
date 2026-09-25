'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';
import {
  previewOrgAdoption,
  applyOrgAdoption,
  type OrgAdoptionPreview,
} from '@/modules/tenancy/application/seed-org-defaults';
import { isOrgProfileType } from '../org-profile/org-profile-domain';

export type AdoptionActionState = {
  ok?: boolean;
  error?: string;
  preview?: OrgAdoptionPreview;
};

export async function previewOrgAdoptionAction(
  _prev: AdoptionActionState,
  formData: FormData,
): Promise<AdoptionActionState> {
  const t = await getTranslations('settings.adoptionPanel.errors');
  try {
    const orgProfileType = formData.get('orgProfileType') as string | null;

    if (!orgProfileType || !isOrgProfileType(orgProfileType)) {
      return { error: t('invalidProfileType') };
    }

    const preview = await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
      return previewOrgAdoption(context.db, context.organizationId, orgProfileType);
    });

    return { preview };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : t('previewFailed') };
  }
}

export async function applyOrgAdoptionAction(
  _prev: AdoptionActionState,
  formData: FormData,
): Promise<AdoptionActionState> {
  const t = await getTranslations('settings.adoptionPanel.errors');
  try {
    const orgProfileType = formData.get('orgProfileType') as string | null;

    if (!orgProfileType || !isOrgProfileType(orgProfileType)) {
      return { error: t('invalidProfileType') };
    }

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

      const result = await applyOrgAdoption(context.db, context.organizationId, orgProfileType);

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'org_adoption',
        entityId: null,
        after: {
          orgProfileType,
          stagesCreated: result.stagesCreated,
          modulesUpdated: result.modulesUpdated,
          profileTypeSet: result.profileTypeSet,
        },
      });
    });

    revalidatePath('/settings/stages');
    revalidatePath('/settings/org-profile');
    revalidatePath('/settings/modules');

    return { ok: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : t('adoptionFailed') };
  }
}
