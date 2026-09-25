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
        return { ok: false, errorCode: 'not_found', message: 'External document not found' };
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
    _input: CreditExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CreditExternalDocumentOutput>> {
    return unsupported('SUMIT credit');
  }

  async cancelDocument(
    _input: CancelExternalDocumentInput,
  ): Promise<StatutoryProviderResult<CancelExternalDocumentOutput>> {
    return unsupported('SUMIT cancel');
  }

  async allocateReference(
    _input: AllocateExternalReferenceInput,
  ): Promise<StatutoryProviderResult<AllocateExternalReferenceOutput>> {
    return unsupported('SUMIT allocation');
  }
}

/**
 * Live SUMIT client implements create + retrieve only.
 * credit/cancel/allocate stay unsupported — there is no implemented API call for them.
 * Internal billing credit notes remain management records.
 */
export function sumitProviderCapabilities() {
  return {
    createDocument: true,
    retrieveStatus: true,
    creditDocument: false,
    cancelDocument: false,
    allocateReference: false,
  };
}
