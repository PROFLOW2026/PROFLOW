/**
 * Org-wide contracts directory (read-only). Does not create a new contract engine —
 * lists existing project contracts and links into project contract UI.
 */

import { and, desc, eq, isNull } from 'drizzle-orm';
import { clients, contracts, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeCurrentContractValue,
  findOriginalContractValue,
} from '@/modules/commercial/domain/contract-value';
import {
  isAccessibleProjectId,
  resolveAccessibleProjectIds,
} from '@/modules/projects/application/project-access';
import { listContractValueEventsForContracts } from '../data/contracts.repository';
import { z } from 'zod';

const listOrgContractsSchema = z.object({
  status: z.enum(['draft', 'active', 'closed', 'cancelled', 'all']).optional(),
  contractType: z.enum(['primary', 'additional', 'secondary', 'all']).optional(),
  clientId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(0).optional(),
});

export type ListOrgContractsInput = z.input<typeof listOrgContractsSchema>;

export interface OrgContractListItem {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly contractType: string;
  readonly status: string;
  readonly contractNumber: string | null;
  readonly name: string | null;
  readonly currency: string;
  readonly originalAmount: string | null;
  readonly currentAmount: string | null;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly signedDate: string | null;
}

export async function listOrgContracts(
  context: OrgContext,
  rawFilters: ListOrgContractsInput = {},
): Promise<OrgContractListItem[]> {
  assertPermission(context, PERMISSIONS.CONTRACTS_READ);

  const parsed = listOrgContractsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const accessibleProjectIds = await resolveAccessibleProjectIds(context);
  const conditions = [
    eq(contracts.organizationId, context.organizationId),
    isNull(contracts.archivedAt),
  ];

  if (parsed.data.status && parsed.data.status !== 'all') {
    conditions.push(eq(contracts.status, parsed.data.status));
  }
  if (parsed.data.contractType && parsed.data.contractType !== 'all') {
    conditions.push(eq(contracts.contractType, parsed.data.contractType));
  }
  if (parsed.data.clientId) {
    conditions.push(eq(contracts.clientId, parsed.data.clientId));
  }
  if (parsed.data.projectId) {
    conditions.push(eq(contracts.projectId, parsed.data.projectId));
  }

  const rows = await context.db
    .select({
      contract: contracts,
      projectName: projects.name,
      clientName: clients.name,
    })
    .from(contracts)
    .innerJoin(
      projects,
      and(eq(projects.id, contracts.projectId), eq(projects.organizationId, context.organizationId)),
    )
    .leftJoin(
      clients,
      and(eq(clients.id, contracts.clientId), eq(clients.organizationId, context.organizationId)),
    )
    .where(and(...conditions))
    .orderBy(desc(contracts.updatedAt))
    .limit(resolveListLimit(parsed.data.limit, { hardCap: ORG_LIST_HARD_CAP }));

  const visible = rows.filter((row) =>
    isAccessibleProjectId(accessibleProjectIds, row.contract.projectId),
  );

  const contractIds = visible.map((row) => row.contract.id);
  const events = await listContractValueEventsForContracts(
    context.db,
    context.organizationId,
    contractIds,
  );
  const eventsByContract = new Map<string, typeof events>();
  for (const event of events) {
    const list = eventsByContract.get(event.contractId) ?? [];
    list.push(event);
    eventsByContract.set(event.contractId, list);
  }

  return visible.map((row) => {
    const contractEvents = (eventsByContract.get(row.contract.id) ?? []).map((event) => ({
      id: event.id,
      organizationId: event.organizationId,
      contractId: event.contractId,
      projectId: event.projectId,
      kind: event.kind as 'original' | 'change_order' | 'adjustment',
      amount: event.amount,
      currency: event.currency,
      changeOrderId: event.changeOrderId,
      effectiveDate: event.effectiveDate,
    }));
    const currency = row.contract.currency;
    const original = findOriginalContractValue(
      contractEvents,
      currency,
      row.contract.originalValueAmount,
    );
    const current =
      contractEvents.length > 0
        ? computeCurrentContractValue(contractEvents, currency)
        : original;

    return {
      id: row.contract.id,
      projectId: row.contract.projectId,
      projectName: row.projectName,
      clientId: row.contract.clientId,
      clientName: row.clientName ?? null,
      contractType: row.contract.contractType,
      status: row.contract.status,
      contractNumber: row.contract.contractNumber,
      name: row.contract.name,
      currency,
      originalAmount: original.amount,
      currentAmount: current.amount,
      startDate: row.contract.startDate,
      endDate: row.contract.endDate,
      signedDate: row.contract.signedDate,
    };
  });
}
