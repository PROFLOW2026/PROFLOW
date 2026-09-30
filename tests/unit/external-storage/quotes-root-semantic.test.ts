import { describe, expect, it } from 'vitest';
import {
  ORGANIZATION_BASE_FOLDERS,
  SEMANTIC_FOLDER_DISPLAY,
} from '@/modules/external-storage/domain/semantic-folders';

describe('quotes_root semantic folder', () => {
  it('is provisioned at organization root with Hebrew label', () => {
    expect(ORGANIZATION_BASE_FOLDERS).toContain('quotes_root');
    expect(SEMANTIC_FOLDER_DISPLAY.quotes_root).toBe('הצעות מחיר');
  });
});
