'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { taskLabels } from '@drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';

export type LabelActionState = { ok?: boolean; error?: string; message?: string };

export async function createLabelAction(
  _prev: LabelActionState,
  formData: FormData,
): Promise<LabelActionState> {
  const tErrors = await getTranslations('settings.workflowActions.labels.errors');
  const tSuccess = await getTranslations('settings.workflowActions.labels.success');
  try {
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;

    if (!name?.trim()) return { error: tErrors('nameRequired') };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      await context.db.insert(taskLabels).values({
        organizationId: context.organizationId,
        name: name.trim(),
        color: color || null,
      });

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'task_label',
        entityId: null,
        after: { name: name.trim(), color },
      });
    });

    revalidatePath('/settings/labels');
    return { ok: true, message: tSuccess('created') };
  } catch {
    return { error: tErrors('createFailed') };
  }
}

export async function updateLabelAction(
  _prev: LabelActionState,
  formData: FormData,
): Promise<LabelActionState> {
  const tErrors = await getTranslations('settings.workflowActions.labels.errors');
  const tSuccess = await getTranslations('settings.workflowActions.labels.success');
  try {
    const id = formData.get('id') as string | null;
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;

    if (!id) return { error: tErrors('idRequired') };
    if (!name?.trim()) return { error: tErrors('nameRequired') };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      await context.db
        .update(taskLabels)
        .set({ name: name.trim(), color: color || null, updatedAt: new Date() })
        .where(
          and(
            eq(taskLabels.id, id),
            eq(taskLabels.organizationId, context.organizationId),
          ),
        );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'task_label',
        entityId: id,
        after: { name: name.trim(), color },
      });
    });

    revalidatePath('/settings/labels');
    return { ok: true, message: tSuccess('updated') };
  } catch {
    return { error: tErrors('updateFailed') };
  }
}

export async function archiveLabelAction(
  _prev: LabelActionState,
  formData: FormData,
): Promise<LabelActionState> {
  const tErrors = await getTranslations('settings.workflowActions.labels.errors');
  const tSuccess = await getTranslations('settings.workflowActions.labels.success');
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';

    if (!id) return { error: tErrors('idRequired') };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      await context.db
        .update(taskLabels)
        .set({
          isArchived: !restore,
          archivedAt: restore ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskLabels.id, id),
            eq(taskLabels.organizationId, context.organizationId),
          ),
        );
    });

    revalidatePath('/settings/labels');
    return { ok: true, message: restore ? tSuccess('restored') : tSuccess('archived') };
  } catch {
    return { error: tErrors('updateFailed') };
  }
}
