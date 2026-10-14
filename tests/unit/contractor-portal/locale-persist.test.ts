import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('contractor portal locale persist', () => {
  it('portal shell persists locale before navigation', () => {
    const shell = path.join(process.cwd(), 'src/modules/contractor-portal/ui/portal-shell.tsx');
    const source = readFileSync(shell, 'utf8');
    expect(source).toContain('persistExternalPrincipalLocaleAction');
  });

  it('exports persist action from portal actions', () => {
    const actions = path.join(process.cwd(), 'src/modules/contractor-portal/application/actions.ts');
    const source = readFileSync(actions, 'utf8');
    expect(source).toContain('export async function persistExternalPrincipalLocaleAction');
  });
});
