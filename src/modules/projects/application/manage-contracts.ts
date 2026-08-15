import { clients } from '@drizzle/schema';
import { and, eq } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, toIsoInstant } from '@/shared/dates';
import { withTransaction } from '@/shared/db';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertInclusiveTaxRateAvailable,
  buildContractTaxSnapshot,
  resolveApplicableDefaultTax,
  type ContractTaxSnapshot,
  type TaxAmountBreakdown,
} from '@/modules/tax';
import {
  clearProjectPrimary,
  findContractById,
  findContractByNumber,
  findPrimaryContractByProject,
  insertContract,
  insertContractValueEvent,
  listContractsByProject,
  listContractValueEvents,
  listContractValueEventsForContracts,
  markContractPrimary,
  updateContractAmounts,
  updateContractMetadata,
  updateContractValueEventAmount,
} from '../data/contracts.repository';
import { findProjectById } from '../data/projects.repository';
import { assertCanAccessProject } from './project-access';
import {
  computeEntryBaselineAmounts,
  normalizeOpeningReductionInput,
} from '../domain/entry-baseline';
import {
  computeCurrentContractValue,
  findOriginalValueEvent,
  isOriginalContractAmountLocked,
} from '../domain/contract-value';
import { CONTRACT_VALUE_REASON_ORIGINAL } from '../domain/contract-value-reason';
import { canTransitionContractStatus } from '../domain/contract-lifecycle';
import type { ContractRecord, ContractType } from '../domain/types';
import { ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY } from './contract-amount';
import {
  createAdditionalContractSchema,
  listProjectContractsSchema,
  setPrimaryContractSchema,
  updateContractSchema,
  type CreateAdditionalContractInput,
  type UpdateContractInput,
} from '../validation/schemas';

export interface ProjectContractListItem {
  readonly contract: ContractRecord;
  readonly originalValueAmount: string | null;
  readonly currentValueAmount: string | null;
  readonly currency: string;
}

function validationFromZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): ValidationError {
  return new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

async function assertProjectOwned(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');
  await assertCanAccessProject(context, projectId);
  return project;
}

async function assertClientInOrg(context: OrgContext, clientId: string | null | undefined) {
  if (!clientId) return;
  const [client] = await context.db
    .select({ id: clients.id, organizationId: clients.organizationId })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
    .limit(1);
  if (!client) throw new NotFoundError('Client');
}

async function applyOpeningToContract(
  context: OrgContext,
  contract: ContractRecord,
  input: {
    enteredAmount: string;
    currency: string;
    amountIncludesTax: boolean;
    openingReductionAmount?: string | null;
  },
): Promise<{ contract: ContractRecord; snapshot: ContractTaxSnapshot; netAmount: string }> {
  const currency = input.currency.toUpperCase();
  const effectiveDate = todayInTimeZone(context.organization.timezone);
  const resolution = await resolveApplicableDefaultTax(context, effectiveDate);

  try {
    assertInclusiveTaxRateAvailable(input.amountIncludesTax, resolution.resolved);
  } catch {
    throw new ValidationError([
      {
        path: 'amountIncludesTax',
        message: 'An applicable percentage tax rule is required when the amount includes tax',
      },
    ]);
  }

  const reductionNormalized = normalizeOpeningReductionInput(input.openingReductionAmount);
  if (reductionNormalized !== null) {
    try {
      money(reductionNormalized, currency);
    } catch (error) {
      throw new ValidationError([
        {
          path: 'openingReductionAmount',
          message: error instanceof Error ? error.message : 'Invalid opening reduction amount',
        },
      ]);
    }
  }

  let baseline;
  try {
    baseline = computeEntryBaselineAmounts({
      displayEnteredAmount: input.enteredAmount,
      openingReductionAmount: reductionNormalized,
      currency,
      amountIncludesTax: input.amountIncludesTax,
      resolved: resolution.resolved,
    });
  } catch (error) {
    throw new ValidationError([
      {
        path: 'enteredAmount',
        message: error instanceof Error ? error.message : 'Invalid contract amount',
      },
    ]);
  }

  const managedBreakdown: TaxAmountBreakdown = {
    entered: money(baseline.managedEntered, currency),
    amountIncludesTax: input.amountIncludesTax,
    net: money(baseline.managedNet, currency),
    tax: money(baseline.managedTax, currency),
    gross: money(baseline.managedGross, currency),
    ratePercent: resolution.resolved?.ratePercent ?? null,
    method: resolution.resolved?.method ?? null,
  };
  const snapshot = buildContractTaxSnapshot(
    managedBreakdown,
    resolution.resolved,
    toIsoInstant(new Date()),
  );

  const events = await listContractValueEvents(context.db, context.organizationId, contract.id);
  if (isOriginalContractAmountLocked(events)) {
    throw new ValidationError([
      {
        path: 'enteredAmount',
        message: ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY,
      },
    ]);
  }

  const updated = await updateContractAmounts(context.db, context.organizationId, contract.id, {
    enteredValueAmount: baseline.managedEntered,
    amountIncludesTax: input.amountIncludesTax,
    originalValueAmount: baseline.managedNet,
    originalTaxAmount: baseline.managedTax,
    originalGrossAmount: baseline.managedGross,
    displayOriginalEnteredAmount: baseline.hasOpeningReduction ? baseline.displayEntered : null,
    displayOriginalNetAmount: baseline.hasOpeningReduction ? baseline.displayNet : null,
    displayOriginalTaxAmount: baseline.hasOpeningReduction ? baseline.displayTax : null,
    displayOriginalGrossAmount: baseline.hasOpeningReduction ? baseline.displayGross : null,
    openingReductionEnteredAmount: baseline.hasOpeningReduction ? baseline.reductionEntered : null,
    openingReductionNetAmount: baseline.hasOpeningReduction ? baseline.reductionNet : null,
    openingReductionTaxAmount: baseline.hasOpeningReduction ? baseline.reductionTax : null,
    openingReductionGrossAmount: baseline.hasOpeningReduction ? baseline.reductionGross : null,
    taxSnapshot: snapshot,
    currency,
  });
  if (!updated) throw new NotFoundError('Contract');

  const originalEvent = findOriginalValueEvent(events);
  if (originalEvent) {
    await updateContractValueEventAmount(context.db, context.organizationId, originalEvent.id, {
      amount: baseline.managedNet,
      reason: CONTRACT_VALUE_REASON_ORIGINAL,
    });
  } else {
    await insertContractValueEvent(context.db, {
      organizationId: context.organizationId,
      contractId: contract.id,
      projectId: contract.projectId,
      kind: 'original',
      amount: baseline.managedNet,
      currency,
      effectiveDate,
      reason: CONTRACT_VALUE_REASON_ORIGINAL,
      actorUserId: context.userId,
    });
  }

  return { contract: updated, snapshot, netAmount: baseline.managedNet };
}

export async function listProjectContracts(
  context: OrgContext,
  raw: { projectId: string },
): Promise<ProjectContractListItem[]> {
  assertPermission(context, PERMISSIONS.CONTRACTS_READ);
  const parsed = listProjectContractsSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  const project = await assertProjectOwned(context, parsed.data.projectId);
  const contracts = await listContractsByProject(
    context.db,
    context.organizationId,
    parsed.data.projectId,
  );
  if (contracts.length === 0) return [];

  const allEvents = await listContractValueEventsForContracts(
    context.db,
    context.organizationId,
    contracts.map((contract) => contract.id),
  );
  const eventsByContract = new Map<string, typeof allEvents>();
  for (const event of allEvents) {
    const list = eventsByContract.get(event.contractId) ?? [];
    list.push(event);
    eventsByContract.set(event.contractId, list);
  }

  return contracts.map((contract) => {
    const contractEvents = eventsByContract.get(contract.id) ?? [];
    const current = computeCurrentContractValue(
      contractEvents,
      contract.currency || project.currency || context.organization.baseCurrency,
    );
    return {
      contract,
      originalValueAmount: contract.originalValueAmount,
      currentValueAmount: contractEvents.length > 0 ? current.amount : contract.originalValueAmount,
      currency: contract.currency,
    };
  });
}

export async function createAdditionalContract(
  context: OrgContext,
  raw: CreateAdditionalContractInput,
): Promise<ContractRecord> {
  assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);
  const parsed = createAdditionalContractSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const project = await assertProjectOwned(context, input.projectId);
  await assertClientInOrg(context, input.clientId);

  if (input.contractNumber) {
    const existing = await findContractByNumber(
      context.db,
      context.organizationId,
      input.contractNumber,
    );
    if (existing) {
      if (existing.projectId === input.projectId) return existing;
      throw new ConflictError('A contract with this number already exists');
    }
  }

  const currency = (input.currency ?? project.currency ?? context.organization.baseCurrency).toUpperCase();
  const contractType: ContractType = input.contractType ?? 'additional';

  const created = await insertContract(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    isPrimary: false,
    contractType,
    contractNumber: input.contractNumber ?? null,
    clientId: input.clientId ?? null,
    startDate: input.startDate ?? null,
    endDate: input.endDate ?? null,
    retentionPercent: input.retentionPercent ?? null,
    name: input.name ?? null,
    reference: input.reference ?? null,
    status: input.status ?? 'active',
    currency,
    notes: input.notes ?? null,
  });

  let result = created;
  if (input.enteredAmount?.trim()) {
    const applied = await applyOpeningToContract(context, created, {
      enteredAmount: input.enteredAmount,
      currency,
      amountIncludesTax: input.amountIncludesTax ?? false,
      openingReductionAmount: input.openingReductionAmount,
    });
    result = applied.contract;
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACT_ADDITIONAL_CREATED,
    entityType: 'contract',
    entityId: result.id,
    after: {
      projectId: input.projectId,
      isPrimary: false,
      contractType,
      contractNumber: result.contractNumber,
      originalValueAmount: result.originalValueAmount,
      currency,
    },
  });

  return result;
}

