import { and, eq } from 'drizzle-orm';
import { clients, projects } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findServiceDetailsByProjectId,
  listWorkOrdersWithDetails,
} from '../data/service-details.repository';
import type { ProjectServiceDetailsRecord, WorkOrderListItem } from '../domain/types';
import { listWorkOrdersSchema, type ListWorkOrdersInput } from '../validation/schemas';
import { assertCanAccessProject, resolveAccessibleProjectIds } from '@/modules/projects';

export async function listWorkOrdersForOrg(
  context: OrgContext,
  rawFilters: ListWorkOrdersInput = {},
): Promise<WorkOrderListItem[]> {
  assertPermission(context, PERMISSIONS.SERVICE_READ);

  const parsed = listWorkOrdersSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const rows = await listWorkOrdersWithDetails(context.db, context.organizationId, {
    search: parsed.data.search,
    serviceStatus: parsed.data.serviceStatus,
    includeArchived: parsed.data.includeArchived,
  });
  const allowed = await resolveAccessibleProjectIds(context);
  if (allowed === null) return rows;
  const set = new Set(allowed);
  return rows.filter((row) => set.has(row.id));
}

export interface WorkOrderDetail {
  readonly project: {
    readonly id: string;
    readonly name: string;
    readonly documentNumber: string | null;
    readonly status: string;
    readonly workKind: string;
    readonly pricingMode: string | null;
    readonly clientId: string | null;
    readonly location: string | null;
    readonly description: string | null;
    readonly notes: string | null;
    readonly currency: string | null;
    readonly startDate: string | null;
  };
  readonly clientName: string | null;
  readonly service: ProjectServiceDetailsRecord;
}

/**
 * Work-order detail gated by `service.read` only (workers may lack `projects.read`).
 * Financial panels still require their own permissions when embedded.
 */
export async function getWorkOrderDetail(
  context: OrgContext,
  workOrderId: string,
): Promise<WorkOrderDetail> {
  assertPermission(context, PERMISSIONS.SERVICE_READ);

  const [row] = await context.db
    .select({
      id: projects.id,
      name: projects.name,
      documentNumber: projects.documentNumber,
      status: projects.status,
      workKind: projects.workKind,
      pricingMode: projects.pricingMode,
      clientId: projects.clientId,
      location: projects.location,
      description: projects.description,
      notes: projects.notes,
      currency: projects.currency,
      startDate: projects.startDate,
      clientName: clients.name,
    })
    .from(projects)
    .leftJoin(clients, eq(clients.id, projects.clientId))
    .where(
      and(eq(projects.id, workOrderId), eq(projects.organizationId, context.organizationId)),
    )
    .limit(1);

  if (!row) throw new NotFoundError('Work order');
  await assertCanAccessProject(context, workOrderId);
  if (row.workKind !== 'work_order') {
    throw new DomainRuleError('Not a work order', 'service.notAWorkOrder', {
      workOrderId,
      workKind: row.workKind,
    });
  }

  const service = await findServiceDetailsByProjectId(
    context.db,
    context.organizationId,
    workOrderId,
  );
  if (!service) throw new NotFoundError('Work order service details');

  return {
    project: {
      id: row.id,
      name: row.name,
      documentNumber: row.documentNumber ?? null,
      status: row.status,
      workKind: row.workKind,
      pricingMode: row.pricingMode,
      clientId: row.clientId,
      location: row.location,
      description: row.description,
      notes: row.notes,
      currency: row.currency,
      startDate: typeof row.startDate === 'string' ? row.startDate : row.startDate,
    },
    clientName: row.clientName,
    service,
  };
}
