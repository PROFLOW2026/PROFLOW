'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { taskTemplates, taskTemplateItems } from '@drizzle/schema';
import { eq, and } from 'drizzle-orm';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';

export type TemplateActionState = { ok?: boolean; error?: string; message?: string };

export async function createTaskTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const priority = (formData.get('priority') as string | null) ?? 'none';
    // checklist items: checklistItem_0, checklistItem_1, ...
    const checklistItems: string[] = [];
    for (let i = 0; ; i++) {
      const item = formData.get(`checklistItem_${i}`) as string | null;
      if (item === null) break;
      if (item.trim()) checklistItems.push(item.trim());
    }

    if (!title?.trim()) return { error: 'Template title is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      const [template] = await context.db
        .insert(taskTemplates)
        .values({
          organizationId: context.organizationId,
          title: title.trim(),
          description: description?.trim() || null,
          priority: priority as 'none' | 'low' | 'medium' | 'high' | 'urgent',
        })
        .returning({ id: taskTemplates.id });

      if (!template) throw new Error('Failed to create task template');

      if (checklistItems.length > 0) {
        await context.db.insert(taskTemplateItems).values(
          checklistItems.map((item, idx) => ({
            templateId: template.id,
            organizationId: context.organizationId,
            title: item,
            sortKey: String(idx).padStart(8, '0'),
          })),
        );
      }

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'task_template',
        entityId: template.id,
        after: { title: title.trim(), priority, checklistCount: checklistItems.length },
      });
    });

    revalidatePath('/settings/task-templates');
    return { ok: true, message: 'Task template created' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create template' };
  }
}

export async function updateTaskTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    const id = formData.get('id') as string | null;
    const title = formData.get('title') as string | null;
    const description = formData.get('description') as string | null;
    const priority = (formData.get('priority') as string | null) ?? 'none';

    if (!id) return { error: 'Template ID is required' };
    if (!title?.trim()) return { error: 'Template title is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      await context.db
        .update(taskTemplates)
        .set({
          title: title.trim(),
          description: description?.trim() || null,
          priority: priority as 'none' | 'low' | 'medium' | 'high' | 'urgent',
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskTemplates.id, id),
            eq(taskTemplates.organizationId, context.organizationId),
          ),
        );
    });

    revalidatePath('/settings/task-templates');
    return { ok: true, message: 'Template updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update template' };
  }
}

export async function archiveTaskTemplateAction(
  _prev: TemplateActionState,
  formData: FormData,
): Promise<TemplateActionState> {
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';

    if (!id) return { error: 'Template ID is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASK_TEMPLATES_MANAGE);

      await context.db
        .update(taskTemplates)
        .set({
          isArchived: !restore,
          archivedAt: restore ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(taskTemplates.id, id),
            eq(taskTemplates.organizationId, context.organizationId),
          ),
        );
    });

    revalidatePath('/settings/task-templates');
    return { ok: true, message: restore ? 'Template restored' : 'Template archived' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update template' };
  }
}
