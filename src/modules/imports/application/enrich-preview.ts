import { and, eq, isNull } from 'drizzle-orm';
import { clients, employees, projects, vendors } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { EnabledImportKind, ImportIssue, ImportPreview, MappedImportRow } from '../domain/types';
import {
  detectExistingDuplicates,
  emptyExistingIndex,
  flagExistingNameDuplicates,
  mergeIssueMaps,
  normalizeName,
  type ExistingImportIndex,
} from '../domain/duplicates';
import { rowHasErrors } from '../validation/validate-rows';

/**
 * Tenant-safe reference checks + org-level duplicate guards.
 * Existing email / employeeNumber collisions are errors (duplicate retry safe).
 * Name collisions remain warnings.
 */
export async function enrichImportPreview(
  context: OrgContext,
  preview: ImportPreview,
): Promise<ImportPreview> {
  if (!preview.enabled) return preview;

  const kind = preview.kind as EnabledImportKind;
  let rows = [...preview.rows];

  if (kind === 'clients' || kind === 'vendors' || kind === 'employees') {
    const existing = await loadExistingIndex(context, kind);
    rows = flagExistingNameDuplicates(rows, existing.names, 'name', kind.slice(0, -1));
    rows = mergeIssueMaps(rows, detectExistingDuplicates(kind, rows, existing));
  }

  if (kind === 'projects') {
    rows = await enrichProjectRefs(context, rows);
  }

  if (kind === 'expenses') {
    rows = await enrichExpenseRefs(context, rows);
  }

  const errorCount = rows.filter(rowHasErrors).length;
  const warningCount = rows.filter((r) => r.issues.some((i) => i.severity === 'warning')).length;

  return {
    ...preview,
    rows,
    validCount: rows.length - errorCount,
    errorCount,
    warningCount,
  };
}

async function loadExistingIndex(
  context: OrgContext,
  kind: 'clients' | 'vendors' | 'employees',
): Promise<ExistingImportIndex> {
  if (kind === 'clients') {
    const rows = await context.db
      .select({ name: clients.name, email: clients.email })
      .from(clients)
      .where(and(eq(clients.organizationId, context.organizationId), isNull(clients.archivedAt)));
    return {
      ...emptyExistingIndex(),
      names: new Set(rows.map((r) => normalizeName(r.name))),
      emails: new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean)),
    };
  }
  if (kind === 'vendors') {
    const rows = await context.db
      .select({ name: vendors.name, email: vendors.email })
      .from(vendors)
      .where(and(eq(vendors.organizationId, context.organizationId), isNull(vendors.archivedAt)));
    return {
      ...emptyExistingIndex(),
      names: new Set(rows.map((r) => normalizeName(r.name))),
      emails: new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean)),
    };
  }

  const rows = await context.db
    .select({
      name: employees.name,
      email: employees.email,
      employeeNumber: employees.employeeNumber,
    })
    .from(employees)
    .where(and(eq(employees.organizationId, context.organizationId), isNull(employees.archivedAt)));
  return {
    ...emptyExistingIndex(),
    names: new Set(rows.map((r) => normalizeName(r.name))),
    emails: new Set(rows.map((r) => (r.email ?? '').trim().toLowerCase()).filter(Boolean)),
    employeeNumbers: new Set(
      rows.map((r) => (r.employeeNumber ?? '').trim().toLowerCase()).filter(Boolean),
    ),
  };
}

async function enrichProjectRefs(
  context: OrgContext,
  rows: MappedImportRow[],
): Promise<MappedImportRow[]> {
  const found = await context.db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(and(eq(clients.organizationId, context.organizationId), isNull(clients.archivedAt)));
  const allowed = new Set(found.map((r) => r.id));
  const byName = new Map<string, string>();
  for (const row of found) {
    const key = normalizeName(row.name);
    if (key && !byName.has(key)) byName.set(key, row.id);
  }

  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues];
    const values: Record<string, string> = { ...row.values };
    const clientId = values.clientId?.trim();
    const clientName = values.clientName?.trim();

    if (clientId) {
      if (!allowed.has(clientId)) {
        issues.push({
          severity: 'error',
          field: 'clientId',
          message: 'clientId is not a client in this organization',
        });
      }
    } else if (clientName) {
      const resolved = byName.get(normalizeName(clientName));
      if (!resolved) {
        issues.push({
          severity: 'error',
          field: 'clientName',
          message: 'Client name does not match a client in this organization',
        });
      } else {
        values.clientId = resolved;
      }
    }

    return { rowNumber: row.rowNumber, values, issues };
  });
}

async function enrichExpenseRefs(
  context: OrgContext,
  rows: MappedImportRow[],
): Promise<MappedImportRow[]> {
  const projectRows = await context.db
    .select({ id: projects.id, currency: projects.currency })
    .from(projects)
    .where(and(eq(projects.organizationId, context.organizationId), isNull(projects.archivedAt)));
  const projectCurrency = new Map(
    projectRows.map((r) => [r.id, (r.currency ?? context.organization.baseCurrency).toUpperCase()]),
  );

  const vendorRows = await context.db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.organizationId, context.organizationId), isNull(vendors.archivedAt)));
  const vendorIds = new Set(vendorRows.map((r) => r.id));

  const base = context.organization.baseCurrency.toUpperCase();

  return rows.map((row) => {
    const issues: ImportIssue[] = [...row.issues];
    const projectId = row.values.projectId?.trim();
    const vendorId = row.values.vendorId?.trim();
    const currency = (row.values.currency?.trim() || base).toUpperCase();

    if (projectId) {
      const expected = projectCurrency.get(projectId);
      if (!expected) {
        issues.push({
          severity: 'error',
          field: 'projectId',
          message: 'projectId is not a project in this organization',
        });
      } else if (currency !== expected) {
        issues.push({
          severity: 'error',
          field: 'currency',
          message: `Expense currency must match the project currency (${expected})`,
        });
      }
    } else if (currency !== base) {
      issues.push({
        severity: 'error',
        field: 'currency',
        message: `Overhead expense currency must match organization base currency (${base})`,
      });
    }

    if (vendorId && !vendorIds.has(vendorId)) {
      issues.push({
        severity: 'error',
        field: 'vendorId',
        message: 'vendorId is not a vendor in this organization',
      });
    }

    return { ...row, issues };
  });
}
