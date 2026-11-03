import { describe, expect, it } from 'vitest';
import { LIVE_SHARE_TEXT, liveBadgeText } from '@/modules/infra-mapping/ui/live-share-texts';

describe('broadcaster status chip', () => {
  it('says the broadcast is live with a connected viewer', () => {
    expect(liveBadgeText(true)).toBe('משדר · צופה מחובר');
    expect(liveBadgeText(true)).toBe(LIVE_SHARE_TEXT.liveBadgeViewer);
  });

  it('says the broadcast is live and waiting while nobody has joined', () => {
    expect(liveBadgeText(false)).toBe('משדר · ממתין לצופה');
  });
});
