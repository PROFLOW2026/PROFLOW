'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
// eslint-disable-next-line no-restricted-imports
import { projectTemplates, projectTemplateStages } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, and } from 'drizzle-orm';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';
import { duplicateUwmProjectTemplate } from '@/modules/tasks';

export type ProjectTemplateActionState = { ok?: boolean; error?: string; message?: string };

export async function createProjectTemplateAction(
  _prev: ProjectTemplateActionState,
  formData: FormData,
): Promise<ProjectTemplateActionState> {
  try {
    const name = formData.get('name') as string | null;
    const description = formData.get('description') as string | null;
    const orgProfileType = formData.get('orgProfileType') as string | null;

    if (!name?.trim()) return { error: 'Template name is required' };

    // Parse stages: stageName_0, stageName_1 ...
    const stageNames: string[] = [];
    for (let i = 0; ; i++) {
      const n = formData.get(`stageName_${i}`) as string | null;
      if (n === null) break;
      if (n.trim()) stageNames.push(n.trim());
    }

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);

      const [template] = await context.db
        .insert(projectTemplates)
        .values({
          organizationId: context.organizationId,
          name: name.trim(),
          description: description?.trim() || null,
          orgProfileType: orgProfileType?.trim() || null,
        })
        .returning({ id: projectTemplates.id });

      if (!template) throw new Error('Failed to create project template');

      if (stageNames.length > 0) {
        await context.db.insert(projectTemplateStages).values(
          stageNames.map((stageName, idx) => ({
            templateId: template.id,
            organizationId: context.organizationId,
            name: stageName,
            position: idx,
          })),
        );
      }

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_template',
        entityId: template.id,
        after: { name: name.trim(), stageCount: stageNames.length },
      });
    });

    revalidatePath('/settings/project-templates');
    return { ok: true, message: 'Project template created' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create template' };
  }
}

export async function updateProjectTemplateAction(
  _prev: ProjectTemplateActionState,
  formData: FormData,
): Promise<ProjectTemplateActionState> {
  try {
    const id = formData.get('id') as string | null;
    const name = formData.get('name') as string | null;
    const description = formData.get('description') as string | null;
    const orgProfileType = formData.get('orgProfileType') as string | null;

    if (!id) return { error: 'Template ID is required' };
    if (!name?.trim()) return { error: 'Template name is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);

      await context.db
        .update(projectTemplates)
        .set({
          name: name.trim(),
          description: description?.trim() || null,
          orgProfileType: orgProfileType?.trim() || null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectTemplates.id, id),
            eq(projectTemplates.organizationId, context.organizationId),
          ),
        );
    });

    revalidatePath('/settings/project-templates');
    return { ok: true, message: 'Template updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update template' };
  }
}

export async function duplicateProjectTemplateAction(
  _prev: ProjectTemplateActionState,
  formData: FormData,
): Promise<ProjectTemplateActionState> {
  try {
    const id = formData.get('id') as string | null;
    if (!id) return { error: 'Template ID is required' };

    await withOrgContext(async (context) => {
      const duplicated = await duplicateUwmProjectTemplate(context, id);
      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_template',
        entityId: duplicated.id,
        after: { duplicatedFrom: id, name: duplicated.name },
      });
    });

    revalidatePath('/settings/project-templates');
    return { ok: true, message: 'Template duplicated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to duplicate template' };
  }
}

export async function archiveProjectTemplateAction(
  _prev: ProjectTemplateActionState,
  formData: FormData,
): Promise<ProjectTemplateActionState> {
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';

    if (!id) return { error: 'Template ID is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROJECT_TEMPLATES_MANAGE);

      await context.db
        .update(projectTemplates)
        .set({
          isArchived: !restore,
          archivedAt: restore ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectTemplates.id, id),
            eq(projectTemplates.organizationId, context.organizationId),
          ),
        );
    });

    revalidatePath('/settings/project-templates');
    return { ok: true, message: restore ? 'Template restored' : 'Template archived' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update template' };
  }
}
