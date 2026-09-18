import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sealInvoicingCredentials } from '@/modules/invoicing-integration/application/credential-seal';
import {
  deleteInvoicingConnectionCredentials,
  saveInvoicingConnectionCredentials,
} from '@/modules/invoicing-integration/data/credentials.repository';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';

vi.mock('@/shared/db/service-role-write', () => ({
  asServiceRoleWrite: vi.fn(async (_db: DbExecutor, fn: () => Promise<unknown>) => fn()),
}));

describe('invoicing credential vault repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes vault credentials through the caller db transaction', async () => {
    const db = { execute: vi.fn(async () => []) } as unknown as DbExecutor;
    const credentials = { companyId: 12345, apiKey: 'test-api-key-value' };

    await saveInvoicingConnectionCredentials(db, {
      organizationId: '01900000-0000-7000-8000-0000000000aa',
      connectionId: '01900000-0000-7000-8000-0000000000bb',
      credentials,
    });

    expect(asServiceRoleWrite).toHaveBeenCalledWith(db, expect.any(Function));
    expect(db.execute).toHaveBeenCalledTimes(1);

    const query = JSON.stringify(vi.mocked(db.execute).mock.calls[0]?.[0] ?? '');
    expect(query).toContain('invoicing_provider_credential_refs');
    expect(query).not.toContain(credentials.apiKey);
    expect(query).toContain('enc:v1:');
  });

  it('seals API keys before persistence', () => {
    const sealed = sealInvoicingCredentials({ companyId: 99, apiKey: 'plain-secret' });
    expect(sealed).not.toContain('plain-secret');
    expect(sealed.startsWith('enc:v1:')).toBe(true);
  });

  it('uses the same db executor for disconnect vault delete', async () => {
    const db = { execute: vi.fn(async () => []) } as unknown as DbExecutor;

    await deleteInvoicingConnectionCredentials(
      db,
      '01900000-0000-7000-8000-0000000000aa',
      '01900000-0000-7000-8000-0000000000bb',
    );

    expect(asServiceRoleWrite).toHaveBeenCalledWith(db, expect.any(Function));
    expect(JSON.stringify(vi.mocked(db.execute).mock.calls[0]?.[0] ?? '')).toContain(
      'invoicing_provider_credential_refs',
    );
  });

  it('propagates vault insert failure on the caller transaction', async () => {
    const db = {
      execute: vi.fn(async () => {
        throw new Error('foreign key constraint');
      }),
    } as unknown as DbExecutor;

    await expect(
      saveInvoicingConnectionCredentials(db, {
        organizationId: '01900000-0000-7000-8000-0000000000aa',
        connectionId: '01900000-0000-7000-8000-0000000000bb',
        credentials: { companyId: 1, apiKey: 'secret-key' },
      }),
    ).rejects.toThrow('foreign key constraint');
  });
});
