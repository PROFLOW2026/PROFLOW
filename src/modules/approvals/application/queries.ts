import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findApprovalRequestById,
  listApprovalRequestsForOrg,
  listPendingApprovalItems,
} from '../data/approvals.repository';
import {
  listApprovalRequestsSchema,
  type ListApprovalRequestsInput,
} from '../validation/schemas';
import type { PendingApprovalItem } from '../domain/types';

/**
 * Pending inbox for Command Center and Approvals UI.
 * Requires approvals.read.
 */
export async function listPendingApprovals(
  context: OrgContext,
  options: { readonly limit?: number } = {},
): Promise<PendingApprovalItem[]> {
  assertPermission(context, PERMISSIONS.APPROVALS_READ);
  return listPendingApprovalItems(context.db, context.organizationId, options);
}

export async function listApprovalRequests(context: OrgContext, raw: ListApprovalRequestsInput = {}) {
  assertPermission(context, PERMISSIONS.APPROVALS_READ);

  const parsed = listApprovalRequestsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listApprovalRequestsForOrg(context.db, context.organizationId, parsed.data);
}

export async function getApprovalRequest(context: OrgContext, requestId: string) {
  assertPermission(context, PERMISSIONS.APPROVALS_READ);
  const row = await findApprovalRequestById(context.db, context.organizationId, requestId);
  if (!row) throw new NotFoundError('Approval request');
  return row;
}
