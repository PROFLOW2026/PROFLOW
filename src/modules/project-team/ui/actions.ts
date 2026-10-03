'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import {
  addProjectMember,
  setProjectMemberCapabilities,
  setProjectMemberStatus,
} from '../application/manage-project-team';
import { classifyProjectTeamError } from '../application/action-errors';
import { capabilityMessageKey } from '../domain/editor';

export interface ProjectTeamActionResult {
  readonly ok: boolean;
  readonly error?: string;
  /** Capabilities that blocked the change (anti-escalation), as message keys for the UI. */
  readonly blockedCapabilities?: readonly string[];
}

function revalidateTeam(projectId: string): void {
  revalidatePath(`/projects/${projectId}/team`);
  revalidatePath(`/employee/projects/${projectId}/team`);
  revalidatePath('/employee/projects');
}

async function toResult(error: unknown): Promise<ProjectTeamActionResult> {
  const classified = classifyProjectTeamError(error);
  if (!classified) throw error;
  const t = await getTranslations('projectTeam');
  const names = classified.capabilities.map((capability) =>
    t(`capabilities.${capabilityMessageKey(capability)}` as 'capabilities.project_view'),
  );
  return {
    ok: false,
    error: t(`errors.${classified.code}` as 'errors.notAllowed', {
      capabilities: names.length > 0 ? names.join(', ') : t('errors.someCapabilities'),
    }),
    blockedCapabilities: classified.capabilities,
  };
}

export async function addProjectMemberAction(input: {
  projectId: string;
  userId: string;
  title?: string | null;
  templateKey?: string | null;
  capabilities?: string[];
}): Promise<ProjectTeamActionResult> {
  try {
    await withOrgContext((context) =>
      addProjectMember(context, {
        projectId: input.projectId,
        userId: input.userId,
        title: input.title ?? null,
        templateKey: input.templateKey || null,
        capabilities: input.capabilities,
      }),
    );
  } catch (error) {
    return toResult(error);
  }
  revalidateTeam(input.projectId);
  return { ok: true };
}

export async function setProjectMemberCapabilitiesAction(input: {
  projectId: string;
  memberId: string;
  capabilities: string[];
  templateKey?: string | null;
  title?: string | null;
}): Promise<ProjectTeamActionResult> {
  try {
    await withOrgContext((context) =>
      setProjectMemberCapabilities(context, {
        projectId: input.projectId,
        memberId: input.memberId,
        capabilities: input.capabilities,
        templateKey: input.templateKey || null,
        title: input.title,
      }),
    );
  } catch (error) {
    return toResult(error);
  }
  revalidateTeam(input.projectId);
  return { ok: true };
}

export async function setProjectMemberStatusAction(input: {
  projectId: string;
  memberId: string;
  active: boolean;
}): Promise<ProjectTeamActionResult> {
  try {
    await withOrgContext((context) =>
      setProjectMemberStatus(context, {
        projectId: input.projectId,
        memberId: input.memberId,
        active: input.active,
      }),
    );
  } catch (error) {
    return toResult(error);
  }
  revalidateTeam(input.projectId);
  return { ok: true };
}
