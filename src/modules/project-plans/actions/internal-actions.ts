'use server';

import { revalidatePath } from 'next/cache';
import { withOrgContext } from '@/shared/auth/session';
import { projectFileDeps } from '@/modules/evidence/server';
import {
  addDrawingRevisionFromDocument,
  archiveDrawing,
  beginDrawingRevisionUpload,
  createDrawing,
  publishDrawingRevision,
  revokeDocumentShare,
  setDrawingDistribution,
  shareDocumentWithContractors,
  updateDrawing,
  withdrawDrawingRevision,
} from '@/modules/project-plans';
import { plansActionError, type PlansActionResult } from './action-result';

function revalidateProjectPlans(projectId: string, drawingId?: string) {
  revalidatePath(`/projects/${projectId}/plans`);
  if (drawingId) revalidatePath(`/projects/${projectId}/plans/${drawingId}`);
}

export async function createDrawingAction(input: {
  readonly projectId: string;
  readonly drawingNumber: string;
  readonly title: string;
  readonly discipline: string;
  readonly contractorVisibility?: string;
}): Promise<PlansActionResult<{ drawingId: string }>> {
  try {
    const result = await withOrgContext((context) =>
      createDrawing(context, {
        projectId: input.projectId,
        drawingNumber: input.drawingNumber,
        title: input.title,
        discipline: input.discipline as never,
        contractorVisibility: (input.contractorVisibility as never) ?? undefined,
      }),
    );
    revalidateProjectPlans(input.projectId);
    return { ok: true, data: result };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function publishDrawingRevisionAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly revisionId: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) => publishDrawingRevision(context, input.revisionId));
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function shareDocumentAction(input: {
  readonly projectId: string;
  readonly documentId: string;
  readonly audience: string;
  readonly agreementId?: string;
  readonly principalId?: string;
  readonly title?: string;
  readonly note?: string;
  readonly acknowledgementRequired?: boolean;
}): Promise<PlansActionResult<{ shareId: string }>> {
  try {
    const result = await withOrgContext((context) =>
      shareDocumentWithContractors(
        context,
        {
          projectId: input.projectId,
          documentId: input.documentId,
          audience: input.audience as never,
          agreementId: input.agreementId,
          principalId: input.principalId,
          title: input.title,
          note: input.note,
          acknowledgementRequired: input.acknowledgementRequired,
        },
        projectFileDeps,
      ),
    );
    revalidateProjectPlans(input.projectId);
    return { ok: true, data: result };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function revokeDocumentShareAction(input: {
  readonly projectId: string;
  readonly shareId: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) => revokeDocumentShare(context, input.shareId));
    revalidateProjectPlans(input.projectId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function beginDrawingRevisionUploadAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly revisionLabel: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly description?: string;
}): Promise<PlansActionResult<{ revisionId: string; uploadUrl: string }>> {
  try {
    const ticket = await withOrgContext((context) =>
      beginDrawingRevisionUpload(
        context,
        {
          drawingId: input.drawingId,
          revisionLabel: input.revisionLabel,
          fileName: input.fileName,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          description: input.description,
        },
        projectFileDeps,
      ),
    );
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true, data: { revisionId: ticket.revisionId, uploadUrl: ticket.uploadUrl } };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function addRevisionFromDocumentAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly revisionLabel: string;
  readonly documentId: string;
}): Promise<PlansActionResult<{ revisionId: string }>> {
  try {
    const result = await withOrgContext((context) =>
      addDrawingRevisionFromDocument(
        context,
        { drawingId: input.drawingId, revisionLabel: input.revisionLabel, documentId: input.documentId },
        projectFileDeps,
      ),
    );
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true, data: result };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function updateDrawingAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly title?: string;
  readonly contractorVisibility?: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) =>
      updateDrawing(context, {
        drawingId: input.drawingId,
        title: input.title,
        contractorVisibility: input.contractorVisibility as never,
      }),
    );
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function setDrawingDistributionAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly entries: readonly { readonly audience: 'agreement' | 'principal'; readonly agreementId?: string; readonly principalId?: string }[];
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) =>
      setDrawingDistribution(
        context,
        { drawingId: input.drawingId, entries: input.entries as Parameters<typeof setDrawingDistribution>[1]['entries'] },
        projectFileDeps,
      ),
    );
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function withdrawDrawingRevisionAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
  readonly revisionId: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) => withdrawDrawingRevision(context, input.revisionId));
    revalidateProjectPlans(input.projectId, input.drawingId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}

export async function archiveDrawingAction(input: {
  readonly projectId: string;
  readonly drawingId: string;
}): Promise<PlansActionResult> {
  try {
    await withOrgContext((context) => archiveDrawing(context, input.drawingId));
    revalidateProjectPlans(input.projectId);
    return { ok: true };
  } catch (error) {
    return plansActionError(error);
  }
}
