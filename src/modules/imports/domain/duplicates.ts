import type { EnabledImportKind, ImportIssue, MappedImportRow } from './types';

function normKey(value: string | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function pushDuplicate(
  issuesByRow: Map<number, ImportIssue[]>,
  rowNumber: number,
  issue: ImportIssue,
): void {
  const list = issuesByRow.get(rowNumber) ?? [];
  list.push(issue);
  issuesByRow.set(rowNumber, list);
}

/**
 * Flag duplicate keys within the uploaded file (later rows get warnings).
 * Used by enrich-preview helpers; within-file email collisions use
 * detectWithinFileDuplicates (errors) for confirm gating.
 */
export function flagInFileDuplicates(
  rows: readonly MappedImportRow[],
  field: string,
  label: string,
): MappedImportRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const raw = (row.values[field] ?? '').trim();
    if (!raw) return row;
    const key = normalizeName(raw);
    const firstRow = seen.get(key);
    if (firstRow === undefined) {
      seen.set(key, row.rowNumber);
      return row;
    }
    const issue: ImportIssue = {
      severity: 'warning',
      field,
      message: `Possible duplicate ${label} (same as row ${firstRow})`,
    };
    return { ...row, issues: [...row.issues, issue] };
  });
}

export function flagExpenseInFileDuplicates(rows: readonly MappedImportRow[]): MappedImportRow[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const date = (row.values.expenseDate ?? '').trim();
    const amount = (row.values.amount ?? '').trim();
    const description = normalizeName(row.values.description ?? '');
    if (!date || !amount || !description) return row;
    const key = `${date}|${amount}|${description}`;
    const firstRow = seen.get(key);
    if (firstRow === undefined) {
      seen.set(key, row.rowNumber);
      return row;
    }
    const issue: ImportIssue = {
      severity: 'warning',
      message: `Possible duplicate expense (same date/amount/description as row ${firstRow})`,
    };
    return { ...row, issues: [...row.issues, issue] };
  });
}

/** Duplicate item codes within a BOQ import file are errors (confirm gated). */
export function flagBoqItemCodeDuplicates(
  rows: readonly MappedImportRow[],
  locale = 'en',
): MappedImportRow[] {
  const he = locale.startsWith('he');
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const raw = (row.values.itemCode ?? '').trim();
    if (!raw) return row;
    const key = raw.toLowerCase();
    const firstRow = seen.get(key);
    if (firstRow === undefined) {
      seen.set(key, row.rowNumber);
      return row;
    }
    const issue: ImportIssue = {
      severity: 'error',
      field: 'itemCode',
      message: he
        ? `קוד סעיף כפול בקובץ (כמו שורה ${firstRow})`
        : `Duplicate item code in file (same as row ${firstRow})`,
    };
    return { ...row, issues: [...row.issues, issue] };
  });
}

export function flagExistingNameDuplicates(
  rows: readonly MappedImportRow[],
  existingNames: ReadonlySet<string>,
  field: string,
  label: string,
): MappedImportRow[] {
  if (existingNames.size === 0) return [...rows];
  return rows.map((row) => {
    const raw = (row.values[field] ?? '').trim();
    if (!raw) return row;
    if (!existingNames.has(normalizeName(raw))) return row;
    const issue: ImportIssue = {
      severity: 'warning',
      field,
      message: `Possible duplicate ${label} - a record with this name already exists in the organization`,
    };
    return { ...row, issues: [...row.issues, issue] };
  });
}

/**
 * Within-file duplicate detection. Same-file email / employee number collisions
 * are errors; repeated display names are warnings (intentional re-imports allowed).
 */
