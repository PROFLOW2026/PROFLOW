import Decimal from 'decimal.js';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  findPrimaryContractByProject,
  findContractById,
  listContractsByProject,
} from '@/modules/projects';
import { computeLineAmount, quantityString } from '../domain/amounts';
import { maskBoqNodeMoney } from '../domain/mask-money';
import {
  canActivateBoq,
  canEditBoqBaseline,
  canHardDeleteBoqNode,
} from '../domain/lifecycle';
import { BOQ_AUDIT_ACTIONS, type BoqPricingType } from '../domain/types';
import {
  archiveBoqNode,
  activateProjectBoqRpc,
  deleteDraftBoqNode,
  findActiveBoqForProject,
  findBoqById,
  findBoqNodeById,
  findProjectInOrganization,
  insertBoqNode,
  insertProjectBoq,
  listBoqNodes,
  listBoqsForProject,
  listChangeAllocationsForBoq,
  listProjectChangeOrdersForBoq,
  nextBoqVersionNumber,
  nodeHasBillingLinkedProgress,
  nodeHasProgressHistory,
  sumItemAmounts,
  updateBoqNodeDraft,
  updateProjectBoqContractId,
} from '../data/boq.repository';
import {
  activateBoqSchema,
  createProjectBoqSchema,
  upsertBoqNodeSchema,
  type ActivateBoqInput,
  type CreateProjectBoqInput,
  type UpsertBoqNodeInput,
} from '../validation/schemas';

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}) {
  return new ValidationError(
    error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
  );
}

export async function createProjectBoq(context: OrgContext, raw: CreateProjectBoqInput) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = createProjectBoqSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  const project = await findProjectInOrganization(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  if (!project) throw new NotFoundError('Project');

  const liveContracts = await listContractsByProject(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  let contractId = parsed.data.contractId ?? null;
  if (contractId) {
    const contract = await findContractById(context.db, context.organizationId, contractId);
    if (!contract || contract.projectId !== parsed.data.projectId) {
      throw new NotFoundError('Contract');
    }
  } else if (liveContracts.length > 1) {
    const primary = liveContracts.find((row) => row.isPrimary) ?? liveContracts[0]!;
    contractId = primary.id;
  }

  const active = await findActiveBoqForProject(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    contractId,
  );
  // Allow draft alongside active; only one active enforced by DB.

  const versionNumber = await nextBoqVersionNumber(
    context.db,
    context.organizationId,
    parsed.data.projectId,
    contractId,
  );
  const currency = (parsed.data.currency ?? project.currency ?? context.organization.baseCurrency)
    .toUpperCase();

  const boqId = await insertProjectBoq(context.db, context.organizationId, {
    projectId: parsed.data.projectId,
    versionNumber,
    title: parsed.data.title?.trim() || null,
    currency,
    progressMode: parsed.data.progressMode ?? 'simple',
    notes: parsed.data.notes?.trim() || null,
    createdByUserId: context.userId,
    contractId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'boq');
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_CREATED,
    entityType: 'project_boq',
    entityId: boqId,
    after: { projectId: parsed.data.projectId, versionNumber, currency, activeExists: Boolean(active) },
  });

  return findBoqById(context.db, context.organizationId, boqId);
}

