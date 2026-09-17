import { createClientSchema } from '@/modules/clients/validation/schemas';
import { CONTACT_ROLES } from '@/modules/clients/domain/types';
import { createVendorSchema } from '@/modules/vendors/validation/schemas';
import { VENDOR_TYPES } from '@/modules/vendors/domain/types';
import { createEmployeeSchema } from '@/modules/workforce/validation/schemas';
import { RATE_UNITS } from '@/modules/workforce/domain/types';
import { createProjectSchema } from '@/modules/projects/validation/schemas';
import { PROJECT_STATUSES, WORK_KINDS } from '@/modules/projects/domain/types';
import { createExpenseSchema } from '@/modules/expenses/validation/schemas';
import { createInventoryItemSchema } from '@/modules/assets/validation/schemas';
import { importsCopyTranslator } from '@/shared/i18n/sync-namespace-translator';
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
      message: 'validation.clientNameOrClientIdRequired',
    });
  }
  if (clientId && !UUID_RE.test(clientId)) {
    issues.push({ severity: 'error', field: 'clientId', message: 'validation.uuidInvalid' });
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
    issues.push({ severity: 'error', field: 'name', message: 'validation.nameRequired' });
  }

  const email = emptyToUndefined(values.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    issues.push({ severity: 'error', field: 'email', message: 'validation.invalidEmail' });
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

function employeeCostPermissionMessage(locale = 'en'): string {
  return importsCopyTranslator(locale)('validation.employeeCostPermission');
}

function validateEmployees(
  values: Readonly<Record<string, string>>,
  options: { locale?: string; canManageWorkforceCost?: boolean } = {},
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const rateUnitRaw = emptyToUndefined(values.rateUnit)?.toLowerCase() ?? 'hourly';
  if (!(RATE_UNITS as readonly string[]).includes(rateUnitRaw)) {
    issues.push({
      severity: 'error',
      field: 'rateUnit',
      message: `Invalid rate unit (expected: ${RATE_UNITS.join(', ')})`,
    });
  }

  const canManageCost = options.canManageWorkforceCost === true;
  for (const field of fieldDefsForKind('employees')) {
    if (!field.requiresCostManage) continue;
    const raw = emptyToUndefined(values[field.key]);
    if (raw && !canManageCost) {
      issues.push({
        severity: 'error',
        field: field.key,
        message: employeeCostPermissionMessage(options.locale ?? 'en'),
      });
    }
  }

  const baseRate = emptyToUndefined(values.baseRate);
  if (baseRate && !AMOUNT_RE.test(baseRate)) {
    issues.push({ severity: 'error', field: 'baseRate', message: 'validation.invalidAmount' });
  }

  const parsed = createEmployeeSchema.safeParse({
    name: values.name ?? '',
    rateUnit: rateUnitRaw,
    baseRate: canManageCost ? baseRate : undefined,
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
      message: 'validation.importNoBaseRateWarning',
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
    issues.push({ severity: 'error', field: 'clientId', message: 'validation.uuidInvalid' });
  }

  for (const dateField of ['startDate', 'targetEndDate'] as const) {
    const raw = emptyToUndefined(values[dateField]);
    if (raw && !DATE_RE.test(raw)) {
      issues.push({
        severity: 'error',
        field: dateField,
        message: 'validation.dateMustBeYyyyMmDd',
      });
    }
  }

  // Contract amounts belong in opening_values import - refuse silent money on projects.
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
        message: 'validation.financialAmountsNotOnProjects',
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
      message: 'validation.projectNameOrProjectIdRequired',
    });
  }
  if (projectId && !UUID_RE.test(projectId)) {
    issues.push({ severity: 'error', field: 'projectId', message: 'validation.uuidInvalid' });
  }

  const amount = emptyToUndefined(values.contractValueAmount);
  if (!amount || !AMOUNT_RE.test(amount)) {
    issues.push({
      severity: 'error',
      field: 'contractValueAmount',
      message: 'validation.contractValueRequired',
    });
  }

  const reduction = emptyToUndefined(values.openingReductionAmount);
  if (reduction && !AMOUNT_RE.test(reduction)) {
    issues.push({
      severity: 'error',
      field: 'openingReductionAmount',
      message: 'validation.invalidOpeningReduction',
    });
  }

  const currency = emptyToUndefined(values.currency)?.toUpperCase();
  if (currency && !/^[A-Z]{3}$/.test(currency)) {
    issues.push({
      severity: 'error',
      field: 'currency',
      message: 'validation.currencyIsoCode',
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
      message: 'validation.booleanRequired',
    });
  }

  return issues;
}

function validateCostCategories(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const name = emptyToUndefined(values.name);
  if (!name || name.length < 2) {
    issues.push({ severity: 'error', field: 'name', message: 'validation.nameMinTwoChars' });
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
 * Expense rows validate through createExpenseSchema - never invents money rules.
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
      message: 'validation.dateMustBeYyyyMmDd',
    });
  }

  const amount = emptyToUndefined(values.amount);
  if (amount && !AMOUNT_RE.test(amount)) {
    issues.push({ severity: 'error', field: 'amount', message: 'validation.invalidAmount' });
  }

  const currency = (emptyToUndefined(values.currency) ?? baseCurrency).toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    issues.push({
      severity: 'error',
      field: 'currency',
      message: 'validation.currencyIsoCode',
    });
  }

  for (const refField of ['projectId', 'vendorId'] as const) {
    const raw = emptyToUndefined(values[refField]);
    if (raw && !UUID_RE.test(raw)) {
      issues.push({
        severity: 'error',
        field: refField,
        message: 'validation.orgUuidRequired',
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
        message: 'validation.taxVatNotImported',
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
      message: 'validation.noProjectOverheadWarning',
    });
  }

  return issues;
}

