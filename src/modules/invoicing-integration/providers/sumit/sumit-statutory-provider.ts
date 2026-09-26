import 'server-only';

import { money } from '@/shared/money';
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
} from '../../domain/provider';
import type { ProviderAmountSnapshot } from '../../domain/reconcile-external-amounts';
import { SUMIT_PROVIDER_ID, type InvoicingProviderCredentials } from '../../domain/types';
import {
  buildSumitCreatePayload,
  isSumitTransactionInvoiceSupported,
  resolveSumitDocumentType,
} from './sumit-create-payload';
import {
  createSumitHttpClient,
  SumitAmbiguousError,
  type SumitCreateDocumentResponse,
  type SumitDocumentPdfResponse,
  type SumitHttpClient,
} from './sumit-http-client';

export class SumitAmbiguousCreateError extends Error {
  readonly partialExternalId: string | null;

  constructor(message: string, partialExternalId: string | null = null) {
    super(message);
    this.name = 'SumitAmbiguousCreateError';
    this.partialExternalId = partialExternalId;
  }
}

export interface SumitStatutoryProviderOptions {
  readonly credentials: InvoicingProviderCredentials;
  readonly httpClient?: SumitHttpClient;
}

function unsupported<T>(feature: string): StatutoryProviderResult<T> {
  return {
    ok: false,
    errorCode: 'unsupported',
    message: `${feature} is not available from SUMIT`,
  };
}

export class SumitStatutoryProvider implements StatutoryInvoicingProvider {
  readonly id = SUMIT_PROVIDER_ID;
  private readonly credentials: InvoicingProviderCredentials;
  private readonly client: SumitHttpClient;

  constructor(options: SumitStatutoryProviderOptions) {
    this.credentials = options.credentials;
    this.client = options.httpClient ?? createSumitHttpClient(options.credentials);
  }

  capabilities() {
    return sumitProviderCapabilities();
  }

  isConfigured(): boolean {
    return Number.isFinite(this.credentials.companyId) && this.credentials.apiKey.length > 0;
  }

  isFeatureEnabled(): boolean {
    return this.isConfigured();
  }

  async fetchDocumentDetails(documentId: string): Promise<SumitCreateDocumentResponse> {
    return this.client.getDocumentDetails(documentId);
  }

  async fetchDocumentPdf(documentId: string): Promise<SumitDocumentPdfResponse> {
    return this.client.getDocumentPdf(documentId, true);
  }

  async sendDocument(input: {
    documentId: string;
    emailAddress: string;
    original?: boolean;
  }): Promise<void> {
    await this.client.sendDocument({
      documentId: input.documentId,
      emailAddress: input.emailAddress,
      original: input.original,
    });
  }

  /** Exposed for reconciliation after confirmed create / getdetails refresh. */
  mapProviderAmounts(
    currency: string,
    response: { netAmount: string | null; vatAmount: string | null; grossAmount: string | null },
  ): ProviderAmountSnapshot | null {
    if (!response.netAmount || !response.vatAmount || !response.grossAmount) {
      return null;
    }
    return {
      net: money(response.netAmount, currency),
      vat: money(response.vatAmount, currency),
      gross: money(response.grossAmount, currency),
    };
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

    if (
      (input.kind === 'receipt' || input.kind === 'tax_invoice_receipt') &&
      !input.payment?.paymentId
    ) {
      return {
        ok: false,
        errorCode: 'invalid_billing_state',
        message: 'Receipt statutory documents require a confirmed payment snapshot',
      };
    }

    if (input.kind === 'transaction_invoice' && !isSumitTransactionInvoiceSupported()) {
      return {
        ok: false,
        errorCode: 'unsupported',
        message: 'SUMIT transaction invoice (ProformaInvoice) is not supported',
      };
    }

    try {
      const documentType = resolveSumitDocumentType(input.kind);
      const response = await this.client.createDocument({
        documentType,
        externalReference: input.idempotencyKey,
        payload: buildSumitCreatePayload({
          billing: input.billing,
          kind: input.kind,
          payment: input.payment ?? null,
          linkedTaxInvoiceExternalId: input.linkedTaxInvoiceExternalId ?? null,
        }),
      });

      const documentId = response.documentId!;
      let externalNumber = response.documentNumber;
      let providerAmounts: ReturnType<SumitStatutoryProvider['mapProviderAmounts']> = null;

      try {
        const details = await this.client.getDocumentDetails(documentId);
        externalNumber = details.documentNumber ?? externalNumber;
        providerAmounts = this.mapProviderAmounts(input.billing.totalAmount.currency, details);
      } catch {
        // Create is confirmed once DocumentID exists; reconciliation can refresh later.
      }

      const issuedAt = new Date().toISOString();
      return {
        ok: true,
        value: {
          externalId: documentId,
          externalNumber,
          externalUrl: null,
          status: 'issued',
          pdf: null,
          issuedAt,
          providerAmounts,
        },
      };
    } catch (error) {
      if (error instanceof SumitAmbiguousError) {
        throw new SumitAmbiguousCreateError(error.message, error.partialDocumentId);
      }
      const message = error instanceof Error ? error.message : 'SUMIT create failed';
      return {
        ok: false,
        errorCode: 'provider_error',
        message,
      };
    }
  }