export async function upsertBoqNode(context: OrgContext, raw: UpsertBoqNodeInput) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = upsertBoqNodeSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const boq = await findBoqById(context.db, context.organizationId, input.boqId);
  if (!boq) throw new NotFoundError('BOQ');
  if (!canEditBoqBaseline(boq.status as 'draft' | 'active' | 'superseded' | 'archived')) {
    throw new ConflictError('Only draft BOQ baselines can be edited');
  }

  const pricingType = (input.pricingType ?? 'quantity_unit_price') as BoqPricingType;
  const quantity = quantityString(input.quantity ?? '0');
  const unitPrice = money(input.unitPrice ?? '0', boq.currency);
  const amount = computeLineAmount({ pricingType, quantity, unitPrice });
  const amountStr = toNumericString(amount);
  const unitPriceStr = toNumericString(unitPrice);

  if (input.nodeId) {
    const existing = await findBoqNodeById(context.db, context.organizationId, input.nodeId);
    if (!existing || existing.boqId !== boq.id) throw new NotFoundError('BOQ node');
    await updateBoqNodeDraft(context.db, context.organizationId, input.nodeId, {
      parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      itemCode: input.itemCode === undefined ? existing.itemCode : input.itemCode,
      description: input.description,
      unit: input.unit === undefined ? existing.unit : input.unit,
      pricingType,
      originalQuantity: quantity,
      originalUnitPrice: unitPriceStr,
      originalAmount: amountStr,
      currentQuantity: quantity,
      currentUnitPrice: unitPriceStr,
      currentAmount: amountStr,
      openingApprovedQuantity: quantityString(input.openingApprovedQuantity ?? existing.openingApprovedQuantity),
      openingBilledQuantity: quantityString(input.openingBilledQuantity ?? existing.openingBilledQuantity),
      workPackageId: input.workPackageId === undefined ? existing.workPackageId : input.workPackageId,
      costCategoryId: input.costCategoryId === undefined ? existing.costCategoryId : input.costCategoryId,
      budgetLineId: input.budgetLineId === undefined ? existing.budgetLineId : input.budgetLineId,
      sortOrder: input.sortOrder ?? existing.sortOrder,
      notes: input.notes === undefined ? existing.notes : input.notes,
    });
    await recordAuditEvent(context, {
      action: BOQ_AUDIT_ACTIONS.BOQ_NODE_UPDATED,
      entityType: 'boq_node',
      entityId: input.nodeId,
    });
    return findBoqNodeById(context.db, context.organizationId, input.nodeId);
  }

  const nodeId = await insertBoqNode(context.db, context.organizationId, {
    boqId: boq.id,
    parentId: input.parentId ?? null,
    nodeKind: input.nodeKind,
    itemCode: input.itemCode ?? null,
    description: input.description,
    unit: input.unit ?? null,
    pricingType,
    originalQuantity: quantity,
    originalUnitPrice: unitPriceStr,
    originalAmount: amountStr,
    currentQuantity: quantity,
    currentUnitPrice: unitPriceStr,
    currentAmount: amountStr,
    openingApprovedQuantity: quantityString(input.openingApprovedQuantity ?? '0'),
    openingBilledQuantity: quantityString(input.openingBilledQuantity ?? '0'),
    workPackageId: input.workPackageId ?? null,
    costCategoryId: input.costCategoryId ?? null,
    budgetLineId: input.budgetLineId ?? null,
    sourceChangeOrderId: null,
    sortOrder: input.sortOrder ?? 0,
    notes: input.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_NODE_CREATED,
    entityType: 'boq_node',
    entityId: nodeId,
  });
  return findBoqNodeById(context.db, context.organizationId, nodeId);
}

export async function activateBoq(context: OrgContext, raw: ActivateBoqInput) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const parsed = activateBoqSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  const boq = await findBoqById(context.db, context.organizationId, parsed.data.boqId);
  if (!boq) throw new NotFoundError('BOQ');
  if (!canActivateBoq(boq.status as 'draft' | 'active' | 'superseded' | 'archived')) {
    throw new ConflictError('Only draft BOQ can be activated');
  }

  const nodes = await listBoqNodes(context.db, context.organizationId, boq.id);
  if (!nodes.some((node) => node.nodeKind === 'item')) {
    throw new ValidationError([{ path: 'boqId', message: 'Activate requires at least one item' }]);
  }

  if (parsed.data.contractId !== undefined) {
    if (parsed.data.contractId) {
      const contract = await findContractById(
        context.db,
        context.organizationId,
        parsed.data.contractId,
      );
      if (!contract || contract.projectId !== boq.projectId) {
        throw new NotFoundError('Contract');
      }
    }
    await updateProjectBoqContractId(
      context.db,
      context.organizationId,
      boq.id,
      parsed.data.contractId,
    );
  } else if (!boq.contractId) {
    const liveContracts = await listContractsByProject(
      context.db,
      context.organizationId,
      boq.projectId,
    );
    if (liveContracts.length > 1) {
      const primary =
        liveContracts.find((row) => row.isPrimary) ??
        (await findPrimaryContractByProject(context.db, context.organizationId, boq.projectId));
      if (primary) {
        await updateProjectBoqContractId(context.db, context.organizationId, boq.id, primary.id);
      }
    }
  }

  await activateProjectBoqRpc(context.db, context.organizationId, boq.id);

  await noteModuleUsage(context.db, context.organizationId, 'boq');
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_ACTIVATED,
    entityType: 'project_boq',
    entityId: boq.id,
  });

  return findBoqById(context.db, context.organizationId, boq.id);
}

