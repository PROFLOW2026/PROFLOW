import type { ExternalDocumentKind } from '../../domain/types';
import type {
  BillingRecordBridgeRef,
  StatutoryLineItem,
  StatutoryPartySnapshot,
  StatutoryPaymentSnapshot,
} from '../../domain/types';

/** SUMIT Accounting_Typed_DocumentType (OpenAPI 2026). */
export const SUMIT_DOCUMENT_TYPE_INVOICE = 0;
export const SUMIT_DOCUMENT_TYPE_INVOICE_AND_RECEIPT = 1;
export const SUMIT_DOCUMENT_TYPE_RECEIPT = 2;
export const SUMIT_DOCUMENT_TYPE_PROFORMA = 3;

/**
 * SUMIT Accounting_Typed_IncomeItemSearchMode — None (1).
 * CLOSED BY DESIGN: documents are created with an inline customer and SearchMode None.
 * No customer/item catalog sync, and no Hashavshevet adapter.
 */
export const SUMIT_INCOME_ITEM_SEARCH_MODE_NONE = 1;
export const SUMIT_CATALOG_SYNC = 'closed_by_design' as const;

export function resolveSumitDocumentType(kind: ExternalDocumentKind): number {
  switch (kind) {
    case 'tax_invoice':
      return SUMIT_DOCUMENT_TYPE_INVOICE;
    case 'tax_invoice_receipt':
      return SUMIT_DOCUMENT_TYPE_INVOICE_AND_RECEIPT;
    case 'receipt':
      return SUMIT_DOCUMENT_TYPE_RECEIPT;
    case 'transaction_invoice':
    case 'proforma':
      return SUMIT_DOCUMENT_TYPE_PROFORMA;
    default:
      return SUMIT_DOCUMENT_TYPE_INVOICE;
  }
}

export function isSumitTransactionInvoiceSupported(): boolean {
  return true;
}

function mapSumitCustomer(customer: StatutoryPartySnapshot): Record<string, unknown> {
  return {
    Name: customer.name,
    CompanyNumber: customer.companyNumber,
    ExternalIdentifier: customer.externalIdentifier,
    EmailAddress: customer.email,
    Phone: customer.phone,
    Address: customer.address,
    City: customer.city,
    ZipCode: customer.postalCode,
    NoVAT: customer.noVat ?? false,
  };
}

function resolveLineAmounts(line: StatutoryLineItem): {
  quantity: number;
  unitPrice: number;
  totalPrice: number;
} {
  const lineTotal = Number.parseFloat(line.lineNet.amount);
  const parsedQuantity = line.quantity ? Number(line.quantity) : null;
  const parsedUnitPrice = line.unitPrice ? Number.parseFloat(line.unitPrice) : null;

  if (parsedQuantity != null && parsedQuantity > 0 && parsedUnitPrice != null) {
    return {
      quantity: parsedQuantity,
      unitPrice: parsedUnitPrice,
      totalPrice: parsedQuantity * parsedUnitPrice,
    };
  }

  return {
    quantity: 1,
    unitPrice: lineTotal,
    totalPrice: lineTotal,
  };
}

/** Maps one PF billing line → SUMIT Accounting_Typed_DocumentItem (OpenAPI + live validation). */
export function mapSumitDocumentItem(line: StatutoryLineItem): Record<string, unknown> {
  const { quantity, unitPrice, totalPrice } = resolveLineAmounts(line);

  return {
    Item: {
      Name: line.description,
      SearchMode: SUMIT_INCOME_ITEM_SEARCH_MODE_NONE,
    },
    Quantity: quantity,
    UnitPrice: unitPrice,
    TotalPrice: totalPrice,
  };
}

function mapSumitItems(billing: BillingRecordBridgeRef): Record<string, unknown>[] {
  if (billing.lines.length > 0) {
    return billing.lines.map((line) => mapSumitDocumentItem(line));
  }

  const fallbackName = billing.reference?.trim() || 'Billing amount';
  return [
    mapSumitDocumentItem({
      description: fallbackName,
      lineNet: billing.subtotalAmount,
      quantity: '1',
      unitPrice: billing.subtotalAmount.amount,
    }),
  ];
}

function mapSumitPayment(
  payment: StatutoryPaymentSnapshot,
  billing: BillingRecordBridgeRef,
): Record<string, unknown> {
  const gross = Number.parseFloat(payment.grossAmount);
  const method = payment.method?.trim().toLowerCase() ?? '';

  const base: Record<string, unknown> = {
    Amount: gross,
  };

  if (method.includes('העבר') || method.includes('bank') || method.includes('transfer')) {
    return {
      ...base,
      Details_BankTransfer: {
        DueDate: payment.paymentDate,
        Reference: payment.reference,
      },
    };
  }

  if (method.includes('מזומ') || method.includes('cash')) {
    return { ...base, Details_Cash: {} };
  }

  if (method.includes('שיק') || method.includes('cheque') || method.includes('check')) {
    return {
      ...base,
      Details_Cheque: {
        DueDate: payment.paymentDate,
        Reference: payment.reference,
      },
    };
  }

  return {
    ...base,
    Details_Other: {
      Description: payment.method?.trim() || `Payment ${billing.reference ?? payment.paymentId}`,
    },
  };
}

export interface BuildSumitCreatePayloadInput {
  readonly billing: BillingRecordBridgeRef;
  readonly kind?: ExternalDocumentKind;
  readonly payment?: StatutoryPaymentSnapshot | null;
  readonly linkedTaxInvoiceExternalId?: string | null;
}

/**
 * Build the ProjectFlow-side create payload (Credentials added by HTTP client).
 * Matches SUMIT OpenAPI Accounting_Documents_Create_Request.
 */
export function buildSumitCreatePayload(input: BuildSumitCreatePayloadInput): Record<string, unknown> {
  const { billing, kind = 'tax_invoice', payment = null, linkedTaxInvoiceExternalId = null } =
    input;

  if (!billing.customer?.name?.trim()) {
    throw new Error('Customer snapshot is required for SUMIT create payload');
  }

  const documentType = resolveSumitDocumentType(kind);
  const documentDate = payment?.paymentDate ?? billing.issueDate;
  const payload: Record<string, unknown> = {
    Details: {
      Type: documentType,
      Date: documentDate,
      DueDate: billing.dueDate,
      Currency: billing.totalAmount.currency,
      Customer: mapSumitCustomer(billing.customer),
    },
    Items: mapSumitItems(billing),
    VATIncluded: billing.vatMode === 'inclusive',
    VATRate: billing.vatRatePercent ?? undefined,
  };

  if (linkedTaxInvoiceExternalId) {
    const parsed = Number.parseInt(linkedTaxInvoiceExternalId, 10);
    if (Number.isFinite(parsed)) {
      payload.OriginalDocumentID = parsed;
    }
  }

  if (payment && (kind === 'receipt' || kind === 'tax_invoice_receipt')) {
    payload.Payments = [mapSumitPayment(payment, billing)];
  }

  return payload;
}

/** Exact JSON body shape sent to POST /accounting/documents/create/ (excluding Credentials). */
export function assembleSumitCreateRequestBody(
  payload: Record<string, unknown>,
  externalReference: string,
): Record<string, unknown> {
  const nestedDetails =
    payload.Details && typeof payload.Details === 'object'
      ? (payload.Details as Record<string, unknown>)
      : {};
  const { Details: _details, ...restPayload } = payload;

  return {
    Details: {
      ...nestedDetails,
      ExternalReference: externalReference,
    },
    ...restPayload,
  };
}
