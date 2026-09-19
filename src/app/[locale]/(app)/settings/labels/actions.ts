'use server';

import { revalidatePath } from 'next/cache';
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
  try {
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;

    if (!name?.trim()) return { error: 'Label name is required' };

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
    return { ok: true, message: 'Label created' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create label' };
  }
}

export async function updateLabelAction(
  _prev: LabelActionState,
  formData: FormData,
): Promise<LabelActionState> {
  try {
    const id = formData.get('id') as string | null;
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;

    if (!id) return { error: 'Label ID is required' };
    if (!name?.trim()) return { error: 'Label name is required' };

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
    return { ok: true, message: 'Label updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update label' };
  }
}

export async function archiveLabelAction(
  _prev: LabelActionState,
  formData: FormData,
): Promise<LabelActionState> {
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';

    if (!id) return { error: 'Label ID is required' };

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
    return { ok: true, message: restore ? 'Label restored' : 'Label archived' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update label' };
  }
}
