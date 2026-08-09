import { createClient } from '@/modules/clients';
import { createVendor } from '@/modules/vendors';
import { createEmployee } from '@/modules/workforce';
import { createProject } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { AppError, ValidationError } from '@/shared/errors';
import { previewImport } from './preview-import';
import { assertCanImportKind } from './import-permissions';
import {
  isEnabledImportKind,
  type ColumnMapping,
  type EnabledImportKind,
  type ImportConfirmResult,
  type ImportRowResult,
  type MappedImportRow,
} from '../domain/types';
import { rowHasErrors } from '../validation/validate-rows';

const BATCH_SIZE = 25;

export interface ConfirmImportInput {
  readonly kind: string;
  readonly csvText: string;
  readonly mapping: ColumnMapping;
  /** When set, only these row numbers (file line numbers) are imported. */
  readonly rowNumbers?: readonly number[];
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

async function createFromRow(
  context: OrgContext,
  kind: EnabledImportKind,
  row: MappedImportRow,
): Promise<string> {
  const v = row.values;

  switch (kind) {
    case 'clients': {
      const client = await createClient(context, {
        name: v.name ?? '',
        legalName: emptyToUndefined(v.legalName),
        email: emptyToUndefined(v.email),
        phone: emptyToUndefined(v.phone),
        city: emptyToUndefined(v.city),
        countryCode: emptyToUndefined(v.countryCode)?.toUpperCase(),
        notes: emptyToUndefined(v.notes),
      });
      return client.id;
    }
    case 'vendors': {
      const vendor = await createVendor(context, {
        name: v.name ?? '',
        type: emptyToUndefined(v.type)?.toLowerCase() as
          | 'supplier'
          | 'subcontractor'
          | 'both'
          | 'other'
          | undefined,
        email: emptyToUndefined(v.email),
        phone: emptyToUndefined(v.phone),
        city: emptyToUndefined(v.city),
        countryCode: emptyToUndefined(v.countryCode)?.toUpperCase(),
        notes: emptyToUndefined(v.notes),
      });
      return vendor.id;
    }
    case 'employees': {
      const rateUnit = (emptyToUndefined(v.rateUnit)?.toLowerCase() ?? 'hourly') as
        | 'hourly'
        | 'daily'
        | 'monthly';
      const employee = await createEmployee(context, {
        name: v.name ?? '',
        rateUnit,
        baseRate: emptyToUndefined(v.baseRate),
        email: emptyToUndefined(v.email) ?? '',
        phone: emptyToUndefined(v.phone),
        jobTitle: emptyToUndefined(v.jobTitle),
        employeeNumber: emptyToUndefined(v.employeeNumber),
        notes: emptyToUndefined(v.notes),
      });
      return employee.id;
    }
    case 'projects': {
      const status = emptyToUndefined(v.status)?.toLowerCase() as
        | 'draft'
        | 'active'
        | 'on_hold'
        | 'completed'
        | 'cancelled'
        | 'archived'
        | undefined;
      // Conservative: never set contract/billing/expense amounts from CSV.
      const result = await createProject(context, {
        name: v.name ?? '',
        status,
        clientId: emptyToUndefined(v.clientId),
        location: emptyToUndefined(v.location),
        startDate: emptyToUndefined(v.startDate),
        targetEndDate: emptyToUndefined(v.targetEndDate),
        description: emptyToUndefined(v.description),
        notes: emptyToUndefined(v.notes),
      });
      return result.projectId;
    }
    default: {
      const _exhaustive: never = kind;
      throw new ValidationError([
        { path: 'kind', message: `Import kind is not enabled for create: ${String(_exhaustive)}` },
      ]);
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

/**
 * Confirm a previously previewed import: create via existing module APIs
 * inside transactional batches (each batch = one withOrgContext transaction).
 *
 * Caller must invoke this from within `withOrgContext` for permission/tenant
 * binding; batches that need separate commits should call `confirmImportInBatches`
 * from the server action instead.
 */
export async function confirmImport(
  context: OrgContext,
  input: ConfirmImportInput,
): Promise<ImportConfirmResult> {
  if (!isEnabledImportKind(input.kind)) {
    throw new ValidationError([
      {
        path: 'kind',
        message: 'Expense import is not enabled; use clients, vendors, employees, or projects',
      },
    ]);
  }

  const kind = input.kind;
  assertCanImportKind(context, kind);

  const preview = previewImport(context, {
    kind,
    csvText: input.csvText,
    mapping: input.mapping,
  });

  if (!preview.enabled) {
    throw new ValidationError([{ path: 'kind', message: 'Import kind is not enabled' }]);
  }

  const selected = new Set(input.rowNumbers ?? preview.rows.map((r) => r.rowNumber));
  const candidates = preview.rows.filter(
    (row) => selected.has(row.rowNumber) && !rowHasErrors(row),
  );

  const results: ImportRowResult[] = [];

  for (const row of candidates) {
    try {
      const entityId = await createFromRow(context, kind, row);
      results.push({ rowNumber: row.rowNumber, ok: true, entityId });
    } catch (error) {
      results.push({ rowNumber: row.rowNumber, ok: false, error: errorMessage(error) });
    }
  }

  // Also record skipped error rows that were requested.
  for (const row of preview.rows) {
    if (!selected.has(row.rowNumber)) continue;
    if (!rowHasErrors(row)) continue;
    results.push({
      rowNumber: row.rowNumber,
      ok: false,
      error: row.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; '),
    });
  }

  results.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    kind,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

/**
 * Runs confirm in transactional batches via a provided runner (typically
 * `withOrgContext`). Each batch commits independently so a later failure
 * does not undo earlier successful creates.
 */
export async function confirmImportInBatches(
  runInOrg: <T>(fn: (context: OrgContext) => Promise<T>) => Promise<T>,
  input: ConfirmImportInput,
): Promise<ImportConfirmResult> {
  if (!isEnabledImportKind(input.kind)) {
    throw new ValidationError([
      {
        path: 'kind',
        message: 'Expense import is not enabled; use clients, vendors, employees, or projects',
      },
    ]);
  }

  const kind = input.kind;

  const preview = await runInOrg((context) => {
    assertCanImportKind(context, kind);
    return Promise.resolve(
      previewImport(context, {
        kind,
        csvText: input.csvText,
        mapping: input.mapping,
      }),
    );
  });

  const selected = new Set(input.rowNumbers ?? preview.rows.map((r) => r.rowNumber));
  const candidates = preview.rows.filter(
    (row) => selected.has(row.rowNumber) && !rowHasErrors(row),
  );

  const results: ImportRowResult[] = [];

  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    const batchResults = await runInOrg(async (context) => {
      const out: ImportRowResult[] = [];
      for (const row of batch) {
        try {
          const entityId = await createFromRow(context, kind, row);
          out.push({ rowNumber: row.rowNumber, ok: true, entityId });
        } catch (error) {
          out.push({ rowNumber: row.rowNumber, ok: false, error: errorMessage(error) });
        }
      }
      return out;
    });
    results.push(...batchResults);
  }

  for (const row of preview.rows) {
    if (!selected.has(row.rowNumber) || !rowHasErrors(row)) continue;
    results.push({
      rowNumber: row.rowNumber,
      ok: false,
      error: row.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; '),
    });
  }

  results.sort((a, b) => a.rowNumber - b.rowNumber);

  return {
    kind,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  };
}

export { BATCH_SIZE };
