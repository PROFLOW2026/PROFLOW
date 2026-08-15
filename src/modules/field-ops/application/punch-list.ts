import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertCanAccessProject, isAccessibleProjectId, resolveAccessibleProjectIds } from '@/modules/projects';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  canTransitionPunchStatus,
  closedAtForPunchStatus,
} from '../domain/punch-status';
import type { PunchPriority, PunchStatus } from '../domain/types';
import {
  findPunchListItemById,
  findPunchListItemByIdForUpdate,
  insertPunchListItem,
  listPunchListItems,
  updatePunchListItemById,
} from '../data/field-ops.repository';
import {
  createPunchListItemSchema,
  updatePunchListItemSchema,
  type CreatePunchListItemInput,
  type UpdatePunchListItemInput,
} from '../validation/schemas';
import { assertProjectRefsInOrg } from './assert-project-refs';

export async function listPunchListItemsForOrg(
  context: OrgContext,
  filters: { projectId?: string; status?: PunchStatus; priority?: PunchPriority } = {},
) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const [allowed, rows] = await Promise.all([
    resolveAccessibleProjectIds(context),
    listPunchListItems(context.db, context.organizationId, filters),
  ]);
  return rows.filter((row) => isAccessibleProjectId(allowed, row.projectId));
}

export async function getPunchListItemForOrg(context: OrgContext, punchListItemId: string) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_READ);
  const item = await findPunchListItemById(context.db, context.organizationId, punchListItemId);
  if (!item) throw new NotFoundError('Punch list item');
  await assertCanAccessProject(context, item.projectId);
  return item;
}

export async function createPunchListItem(context: OrgContext, raw: CreatePunchListItemInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = createPunchListItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const item = await insertPunchListItem(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    workPackageId: input.workPackageId ?? null,
    title: input.title,
    description: input.description ?? null,
    status: 'open',
    priority: input.priority ?? 'normal',
    location: input.location ?? null,
    dueDate: input.dueDate ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'field_ops');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PUNCH_LIST_ITEM_CREATED,
    entityType: 'punch_list_item',
    entityId: item.id,
    after: { id: item.id, projectId: item.projectId, status: item.status },
  });
  return item;
}

export async function updatePunchListItem(context: OrgContext, raw: UpdatePunchListItemInput) {
  assertPermission(context, PERMISSIONS.FIELD_OPS_MANAGE);
  const parsed = updatePunchListItemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const existing = await findPunchListItemByIdForUpdate(
      tx,
      context.organizationId,
      input.punchListItemId,
    );
    if (!existing) throw new NotFoundError('Punch list item');
    await assertCanAccessProject(txContext, existing.projectId);

    if (input.status && !canTransitionPunchStatus(existing.status, input.status as PunchStatus)) {
      throw new DomainRuleError(
        `Cannot transition punch item from ${existing.status} to ${input.status}`,
        'fieldOps.errors.invalidPunchTransition',
      );
    }

    if (input.workPackageId) {
      await assertProjectRefsInOrg(txContext, {
        projectId: existing.projectId,
        workPackageId: input.workPackageId,
      });
    }

    const nextStatus = (input.status as PunchStatus | undefined) ?? existing.status;
    const statusChanging = input.status !== undefined && input.status !== existing.status;
    const closedAt = statusChanging ? closedAtForPunchStatus(nextStatus) : undefined;

    const updated = await updatePunchListItemById(
      tx,
      context.organizationId,
      input.punchListItemId,
      {
        title: input.title,
        description: input.description === undefined ? undefined : input.description,
        status: statusChanging ? (input.status as PunchStatus) : undefined,
        priority: input.priority,
        location: input.location === undefined ? undefined : input.location,
        dueDate: input.dueDate === undefined ? undefined : input.dueDate,
        workPackageId: input.workPackageId === undefined ? undefined : input.workPackageId,
        closedAt,
      },
      statusChanging ? { fromStatuses: [existing.status] } : undefined,
    );
    if (!updated) throw new ConflictError('Punch list item was updated concurrently');

    await recordAuditEvent(txContext, {
      action: AUDIT_ACTIONS.PUNCH_LIST_ITEM_UPDATED,
      entityType: 'punch_list_item',
      entityId: updated.id,
      before: existing,
      after: updated,
    });
    return updated;
  });
}
