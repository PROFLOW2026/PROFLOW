import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { barePathLocalization } from '@/shared/i18n/bare-path';

describe('pf-cad static assets bypass locale redirect', () => {
  it('treats /pf-cad as passthrough for bare paths', () => {
    expect(barePathLocalization('/pf-cad/wasm/pf_cad_wasm.js')).toBe('passthrough');
  });

  it('proxy matcher excludes pf-cad and .js glue', () => {
    const proxySource = readFileSync(path.join(process.cwd(), 'src/proxy.ts'), 'utf8');
    expect(proxySource).toContain('pf-cad/');
    expect(proxySource).toMatch(/wasm\|js\)/);
  });
});
