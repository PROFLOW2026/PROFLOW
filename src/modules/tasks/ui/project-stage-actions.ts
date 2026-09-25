'use server';

import { getTranslations } from 'next-intl/server';
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
  const tErrors = await getTranslations('settings.workflowActions.projectStage.errors');
  try {
    const projectId = formData.get('projectId') as string | null;
    const toStageId = formData.get('toStageId') as string | null;
    const notes = (formData.get('notes') as string | null)?.trim() || null;

    if (!projectId) return { error: tErrors('projectIdRequired') };
    if (!toStageId) return { error: tErrors('stageIdRequired') };

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);

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

      if (fromStageId === toStageId) return;

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
        throw new Error('stage_not_found');
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
    if (err instanceof Error && err.message === 'stage_not_found') {
      return { error: tErrors('stageNotFound') };
    }
    return { error: tErrors('transitionFailed') };
  }
}
