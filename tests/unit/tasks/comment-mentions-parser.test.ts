import { describe, expect, it } from 'vitest';
import {
  extractMentionOrgMemberIds,
  formatMentionToken,
  segmentCommentBody,
} from '@/modules/tasks/domain/comment-mentions';

describe('comment mention parser', () => {
  it('extracts org member ids from tokens', () => {
    const memberId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const body = `Hello ${formatMentionToken(memberId)} please review`;
    expect(extractMentionOrgMemberIds(body)).toEqual([memberId]);
  });

  it('returns empty when no tokens', () => {
    expect(extractMentionOrgMemberIds('plain text')).toEqual([]);
  });

  it('segments body with mention labels', () => {
    const memberId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const body = `Hi ${formatMentionToken(memberId)}!`;
    expect(segmentCommentBody(body, { [memberId]: 'Alex' })).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'mention', orgMemberId: memberId, label: 'Alex' },
      { type: 'text', value: '!' },
    ]);
  });
});
