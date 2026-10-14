import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('DOC-012 statutory PDF archive wiring', () => {
  it('routes issuance through scheduleStatutoryPdfToProjectFolders', () => {
    const files = [
      'src/modules/invoicing-integration/application/request-external-document.ts',
      'src/modules/invoicing-integration/application/request-external-statutory-for-payment.ts',
      'src/modules/invoicing-integration/application/credit-or-cancel-external.ts',
    ];
    for (const file of files) {
      const source = readFileSync(path.join(process.cwd(), file), 'utf8');
      expect(source).toContain('scheduleStatutoryPdfToProjectFolders');
    }
  });
});
