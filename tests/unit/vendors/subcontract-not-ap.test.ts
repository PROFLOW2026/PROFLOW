import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const appPath = path.resolve(process.cwd(), 'src/modules/vendors/application/subcontracts.ts');

describe('subcontract ≠ AP posting', () => {
  it('application never posts or drafts AP automatically', () => {
    const source = readFileSync(appPath, 'utf8');
    expect(source).not.toContain('createDraftApBill');
    expect(source).not.toContain('createApBill');
    expect(source).not.toContain('postApBill');
    expect(source).toContain('Never posts AP');
  });
});
