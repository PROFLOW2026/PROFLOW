import { describe, expect, it } from 'vitest';
import {
  buildStorageOAuthSettingsRedirectUrl,
  resolveStorageOAuthCallbackLocale,
} from '@/modules/external-storage/application/oauth-callback-locale';
import { createOAuthState } from '@/modules/external-storage/application/oauth-state';

describe('storage OAuth callback locale redirect', () => {
  it('prefers locale embedded in OAuth state over cookie fallback', () => {
    const state = createOAuthState({
      organizationId: 'org-1',
      userId: 'user-1',
      connectionId: 'conn-1',
      provider: 'onedrive',
      locale: 'en',
    });

    expect(resolveStorageOAuthCallbackLocale('he-IL', state)).toBe('en');
  });

  it('falls back to NEXT_LOCALE cookie when state is missing', () => {
    expect(resolveStorageOAuthCallbackLocale('en', null)).toBe('en');
  });

  it('builds a localized settings/storage redirect URL', () => {
    const url = buildStorageOAuthSettingsRedirectUrl(
      'https://app.example.com',
      'en',
      'connected=onedrive',
    );
    expect(url).toBe('https://app.example.com/en/settings/storage?connected=onedrive');
  });
});
