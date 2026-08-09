import { createClientSchema } from '@/modules/clients';
import { createVendorSchema, VENDOR_TYPES } from '@/modules/vendors';
import { createEmployeeSchema, RATE_UNITS } from '@/modules/workforce';
import { createProjectSchema, PROJECT_STATUSES } from '@/modules/projects';
import { createExpenseSchema } from '@/modules/expenses';
import type { EnabledImportKind, ImportIssue, MappedImportRow } from '../domain/types';
import { fieldDefsForKind } from '../domain/field-defs';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^[+]?\d+(\.\d+)?$/;
const COST_FAMILIES = [
  'direct_project',
  'shared',
  'business_overhead',
  'asset_capital',
] as const;

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

function pushZodIssues(
  issues: ImportIssue[],
  zodIssues: readonly { path: PropertyKey[]; message: string }[],
): void {
  for (const issue of zodIssues) {
    issues.push({
      severity: 'error',
      field: issue.path.length ? String(issue.path[0]) : undefined,
      message: issue.message,
    });
  }
}

function validateClients(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const parsed = createClientSchema.safeParse({
    name: values.name ?? '',
    legalName: emptyToUndefined(values.legalName),
    email: emptyToUndefined(values.email),
    phone: emptyToUndefined(values.phone),
    city: emptyToUndefined(values.city),
    countryCode: emptyToUndefined(values.countryCode)?.toUpperCase(),
    notes: emptyToUndefined(values.notes),
  });
  if (!parsed.success) {
    pushZodIssues(issues, parsed.error.issues);
  }
  return issues;
}

function validateVendors(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const typeRaw = emptyToUndefined(values.type)?.toLowerCase();
  if (typeRaw && !(VENDOR_TYPES as readonly string[]).includes(typeRaw)) {
    issues.push({
      severity: 'error',
      field: 'type',
      message: `Invalid vendor type (expected: ${VENDOR_TYPES.join(', ')})`,
    });
  }

  const parsed = createVendorSchema.safeParse({
    name: values.name ?? '',
    type: typeRaw,
    email: emptyToUndefined(values.email),
    phone: emptyToUndefined(values.phone),
    city: emptyToUndefined(values.city),
    countryCode: emptyToUndefined(values.countryCode)?.toUpperCase(),
    notes: emptyToUndefined(values.notes),
  });
  if (!parsed.success) {
    pushZodIssues(issues, parsed.error.issues);
  }
  return issues;
}

function validateEmployees(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const rateUnitRaw = emptyToUndefined(values.rateUnit)?.toLowerCase() ?? 'hourly';
  if (!(RATE_UNITS as readonly string[]).includes(rateUnitRaw)) {
    issues.push({
      severity: 'error',
      field: 'rateUnit',
      message: `Invalid rate unit (expected: ${RATE_UNITS.join(', ')})`,
    });
  }

  const baseRate = emptyToUndefined(values.baseRate);
  if (baseRate && !AMOUNT_RE.test(baseRate)) {
    issues.push({ severity: 'error', field: 'baseRate', message: 'Invalid amount' });
  }

  const parsed = createEmployeeSchema.safeParse({
    name: values.name ?? '',
    rateUnit: rateUnitRaw,
    baseRate,
    email: emptyToUndefined(values.email) ?? '',
    phone: emptyToUndefined(values.phone),
    jobTitle: emptyToUndefined(values.jobTitle),
    employeeNumber: emptyToUndefined(values.employeeNumber),
    notes: emptyToUndefined(values.notes),
  });
  if (!parsed.success) {
    pushZodIssues(issues, parsed.error.issues);
  }

  if (!baseRate) {
    issues.push({
      severity: 'warning',
      field: 'baseRate',
      message: 'No base rate — employee will be created without a cost rate',
    });
  }

  return issues;
}

function validateProjects(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const statusRaw = emptyToUndefined(values.status)?.toLowerCase();
  if (statusRaw && !(PROJECT_STATUSES as readonly string[]).includes(statusRaw)) {
    issues.push({
      severity: 'error',
      field: 'status',
      message: `Invalid status (expected: ${PROJECT_STATUSES.join(', ')})`,
    });
  }

  const clientId = emptyToUndefined(values.clientId);
  if (clientId && !UUID_RE.test(clientId)) {
    issues.push({ severity: 'error', field: 'clientId', message: 'clientId must be a UUID' });
  }

  for (const dateField of ['startDate', 'targetEndDate'] as const) {
    const raw = emptyToUndefined(values[dateField]);
    if (raw && !DATE_RE.test(raw)) {
      issues.push({
        severity: 'error',
        field: dateField,
        message: 'Date must be YYYY-MM-DD',
      });
    }
  }

  // Contract amounts / billing / expenses are intentionally omitted — financial import is conservative.
  const financialKeys = [
    'contractAmount',
    'originalAmount',
    'amount',
    'grossAmount',
    'netAmount',
    'taxAmount',
    'invoiced',
    'paid',
    'outstanding',
  ] as const;
  for (const key of financialKeys) {
    if (emptyToUndefined(values[key])) {
      issues.push({
        severity: 'warning',
        field: key,
        message: 'Financial amounts are not imported; set contract value on the project after create',
      });
    }
  }

  const parsed = createProjectSchema.safeParse({
    name: values.name ?? '',
    status: statusRaw,
    clientId,
    location: emptyToUndefined(values.location),
    startDate: emptyToUndefined(values.startDate),
    targetEndDate: emptyToUndefined(values.targetEndDate),
    description: emptyToUndefined(values.description),
    notes: emptyToUndefined(values.notes),
  });
  if (!parsed.success) {
    pushZodIssues(issues, parsed.error.issues);
  }
  return issues;
}