export async function removeBoqNode(context: OrgContext, nodeId: string) {
  assertPermission(context, PERMISSIONS.BOQ_MANAGE);
  const node = await findBoqNodeById(context.db, context.organizationId, nodeId);
  if (!node) throw new NotFoundError('BOQ node');
  const boq = await findBoqById(context.db, context.organizationId, node.boqId);
  if (!boq) throw new NotFoundError('BOQ');

  const hasProgressHistory = await nodeHasProgressHistory(
    context.db,
    context.organizationId,
    nodeId,
  );
  const hasBillingLink = await nodeHasBillingLinkedProgress(
    context.db,
    context.organizationId,
    nodeId,
  );
  const allowed = canHardDeleteBoqNode({
    boqStatus: boq.status as 'draft' | 'active' | 'superseded' | 'archived',
    hasProgressHistory,
    hasBillingLink,
    hasChangeAllocation: Boolean(node.sourceChangeOrderId),
  });
  if (allowed) {
    await deleteDraftBoqNode(context.db, context.organizationId, nodeId);
  } else {
    await archiveBoqNode(context.db, context.organizationId, nodeId);
  }
  await recordAuditEvent(context, {
    action: BOQ_AUDIT_ACTIONS.BOQ_NODE_ARCHIVED,
    entityType: 'boq_node',
    entityId: nodeId,
  });
}

export async function getProjectBoqWorkspace(
  context: OrgContext,
  projectId: string,
  contractId?: string | null,
) {
  assertPermission(context, PERMISSIONS.BOQ_READ);
  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const liveContracts = await listContractsByProject(
    context.db,
    context.organizationId,
    projectId,
  );
  const primary = liveContracts.find((row) => row.isPrimary) ?? null;
  const selectedContractId =
    contractId ??
    (liveContracts.length > 1 ? (primary?.id ?? liveContracts[0]?.id ?? null) : null);

  const versions = await listBoqsForProject(context.db, context.organizationId, projectId);
  const scopedVersions =
    liveContracts.length > 1 && selectedContractId
      ? versions.filter(
          (row) =>
            row.contractId === selectedContractId ||
            (row.contractId == null && selectedContractId === primary?.id),
        )
      : versions;
  const active =
    scopedVersions.find((row) => row.status === 'active') ?? scopedVersions[0] ?? null;
  const nodes = active ? await listBoqNodes(context.db, context.organizationId, active.id) : [];
  const originalTotal = active
    ? await sumItemAmounts(context.db, context.organizationId, active.id, 'original')
    : '0';
  const currentTotal = active
    ? await sumItemAmounts(context.db, context.organizationId, active.id, 'current')
    : '0';

  const allocations = active
    ? await listChangeAllocationsForBoq(context.db, context.organizationId, active.id)
    : [];
  const allocatedApprovedAmount = allocations
    .reduce((sum, row) => sum.plus(row.amountDelta || '0'), new Decimal(0))
    .toFixed();

  const showMoney =
    hasPermission(context, PERMISSIONS.BOQ_MANAGE) ||
    hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
    hasPermission(context, PERMISSIONS.CONTRACTS_READ) ||
    hasPermission(context, PERMISSIONS.BOQ_BILLING_CREATE);

  const safeNodes = showMoney ? nodes : nodes.map(maskBoqNodeMoney);

  return {
    project,
    versions,
    activeBoq: active,
    nodes: safeNodes,
    allocations: showMoney ? allocations : [],
    totals: {
      originalAmount: showMoney ? originalTotal : '0',
      currentAmount: showMoney ? currentTotal : '0',
      allocatedApprovedAmount: showMoney ? allocatedApprovedAmount : '0',
      currency: active?.currency ?? project.currency ?? context.organization.baseCurrency,
    },
    showMoney,
    contracts: liveContracts.map((row) => ({
      id: row.id,
      name: row.name,
      contractNumber: row.contractNumber,
      isPrimary: row.isPrimary,
      contractType: row.contractType,
    })),
    selectedContractId,
  };
}

export async function listProjectChangeOrdersForBoqPanel(context: OrgContext, projectId: string) {
  assertPermission(context, PERMISSIONS.CHANGES_READ);
  return listProjectChangeOrdersForBoq(context.db, context.organizationId, projectId);
}
