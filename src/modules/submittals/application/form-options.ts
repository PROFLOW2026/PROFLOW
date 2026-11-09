import type { OrgContext } from '@/shared/auth/context';
import { listInternalDrawingPickerOptions, type DrawingPickerOption } from '@/modules/project-plans';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import {
  listAssigneeOptions,
  listProjectAgreementOptions,
  listProjectLocationOptions,
  listProjectWorkPackageOptions,
  type AgreementOption,
  type AssigneeOption,
  type LocationOption,
  type WorkPackageOption,
} from '@/modules/rfi';

export interface SubmittalFormOptions {
  readonly agreements: readonly AgreementOption[];
  readonly locations: readonly LocationOption[];
  readonly workPackages: readonly WorkPackageOption[];
  readonly reviewers: readonly AssigneeOption[];
  readonly drawings: readonly DrawingPickerOption[];
}

/** Pickers for internal registration / triage (submittal.manage only). */
export async function loadSubmittalFormOptions(context: OrgContext, projectId: string): Promise<SubmittalFormOptions> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.SUBMITTAL_MANAGE);
  const [agreements, locations, workPackages, reviewers, drawings] = await Promise.all([
    listProjectAgreementOptions(context.db, context.organizationId, projectId),
    listProjectLocationOptions(context.db, context.organizationId, projectId),
    listProjectWorkPackageOptions(context.db, context.organizationId, projectId),
    listAssigneeOptions(context, projectId),
    listInternalDrawingPickerOptions(context, projectId),
  ]);
  return { agreements, locations, workPackages, reviewers, drawings };
}
