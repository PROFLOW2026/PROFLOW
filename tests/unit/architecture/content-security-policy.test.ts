import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const CONFIG_PATH = path.resolve(process.cwd(), 'next.config.ts');

const REQUIRED_DIRECTIVES = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
] as const;

function contentSecurityPolicyValue(source: string): string {
  const marker = "key: 'Content-Security-Policy'";
  const start = source.indexOf(marker);
  if (start < 0) {
    throw new Error('Content-Security-Policy header is missing from next.config.ts');
  }
  const valueKey = source.indexOf('value:', start);
  const open = source.indexOf('"', valueKey);
  const close = source.indexOf('"', open + 1);
  if (valueKey < 0 || open < 0 || close < 0) {
    throw new Error('Content-Security-Policy value is missing from next.config.ts');
  }
  return source.slice(open + 1, close);
}

describe('enforcing response CSP (S-03)', () => {
  it('includes frame-ancestors, base-uri, and object-src and does not add script-src', () => {
    const source = readFileSync(CONFIG_PATH, 'utf8');
    const policy = contentSecurityPolicyValue(source);
    for (const directive of REQUIRED_DIRECTIVES) {
      expect(policy).toContain(directive);
    }
    expect(policy).not.toContain('script-src');
    expect(source.includes('script-src')).toBe(false);
  });
});
