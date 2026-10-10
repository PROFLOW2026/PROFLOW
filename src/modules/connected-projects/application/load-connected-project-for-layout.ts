import 'server-only';

import { getLocale } from 'next-intl/server';
import { getShellContextForProject } from '@/shared/auth/session';
import { getSupabaseUser } from '@/shared/supabase/server';
import { resolveConnectedContext, type ConnectedProjectContext } from './resolve-connected-context';

/** Banner data for `(app)/projects/[projectId]/layout.tsx` — no redirect. */
export async function loadConnectedProjectForLayout(
  contractorProjectId: string,
): Promise<ConnectedProjectContext | null> {
  const shell = await getShellContextForProject(contractorProjectId);
  if (!shell) return null;
  const user = await getSupabaseUser();
  if (!user) return null;

  return resolveConnectedContext({
    contractorOrganizationId: shell.organizationId,
    contractorProjectId,
    authUserId: user.id,
    fallbackLocale: await getLocale(),
    sessionAuthenticatedAt: null,
  });
}
