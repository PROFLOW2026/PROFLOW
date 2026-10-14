import { describe, expect, it } from 'vitest';
import {
  followUpStageSelectOptions,
  isFollowUpWonStageDisabled,
} from '@/modules/crm/domain/follow-up-stage-options';

describe('followUpStageSelectOptions', () => {
  it('excludes won for open opportunities', () => {
    const options = followUpStageSelectOptions('quote', 'open');
    expect(options).not.toContain('won');
    expect(isFollowUpWonStageDisabled('open')).toBe(true);
  });

  it('includes won when opportunity is already won', () => {
    const options = followUpStageSelectOptions('won', 'won');
    expect(options).toContain('won');
    expect(isFollowUpWonStageDisabled('won')).toBe(false);
  });
});
