import type { CreateExpenseInput } from '@/modules/expenses';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import type {
  OcrCandidateFieldKey,
  OcrFieldCandidate,
  OcrLineItemCandidate,
  OcrNonCanonicalSuggestions,
  ReceiptExtractionCandidates,
} from './types';
import { OCR_CANDIDATE_FIELD_KEYS } from './types';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const MONEY_PATTERN = /^-?\d+(\.\d+)?$/;

export interface FieldMappingIssue {
  readonly field: OcrCandidateFieldKey | 'amount';
  readonly message: string;
  readonly severity: 'error' | 'warning';
}

export type CandidateFieldOverrides = Partial<Record<OcrCandidateFieldKey, string | null>>;

function blankSuggestions(): OcrNonCanonicalSuggestions {
  return { projectLabel: null, categoryLabel: null };
}

export function applyFieldOverrides(
  candidates: ReceiptExtractionCandidates,
  overrides: CandidateFieldOverrides | undefined,
): ReceiptExtractionCandidates {
  if (!overrides) return candidates;

  const next = { ...candidates };
  for (const key of OCR_CANDIDATE_FIELD_KEYS) {
    if (!(key in overrides)) continue;
    const value = overrides[key] ?? null;
    const trimmed = typeof value === 'string' ? value.trim() : null;
    next[key] = {
      value: trimmed === '' ? null : trimmed,
      confidence: null,
      provenance: { source: 'user_override' },
    };
  }
  return next;
}

export function validateMappedCandidates(
  candidates: ReceiptExtractionCandidates,
): FieldMappingIssue[] {
  const issues: FieldMappingIssue[] = [];

  const currency = candidates.currency.value?.trim().toUpperCase() ?? null;
  if (!currency) {
    issues.push({ field: 'currency', message: 'Currency is required', severity: 'error' });
  } else if (!CURRENCY_PATTERN.test(currency)) {
    issues.push({
      field: 'currency',
      message: 'Currency must be a 3-letter ISO code',
      severity: 'error',
    });
  }

  const gross = candidates.gross.value?.trim() ?? null;
  const net = candidates.net.value?.trim() ?? null;
  const tax = candidates.tax.value?.trim() ?? null;

  if (!gross && !net) {
    issues.push({
      field: 'amount',
      message: 'Gross or net amount is required to create an expense',
      severity: 'error',
    });
  }

  for (const [field, raw] of [
    ['gross', gross],
    ['net', net],
    ['tax', tax],
  ] as const) {
    if (raw == null) continue;
    if (!MONEY_PATTERN.test(raw)) {
      issues.push({
        field,
        message: `${field} must be a decimal string`,
        severity: 'error',
      });
    }
  }

  for (const [field, raw] of [
    ['date', candidates.date.value?.trim() ?? null],
    ['dueDate', candidates.dueDate.value?.trim() ?? null],
  ] as const) {
    if (raw && !DATE_PATTERN.test(raw)) {
      issues.push({
        field,
        message: `${field} must be YYYY-MM-DD`,
        severity: 'error',
      });
    }
  }

  const vendor = candidates.vendor.value?.trim() ?? null;
  if (vendor && vendor.length > 500) {
    issues.push({
      field: 'vendor',
      message: 'Vendor name is too long',
      severity: 'error',
    });
  }

  const description = candidates.description.value?.trim() ?? null;
  if (description && description.length > 2000) {
    issues.push({
      field: 'description',
      message: 'Description is too long',
      severity: 'error',
    });
  }

  return issues;
}

export function joinLineDescriptions(lines: readonly OcrFieldCandidate[]): string | null {
  const parts = lines
    .map((line) => line.value?.trim())
    .filter((value): value is string => Boolean(value));
  if (parts.length === 0) return null;
  return parts.join('; ').slice(0, 2000);
}

function buildExpenseNotes(merged: ReceiptExtractionCandidates): string | null {
  const parts: string[] = [];
  const reference = merged.reference.value?.trim();
  if (reference) parts.push(`OCR reference: ${reference}`);
  const dueDate = merged.dueDate.value?.trim();
  if (dueDate) parts.push(`OCR due date (not an Expense field): ${dueDate}`);
  const orderNumber = merged.orderNumber.value?.trim();
  if (orderNumber) parts.push(`OCR order number: ${orderNumber}`);
  const companyNumber = merged.companyNumber.value?.trim();
  if (companyNumber) parts.push(`OCR company number: ${companyNumber}`);
  if (parts.length === 0) return null;
  return parts.join('\n').slice(0, 4000);
}

