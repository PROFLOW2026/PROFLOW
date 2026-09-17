import { describe, expect, it } from 'vitest';
import {
  createOAuthState,
  verifyOAuthState,
} from '@/modules/external-storage/application/oauth-state';

describe('storage OAuth state locale', () => {
  it('round-trips a supported locale in signed state', () => {
    const state = createOAuthState({
      organizationId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      provider: 'onedrive',
      locale: 'en',
    });

    const parsed = verifyOAuthState(state);
    expect(parsed.locale).toBe('en');
    expect(parsed.organizationId).toBe('org-1');
  });

  it('ignores unsupported locale values', () => {
    const state = createOAuthState({
      organizationId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      provider: 'google_drive',
      locale: 'fr-FR',
    });

    const parsed = verifyOAuthState(state);
    expect(parsed.locale).toBeUndefined();
  });
});
