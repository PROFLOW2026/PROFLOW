import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type InternalWorkerRoute,
  isInternalWorkerAuthorized,
} from '@/shared/http/internal-worker-auth';

function requestWithAuth(header: string | null, url = 'http://localhost/api/internal/ops-worker'): Request {
  const headers = new Headers();
  if (header) headers.set('authorization', header);
  return new Request(url, { method: 'POST', headers });
}

const CRON_ROUTES: InternalWorkerRoute[] = [
  'ops-worker',
  'sumit-expense-worker',
  'dg-events-worker',
];

describe('internal worker authorization', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('rejects when no secret is configured', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', '');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer anything'), 'ops-worker')).toBe(false);
  });

  it('rejects missing or wrong bearer tokens on cron routes', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    for (const route of CRON_ROUTES) {
      expect(isInternalWorkerAuthorized(requestWithAuth(null), route)).toBe(false);
      expect(isInternalWorkerAuthorized(requestWithAuth('Bearer wrong'), route)).toBe(false);
      expect(isInternalWorkerAuthorized(requestWithAuth('cron-secret'), route)).toBe(false);
    }
  });

  it('accepts CRON_SECRET on cron routes', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('OCR_WORKER_SECRET', 'ocr-secret');
    for (const route of CRON_ROUTES) {
      expect(isInternalWorkerAuthorized(requestWithAuth('Bearer cron-secret'), route)).toBe(true);
      expect(isInternalWorkerAuthorized(requestWithAuth('Bearer ocr-secret'), route)).toBe(false);
    }
  });

  it('ocr-worker accepts CRON_SECRET or OCR_WORKER_SECRET', () => {
    vi.stubEnv('CRON_SECRET', 'cron-secret');
    vi.stubEnv('OCR_WORKER_SECRET', 'ocr-secret');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer cron-secret'), 'ocr-worker')).toBe(
      true,
    );
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer ocr-secret'), 'ocr-worker')).toBe(
      true,
    );
  });

  it('ocr-worker accepts OCR_WORKER_SECRET when CRON_SECRET is unset', () => {
    vi.stubEnv('CRON_SECRET', '');
    vi.stubEnv('OCR_WORKER_SECRET', 'ocr-secret');
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer ocr-secret'), 'ocr-worker')).toBe(
      true,
    );
    expect(isInternalWorkerAuthorized(requestWithAuth('Bearer cron-secret'), 'ops-worker')).toBe(
      false,
    );
  });
});
