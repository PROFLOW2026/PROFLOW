import { describe, expect, it } from 'vitest';
import { quoteStorageFolderSegment } from '@/modules/quotes/domain/quote-storage-path';

describe('quoteStorageFolderSegment', () => {
  it('builds stable folder names from title and id', () => {
    const segment = quoteStorageFolderSegment({
      title: 'הצעה 100 - לקוח',
      quoteId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    });
    expect(segment).toContain('a1b2c3d4');
    expect(segment).not.toMatch(/[\\/:*?"<>|]/);
  });
});
