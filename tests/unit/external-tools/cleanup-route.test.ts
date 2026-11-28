import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('external tools cleanup', () => {
  it('purges every organization after 0217, including when the product flag is off', () => {
    const source = readFileSync(
      path.join(process.cwd(), 'src/app/api/internal/external-tools-cleanup/route.ts'),
      'utf8',
    );
    expect(source).toContain("isInternalWorkerAuthorized(request, 'ops-worker')");
    expect(source).toContain('purgeExternalSessions');
    expect(source).toContain('externalSchemaAvailable');
    expect(source).toContain("purged: 0, pending: '0217_external_professional_tools'");
    expect(source).toContain('Independent of PF_EXTERNAL_TOOLS');
    expect(source).not.toMatch(/PF_EXTERNAL_TOOLS ===/);
  });

  it('sweeps the org ledger from every tools page', () => {
    const pages = [
      'src/app/[locale]/(app)/tools/page.tsx',
      'src/app/[locale]/employee/(shell)/tools/page.tsx',
      'src/app/[locale]/contractor/(portal)/tools/page.tsx',
    ];
    for (const rel of pages) {
      const source = readFileSync(path.join(process.cwd(), rel), 'utf8');
      expect(source).toContain('sweepOrgExternalTools');
    }
  });
});
