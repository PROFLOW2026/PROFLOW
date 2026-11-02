import { describe, expect, it } from 'vitest';
import { INFRA_TYPES } from '@/modules/infra-mapping/domain/types';
import { defaultWorkDomain } from '@/modules/infra-mapping/domain/work-domain';

describe('defaultWorkDomain', () => {
  it('pre-selects the trade for single-trade business profiles', () => {
    expect(defaultWorkDomain('ELECTRICAL')).toBe('electrical');
    expect(defaultWorkDomain('PLUMBING')).toBe('plumbing');
    expect(defaultWorkDomain('HVAC')).toBe('hvac');
    expect(defaultWorkDomain('SAFETY_INSPECTION_CONSULTANT')).toBe('fire');
  });

  it('gives managing profiles no default so they see and filter every domain', () => {
    for (const key of ['GENERAL_CONTRACTOR', 'RENOVATION', 'REAL_ESTATE_DEVELOPMENT', 'PROJECT_MANAGEMENT', 'ARCHITECT', 'ALL_CAPABILITIES']) {
      expect(defaultWorkDomain(key)).toBeNull();
    }
    expect(defaultWorkDomain(null)).toBeNull();
    expect(defaultWorkDomain(undefined)).toBeNull();
    expect(defaultWorkDomain('UNKNOWN')).toBeNull();
  });

  it('only ever returns a domain the database already allows (no migration needed)', () => {
    for (const key of ['ELECTRICAL', 'PLUMBING', 'HVAC', 'SAFETY_INSPECTION_CONSULTANT']) {
      expect(INFRA_TYPES).toContain(defaultWorkDomain(key));
    }
  });
});
