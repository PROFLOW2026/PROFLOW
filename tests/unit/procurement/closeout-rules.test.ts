import { describe, expect, it } from 'vitest';
import { assertCloseoutCompleteness } from '@/modules/contractor-closeout';

describe('Track Q closeout rules', () => {
  it('blocks close when required items remain without override', () => {
    expect(() =>
      assertCloseoutCompleteness(
        [
          { itemKind: 'final_claim', isRequired: true, status: 'pending' },
          { itemKind: 'punch_list_clear', isRequired: true, status: 'complete' },
        ],
        null,
      ),
    ).toThrow();
  });

  it('allows close with audited override reason', () => {
    expect(() =>
      assertCloseoutCompleteness([{ itemKind: 'final_claim', isRequired: true, status: 'pending' }], 'Owner waiver'),
    ).not.toThrow();
  });
});
