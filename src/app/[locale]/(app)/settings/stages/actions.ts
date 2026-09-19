'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
// eslint-disable-next-line no-restricted-imports
import { projectStageDefinitions } from '@drizzle/schema';
// eslint-disable-next-line no-restricted-imports
import { eq, and, sql } from 'drizzle-orm';
import { recordAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';

export type StageActionState = { ok?: boolean; error?: string; message?: string };

export async function createStageAction(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  try {
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;
    const workKindFilter = formData.get('workKindFilter') as string | null;

    if (!name?.trim()) return { error: 'Stage name is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.STAGES_MANAGE);

      // Compute next position
      const existing = await context.db
        .select({ position: projectStageDefinitions.position })
        .from(projectStageDefinitions)
        .where(eq(projectStageDefinitions.organizationId, context.organizationId))
        .orderBy(sql`${projectStageDefinitions.position} DESC`)
        .limit(1);

      const nextPosition = (existing[0]?.position ?? -1) + 1;

      await context.db.insert(projectStageDefinitions).values({
        organizationId: context.organizationId,
        name: name.trim(),
        color: color || null,
        position: nextPosition,
        workKindFilter:
          workKindFilter && workKindFilter !== 'all' ? workKindFilter : null,
      });

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_stage_definition',
        entityId: null,
        after: { name: name.trim(), color, workKindFilter },
      });
    });

    revalidatePath('/settings/stages');
    return { ok: true, message: 'Stage created successfully' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to create stage' };
  }
}

export async function updateStageAction(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  try {
    const id = formData.get('id') as string | null;
    const name = formData.get('name') as string | null;
    const color = formData.get('color') as string | null;
    const workKindFilter = formData.get('workKindFilter') as string | null;

    if (!id) return { error: 'Stage ID is required' };
    if (!name?.trim()) return { error: 'Stage name is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.STAGES_MANAGE);

      await context.db
        .update(projectStageDefinitions)
        .set({
          name: name.trim(),
          color: color || null,
          workKindFilter:
            workKindFilter && workKindFilter !== 'all' ? workKindFilter : null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectStageDefinitions.id, id),
            eq(projectStageDefinitions.organizationId, context.organizationId),
          ),
        );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_stage_definition',
        entityId: id,
        after: { name: name.trim(), color, workKindFilter },
      });
    });

    revalidatePath('/settings/stages');
    return { ok: true, message: 'Stage updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update stage' };
  }
}

export async function archiveStageAction(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  try {
    const id = formData.get('id') as string | null;
    const restore = formData.get('restore') === 'true';

    if (!id) return { error: 'Stage ID is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.STAGES_MANAGE);

      await context.db
        .update(projectStageDefinitions)
        .set({
          isArchived: !restore,
          archivedAt: restore ? null : new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(projectStageDefinitions.id, id),
            eq(projectStageDefinitions.organizationId, context.organizationId),
          ),
        );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_stage_definition',
        entityId: id,
        after: { archived: !restore },
      });
    });

    revalidatePath('/settings/stages');
    return { ok: true, message: restore ? 'Stage restored' : 'Stage archived' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to update stage' };
  }
}

export async function setDefaultStageAction(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  try {
    const id = formData.get('id') as string | null;
    if (!id) return { error: 'Stage ID is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.STAGES_MANAGE);

      // Unset existing default, then set new
      await context.db
        .update(projectStageDefinitions)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(eq(projectStageDefinitions.organizationId, context.organizationId));

      await context.db
        .update(projectStageDefinitions)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(
          and(
            eq(projectStageDefinitions.id, id),
            eq(projectStageDefinitions.organizationId, context.organizationId),
          ),
        );

      await recordAuditEvent(context, {
        action: AUDIT_ACTIONS.SETTINGS_UPDATED,
        entityType: 'project_stage_definition',
        entityId: id,
        after: { isDefault: true },
      });
    });

    revalidatePath('/settings/stages');
    return { ok: true, message: 'Default stage updated' };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to set default stage' };
  }
}

export async function reorderStagesAction(
  _prev: StageActionState,
  formData: FormData,
): Promise<StageActionState> {
  try {
    // orderedIds is comma-separated list of stage IDs in new order
    const orderedIds = (formData.get('orderedIds') as string | null)?.split(',') ?? [];

    if (orderedIds.length === 0) return { error: 'No stage IDs provided' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.STAGES_MANAGE);

      for (let i = 0; i < orderedIds.length; i++) {
        const stageId = orderedIds[i];
        if (!stageId) continue;
        await context.db
          .update(projectStageDefinitions)
          .set({ position: i, updatedAt: new Date() })
          .where(
            and(
              eq(projectStageDefinitions.id, stageId),
              eq(projectStageDefinitions.organizationId, context.organizationId),
            ),
          );
      }
    });

    revalidatePath('/settings/stages');
    return { ok: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to reorder stages' };
  }
}
