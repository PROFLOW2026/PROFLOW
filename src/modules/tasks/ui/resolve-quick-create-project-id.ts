'use server';

import { withOrgContext } from '@/shared/auth/session';
import { retainAccessibleProjectId } from '../application/retain-accessible-project-id';

/** Resolves `?projectId=` for /work quick create. Inaccessible ids become null. */
export async function resolveQuickCreateProjectIdAction(
  projectId: string | null,
): Promise<string | null> {
  return withOrgContext((context) => retainAccessibleProjectId(context, projectId));
}
