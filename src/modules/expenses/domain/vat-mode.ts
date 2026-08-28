/** Owner-selected VAT entry mode — never inferred from category or vendor. */
export type ExpenseVatMode = 'inclusive' | 'exclusive' | 'zero';

export const EXPENSE_VAT_MODES = ['inclusive', 'exclusive', 'zero'] as const;

export const DEFAULT_EXPENSE_VAT_MODE: ExpenseVatMode = 'inclusive';

export function isExpenseVatMode(value: unknown): value is ExpenseVatMode {
  return typeof value === 'string' && (EXPENSE_VAT_MODES as readonly string[]).includes(value);
}

export function parseExpenseVatModeFromForm(value: unknown): ExpenseVatMode | undefined {
  if (value === 'inclusive' || value === 'including' || value === 'true') return 'inclusive';
  if (value === 'exclusive' || value === 'excluding' || value === 'false') return 'exclusive';
  if (value === 'zero' || value === 'none') return 'zero';
  return undefined;
}

export function resolveExpenseVatMode(input: {
  readonly vatMode?: ExpenseVatMode | null;
  readonly amountIncludesTax?: boolean | null;
  readonly forCreate?: boolean;
}): ExpenseVatMode {
  if (input.vatMode && isExpenseVatMode(input.vatMode)) return input.vatMode;
  if (input.amountIncludesTax === true) return 'inclusive';
  if (input.amountIncludesTax === false) return 'exclusive';
  return input.forCreate ? DEFAULT_EXPENSE_VAT_MODE : 'exclusive';
}
