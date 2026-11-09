import { DomainRuleError } from '@/shared/errors';

/** Pure budget gate — no LLM usage. */
export function assertAssistantBudget(used: number, limit: number): void {
  if (!Number.isFinite(used) || !Number.isFinite(limit)) {
    throw new DomainRuleError('Invalid assistant budget inputs', 'assistant.errors.budgetInvalid');
  }
  if (used >= limit) {
    throw new DomainRuleError('Assistant budget exhausted', 'assistant.errors.budgetExhausted', {
      used,
      limit,
    });
  }
}
