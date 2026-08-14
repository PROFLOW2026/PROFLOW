import { createClient, createClientContact } from '@/modules/clients';
import { createVendor } from '@/modules/vendors';
import { createEmployee } from '@/modules/workforce';
import { createProject, upsertPrimaryContractAmount } from '@/modules/projects';
import { createExpense } from '@/modules/expenses';
import { costCategories } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { AppError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { previewImport } from './preview-import';
import { enrichImportPreview } from './enrich-preview';
import { assertCanImportKind } from './import-permissions';
import { confirmBoqItemsRows } from './confirm-boq-import';
import { isBoqImportSkipRow } from '../domain/boq-import-parse';
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
  /** When set, only these row numbers (file line numbers) are imported. Skipped rows are allowed. */
  readonly rowNumbers?: readonly number[];
  /** Required when kind is boq_items. */
  readonly projectId?: string;
  /** Optional draft BOQ target for boq_items. */
  readonly boqId?: string;
}

function emptyToUndefined(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  return value.trim();
}

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'category';
}

function parseIncludesTax(raw: string | undefined): boolean {
  const v = emptyToUndefined(raw)?.toLowerCase();
  return v === 'true' || v === '1' || v === 'yes' || v === 'כן';
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
    case 'contacts': {
      const contact = await createClientContact(context, {
        clientId: emptyToUndefined(v.clientId) ?? '',
        name: v.name ?? '',
        role: emptyToUndefined(v.role)?.toLowerCase() as
          | 'primary'
          | 'billing'
          | 'site'
          | 'other'
          | undefined,
        email: emptyToUndefined(v.email) ?? null,
        phone: emptyToUndefined(v.phone) ?? null,
        notes: emptyToUndefined(v.notes) ?? null,
      });
      return contact.id;
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
      const workKind = emptyToUndefined(v.workKind)?.toLowerCase() as
        | 'project'
        | 'job'
        | 'work_order'
        | undefined;
      // Conservative: never set contract/billing/expense amounts from projects CSV.
      const result = await createProject(context, {
        name: v.name ?? '',
        status,
        workKind,
        clientId: emptyToUndefined(v.clientId),
        location: emptyToUndefined(v.location),
        startDate: emptyToUndefined(v.startDate),
        targetEndDate: emptyToUndefined(v.targetEndDate),
        description: emptyToUndefined(v.description),
        notes: emptyToUndefined(v.notes),
      });
      return result.projectId;
    }
    case 'opening_values': {
      const projectId = emptyToUndefined(v.projectId);
      if (!projectId) {
        throw new ValidationError([
          { path: 'projectId', message: 'projectId must be resolved before import' },
        ]);
      }
      const currency = (
        emptyToUndefined(v.currency) ?? context.organization.baseCurrency
      ).toUpperCase();
      await upsertPrimaryContractAmount(context, {
        projectId,
        enteredAmount: emptyToUndefined(v.contractValueAmount) ?? '',
        currency,
        amountIncludesTax: parseIncludesTax(v.amountIncludesTax),
        openingReductionAmount: emptyToUndefined(v.openingReductionAmount),
      });
      return projectId;
    }
    case 'cost_categories': {
      assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
      const name = emptyToUndefined(v.name) ?? '';
      const family = (emptyToUndefined(v.family)?.toLowerCase() ?? 'direct_project') as
        | 'direct_project'
        | 'shared'
        | 'business_overhead'
        | 'asset_capital';
      const key = emptyToUndefined(v.key) ?? slugifyKey(name);
      const [inserted] = await context.db
        .insert(costCategories)
        .values({
          organizationId: context.organizationId,
          key,
          name,
          family,
          isSystem: false,
          sortOrder: 500,
        })
        .onConflictDoNothing({
          target: [costCategories.organizationId, costCategories.key],
        })
        .returning({ id: costCategories.id });
      if (!inserted) {
        throw new ValidationError([
          { path: 'key', message: 'Cost category key already exists — skipped to avoid overwrite' },
        ]);
      }
      return inserted.id;
    }
    case 'expenses': {
      // Canonical createExpense only — draft status, money/tax rules unchanged.
      const created = await createExpense(context, {
        amount: v.amount ?? '',
        currency: (emptyToUndefined(v.currency) ?? context.organization.baseCurrency).toUpperCase(),
        description: emptyToUndefined(v.description) ?? null,
        expenseDate: emptyToUndefined(v.expenseDate),
        supplierName: emptyToUndefined(v.supplierName) ?? null,
        vendorId: emptyToUndefined(v.vendorId) ?? null,
        projectId: emptyToUndefined(v.projectId) ?? null,
        costFamily: emptyToUndefined(v.costFamily)?.toLowerCase() as
          | 'direct_project'
          | 'shared'
          | 'business_overhead'
          | 'asset_capital'
          | null
          | undefined,
        notes: emptyToUndefined(v.notes) ?? null,
      });
      return created.id;
    }
    case 'boq_items': {
      throw new ValidationError([
        {
          path: 'kind',
          message: 'boq_items import uses confirmBoqItemsRows — not per-row createFromRow',
        },
      ]);
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

function buildResult(
  kind: EnabledImportKind,
  previewRowCount: number,
  selected: Set<number>,
  results: ImportRowResult[],
): ImportConfirmResult {
  const skipped = previewRowCount - selected.size;
  return {
    kind,
    created: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    skipped: Math.max(0, skipped),
    results,
  };
}

/**
 * Confirm a previously previewed import: create via existing module APIs
 * inside transactional batches (each batch = one withOrgContext transaction).
 * Error rows are never written. Unselected rows are skipped (allowed).
 */
export async function confirmImport(
  context: OrgContext,
  input: ConfirmImportInput,
): Promise<ImportConfirmResult> {
  if (!isEnabledImportKind(input.kind)) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown or disabled import kind' }]);
  }

  const kind = input.kind;
  assertCanImportKind(context, kind);

  const preview = await enrichImportPreview(
    context,
    previewImport(context, {
      kind,
      csvText: input.csvText,
      mapping: input.mapping,
    }),
  );

  if (!preview.enabled) {
    throw new ValidationError([{ path: 'kind', message: 'Import kind is not enabled' }]);
  }

  const selected = new Set(input.rowNumbers ?? preview.rows.map((r) => r.rowNumber));
  const candidates = preview.rows.filter(
    (row) =>
      selected.has(row.rowNumber) &&
      !rowHasErrors(row) &&
      !(kind === 'boq_items' && isBoqImportSkipRow(row.values)),
  );

  const results: ImportRowResult[] = [];

  if (kind === 'boq_items') {
    if (!input.projectId?.trim()) {
      throw new ValidationError([
        { path: 'projectId', message: 'projectId is required for boq_items import' },
      ]);
    }
    const boqResults = await confirmBoqItemsRows(context, candidates, {
      projectId: input.projectId,
      boqId: input.boqId,
    });
    results.push(...boqResults);
  } else {
    for (const row of candidates) {
      try {
        const entityId = await createFromRow(context, kind, row);
        results.push({ rowNumber: row.rowNumber, ok: true, entityId });
      } catch (error) {
        results.push({ rowNumber: row.rowNumber, ok: false, error: errorMessage(error) });
      }
    }
  }

  for (const row of preview.rows) {
    if (!selected.has(row.rowNumber)) continue;
    if (kind === 'boq_items' && isBoqImportSkipRow(row.values) && !rowHasErrors(row)) continue;
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
  return buildResult(kind, preview.rows.length, selected, results);
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
    throw new ValidationError([{ path: 'kind', message: 'Unknown or disabled import kind' }]);
  }

  const kind = input.kind;

  const preview = await runInOrg(async (context) => {
    assertCanImportKind(context, kind);
    return enrichImportPreview(
      context,
      previewImport(context, {
        kind,
        csvText: input.csvText,
        mapping: input.mapping,
      }),
    );
  });

  const selected = new Set(input.rowNumbers ?? preview.rows.map((r) => r.rowNumber));
  const candidates = preview.rows.filter(
    (row) =>
      selected.has(row.rowNumber) &&
      !rowHasErrors(row) &&
      !(kind === 'boq_items' && isBoqImportSkipRow(row.values)),
  );

  const results: ImportRowResult[] = [];

  if (kind === 'boq_items') {
    if (!input.projectId?.trim()) {
      throw new ValidationError([
        { path: 'projectId', message: 'projectId is required for boq_items import' },
      ]);
    }
    // Keep hierarchy + draft BOQ resolution in one org transaction per batch of rows.
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      const batchResults = await runInOrg(async (context) =>
        confirmBoqItemsRows(context, batch, {
          projectId: input.projectId!,
          boqId: input.boqId,
        }),
      );
      results.push(...batchResults);
    }
  } else {
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
  }

  for (const row of preview.rows) {
    if (!selected.has(row.rowNumber) || !rowHasErrors(row)) continue;
    if (kind === 'boq_items' && isBoqImportSkipRow(row.values)) continue;
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
  return buildResult(kind, preview.rows.length, selected, results);
}

export { BATCH_SIZE };
