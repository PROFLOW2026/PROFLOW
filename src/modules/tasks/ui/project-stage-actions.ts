'use server';

import { withOrgContext } from '@/shared/auth/session';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { projectStageDefinitions, projectStageTransitions } from '@drizzle/schema';
import { eq, and, desc } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

export type StageTransitionActionState = { ok?: boolean; error?: string };

export async function transitionProjectStageAction(
  _prev: StageTransitionActionState,
  formData: FormData,
): Promise<StageTransitionActionState> {
  try {
    const projectId = formData.get('projectId') as string | null;
    const toStageId = formData.get('toStageId') as string | null;
    const notes = (formData.get('notes') as string | null)?.trim() || null;

    if (!projectId) return { error: 'Project ID is required' };
    if (!toStageId) return { error: 'Stage ID is required' };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

      // Fetch current stage (latest transition)
      const latest = await context.db
        .select({ toStageId: projectStageTransitions.toStageId })
        .from(projectStageTransitions)
        .where(
          and(
            eq(projectStageTransitions.projectId, projectId),
            eq(projectStageTransitions.organizationId, context.organizationId),
          ),
        )
        .orderBy(
          desc(projectStageTransitions.transitionedAt),
          desc(projectStageTransitions.id),
        )
        .limit(1);

      const fromStageId = latest[0]?.toStageId ?? null;

      // No-op if already on this stage
      if (fromStageId === toStageId) return;

      // Verify target stage belongs to org
      const stageExists = await context.db
        .select({ id: projectStageDefinitions.id })
        .from(projectStageDefinitions)
        .where(
          and(
            eq(projectStageDefinitions.id, toStageId),
            eq(projectStageDefinitions.organizationId, context.organizationId),
            eq(projectStageDefinitions.isArchived, false),
          ),
        )
        .limit(1);

      if (!stageExists.length) {
        throw new Error('Stage not found or archived');
      }

      await context.db.insert(projectStageTransitions).values({
        organizationId: context.organizationId,
        projectId,
        fromStageId,
        toStageId,
        transitionedAt: new Date(),
        transitionedByOrgMemberId: context.membershipId,
        notes,
      });
    });

    revalidatePath(`/projects/${projectId}`);
    return { ok: true };
  } catch (err: unknown) {
    return { error: err instanceof Error ? err.message : 'Failed to transition stage' };
  }
}
