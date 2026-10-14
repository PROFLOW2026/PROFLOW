import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertStatutoryShareAvailable,
  isStatutoryShareAvailable,
  statutoryShareSigningKey,
} from '@/modules/invoicing-integration/application/statutory-share-availability';
import { DomainRuleError } from '@/shared/errors';
import { setStatutoryShareLinksTableReadyForTests } from '@/modules/invoicing-integration/data/statutory-share-persistence';

const TEST_KEY = 'b'.repeat(32);

describe('statutory share availability', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setStatutoryShareLinksTableReadyForTests(null);
  });

  it('requires signing key of at least 32 bytes', () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', 'short');
    expect(statutoryShareSigningKey()).toBeNull();
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    expect(statutoryShareSigningKey()).toBe(TEST_KEY);
  });

  it('is unavailable without key or share-links table', async () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    setStatutoryShareLinksTableReadyForTests(false);
    expect(await isStatutoryShareAvailable()).toBe(false);
    await expect(assertStatutoryShareAvailable()).rejects.toBeInstanceOf(DomainRuleError);
  });

  it('is available when key and table gate are ready', async () => {
    vi.stubEnv('STATUTORY_SHARE_SIGNING_KEY', TEST_KEY);
    setStatutoryShareLinksTableReadyForTests(true);
    expect(await isStatutoryShareAvailable()).toBe(true);
  });
});