  async retrieveStatus(
    input: RetrieveExternalStatusInput,
  ): Promise<StatutoryProviderResult<RetrieveExternalStatusOutput>> {
    try {
      const response = await this.client.getDocumentDetails(input.externalId);
      if (!response.documentId) {
        return { ok: false, errorCode: 'not_found', message: 'not_found' };
      }
      return {
        ok: true,
        value: {
          externalId: response.documentId,
          externalNumber: response.documentNumber,
          externalUrl: null,
          status: 'issued',
          pdf: null,
          issuedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof SumitAmbiguousError) {
        return { ok: false, errorCode: 'provider_error', message: error.message };
      }
      return {
        ok: false,
        errorCode: 'provider_error',
        message: error instanceof Error ? error.message : 'SUMIT status lookup failed',
      };
    }
  }

  async creditDocument(
    input: CreditExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreditExternalDocumentOutput>> {
    const billing = input.billing;
    if (!billing || billing.status !== 'finalized' || billing.kind !== 'credit_note') {
      return {
        ok: false,
        errorCode: 'invalid_billing_state',
        message: 'SUMIT credit requires a finalized billing credit note',
      };
    }

    const originalDocumentId = Number.parseInt(input.externalId, 10);
    if (!Number.isFinite(originalDocumentId) || originalDocumentId <= 0) {
      return {
        ok: false,
        errorCode: 'invalid_billing_state',
        message: 'SUMIT credit requires the original document id',
      };
    }

    try {
      const response = await this.client.createDocument({
        documentType: resolveSumitDocumentType('credit_note'),
        externalReference: input.idempotencyKey,
        payload: buildSumitCreatePayload({
          billing,
          kind: 'credit_note',
          linkedTaxInvoiceExternalId: input.externalId,
          description: input.reason,
        }),
      });

      if (!response.documentId) {
        return {
          ok: false,
          errorCode: 'provider_error',
          message: 'SUMIT credit succeeded without DocumentID',
        };
      }

      let externalNumber = response.documentNumber;
      try {
        const details = await this.client.getDocumentDetails(response.documentId);
        externalNumber = details.documentNumber ?? externalNumber;
      } catch {
        // Create is confirmed once DocumentID exists.
      }

      return {
        ok: true,
        value: {
          creditExternalId: response.documentId,
          creditExternalNumber: externalNumber,
          externalUrl: null,
          status: 'credited',
        },
      };
    } catch (error) {
      if (error instanceof SumitAmbiguousError) {
        throw new SumitAmbiguousCreateError(error.message, error.partialDocumentId);
      }
      const message = error instanceof Error ? error.message : 'SUMIT credit failed';
      return {
        ok: false,
        errorCode: 'provider_error',
        message,
      };
    }
  }

  async cancelDocument(
    input: CancelExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CancelExternalDocumentOutput>> {
    const description = input.reason?.trim() ?? '';
    if (!description) {
      return {
        ok: false,
        errorCode: 'invalid_billing_state',
        message: 'SUMIT cancel requires a description',
      };
    }

    try {
      await this.client.cancelDocument({
        documentId: input.externalId,
        description,
      });
      return {
        ok: true,
        value: {
          externalId: input.externalId,
          status: 'cancelled',
        },
      };
    } catch (error) {
      if (error instanceof SumitAmbiguousError) {
        throw new SumitAmbiguousCreateError(error.message, error.partialDocumentId);
      }
      const message = error instanceof Error ? error.message : 'SUMIT cancel failed';
      return {
        ok: false,
        errorCode: 'provider_error',
        message,
      };
    }
  }

  async allocateReference(
    _input: AllocateExternalReferenceInput,
  ): Promise<StatutoryProviderResult<AllocateExternalReferenceOutput>> {
    return unsupported('SUMIT allocation');
  }
}

/**
 * Live SUMIT client: create, retrieve, credit (CreditInvoice type 5 via create),
 * and cancel (POST /accounting/documents/cancel/).
 * Allocation stays unsupported — no confirmed allocation endpoint is used.
 */
export function sumitProviderCapabilities() {
  return {
    createDocument: true,
    retrieveStatus: true,
    creditDocument: true,
    cancelDocument: true,
    allocateReference: false,
  };
}
