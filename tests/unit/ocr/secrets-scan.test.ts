import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');
const SECRET_PATTERN = /OCR_PROVIDER_API_KEY|Ocp-Apim-Subscription-Key|OCR_PROVIDER_ENDPOINT/;
const PUBLIC_OCR_PATTERN = /NEXT_PUBLIC_OCR|NEXT_PUBLIC_.*OCR/;

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry)) acc.push(full);
  }
  return acc;
}

function isClientFile(source: string, path: string): boolean {
  return (
    source.includes("'use client'") ||
    source.includes('"use client"') ||
    /[\\/]ui[\\/]/.test(path) && !source.includes("'use server'")
  );
}

describe('OCR secrets stay server-only', () => {
  it('does not put OCR secrets on NEXT_PUBLIC_ names', () => {
    const publicEnv = readFileSync(join(process.cwd(), 'src/shared/env/public.ts'), 'utf8');
    expect(publicEnv).not.toMatch(PUBLIC_OCR_PATTERN);
    expect(publicEnv).not.toMatch(SECRET_PATTERN);
  });

  it('client UI does not reference provider credentials or Azure HTTP headers', () => {
    const files = walk(join(ROOT, 'modules/ocr/ui')).concat(
      walk(join(ROOT, 'modules/documents/ui')),
    );
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      if (!isClientFile(source, file) && !file.includes(`${join('ocr', 'ui')}`)) continue;
      expect({ file, leaked: SECRET_PATTERN.test(source) }).toEqual({ file, leaked: false });
      expect({ file, publicOcr: PUBLIC_OCR_PATTERN.test(source) }).toEqual({
        file,
        publicOcr: false,
      });
    }
  });

  it('client review panel does not import Azure HTTP or the provider registry', () => {
    const panel = readFileSync(
      join(ROOT, 'modules/ocr/ui/ocr-review-panel.tsx'),
      'utf8',
    );
    expect(panel).not.toMatch(/azure-http|azure-provider|provider-registry|OCR_PROVIDER_API_KEY/);
  });
});
