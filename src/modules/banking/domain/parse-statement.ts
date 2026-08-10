import { DomainRuleError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { parseCsv } from '@/modules/imports/domain/csv-parse';
import {
  applyBankMapping,
  autoMapBankColumns,
  type BankColumnMapping,
} from './import-columns';
import type { BankTxnDirection } from './types';

export interface ParsedBankStatementRow {
  readonly rowNumber: number;
  readonly date: string;
  readonly valueDate: string | null;
  readonly description: string;
  readonly amount: string;
  readonly direction: BankTxnDirection;
  readonly reference: string | null;
  readonly issues: readonly string[];
}

export interface ParsedBankStatement {
  readonly headers: readonly string[];
  readonly mapping: BankColumnMapping;
  readonly rows: readonly ParsedBankStatementRow[];
}

function parseIsoDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Accept YYYY-MM-DD or DD/MM/YYYY / DD.MM.YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const slash = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (slash) {
    const dd = slash[1]!.padStart(2, '0');
    const mm = slash[2]!.padStart(2, '0');
    const yyyy = slash[3]!;
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function parseSignedAmount(raw: string): { amount: string; sign: -1 | 1 } | null {
  const cleaned = raw.replace(/,/g, '').replace(/\s/g, '').replace(/₪|ILS|NIS|\$/gi, '');
  if (!cleaned) return null;
  const negative = cleaned.startsWith('-') || cleaned.startsWith('(');
  const numeric = cleaned.replace(/^[+-]/, '').replace(/[()]/g, '');
  if (!numeric || Number.isNaN(Number(numeric))) return null;
  return { amount: numeric, sign: negative ? -1 : 1 };
}

function resolveDirection(input: {
  readonly directionRaw: string;
  readonly debitRaw: string;
  readonly creditRaw: string;
  readonly amountRaw: string;
  readonly currency: string;
}): { direction: BankTxnDirection; amount: string } | null {
  const dir = input.directionRaw.trim().toLowerCase();
  if (
    dir === 'credit' ||
    dir === 'cr' ||
    dir === 'in' ||
    dir === 'incoming' ||
    dir === 'זכות' ||
    dir === 'הפקדה'
  ) {
    const parsed = parseSignedAmount(input.amountRaw || input.creditRaw);
    if (!parsed) return null;
    return {
      direction: 'credit',
      amount: toNumericString(money(parsed.amount, input.currency)),
    };
  }
  if (
    dir === 'debit' ||
    dir === 'dr' ||
    dir === 'out' ||
    dir === 'outgoing' ||
    dir === 'חובה' ||
    dir === 'משיכה'
  ) {
    const parsed = parseSignedAmount(input.amountRaw || input.debitRaw);
    if (!parsed) return null;
    return {
      direction: 'debit',
      amount: toNumericString(money(parsed.amount, input.currency)),
    };
  }

  const debit = parseSignedAmount(input.debitRaw);
  const credit = parseSignedAmount(input.creditRaw);
  if (debit && !credit) {
    return {
      direction: 'debit',
      amount: toNumericString(money(debit.amount, input.currency)),
    };
  }
  if (credit && !debit) {
    return {
      direction: 'credit',
      amount: toNumericString(money(credit.amount, input.currency)),
    };
  }

  const signed = parseSignedAmount(input.amountRaw);
  if (!signed) return null;
  return {
    direction: signed.sign < 0 ? 'debit' : 'credit',
    amount: toNumericString(money(signed.amount, input.currency)),
  };
}

/**
 * Parse CSV statement text into normalized bank rows.
 * Currency is supplied by the bank account (not invented from the file).
 */
export function parseBankStatementCsv(input: {
  readonly csvText: string;
  readonly currency: string;
  readonly mapping?: BankColumnMapping;
}): ParsedBankStatement {
  const parsed = parseCsv(input.csvText);
  const mapping = input.mapping ?? autoMapBankColumns(parsed.headers);
  if (mapping.date < 0 || mapping.description < 0) {
    throw new DomainRuleError(
      'Bank statement requires date and description columns',
      'banking.errors.mappingRequired',
    );
  }
  if (mapping.amount < 0 && mapping.debit < 0 && mapping.credit < 0) {
    throw new DomainRuleError(
      'Bank statement requires amount or debit/credit columns',
      'banking.errors.mappingRequired',
    );
  }

  const currency = input.currency.toUpperCase();
  const rows: ParsedBankStatementRow[] = [];

  parsed.rows.forEach((row, index) => {
    const values = applyBankMapping(row, mapping);
    const issues: string[] = [];
    const date = parseIsoDate(values.date);
    if (!date) issues.push('invalid_date');
    const valueDate = values.valueDate ? parseIsoDate(values.valueDate) : null;
    if (values.valueDate && !valueDate) issues.push('invalid_value_date');

    const resolved = resolveDirection({
      directionRaw: values.direction,
      debitRaw: values.debit,
      creditRaw: values.credit,
      amountRaw: values.amount,
      currency,
    });
    if (!resolved) issues.push('invalid_amount');

    if (!values.description) issues.push('missing_description');

    rows.push({
      rowNumber: index + 2, // 1-based data rows after header
      date: date ?? values.date,
      valueDate,
      description: values.description,
      amount: resolved?.amount ?? '0',
      direction: resolved?.direction ?? 'debit',
      reference: values.reference || null,
      issues,
    });
  });

  return { headers: parsed.headers, mapping, rows };
}

/** Convert a header+rows matrix (from XLSX) into CSV-shaped parse input. */
export function matrixToCsvText(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const escape = (cell: string) => {
    if (/[",\n\r]/.test(cell)) return `"${cell.replace(/"/g, '""')}"`;
    return cell;
  };
  const lines = [
    headers.map(escape).join(','),
    ...rows.map((row) => row.map((c) => escape(c ?? '')).join(',')),
  ];
  return lines.join('\n');
}
