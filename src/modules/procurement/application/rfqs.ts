import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findProcurementRfqById,
  insertProcurementRfq,
  insertProcurementRfqLines,
  listProcurementRfqLines,
  listProcurementRfqs,
  updateProcurementRfqStatus,
} from '../data/procurement.repository';
import {
  createRfqSchema,
  updateRfqStatusSchema,
  type CreateRfqInput,
} from '../validation/schemas';
import { assertOptionalProjectRefsInOrg } from './assert-project-refs';

export async function listRfqsForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);
  return listProcurementRfqs(context.db, context.organizationId);
}

export async function getRfqDetail(context: OrgContext, rfqId: string) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_READ);

  const rfq = await findProcurementRfqById(context.db, context.organizationId, rfqId);
  if (!rfq || rfq.archivedAt) return null;

  const lines = await listProcurementRfqLines(context.db, context.organizationId, rfq.id);
  return { rfq, lines };
}

export async function createRfq(context: OrgContext, raw: CreateRfqInput) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = createRfqSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  await assertOptionalProjectRefsInOrg(context, {
    projectId: input.projectId,
    workPackageId: input.workPackageId,
  });

  const rfq = await insertProcurementRfq(context.db, {
    organizationId: context.organizationId,
    title: input.title,
    projectId: input.projectId ?? null,
    workPackageId: input.workPackageId ?? null,
    dueDate: input.dueDate ?? null,
    notes: input.notes ?? null,
    status: 'draft',
  });

  await insertProcurementRfqLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      rfqId: rfq.id,
      description: line.description,
      materialItemId: line.materialItemId ?? null,
      quantity: line.quantity,
      unit: line.unit ?? null,
      sortOrder: index,
    })),
  );

  await noteModuleUsage(context.db, context.organizationId, 'procurement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROCUREMENT_RFQ_CREATED,
    entityType: 'procurement_rfq',
    entityId: rfq.id,
    after: { id: rfq.id, title: rfq.title, status: rfq.status },
  });

  return rfq;
}

export async function updateRfqStatus(
  context: OrgContext,
  raw: { rfqId: string; status: string },
) {
  assertPermission(context, PERMISSIONS.PROCUREMENT_MANAGE);

  const parsed = updateRfqStatusSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findProcurementRfqById(
    context.db,
    context.organizationId,
    parsed.data.rfqId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('RFQ');

  const updated = await updateProcurementRfqStatus(
    context.db,
    context.organizationId,
    existing.id,
    parsed.data.status,
  );
  if (!updated) throw new NotFoundError('RFQ');

  await noteModuleUsage(context.db, context.organizationId, 'procurement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROCUREMENT_RFQ_STATUS_UPDATED,
    entityType: 'procurement_rfq',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status },
  });

  return updated;
}
