import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { queryMyWorkPage, type MyWorkPage, type MyWorkView } from '../data/my-work.repository';
import { findEmployeeByUserId } from '@/modules/workforce';
import type { Task } from '../domain/types';
import { resolveAccessibleWorkspaceIds } from './accessible-workspaces';

export type { MyWorkPage, MyWorkView };

export interface MyWorkOptions {
  readonly view: MyWorkView;
  /** Org-local YYYY-MM-DD; defaults from organization timezone when omitted. */
  readonly today?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Returns tasks for the caller's My Work views.
 *
 * Cross-workspace aggregation, scoped to caller-accessible workspaces.
 * Paginated.
 */
export async function getMyWork(
  context: OrgContext,
  options: MyWorkOptions,
): Promise<Task[]> {
  const page = await getMyWorkPage(context, options);
  return page.tasks;
}

export async function getMyWorkPage(
  context: OrgContext,
  options: MyWorkOptions,
): Promise<MyWorkPage> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const workspaceIds = await resolveAccessibleWorkspaceIds(context);

  const linkedEmployee =
    context.employeeApp?.employeeId != null
      ? { id: context.employeeApp.employeeId }
      : await findEmployeeByUserId(context.db, context.organizationId, context.userId);

  const today = options.today ?? todayInTimeZone(context.organization.timezone);

  return queryMyWorkPage(context.db, {
    orgMemberId: context.membershipId,
    assigneeEmployeeId: linkedEmployee?.id ?? null,
    organizationId: context.organizationId,
    workspaceIds,
    view: options.view,
    today,
    limit: options.limit,
    offset: options.offset,
  });
}
