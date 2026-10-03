'use server';

import { revalidatePath } from 'next/cache';
import { requireExternalContext } from '@/modules/contractor-access';
import { projectFileDeps } from '@/modules/evidence/server';
import { acknowledgeDrawingRevision, acknowledgeSharedDocument } from '@/modules/project-plans';
import { plansActionError, type PlansActionResult } from './action-result';

export async function acknowledgeDrawingRevisionAction(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly drawingId: string;
  readonly revisionId: string;
}): Promise<PlansActionResult<{ acknowledged: boolean }>> {
  try {
    const context = await requireExternalContext();
    const result = await acknowledgeDrawingRevision(
      context,
      { organizationId: input.organizationId, revisionId: input.revisionId },
      projectFileDeps,
    );
    revalidatePath(`/contractor/projects/${input.projectId}/plans`);
    revalidatePath(`/contractor/projects/${input.projectId}/plans/${input.drawingId}`);
    revalidatePath('/contractor');
    return { ok: true, data: result };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function acknowledgeSharedDocumentAction(input: {
  readonly organizationId: string;
  readonly projectId: string;
  readonly shareId: string;
}): Promise<PlansActionResult<{ acknowledged: boolean }>> {
  try {
    const context = await requireExternalContext();
    const result = await acknowledgeSharedDocument(
      context,
      { organizationId: input.organizationId, shareId: input.shareId },
      projectFileDeps,
    );
    revalidatePath(`/contractor/projects/${input.projectId}/documents`);
    revalidatePath('/contractor');
    return { ok: true, data: result };
  } catch (error) {
    return plansActionError(error);
  }
}
