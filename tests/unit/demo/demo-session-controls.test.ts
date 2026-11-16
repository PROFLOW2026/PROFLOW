import { describe, expect, it } from 'vitest';
import {
  demoBusinessProfileOptions,
  demoExitMarketingHref,
  resolveDemoBusinessProfileKey,
} from '@/modules/demo/domain/demo-session-decisions';
import { ONBOARDING_BUSINESS_TYPES } from '@/modules/tenancy/domain/onboarding-experience';

describe('demo session controls', () => {
  it('lists every onboarding business type for in-demo switching', () => {
    const keys = demoBusinessProfileOptions().map((row) => row.key);
    expect(keys).toEqual([...ONBOARDING_BUSINESS_TYPES]);
    expect(keys).toHaveLength(20);
  });

  it('accepts only known profile keys', () => {
    expect(resolveDemoBusinessProfileKey('PLUMBING')).toBe('PLUMBING');
    expect(resolveDemoBusinessProfileKey('not-a-profile')).toBeNull();
  });

  it('exits demo to the public marketing homepage', () => {
    expect(demoExitMarketingHref()).toBe('/');
  });
});