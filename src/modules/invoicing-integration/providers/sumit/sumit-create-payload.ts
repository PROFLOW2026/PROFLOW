import type { BillingRecordBridgeRef, StatutoryPartySnapshot } from '../../domain/types';

/** SUMIT Accounting_Typed_DocumentType — Invoice = 0 */
export const SUMIT_DOCUMENT_TYPE_INVOICE = 0;

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

function mapSumitItems(billing: BillingRecordBridgeRef): Record<string, unknown>[] {
  if (billing.lines.length > 0) {
    return billing.lines.map((line) => ({
      Description: line.description,
      Quantity: line.quantity ? Number(line.quantity) : 1,
      UnitPrice: Number.parseFloat(line.lineNet.amount),
    }));
  }

  return [
    {
      Description: billing.reference?.trim() || 'Billing amount',
      Quantity: 1,
      UnitPrice: Number.parseFloat(billing.subtotalAmount.amount),
    },
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
