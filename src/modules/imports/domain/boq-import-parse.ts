/**
 * BOQ CSV preview helpers - decimal normalization, blank/total detection.
 * Framework-free; used by validation + confirm (never invents money rules).
 */

const CURRENCY_TOKEN_RE =
  /(?:₪|\$|€|£|¥|ILS|USD|EUR|NIS|שקל|ש"ח|ש״ח)/gi;

/** Normalize import cell to a plain decimal string, or null if unparseable. */
export function parseImportDecimal(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;

  s = s.replace(CURRENCY_TOKEN_RE, '');
  s = s.replace(/\s+/g, '');
  // Parentheses negatives: (1,234.50)
  const parenNeg = /^\((.+)\)$/.exec(s);
  if (parenNeg) s = `-${parenNeg[1]!}`;

  if (/,/.test(s) && /\./.test(s)) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // EU / HE style: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US style: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (/,/.test(s) && !/\./.test(s)) {
    const parts = s.split(',');
    if (parts.length === 2 && parts[1]!.length > 0 && parts[1]!.length <= 2 && /^\d+$/.test(parts[1]!)) {
      // 1234,5 or 1234,50 → decimal comma (1–2 fraction digits)
      s = `${parts[0]!.replace(/\./g, '')}.${parts[1]}`;
    } else {
      // thousands separators only (e.g. 1,000 or 1,000,000)
      s = s.replace(/,/g, '');
    }
  }

  s = s.replace(/[^\d.+-]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s === '' || s === '-' || s === '.' || s === '-.') return null;
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  // Drop trailing zeros after decimal for stable preview diffs (keep integers intact).
  if (s.includes('.')) {
    s = s.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
  }
  // Normalize -0
  if (s === '-0') return '0';
  return s;
}

const TOTAL_DESC_RE =
  /^(total|sub[\s_-]*total|grand[\s_-]*total|sum|סה[\s"'״']?כ|סך[\s_-]*הכל|סיכום|סיכום[\s_-]*ביניים)/i;

/**
 * Detect blank rows and spreadsheet total/subtotal lines that must not create BOQ items.
 */
export function isBlankOrTotalBoqRow(values: Readonly<Record<string, string>>): boolean {
  const itemCode = (values.itemCode ?? '').trim();
  const description = (values.description ?? '').trim();
  const unit = (values.unit ?? '').trim();
  const quantity = (values.quantity ?? '').trim();
  const unitPrice = (values.unitPrice ?? '').trim();
  const amount = (values.amount ?? '').trim();
  const chapter = (values.chapter ?? '').trim();
  const subchapter = (values.subchapter ?? '').trim();

  const allEmpty =
    !itemCode &&
    !description &&
    !unit &&
    !quantity &&
    !unitPrice &&
    !amount &&
    !chapter &&
    !subchapter;
  if (allEmpty) return true;

  if (TOTAL_DESC_RE.test(description) || TOTAL_DESC_RE.test(itemCode)) return true;

  // Amount-only footer with no identity fields
  if (!itemCode && !description && !quantity && !unitPrice && amount && !chapter && !subchapter) {
    return true;
  }

  return false;
}

/** True when the row should be excluded from BOQ confirm (blank/total). */
export function isBoqImportSkipRow(values: Readonly<Record<string, string>>): boolean {
  return isBlankOrTotalBoqRow(values);
}
