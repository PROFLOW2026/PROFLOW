import { describe, expect, it } from 'vitest';
import {
  suppliedDocumentReference,
  titleWithDocumentNumber,
} from '@/modules/tenancy/domain/document-numbers';

describe('internal document numbering helpers', () => {
  it('treats blank references as missing', () => {
    expect(suppliedDocumentReference(null)).toBeNull();
    expect(suppliedDocumentReference('')).toBeNull();
    expect(suppliedDocumentReference('  ')).toBeNull();
    expect(suppliedDocumentReference('PO-9')).toBe('PO-9');
  });

  it('prefixes a title with the allocated number once', () => {
    expect(titleWithDocumentNumber('Kitchen remodel', 'EST-0001')).toBe('EST-0001 — Kitchen remodel');
    expect(titleWithDocumentNumber('EST-0001 — Kitchen remodel', 'EST-0001')).toBe(
      'EST-0001 — Kitchen remodel',
    );
    expect(titleWithDocumentNumber('EST-0001 Kitchen', 'EST-0001')).toBe('EST-0001 Kitchen');
  });
});
