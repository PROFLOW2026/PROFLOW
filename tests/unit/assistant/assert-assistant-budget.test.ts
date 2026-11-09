import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertAssistantBudget } from '@/modules/assistant/domain/budget';

describe('assertAssistantBudget', () => {
  it('allows usage strictly below the limit', () => {
    expect(() => assertAssistantBudget(3, 10)).not.toThrow();
  });

  it('throws when used equals the limit', () => {
    expect(() => assertAssistantBudget(10, 10)).toThrow(DomainRuleError);
  });

  it('throws when used exceeds the limit', () => {
    expect(() => assertAssistantBudget(11, 10)).toThrow(DomainRuleError);
  });
});
