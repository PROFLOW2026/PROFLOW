import { normalizeHeader } from '@/modules/imports/domain/column-mapping';

export const BANK_IMPORT_FIELD_KEYS = [
  'date',
  'valueDate',
  'description',
  'amount',
  'debit',
  'credit',
  'direction',
  'reference',
] as const;

export type BankImportFieldKey = (typeof BANK_IMPORT_FIELD_KEYS)[number];

export type BankColumnMapping = Readonly<Record<BankImportFieldKey, number>>;

const ALIASES: Readonly<Record<BankImportFieldKey, readonly string[]>> = {
  date: [
    'date',
    'booking_date',
    'transaction_date',
    'txn_date',
    'תאריך',
    'תאריך_עסקה',
    'תאריך_רישום',
  ],
  valueDate: [
    'value_date',
    'valuedate',
    'value',
    'תאריך_ערך',
    'ערך',
  ],
  description: [
    'description',
    'details',
    'narrative',
    'memo',
    'תיאור',
    'פרטים',
    'תוכן',
  ],
  amount: ['amount', 'sum', 'סכום', 'סכום_עסקה'],
  debit: ['debit', 'withdrawal', 'חובה', 'משיכה'],
  credit: ['credit', 'deposit', 'זכות', 'הפקדה'],
  direction: ['direction', 'type', 'side', 'סוג', 'כיוון'],
  reference: [
    'reference',
    'ref',
    'check',
    'cheque',
    'אסמכתא',
    'אסמכתה',
    'מספר_אסמכתא',
  ],
};

export function emptyBankColumnMapping(): BankColumnMapping {
  return {
    date: -1,
    valueDate: -1,
    description: -1,
    amount: -1,
    debit: -1,
    credit: -1,
    direction: -1,
    reference: -1,
  };
}

/** Auto-map statement headers (EN/HE aliases) to bank import fields. */
export function autoMapBankColumns(headers: readonly string[]): BankColumnMapping {
  const used = new Set<number>();
  const mapping = emptyBankColumnMapping();
  const mutable: Record<BankImportFieldKey, number> = { ...mapping };

  for (const field of BANK_IMPORT_FIELD_KEYS) {
    const aliasSet = new Set(ALIASES[field].map(normalizeHeader));
    aliasSet.add(normalizeHeader(field));
    let found = -1;
    for (let i = 0; i < headers.length; i++) {
      if (used.has(i)) continue;
      if (aliasSet.has(normalizeHeader(headers[i] ?? ''))) {
        found = i;
        break;
      }
    }
    if (found >= 0) {
      mutable[field] = found;
      used.add(found);
    }
  }

  return mutable;
}

export function applyBankMapping(
  row: readonly string[],
  mapping: BankColumnMapping,
): Record<BankImportFieldKey, string> {
  const values = {} as Record<BankImportFieldKey, string>;
  for (const field of BANK_IMPORT_FIELD_KEYS) {
    const index = mapping[field];
    values[field] =
      index >= 0 && index < row.length ? (row[index] ?? '').trim() : '';
  }
  return values;
}
