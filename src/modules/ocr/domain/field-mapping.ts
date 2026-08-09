import type { CreateExpenseInput } from '@/modules/expenses';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import type {
  OcrCandidateFieldKey,
  OcrFieldCandidate,
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

/**
 * Merge OCR candidates with optional user overrides (overrides win; provenance
 * becomes `user_override` for changed fields).
 * Line descriptions and non-canonical suggestions are never overridden here.
 */
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

/** Join safe line-description candidates into a single description string. */
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
  if (parts.length === 0) return null;
  return parts.join('\n').slice(0, 4000);
}

/**
 * Map reviewed candidates into a `CreateExpenseInput` payload.
 * Does not create an Expense — callers must confirm explicitly.
 *
 * Never maps project/category suggestions into IDs (non-canonical).
 */
export function mapCandidatesToExpenseInput(
  candidates: ReceiptExtractionCandidates,
  overrides?: CandidateFieldOverrides,
): { input: CreateExpenseInput; issues: FieldMappingIssue[] } {
  const merged = applyFieldOverrides(candidates, overrides);
  const issues = validateMappedCandidates(merged);
  const errors = issues.filter((i) => i.severity === 'error');
  if (errors.length > 0) {
    throw new ValidationError(
      errors.map((issue) => ({ path: issue.field, message: issue.message })),
    );
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
    // Explicit: OCR suggestions never become targeting IDs.
    projectId: null,
    costCategoryId: null,
  };

  return { input, issues };
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
    date: blank(),
    dueDate: blank(),
    reference: blank(),
    description: blank(),
    net: blank(),
    tax: blank(),
    gross: blank(),
    currency: blank(),
    lineDescriptions: [],
    suggestions: blankSuggestions(),
  };
}

/** Deterministic fixture candidates for review UI / unit tests — not provider output. */
export function buildFixtureCandidates(
  partial?: Partial<Record<OcrCandidateFieldKey, string>>,
): ReceiptExtractionCandidates {
  const provenance = { source: 'fixture' as const, providerId: 'fixture' };
  const base = emptyCandidates(provenance);
  const defaults: Record<OcrCandidateFieldKey, string> = {
    vendor: 'Fixture Supplies Ltd',
    date: '2026-08-01',
    dueDate: '2026-08-15',
    reference: 'FIX-1001',
    description: 'Office supplies',
    net: '100.00',
    tax: '17.00',
    gross: '117.00',
    currency: 'ILS',
  };

  const next = { ...base };
  for (const key of OCR_CANDIDATE_FIELD_KEYS) {
    const value = partial?.[key] ?? defaults[key];
    next[key] = {
      value,
      confidence: 0.9,
      provenance,
    };
  }

  next.lineDescriptions = [
    {
      value: 'Paper reams',
      confidence: 0.85,
      provenance,
    },
    {
      value: 'Printer ink',
      confidence: 0.8,
      provenance,
    },
  ];

  next.suggestions = {
    projectLabel: {
      value: 'HQ Refresh',
      confidence: 0.55,
      provenance,
    },
    categoryLabel: {
      value: 'Office',
      confidence: 0.5,
      provenance,
    },
  };

  return next;
}