export async function updateContract(
  context: OrgContext,
  raw: UpdateContractInput,
): Promise<ContractRecord> {
  assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);
  const parsed = updateContractSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);
  const input = parsed.data;

  const existing = await findContractById(context.db, context.organizationId, input.contractId);
  if (!existing) throw new NotFoundError('Contract');
  assertSameOrganization(context, existing, 'Contract');
  await assertProjectOwned(context, existing.projectId);
  await assertClientInOrg(context, input.clientId);

  if (input.contractNumber) {
    const numbered = await findContractByNumber(
      context.db,
      context.organizationId,
      input.contractNumber,
    );
    if (numbered && numbered.id !== existing.id) {
      throw new ConflictError('A contract with this number already exists');
    }
  }

  if (input.status && !canTransitionContractStatus(existing.status, input.status)) {
    throw new DomainRuleError(
      `Cannot transition contract from ${existing.status} to ${input.status}`,
      'projects.contracts.errors.invalidStatus',
    );
  }

  if (input.isPrimary === true && !existing.isPrimary) {
    await setProjectPrimaryContract(context, {
      projectId: existing.projectId,
      contractId: existing.id,
    });
  } else if (input.isPrimary === false && existing.isPrimary) {
    await setProjectPrimaryContract(context, {
      projectId: existing.projectId,
      contractId: null,
    });
  }

  const contractType = existing.isPrimary ? undefined : input.contractType;

  const updated = await updateContractMetadata(context.db, context.organizationId, existing.id, {
    name: input.name,
    reference: input.reference,
    contractType,
    contractNumber: input.contractNumber,
    clientId: input.clientId,
    startDate: input.startDate,
    endDate: input.endDate,
    retentionPercent: input.retentionPercent,
    status: input.status,
    notes: input.notes,
  });
  if (!updated) throw new NotFoundError('Contract');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CONTRACT_UPDATED,
    entityType: 'contract',
    entityId: updated.id,
    after: {
      name: updated.name,
      contractType: updated.contractType,
      isPrimary: updated.isPrimary,
      contractNumber: updated.contractNumber,
    },
  });

  return updated;
}

export async function setProjectPrimaryContract(
  context: OrgContext,
  raw: { projectId: string; contractId: string | null },
): Promise<ContractRecord | null> {
  assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);
  const parsed = setPrimaryContractSchema.safeParse(raw);
  if (!parsed.success) throw validationFromZod(parsed.error);

  await assertProjectOwned(context, parsed.data.projectId);

  return withTransaction(context.db, async (tx) => {
    if (parsed.data.contractId) {
      const target = await findContractById(tx, context.organizationId, parsed.data.contractId);
      if (!target || target.projectId !== parsed.data.projectId) {
        throw new NotFoundError('Contract');
      }
      assertSameOrganization(context, target, 'Contract');
    }

    await clearProjectPrimary(tx, context.organizationId, parsed.data.projectId);

    if (!parsed.data.contractId) return null;

    const marked = await markContractPrimary(tx, context.organizationId, parsed.data.contractId);
    if (!marked) throw new NotFoundError('Contract');
    return marked;
  });
}

export async function getPrimaryContractForProject(context: OrgContext, projectId: string) {
  return findPrimaryContractByProject(context.db, context.organizationId, projectId);
}
