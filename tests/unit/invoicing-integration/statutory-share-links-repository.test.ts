import { afterEach, describe, expect, it, vi } from 'vitest';
import { setStatutoryShareLinksInMemoryStoreForTests } from '@/modules/invoicing-integration/data/statutory-share-links.repository';

describe('statutory share links repository safety', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    setStatutoryShareLinksInMemoryStoreForTests(false);
  });

  it('refuses in-memory store outside test environments', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    expect(() => setStatutoryShareLinksInMemoryStoreForTests(true)).toThrow(/test environments/);
  });
});
