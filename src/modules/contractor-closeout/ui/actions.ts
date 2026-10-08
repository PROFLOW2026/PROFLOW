'use server';

import { revalidatePath } from 'next/cache';
import { ensureAgreementCloseout, reportWarrantyIssue } from '../application/closeout';
import { withOrgContext } from '@/shared/auth/session';

function revalidateHandover(projectId: string) {
  revalidatePath(`/projects/${projectId}/contractor-closeout`);
  revalidatePath(`/projects/${projectId}/contractor-warranty`);
  revalidatePath(`/projects/${projectId}/contractors`);
  revalidatePath(`/employee/projects/${projectId}/contractor-closeout`);
  revalidatePath(`/employee/projects/${projectId}/contractor-warranty`);
}

export async function ensureAgreementCloseoutAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const agreementId = String(formData.get('agreementId') ?? '');
  await withOrgContext((context) => ensureAgreementCloseout(context, { projectId, agreementId }));
  revalidateHandover(projectId);
}

export async function reportAgreementWarrantyAction(formData: FormData): Promise<void> {
  const projectId = String(formData.get('projectId') ?? '');
  const agreementId = String(formData.get('agreementId') ?? '');
  const title = String(formData.get('title') ?? '');
  await withOrgContext((context) => reportWarrantyIssue(context, { projectId, agreementId, title }));
  revalidateHandover(projectId);
}
