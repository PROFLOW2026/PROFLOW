import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { money, toNumericString } from '@/shared/money';
import {
  findAgreementFinancial,
  listAgreementValueEvents,
  listProjectWorkPackageOptions,
} from '../data/agreements.repository';
import {
  listProjectLocationOptions,
  listWorkLineAdjustments,
  listWorkLinePrices,
  listWorkLinesOperational,
} from '../data/work-lines.repository';
import { availableAgreementActions, isBaselineEditable } from '../domain/lifecycle';
import type {
  AgreementFinancialView,
  AgreementOperationalView,
  SubcontractAccess,
  WorkLineOperationalView,
  WorkLineView,
} from '../domain/types';
import { approvedContractValue, revisedLineValue, sumLineAmounts, type ApprovedContractValue } from '../domain/value';
import { loadAgreementWithAccess } from './access';

/**
 * FINANCIAL read port (Track F / Track S). Uses the caller's RLS-bound executor; callers must have
 * authorized contract.financial.view (internal) or ext.contract.view_value (external) first.
 */
export async function loadAgreementValuePosition(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<(ApprovedContractValue & { readonly currency: string }) | null> {
  const financial = await findAgreementFinancial(db, organizationId, agreementId);
  if (!financial) return null;
  const events = await listAgreementValueEvents(db, organizationId, agreementId);
  return {
    currency: financial.currency,
    ...approvedContractValue({ currency: financial.currency, draftOriginalAmount: financial.originalAmount, events }),
  };
}

export interface RevisedWorkLine extends WorkLineOperationalView {
  readonly currency: string;
  readonly unitPrice: string;
  readonly contractBaselineAmount: string;
  readonly approvedChangesAmount: string;
  readonly revisedAmount: string;
  readonly baselineQuantity: string;
  readonly revisedQuantity: string;
}

/** FINANCIAL read port: every active line with baseline / approved changes / revised value (3 queries). */
export async function listRevisedWorkLines(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<RevisedWorkLine[]> {
  const [lines, prices, adjustments] = await Promise.all([
    listWorkLinesOperational(db, organizationId, agreementId),
    listWorkLinePrices(db, organizationId, agreementId),
    listWorkLineAdjustments(db, organizationId, agreementId),
  ]);
  const priceByLine = new Map(prices.map((price) => [price.workLineId, price]));
  const adjustmentsByLine = new Map<string, { quantityDelta: string; amountDelta: string }[]>();
  for (const adjustment of adjustments) {
    const list = adjustmentsByLine.get(adjustment.workLineId) ?? [];
    list.push(adjustment);
    adjustmentsByLine.set(adjustment.workLineId, list);
  }
  return lines.flatMap((line) => {
    const price = priceByLine.get(line.id);
    if (!price) return [];
    const revised = revisedLineValue({
      currency: price.currency,
      isBaseline: line.isBaseline,
      baselineAmount: price.contractAmount,
      baselineQuantity: line.quantity,
      adjustments: adjustmentsByLine.get(line.id) ?? [],
    });
    return [
      {
        ...line,
        currency: price.currency,
        unitPrice: price.unitPrice,
        contractBaselineAmount: revised.contractBaseline.amount,
        approvedChangesAmount: revised.approvedChanges.amount,
        revisedAmount: revised.revised.amount,
        baselineQuantity: revised.baselineQuantity,
        revisedQuantity: revised.revisedQuantity,
      },
    ];
  });
}

/** Agreement + lines with financial fields filled only for financial callers (shared by internal + portal). */
export async function buildAgreementLines(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  withFinancial: boolean,
): Promise<{ lines: WorkLineView[]; financial: AgreementFinancialView | null }> {
  if (!withFinancial) {
    return { lines: await listWorkLinesOperational(db, organizationId, agreementId), financial: null };
  }
  const [revisedLines, position, financialRow, operational] = await Promise.all([
    listRevisedWorkLines(db, organizationId, agreementId),
    loadAgreementValuePosition(db, organizationId, agreementId),
    findAgreementFinancial(db, organizationId, agreementId),
    listWorkLinesOperational(db, organizationId, agreementId),
  ]);
  const revisedById = new Map(revisedLines.map((line) => [line.id, line]));
  const lines: WorkLineView[] = operational.map((line) => {
    const revised = revisedById.get(line.id);
    if (!revised) return line;
    return {
      ...line,
      financial: {
        currency: revised.currency,
        unitPrice: revised.unitPrice,
        contractBaselineAmount: revised.contractBaselineAmount,
        approvedChangesAmount: revised.approvedChangesAmount,
        revisedAmount: revised.revisedAmount,
        revisedQuantity: revised.revisedQuantity,
      },
    };
  });
  if (!position || !financialRow) return { lines, financial: null };
  const linesTotal = sumLineAmounts(
    revisedLines.map((line) => line.revisedAmount),
    position.currency,
  );
  return {
    lines,
    financial: {
      currency: position.currency,
      originalAmount: position.original.amount,
      approvedChangesAmount: position.approvedChanges.amount,
      currentAmount: position.current.amount,
      linesTotalAmount: toNumericString(money(linesTotal.amount, position.currency)),
      retentionPercent: financialRow.retentionPercent,
      retentionCapPercent: financialRow.retentionCapPercent,
      retentionCapAmount: financialRow.retentionCapAmount,
      advancePercent: financialRow.advancePercent,
      advanceAmount: financialRow.advanceAmount,
      advanceRecoveryMethod: financialRow.advanceRecoveryMethod ?? 'none',
      advanceRecoveryPercent: financialRow.advanceRecoveryPercent,
      vatTreatment: financialRow.vatTreatment ?? 'standard',
      paymentTermsDays: financialRow.paymentTermsDays,
      paymentTermsText: financialRow.paymentTermsText,
    },
  };
}

export interface AgreementWorkspace {
  readonly agreement: AgreementOperationalView;
  readonly access: SubcontractAccess;
  readonly lines: readonly WorkLineView[];
  readonly financial: AgreementFinancialView | null;
  readonly baselineEditable: boolean;
  readonly availableActions: ReturnType<typeof availableAgreementActions>;
  readonly locations: readonly { id: string; name: string; code: string | null }[];
  readonly workPackages: readonly { id: string; name: string }[];
}

/** Internal lines page. Money is loaded only when the caller holds contract.financial.view. */
export async function getAgreementWorkspace(context: OrgContext, agreementId: string): Promise<AgreementWorkspace> {
  const { agreement, access } = await loadAgreementWithAccess(context, agreementId);
  const [{ lines, financial }, locations, workPackages] = await Promise.all([
    buildAgreementLines(context.db, context.organizationId, agreement.id, access.canViewFinancial),
    listProjectLocationOptions(context.db, context.organizationId, agreement.projectId),
    listProjectWorkPackageOptions(context.db, context.organizationId, agreement.projectId),
  ]);
  return {
    agreement,
    access,
    lines,
    financial,
    baselineEditable: isBaselineEditable(agreement.status),
    availableActions: access.canManageContract ? availableAgreementActions(agreement.status) : [],
    locations,
    workPackages,
  };
}
