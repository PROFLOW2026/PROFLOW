import { DomainRuleError } from '@/shared/errors';

/**
 * Work-order checklist completion gate.
 *
 * `project_service_details.checklist_template_id` is the only persisted flag.
 * There is no `checklist_required` column yet - if a template is set, the
 * checklist is required before status `completed`. See SCHEMA_REQUEST.md.
 */

export interface WorkOrderChecklistSubmissionRef {
  readonly templateId: string;
  readonly status: string;
}

export function isWorkOrderChecklistRequired(
  checklistTemplateId: string | null | undefined,
): boolean {
  return typeof checklistTemplateId === 'string' && checklistTemplateId.length > 0;
}

export function hasSubmittedWorkOrderChecklist(input: {
  readonly checklistTemplateId: string | null | undefined;
  readonly submissions: readonly WorkOrderChecklistSubmissionRef[];
}): boolean {
  if (!isWorkOrderChecklistRequired(input.checklistTemplateId)) return true;
  const templateId = input.checklistTemplateId as string;
  return input.submissions.some(
    (row) => row.templateId === templateId && row.status === 'submitted',
  );
}

export function assertWorkOrderCompletionChecklist(input: {
  readonly targetStatus: string;
  readonly checklistTemplateId: string | null | undefined;
  readonly submissions: readonly WorkOrderChecklistSubmissionRef[];
}): void {
  if (input.targetStatus !== 'completed') return;
  if (hasSubmittedWorkOrderChecklist(input)) return;
  throw new DomainRuleError(
    'Submit the required checklist before completing this work order.',
    'service.errors.checklistRequired',
    { checklistTemplateId: input.checklistTemplateId ?? null },
  );
}
