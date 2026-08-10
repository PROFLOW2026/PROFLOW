import { nowUtc } from '@/shared/dates';
import { fromNumericString, zeroMoney, type MoneyValue } from '@/shared/money';
import { NotFoundError } from '@/shared/errors';
import { assertAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { sumMonthlyAllocatedLaborForProject } from '../data/labor-displacement.repository';
import { findProjectById } from '../data/project-refs.repository';
import { sumProjectLaborCost } from '../data/time-entries.repository';
import {
  hasWorkforceLaborData,
  mergeResidualTimeAndMonthlyAllocatedLabor,
} from '../domain/labor-recognition';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';

/**
 * Workforce labor cost for a project, consumed by the financial engine (doc 04 §10).
 *
 * Residual (non-displaced) time True Cost + monthly allocation lines when
 * employee-month Displacement is active. Assignment never creates Actual.
 */
export interface ProjectLaborCostSummary {
  readonly projectId: string;
  readonly currency: string;
  readonly laborCost: MoneyValue;
  /** True when residual project time entries exist or monthly allocated labor > 0. */
  readonly hasWorkforceData: boolean;
  readonly entryCount: number;
  /** Residual entries where no rate applied at log time — cost is unknown, not zero. */
  readonly entriesMissingCost: number;
  readonly excludedForeignCurrencyEntries: number;
  readonly calculatedAt: Date;
}

export async function getProjectLaborCost(
  context: OrgContext,
  projectId: string,
): Promise<ProjectLaborCostSummary> {
  // Project labor totals are employer cost — workforce.read alone is insufficient.
  assertAnyPermission(context, [
    PERMISSIONS.PROJECT_FINANCIALS_READ,
    PERMISSIONS.WORKFORCE_COST_READ,
  ]);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const currency = (project.currency ?? context.organization.baseCurrency).toUpperCase();
  const monthCostsReady = areEmployeeMonthCostsAvailable();

  const [aggregate, monthlyAgg] = await Promise.all([
    sumProjectLaborCost(context.db, context.organizationId, projectId, currency),
    monthCostsReady
      ? sumMonthlyAllocatedLaborForProject(
          context.db,
          context.organizationId,
          projectId,
          currency,
        )
      : Promise.resolve({
          projectId,
          totalAmount: '0',
          currency,
        }),
  ]);

  const residualTimeLabor =
    fromNumericString(aggregate.totalAmount ?? '0', currency) ?? zeroMoney(currency);
  const monthlyAllocatedLabor =
    fromNumericString(monthlyAgg.totalAmount, currency) ?? zeroMoney(currency);
  const laborCost = mergeResidualTimeAndMonthlyAllocatedLabor({
    residualTimeLabor,
    monthlyAllocatedLabor,
  });

  return {
    projectId,
    currency,
    laborCost,
    hasWorkforceData: hasWorkforceLaborData({
      residualEntryCount: aggregate.entryCount,
      monthlyAllocatedLabor,
    }),
    entryCount: aggregate.entryCount,
    entriesMissingCost: aggregate.entriesMissingCost,
    excludedForeignCurrencyEntries: aggregate.excludedForeignCurrencyEntries,
    calculatedAt: nowUtc(),
  };
}
