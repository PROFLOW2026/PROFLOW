'use server';

import { getSessionState, withOrgContext } from '@/shared/auth/session';

/**
 * Resolve the authenticated actor scope for client-side offline queues.
 * Used when AppShell cannot pass userId (Lead-owned surface).
 */
export async function getOfflineActorScopeAction(): Promise<{
  readonly organizationId: string;
  readonly userId: string;
} | null> {
  const session = await getSessionState();
  if (session.status !== 'authenticated' || !session.activeOrganizationId) {
    return null;
  }

  return withOrgContext(async (context) => ({
    organizationId: context.organizationId,
    userId: context.userId,
  }));
}
