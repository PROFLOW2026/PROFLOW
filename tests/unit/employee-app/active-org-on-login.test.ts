import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('employee active organization on login (L4)', () => {
  it('employee login action sets active org from account', () => {
    const actions = readFileSync(resolve('src/app/[locale]/employee/actions.ts'), 'utf8');
    expect(actions).toContain('setActiveOrganization(result.organizationId)');
  });

  it('login result exposes organizationId', () => {
    const login = readFileSync(
      resolve('src/modules/employee-app/application/employee-login.ts'),
      'utf8',
    );
    expect(login).toMatch(/organizationId:\s*string/);
  });
});
