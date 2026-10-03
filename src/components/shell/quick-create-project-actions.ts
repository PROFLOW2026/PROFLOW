'use server';

import { loadProjectCapabilities } from '@/modules/project-team';
import { withOrgContext } from '@/shared/auth/session';
import { buildProjectQuickCreateActions, isProjectQuickCreateId } from './quick-create-project';
import type { QuickCreateAction } from './quick-create';

/**
 * Menu entries for the project in the current URL. Hidden when the viewer lacks the capability.
 * `root` comes from the client pathname (`/employee/projects/${id}` or omitted for the owner app).
 */
export async function loadProjectQuickCreateActions(
  projectId: string,
  root?: string | null,
): Promise<QuickCreateAction[]> {
  if (!isProjectQuickCreateId(projectId)) return [];
  try {
    return await withOrgContext(async (context) => {
      const held = await loadProjectCapabilities(context, projectId);
      return buildProjectQuickCreateActions(projectId, held, root);
    });
  } catch {
    return [];
  }
}
