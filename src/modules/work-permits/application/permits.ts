import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertCanAccessProject } from '@/modules/projects';
import { assertWorkPermitStatusTransition } from '../domain/status';
import type { WorkPermitRecord } from '../domain/types';
import {
  findWorkPermitById,
  insertWorkPermitDraft,
  listWorkPermitsForProject,
  updateWorkPermitStatus,
} from '../data/work-permits.repository';
import {
  createWorkPermitSchema,
  workPermitMutationSchema,
  type CreateWorkPermitInput,
  type WorkPermitMutationInput,
} from '../validation/schemas';
import {
  assertWorkPermitManage,
  assertWorkPermitRead,
  canManageWorkPermits,
} from './access';

function parseOrThrow<T>(result: { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } }): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export interface ProjectWorkPermitBoard {
  readonly items: readonly WorkPermitRecord[];
  readonly canManage: boolean;
}

export async function listProjectWorkPermits(
  context: OrgContext,
  input: { readonly projectId: string; readonly limit?: number },
): Promise<ProjectWorkPermitBoard> {
  assertWorkPermitRead(context);
  await assertCanAccessProject(context, input.projectId);
  const items = await listWorkPermitsForProject(
    context.db,
    context.organizationId,
    input.projectId,
    input.limit ?? 200,
  );
  return { items, canManage: canManageWorkPermits(context) };
}

export async function createWorkPermitDraft(
  context: OrgContext,
  raw: CreateWorkPermitInput,
): Promise<WorkPermitRecord> {
  assertWorkPermitManage(context);
  const input = parseOrThrow(createWorkPermitSchema.safeParse(raw));
  await assertCanAccessProject(context, input.projectId);

  return insertWorkPermitDraft(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    title: input.title,
    permitType: input.permitType,
    requestedByUserId: context.userId,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    notes: input.notes ?? null,
  });
}

async function transitionWorkPermit(
  context: OrgContext,
  raw: WorkPermitMutationInput,
  to: 'submitted' | 'approved' | 'rejected',
): Promise<WorkPermitRecord> {
  assertWorkPermitManage(context);
  const input = parseOrThrow(workPermitMutationSchema.safeParse(raw));
  await assertCanAccessProject(context, input.projectId);

  const existing = await findWorkPermitById(context.db, context.organizationId, input.workPermitId);
  if (!existing || existing.projectId !== input.projectId) throw new NotFoundError('Work permit');
  assertWorkPermitStatusTransition(existing.status, to);

  const decidedByUserId = to === 'approved' || to === 'rejected' ? context.userId : undefined;
  const updated = await updateWorkPermitStatus(context.db, {
    organizationId: context.organizationId,
    workPermitId: input.workPermitId,
    status: to,
    ...(decidedByUserId ? { decidedByUserId } : {}),
  });
  if (!updated) throw new NotFoundError('Work permit');
  return updated;
}

export async function submitWorkPermit(context: OrgContext, raw: WorkPermitMutationInput) {
  return transitionWorkPermit(context, raw, 'submitted');
}

export async function approveWorkPermit(context: OrgContext, raw: WorkPermitMutationInput) {
  return transitionWorkPermit(context, raw, 'approved');
}

export async function rejectWorkPermit(context: OrgContext, raw: WorkPermitMutationInput) {
  return transitionWorkPermit(context, raw, 'rejected');
}
