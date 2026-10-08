'use server';

import { findProjectDeliveryProfile } from '@/modules/project-profile';
import { loadProjectCapabilities } from '@/modules/project-team';
import { shouldShowExecutionNavGroup } from '@/modules/project-workspace/domain/select-execution-nav-links';
import { listProjectAgreementsOperational } from '@/modules/subcontracts';
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
      const [held, deliveryProfile, agreements] = await Promise.all([
        loadProjectCapabilities(context, projectId),
        findProjectDeliveryProfile(context, projectId),
        listProjectAgreementsOperational(context.db, context.organizationId, projectId).catch(() => []),
      ]);
      const showGcActions = shouldShowExecutionNavGroup({
        deliveryProfile,
        hasSubcontractAgreements: agreements.length > 0,
      });
      if (!showGcActions) return [];
      return buildProjectQuickCreateActions(projectId, held, root);
    });
  } catch {
    return [];
  }
}
