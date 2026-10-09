'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  linkPlanningWorkItemToTask,
  unlinkPlanningWorkItemTask,
} from '@/modules/planning/application/link-planning-work-item-task';
import {
  archivePlanningWorkItem,
  upsertPlanningWorkItem,
} from '@/modules/planning/application/upsert-work-item';
import {
  PlanningDependencyError,
  removePlanningDependency,
  setPlanningDependency,
} from '@/modules/planning/application/set-dependency';
import { PlanningEligibilityError } from '@/modules/planning/domain/eligibility';
import { findProjectById } from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import {
  NotFoundError,
  mapServerActionError,
} from '@/shared/errors';
import {
  DEPENDENCY_CROSS_PROJECT_MESSAGE,
  DEPENDENCY_CYCLE_MESSAGE,
  DEPENDENCY_SELF_MESSAGE,
  DEPENDENCY_UNKNOWN_ITEM_MESSAGE,
} from '@/modules/planning/domain/dependencies';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export interface PlanningActionState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

async function mapPlanningError(error: unknown): Promise<PlanningActionState> {
  const tErrors = await getTranslations('errors');
  const tPlanning = await getTranslations('planning');
  if (error instanceof PlanningEligibilityError) {
    return { error: tPlanning('jobsOptOut') };
  }
  if (error instanceof PlanningDependencyError) {
    const dependencyKeyByMessage: Record<string, string> = {
      [DEPENDENCY_CYCLE_MESSAGE]: 'dependencyErrors.cycle',
      [DEPENDENCY_UNKNOWN_ITEM_MESSAGE]: 'dependencyErrors.unknownItem',
      [DEPENDENCY_SELF_MESSAGE]: 'dependencyErrors.self',
      [DEPENDENCY_CROSS_PROJECT_MESSAGE]: 'dependencyErrors.crossProject',
    };
    const shortKey = dependencyKeyByMessage[error.message];
    if (shortKey) {
      return { error: tPlanning(shortKey as 'dependencyErrors.cycle') };
    }
  }
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      planning: (key) => tPlanning(key as 'jobsOptOut'),
    },
  });
}

function formString(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function revalidateProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}?tab=schedule`);
}

// ─── Create ──────────────────────────────────────────────────────────────────

export async function createPlanningWorkItemAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  try {
    const projectId = formString(formData, 'projectId') ?? '';
    const name = formString(formData, 'name') ?? '';
    const kind = (formString(formData, 'kind') ?? 'task') as 'task' | 'milestone';
    const startDate = formString(formData, 'startDate') ?? null;
    const targetEndDate = formString(formData, 'targetEndDate') ?? null;
    const phaseId = formString(formData, 'phaseId') ?? null;

    const tPlanning = await getTranslations('settings.workflowActions.planning.errors');
    if (!name) {
      const nameRequired = tPlanning('nameRequired');
      return { error: nameRequired, fieldErrors: { name: nameRequired } };
    }

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await upsertPlanningWorkItem(
        {
          organizationId: context.organizationId,
          projectId,
          name,
          kind,
          startDate: startDate ?? undefined,
          targetEndDate: targetEndDate ?? undefined,
          actualEndDate: null,
          progressPercent: 0,
          phaseId: phaseId ?? undefined,
          workItemId: undefined,
          sortOrder: 0,
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

// ─── Update ──────────────────────────────────────────────────────────────────

export async function updatePlanningWorkItemAction(
  _prev: PlanningActionState,
  formData: FormData,
): Promise<PlanningActionState> {
  try {
    const projectId = formString(formData, 'projectId') ?? '';
    const workItemId = formString(formData, 'workItemId') ?? '';
    const name = formString(formData, 'name') ?? '';
    const startDate = formString(formData, 'startDate') ?? null;
    const targetEndDate = formString(formData, 'targetEndDate') ?? null;
    const progressPercentRaw = formString(formData, 'progressPercent');
    const progressPercent = progressPercentRaw != null ? Number(progressPercentRaw) : 0;
    const kind = (formString(formData, 'kind') ?? 'task') as 'task' | 'milestone';
    const phaseId = formString(formData, 'phaseId') ?? null;

    const tPlanning = await getTranslations('settings.workflowActions.planning.errors');
    if (!workItemId) return { error: tPlanning('workItemIdRequired') };
    if (!name) {
      const nameRequired = tPlanning('nameRequired');
      return { error: nameRequired, fieldErrors: { name: nameRequired } };
    }

    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await upsertPlanningWorkItem(
        {
          organizationId: context.organizationId,
          projectId,
          workItemId,
          name,
          kind,
          startDate: startDate ?? undefined,
          targetEndDate: targetEndDate ?? undefined,
          actualEndDate: null,
          progressPercent,
          phaseId: phaseId ?? undefined,
          sortOrder: 0,
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

// ─── Link / unlink UWM task ───────────────────────────────────────────────────

export async function linkPlanningWorkItemTaskAction(
  projectId: string,
  workItemId: string,
  taskId: string,
): Promise<PlanningActionState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      assertPermission(context, PERMISSIONS.TASKS_READ);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await linkPlanningWorkItemToTask(
        {
          organizationId: context.organizationId,
          projectId,
          workItemId,
          taskId: taskId.trim(),
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

export async function unlinkPlanningWorkItemTaskAction(
  projectId: string,
  workItemId: string,
): Promise<PlanningActionState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await unlinkPlanningWorkItemTask(
        {
          organizationId: context.organizationId,
          projectId,
          workItemId,
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

// ─── Archive ─────────────────────────────────────────────────────────────────

export async function archivePlanningWorkItemAction(
  projectId: string,
  workItemId: string,
): Promise<PlanningActionState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await archivePlanningWorkItem(
        {
          organizationId: context.organizationId,
          projectId,
          workItemId,
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

// ─── Dependency: Add ─────────────────────────────────────────────────────────

export async function setPlanningDependencyAction(
  projectId: string,
  predecessorId: string,
  successorId: string,
): Promise<PlanningActionState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await setPlanningDependency(
        {
          organizationId: context.organizationId,
          projectId,
          predecessorId,
          successorId,
          type: 'finish_to_start',
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}

// ─── Dependency: Remove ───────────────────────────────────────────────────────

export async function removePlanningDependencyAction(
  projectId: string,
  dependencyId: string,
): Promise<PlanningActionState> {
  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.PLANNING_WRITE);
      const project = await findProjectById(context.db, context.organizationId, projectId);
      if (!project) throw new NotFoundError('Project');

      await removePlanningDependency(
        {
          organizationId: context.organizationId,
          projectId,
          dependencyId,
          workKind: project.workKind as 'project' | 'job',
        },
        { db: context.db },
      );
    });

    revalidateProject(projectId);
    return { success: true };
  } catch (error) {
    return mapPlanningError(error);
  }
}
