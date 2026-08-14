import Decimal from 'decimal.js';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { hasPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getProjectFinancials } from '@/modules/financials/application/get-project-financials';
import type { MoneyValue } from '@/shared/money';
import { money, subtractMoney } from '@/shared/money';
import { percentComplete, quantityString, sumDecimalStrings } from '../domain/amounts';
import { reconcileContractBoq } from '../domain/reconciliation';
import {
  cumulativeApprovedForNode,
  findActiveBoqForProject,
  findProjectInOrganization,
  listBoqNodes,
  sumItemAmounts,
} from '../data/boq.repository';

/**
 * Contextual BOQ ↔ financials comparison helper.
 *
 * CRITICAL INVARIANT (LEAD CONTRACT):
 * - BOQ Progress (measured/approved qty) NEVER invents Actual cost.
 * - This helper READS existing financials Actual / Forecast via getProjectFinancials.
 * - Physical progress % is shown beside Actual/Forecast for context only.
 * - Billing ≠ Payment; progress billing uses billing_records; Actual stays expenses/AP/labor.
 */
export interface BoqFinancialComparison {
  readonly projectId: string;
  readonly boqId: string | null;
  readonly currency: string;
  /** Physical progress from approved BOQ quantities — NOT Actual. */
  readonly physicalProgressPercent: string | null;
  readonly currentBoqAmount: MoneyValue | null;
  /** From financials engine — never derived from BOQ progress. */
  readonly actualCostToDate: MoneyValue | null;
  /** Forecast Final Cost from financials — never invented from BOQ. */
  readonly estimatedFinalCost: MoneyValue | null;
  readonly currentContractValue: MoneyValue | null;
  readonly reconciliationStatus: string | null;
  readonly note: 'progress_is_not_actual';
}

export async function getBoqFinancialComparison(
  context: OrgContext,
  projectId: string,
): Promise<BoqFinancialComparison> {
  assertPermission(context, PERMISSIONS.BOQ_READ);

  const project = await findProjectInOrganization(context.db, context.organizationId, projectId);
  if (!project) throw new NotFoundError('Project');

  const boq = await findActiveBoqForProject(context.db, context.organizationId, projectId);
  const currency = boq?.currency ?? project.currency ?? context.organization.baseCurrency;

  let physicalProgressPercent: string | null = null;
  let currentBoqAmount: MoneyValue | null = null;
  let reconciliationStatus: string | null = null;

  if (boq) {
    const currentTotal = await sumItemAmounts(context.db, context.organizationId, boq.id, 'current');
    currentBoqAmount = money(currentTotal, currency);

    const nodes = await listBoqNodes(context.db, context.organizationId, boq.id);
    const items = nodes.filter((n) => n.nodeKind === 'item');
    const approvedParts: string[] = [];
    const currentParts: string[] = [];
    for (const item of items) {
      const approved = await cumulativeApprovedForNode(context.db, context.organizationId, item.id);
      approvedParts.push(quantityString(approved));
      currentParts.push(quantityString(item.currentQuantity));
    }
    // Aggregate % for display only — still not Actual.
    if (items.length > 0) {
      physicalProgressPercent = percentComplete({
        cumulativeApproved: sumDecimalStrings(approvedParts),
        currentQuantity: sumDecimalStrings(currentParts),
      });
    }
  }

  let actualCostToDate: MoneyValue | null = null;
  let estimatedFinalCost: MoneyValue | null = null;
  let currentContractValue: MoneyValue | null = null;

  // READ-ONLY financials engine. Never fabricate Actual from BOQ progress.
  if (hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ)) {
    try {
      const financials = await getProjectFinancials(context, projectId);
      actualCostToDate = financials.cost.actualCostToDate;
      estimatedFinalCost = financials.cost.estimatedFinalCost;
      const commercial = financials.commercial;
      if (!commercial) {
        // Open-price / missing commercial — still show cost metrics only.
      } else {
        currentContractValue = commercial.currentContractValue;

        if (boq && currentBoqAmount && currentContractValue) {
          const originalBoq = money(
            await sumItemAmounts(context.db, context.organizationId, boq.id, 'original'),
            currency,
          );
          const boqGrowth = subtractMoney(currentBoqAmount, originalBoq);
          const allocatedApprox = money(
            new Decimal(boqGrowth.amount).isNegative() ? '0' : boqGrowth.amount,
            currency,
          );
          const recon = reconcileContractBoq({
            originalContract: commercial.originalContractValue,
            originalBoq,
            currentContract: currentContractValue,
            currentBoq: currentBoqAmount,
            approvedChanges: commercial.approvedAdditions,
            // Contextual strip approximation; allocate-change owns the precise ledger.
            allocatedApprovedChanges: allocatedApprox,
          });
          reconciliationStatus = recon.status;
        }
      }
    } catch {
      // Missing financials permission edge or empty project — leave nulls.
    }
  }

  return {
    projectId,
    boqId: boq?.id ?? null,
    currency,
    physicalProgressPercent,
    currentBoqAmount,
    actualCostToDate,
    estimatedFinalCost,
    currentContractValue,
    reconciliationStatus,
    note: 'progress_is_not_actual',
  };
}
