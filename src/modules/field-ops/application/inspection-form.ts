import {
  getFormTemplateForOrg,
  listFormSubmissionsForOwnerUnchecked,
  listFormTemplatesForOrg,
} from '@/modules/forms';
import type { OrgContext } from '@/shared/auth/context';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  hasSubmittedInspectionForm,
  isInspectionFormRequired,
} from '../domain/inspection-form-gate';

export interface InspectionFormTemplateOption {
  readonly id: string;
  readonly name: string;
}

export interface InspectionFormGateState {
  readonly required: boolean;
  readonly satisfied: boolean;
  readonly templateId: string | null;
  readonly templateName: string | null;
  readonly fillHref: string | null;
  readonly canSubmit: boolean;
  readonly submissionStatus: 'submitted' | 'draft' | 'void' | null;
}

export async function listInspectionFormTemplateOptions(
  context: OrgContext,
): Promise<InspectionFormTemplateOption[]> {
  if (!hasPermission(context, PERMISSIONS.FORMS_READ)) return [];
  const rows = await listFormTemplatesForOrg(context, { enabledOnly: true });
  return rows.map((row) => ({ id: row.id, name: row.name }));
}

export async function getInspectionFormGateState(
  context: OrgContext,
  input: {
    readonly inspectionId: string;
    readonly formTemplateId: string | null;
  },
): Promise<InspectionFormGateState> {
  const templateId = input.formTemplateId;
  const required = isInspectionFormRequired(templateId);
  const canSubmit = hasAnyPermission(context, [
    PERMISSIONS.FORMS_SUBMIT,
    PERMISSIONS.FORMS_MANAGE,
  ]);

  if (!required || !templateId) {
    return {
      required: false,
      satisfied: true,
      templateId: null,
      templateName: null,
      fillHref: null,
      canSubmit,
      submissionStatus: null,
    };
  }

  const submissions = await listFormSubmissionsForOwnerUnchecked(
    context.db,
    context.organizationId,
    {
      ownerType: 'inspection',
      ownerId: input.inspectionId,
      templateId,
    },
  );

  const satisfied = hasSubmittedInspectionForm({
    formTemplateId: templateId,
    submissions,
  });

  const submitted = submissions.find((row) => row.status === 'submitted');
  const draft = submissions.find((row) => row.status === 'draft');
  const active = submitted ?? draft ?? null;

  let templateName: string | null = submitted?.templateName ?? draft?.templateName ?? null;
  if (!templateName && hasPermission(context, PERMISSIONS.FORMS_READ)) {
    const template = await getFormTemplateForOrg(context, templateId).catch(() => null);
    templateName = template?.name ?? null;
  }

  return {
    required: true,
    satisfied,
    templateId,
    templateName,
    fillHref: active ? `/forms/${active.id}` : null,
    canSubmit,
    submissionStatus: active
      ? (active.status as InspectionFormGateState['submissionStatus'])
      : null,
  };
}
