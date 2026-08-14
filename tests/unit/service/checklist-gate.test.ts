import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertWorkOrderCompletionChecklist,
  hasSubmittedWorkOrderChecklist,
  isWorkOrderChecklistRequired,
} from '@/modules/service/domain/checklist-gate';

describe('isWorkOrderChecklistRequired', () => {
  it('treats a set template id as required', () => {
    expect(isWorkOrderChecklistRequired('11111111-1111-4111-8111-111111111111')).toBe(true);
  });

  it('is not required when no template is attached', () => {
    expect(isWorkOrderChecklistRequired(null)).toBe(false);
    expect(isWorkOrderChecklistRequired(undefined)).toBe(false);
    expect(isWorkOrderChecklistRequired('')).toBe(false);
  });
});

describe('hasSubmittedWorkOrderChecklist', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';
  const otherId = '22222222-2222-4222-8222-222222222222';

  it('allows completion when no template is set', () => {
    expect(
      hasSubmittedWorkOrderChecklist({
        checklistTemplateId: null,
        submissions: [],
      }),
    ).toBe(true);
  });

  it('requires a submitted (non-void) form for the attached template', () => {
    expect(
      hasSubmittedWorkOrderChecklist({
        checklistTemplateId: templateId,
        submissions: [{ templateId, status: 'submitted' }],
      }),
    ).toBe(true);
  });

  it('rejects draft and void submissions', () => {
    expect(
      hasSubmittedWorkOrderChecklist({
        checklistTemplateId: templateId,
        submissions: [{ templateId, status: 'draft' }],
      }),
    ).toBe(false);

    expect(
      hasSubmittedWorkOrderChecklist({
        checklistTemplateId: templateId,
        submissions: [{ templateId, status: 'void' }],
      }),
    ).toBe(false);
  });

  it('ignores a submitted form for a different template', () => {
    expect(
      hasSubmittedWorkOrderChecklist({
        checklistTemplateId: templateId,
        submissions: [{ templateId: otherId, status: 'submitted' }],
      }),
    ).toBe(false);
  });
});

describe('assertWorkOrderCompletionChecklist', () => {
  const templateId = '11111111-1111-4111-8111-111111111111';

  it('does not block non-completed status changes', () => {
    expect(() =>
      assertWorkOrderCompletionChecklist({
        targetStatus: 'in_progress',
        checklistTemplateId: templateId,
        submissions: [],
      }),
    ).not.toThrow();
  });

  it('allows completed when the required form is submitted', () => {
    expect(() =>
      assertWorkOrderCompletionChecklist({
        targetStatus: 'completed',
        checklistTemplateId: templateId,
        submissions: [{ templateId, status: 'submitted' }],
      }),
    ).not.toThrow();
  });

  it('blocks completed until a submitted form exists', () => {
    try {
      assertWorkOrderCompletionChecklist({
        targetStatus: 'completed',
        checklistTemplateId: templateId,
        submissions: [{ templateId, status: 'draft' }],
      });
      expect.fail('expected DomainRuleError');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('service.errors.checklistRequired');
    }
  });
});
