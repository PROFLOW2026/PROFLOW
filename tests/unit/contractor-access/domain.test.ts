import { describe, expect, it } from 'vitest';
import {
  GrantRuleError,
  assertGrantAllowed,
  hasFinancialExternalCapability,
  normalizeExternalCapabilities,
  resolveGrantCapabilities,
} from '@/modules/contractor-access/domain/grant-policy';
import { checkContractorPassword } from '@/modules/contractor-access/domain/password-policy';
import {
  ACCOUNT_LOCK_MS,
  MAX_CONSECUTIVE_FAILURES,
  hashThrottleKey,
  isAccountLocked,
  isThrottled,
  nextFailureState,
} from '@/modules/contractor-access/domain/rate-limit';
import {
  contractorTokenPath,
  generateContractorToken,
  hashContractorToken,
  isPlausibleToken,
  tokenExpiry,
  tokenState,
} from '@/modules/contractor-access/domain/tokens';
import {
  contractorAuthEmail,
  isContractorAuthEmail,
  suggestContractorUsername,
  validateContractorUsername,
} from '@/modules/contractor-access/domain/username';
import { EXTERNAL_CAPABILITIES as X, FINANCIAL_EXTERNAL_CAPABILITIES } from '@/shared/external';

describe('contractor usernames', () => {
  it('normalizes, validates and maps to the synthetic auth email', () => {
    expect(validateContractorUsername('  Dana.Volt ')).toEqual({ valid: true, normalized: 'dana.volt' });
    expect(validateContractorUsername('ab').valid).toBe(false);
    expect(validateContractorUsername('dana@volt.com').valid).toBe(false);
    expect(validateContractorUsername('.dana').valid).toBe(false);
    expect(contractorAuthEmail('dana.volt')).toBe('dana.volt@contractors.pf.internal');
    expect(isContractorAuthEmail('DANA.VOLT@contractors.pf.internal')).toBe(true);
    expect(isContractorAuthEmail('dana@volt.com')).toBe(false);
  });

  it('suggests a valid username even from non-latin names', () => {
    for (const [name, vendor] of [
      ['Dana Cohen', 'Volt Electric'],
      ['דנה כהן', 'חשמל וולט'],
      ['A', null],
    ] as const) {
      expect(validateContractorUsername(suggestContractorUsername(name, vendor)).valid).toBe(true);
    }
  });
});

describe('contractor password policy', () => {
  it('requires length, variety, no username, not common, confirmation match', () => {
    expect(checkContractorPassword({ password: 'Bricks&Mortar2026', confirmation: 'Bricks&Mortar2026' })).toEqual([]);
    expect(checkContractorPassword({ password: 'Ab1!' })).toContain('too_short');
    expect(checkContractorPassword({ password: 'abcdefgh' })).toContain('needs_variety');
    expect(checkContractorPassword({ password: '12345678' })).toContain('needs_variety');
    expect(checkContractorPassword({ password: 'abcd1234', confirmation: 'abcd1234' })).toEqual([]);
    expect(checkContractorPassword({ password: 'xdana.voltX9!', username: 'dana.volt' })).toContain('contains_username');
    expect(checkContractorPassword({ password: 'Password1!' })).toContain('too_common');
    expect(checkContractorPassword({ password: 'Bricks&Mortar2026', confirmation: 'other' })).toContain('mismatch');
  });
});

describe('contractor grant policy', () => {
  it('adds project.view, orders by catalog and rejects non-external keys', () => {
    expect(normalizeExternalCapabilities([X.TASK_WORK])).toEqual([X.PROJECT_VIEW, X.TASK_WORK]);
    expect(() => normalizeExternalCapabilities(['expenses.manage'])).toThrow(GrantRuleError);
    expect(() => normalizeExternalCapabilities([])).toThrow(GrantRuleError);
    expect(resolveGrantCapabilities('read_only', undefined)).toContain(X.PLAN_VIEW);
  });

  it('operational templates carry no financial capability; financial needs a financial grantor', () => {
    expect(hasFinancialExternalCapability(resolveGrantCapabilities('site_contractor', undefined))).toBe(false);
    expect(hasFinancialExternalCapability(resolveGrantCapabilities('claims_only', undefined))).toBe(true);
    const scope = { projectId: 'p', subcontractAgreementId: null, expiresAt: null };
    const grantor = { isOrgProjectAdmin: false, canGrantFinancial: false };
    expect(() => assertGrantAllowed(scope, [...FINANCIAL_EXTERNAL_CAPABILITIES], grantor)).toThrow(
      'financial_requires_financial_grantor',
    );
    expect(() => assertGrantAllowed({ ...scope, projectId: null }, [X.PROJECT_VIEW], grantor)).toThrow(
      'vendor_wide_requires_org_admin',
    );
    expect(() =>
      assertGrantAllowed({ ...scope, expiresAt: new Date(Date.now() - 1000) }, [X.PROJECT_VIEW], grantor),
    ).toThrow('expiry_in_past');
    expect(() =>
      assertGrantAllowed({ projectId: null, subcontractAgreementId: 'a', expiresAt: null }, [X.PROJECT_VIEW], {
        isOrgProjectAdmin: true,
        canGrantFinancial: true,
      }),
    ).toThrow('agreement_requires_project');
    expect(() =>
      assertGrantAllowed(scope, [X.PROJECT_VIEW, X.CLAIM_SUBMIT], { isOrgProjectAdmin: false, canGrantFinancial: true }),
    ).not.toThrow();
  });
});

describe('sign-in throttling', () => {
  it('throttles by username / ip and locks after consecutive failures', () => {
    expect(isThrottled({ usernameFailures: 4, ipFailures: 0 })).toBe(false);
    expect(isThrottled({ usernameFailures: 5, ipFailures: 0 })).toBe(true);
    expect(isThrottled({ usernameFailures: 0, ipFailures: 20 })).toBe(true);
    const now = new Date('2026-10-03T10:00:00Z');
    expect(nextFailureState(0, now)).toEqual({ failedSignInCount: 1, lockedUntil: null });
    const locked = nextFailureState(MAX_CONSECUTIVE_FAILURES - 1, now);
    expect(locked.lockedUntil!.getTime()).toBe(now.getTime() + ACCOUNT_LOCK_MS);
    expect(isAccountLocked(locked.lockedUntil, now)).toBe(true);
    expect(isAccountLocked(locked.lockedUntil, new Date(now.getTime() + ACCOUNT_LOCK_MS + 1))).toBe(false);
    expect(hashThrottleKey('Dana')).toBe(hashThrottleKey(' dana '));
  });
});

describe('contractor tokens', () => {
  it('generates opaque tokens, stores only hashes and expires them', () => {
    const token = generateContractorToken();
    expect(isPlausibleToken(token)).toBe(true);
    expect(hashContractorToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashContractorToken(token)).not.toContain(token);
    const now = new Date('2026-10-03T10:00:00Z');
    const expiresAt = tokenExpiry('password_reset', now);
    expect(tokenState({ expiresAt, consumedAt: null, revokedAt: null }, now)).toBe('valid');
    expect(tokenState({ expiresAt, consumedAt: now, revokedAt: null }, now)).toBe('consumed');
    expect(tokenState({ expiresAt, consumedAt: null, revokedAt: now }, now)).toBe('revoked');
    expect(tokenState({ expiresAt, consumedAt: null, revokedAt: null }, expiresAt)).toBe('expired');
    expect(contractorTokenPath('he-IL', 'invite', 'abc')).toBe('/he-IL/contractor/activate?token=abc');
  });
});
