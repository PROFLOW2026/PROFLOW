import { createClient } from '@/modules/clients';
import { noteModuleUsage } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createJobSchema, type CreateJobInput } from '../validation/schemas';
import { createProject, type CreateProjectResult } from './create-project';

export type CreateJobResult = CreateProjectResult;

function mergeWorkersNote(
  notes: string | null | undefined,
  workersNote: string | null | undefined,
): string | null {
  const base = notes?.trim() || '';
  const workers = workersNote?.trim() || '';
  if (!workers) return base || null;
  const line = `Workers: ${workers}`;
  return base ? `${base}\n${line}` : line;
}

/**
 * Quick job creation on the shared `projects` row (`work_kind=job`).
 *
 * - Fixed: managed revenue via {@link upsertPrimaryContractAmount} (reduction 0).
 * - Open: no contract row / no fake zero revenue.
 * - Default work package is still created (engine invariant) but job UX hides it.
 */
export async function createJob(
  context: OrgContext,
  rawInput: CreateJobInput,
): Promise<CreateJobResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);

  const parsed = createJobSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  let clientId = input.clientId ?? null;

  if (!clientId && input.clientName) {
    const client = await createClient(context, { name: input.clientName });
    clientId = client.id;
  }

  if (!clientId) {
    throw new ValidationError([{ path: 'clientId', message: 'Client is required' }]);
  }

  // Audited as project.created with workKind/pricingMode in the after payload.
  const result = await createProject(context, {
    name: input.name,
    description: input.description ?? null,
    clientId,
    workKind: 'job',
    pricingMode: input.pricingMode,
    contractValueAmount: input.pricingMode === 'fixed' ? input.priceAmount : null,
    contractValueCurrency: input.priceCurrency,
    amountIncludesTax: input.amountIncludesTax,
    startDate: input.startDate,
    targetEndDate: input.targetEndDate ?? null,
    notes: mergeWorkersNote(input.notes, input.workersNote),
    status: input.status,
  });

  // First real job auto-surfaces Jobs nav for projects-first orgs (Lead decision).
  await noteModuleUsage(context.db, context.organizationId, 'jobs');

  return result;
}
