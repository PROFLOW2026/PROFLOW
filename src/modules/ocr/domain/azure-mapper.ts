/**
 * Maps Azure Document Intelligence analyzeResult JSON into the canonical OCR
 * document. Azure field names stay in this file.
 */

import type { CanonicalOcrDocument } from './canonical';
import {
  collectVatRateHints,
  documentTypeLabel,
  extractIsraeliCompanyNumber,
  inferCurrencyFromText,
  mergeIdentifierCandidate,
  suggestDocumentTypeFromText,
} from './israeli-normalize';
import type {
  OcrFieldCandidate,
  OcrFieldSource,
  OcrLineItemCandidate,
  OcrSafeRawMetadata,
} from './types';
import { averageConfidence } from './confidence';

interface AzureDocumentField {
  readonly type?: string;
  readonly content?: string;
  readonly confidence?: number;
  readonly valueString?: string;
  readonly valueDate?: string;
  readonly valueNumber?: number;
  readonly valueCurrency?: { readonly amount?: number; readonly currencyCode?: string };
  readonly valueAddress?: { readonly streetAddress?: string; readonly city?: string };
  readonly valueArray?: readonly AzureDocumentField[];
  readonly valueObject?: Record<string, AzureDocumentField>;
}

interface AzureDocument {
  readonly docType?: string;
  readonly fields?: Record<string, AzureDocumentField>;
}

interface AzureAnalyzeResult {
  readonly modelId?: string;
  readonly content?: string;
  readonly pages?: readonly unknown[];
  readonly documents?: readonly AzureDocument[];
  readonly languages?: readonly { readonly locale?: string }[];
  readonly keyValuePairs?: readonly {
    readonly key?: { readonly content?: string };
    readonly value?: { readonly content?: string };
  }[];
}

function blank(provenance: OcrFieldCandidate['provenance']): OcrFieldCandidate {
  return { value: null, confidence: null, provenance };
}

function fieldValue(field: AzureDocumentField | undefined): string | null {
  if (!field) return null;
  if (field.valueCurrency && typeof field.valueCurrency.amount === 'number') {
    return String(field.valueCurrency.amount);
  }
  if (typeof field.valueNumber === 'number') return String(field.valueNumber);
  if (field.valueDate) {
    const iso = field.valueDate.slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : field.valueDate;
  }
  if (field.valueString?.trim()) return field.valueString.trim();
  if (field.content?.trim()) return field.content.trim();
  if (field.valueAddress) {
    return [field.valueAddress.streetAddress, field.valueAddress.city].filter(Boolean).join(', ') || null;
  }
  return null;
}

function candidateFrom(
  field: AzureDocumentField | undefined,
  provenance: OcrFieldCandidate['provenance'],
): OcrFieldCandidate {
  if (!field) return blank(provenance);
  return {
    value: fieldValue(field),
    confidence: typeof field.confidence === 'number' ? field.confidence : null,
    provenance,
  };
}

function currencyCodeFrom(field: AzureDocumentField | undefined, content: string): string | null {
  const code = field?.valueCurrency?.currencyCode?.trim().toUpperCase();
  if (code && /^[A-Z]{3}$/.test(code)) return code;
  return inferCurrencyFromText(null, content);
}

function lineFromObject(
  object: Record<string, AzureDocumentField> | undefined,
  provenance: OcrFieldCandidate['provenance'],
): OcrLineItemCandidate {
  return {
    description: candidateFrom(object?.Description, provenance),
    quantity: candidateFrom(object?.Quantity, provenance),
    unit: candidateFrom(object?.Unit, provenance),
    unitPrice: candidateFrom(object?.UnitPrice, provenance),
    netAmount: candidateFrom(object?.Amount, provenance),
    taxAmount: candidateFrom(object?.Tax, provenance),
    lineTotal: candidateFrom(object?.Amount, provenance),
  };
}

function kvMap(
  pairs: AzureAnalyzeResult['keyValuePairs'],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const pair of pairs ?? []) {
    const key = pair.key?.content?.trim();
    const value = pair.value?.content?.trim();
    if (key && value) map.set(key, value);
  }
  return map;
}

function pickKv(map: Map<string, string>, labels: readonly string[]): string | null {
  for (const [key, value] of map) {
    const normalized = key.replace(/\s+/g, ' ');
    if (labels.some((label) => normalized.includes(label))) return value;
  }
  return null;
}

