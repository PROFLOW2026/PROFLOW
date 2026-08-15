import { DomainRuleError } from '@/shared/errors';

/**
 * Inspection completion gate — reuse Forms, do not invent a second engine.
 * If `inspections.form_template_id` is set, a submitted form for that template
 * is required before status passed/failed (same idea as work-order checklists).
 */

export interface InspectionFormSubmissionRef {
  readonly templateId: string;
  readonly status: string;
}

export function isInspectionFormRequired(
  formTemplateId: string | null | undefined,
): boolean {
  return typeof formTemplateId === 'string' && formTemplateId.length > 0;
}

export function hasSubmittedInspectionForm(input: {
  readonly formTemplateId: string | null | undefined;
  readonly submissions: readonly InspectionFormSubmissionRef[];
}): boolean {
  if (!isInspectionFormRequired(input.formTemplateId)) return true;
  const templateId = input.formTemplateId as string;
  return input.submissions.some(
    (row) => row.templateId === templateId && row.status === 'submitted',
  );
}

export function assertInspectionCompletionForm(input: {
  readonly targetStatus: string;
  readonly formTemplateId: string | null | undefined;
  readonly submissions: readonly InspectionFormSubmissionRef[];
}): void {
  if (input.targetStatus !== 'passed' && input.targetStatus !== 'failed') return;
  if (hasSubmittedInspectionForm(input)) return;
  throw new DomainRuleError(
    'Submit the required inspection form before recording pass or fail.',
    'fieldOps.errors.formRequired',
    { formTemplateId: input.formTemplateId ?? null },
  );
}
