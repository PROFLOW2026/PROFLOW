import { listContractsForProjects } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  listCrmHistoryForClient,
  listTasksForProjectIds,
  type ClientCrmHistoryRows,
  type ClientProjectTaskRow,
} from '../data/client-card.repository';

const TASK_CAP = 20;

export interface ClientProjectContractItem {
  readonly id: string;
  readonly projectId: string;
  readonly name: string | null;
  readonly contractNumber: string | null;
  readonly status: string;
  readonly contractType: string;
  readonly isPrimary: boolean;
}

/** Non-archived contracts on the client's projects. Amounts stay on the financial panels. */
export async function listClientProjectContracts(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<ClientProjectContractItem[]> {
  assertPermission(context, PERMISSIONS.CONTRACTS_READ);
  if (projectIds.length === 0) return [];

  const rows = await listContractsForProjects(context.db, context.organizationId, projectIds);
  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    contractNumber: row.contractNumber,
    status: row.status,
    contractType: row.contractType,
    isPrimary: row.isPrimary,
  }));
}

/** Recent tasks whose projectId is one of this client's projects. */
export async function listClientProjectTasks(
  context: OrgContext,
  projectIds: readonly string[],
): Promise<ClientProjectTaskRow[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);
  return listTasksForProjectIds(context.db, context.organizationId, projectIds, TASK_CAP);
}

/** Opportunities and prospects converted to this client, plus leads on those prospects. */
export async function listClientCrmHistory(
  context: OrgContext,
  clientId: string,
): Promise<ClientCrmHistoryRows> {
  assertPermission(context, PERMISSIONS.CRM_READ);
  return listCrmHistoryForClient(context.db, context.organizationId, clientId);
}

export type { ClientCrmHistoryRows, ClientProjectTaskRow };
