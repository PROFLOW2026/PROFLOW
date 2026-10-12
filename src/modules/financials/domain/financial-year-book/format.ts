import type { MoneyValue } from '@/shared/money';

const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

/** Remove UUIDs and trim — business-facing Excel must not expose internal ids. */
export function sanitizeBusinessText(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(UUID_PATTERN, '').replace(/\s+/g, ' ').trim();
}

export function moneyAmount(value: MoneyValue | null | undefined): number | null {
  if (!value) return null;
  const n = Number(value.amount);
  return Number.isFinite(n) ? n : null;
}
