import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertDraftEditable,
  assertDraftEndable,
  assertDraftGeneratable,
  assertDraftPausable,
  assertDraftResumable,
} from '@/modules/recurring-drafts/domain/lifecycle';

describe('recurring draft lifecycle', () => {
  it('only active templates can generate', () => {
    expect(() => assertDraftGeneratable('active')).not.toThrow();
    expect(() => assertDraftGeneratable('paused')).toThrow(DomainRuleError);
    expect(() => assertDraftGeneratable('ended')).toThrow(DomainRuleError);
  });

  it('pause / resume / end follow status rules', () => {
    expect(() => assertDraftPausable('active')).not.toThrow();
    expect(() => assertDraftPausable('paused')).toThrow(DomainRuleError);
    expect(() => assertDraftResumable('paused')).not.toThrow();
    expect(() => assertDraftResumable('ended')).toThrow(DomainRuleError);
    expect(() => assertDraftEndable('active')).not.toThrow();
    expect(() => assertDraftEndable('ended')).toThrow(DomainRuleError);
  });

  it('ended templates are not editable', () => {
    expect(() => assertDraftEditable('active')).not.toThrow();
    expect(() => assertDraftEditable('paused')).not.toThrow();
    expect(() => assertDraftEditable('ended')).toThrow(DomainRuleError);
  });
});
