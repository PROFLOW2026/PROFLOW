import { IntlErrorCode } from 'next-intl';
import { describe, expect, it } from 'vitest';
import { pfGetMessageFallback } from '@/shared/i18n/message-fallback';

describe('pfGetMessageFallback', () => {
  it('returns empty string for missing messages instead of raw keys', () => {
    expect(
      pfGetMessageFallback({
        namespace: 'commandCenter',
        key: 'actions.confirmPaid',
        error: { code: IntlErrorCode.MISSING_MESSAGE, message: 'missing' } as never,
      }),
    ).toBe('');
  });

  it('returns empty string when fallback would look like a dotted key path', () => {
    expect(
      pfGetMessageFallback({
        namespace: 'commandCenter',
        key: 'actions.confirmPaid',
        error: { code: IntlErrorCode.INVALID_MESSAGE, message: 'invalid' } as never,
      }),
    ).toBe('');
  });

  it('never returns a raw dotted translation key shape (production safety only)', () => {
    const result = pfGetMessageFallback({
      namespace: 'commandCenter',
      key: 'actions.confirmPaid',
      error: { code: IntlErrorCode.MISSING_MESSAGE, message: 'missing' } as never,
    });
    expect(result).not.toMatch(/^[a-zA-Z][a-zA-Z0-9_-]*(\.[a-zA-Z][a-zA-Z0-9_.-]*)+$/);
  });
});
