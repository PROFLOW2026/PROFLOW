import { describe, expect, it } from 'vitest';
import {
  availableSubmittalActions,
  canSubmittalTransition,
  isRevisionEditable,
  reviewRequiresComments,
} from '@/modules/submittals/domain/lifecycle';

describe('Submittal lifecycle (Track KL)', () => {
  it('keeps review internal-only and lets contractors submit drafts', () => {
    expect(canSubmittalTransition('draft', 'submit', 'external')).toBe(true);
    expect(canSubmittalTransition('submitted', 'review', 'external')).toBe(false);
  });

  it('requires comments for every decision except clean approval', () => {
    expect(reviewRequiresComments('approved')).toBe(false);
    expect(reviewRequiresComments('revise_and_resubmit')).toBe(true);
  });

  it('treats unsubmitted revisions as editable', () => {
    expect(isRevisionEditable({ submittedAt: null })).toBe(true);
    expect(isRevisionEditable({ submittedAt: new Date() })).toBe(false);
  });

  it('offers open_revision after revise_and_resubmit', () => {
    expect(availableSubmittalActions('revise_and_resubmit', 'external')).toContain('open_revision');
  });
});
