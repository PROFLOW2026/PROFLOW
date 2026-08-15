import Decimal from 'decimal.js';
import { ClipboardList } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import {
  computeNetApprovedChanges,
  getProjectCommercialSummary,
} from '@/modules/commercial';
import { listCostCategoriesForOrg, listWorkPackagesForOrg } from '@/modules/expenses';
import { getProjectBudgetWorkspace } from '@/modules/budgets';
import { listProjectVendorEngagements } from '@/modules/vendors';
import { listImportableKinds } from '@/modules/imports';
import { ImportWizardLazy } from '@/modules/imports/ui/import-wizard-lazy';
import { fromNumericString, zeroMoney } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { Button } from '@/components/ui/button';
import {
  getBoqFinancialComparison,
  getProjectBoqWorkspace,
  listBoqProgress,
  listProjectChangeOrdersForBoqPanel,
  listSubcontractorSchedulesForBoqWorkspace,
  reconcileContractBoq,
} from '@/modules/boq';
import { BoqPanelClient } from './boq-panel-client';
import { BoqFinancialComparisonStrip } from './boq-financial-comparison';
import { BoqItemMappingHost } from './boq-item-mapping-host';
import { SubcontractorSchedulePanel } from './subcontractor-schedule-panel';

export interface ProjectBoqPanelProps {
  readonly projectId: string;
  readonly contractId?: string | null;
}

