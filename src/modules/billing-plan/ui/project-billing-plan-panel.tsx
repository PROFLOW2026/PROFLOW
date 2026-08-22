import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { listBillingContractOptionsForOrg } from '@/modules/billing';
import {
  getBillingCycleDetail,
  getBillingPlanDetail,
  isPlanEditable,
  listActiveTemplates,
  listBillingPlansForProject,
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
import { CreateBillingPlanDialog } from './create-billing-plan-dialog';
import { ReleasePlanRetentionDialog } from './release-plan-retention-dialog';
import { OrgBillingPlanTemplatesPanel } from './org-billing-plan-templates-panel';
import { activateBillingPlanAction } from './billing-plan-actions';

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
    const contracts = await listBillingContractOptionsForOrg(context, projectId);
    const selectedContractId =
      contractId ??
      contracts.find((c) => c.isPrimary)?.id ??
      contracts[0]?.id ??
      null;

    const orgTemplateRows = await listActiveTemplates(context.db, context.organizationId);
    const orgTemplates = orgTemplateRows.map((row) => ({ id: row.id, name: row.name }));

    if (!selectedContractId) {
      return {
        canManage,
        contracts,
        selectedContractId: null as string | null,
        detail: null as Awaited<ReturnType<typeof getBillingPlanDetail>> | null,
        cycleDetail: null as Awaited<ReturnType<typeof getBillingCycleDetail>> | null,
        timezone: context.organization.timezone,
        currencySymbol: '₪',
        orgTemplates,
      };
    }

    const plans = await listBillingPlansForProject(context, {
      projectId,
      contractId: selectedContractId,
      includeArchived: false,
    });

    const preferred =
      plans.find((p) => p.status === 'active') ??
      plans.find((p) => p.status === 'draft') ??
      plans[0] ??
      null;

    const detail = preferred
      ? await getBillingPlanDetail(context, { planId: preferred.id })
      : null;

    let cycleDetail: Awaited<ReturnType<typeof getBillingCycleDetail>> | null = null;
    if (detail) {
      const targetCycleId =
        cycleId ??
        detail.cycles.find((c) => c.status === 'draft' || c.status === 'ready')?.id ??
        detail.cycles[0]?.id ??
        null;
      if (targetCycleId) {
        cycleDetail = await getBillingCycleDetail(context, { cycleId: targetCycleId });
      }
    }

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
  } = data;

  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="billing-plan-panel">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 text-start">
          <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('subtitle')}</p>
          {simplified ? (
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              {t('panel.simplifiedHint')}
            </p>
          ) : null}
        </div>
        {detail && canManage && detail.plan.status === 'draft' ? (
          <form action={activateBillingPlanAction}>
            <input type="hidden" name="projectId" value={projectId} />
            <input type="hidden" name="planId" value={detail.plan.id} />
            <Button type="submit">{t('actions.activate')}</Button>
          </form>
        ) : null}
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
                className={
                  selected
                    ? 'rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-muted)] px-3 py-2 text-sm font-medium'
                    : 'rounded-md border border-transparent px-3 py-2 text-sm text-[var(--pf-text-secondary)]'
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
        <EmptyState
          title={t('panel.emptyTitle')}
          description={t('panel.emptyBody')}
          action={
            canManage ? (
              <CreateBillingPlanDialog
                projectId={projectId}
                contractId={selectedContractId}
                triggerLabel={t('panel.emptyAction')}
                simplified={simplified}
                orgTemplates={orgTemplates}
              />
            ) : null
          }
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{detail.plan.name}</span>
            <span className="rounded-full bg-[var(--pf-bg-muted)] px-2 py-0.5 text-xs">
              {t(`status.${detail.plan.status}` as never)}
            </span>
            <span className="text-[var(--pf-text-muted)]">
              {detail.contract.name ??
                detail.contract.contractNumber ??
                detail.contract.id.slice(0, 8)}
            </span>
          </div>

          <BillingPlanSummaryCards
            currency={detail.plan.currency}
            contractValue={detail.reconciliation.contractValue}
            plannedTotal={detail.reconciliation.plannedTotal}
            billedTotal={detail.reconciliation.billedTotal}
            remainingPlanned={detail.reconciliation.remainingPlanned}
            unplannedAmount={detail.reconciliation.unplannedAmount}
            retentionHeld={detail.retentionHeldRemaining}
            retentionReleased={toNumericString(
              subtractMoney(
                money(detail.retentionAccumulated, detail.plan.currency),
                money(detail.retentionHeldRemaining, detail.plan.currency),
              ),
            )}
            overPlanned={detail.reconciliation.overPlanned}
            simplified={simplified}
            labels={{
              contractValue: t('summary.contractValue'),
              planned: t('summary.planned'),
              billed: t('summary.billed'),
              remainingPlanned: t('summary.remainingPlanned'),
              unplanned: t('summary.unplanned'),
              retentionHeld: t('summary.retentionHeld'),
              retentionReleased: t('summary.retentionReleased'),
              overPlanned: t('recon.overPlanned'),
            }}
          />

          {canManage ? (
            <div
              className="flex min-w-0 flex-col gap-3 rounded-md border border-[var(--pf-border-default)] p-4"
              data-testid="retention-release-panel"
            >
              <div>
                <h3 className="text-sm font-semibold">{t('retention.heldTitle')}</h3>
                <p className="text-xs text-[var(--pf-text-muted)]">{t('retention.heldHint')}</p>
              </div>
              <ReleasePlanRetentionDialog
                projectId={projectId}
                planId={detail.plan.id}
                currency={detail.plan.currency}
                heldRemaining={detail.retentionHeldRemaining}
                defaultReleaseDate={todayInTimeZone(data.timezone)}
              />
            </div>
          ) : null}

          <OrgBillingPlanTemplatesPanel
            projectId={projectId}
            planId={detail.plan.id}
            canManage={canManage}
            templates={orgTemplates}
          />

          {isPlanEditable(detail.plan.status) || detail.lines.length > 0 ? (
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
                  retentionPercent:
                    line.retentionPercentOverride ??
                    detail.plan.defaultRetentionPercent ??
                    '',
                };
              })}
            />
          ) : null}

          <BillingCycleWorkspace
            projectId={projectId}
            planId={detail.plan.id}
            planStatus={detail.plan.status}
            currency={detail.plan.currency}
            currencySymbol={currencySymbol}
            canManage={canManage}
            defaultAccountDate={todayInTimeZone(data.timezone)}
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
                retentionAmount: line.retentionAmount,
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
          />
        </>
      )}
    </div>
  );
}
