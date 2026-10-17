/**
 * Display-only formatting for quote quantity and percent.
 * Stored strings and editor inputs stay untouched.
 * Exactly two fraction digits: 1.000000 → 1.00.
 */
export function formatQuoteDisplayDecimal(value: string | null | undefined): string {
  if (value == null) return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return trimmed;

  const sign = match[1] ?? '';
  let whole = BigInt(match[2] ?? '0');
  const fraction = match[3] ?? '';
  const hundredths = Number((fraction + '00').slice(0, 2));
  const nextDigit = fraction.length > 2 ? Number(fraction[2]) : 0;
  let minor = hundredths + (nextDigit >= 5 ? 1 : 0);
  if (minor >= 100) {
    minor -= 100;
    whole += 1n;
  }
  return `${sign}${whole.toString()}.${String(minor).padStart(2, '0')}`;
}

export function formatQuoteDisplayPercent(value: string | null | undefined): string {
  const formatted = formatQuoteDisplayDecimal(value);
  if (!formatted) return '-';
  return `${formatted}%`;
}
