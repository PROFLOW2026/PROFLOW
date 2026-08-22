import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  isPlanEditable,
  loadBillingPlanWorkspacePayload,
} from '@/modules/billing-plan';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { formatMoney } from '@/shared/money/format';
import { money, subtractMoney, toNumericString, zeroMoney } from '@/shared/money';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { BillingPlanSummaryCards } from './billing-plan-summary-cards';
import { BillingPlanLinesEditor } from './billing-plan-lines-editor';
import { BillingCycleWorkspace } from './billing-cycle-workspace';
import { BillingPlanEmptyState } from './billing-plan-empty-state';
import { BillingPlanRetentionSetting } from './billing-plan-retention-setting';
import { DeleteBillingPlanButton } from './delete-billing-plan-button';
import { ReleasePlanRetentionDialog } from './release-plan-retention-dialog';
import { OrgBillingPlanTemplatesPanel } from './org-billing-plan-templates-panel';
import { saveBillingPlanAction } from './billing-plan-actions';

interface ProjectBillingPlanPanelProps {
  readonly projectId: string;
  readonly contractId?: string | null;
  readonly cycleId?: string | null;
  readonly simplified?: boolean;
}

function resolveLabel(
  raw: string,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  if (raw.startsWith('billingPlan.')) {
    const key = raw.slice('billingPlan.'.length);
    try {
      return t(key as never);
    } catch {
      return raw;
    }
  }
  return raw;
}

