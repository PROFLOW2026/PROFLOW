import type {
  BillingRecordBridgeRef,
  StatutoryLineItem,
  StatutoryPartySnapshot,
} from '../../domain/types';

/** SUMIT Accounting_Typed_DocumentType — Invoice = 0 */
export const SUMIT_DOCUMENT_TYPE_INVOICE = 0;

/**
 * SUMIT Accounting_Typed_IncomeItemSearchMode — None (1).
 * Ad-hoc document line: use inline Item details, do not search income-item catalog.
 */
export const SUMIT_INCOME_ITEM_SEARCH_MODE_NONE = 1;

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
  const subtotal = Number.parseFloat(billing.subtotalAmount.amount);

  return [
    mapSumitDocumentItem({
      description: fallbackName,
      lineNet: billing.subtotalAmount,
      quantity: '1',
      unitPrice: billing.subtotalAmount.amount,
    }),
  ];
}

/**
 * Build the ProjectFlow-side create payload (Credentials added by HTTP client).
 * Matches SUMIT OpenAPI Accounting_Documents_Create_Request:
 * - Details.Customer, Details.Type, Details.Date, Details.DueDate, Details.Currency, Details.ExternalReference
 * - top-level Items, VATIncluded, VATRate
 */
export function buildSumitCreatePayload(billing: BillingRecordBridgeRef): Record<string, unknown> {
  if (!billing.customer?.name?.trim()) {
    throw new Error('Customer snapshot is required for SUMIT create payload');
  }

  return {
    Details: {
      Type: SUMIT_DOCUMENT_TYPE_INVOICE,
      Date: billing.issueDate,
      DueDate: billing.dueDate,
      Currency: billing.totalAmount.currency,
      Customer: mapSumitCustomer(billing.customer),
    },
    Items: mapSumitItems(billing),
    VATIncluded: billing.vatMode === 'inclusive',
    VATRate: billing.vatRatePercent ?? undefined,
  };
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