export function mapCandidatesToExpenseInput(
  candidates: ReceiptExtractionCandidates,
  overrides?: CandidateFieldOverrides,
): { input: CreateExpenseInput; issues: FieldMappingIssue[] } {
  const merged = applyFieldOverrides(candidates, overrides);
  const issues = validateMappedCandidates(merged);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(errors.map((issue) => ({ path: issue.field, message: issue.message })));
  }

  const currency = merged.currency.value!.trim().toUpperCase();
  const gross = merged.gross.value?.trim() ?? null;
  const net = merged.net.value?.trim() ?? null;
  const tax = merged.tax.value?.trim() ?? null;
  const amount = gross ?? net!;

  let description = merged.description.value?.trim() || null;
  if (!description) {
    description = joinLineDescriptions(merged.lineDescriptions);
  }

  const input: CreateExpenseInput = {
    amount,
    currency,
    supplierName: merged.vendor.value?.trim() || null,
    expenseDate: merged.date.value?.trim() || undefined,
    description,
    notes: buildExpenseNotes(merged),
    netAmount: net,
    taxAmount: tax,
    projectId: null,
    costCategoryId: null,
  };

  return { input, issues };
}

export function hydrateCandidates(
  raw: ReceiptExtractionCandidates | null,
): ReceiptExtractionCandidates | null {
  if (!raw) return null;
  const provenance = raw.vendor?.provenance ?? { source: 'ocr' as const };
  const base = emptyCandidates(provenance);
  return {
    ...base,
    ...raw,
    companyNumber: raw.companyNumber ?? base.companyNumber,
    vatId: raw.vatId ?? base.vatId,
    orderNumber: raw.orderNumber ?? base.orderNumber,
    documentType: raw.documentType ?? base.documentType,
    lineDescriptions: raw.lineDescriptions ?? [],
    lines: raw.lines ?? [],
    suggestions: raw.suggestions ?? base.suggestions,
  };
}

export function assertCandidatesPresent(
  candidates: ReceiptExtractionCandidates | null,
): asserts candidates is ReceiptExtractionCandidates {
  if (!candidates) {
    throw new DomainRuleError(
      'Extraction has no candidates to review',
      'ocr.errors.noCandidates',
    );
  }
}

export function emptyLineItem(provenance: OcrFieldCandidate['provenance']): OcrLineItemCandidate {
  const blank = (): OcrFieldCandidate => ({ value: null, confidence: null, provenance });
  return {
    description: blank(),
    quantity: blank(),
    unit: blank(),
    unitPrice: blank(),
    netAmount: blank(),
    taxAmount: blank(),
    lineTotal: blank(),
  };
}

export function emptyCandidates(
  provenance: OcrFieldCandidate['provenance'],
): ReceiptExtractionCandidates {
  const blank = (): OcrFieldCandidate => ({
    value: null,
    confidence: null,
    provenance,
  });

  return {
    vendor: blank(),
    companyNumber: blank(),
    vatId: blank(),
    date: blank(),
    dueDate: blank(),
    reference: blank(),
    orderNumber: blank(),
    documentType: blank(),
    description: blank(),
    subtotal: blank(),
    discount: blank(),
    net: blank(),
    tax: blank(),
    vatRate: blank(),
    gross: blank(),
    amountDue: blank(),
    currency: blank(),
    lineDescriptions: [],
    lines: [],
    suggestions: blankSuggestions(),
  };
}

export function buildFixtureCandidates(
  partial?: Partial<Record<OcrCandidateFieldKey, string>>,
): ReceiptExtractionCandidates {
  const provenance = { source: 'fixture' as const, providerId: 'fixture' };
  const base = emptyCandidates(provenance);
  const defaults: Record<OcrCandidateFieldKey, string> = {
    vendor: 'Fixture Supplies Ltd',
    companyNumber: '512345678',
    vatId: '',
    date: '2026-08-01',
    dueDate: '2026-08-15',
    reference: 'FIX-1001',
    orderNumber: 'PO-9',
    documentType: 'חשבונית מס',
    description: 'Office supplies',
    subtotal: '100.00',
    discount: '0.00',
    net: '100.00',
    tax: '17.00',
    vatRate: '17',
    gross: '117.00',
    amountDue: '117.00',
    currency: 'ILS',
  };

  const next = { ...base };
  for (const key of OCR_CANDIDATE_FIELD_KEYS) {
    const value = partial?.[key] ?? defaults[key];
    next[key] = {
      value: value || null,
      confidence: 0.9,
      provenance,
    };
  }

  next.lineDescriptions = [
    { value: 'Paper reams', confidence: 0.85, provenance },
    { value: 'Printer ink', confidence: 0.8, provenance },
  ];
  next.lines = [
    {
      description: { value: 'Paper reams', confidence: 0.85, provenance },
      quantity: { value: '2', confidence: 0.8, provenance },
      unit: { value: 'box', confidence: 0.7, provenance },
      unitPrice: { value: '50.00', confidence: 0.8, provenance },
      netAmount: { value: '100.00', confidence: 0.8, provenance },
      taxAmount: { value: '17.00', confidence: 0.7, provenance },
      lineTotal: { value: '117.00', confidence: 0.8, provenance },
    },
  ];
  next.suggestions = {
    projectLabel: { value: 'HQ Refresh', confidence: 0.55, provenance },
    categoryLabel: { value: 'Office', confidence: 0.5, provenance },
  };

  return next;
}
