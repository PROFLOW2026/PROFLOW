import { describe, expect, it } from 'vitest';
import {
  documentKindForWorkKind,
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

  it('maps work kind onto the matching allocated sequence', () => {
    expect(documentKindForWorkKind('project')).toBe('project');
    expect(documentKindForWorkKind('job')).toBe('job');
    expect(documentKindForWorkKind('work_order')).toBe('work_order');
    expect(documentKindForWorkKind(null)).toBe('project');
  });
});
