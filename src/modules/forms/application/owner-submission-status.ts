import type { DbExecutor } from '@/shared/db/types';
import { listSubmissions } from '../data/forms.repository';
import type { FormOwnerType, FormSubmissionListItem } from '../domain/types';

/**
 * Tenant-scoped lookup used by other modules (e.g. work-order completion).
 * Does not assert forms.read — callers already authorized on their own surface.
 */
export async function hasSubmittedFormForOwner(
  db: DbExecutor,
  organizationId: string,
  input: {
    readonly ownerType: FormOwnerType;
    readonly ownerId: string;
    readonly templateId: string;
  },
): Promise<boolean> {
  const rows = await listSubmissions(db, organizationId, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    templateId: input.templateId,
    status: 'submitted',
    limit: 1,
  });
  return rows.length > 0;
}

export async function listFormSubmissionsForOwnerUnchecked(
  db: DbExecutor,
  organizationId: string,
  input: {
    readonly ownerType: FormOwnerType;
    readonly ownerId: string;
    readonly templateId?: string;
  },
): Promise<FormSubmissionListItem[]> {
  return listSubmissions(db, organizationId, {
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    templateId: input.templateId,
  });
}
