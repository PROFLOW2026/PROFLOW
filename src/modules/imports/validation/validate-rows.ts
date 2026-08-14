import { createClientSchema } from '@/modules/clients/validation/schemas';
import { CONTACT_ROLES } from '@/modules/clients/domain/types';
import { createVendorSchema } from '@/modules/vendors/validation/schemas';
import { VENDOR_TYPES } from '@/modules/vendors/domain/types';
import { createEmployeeSchema } from '@/modules/workforce/validation/schemas';
import { RATE_UNITS } from '@/modules/workforce/domain/types';
import { createProjectSchema } from '@/modules/projects/validation/schemas';
import { PROJECT_STATUSES, WORK_KINDS } from '@/modules/projects/domain/types';
import { createExpenseSchema } from '@/modules/expenses/validation/schemas';
import type { EnabledImportKind, ImportIssue, MappedImportRow } from '../domain/types';
import { fieldDefsForKind } from '../domain/field-defs';
import { isBlankOrTotalBoqRow, parseImportDecimal } from '../domain/boq-import-parse';

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

function validateContacts(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const clientId = emptyToUndefined(values.clientId);
  const clientName = emptyToUndefined(values.clientName);
  if (!clientId && !clientName) {
    issues.push({
      severity: 'error',
      field: 'clientName',
      message: 'clientName or clientId is required',
    });
  }
  if (clientId && !UUID_RE.test(clientId)) {
    issues.push({ severity: 'error', field: 'clientId', message: 'clientId must be a UUID' });
  }

  const roleRaw = emptyToUndefined(values.role)?.toLowerCase();
  if (roleRaw && !(CONTACT_ROLES as readonly string[]).includes(roleRaw)) {
    issues.push({
      severity: 'error',
      field: 'role',
      message: `Invalid contact role (expected: ${CONTACT_ROLES.join(', ')})`,
    });
  }

  const name = emptyToUndefined(values.name);
  if (!name) {
    issues.push({ severity: 'error', field: 'name', message: 'name is required' });
  }

  const email = emptyToUndefined(values.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({ severity: 'error', field: 'email', message: 'Invalid email' });
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

  const workKindRaw = emptyToUndefined(values.workKind)?.toLowerCase();
  if (workKindRaw && !(WORK_KINDS as readonly string[]).includes(workKindRaw)) {
    issues.push({
      severity: 'error',
      field: 'workKind',
      message: `Invalid work kind (expected: ${WORK_KINDS.join(', ')})`,
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

  // Contract amounts belong in opening_values import — refuse silent money on projects.
  const financialKeys = [
    'contractAmount',
    'contractValueAmount',
    'opening_value',
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
        severity: 'error',
        field: key,
        message:
          'Financial amounts are not imported with projects; use the opening_values import kind',
      });
    }
  }

  const parsed = createProjectSchema.safeParse({
    name: values.name ?? '',
    status: statusRaw,
    workKind: workKindRaw,
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

function validateOpeningValues(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const projectId = emptyToUndefined(values.projectId);
  const projectName = emptyToUndefined(values.projectName);
  if (!projectId && !projectName) {
    issues.push({
      severity: 'error',
      field: 'projectName',
      message: 'projectName or projectId is required',
    });
  }
  if (projectId && !UUID_RE.test(projectId)) {
    issues.push({ severity: 'error', field: 'projectId', message: 'projectId must be a UUID' });
  }

  const amount = emptyToUndefined(values.contractValueAmount);
  if (!amount || !AMOUNT_RE.test(amount)) {
    issues.push({
      severity: 'error',
      field: 'contractValueAmount',
      message: 'Valid contractValueAmount is required',
    });
  }

  const reduction = emptyToUndefined(values.openingReductionAmount);
  if (reduction && !AMOUNT_RE.test(reduction)) {
    issues.push({
      severity: 'error',
      field: 'openingReductionAmount',
      message: 'Invalid opening reduction amount',
    });
  }

  const currency = emptyToUndefined(values.currency)?.toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    issues.push({
      severity: 'error',
      field: 'currency',
      message: 'Currency must be a 3-letter ISO code',
    });
  }

  const includesTax = emptyToUndefined(values.amountIncludesTax)?.toLowerCase();
  if (
    includesTax &&
    !['true', 'false', '1', '0', 'yes', 'no', 'כן', 'לא'].includes(includesTax)
  ) {
    issues.push({
      severity: 'error',
      field: 'amountIncludesTax',
      message: 'amountIncludesTax must be true/false',
    });
  }

  return issues;
}

function validateCostCategories(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const name = emptyToUndefined(values.name);
  if (!name || name.length < 2) {
    issues.push({ severity: 'error', field: 'name', message: 'name is required (min 2 characters)' });
  }
  const family = emptyToUndefined(values.family)?.toLowerCase();
  if (!family || !(COST_FAMILIES as readonly string[]).includes(family)) {
    issues.push({
      severity: 'error',
      field: 'family',
      message: `Invalid cost family (expected: ${COST_FAMILIES.join(', ')})`,
    });
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

/**
 * BOQ item rows — decimal parsing (commas/currency), blank/total skip, qty/price/amount checks.
 * Description required unless the row is blank/total (skipped on confirm).
 */
export function validateBoqItems(
  values: Readonly<Record<string, string>>,
  locale = 'en',
): ImportIssue[] {
  const he = locale.startsWith('he');
  const msg = {
    blankSkip: he
      ? 'שורה ריקה או שורת סה״כ — תדולג בייבוא'
      : 'Blank or total row — will be skipped on import',
    descriptionRequired: he ? 'תיאור הוא שדה חובה' : 'description is required',
    invalidQty: he
      ? 'כמות לא תקינה (הסירו סמלי מטבע; השתמשו בפסיק או נקודה עשרונית)'
      : 'Invalid quantity (remove currency symbols; use decimal commas or dots)',
    invalidPrice: he
      ? 'מחיר יחידה לא תקין (הסירו סמלי מטבע; השתמשו בפסיק או נקודה עשרונית)'
      : 'Invalid unit price (remove currency symbols; use decimal commas or dots)',
    invalidAmount: he
      ? 'סכום לא תקין (הסירו סמלי מטבע; השתמשו בפסיק או נקודה עשרונית)'
      : 'Invalid amount (remove currency symbols; use decimal commas or dots)',
    noMoney: he
      ? 'אין כמות, מחיר או סכום — הסעיף ייובא כ־0'
      : 'No quantity, unit price, or amount — item will import as 0',
    amountMismatch: he
      ? 'הסכום אינו תואם לכמות × מחיר — הייבוא ישתמש בכמות × מחיר'
      : 'Amount does not match quantity × unit price — import will use quantity × unit price',
  } as const;

  const issues: ImportIssue[] = [];

  if (isBlankOrTotalBoqRow(values)) {
    issues.push({
      severity: 'warning',
      message: msg.blankSkip,
    });
    return issues;
  }

  const description = emptyToUndefined(values.description);
  if (!description) {
    issues.push({ severity: 'error', field: 'description', message: msg.descriptionRequired });
  }

  const quantityRaw = emptyToUndefined(values.quantity);
  const unitPriceRaw = emptyToUndefined(values.unitPrice);
  const amountRaw = emptyToUndefined(values.amount);

  let quantity: string | null = null;
  let unitPrice: string | null = null;
  let amount: string | null = null;

  if (quantityRaw) {
    quantity = parseImportDecimal(quantityRaw);
    if (quantity === null) {
      issues.push({
        severity: 'error',
        field: 'quantity',
        message: msg.invalidQty,
      });
    }
  }

  if (unitPriceRaw) {
    unitPrice = parseImportDecimal(unitPriceRaw);
    if (unitPrice === null) {
      issues.push({
        severity: 'error',
        field: 'unitPrice',
        message: msg.invalidPrice,
      });
    }
  }

  if (amountRaw) {
    amount = parseImportDecimal(amountRaw);
    if (amount === null) {
      issues.push({
        severity: 'error',
        field: 'amount',
        message: msg.invalidAmount,
      });
    }
  }

  if (!quantityRaw && !unitPriceRaw && !amountRaw) {
    issues.push({
      severity: 'warning',
      message: msg.noMoney,
    });
  }

  if (quantity !== null && unitPrice !== null && amount !== null) {
    const expected = Number(quantity) * Number(unitPrice);
    const actual = Number(amount);
    if (Number.isFinite(expected) && Number.isFinite(actual) && Math.abs(expected - actual) > 0.02) {
      issues.push({
        severity: 'warning',
        field: 'amount',
        message: msg.amountMismatch,
      });
    }
  }

  return issues;
}

export function validateMappedValues(
  kind: EnabledImportKind,
  values: Readonly<Record<string, string>>,
  options: { baseCurrency?: string; locale?: string } = {},
): ImportIssue[] {
  switch (kind) {
    case 'clients':
      return validateClients(values);
    case 'contacts':
      return validateContacts(values);
    case 'vendors':
      return validateVendors(values);
    case 'employees':
      return validateEmployees(values);
    case 'projects':
      return validateProjects(values);
    case 'opening_values':
      return validateOpeningValues(values);
    case 'cost_categories':
      return validateCostCategories(values);
    case 'expenses':
      return validateExpenses(values, options.baseCurrency ?? 'ILS');
    case 'boq_items':
      return validateBoqItems(values, options.locale ?? 'en');
  }
}

export function validateMappedRows(
  kind: EnabledImportKind,
  rows: readonly { rowNumber: number; values: Readonly<Record<string, string>> }[],
  options: { baseCurrency?: string; locale?: string } = {},
): MappedImportRow[] {
  const fields = fieldDefsForKind(kind);
  return rows.map((row) => {
    const issues: ImportIssue[] = [];
    const skipRequired =
      kind === 'boq_items' && isBlankOrTotalBoqRow(row.values);
    for (const field of fields) {
      if (skipRequired) break;
      if (field.required && !(row.values[field.key] ?? '').trim()) {
        const he = (options.locale ?? 'en').startsWith('he');
        issues.push({
          severity: 'error',
          field: field.key,
          message: he ? `${field.key} הוא שדה חובה` : `${field.key} is required`,
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

export { rowHasErrors } from '../domain/row-has-errors';
export { isBoqImportSkipRow, parseImportDecimal, isBlankOrTotalBoqRow } from '../domain/boq-import-parse';
