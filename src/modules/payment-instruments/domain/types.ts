export interface PaymentInstrumentRow {
  readonly id: string;
  readonly organizationId: string;
  readonly instrumentType: string;
  readonly displayName: string | null;
  readonly lastFour: string | null;
  readonly monthlyDebitDay: number | null;
  readonly isActive: boolean;
}

export function formatPaymentInstrumentLabel(row: PaymentInstrumentRow): string {
  const name = row.displayName?.trim();
  const suffix = row.lastFour ? `****${row.lastFour}` : null;
  if (name && suffix) return `${name} · ${suffix}`;
  if (name) return name;
  if (suffix) return suffix;
  return row.id.slice(0, 8);
}
