import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

describe('check-cad-licensing-denylist', () => {
  it('passes on the current tree', () => {
    const script = path.join(process.cwd(), 'scripts', 'check-cad-licensing-denylist.mjs');
    const out = execFileSync(process.execPath, [script], { encoding: 'utf8' });
    expect(out).toContain('OK');
  });
});
