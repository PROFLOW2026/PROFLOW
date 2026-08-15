import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertInspectionCompletionForm,
  hasSubmittedInspectionForm,
  isInspectionFormRequired,
} from '@/modules/field-ops/domain/inspection-form-gate';

describe('isInspectionFormRequired', () => {
  it('treats a set template id as required', () => {
    expect(isInspectionFormRequired('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('is not required when no template is attached', () => {
    expect(isInspectionFormRequired(null)).toBe(false);
    expect(isInspectionFormRequired(undefined)).toBe(false);
    expect(isInspectionFormRequired('')).toBe(false);
  });
});

describe('hasSubmittedInspectionForm', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';

  it('allows completion when no template is set', () => {
    expect(hasSubmittedInspectionForm({ formTemplateId: null, submissions: [] })).toBe(true);
  });

  it('requires a submitted form for the attached template', () => {
    expect(
      hasSubmittedInspectionForm({
        formTemplateId: templateId,
        submissions: [{ templateId, status: 'submitted' }],
      }),
    ).toBe(true);
  });

  it('rejects draft and void submissions', () => {
    expect(
      hasSubmittedInspectionForm({
        formTemplateId: templateId,
        submissions: [{ templateId, status: 'draft' }],
      }),
    ).toBe(false);
  });

  it('ignores a submitted form for a different template', () => {
    expect(
      hasSubmittedInspectionForm({
        formTemplateId: templateId,
        submissions: [{ templateId: otherId, status: 'submitted' }],
      }),
    ).toBe(false);
  });
});

describe('assertInspectionCompletionForm', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';

  it('does not block in-progress or cancelled', () => {
    expect(() =>
      assertInspectionCompletionForm({
        targetStatus: 'in_progress',
        formTemplateId: templateId,
        submissions: [],
      }),
    ).not.toThrow();
    expect(() =>
      assertInspectionCompletionForm({
        targetStatus: 'cancelled',
        formTemplateId: templateId,
        submissions: [],
      }),
    ).not.toThrow();
  });

  it('allows pass/fail when the required form is submitted', () => {
    expect(() =>
      assertInspectionCompletionForm({
        targetStatus: 'passed',
        formTemplateId: templateId,
        submissions: [{ templateId, status: 'submitted' }],
      }),
    ).not.toThrow();
  });

  it('blocks pass and fail until a submitted form exists', () => {
    try {
      assertInspectionCompletionForm({
        targetStatus: 'passed',
        formTemplateId: templateId,
        submissions: [{ templateId, status: 'draft' }],
      });
      expect.fail('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('fieldOps.errors.formRequired');
    }

    try {
      assertInspectionCompletionForm({
        targetStatus: 'failed',
        formTemplateId: templateId,
        submissions: [],
      });
      expect.fail('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('fieldOps.errors.formRequired');
    }
  });
});