export async function ProjectBillingPlanPanel({
  projectId,
  contractId,
  cycleId,
  simplified = false,
}: ProjectBillingPlanPanelProps) {
  const t = await getTranslations('billingPlan');
  const locale = await getLocale();

  const data = await withOrgContext(async (context) => {
    const canManage = hasPermission(context, PERMISSIONS.BILLING_MANAGE);
    const workspace = await loadBillingPlanWorkspacePayload(context, {
      projectId,
      contractId,
      cycleId,
    });
    const useSimplified =
      simplified ||
      workspace.project?.experienceProfile === 'simple' ||
      workspace.project?.experienceProfile === 'small_job';
    const {
      contracts,
      selectedContractId,
      detail,
      cycleDetail,
      orgTemplates,
      canDelete,
    } = workspace;

    const sampleCurrency =
      detail?.plan.currency ?? context.organization.baseCurrency ?? 'ILS';
    const sample = formatMoney(zeroMoney(sampleCurrency), locale, {
      currencyDisplay: 'narrowSymbol',
    });
    const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

    return {
      canManage,
      contracts,
      selectedContractId,
      detail,
      cycleDetail,
      timezone: context.organization.timezone,
      currencySymbol,
      orgTemplates,
      canDelete,
      useSimplified,
    };
  });

  if (!data.selectedContractId) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        <div className="min-w-0 text-start">
          <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        </div>
        <EmptyState title={t('panel.noContract')} description={t('panel.emptyBody')} />
      </div>
    );
  }

  const {
    detail,
    canManage,
    contracts,
    selectedContractId,
    cycleDetail,
    currencySymbol,
    orgTemplates,
    canDelete,
    useSimplified,
  } = data;

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="billing-plan-panel">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-start">
          <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
        </div>
      </div>

      {contracts.length > 1 ? (
        <nav className="flex min-w-0 flex-wrap gap-2" aria-label={t('panel.selectContract')}>
          {contracts.map((contract) => {
            const href = `/projects/${projectId}?tab=billingPlan&contractId=${contract.id}`;
            const selected = selectedContractId === contract.id;
            return (
              <Link
                key={contract.id}
                href={href}
                prefetch
                className={
                  selected
                    ? 'rounded-md bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                    : 'rounded-md px-3 py-2 text-sm text-[var(--pf-text-secondary)] hover:bg-[var(--pf-bg-muted)]/60'
                }
              >
                {contract.name ??
                  contract.contractNumber ??
                  (contract.isPrimary ? t('fields.contract') : contract.id.slice(0, 8))}
              </Link>
            );
          })}
        </nav>
      ) : null}

      {!detail ? (
        <BillingPlanEmptyState
          projectId={projectId}
          contractId={selectedContractId}
          canManage={canManage}
          simplified={useSimplified}
          orgTemplates={orgTemplates}
        />
      ) : (
        <>
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{detail.plan.name}</span>
              {detail.plan.status === 'draft' ? (
                <span className="rounded-full bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs text-[var(--pf-text-muted)]">
                  {t('status.draft')}
                </span>
              ) : null}
              <span className="text-[var(--pf-text-muted)]">
                {detail.contract.name ??
                  detail.contract.contractNumber ??
                  detail.contract.id.slice(0, 8)}
              </span>
            </div>
            {canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                {detail.plan.status === 'draft' && detail.lines.length > 0 ? (
                  <form action={saveBillingPlanAction}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <input type="hidden" name="planId" value={detail.plan.id} />
                    <Button type="submit" size="sm">
                      {t('actions.savePlan')}
                    </Button>
                  </form>
                ) : null}
                <DeleteBillingPlanButton
                  projectId={projectId}
                  planId={detail.plan.id}
                  canDelete={canDelete}
                />
              </div>
            ) : null}
          </div>

          <BillingPlanSummaryCards
            currency={detail.plan.currency}
            contractValue={detail.reconciliation.contractValue}
            billedTotal={detail.reconciliation.billedTotal}
            remainingPlanned={detail.reconciliation.remainingPlanned}
            retentionHeld={detail.retentionHeldRemaining}
            retentionReleased={toNumericString(
              subtractMoney(
                money(detail.retentionAccumulated, detail.plan.currency),
                money(detail.retentionHeldRemaining, detail.plan.currency),
              ),
            )}
            currentAccountAmount={cycleDetail?.totals.currentAmount}
            overPlanned={detail.reconciliation.overPlanned}
            labels={{
              contractValue: t('summary.contractValue'),
              billed: t('summary.billed'),
              remainingPlanned: t('summary.remainingPlanned'),
              retentionHeld: t('summary.retentionHeld'),
              retentionReleased: t('summary.retentionReleased'),
              currentAccount: t('summary.currentAccount'),
              overPlanned: t('recon.overPlanned'),
            }}
          />

          {canManage ? (
            <BillingPlanRetentionSetting
              projectId={projectId}
              planId={detail.plan.id}
              defaultRetentionPercent={detail.plan.defaultRetentionPercent ?? ''}
              canManage={isPlanEditable(detail.plan.status)}
            />
          ) : null}

          {canManage && detail.retentionHeldRemaining !== '0' ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-[var(--pf-text-secondary)]">{t('retention.heldHint')}</p>
              <ReleasePlanRetentionDialog
                projectId={projectId}
                planId={detail.plan.id}
                currency={detail.plan.currency}
                heldRemaining={detail.retentionHeldRemaining}
                defaultReleaseDate={todayInTimeZone(data.timezone)}
              />
            </div>
          ) : null}

          <BillingPlanLinesEditor
            projectId={projectId}
            planId={detail.plan.id}
            currency={detail.plan.currency}
            currencySymbol={currencySymbol}
            contractBaseAmount={detail.reconciliation.contractValue}
            canManage={canManage && isPlanEditable(detail.plan.status)}
            lines={detail.lines.map((line) => {
              const progress = detail.reconciliation.lines.find(
                (row) => row.planLineId === line.id,
              );
              return {
                id: line.id,
                label: resolveLabel(line.label, t),
                agreedAmount: line.agreedAmount,
                agreedPercent: line.agreedPercent ?? '',
                billedAmount: progress?.billedAmount ?? '0',
                billedPercent: progress?.billedPercent ?? '0',
                remainingAmount: progress?.remainingAmount ?? line.agreedAmount,
              };
            })}
          />

          <BillingCycleWorkspace
            projectId={projectId}
            planId={detail.plan.id}
            planStatus={detail.plan.status}
            currency={detail.plan.currency}
            currencySymbol={currencySymbol}
            canManage={canManage}
            defaultAccountDate={todayInTimeZone(data.timezone)}
            defaultRetentionPercent={detail.plan.defaultRetentionPercent}
            cycles={detail.cycles.map((cycle) => ({
              id: cycle.id,
              cycleNumber: cycle.cycleNumber,
              title: cycle.title,
              status: cycle.status,
              accountDate: cycle.accountDate,
              billingRecordId: cycle.billingRecordId,
            }))}
            activeCycleId={cycleDetail?.cycle.id ?? null}
            activeLines={
              cycleDetail?.lines.map((line) => ({
                planLineId: line.planLineId,
                label: resolveLabel(line.label, t),
                baseAmount: line.baseAmountSnapshot,
                priorPercent: line.priorPercent,
                priorAmount: line.priorAmount,
                currentPercent: line.currentPercent ?? '',
                currentAmount: line.currentAmount ?? '',
                cumulativePercent: line.cumulativePercent,
                cumulativeAmount: line.cumulativeAmount,
                remainingAmount: line.remainingAmount,
              })) ?? []
            }
            activeTotals={
              cycleDetail
                ? {
                    currentAmount: cycleDetail.totals.currentAmount,
                    retentionAmount: cycleDetail.totals.retentionAmount,
                  }
                : undefined
            }
            retentionAccumulated={detail.retentionAccumulated}
          />

          {canManage ? (
            <details className="min-w-0 text-sm">
              <summary className="cursor-pointer font-medium text-[var(--pf-text-secondary)]">
                {t('orgTemplates.listLabel')}
              </summary>
              <div className="mt-3">
                <OrgBillingPlanTemplatesPanel
                  projectId={projectId}
                  planId={detail.plan.id}
                  canManage={canManage}
                  templates={orgTemplates}
                />
              </div>
            </details>
          ) : null}
        </>
      )}
    </div>
  );
}