/**
 * BOQ item rows - decimal parsing (commas/currency), blank/total skip, qty/price/amount checks.
 * Description required unless the row is blank/total (skipped on confirm).
 */
export function validateBoqItems(
  values: Readonly<Record<string, string>>,
  locale = 'en',
): ImportIssue[] {
  const t = importsCopyTranslator(locale);
  const msg = {
    blankSkip: t('validation.boq.blankSkip'),
    descriptionRequired: t('validation.boq.descriptionRequired'),
    invalidQty: t('validation.boq.invalidQty'),
    invalidPrice: t('validation.boq.invalidPrice'),
    invalidAmount: t('validation.boq.invalidAmount'),
    noMoney: t('validation.boq.noMoney'),
    amountMismatch: t('validation.boq.amountMismatch'),
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

function remapInventoryField(path: string | undefined): string | undefined {
  if (path === 'quantityOnHand') return 'openingQty';
  return path;
}

/** Qty catalog only - opening receive is not Actual. */
function validateInventory(values: Readonly<Record<string, string>>): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const parsed = createInventoryItemSchema.safeParse({
    name: values.name ?? '',
    sku: emptyToUndefined(values.sku),
    barcode: emptyToUndefined(values.barcode),
    unit: emptyToUndefined(values.unit),
    quantityOnHand: emptyToUndefined(values.openingQty) ?? '0',
    reorderLevel: emptyToUndefined(values.reorderLevel) ?? null,
    minStockLevel: emptyToUndefined(values.minStockLevel) ?? null,
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = remapInventoryField(issue.path.length ? String(issue.path[0]) : undefined);
      issues.push({
        severity: 'error',
        field,
        message: issue.message,
      });
    }
  }
  return issues;
}


const BILLING_PLAN_LINE_KINDS = [
  'fixed_amount',
  'percent_of_contract',
  'percent_of_base',
  'milestone',
  'period',
  'boq_link',
  'manual',
] as const;

function validateBillingPlan(
  values: Readonly<Record<string, string>>,
  options: { locale?: string } = {},
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const t = importsCopyTranslator(options.locale ?? 'en');
  const label = emptyToUndefined(values.label);
  if (!label) {
    issues.push({
      severity: 'error',
      field: 'label',
      message: t('validation.billingPlan.labelRequired'),
    });
  }
  const amountRaw = emptyToUndefined(values.agreedAmount);
  const percentRaw = emptyToUndefined(values.agreedPercent);
  if (!amountRaw && !percentRaw) {
    issues.push({
      severity: 'error',
      field: 'agreedAmount',
      message: t('validation.billingPlan.amountOrPercentRequired'),
    });
  }
  if (amountRaw && !AMOUNT_RE.test(amountRaw)) {
    issues.push({
      severity: 'error',
      field: 'agreedAmount',
      message: t('validation.billingPlan.invalidAgreedAmount'),
    });
  }
  if (percentRaw) {
    const n = Number(percentRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      issues.push({
        severity: 'error',
        field: 'agreedPercent',
        message: t('validation.billingPlan.invalidAgreedPercent'),
      });
    }
  }
  const dateRaw = emptyToUndefined(values.targetDate);
  if (dateRaw && !DATE_RE.test(dateRaw)) {
    issues.push({
      severity: 'error',
      field: 'targetDate',
      message: t('validation.billingPlan.invalidTargetDate'),
    });
  }
  const kindRaw = emptyToUndefined(values.lineKind)?.toLowerCase();
  if (kindRaw && !(BILLING_PLAN_LINE_KINDS as readonly string[]).includes(kindRaw)) {
    issues.push({
      severity: 'error',
      field: 'lineKind',
      message: t('validation.billingPlan.invalidLineKind', {
        kinds: BILLING_PLAN_LINE_KINDS.join(', '),
      }),
    });
  }
  return issues;
}

export function validateMappedValues(
  kind: EnabledImportKind,
  values: Readonly<Record<string, string>>,
  options: {
    baseCurrency?: string;
    locale?: string;
    canManageWorkforceCost?: boolean;
  } = {},
): ImportIssue[] {
  switch (kind) {
    case 'clients':
      return validateClients(values);
    case 'contacts':
      return validateContacts(values);
    case 'vendors':
      return validateVendors(values);
    case 'employees':
      return validateEmployees(values, options);
    case 'projects':
      return validateProjects(values);
    case 'opening_values':
      return validateOpeningValues(values);
    case 'cost_categories':
      return validateCostCategories(values);
    case 'expenses':
      return validateExpenses(values, options.baseCurrency ?? 'ILS');
    case 'inventory':
      return validateInventory(values);
    case 'boq_items':
      return validateBoqItems(values, options.locale ?? 'en');
    case 'billing_plan':
      return validateBillingPlan(values, options);
  }
}

export function validateMappedRows(
  kind: EnabledImportKind,
  rows: readonly { rowNumber: number; values: Readonly<Record<string, string>> }[],
  options: {
    baseCurrency?: string;
    locale?: string;
    canManageWorkforceCost?: boolean;
  } = {},
): MappedImportRow[] {
  const fields = fieldDefsForKind(kind);
  const t = importsCopyTranslator(options.locale ?? 'en');
  return rows.map((row) => {
    const issues: ImportIssue[] = [];
    const skipRequired =
      kind === 'boq_items' && isBlankOrTotalBoqRow(row.values);
    for (const field of fields) {
      if (skipRequired) break;
      if (field.required && !(row.values[field.key] ?? '').trim()) {
        issues.push({
          severity: 'error',
          field: field.key,
          message: t('validation.fieldRequired', { field: field.key }),
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
