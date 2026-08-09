import { recordAuditEvent } from '@/shared/audit';
import { todayInTimeZone } from '@/shared/dates';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { clients, projectDomains } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { DEFAULT_WORK_PACKAGE_NAME } from '../domain/types';
import {
  insertContract,
  insertContractValueEvent,
} from '../data/contracts.repository';
import { insertProject } from '../data/projects.repository';
import {
  insertWorkPackage,
} from '../data/work-packages.repository';
import { createProjectSchema, type CreateProjectInput } from '../validation/schemas';

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

  const clientId = input.clientId ?? null;

  if (clientId) {
    const [client] = await context.db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
      .limit(1);

    if (!client) throw new NotFoundError('Client');
  }

  const project = await insertProject(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    status: input.status,
    clientId,
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

  if (input.contractValueAmount) {
    assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);
    const amount = money(input.contractValueAmount, currency);
    const effectiveDate = todayInTimeZone(context.organization.timezone);

    const contract = await insertContract(context.db, {
      organizationId: context.organizationId,
      projectId: project.id,
      isPrimary: true,
      originalValueAmount: toNumericString(amount),
      currency,
    });

    await insertContractValueEvent(context.db, {
      organizationId: context.organizationId,
      contractId: contract.id,
      projectId: project.id,
      kind: 'original',
      amount: toNumericString(amount),
      currency,
      effectiveDate,
      reason: 'Original contract value',
      actorUserId: context.userId,
    });

    await recordAuditEvent(context, {
      action: 'contract.value_recorded',
      entityType: 'contract',
      entityId: contract.id,
      after: { projectId: project.id, kind: 'original', amount: toNumericString(amount), currency },
    });
  }

  await recordAuditEvent(context, {
    action: 'project.created',
    entityType: 'project',
    entityId: project.id,
    after: { name: project.name, status: project.status, clientId },
  });

  return { projectId: project.id, clientId };
}
