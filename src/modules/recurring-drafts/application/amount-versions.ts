import Decimal from 'decimal.js';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import {
  closeAmountVersion,
  findOpenAmountVersion,
  insertAmountVersion,
} from '../data/recurring-drafts.repository';
import { dayBeforeBusinessDate } from '../domain/amount-versions';

function amountsEqual(a: string, b: string): boolean {
  try {
    return new Decimal(a.trim()).eq(new Decimal(b.trim()));
  } catch {
    return a.trim() === b.trim();
  }
}

/**
 * Open the first amount version for a new draft (effective from `validFrom`).
 */
export async function openInitialAmountVersion(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly draftId: string;
    readonly amount: string;
    readonly currency: string;
    readonly validFrom: string;
  },
): Promise<void> {
  await insertAmountVersion(db, {
    organizationId: input.organizationId,
    draftId: input.draftId,
    amount: input.amount,
    currency: input.currency,
    validFrom: input.validFrom,
    validTo: null,
  });
}

/**
 * When template amount/currency changes, close the open version and open a new one.
 * Past months keep the historical amount via closed windows.
 */
export async function rotateAmountVersionIfChanged(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly draftId: string;
    readonly previousAmount: string;
    readonly previousCurrency: string;
    readonly nextAmount: string;
    readonly nextCurrency: string;
    readonly effectiveFrom: string;
  },
): Promise<{ readonly rotated: boolean }> {
  const amountChanged = !amountsEqual(input.previousAmount, input.nextAmount);
  const currencyChanged =
    input.previousCurrency.toUpperCase() !== input.nextCurrency.toUpperCase();
  if (!amountChanged && !currencyChanged) {
    return { rotated: false };
  }

  const open = await findOpenAmountVersion(db, input.organizationId, input.draftId);
  if (open) {
    const closeOn =
      open.validFrom >= input.effectiveFrom
        ? open.validFrom
        : dayBeforeBusinessDate(input.effectiveFrom);
    const validTo = closeOn < open.validFrom ? open.validFrom : closeOn;
    await closeAmountVersion(db, input.organizationId, open.id, validTo);
  }

  await insertAmountVersion(db, {
    organizationId: input.organizationId,
    draftId: input.draftId,
    amount: input.nextAmount,
    currency: input.nextCurrency,
    validFrom: input.effectiveFrom,
    validTo: null,
  });

  return { rotated: true };
}

/** Convenience wrapper that uses OrgContext. */
export async function rotateAmountVersionIfChangedForOrg(
  context: OrgContext,
  input: {
    readonly draftId: string;
    readonly previousAmount: string;
    readonly previousCurrency: string;
    readonly nextAmount: string;
    readonly nextCurrency: string;
    readonly effectiveFrom: string;
  },
): Promise<{ readonly rotated: boolean }> {
  return rotateAmountVersionIfChanged(context.db, {
    organizationId: context.organizationId,
    ...input,
  });
}
