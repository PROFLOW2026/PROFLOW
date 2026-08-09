import { nowUtc } from '@/shared/dates';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { NotFoundError } from '@/shared/errors';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findProjectById } from '../data/project-refs.repository';
import { sumProjectLaborCost } from '../data/time-entries.repository';

/**
 * Workforce labor cost for a project, consumed by the financial engine (doc 04 §10).
 *
 * Sums snapshotted `cost_amount` values on project time entries only. Entries
 * logged before a rate existed contribute to `entriesMissingCost`, not to zero.
 */
export interface ProjectLaborCostSummary {
  readonly projectId: string;
  readonly currency: string;
  readonly laborCost: MoneyValue;
  /** True when at least one non-archived project time entry exists. */
  readonly hasWorkforceData: boolean;
  readonly entryCount: number;
  /** Entries where no rate applied at log time — cost is unknown, not zero. */
  readonly entriesMissingCost: number;
  readonly excludedForeignCurrencyEntries: number;
  readonly calculatedAt: Date;
}

export async function getProjectLaborCost(
  context: OrgContext,
  projectId: string,
): Promise<ProjectLaborCostSummary> {
  assertAnyPermission(context, [PERMISSIONS.PROJECT_FINANCIALS_READ, PERMISSIONS.WORKFORCE_READ]);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
  const aggregate = await sumProjectLaborCost(
    context.db,
    context.organizationId,
    projectId,
    currency,
  );

  const laborCost =
    aggregate.totalAmount !== null && aggregate.currency
      ? (fromNumericString(aggregate.totalAmount, aggregate.currency) ?? zeroMoney(currency))
      : zeroMoney(currency);

  return {
    projectId,
    currency,
    laborCost,
    hasWorkforceData: aggregate.entryCount > 0,
    entryCount: aggregate.entryCount,
    entriesMissingCost: aggregate.entriesMissingCost,
    excludedForeignCurrencyEntries: aggregate.excludedForeignCurrencyEntries,
    calculatedAt: nowUtc(),
  };
}
