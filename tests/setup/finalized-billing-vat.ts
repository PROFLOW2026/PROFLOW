/** Drizzle fields for finalized billing with explicit zero VAT (NET = GROSS). */
export const finalizedZeroVatFields = {
  vatMode: 'zero' as const,
  taxAmount: '0',
} as const;

/** SQL column list suffix for zero-VAT finalized billing rows in raw INSERT tests. */
export const finalizedZeroVatSqlColumns = 'vat_mode, tax_amount';

/** SQL VALUES suffix for zero-VAT finalized billing rows in raw INSERT tests. */
export const finalizedZeroVatSqlValues = `'zero', 0`;
