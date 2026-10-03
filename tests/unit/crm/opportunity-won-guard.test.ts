import { describe, expect, it } from 'vitest';
import { canConvertOpportunity, isOpportunityAlreadyConverted } from '@/modules/crm/domain/conversion';

describe('opportunity won guard (L6)', () => {
  it('manual won status blocks conversion before convertedAt', () => {
    const opp = {
      status: 'won' as const,
      convertedAt: null,
      convertedProjectId: null,
      convertedClientId: null,
      convertedContractId: null,
    };
    expect(isOpportunityAlreadyConverted(opp)).toBe(true);
    expect(canConvertOpportunity(opp)).toBe(false);
  });

  it('open status allows conversion', () => {
    const opp = {
      status: 'open' as const,
      convertedAt: null,
      convertedProjectId: null,
      convertedClientId: null,
      convertedContractId: null,
    };
    expect(canConvertOpportunity(opp)).toBe(true);
  });
});
