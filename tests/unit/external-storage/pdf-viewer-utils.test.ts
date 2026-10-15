import { describe, expect, it } from 'vitest';
import { isPdfFileBytes } from '@/modules/external-storage/ui/pdf-viewer-utils';

describe('isPdfFileBytes', () => {
  it('accepts a standard PDF signature', () => {
    const bytes = new TextEncoder().encode('%PDF-1.7\n');
    expect(isPdfFileBytes(bytes)).toBe(true);
  });

  it('accepts leading whitespace before the signature', () => {
    const bytes = new TextEncoder().encode('  \n%PDF-1.4');
    expect(isPdfFileBytes(bytes)).toBe(true);
  });

  it('accepts UTF-8 BOM before the signature', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode('%PDF-1.4')]);
    expect(isPdfFileBytes(bytes)).toBe(true);
  });

  it('rejects HTML and DWG-like payloads', () => {
    expect(isPdfFileBytes(new TextEncoder().encode('<!DOCTYPE html>'))).toBe(false);
    expect(isPdfFileBytes(new TextEncoder().encode('AC1027'))).toBe(false);
  });
});
