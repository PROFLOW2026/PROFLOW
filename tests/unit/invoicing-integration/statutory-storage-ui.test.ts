import { describe, expect, it } from 'vitest';
import {
  resolveStatutoryStorageUiStatus,
  shouldShowStatutoryStorageSaveButton,
} from '@/modules/invoicing-integration/domain/statutory-storage-ui';
import type { ExternalStatutoryDocument } from '@/modules/invoicing-integration/domain/types';

function doc(partial: Partial<ExternalStatutoryDocument>): ExternalStatutoryDocument {
  return {
    id: 'doc-id',
    organizationId: 'org-id',
    billingRecordId: 'billing-id',
    paymentId: null,
    providerId: 'sumit',
    kind: 'tax_invoice',
    status: 'issued',
    externalId: '2375968448',
    externalNumber: '20000',
    externalUrl: null,
    pdf: null,
    allocationReference: null,
    issuanceOutcome: 'confirmed_created',
    reconciliationStatus: 'matched',
    reconciliationMetadata: null,
    idempotencyKey: null,
    lastErrorCode: null,
    lastErrorMessage: null,
    requestedAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    issuedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('statutory storage ui', () => {
  it('shows save button for issued pending copy regardless of storage gate', () => {
    expect(
      shouldShowStatutoryStorageSaveButton({
        issued: true,
        canManage: true,
        storageStatus: 'pending',
      }),
    ).toBe(true);
  });

  it('hides save button after copy is saved', () => {
    const status = resolveStatutoryStorageUiStatus(
      doc({ pdf: { storageDocumentId: 'storage-doc', contentType: 'application/pdf', byteSize: 1, checksumSha256: 'abc', fileName: 'x.pdf' } }),
    );
    expect(status).toBe('saved');
    expect(
      shouldShowStatutoryStorageSaveButton({
        issued: true,
        canManage: true,
        storageStatus: status,
      }),
    ).toBe(false);
  });

  it('shows retry after failed save', () => {
    expect(
      shouldShowStatutoryStorageSaveButton({
        issued: true,
        canManage: true,
        storageStatus: resolveStatutoryStorageUiStatus(
          doc({ reconciliationMetadata: { expectedNet: '1', expectedVat: null, expectedGross: '1', currency: 'ILS', comparedAt: 'x', tolerance: '0.01', pdfStorageStatus: 'failed' } }),
        ),
      }),
    ).toBe(true);
  });
});
