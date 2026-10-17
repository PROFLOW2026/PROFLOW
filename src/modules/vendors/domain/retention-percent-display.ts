/**
 * Display-only retention percent. Stored scale (for example 5.000000) stays unchanged.
 * Matches the agreement value card: Number, so 5% and 5.5% rather than six decimals.
 */
export function formatRetentionPercent(value: string | null | undefined): string {
  if (value == null || value.trim() === '') return '—';
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return `${numeric}%`;
}
