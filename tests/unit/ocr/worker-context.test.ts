import { describe, expect, it } from 'vitest';
import {
  OCR_WORKER_PERMISSIONS,
  buildOcrWorkerOrgContext,
} from '@/modules/ocr/application/worker-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

describe('OCR worker context', () => {
  it('grants document read/manage permissions required for external storage download', () => {
    expect(OCR_WORKER_PERMISSIONS).toEqual([
      PERMISSIONS.DOCUMENTS_READ,
      PERMISSIONS.DOCUMENTS_MANAGE,
    ]);

    const context = buildOcrWorkerOrgContext({} as never, {
      id: 'org-1',
      defaultLocale: 'he-IL',
    } as never);

    expect(context.permissions.has(PERMISSIONS.DOCUMENTS_READ)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.DOCUMENTS_MANAGE)).toBe(true);
  });
});
