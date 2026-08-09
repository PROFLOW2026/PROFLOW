import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, toIsoInstant } from '@/shared/dates';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertInclusiveTaxRateAvailable,
  buildContractTaxSnapshot,
  computeTaxAmountBreakdown,
  resolveApplicableDefaultTax,
  type ContractTaxSnapshot,
} from '@/modules/tax';
import {
  findPrimaryContractByProject,
  insertContract,
  insertContractValueEvent,
  listContractValueEvents,
  updateContractAmounts,
  updateContractValueEventAmount,
} from '../data/contracts.repository';
import {
  findOriginalValueEvent,
  isOriginalContractAmountLocked,
} from '../domain/contract-value';
import { CONTRACT_VALUE_REASON_ORIGINAL } from '../domain/contract-value-reason';
import type { ContractRecord } from '../domain/types';
import { updateProjectById } from '../data/projects.repository';

export const ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY = 'projects.details.originalAmountLocked';

export interface UpsertContractAmountInput {
  readonly projectId: string;
  readonly enteredAmount: string;
  readonly currency: string;
  readonly amountIncludesTax: boolean;
}

export interface UpsertContractAmountResult {
  readonly contract: ContractRecord;
  readonly snapshot: ContractTaxSnapshot;
  readonly netAmount: string;
}

/**
 * Creates or corrects the primary contract original amount using the org's
 * applicable tax rule. Value events store **net** amounts so profitability
 * never counts VAT as revenue.
 */
export async function upsertPrimaryContractAmount(
  context: OrgContext,
  input: UpsertContractAmountInput,
): Promise<UpsertContractAmountResult> {
  assertPermission(context, PERMISSIONS.CONTRACTS_MANAGE);

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

  let breakdown;
  try {
    breakdown = computeTaxAmountBreakdown({
      enteredAmount: input.enteredAmount,
      currency,
      amountIncludesTax: input.amountIncludesTax,
      resolved: resolution.resolved,
    });
  } catch (error) {
    throw new ValidationError([
      {
        path: 'contractValueAmount',
        message: error instanceof Error ? error.message : 'Invalid contract amount',
      },
    ]);
  }

  const snapshot = buildContractTaxSnapshot(
    breakdown,
    resolution.resolved,
    toIsoInstant(new Date()),
  );
  const netAmount = toNumericString(breakdown.net);
  const taxAmount = toNumericString(breakdown.tax);
  const grossAmount = toNumericString(breakdown.gross);
  const enteredAmount = toNumericString(breakdown.entered);

  const existing = await findPrimaryContractByProject(
    context.db,
    context.organizationId,
    input.projectId,
  );

  if (!existing) {
    const contract = await insertContract(context.db, {
      organizationId: context.organizationId,
      projectId: input.projectId,
      isPrimary: true,
      enteredValueAmount: enteredAmount,
      amountIncludesTax: input.amountIncludesTax,
      originalValueAmount: netAmount,
      originalTaxAmount: taxAmount,
      originalGrossAmount: grossAmount,
      taxSnapshot: snapshot,
      currency,
    });

    await insertContractValueEvent(context.db, {
      organizationId: context.organizationId,
      contractId: contract.id,
      projectId: input.projectId,
      kind: 'original',
      amount: netAmount,
      currency,
      effectiveDate,
      reason: CONTRACT_VALUE_REASON_ORIGINAL,
      actorUserId: context.userId,
    });

    await updateProjectById(context.db, context.organizationId, input.projectId, {
      currency,
    });

    await recordAuditEvent(context, {
      action: 'contract.value_recorded',
      entityType: 'contract',
      entityId: contract.id,
      after: {
        projectId: input.projectId,
        kind: 'original',
        enteredAmount,
        amountIncludesTax: input.amountIncludesTax,
        netAmount,
        taxAmount,
        grossAmount,
        currency,
        taxSnapshot: snapshot,
      },
    });

    return { contract, snapshot, netAmount };
  }

  const events = await listContractValueEvents(context.db, context.organizationId, existing.id);
  if (isOriginalContractAmountLocked(events)) {
    throw new DomainRuleError(
      'Original contract amount cannot be changed after an approved contract-value change',
      ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY,
      { projectId: input.projectId, contractId: existing.id },
    );
  }

  const originalEvent = findOriginalValueEvent(events);
  const before = {
    enteredValueAmount: existing.enteredValueAmount,
    amountIncludesTax: existing.amountIncludesTax,
    originalValueAmount: existing.originalValueAmount,
    originalTaxAmount: existing.originalTaxAmount,
    originalGrossAmount: existing.originalGrossAmount,
    taxSnapshot: existing.taxSnapshot,
    currency: existing.currency,
  };

  const updated = await updateContractAmounts(context.db, context.organizationId, existing.id, {
    enteredValueAmount: enteredAmount,
    amountIncludesTax: input.amountIncludesTax,
    originalValueAmount: netAmount,
    originalTaxAmount: taxAmount,
    originalGrossAmount: grossAmount,
    taxSnapshot: snapshot,
    currency,
  });

  if (!updated) {
    throw new ValidationError([{ path: 'projectId', message: 'Contract not found' }]);
  }

  if (originalEvent) {
    // Correcting the original commercial figure: update the original event in
    // place (audited). Change-order events remain untouched.
    await updateContractValueEventAmount(context.db, context.organizationId, originalEvent.id, {
      amount: netAmount,
      reason: CONTRACT_VALUE_REASON_ORIGINAL,
    });
  } else {
    await insertContractValueEvent(context.db, {
      organizationId: context.organizationId,
      contractId: existing.id,
      projectId: input.projectId,
      kind: 'original',
      amount: netAmount,
      currency,
      effectiveDate,
      reason: CONTRACT_VALUE_REASON_ORIGINAL,
      actorUserId: context.userId,
    });
  }

  await updateProjectById(context.db, context.organizationId, input.projectId, {
    currency,
  });

  await recordAuditEvent(context, {
    action: 'contract.value_recorded',
    entityType: 'contract',
    entityId: existing.id,
    before,
    after: {
      projectId: input.projectId,
      kind: 'original',
      enteredAmount,
      amountIncludesTax: input.amountIncludesTax,
      netAmount,
      taxAmount,
      grossAmount,
      currency,
      taxSnapshot: snapshot,
    },
  });

  return { contract: updated, snapshot, netAmount };
}
