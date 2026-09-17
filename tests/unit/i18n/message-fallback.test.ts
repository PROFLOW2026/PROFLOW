import { IntlErrorCode } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { pfGetMessageFallback } from '@/shared/i18n/message-fallback';

describe('pfGetMessageFallback', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns dev-visible marker for missing messages in local development', () => {
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('NODE_ENV', 'development');

    expect(
      pfGetMessageFallback({
        namespace: 'commandCenter',
        key: 'actions.confirmPaid',
        error: { code: IntlErrorCode.MISSING_MESSAGE, message: 'missing' } as never,
      }),
    ).toBe('[missing: commandCenter.actions.confirmPaid]');
  });

  it('returns em dash in production instead of blank or raw keys', () => {
    vi.stubEnv('APP_ENV', 'production');
    vi.stubEnv('NODE_ENV', 'production');

    const result = pfGetMessageFallback({
      namespace: 'commandCenter',
      key: 'actions.confirmPaid',
      error: { code: IntlErrorCode.MISSING_MESSAGE, message: 'missing' } as never,
    });

    expect(result).toBe('\u2014');
    expect(result).not.toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_.-]*)+$/);
    expect(result.length).toBeGreaterThan(0);
  });

  it('warns developers in local mode', () => {
    vi.stubEnv('APP_ENV', 'local');
    vi.stubEnv('NODE_ENV', 'development');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    pfGetMessageFallback({
      namespace: 'commandCenter',
      key: 'actions.confirmPaid',
      error: { code: IntlErrorCode.MISSING_MESSAGE, message: 'missing' } as never,
    });

    expect(warn).toHaveBeenCalledWith('[i18n] Missing message: commandCenter.actions.confirmPaid');
    warn.mockRestore();
  });

  it('never returns a raw dotted translation key shape in preview', () => {
    vi.stubEnv('APP_ENV', 'preview');
    vi.stubEnv('NODE_ENV', 'production');

    expect(
      pfGetMessageFallback({
        namespace: 'commandCenter',
        key: 'actions.confirmPaid',
        error: { code: IntlErrorCode.INVALID_MESSAGE, message: 'invalid' } as never,
      }),
    ).toBe('\u2014');
  });
});
