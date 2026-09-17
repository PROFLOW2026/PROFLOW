import { describe, expect, it } from 'vitest';
import {
  readApiErrorMessage,
  translateClientMessageKey,
} from '@/shared/i18n/translate-client-message-key';

const EN_ERRORS = {
  unexpected: 'Something went wrong.',
};

const EN_EXTERNAL_STORAGE = {
  'errors.quotaFull': 'Storage quota is full.',
};

describe('translateClientMessageKey', () => {
  it('resolves externalStorage.errors.* keys via namespace translators', () => {
    const translated = translateClientMessageKey(
      'externalStorage.errors.quotaFull',
      {
        tErrors: (key) => EN_ERRORS[key as keyof typeof EN_ERRORS] ?? key,
        namespaces: {
          externalStorage: (key) =>
            EN_EXTERNAL_STORAGE[key as keyof typeof EN_EXTERNAL_STORAGE] ?? key,
        },
      },
      'Upload failed',
    );
    expect(translated).toBe('Storage quota is full.');
  });

  it('readApiErrorMessage parses messageKey JSON from failed fetch responses', async () => {
    const response = new Response(JSON.stringify({ error: 'externalStorage.errors.quotaFull' }), {
      status: 422,
      headers: { 'Content-Type': 'application/json' },
    });

    const message = await readApiErrorMessage(
      response,
      {
        tErrors: (key) => EN_ERRORS[key as keyof typeof EN_ERRORS] ?? key,
        namespaces: {
          externalStorage: (key) =>
            EN_EXTERNAL_STORAGE[key as keyof typeof EN_EXTERNAL_STORAGE] ?? key,
        },
      },
      'Upload failed',
    );

    expect(message).toBe('Storage quota is full.');
  });
});