export async function ProjectBoqPanel({ projectId, contractId }: ProjectBoqPanelProps) {
  const t = await getTranslations('boq');

  const view = await withOrgContext(async (context) => {
    const canManage = hasPermission(context, PERMISSIONS.BOQ_MANAGE);
    const canProposeApDraft = hasPermission(context, PERMISSIONS.AP_MANAGE);
    const canSubmitProgress = hasPermission(context, PERMISSIONS.BOQ_PROGRESS_SUBMIT);
    const canApproveProgress = hasPermission(context, PERMISSIONS.BOQ_PROGRESS_APPROVE);
    const canCreateBilling = hasPermission(context, PERMISSIONS.BOQ_BILLING_CREATE);
    const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

    const workspace = await getProjectBoqWorkspace(context, projectId, contractId);
    const showAmounts = Boolean(workspace.showMoney);
    const progress = workspace.activeBoq
      ? await listBoqProgress(context, workspace.activeBoq.id)
      : { batches: [] as Awaited<ReturnType<typeof listBoqProgress>>['batches'] };

    let reconciliation = null as ReturnType<typeof reconcileContractBoq> | null;
    let reconAttempted = false;
    if (showAmounts) {
      reconAttempted = true;
      if (hasPermission(context, PERMISSIONS.CHANGES_READ)) {
        const commercial = await getProjectCommercialSummary(context, projectId);
        if (commercial) {
          const currency = workspace.totals.currency;
          const approvedChanges = computeNetApprovedChanges(
            commercial.position.approvedAdditions,
            commercial.position.approvedReductions,
          );
          const allocatedApprovedChanges =
            fromNumericString(workspace.totals.allocatedApprovedAmount, currency) ??
            zeroMoney(currency);
          reconciliation = reconcileContractBoq({
            originalContract: commercial.position.originalContractValue,
            originalBoq:
              fromNumericString(workspace.totals.originalAmount, currency) ?? zeroMoney(currency),
            currentContract: commercial.position.currentContractValue,
            currentBoq:
              fromNumericString(workspace.totals.currentAmount, currency) ?? zeroMoney(currency),
            approvedChanges,
            allocatedApprovedChanges,
          });
        }
      }
    }

    const comparison = canReadFinancials
      ? await getBoqFinancialComparison(context, projectId).catch(() => null)
      : null;

    const workPackages = hasPermission(context, PERMISSIONS.EXPENSES_READ)
      ? await listWorkPackagesForOrg(context, projectId).catch(() => [])
      : [];
    const costCategories = hasPermission(context, PERMISSIONS.EXPENSES_READ)
      ? await listCostCategoriesForOrg(context).catch(() => [])
      : [];
    const budgetWorkspace = hasPermission(context, PERMISSIONS.BUDGETS_READ)
      ? await getProjectBudgetWorkspace(context, projectId).catch(() => null)
      : null;
    const engagements = hasPermission(context, PERMISSIONS.VENDORS_READ)
      ? await listProjectVendorEngagements(context, projectId).catch(() => [])
      : [];
    const subSchedules = workspace.activeBoq
      ? await listSubcontractorSchedulesForBoqWorkspace(context, workspace.activeBoq.id).catch(
          () => [],
        )
      : [];

    const approvedChangeOrders = hasPermission(context, PERMISSIONS.CHANGES_READ)
      ? await listProjectChangeOrdersForBoqPanel(context, projectId).catch(() => [])
      : [];

    const importKinds = canManage
      ? listImportableKinds(context).filter((kind) => kind === 'boq_items')
      : [];

    return {
      workspace,
      progress,
      reconciliation,
      reconAttempted,
      comparison,
      workPackages,
      costCategories,
      budgetLines: (budgetWorkspace?.lineControls ?? []).filter(
        (line) => line.kind !== 'unmapped_remainder',
      ),
      engagements,
      subSchedules,
      approvedChangeOrders,
      importKinds,
      permissions: {
        canManage,
        canProposeApDraft,
        canSubmitProgress,
        canApproveProgress,
        canCreateBilling,
        showAmounts,
      },
      baseCurrency: context.organization.baseCurrency,
    };
  });

  const {
    workspace,
    progress,
    reconciliation,
    reconAttempted,
    comparison,
    workPackages,
    costCategories,
    budgetLines,
    engagements,
    subSchedules,
    approvedChangeOrders,
    importKinds,
    permissions,
  } = view;
  const currency = workspace.totals.currency;
  const boq = workspace.activeBoq;
  const itemNodes = workspace.nodes.filter((n) => n.nodeKind === 'item');

  const nodes = workspace.nodes.map((node) => ({
    id: node.id,
    parentId: node.parentId,
    nodeKind: node.nodeKind as 'chapter' | 'item',
    itemCode: node.itemCode,
    description: node.description,
    unit: node.unit,
    currentQuantity: node.currentQuantity,
    currentUnitPrice: node.currentUnitPrice,
    currentAmount: node.currentAmount,
    originalQuantity: node.originalQuantity,
    originalAmount: node.originalAmount,
    sortOrder: node.sortOrder,
    status: node.status,
  }));

  const batches = progress.batches.map(({ batch, lines }) => ({
    id: batch.id,
    certificateNumber: batch.certificateNumber,
    periodLabel: batch.periodLabel,
    status: batch.status,
    lines: lines.map((line) => ({
      id: line.id,
      boqNodeId: line.boqNodeId,
      measuredQuantity: line.measuredQuantity,
      approvedQuantity: line.approvedQuantity,
      periodAmount: line.periodAmount,
      previousApprovedQuantity: line.previousApprovedQuantity,
    })),
  }));

  // KPI snapshot: opening baselines + approved/billed period lines (qty only — safe for field).
  let performedQty = new Decimal(0);
  let billedQty = new Decimal(0);
  let currentQty = new Decimal(0);
  for (const node of itemNodes) {
    currentQty = currentQty.plus(node.currentQuantity || '0');
    const openingApproved = new Decimal(node.openingApprovedQuantity || '0');
    const openingBilled = new Decimal(node.openingBilledQuantity || '0');
    performedQty = performedQty.plus(Decimal.max(openingApproved, openingBilled));
    billedQty = billedQty.plus(openingBilled);
  }
  for (const { batch, lines } of progress.batches) {
    for (const line of lines) {
      const qty = new Decimal(line.approvedQuantity || '0');
      if (batch.status === 'approved' || batch.status === 'billed') {
        performedQty = performedQty.plus(qty);
      }
      if (batch.status === 'billed') {
        billedQty = billedQty.plus(qty);
      }
    }
  }
  const remainingQty = Decimal.max(currentQty.minus(performedQty), 0);

  const allocations = (workspace.allocations ?? []).map((row) => ({
    id: row.id,
    changeOrderId: row.changeOrderId,
    allocationKind: row.allocationKind,
    quantityDelta: row.quantityDelta,
    amountDelta: row.amountDelta,
    boqNodeId: row.boqNodeId,
  }));

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 text-start">
          <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.description')}</p>
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {boq && permissions.canSubmitProgress ? (
            <Button asChild>
              <Link href={`/projects/${projectId}/boq-measure`}>{t('measure.link')}</Link>
            </Button>
          ) : null}
          {boq && permissions.canManage ? (
            <Link
              href={`/exports/boq?projectId=${encodeURIComponent(projectId)}`}
              className="text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
            >
              {t('export.downloadCsv')}
            </Link>
          ) : null}
        </div>
      </div>

      {workspace.contracts.length > 1 ? (
        <nav className="flex min-w-0 flex-wrap gap-2" aria-label={t('forms.contract')}>
          {workspace.contracts.map((contract) => {
            const href = `/projects/${projectId}?tab=boq&contractId=${contract.id}`;
            const selected = workspace.selectedContractId === contract.id;
            return (
              <Link
                key={contract.id}
                href={href}
                className={
                  selected
                    ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                    : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
                }
              >
                {contract.name ??
                  contract.contractNumber ??
                  (contract.isPrimary ? t('forms.contractPrimary') : contract.id.slice(0, 8))}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!boq ? (
        <EmptyState
          icon={ClipboardList}
          title={t('panel.emptyTitle')}
          description={t('panel.emptyBody')}
        />
      ) : null}

      {boq ? (
        <section className="grid min-w-0 gap-3 rounded-md border border-[var(--pf-border-default)] p-3 sm:grid-cols-3">
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('kpis.performed')}</p>
            <p className="text-lg font-semibold" dir="ltr">
              {performedQty.toFixed()}
            </p>
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('kpis.billed')}</p>
            <p className="text-lg font-semibold" dir="ltr">
              {billedQty.toFixed()}
            </p>
          </div>
          <div className="min-w-0 text-start">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('kpis.remaining')}</p>
            <p className="text-lg font-semibold" dir="ltr">
              {remainingQty.toFixed()}
            </p>
          </div>
        </section>
      ) : null}

      {permissions.canManage && importKinds.length > 0 ? (
        <section className="flex min-w-0 flex-col gap-2 rounded-md border border-[var(--pf-border-default)] p-3">
          <h3 className="text-sm font-semibold">{t('import.title')}</h3>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('import.hint')}</p>
          {boq && boq.status !== 'draft' ? (
            <p className="text-xs text-[var(--pf-text-muted)]">{t('import.draftOnlyHint')}</p>
          ) : null}
          <WithClientMessages extra={['imports']}>
            <ImportWizardLazy
              allowedKinds={importKinds}
              projectId={projectId}
              boqId={boq?.status === 'draft' ? boq.id : undefined}
            />
          </WithClientMessages>
        </section>
      ) : null}

      <BoqPanelClient
        projectId={projectId}
        currency={currency}
        boq={
          boq
            ? {
                id: boq.id,
                status: boq.status,
                title: boq.title,
                progressMode: boq.progressMode,
                versionNumber: boq.versionNumber,
              }
            : null
        }
        nodes={nodes}
        batches={batches}
        totals={{
          original:
            fromNumericString(workspace.totals.originalAmount, currency) ?? zeroMoney(currency),
          current:
            fromNumericString(workspace.totals.currentAmount, currency) ?? zeroMoney(currency),
        }}
        reconciliation={
          reconciliation
            ? {
                status: reconciliation.status,
                originalContract: reconciliation.originalContract,
                originalBoq: reconciliation.originalBoq,
                currentContract: reconciliation.currentContract,
                currentBoq: reconciliation.currentBoq,
                approvedChanges: reconciliation.approvedChanges,
                allocatedApprovedChanges: reconciliation.allocatedApprovedChanges,
                unallocatedApprovedChanges: reconciliation.unallocatedApprovedChanges,
              }
            : null
        }
        reconUnavailable={Boolean(permissions.showAmounts && reconAttempted && !reconciliation)}
        changeOrders={approvedChangeOrders.map((row) => ({
          id: row.id,
          label: row.reference?.trim() || row.id.slice(0, 8),
          amount: String(row.amount),
          direction: row.direction,
        }))}
        allocations={allocations}
        permissions={permissions}
        contracts={workspace.contracts}
        selectedContractId={workspace.selectedContractId}
      />

      {comparison ? <BoqFinancialComparisonStrip comparison={comparison} /> : null}

      {boq && itemNodes.length > 0 ? (
        <BoqItemMappingHost
          projectId={projectId}
          canManage={permissions.canManage}
          items={itemNodes.map((node) => ({
            id: node.id,
            label: node.itemCode
              ? `${node.itemCode} · ${node.description}`
              : node.description,
            workPackageId: node.workPackageId,
            costCategoryId: node.costCategoryId,
            budgetLineId: node.budgetLineId,
          }))}
          workPackages={workPackages.map((wp) => ({ id: wp.id, label: wp.name }))}
          costCategories={costCategories.map((c) => ({
            id: c.id,
            label: c.name ?? c.key ?? c.id,
          }))}
          budgetLines={budgetLines.map((line) => ({
            id: line.id,
            label: line.label,
          }))}
        />
      ) : null}

      {boq && (permissions.canManage || subSchedules.length > 0) ? (
        <SubcontractorSchedulePanel
          projectId={projectId}
          boqId={boq.id}
          canManage={permissions.canManage}
          canProposeApDraft={permissions.canProposeApDraft}
          engagements={engagements.map((e) => ({
            id: e.id,
            label: e.vendorName,
          }))}
          items={itemNodes.map((node) => ({
            id: node.id,
            label: node.itemCode
              ? `${node.itemCode} · ${node.description}`
              : node.description,
          }))}
          schedules={subSchedules.map(({ schedule, lines, valuations }) => ({
            id: schedule.id,
            title: schedule.title,
            status: schedule.status,
            currency: schedule.currency,
            lines: lines.map((line) => ({
              id: line.id,
              boqNodeId: line.boqNodeId,
              agreedQuantity: line.agreedQuantity,
              unitRate: line.unitRate,
              amount: line.amount,
            })),
            valuations: valuations.map((valuation) => ({
              id: valuation.id,
              periodLabel: valuation.periodLabel,
              status: valuation.status,
              proposedVendorBillId: valuation.proposedVendorBillId,
            })),
          }))}
        />
      ) : null}
    </div>
  );
}