export function detectWithinFileDuplicates(
  kind: EnabledImportKind,
  rows: readonly MappedImportRow[],
): Map<number, ImportIssue[]> {
  const issuesByRow = new Map<number, ImportIssue[]>();

  const nameGroups = new Map<string, number[]>();
  const emailGroups = new Map<string, number[]>();
  const employeeNumberGroups = new Map<string, number[]>();

  for (const row of rows) {
    const name = normKey(row.values.name);
    if (name) {
      const list = nameGroups.get(name) ?? [];
      list.push(row.rowNumber);
      nameGroups.set(name, list);
    }

    if (kind === 'clients' || kind === 'vendors' || kind === 'employees') {
      const email = normKey(row.values.email);
      if (email) {
        const list = emailGroups.get(email) ?? [];
        list.push(row.rowNumber);
        emailGroups.set(email, list);
      }
    }

    if (kind === 'employees') {
      const number = normKey(row.values.employeeNumber);
      if (number) {
        const list = employeeNumberGroups.get(number) ?? [];
        list.push(row.rowNumber);
        employeeNumberGroups.set(number, list);
      }
    }
  }

  for (const [, rowNumbers] of nameGroups) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      pushDuplicate(issuesByRow, rowNumber, {
        severity: 'warning',
        field: 'name',
        message: `Duplicate name in file (also on rows ${rowNumbers.filter((n) => n !== rowNumber).join(', ')})`,
      });
    }
  }

  for (const [, rowNumbers] of emailGroups) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      pushDuplicate(issuesByRow, rowNumber, {
        severity: 'error',
        field: 'email',
        message: `Duplicate email in file (also on rows ${rowNumbers.filter((n) => n !== rowNumber).join(', ')})`,
      });
    }
  }

  for (const [, rowNumbers] of employeeNumberGroups) {
    if (rowNumbers.length < 2) continue;
    for (const rowNumber of rowNumbers) {
      pushDuplicate(issuesByRow, rowNumber, {
        severity: 'error',
        field: 'employeeNumber',
        message: `Duplicate employee number in file (also on rows ${rowNumbers.filter((n) => n !== rowNumber).join(', ')})`,
      });
    }
  }

  return issuesByRow;
}

export interface ExistingImportIndex {
  readonly names: ReadonlySet<string>;
  readonly emails: ReadonlySet<string>;
  readonly employeeNumbers: ReadonlySet<string>;
  /** clientId → name (projects) */
  readonly clientsById: ReadonlyMap<string, string>;
  /** normalized client name → id (first match) */
  readonly clientsByName: ReadonlyMap<string, string>;
}

export function emptyExistingIndex(): ExistingImportIndex {
  return {
    names: new Set(),
    emails: new Set(),
    employeeNumbers: new Set(),
    clientsById: new Map(),
    clientsByName: new Map(),
  };
}

/**
 * Compare mapped rows against existing org entities (tenant-scoped index).
 * Existing email / employeeNumber collisions are errors so retry confirm
 * cannot silently create duplicates; name collisions remain warnings.
 */
export function detectExistingDuplicates(
  kind: EnabledImportKind,
  rows: readonly MappedImportRow[],
  existing: ExistingImportIndex,
): Map<number, ImportIssue[]> {
  const issuesByRow = new Map<number, ImportIssue[]>();

  for (const row of rows) {
    const name = normKey(row.values.name);
    if (name && existing.names.has(name)) {
      pushDuplicate(issuesByRow, row.rowNumber, {
        severity: 'warning',
        field: 'name',
        message: 'A record with this name already exists in the organization',
      });
    }

    if (kind === 'clients' || kind === 'vendors' || kind === 'employees') {
      const email = normKey(row.values.email);
      if (email && existing.emails.has(email)) {
        pushDuplicate(issuesByRow, row.rowNumber, {
          severity: 'error',
          field: 'email',
          message: 'A record with this email already exists in the organization',
        });
      }
    }

    if (kind === 'employees') {
      const number = normKey(row.values.employeeNumber);
      if (number && existing.employeeNumbers.has(number)) {
        pushDuplicate(issuesByRow, row.rowNumber, {
          severity: 'error',
          field: 'employeeNumber',
          message: 'An employee with this number already exists in the organization',
        });
      }
    }
  }

  return issuesByRow;
}

export function mergeIssueMaps(
  rows: readonly MappedImportRow[],
  ...maps: readonly Map<number, ImportIssue[]>[]
): MappedImportRow[] {
  return rows.map((row) => {
    const extra: ImportIssue[] = [];
    for (const map of maps) {
      const list = map.get(row.rowNumber);
      if (list) extra.push(...list);
    }
    if (extra.length === 0) return row;

    const seen = new Set(row.issues.map((i) => `${i.severity}:${i.field ?? ''}:${i.message}`));
    const merged = [...row.issues];
    for (const issue of extra) {
      const key = `${issue.severity}:${issue.field ?? ''}:${issue.message}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(issue);
    }
    return { ...row, issues: merged };
  });
}
