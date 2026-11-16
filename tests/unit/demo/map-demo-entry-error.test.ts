import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  DEMO_ENTRY_ERROR_CODES,
  demoEntryErrorHref,
  mapUnknownToDemoEntryErrorCode,
} from '@/modules/demo/application/map-demo-entry-error';

describe('mapUnknownToDemoEntryErrorCode', () => {
  it('maps demo.errors.rateLimited to rateLimited', () => {
    const error = new DomainRuleError('Too many demo entries', 'demo.errors.rateLimited');
    expect(mapUnknownToDemoEntryErrorCode(error)).toBe('rateLimited');
  });

  it.each([
    ['demo.errors.disabled', 'disabled'],
    ['demo.errors.invalidChoice', 'invalidChoice'],
    ['demo.errors.notConfigured', 'notConfigured'],
    ['demo.errors.signInUnsafe', 'signInUnsafe'],
  ] as const)('maps %s to %s', (messageKey, code) => {
    expect(mapUnknownToDemoEntryErrorCode(new DomainRuleError('x', messageKey))).toBe(code);
  });

  it('maps roleRejected to invalidChoice', () => {
    expect(
      mapUnknownToDemoEntryErrorCode(new DomainRuleError('rejected', 'demo.errors.roleRejected')),
    ).toBe('invalidChoice');
  });

  it('maps unknown demo keys and non-domain errors to failed', () => {
    expect(
      mapUnknownToDemoEntryErrorCode(new DomainRuleError('missing', 'demo.errors.roleMissing')),
    ).toBe('failed');
    expect(mapUnknownToDemoEntryErrorCode(new Error('seed failed'))).toBe('failed');
    expect(mapUnknownToDemoEntryErrorCode(null)).toBe('failed');
  });

  it('builds demo page href for every canonical code', () => {
    for (const code of DEMO_ENTRY_ERROR_CODES) {
      expect(demoEntryErrorHref(code)).toBe(`/demo?demoError=${code}`);
    }
  });
});