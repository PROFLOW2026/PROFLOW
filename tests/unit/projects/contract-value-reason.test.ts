import { describe, expect, it } from 'vitest';
import {
  CONTRACT_VALUE_REASON_ORIGINAL,
  contractValueReasonMessageKey,
  contractValueReasonPresentation,
  formatChangeOrderContractReason,
} from '@/modules/projects/domain/contract-value-reason';

describe('contract value reason presentation', () => {
  it('maps the canonical original-value reason to a locale key', () => {
    expect(contractValueReasonMessageKey(CONTRACT_VALUE_REASON_ORIGINAL)).toBe(
      'originalContractValue',
    );
    expect(contractValueReasonPresentation(CONTRACT_VALUE_REASON_ORIGINAL)).toEqual({
      key: 'originalContractValue',
    });
  });

  it('maps change-order ledger reasons with the reference preserved', () => {
    expect(formatChangeOrderContractReason('CO-12')).toBe('Change order CO-12');
    expect(contractValueReasonPresentation('Change order CO-12')).toEqual({
      key: 'changeOrder',
      values: { reference: 'CO-12' },
    });
  });

  it('does not invent keys for unknown free-text reasons', () => {
    expect(contractValueReasonPresentation('Manual correction')).toBeNull();
    expect(contractValueReasonPresentation(null)).toBeNull();
  });
});
