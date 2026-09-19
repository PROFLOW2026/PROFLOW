'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';
import { upsertOrganizationSettingValue } from '@/modules/tenancy';
import {
  ORG_PROFILE_TYPE_SETTING_KEY,
  TERMINOLOGY_OVERRIDE_SETTING_KEY,
} from './org-profile-domain';

export type OrgProfileActionState = { ok?: boolean; error?: string; message?: string };

export async function updateOrgProfileTypeAction(
  _prev: OrgProfileActionState,
  formData: FormData,
): Promise<OrgProfileActionState> {
  try {
    const orgProfileType = formData.get('orgProfileType') as string | null;

    if (!orgProfileType) return { error: 'Profile type is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

      await upsertOrganizationSettingValue(
        context.db,
        context.organizationId,
        ORG_PROFILE_TYPE_SETTING_KEY,
        orgProfileType,
      );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'org_profile_type',
        entityId: null,
        after: { orgProfileType },
      });
    });

    revalidatePath('/settings/org-profile');
    return { ok: true, message: 'Org profile type updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update profile type' };
  }
}

export async function updateTerminologyConfigAction(
  _prev: OrgProfileActionState,
  formData: FormData,
): Promise<OrgProfileActionState> {
  try {
    const terminology = {
      project: (formData.get('project') as string | null)?.trim() || null,
      task: (formData.get('task') as string | null)?.trim() || null,
      board: (formData.get('board') as string | null)?.trim() || null,
      stage: (formData.get('stage') as string | null)?.trim() || null,
      bucket: (formData.get('bucket') as string | null)?.trim() || null,
    };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);

      await upsertOrganizationSettingValue(
        context.db,
        context.organizationId,
        TERMINOLOGY_OVERRIDE_SETTING_KEY,
        terminology,
      );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'terminology_config',
        entityId: null,
        after: { terminology },
      });
    });

    revalidatePath('/settings/org-profile');
    return { ok: true, message: 'Terminology updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update terminology' };
  }
}
