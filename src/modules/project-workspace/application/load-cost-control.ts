import 'server-only';

import { getActiveBudgetForProject } from '@/modules/budgets';
import { listBudgetLinesForRevision } from '@/modules/budgets/data/budgets.repository';
import { loadBudgetAmountsByCostCodeForProject } from '@/modules/budgets/data/cost-code-attribution.repository';
import { PROJECT_CAPABILITIES as C, loadProjectCapabilities } from '@/modules/project-team';
import { loadAgreementValuePosition } from '@/modules/subcontracts';
import {
  listProjectAgreementsOperational,
  listProjectWorkPackageOptions,
} from '@/modules/subcontracts/data/agreements.repository';
import { listProjectClaims } from '@/modules/subcontract-claims';
import { loadPaymentFacts } from '@/modules/subcontract-claims/data/contract-basis.repository';
import { loadAgreementContext } from '@/modules/subcontract-claims/application/claim-engine';
import { loadAgreementPaymentStatus } from '@/modules/subcontract-claims/application/payables';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  attachTradeBudgets,
  buildCostControlAgreementRow,
  labelTradeRollupWorkPackages,
  rollupCostControlByTrade,
  sumApNetFromBills,
  sumSubmittedClaimsByAgreement,
  type CostControlAgreementRow,
  type CostControlBudgetLine,
  type CostControlTradeRollup,
  type TradeBudgetSource,
} from '../domain/cost-control-rows';

export interface ProjectCostControlView {
  readonly rows: readonly CostControlAgreementRow[];
  readonly tradeRollups: readonly CostControlTradeRollup[];
  readonly canViewContractValue: boolean;
  readonly canViewClaims: boolean;
  readonly canViewPayments: boolean;
  readonly canViewBudget: boolean;
}

export async function loadProjectCostControl(context: OrgContext, projectId: string): Promise<ProjectCostControlView> {
  const held = await loadProjectCapabilities(context, projectId);
  const canViewContractValue = held.has(C.CONTRACT_FINANCIAL_VIEW);
  const canViewClaims = held.has(C.CLAIM_VIEW);
  const canViewPayments = held.has(C.PAYMENT_VIEW);

  const agreements = await listProjectAgreementsOperational(context.db, context.organizationId, projectId);

  const claims =
    canViewClaims && agreements.length > 0
      ? await listProjectClaims(context, projectId).catch(() => [])
      : [];
  const submittedByAgreement = sumSubmittedClaimsByAgreement(
    claims.map((claim) => ({
      agreementId: claim.agreementId,
      currency: claim.currency,
      status: claim.status,
      currentSubmitted: claim.currentSubmitted,
    })),
  );

  const rows: CostControlAgreementRow[] = [];
  for (const agreement of agreements) {
    const contractValue = canViewContractValue
      ? await loadAgreementValuePosition(context.db, context.organizationId, agreement.id)
      : null;

    let paymentTotals: {
      readonly certified: string;
      readonly paid: string;
      readonly retentionHeld: string;
      readonly currency: string;
    } | null = null;
    let apNet: { readonly amount: string; readonly currency: string } | null = null;

    if (canViewPayments) {
      try {
        const agreementCtx = await loadAgreementContext(context.db, context.organizationId, agreement.id);
        const status = await loadAgreementPaymentStatus(context.db, {
          organizationId: context.organizationId,
          agreementId: agreement.id,
          agreement: agreementCtx,
          contractorView: false,
        });
        paymentTotals = {
          certified: status.totals.certified,
          paid: status.totals.paid,
          retentionHeld: status.retention.held,
          currency: status.currency,
        };
        const facts = await loadPaymentFacts(context.db, context.organizationId, agreement.id);
        apNet = sumApNetFromBills(facts);
      } catch {
        paymentTotals = null;
        apNet = null;
      }
    }

    rows.push(
      buildCostControlAgreementRow({
        agreementId: agreement.id,
        vendorName: agreement.vendorName,
        title: agreement.title,
        trade: agreement.trade,
        workPackageId: agreement.workPackageId,
        status: agreement.status,
        contractValue: contractValue
          ? {
              original: contractValue.original.amount,
              approvedChanges: contractValue.approvedChanges.amount,
              current: contractValue.current.amount,
              currency: contractValue.currency,
            }
          : null,
        submittedClaims: submittedByAgreement.get(agreement.id) ?? null,
        paymentTotals,
        apNet,
      }),
    );
  }

  const canViewBudget = hasPermission(context, PERMISSIONS.BUDGETS_READ);
  const [budgetSource, workPackages] = await Promise.all([
    canViewBudget ? loadTradeBudgetSource(context, projectId) : Promise.resolve(emptyBudgetSource(false)),
    listProjectWorkPackageOptions(context.db, context.organizationId, projectId).catch(() => []),
  ]);

  const tradeRollups = labelTradeRollupWorkPackages(
    attachTradeBudgets(rollupCostControlByTrade(rows), budgetSource),
    workPackages,
  );

  return {
    rows,
    tradeRollups,
    canViewContractValue,
    canViewClaims,
    canViewPayments,
    canViewBudget: budgetSource.canReadBudget,
  };
}

function emptyBudgetSource(canReadBudget: boolean): TradeBudgetSource {
  return {
    canReadBudget,
    currency: null,
    originalLines: [],
    approvedLines: [],
    approvedCostCodeAmounts: [],
  };
}

function toBudgetLine(
  line: {
    readonly revisionNumber: number;
    readonly lineType: string;
    readonly workPackageId: string | null;
    readonly disciplineKey: string | null;
    readonly costCodeId: string | null;
    readonly budgetAmount: string;
  },
  currency: string,
): CostControlBudgetLine {
  return {
    revisionNumber: line.revisionNumber,
    lineType: line.lineType,
    workPackageId: line.workPackageId,
    disciplineKey: line.disciplineKey,
    costCodeId: line.costCodeId,
    amount: line.budgetAmount,
    currency,
  };
}

/**
 * Original budget is revision 1. Approved budget is the current revision.
 * Cost-code amounts come from the existing budget query; line identity (trade / work package)
 * comes from the same budget's lines. A missing permission or a failed read stays unavailable.
 */
async function loadTradeBudgetSource(context: OrgContext, projectId: string): Promise<TradeBudgetSource> {
  try {
    const budget = await getActiveBudgetForProject(context, projectId);
    if (!budget) return emptyBudgetSource(true);

    const [approvedCostCodeAmounts, currentLines, originalRows] = await Promise.all([
      loadBudgetAmountsByCostCodeForProject(context.db, context.organizationId, projectId),
      listBudgetLinesForRevision(
        context.db,
        context.organizationId,
        budget.id,
        budget.currentRevisionNumber,
      ),
      budget.currentRevisionNumber === 1
        ? Promise.resolve(null)
        : listBudgetLinesForRevision(context.db, context.organizationId, budget.id, 1),
    ]);

    return {
      canReadBudget: true,
      currency: budget.currency,
      originalLines: (originalRows ?? currentLines).map((line) => toBudgetLine(line, budget.currency)),
      approvedLines: currentLines.map((line) => toBudgetLine(line, budget.currency)),
      approvedCostCodeAmounts,
    };
  } catch {
    return emptyBudgetSource(false);
  }
}
