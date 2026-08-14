import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { BOQ_AUDIT_ACTIONS } from '../domain/types';
import {
  findBoqById,
  findBoqNodeById,
  updateBoqNodeMappings as persistMappings,
} from '../data/boq.repository';
import {
  updateBoqNodeMappingsSchema,
  type UpdateBoqNodeMappingsInput,
} from '../validation/schemas';

/**
 * Updates related mappings (WP / cost category / budget line) on a draft BOQ item only.
 * After activation, mappings are DB-locked (no silent report reclassification).
 */
export async function updateBoqNodeMappings(context: OrgContext, raw: UpdateBoqNodeMappingsInput) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = updateBoqNodeMappingsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  const node = await findBoqNodeById(context.db, context.organizationId, input.nodeId);
  if (!node) throw new NotFoundError('BOQ node');

  const boq = await findBoqById(context.db, context.organizationId, node.boqId);
  if (!boq) throw new NotFoundError('BOQ');
  if (boq.status !== 'draft') {
    throw new ConflictError('WP/cost/budget mappings are locked after BOQ activation');
  }

  const patch: {
    workPackageId?: string | null;
    costCategoryId?: string | null;
    budgetLineId?: string | null;
  } = {};
  if (input.workPackageId !== undefined) patch.workPackageId = input.workPackageId;
  if (input.costCategoryId !== undefined) patch.costCategoryId = input.costCategoryId;
  if (input.budgetLineId !== undefined) patch.budgetLineId = input.budgetLineId;

  await persistMappings(context.db, context.organizationId, node.id, patch);

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_NODE_UPDATED,
    entityType: 'boq_node',
    entityId: node.id,
    after: { mappings: patch, moneyColumnsUntouched: true },
  });

  return findBoqNodeById(context.db, context.organizationId, node.id);
}
