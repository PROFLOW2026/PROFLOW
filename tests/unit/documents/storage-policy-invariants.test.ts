import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { STORAGE_PROVIDER_KEYS } from '@/modules/external-storage/providers/registry';

describe('storage policy invariants (D01)', () => {
  it('registers four external storage providers', () => {
    expect(STORAGE_PROVIDER_KEYS).toEqual(['onedrive', 'google_drive', 'dropbox', 'box']);
  });

  it('wires quote approval and conversion to artifact helpers', () => {
    const transition = readFileSync(
      path.join(process.cwd(), 'src/modules/quotes/application/transition-quote.ts'),
      'utf8',
    );
    const convert = readFileSync(
      path.join(process.cwd(), 'src/modules/quotes/application/convert-quote.ts'),
      'utf8',
    );
    expect(transition).toContain('saveApprovedQuoteArtifact');
    expect(convert).toContain('relocateApprovedQuoteArtifactsToProject');
  });

  it('keeps quotes_root semantic folder', () => {
    const semantic = readFileSync(
      path.join(process.cwd(), 'src/modules/external-storage/domain/semantic-folders.ts'),
      'utf8',
    );
    expect(semantic).toContain('quotes_root');
  });
});
