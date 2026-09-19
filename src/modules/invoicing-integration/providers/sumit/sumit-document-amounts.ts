export interface SumitParsedDocumentAmounts {
  readonly netAmount: string | null;
  readonly vatAmount: string | null;
  readonly grossAmount: string | null;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function unwrapSumitPayload(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object') return null;
  const root = raw as Record<string, unknown>;
  if (root.Data && typeof root.Data === 'object') {
    return root.Data as Record<string, unknown>;
  }
  return root;
}

function formatSumitAmount(value: number): string {
  return value.toFixed(6);
}

/**
 * Derive NET/VAT/GROSS from official SUMIT getdetails/create payloads only.
 * Returns null fields when SUMIT does not supply enough data — never PF fallbacks.
 */
export function parseSumitDocumentAmounts(raw: unknown): SumitParsedDocumentAmounts {
  const payload = unwrapSumitPayload(raw);
  if (!payload) {
    return { netAmount: null, vatAmount: null, grossAmount: null };
  }

  const document =
    payload.Document && typeof payload.Document === 'object'
      ? (payload.Document as Record<string, unknown>)
      : null;
  const items = Array.isArray(payload.Items)
    ? (payload.Items as Record<string, unknown>[])
    : [];

  let netFromItems: number | null = null;
  let vatFromItems: number | null = null;

  if (items.length > 0) {
    let netSum = 0;
    let vatSum = 0;
    let sawNet = false;
    let sawVat = false;

    for (const item of items) {
      const totalPrice = asFiniteNumber(item.TotalPrice);
      const lineVat = asFiniteNumber(item.VAT);
      if (totalPrice != null) {
        netSum += totalPrice;
        sawNet = true;
      }
      if (lineVat != null) {
        vatSum += lineVat;
        sawVat = true;
      }
    }

    if (sawNet) netFromItems = netSum;
    if (sawVat) vatFromItems = vatSum;
  }

  const grossFromDocument =
    asFiniteNumber(document?.CompanyValue) ?? asFiniteNumber(document?.DocumentValue);

  const net = netFromItems;
  let vat = vatFromItems;
  let gross = grossFromDocument;

  if (net != null && gross != null && vat == null) {
    vat = gross - net;
  } else if (net != null && vat != null && gross == null) {
    gross = net + vat;
  }

  if (net == null || vat == null || gross == null) {
    return { netAmount: null, vatAmount: null, grossAmount: null };
  }

  return {
    netAmount: formatSumitAmount(net),
    vatAmount: formatSumitAmount(vat),
    grossAmount: formatSumitAmount(gross),
  };
}