/**
 * Expense rows validate through createExpenseSchema — never invents money rules.
 * Creates drafts only; tax/VAT columns are rejected as warnings (not mapped).
 */
export function validateExpenses(
  values: Readonly<Record<string, string>>,
  baseCurrency: string,
): ImportIssue[] {
  const issues: ImportIssue[] = [];

  const expenseDate = emptyToUndefined(values.expenseDate);
  if (expenseDate && !DATE_RE.test(expenseDate)) {
    issues.push({
      severity: 'error',
      field: 'expenseDate',
      message: 'Date must be YYYY-MM-DD',
    });
  }

  const amount = emptyToUndefined(values.amount);
  if (amount && !AMOUNT_RE.test(amount)) {
    issues.push({ severity: 'error', field: 'amount', message: 'Invalid amount' });
  }

  const currency = (emptyToUndefined(values.currency) ?? baseCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({
      severity: 'error',
      field: 'currency',
      message: 'Currency must be a 3-letter ISO code',
    });
  }

  for (const refField of ['projectId', 'vendorId'] as const) {
    const raw = emptyToUndefined(values[refField]);
    if (raw && !UUID_RE.test(raw)) {
      issues.push({
        severity: 'error',
        field: refField,
        message: `${refField} must be a UUID in this organization`,
      });
    }
  }

  const costFamily = emptyToUndefined(values.costFamily)?.toLowerCase();
  if (costFamily && !(COST_FAMILIES as readonly string[]).includes(costFamily)) {
    issues.push({
      severity: 'error',
      field: 'costFamily',
      message: `Invalid cost family (expected: ${COST_FAMILIES.join(', ')})`,
    });
  }

  for (const banned of ['taxAmount', 'netAmount', 'vat', 'tax'] as const) {
    if (emptyToUndefined(values[banned])) {
      issues.push({
        severity: 'warning',
        field: banned,
        message: 'Tax/VAT fields are not imported (VAT is not profit); enter tax on the expense form if needed',
      });
    }
  }

  const parsed = createExpenseSchema.safeParse({
    amount: amount ?? '',
    currency,
    description: emptyToUndefined(values.description) ?? null,
    expenseDate,
    supplierName: emptyToUndefined(values.supplierName) ?? null,
    vendorId: emptyToUndefined(values.vendorId) ?? null,
    projectId: emptyToUndefined(values.projectId) ?? null,
    costFamily: costFamily ?? null,
    notes: emptyToUndefined(values.notes) ?? null,
  });
  if (!parsed.success) {
    pushZodIssues(issues, parsed.error.issues);
  }

  if (!emptyToUndefined(values.projectId)) {
    issues.push({
      severity: 'warning',
      field: 'projectId',
      message: 'No project — expense will be created as business overhead (draft)',
    });
  }

  return issues;
}

export function validateMappedValues(
  kind: EnabledImportKind,
  values: Readonly<Record<string, string>>,
  options: { baseCurrency?: string } = {},
): ImportIssue[] {
  switch (kind) {
    case 'clients':
      return validateClients(values);
    case 'vendors':
      return validateVendors(values);
    case 'employees':
      return validateEmployees(values);
    case 'projects':
      return validateProjects(values);
    case 'expenses':
      return validateExpenses(values, options.baseCurrency ?? 'ILS');
  }
}

export function validateMappedRows(
  kind: EnabledImportKind,
  rows: readonly { rowNumber: number; values: Readonly<Record<string, string>> }[],
  options: { baseCurrency?: string } = {},
): MappedImportRow[] {
  const fields = fieldDefsForKind(kind);
  return rows.map((row) => {
    const issues: ImportIssue[] = [];
    for (const field of fields) {
      if (field.required && !(row.values[field.key] ?? '').trim()) {
        issues.push({
          severity: 'error',
          field: field.key,
          message: `${field.key} is required`,
        });
      }
    }
    issues.push(...validateMappedValues(kind, row.values, options));
    const seen = new Set<string>();
    const unique = issues.filter((issue) => {
      const key = `${issue.severity}:${issue.field ?? ''}:${issue.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    return { rowNumber: row.rowNumber, values: row.values, issues: unique };
  });
}

export function rowHasErrors(row: MappedImportRow): boolean {
  return row.issues.some((i) => i.severity === 'error');
}
