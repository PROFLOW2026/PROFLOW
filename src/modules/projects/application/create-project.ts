import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { allocateDocumentNumber, documentKindForWorkKind } from '@/modules/tenancy';
import { createClient } from '@/modules/clients';
import { clients, projectDomains } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_WORK_PACKAGE_NAME } from '../domain/types';
import { insertProject } from '../data/projects.repository';
import { insertWorkPackage } from '../data/work-packages.repository';
import { createProjectSchema, type CreateProjectInput } from '../validation/schemas';
import { resolvePrimaryContactIdForProject } from './assert-project-contact';
import { upsertPrimaryContractAmount } from './contract-amount';

export interface CreateProjectResult {
  readonly projectId: string;
  readonly clientId: string | null;
}

/**
 * Creates a project with only a name required (doc 48 §4, U6).
 *
 * Side effects in one transaction:
 *  - default/general work package (hidden from simple UI)
 *  - optional primary contract + original value event when amount supplied
 *  - optional ad-hoc project domain
 *  - optional minimal client when a free-text name is provided
 */
export async function createProject(
  context: OrgContext,
  rawInput: CreateProjectInput,
): Promise<CreateProjectResult> {
  assertPermission(context, PERMISSIONS.PROJECTS_CREATE);

  const parsed = createProjectSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const currency = (input.contractValueCurrency ?? context.organization.baseCurrency).toUpperCase();

  let clientId = input.clientId ?? null;
  if (!clientId && input.clientName) {
    const client = await createClient(context, { name: input.clientName });
    clientId = client.id;
  }

  if (clientId) {
    const [client] = await context.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
      .limit(1);

    if (!client) throw new NotFoundError('Client');
  }

  const primaryContactId = await resolvePrimaryContactIdForProject(
    context,
    clientId,
    input.primaryContactId ?? null,
  );

  const workKind = input.workKind ?? 'project';
  const pricingMode =
    workKind === 'job' || workKind === 'work_order' ? (input.pricingMode ?? null) : null;

  const documentNumber = await allocateDocumentNumber(
    context,
    documentKindForWorkKind(workKind),
  );

  const project = await insertProject(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    documentNumber,
    status: input.status,
    workKind,
    pricingMode,
    clientId,
    primaryContactId,
    currency: input.contractValueAmount ? currency : null,
    description: input.description ?? null,
    location: input.location ?? null,
    projectRole: input.projectRole ?? null,
    deliveryMode: input.deliveryMode ?? null,
    startDate: input.startDate ?? null,
    targetEndDate: input.targetEndDate ?? null,
    notes: input.notes ?? null,
  });

  await insertWorkPackage(context.db, {
    organizationId: context.organizationId,
    projectId: project.id,
    name: DEFAULT_WORK_PACKAGE_NAME,
    isDefault: true,
    sortOrder: 0,
  });

  if (input.domainName) {
    await context.db.insert(projectDomains).values({
      organizationId: context.organizationId,
      projectId: project.id,
      adHocName: input.domainName,
    });
  }

  // Open-price jobs / work orders must not invent a zero-revenue contract.
  const shouldUpsertContract =
    Boolean(input.contractValueAmount) &&
    !((workKind === 'job' || workKind === 'work_order') && pricingMode === 'open');

  if (shouldUpsertContract && input.contractValueAmount) {
    await upsertPrimaryContractAmount(context, {
      projectId: project.id,
      enteredAmount: input.contractValueAmount,
      currency,
      amountIncludesTax: input.amountIncludesTax ?? false,
      openingReductionAmount: input.openingReductionAmount,
    });
  }

  await recordAuditEvent(context, {
    action: 'project.created',
    entityType: 'project',
    entityId: project.id,
    after: {
      name: project.name,
      documentNumber: project.documentNumber,
      status: project.status,
      clientId,
      primaryContactId,
      workKind,
      pricingMode: project.pricingMode,
    },
  });

  return { projectId: project.id, clientId };
}
