import { createClientSchema } from '@/modules/clients';
import { createVendorSchema, VENDOR_TYPES } from '@/modules/vendors';
import { createEmployeeSchema, RATE_UNITS } from '@/modules/workforce';
import { createProjectSchema, PROJECT_STATUSES } from '@/modules/projects';
import type { EnabledImportKind, ImportIssue, MappedImportRow } from '../domain/types';
import { fieldDefsForKind } from '../domain/field-defs';

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
  if (baseRate && !/^[+]?\d+(\.\d+)?$/.test(baseRate)) {
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

  // Contract amounts are intentionally omitted — financial import is conservative.
  const parsed = createProjectSchema.safeParse({
    name: values.name ?? '',
    status: statusRaw,
    clientId: emptyToUndefined(values.clientId),
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

export function validateMappedValues(
  kind: EnabledImportKind,
  values: Readonly<Record<string, string>>,
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
  }
}

export function validateMappedRows(
  kind: EnabledImportKind,
  rows: readonly { rowNumber: number; values: Readonly<Record<string, string>> }[],
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
    issues.push(...validateMappedValues(kind, row.values));
    // Dedupe identical messages on the same field.
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
