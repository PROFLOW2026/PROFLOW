'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import {
  loadProjectProgressView,
  setProjectProgressSource,
  type ProjectProgressSource,
  type ProjectProgressView,
} from '@/modules/projects/application/project-progress-mode';

export type ProjectProgressSnapshot = {
  source: ProjectProgressSource;
  storedPercent: string | null;
  displayedPercent: number | null;
  contributingCount: number;
  doneCount: number;
};

function toSnapshot(view: ProjectProgressView): ProjectProgressSnapshot {
  return {
    source: view.source,
    storedPercent: view.storedPercent,
    displayedPercent: view.displayedPercent,
    contributingCount: view.contributingCount,
    doneCount: view.doneCount,
  };
}

export async function loadProjectProgressViewAction(
  projectId: string,
): Promise<ProjectProgressSnapshot | null> {
  return withOrgContext(async (context) => {
    const view = await loadProjectProgressView(context.db, context.organizationId, projectId);
    return view ? toSnapshot(view) : null;
  });
}

export async function setProjectProgressSourceAction(
  projectId: string,
  source: ProjectProgressSource,
): Promise<ProjectProgressSnapshot> {
  const snapshot = await withOrgContext(async (context) => {
    const view = await setProjectProgressSource(context, projectId, source);
    return toSnapshot(view);
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/jobs/${projectId}`);
  return snapshot;
}
