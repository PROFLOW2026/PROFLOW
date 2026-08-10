import { randomUUID } from 'node:crypto';
import type {
  AllocateExternalReferenceInput,
  AllocateExternalReferenceOutput,
  CancelExternalDocumentInput,
  CancelExternalDocumentOutput,
  CreateExternalDocumentInput,
  CreateExternalDocumentOutput,
  CreditExternalDocumentInput,
  CreditExternalDocumentOutput,
  RetrieveExternalStatusInput,
  RetrieveExternalStatusOutput,
  StatutoryInvoicingProvider,
  StatutoryProviderResult,
} from './provider';

type ScriptedDoc = {
  externalId: string;
  externalNumber: string;
  externalUrl: string;
  status: 'pending' | 'issued' | 'credited' | 'cancelled' | 'failed';
  allocationReference: string | null;
  billingRecordId: string;
  issuedAt: string | null;
};

/**
 * Deterministic in-process adapter for unit tests only.
 * Must never be registered as the default production provider.
 */
export class ScriptedStatutoryProvider implements StatutoryInvoicingProvider {
  readonly id = 'scripted-test';
  private readonly docs = new Map<string, ScriptedDoc>();
  private seq = 0;

  isConfigured(): boolean {
    return true;
  }

  isFeatureEnabled(): boolean {
    return true;
  }

  async createDocument(
    input: CreateExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreateExternalDocumentOutput>> {
    if (input.billing.status !== 'finalized') {
      return {
        ok: false,
        errorCode: 'invalid_billing_state',
        message: 'Billing record must be finalized before external issuance',
      };
    }
    this.seq += 1;
    const externalId = randomUUID();
    const issuedAt = new Date().toISOString();
    const doc: ScriptedDoc = {
      externalId,
      externalNumber: `EXT-TEST-${this.seq}`,
      externalUrl: `https://example.test/statutory/${externalId}`,
      status: 'issued',
      allocationReference: null,
      billingRecordId: input.billing.billingRecordId,
      issuedAt,
    };
    this.docs.set(externalId, doc);
    return {
      ok: true,
      value: {
        externalId: doc.externalId,
        externalNumber: doc.externalNumber,
        externalUrl: doc.externalUrl,
        status: 'issued',
        pdf: {
          contentType: 'application/pdf',
          byteSize: 1024,
          checksumSha256: null,
          storageDocumentId: null,
          fileName: `${doc.externalNumber}.pdf`,
        },
        issuedAt,
      },
    };
  }

  async retrieveStatus(
    input: RetrieveExternalStatusInput,
  ): Promise<StatutoryProviderResult<RetrieveExternalStatusOutput>> {
    const doc = this.docs.get(input.externalId);
    if (!doc) {
      return { ok: false, errorCode: 'not_found', message: 'External document not found' };
    }
    return {
      ok: true,
      value: {
        externalId: doc.externalId,
        externalNumber: doc.externalNumber,
        externalUrl: doc.externalUrl,
        status: doc.status,
        pdf: {
          contentType: 'application/pdf',
          byteSize: 1024,
          checksumSha256: null,
          storageDocumentId: null,
          fileName: `${doc.externalNumber}.pdf`,
        },
        issuedAt: doc.issuedAt,
      },
    };
  }

  async creditDocument(
    input: CreditExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreditExternalDocumentOutput>> {
    const doc = this.docs.get(input.externalId);
    if (!doc) {
      return { ok: false, errorCode: 'not_found', message: 'External document not found' };
    }
    doc.status = 'credited';
    const creditExternalId = randomUUID();
    this.seq += 1;
    return {
      ok: true,
      value: {
        creditExternalId,
        creditExternalNumber: `EXT-CREDIT-${this.seq}`,
        externalUrl: `https://example.test/statutory/${creditExternalId}`,
        status: 'credited',
      },
    };
  }

  async cancelDocument(
    input: CancelExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CancelExternalDocumentOutput>> {
    const doc = this.docs.get(input.externalId);
    if (!doc) {
      return { ok: false, errorCode: 'not_found', message: 'External document not found' };
    }
    doc.status = 'cancelled';
    return { ok: true, value: { externalId: doc.externalId, status: 'cancelled' } };
  }

  async allocateReference(
    input: AllocateExternalReferenceInput,
  ): Promise<StatutoryProviderResult<AllocateExternalReferenceOutput>> {
    const doc = this.docs.get(input.externalId);
    if (!doc) {
      return { ok: false, errorCode: 'not_found', message: 'External document not found' };
    }
    if (doc.billingRecordId !== input.billingRecordId) {
      return {
        ok: false,
        errorCode: 'provider_error',
        message: 'Allocation billing record mismatch',
      };
    }
    doc.allocationReference = input.allocationReference;
    return {
      ok: true,
      value: {
        externalId: doc.externalId,
        allocationReference: input.allocationReference,
      },
    };
  }
}
