import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStorageProvisionWorkerAuthorized } from '@/modules/external-storage/application/storage-provision-worker-auth';

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header) headers.set('authorization', header);
  return new Request('http://localhost/api/internal/storage-provision-worker', {
    method: 'POST',
    headers,
  });
}

describe('storage provision worker authorization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects when STORAGE_PROVISION_WORKER_SECRET is unset', () => {
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', '');
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth('Bearer anything'))).toBe(false);
  });

  it('rejects wrong bearer tokens', () => {
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', 'storage-secret');
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth(null))).toBe(false);
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth('Bearer wrong'))).toBe(false);
  });

  it('accepts STORAGE_PROVISION_WORKER_SECRET bearer token', () => {
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', 'storage-secret');
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth('Bearer storage-secret'))).toBe(
      true,
    );
  });

  it('does not accept OCR/CRON secrets as storage worker auth', () => {
    vi.stubEnv('STORAGE_PROVISION_WORKER_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', 'ocr-secret');
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth('Bearer ocr-secret'))).toBe(false);
    expect(isStorageProvisionWorkerAuthorized(requestWithAuth('Bearer cron-secret'))).toBe(false);
  });
});
