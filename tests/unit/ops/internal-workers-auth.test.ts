import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInternalWorkerAuthorized } from '@/shared/http/internal-worker-auth';

function requestWithAuth(header: string | null): Request {
  const headers = new Headers();
  if (header) headers.set('authorization', header);
  return new Request('http://localhost/api/internal/ops-worker', { method: 'POST', headers });
}

describe('internal worker authorization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects when no secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', '');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer anything'))).toBe(false);
  });

  it('rejects missing or wrong bearer tokens', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(isInternalWorkerAuthorized(requestWithAuth(null))).toBe(false);
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer wrong'))).toBe(false);
    expect(isInternalWorkerAuthorized(requestWithAuth('cron-secret'))).toBe(false);
  });

  it('accepts CRON_SECRET or OCR_WORKER_SECRET bearer tokens', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer cron-secret'))).toBe(true);

    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', 'ocr-secret');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer ocr-secret'))).toBe(true);
  });
});
