/**
 * Maps Azure Document Intelligence analyzeResult JSON into the canonical OCR
 * document. Azure field names stay in this file.
 */

import type { CanonicalOcrDocument, CanonicalOcrMoney } from './canonical';
import {
  collectVatRateHints,
  documentTypeLabel,
  extractIsraeliCustomerCompanyNumber,
  extractIsraeliInvoiceNumber,
  extractIsraeliSupplierCompanyNumber,
  extractLabeledMoneyAmount,
  formatMoneyAmount,
  HEBREW_DISCOUNT_LABELS,
  HEBREW_GROSS_LABELS,
  HEBREW_NET_LABELS,
  inferCurrencyFromText,
  mergeIdentifierCandidate,
  moneyNearlyEqual,
  normalizeVatRateToken,
  parseMoneyToken,
  suggestDocumentTypeFromText,
} from './israeli-normalize';
import type {
  OcrExtractionMethod,
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

function blank(
  provenance: OcrFieldCandidate['provenance'],
  method?: OcrExtractionMethod,
): OcrFieldCandidate {
  return {
    value: null,
    confidence: null,
    provenance: method ? { ...provenance, extractionMethod: method } : provenance,
  };
}

function withMethod(
  provenance: OcrFieldCandidate['provenance'],
  method: OcrExtractionMethod,
  snippet?: string,
): OcrFieldCandidate['provenance'] {
  return {
    ...provenance,
    extractionMethod: method,
    ...(snippet ? { rawTextSnippet: snippet.slice(0, 80) } : {}),
  };
}

function fieldValue(field: AzureDocumentField | undefined): string | null {
  if (!field) return null;
  if (field.valueCurrency && typeof field.valueCurrency.amount === 'number') {
    return formatMoneyAmount(field.valueCurrency.amount);
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
  if (!field) return blank(provenance, 'structured');
  return {
    value: fieldValue(field),
    confidence: typeof field.confidence === 'number' ? field.confidence : null,
    provenance: withMethod(provenance, 'structured'),
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
  const amount = candidateFrom(object?.Amount, provenance);
  const tax = candidateFrom(object?.Tax, provenance);
  const amountNum = parseMoneyToken(amount.value);
  const taxNum = parseMoneyToken(tax.value);
  const inclusive =
    amountNum != null && taxNum != null
      ? {
          value: formatMoneyAmount(amountNum + taxNum),
          confidence:
            amount.confidence == null || tax.confidence == null
              ? null
              : Math.min(amount.confidence, tax.confidence),
          provenance: withMethod(provenance, 'reconciled'),
        }
      : blank(provenance);

  return {
    description: candidateFrom(object?.Description, provenance),
    quantity: candidateFrom(object?.Quantity, provenance),
    unit: candidateFrom(object?.Unit, provenance),
    unitPrice: candidateFrom(object?.UnitPrice, provenance),
    // Amount is the line amount; do not also copy it into lineTotal unless tax is separate.
    netAmount: amount,
    taxAmount: tax,
    lineTotal: inclusive.value ? inclusive : blank(provenance),
    productCode: candidateFrom(object?.ProductCode, provenance),
    taxRate: (() => {
      const rate = candidateFrom(object?.TaxRate, provenance);
      const normalized = normalizeVatRateToken(rate.value);
      return normalized
        ? { ...rate, value: normalized }
        : rate;
    })(),
  };
}

function kvMap(pairs: AzureAnalyzeResult['keyValuePairs']): Map<string, string> {
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

function parseVatRateToken(raw: string | null | undefined): string | null {
  return normalizeVatRateToken(raw);
}

export interface MappedTaxDetail {
  readonly rate: string | null;
  readonly amount: string | null;
  readonly taxableAmount: string | null;
}

function extractTaxDetails(
  fields: Record<string, AzureDocumentField>,
): { details: MappedTaxDetail[]; rates: string[]; primaryRate: OcrFieldCandidate | null } {
  const details: MappedTaxDetail[] = [];
  const rates: string[] = [];
  let primaryRate: OcrFieldCandidate | null = null;

  for (const detail of fields.TaxDetails?.valueArray ?? []) {
    const rateRaw = fieldValue(detail.valueObject?.Rate);
    const rate = parseVatRateToken(rateRaw);
    const amountRaw = fieldValue(detail.valueObject?.Amount);
    const taxableRaw = fieldValue(
      detail.valueObject?.TaxableAmount ?? detail.valueObject?.NetAmount,
    );
    const amount =
      amountRaw && parseMoneyToken(amountRaw) != null
        ? formatMoneyAmount(parseMoneyToken(amountRaw)!)
        : null;
    const taxableAmount =
      taxableRaw && parseMoneyToken(taxableRaw) != null
        ? formatMoneyAmount(parseMoneyToken(taxableRaw)!)
        : null;
    details.push({ rate, amount, taxableAmount });
    if (rate && !rates.includes(rate)) rates.push(rate);
    if (rate && !primaryRate) {
      primaryRate = {
        value: rate,
        confidence:
          typeof detail.valueObject?.Rate?.confidence === 'number'
            ? detail.valueObject.Rate.confidence
            : 0.8,
        provenance: {
          source: 'ocr',
          extractionMethod: 'structured',
          rawTextSnippet: rateRaw?.slice(0, 40),
        },
      };
    }
  }

  if (rates.length !== 1) {
    primaryRate = null;
  }

  return { details, rates, primaryRate };
}

function resolveMoneyFields(input: {
  subTotal: OcrFieldCandidate;
  discount: OcrFieldCandidate;
  tax: OcrFieldCandidate;
  total: OcrFieldCandidate;
  amountDue: OcrFieldCandidate;
  content: string;
  provenance: OcrFieldCandidate['provenance'];
  vatRateHints: readonly string[];
}): CanonicalOcrMoney {
  const provenance = input.provenance;
  const subtotal = input.subTotal;
  let discount = input.discount;
  const tax = input.tax;
  let gross = input.total.value ? input.total : blank(provenance, 'structured');
  const amountDue = input.amountDue;
  let net = blank(provenance, 'structured');

  if (!discount.value) {
    const fromText = extractLabeledMoneyAmount(input.content, HEBREW_DISCOUNT_LABELS);
    if (fromText) {
      discount = {
        value: fromText.value,
        confidence: 0.62,
        provenance: withMethod(provenance, 'hebrew_labeled', fromText.snippet),
      };
    }
  }

  if (!gross.value) {
    const fromText = extractLabeledMoneyAmount(input.content, HEBREW_GROSS_LABELS);
    if (fromText) {
      gross = {
        value: fromText.value,
        confidence: 0.64,
        provenance: withMethod(provenance, 'hebrew_labeled', fromText.snippet),
      };
    }
  }

  const subtotalNum = parseMoneyToken(subtotal.value);
  const discountNum = parseMoneyToken(discount.value) ?? 0;
  const taxNum = parseMoneyToken(tax.value);
  const grossNum = parseMoneyToken(gross.value);

  if (subtotalNum != null && discount.value) {
    const afterDiscount = subtotalNum - discountNum;
    net = {
      value: formatMoneyAmount(afterDiscount),
      confidence:
        grossNum != null &&
        taxNum != null &&
        moneyNearlyEqual(afterDiscount + taxNum, grossNum)
          ? subtotal.confidence == null || discount.confidence == null
            ? 0.7
            : Math.min(subtotal.confidence, discount.confidence, 0.85)
          : 0.65,
      provenance: withMethod(provenance, 'reconciled'),
    };
  } else if (subtotalNum != null && !discount.value) {
    net = { ...subtotal, provenance: withMethod(subtotal.provenance, 'structured') };
  }

  if (!net.value) {
    const labeledNet = extractLabeledMoneyAmount(input.content, HEBREW_NET_LABELS);
    if (labeledNet) {
      net = {
        value: labeledNet.value,
        confidence: 0.6,
        provenance: withMethod(provenance, 'hebrew_labeled', labeledNet.snippet),
      };
    }
  }

  if (!net.value && grossNum != null && taxNum != null) {
    const derived = grossNum - taxNum;
    if (derived >= 0) {
      net = {
        value: formatMoneyAmount(derived),
        confidence: 0.55,
        provenance: withMethod(provenance, 'reconciled'),
      };
    }
  }

  let vatRate = blank(provenance, 'structured');
  if (input.vatRateHints.length === 1) {
    const normalized = normalizeVatRateToken(input.vatRateHints[0]) ?? input.vatRateHints[0]!;
    vatRate = {
      value: normalized,
      confidence: 0.7,
      provenance: withMethod(provenance, 'hebrew_labeled'),
    };
  }

  return {
    currency: blank(provenance),
    subtotal,
    discount,
    net,
    tax,
    vatRate,
    gross,
    amountDue,
    vatRates: input.vatRateHints,
  };
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
    extractionMethod: 'structured' as OcrExtractionMethod,
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
          provenance: withMethod(provenance, 'kv'),
        };

  const customerTaxFromProvider = candidateFrom(fields.CustomerTaxId, provenance);
  const customerTaxFromText = extractIsraeliCustomerCompanyNumber(content);
  const customerTaxId =
    customerTaxFromProvider.value ??
    customerTaxFromText ??
    pickKv(kv, ['מס לקוח', 'לכבוד ח.פ', 'Customer Tax']);

  const supplierIds: string[] = [];
  const customerIds = customerTaxId ? [customerTaxId.replace(/[^\d]/g, '')].filter(Boolean) : [];

  const companyFromProvider = candidateFrom(
    fields.VendorTaxId ?? fields.MerchantTaxId ?? fields.CompanyNumber ?? fields.AuthorizedDealerNumber,
    provenance,
  );
  const supplierFromText = extractIsraeliSupplierCompanyNumber(content);
  const companyNumber = mergeIdentifierCandidate(
    companyFromProvider,
    supplierFromText && !customerIds.includes(supplierFromText)
      ? supplierFromText
      : pickKv(kv, ['ח.פ', 'חפ', 'ע.מ', 'עוסק']),
    provenance,
  );
  if (companyNumber.value) supplierIds.push(companyNumber.value);

  const invoiceId = candidateFrom(
    fields.InvoiceId ?? fields.TransactionId ?? fields.InvoiceNumber ?? fields.DocumentNumber,
    provenance,
  );
  let reference = invoiceId;
  if (!reference.value) {
    const fromKv = pickKv(kv, [
      'מספר חשבונית',
      'מס חשבונית',
      "מס' חשבונית",
      'מס. חשבונית',
      'מספר מסמך',
      'Invoice',
    ]);
    if (fromKv) {
      reference = {
        value: fromKv.replace(/[^\dA-Za-z\-_/]/g, '') || fromKv,
        confidence: 0.55,
        provenance: withMethod(provenance, 'kv', fromKv),
      };
    }
  }
  if (!reference.value) {
    const hebrew = extractIsraeliInvoiceNumber(content, {
      supplierIds,
      customerIds,
    });
    if (hebrew) {
      reference = {
        value: hebrew.value,
        confidence: 0.68,
        provenance: withMethod(provenance, hebrew.method, hebrew.snippet),
      };
    }
  }

  const issueDate = candidateFrom(
    fields.InvoiceDate ?? fields.TransactionDate ?? fields.Date,
    provenance,
  );
  const dueDate = candidateFrom(fields.DueDate, provenance);
  const orderNumber = candidateFrom(fields.PurchaseOrder, provenance);

  const subTotal = candidateFrom(
    fields.SubTotal ?? fields.Subtotal ?? fields.AmountBeforeVat,
    provenance,
  );
  const discountField = candidateFrom(fields.TotalDiscount, provenance);
  const tax = candidateFrom(fields.TotalTax ?? fields.Tax ?? fields.VatAmount, provenance);
  const total = candidateFrom(
    fields.InvoiceTotal ?? fields.Total ?? fields.TotalAmount,
    provenance,
  );
  const amountDueField = candidateFrom(fields.AmountDue, provenance);

  const taxDetails = extractTaxDetails(fields);
  const vatHints = [...taxDetails.rates, ...collectVatRateHints(content)]
    .map((rate) => normalizeVatRateToken(rate) ?? rate)
    .filter((value, index, all) => Boolean(value) && all.indexOf(value) === index);

  const moneyResolvedBase = resolveMoneyFields({
    subTotal,
    discount: discountField,
    tax,
    total,
    amountDue: amountDueField,
    content,
    provenance,
    vatRateHints: vatHints,
  });
  const moneyResolved: CanonicalOcrMoney = {
    ...moneyResolvedBase,
    // Structured TaxDetails wins only when unambiguous (single rate).
    vatRate:
      taxDetails.primaryRate?.value && vatHints.length === 1
        ? taxDetails.primaryRate
        : vatHints.length === 1
          ? moneyResolvedBase.vatRate
          : blank(provenance, 'structured'),
    vatRates: vatHints,
  };

  const currencyFromField =
    currencyCodeFrom(
      fields.InvoiceTotal ?? fields.Total ?? fields.AmountDue ?? fields.SubTotal ?? fields.TotalTax,
      content,
    ) ?? inferCurrencyFromText(null, content);

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
    moneyResolved.subtotal.confidence,
    moneyResolved.discount.confidence,
    moneyResolved.net.confidence,
    moneyResolved.tax.confidence,
    moneyResolved.gross.confidence,
  ];

  const customerName =
    candidateFrom(fields.CustomerName ?? fields.CustomerAddressRecipient, provenance).value ??
    pickKv(kv, ['לכבוד', 'לקוח', 'Customer']);

  const metadata: OcrSafeRawMetadata = {
    providerId: input.providerId,
    model: input.model,
    requestId: input.requestId,
    pageCount: result.pages?.length,
    extractedAt: input.extractedAt,
    overallConfidence: averageConfidence(fieldConfidences),
    textSnippets: content ? [content.slice(0, 200)] : [],
    providerStatus: 'succeeded',
    languages: (result.languages ?? [])
      .map((lang) => lang.locale)
      .filter((value): value is string => Boolean(value)),
    vatRates: vatHints,
    documentTypeKey,
    customer:
      customerName || customerTaxId
        ? {
            name: customerName,
            taxId: customerTaxId,
            customerId: candidateFrom(fields.CustomerId, provenance).value,
          }
        : undefined,
    paymentTerm: candidateFrom(fields.PaymentTerm, provenance).value,
    taxDetails: taxDetails.details.length > 0 ? taxDetails.details : undefined,
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
        value: currencyFromField,
        confidence: currencyFromField ? 0.85 : null,
        provenance: withMethod(provenance, 'structured'),
      },
      subtotal: moneyResolved.subtotal,
      discount: moneyResolved.discount,
      net: moneyResolved.net,
      tax: moneyResolved.tax,
      vatRate: moneyResolved.vatRate,
      gross: moneyResolved.gross,
      amountDue: moneyResolved.amountDue,
      vatRates: vatHints,
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
