import type { StorageProviderKey } from '../domain/types';

const PREVIEW_OPEN_IN_PROVIDER_KEYS = {
  onedrive: 'openInOneDrive',
  google_drive: 'openInGoogleDrive',
  dropbox: 'openInDropbox',
  box: 'openInBox',
} as const satisfies Record<StorageProviderKey, string>;

export type PreviewNamespaceTranslator = (key: string) => string;

/** Provider-specific copy — no ICU `{provider}` placeholder (avoids malformed-message edge cases). */
export function translatePreviewOpenInProvider(
  t: PreviewNamespaceTranslator,
  provider: StorageProviderKey,
): string {
  return t(PREVIEW_OPEN_IN_PROVIDER_KEYS[provider]);
}

export function translatePreviewUnsupportedWithProvider(
  t: PreviewNamespaceTranslator,
  provider: StorageProviderKey,
): string {
  return `${t('unsupportedWithProviderPrefix')} ${translatePreviewOpenInProvider(t, provider)}.`;
}
