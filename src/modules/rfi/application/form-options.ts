import type { OrgContext } from '@/shared/auth/context';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import {
  listAssigneeOptions,
  type AssigneeOption,
} from './support';
import {
  listProjectAgreementOptions,
  listProjectLocationOptions,
  listProjectWorkPackageOptions,
  type AgreementOption,
  type LocationOption,
  type WorkPackageOption,
} from '../data/project-options.repository';

export interface RfiFormOptions {
  readonly agreements: readonly AgreementOption[];
  readonly locations: readonly LocationOption[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly assignees: readonly AssigneeOption[];
}

/** Pickers for internal create / triage forms (rfi.manage only). */
export async function loadRfiFormOptions(context: OrgContext, projectId: string): Promise<RfiFormOptions> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.RFI_MANAGE);
  const [agreements, locations, workPackages, assignees] = await Promise.all([
    listProjectAgreementOptions(context.db, context.organizationId, projectId),
    listProjectLocationOptions(context.db, context.organizationId, projectId),
    listProjectWorkPackageOptions(context.db, context.organizationId, projectId),
    listAssigneeOptions(context, projectId),
  ]);
  return { agreements, locations, workPackages, assignees };
}