export function mapAzureAnalyzeResult(input: {
  analyzeResult: unknown;
  providerId: string;
  model: string;
  requestId?: string;
  extractedAt: string;
}): CanonicalOcrDocument {
  const result = (input.analyzeResult ?? {}) as AzureAnalyzeResult;
  const provenance = {
    source: 'ocr' as OcrFieldSource,
    providerId: input.providerId,
    model: input.model,
    extractedAt: input.extractedAt,
  };
  const document = result.documents?.[0];
  const fields = document?.fields ?? {};
  const content = result.content ?? '';
  const kv = kvMap(result.keyValuePairs);

  const merchant = candidateFrom(fields.MerchantName ?? fields.VendorName, provenance);
  const vendorName =
    merchant.value != null
      ? merchant
      : {
          ...blank(provenance),
          value: pickKv(kv, ['שם העסק', 'שם עסק', 'ספק', 'Vendor']),
          confidence: 0.55,
        };

  const companyFromProvider = candidateFrom(
    fields.VendorTaxId ?? fields.MerchantTaxId ?? fields.CompanyNumber ?? fields.AuthorizedDealerNumber,
    provenance,
  );
  const companyNumber = mergeIdentifierCandidate(
    companyFromProvider,
    extractIsraeliCompanyNumber(content) ?? pickKv(kv, ['ח.פ', 'חפ', 'ע.מ', 'עוסק']),
    provenance,
  );

  const invoiceId = candidateFrom(
    fields.InvoiceId ?? fields.TransactionId ?? fields.InvoiceNumber ?? fields.DocumentNumber,
    provenance,
  );
  const reference =
    invoiceId.value != null
      ? invoiceId
      : {
          ...blank(provenance),
          value: pickKv(kv, ['מספר חשבונית', 'מספר מסמך', 'Invoice']),
          confidence: 0.55,
        };

  const issueDate = candidateFrom(
    fields.InvoiceDate ?? fields.TransactionDate ?? fields.Date,
    provenance,
  );
  const dueDate = candidateFrom(fields.DueDate, provenance);
  const orderNumber = candidateFrom(fields.PurchaseOrder, provenance);

  const subTotal = candidateFrom(
    fields.SubTotal ?? fields.Subtotal ?? fields.NetAmount ?? fields.AmountBeforeVat,
    provenance,
  );
  const tax = candidateFrom(fields.TotalTax ?? fields.Tax ?? fields.VatAmount, provenance);
  const total = candidateFrom(
    fields.InvoiceTotal ?? fields.Total ?? fields.TotalAmount ?? fields.Amount,
    provenance,
  );

  const currencyValue =
    currencyCodeFrom(fields.InvoiceTotal ?? fields.Total ?? fields.TotalAmount ?? fields.SubTotal, content) ??
    inferCurrencyFromText(null, content);

  const documentTypeKey = suggestDocumentTypeFromText(
    `${document?.docType ?? ''} ${content} ${pickKv(kv, ['סוג מסמך']) ?? ''}`,
  );
  const typeLabel = documentTypeLabel(documentTypeKey);

  const itemsField = fields.Items;
  const lineObjects = itemsField?.valueArray ?? [];
  const lines: OcrLineItemCandidate[] = lineObjects.map((item) =>
    lineFromObject(item.valueObject, provenance),
  );

  const lineDescriptionText = lines
    .map((line) => line.description.value?.trim())
    .filter(Boolean)
    .join('; ')
    .slice(0, 2000);
  const descriptionText =
    candidateFrom(fields.Description, provenance).value ??
    (lineDescriptionText || null);

  const fieldConfidences = [
    vendorName.confidence,
    companyNumber.confidence,
    reference.confidence,
    issueDate.confidence,
    subTotal.confidence,
    tax.confidence,
    total.confidence,
  ];

  const metadata: OcrSafeRawMetadata = {
    providerId: input.providerId,
    model: input.model,
    requestId: input.requestId,
    pageCount: result.pages?.length,
    extractedAt: input.extractedAt,
    overallConfidence: averageConfidence(fieldConfidences),
    textSnippets: content ? [content.slice(0, 200)] : [],
    providerStatus: 'succeeded',
    languages: (result.languages ?? []).map((lang) => lang.locale).filter((value): value is string => Boolean(value)),
    vatRates: collectVatRateHints(content),
    documentTypeKey,
  };

  return {
    documentTypeKey,
    documentTypeLabel: {
      value: typeLabel || null,
      confidence: documentTypeKey === 'unknown' ? 0.3 : 0.7,
      provenance,
    },
    supplier: {
      name: vendorName,
      companyNumber,
      vatId: mergeIdentifierCandidate(
        candidateFrom(fields.VendorVAT ?? fields.VatId, provenance),
        pickKv(kv, ['מע״מ', 'מספר מע״מ', 'VAT']),
        provenance,
      ),
      address: candidateFrom(fields.VendorAddress ?? fields.MerchantAddress, provenance),
      phone: candidateFrom(fields.MerchantPhoneNumber, provenance),
      email: blank(provenance),
    },
    identity: {
      documentNumber: reference,
      issueDate,
      dueDate,
      orderNumber,
    },
    money: {
      currency: {
        value: currencyValue,
        confidence: currencyValue ? 0.85 : null,
        provenance,
      },
      net: subTotal.value ? subTotal : total,
      tax,
      gross: total.value ? total : subTotal,
      vatRates: metadata.vatRates ?? [],
    },
    lines,
    description: {
      value: descriptionText,
      confidence: descriptionText ? 0.6 : null,
      provenance,
    },
    languages: metadata.languages ?? [],
    pageCount: metadata.pageCount ?? null,
    overallConfidence: metadata.overallConfidence ?? null,
    metadata,
  };
}
