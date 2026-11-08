import type { OrgContext } from '@/shared/auth/context';
import {
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';

/**
 * Keeps a project id only when the caller can access it.
 * `null` allowlist (`projects.access_all`) keeps the id. An empty allowlist drops it.
 */
export async function retainAccessibleProjectId(
  context: OrgContext,
  projectId: string | null | undefined,
): Promise<string | null> {
  const trimmed = typeof projectId === 'string' ? projectId.trim() : '';
  if (!trimmed) return null;
  const allowed = await resolveAccessibleProjectIds(context);
  return isAccessibleProjectId(allowed, trimmed) ? trimmed : null;
}
