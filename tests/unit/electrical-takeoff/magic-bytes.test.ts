import { describe, expect, it } from 'vitest';
import { assertMagicMatchesDeclared, sniffTakeoffKind } from '@/modules/electrical-takeoff/application/magic-bytes';

describe('magic bytes', () => {
  it('detects PDF header', () => {
    const head = new TextEncoder().encode('%PDF-1.7\n');
    expect(sniffTakeoffKind(head)).toBe('pdf');
    expect(assertMagicMatchesDeclared(head, 'pdf')).toBe(true);
  });

  it('detects DWG AC10', () => {
    const head = new TextEncoder().encode('AC1021');
    expect(sniffTakeoffKind(head)).toBe('dwg');
  });
});