import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone, toIsoInstant } from '@/shared/dates';
import { DomainRuleError, ValidationError } from '@/shared/errors';
import { money } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertInclusiveTaxRateAvailable,
  buildContractTaxSnapshot,
  resolveApplicableDefaultTax,
  type ContractTaxSnapshot,
  type TaxAmountBreakdown,
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
  computeEntryBaselineAmounts,
  isZeroOpeningReductionAmount,
  normalizeOpeningReductionInput,
} from '../domain/entry-baseline';
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
  /** Real-world / display original amount the user typed (same tax mode as reduction). */
  readonly enteredAmount: string;
  readonly currency: string;
  readonly amountIncludesTax: boolean;
  /**
   * Optional amount already economically behind before ProjectFlow management.
   * Not a payment, bill, or expense. Empty / 0 ⇒ today's behavior.
   */
  readonly openingReductionAmount?: string | null;
}

export interface UpsertContractAmountResult {
  readonly contract: ContractRecord;
  readonly snapshot: ContractTaxSnapshot;
  readonly netAmount: string;
}

function baselineFieldError(message: string): ValidationError {
  const path = message.toLowerCase().includes('reduction')
    ? 'openingReductionAmount'
    : 'contractValueAmount';
  return new ValidationError([{ path, message }]);
}

/**
 * Creates or corrects the primary contract managed opening using the org's
 * applicable tax rule.
 *
 * DISPLAY_ORIGINAL_NET − OPENING_REDUCTION_NET = MANAGED_OPENING_NET
 * Managed opening is stored in contracts.original_* + value event kind=original.
 * Display / reduction columns are context + audit only.
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
    throw baselineFieldError(
      error instanceof Error ? error.message : 'Invalid contract amount',
    );
  }

  // Tax snapshot describes the managed opening (profitability / CCV basis).
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

  const netAmount = baseline.managedNet;
  const taxAmount = baseline.managedTax;
  const grossAmount = baseline.managedGross;
  const enteredAmount = baseline.managedEntered;

  const storeDisplay = baseline.hasOpeningReduction;
  const displayOriginalEnteredAmount = storeDisplay ? baseline.displayEntered : null;
  const displayOriginalNetAmount = storeDisplay ? baseline.displayNet : null;
  const displayOriginalTaxAmount = storeDisplay ? baseline.displayTax : null;
  const displayOriginalGrossAmount = storeDisplay ? baseline.displayGross : null;
  const openingReductionEnteredAmount = storeDisplay ? baseline.reductionEntered : null;
  const openingReductionNetAmount = storeDisplay ? baseline.reductionNet : null;
  const openingReductionTaxAmount = storeDisplay ? baseline.reductionTax : null;
  const openingReductionGrossAmount = storeDisplay ? baseline.reductionGross : null;

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
      displayOriginalEnteredAmount,
      displayOriginalNetAmount,
      displayOriginalTaxAmount,
      displayOriginalGrossAmount,
      openingReductionEnteredAmount,
      openingReductionNetAmount,
      openingReductionTaxAmount,
      openingReductionGrossAmount,
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
        displayOriginalEnteredAmount,
        displayOriginalNetAmount,
        openingReductionEnteredAmount,
        openingReductionNetAmount,
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
    displayOriginalEnteredAmount: existing.displayOriginalEnteredAmount,
    displayOriginalNetAmount: existing.displayOriginalNetAmount,
    openingReductionEnteredAmount: existing.openingReductionEnteredAmount,
    openingReductionNetAmount: existing.openingReductionNetAmount,
    taxSnapshot: existing.taxSnapshot,
    currency: existing.currency,
  };

  const updated = await updateContractAmounts(context.db, context.organizationId, existing.id, {
    enteredValueAmount: enteredAmount,
    amountIncludesTax: input.amountIncludesTax,
    originalValueAmount: netAmount,
    originalTaxAmount: taxAmount,
    originalGrossAmount: grossAmount,
    displayOriginalEnteredAmount,
    displayOriginalNetAmount,
    displayOriginalTaxAmount,
    displayOriginalGrossAmount,
    openingReductionEnteredAmount,
    openingReductionNetAmount,
    openingReductionTaxAmount,
    openingReductionGrossAmount,
    taxSnapshot: snapshot,
    currency,
  });

  if (!updated) {
    throw new ValidationError([{ path: 'projectId', message: 'Contract not found' }]);
  }

  if (originalEvent) {
    // Correcting the managed opening: update the original event in place (audited).
    // Change-order events remain untouched.
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
      displayOriginalEnteredAmount,
      displayOriginalNetAmount,
      openingReductionEnteredAmount,
      openingReductionNetAmount,
      currency,
      taxSnapshot: snapshot,
    },
  });

  return { contract: updated, snapshot, netAmount };
}

/** Exported for update-project change detection. */
export function openingReductionInputsDiffer(
  existingEntered: string | null | undefined,
  nextRaw: string | null | undefined,
  currency: string,
): boolean {
  const existingZero = isZeroOpeningReductionAmount(existingEntered, currency);
  const nextZero = isZeroOpeningReductionAmount(nextRaw, currency);
  if (existingZero && nextZero) return false;
  if (existingZero !== nextZero) return true;
  try {
    return (
      money(normalizeOpeningReductionInput(existingEntered) ?? '0', currency).amount !==
      money(normalizeOpeningReductionInput(nextRaw) ?? '0', currency).amount
    );
  } catch {
    return true;
  }
}
