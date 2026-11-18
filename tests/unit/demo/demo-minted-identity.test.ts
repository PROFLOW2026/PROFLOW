import { describe, expect, it } from 'vitest';
import { demoMintedOrganizationId } from '@/modules/demo/domain/identity-rule';

const ORG = '8fd5466e-babe-4c4b-b7ab-34dcc76ad625';

describe('demoMintedOrganizationId', () => {
  it('returns the session org for every exact demo actor address', () => {
    for (const role of ['owner', 'manager', 'finance', 'worker']) {
      expect(demoMintedOrganizationId(`${ORG}.${role}@demo.pf.internal`)).toBe(ORG);
    }
    expect(demoMintedOrganizationId(`demo.${ORG}.employee@employees.pf.internal`)).toBe(ORG);
    expect(demoMintedOrganizationId(`demo.${ORG}.contractor@contractors.pf.internal`)).toBe(ORG);
    expect(demoMintedOrganizationId(` ${ORG.toUpperCase()}.OWNER@DEMO.PF.INTERNAL `)).toBe(ORG);
  });

  it('rejects anything that is not an exact demo actor address', () => {
    for (const email of [
      'owner@demo.pf.internal',
      `${ORG}.admin@demo.pf.internal`,
      `${ORG}.owner@demo.pf.internal.evil.com`,
      `x${ORG}.owner@demo.pf.internal`,
      `${ORG}.employee@employees.pf.internal`,
      `demo.${ORG}.owner@employees.pf.internal`,
      `demo.${ORG}.employee@contractors.pf.internal`,
      `demo.${ORG}.employee@employees.pf.internal.co`,
      'eran@example.com',
      '',
    ]) {
      expect(demoMintedOrganizationId(email)).toBeNull();
    }
  });
});
