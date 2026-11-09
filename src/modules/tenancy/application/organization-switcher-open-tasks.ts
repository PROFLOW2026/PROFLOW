import 'server-only';

import { runInOrgContext } from '@/shared/auth/session';
import { countOpenAuthorizedTasksForMember } from '@/modules/tasks/application/count-open-assigned-tasks';

export type OrganizationOpenTaskCounts = Readonly<Record<string, number>>;

/**
 * Per-org open assigned task counts for the organization switcher (count only, org-isolated).
 */
export async function loadOrganizationSwitcherOpenTaskCounts(
  userId: string,
  memberships: readonly { readonly id: string; readonly membershipId: string }[],
  activeOrganizationId: string,
): Promise<OrganizationOpenTaskCounts> {
  const entries = await Promise.all(
    memberships
      .filter((membership) => membership.id !== activeOrganizationId)
      .map(async (membership) => {
        try {
          const count = await runInOrgContext(userId, membership.id, (context) =>
            countOpenAuthorizedTasksForMember(context),
          );
          return [membership.id, count] as const;
        } catch {
          return [membership.id, 0] as const;
        }
      }),
  );
  return Object.fromEntries(entries);
}
