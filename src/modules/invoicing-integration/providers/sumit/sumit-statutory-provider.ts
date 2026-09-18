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
import {
  FULL_ADAPTER_CAPABILITIES,
  SUMIT_PROVIDER_ID,
  type BillingRecordBridgeRef,
  type InvoicingProviderCredentials,
} from '../../domain/types';
import {
  createSumitHttpClient,
  SumitAmbiguousError,
  type SumitCreateDocumentResponse,
  type SumitHttpClient,
} from './sumit-http-client';

const SUMIT_DOCUMENT_TYPE_INVOICE = 0;

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
  readonly environment?: 'test';
}

function unsupported<T>(feature: string): StatutoryProviderResult<T> {
  return {
    ok: false,
    errorCode: 'unsupported',
    message: `${feature} is deferred until after Milestone B verification`,
  };
}

export class SumitStatutoryProvider implements StatutoryInvoicingProvider {
  readonly id = SUMIT_PROVIDER_ID;
  private readonly credentials: InvoicingProviderCredentials;
  private readonly client: SumitHttpClient;

  constructor(options: SumitStatutoryProviderOptions) {
    if (options.environment === 'test' || options.environment == null) {
      // test-only in this cycle
    } else {
      throw new Error('SUMIT production is not enabled in this release cycle');
    }
    this.credentials = options.credentials;
    this.client = options.httpClient ?? createSumitHttpClient(options.credentials);
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

  /** Exposed for reconciliation after confirmed create. */
  mapProviderAmounts(
    billing: CreateExternalDocumentInput['billing'],
    response: { netAmount: string | null; vatAmount: string | null; grossAmount: string | null },
  ): ProviderAmountSnapshot | null {
    if (!response.grossAmount) return null;
    const currency = billing.totalAmount.currency;
    return {
      net: money(response.netAmount ?? billing.subtotalAmount.amount, currency),
      vat: response.vatAmount ? money(response.vatAmount, currency) : billing.taxAmount,
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

    try {
      const response = await this.client.createDocument({
        documentType: SUMIT_DOCUMENT_TYPE_INVOICE,
        externalReference: input.idempotencyKey,
        payload: buildSumitCreatePayload(input.billing),
      });

      const issuedAt = new Date().toISOString();
      return {
        ok: true,
        value: {
          externalId: response.documentId!,
          externalNumber: response.documentNumber,
          externalUrl: null,
          status: 'issued',
          pdf: null,
          issuedAt,
          providerAmounts: this.mapProviderAmounts(input.billing, response),
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

function buildSumitCreatePayload(billing: BillingRecordBridgeRef): Record<string, unknown> {
  const items =
    billing.lines.length > 0
      ? billing.lines.map((line) => ({
          Description: line.description,
          Quantity: line.quantity ? Number(line.quantity) : 1,
          Price: Number.parseFloat(line.lineNet.amount),
        }))
      : [
          {
            Description: billing.reference?.trim() || 'Billing amount',
            Quantity: 1,
            Price: Number.parseFloat(billing.subtotalAmount.amount),
          },
        ];

  return {
    Details: {
      Type: SUMIT_DOCUMENT_TYPE_INVOICE,
      Date: billing.issueDate,
      DueDate: billing.dueDate,
      Currency: billing.totalAmount.currency,
    },
    Customer: billing.customer
      ? {
          Name: billing.customer.name,
          CompanyNumber: billing.customer.companyNumber,
          ExternalIdentifier: billing.customer.externalIdentifier,
          EmailAddress: billing.customer.email,
          Phone: billing.customer.phone,
          Address: billing.customer.address,
          City: billing.customer.city,
          Zip: billing.customer.postalCode,
        }
      : undefined,
    Items: items,
    VATIncluded: billing.vatMode === 'inclusive',
    VATRate: billing.vatRatePercent ?? undefined,
  };
}

export function sumitProviderCapabilities() {
  return {
    ...FULL_ADAPTER_CAPABILITIES,
    creditDocument: false,
    cancelDocument: false,
    allocateReference: false,
  };
}
