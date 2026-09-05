import { getLocale, getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { fromNumericString, zeroMoney } from '@/shared/money/money';
import { loadCachedProjectFinancials } from '@/modules/financials/application/load-cached-project-financials';
import { DEFAULT_PROJECT_PROFITABILITY_MODE } from '@/modules/tenancy/domain/project-profitability-mode';
import { getProjectBudgetWorkspace } from '../application/queries';
import { BudgetVarianceSummary } from './budget-variance-summary';
import { BudgetLineControlList } from './budget-line-control-list';
import { BudgetManageForms } from './budget-manage-forms';

export interface ProjectBudgetPanelProps {
  readonly projectId: string;
}

export async function ProjectBudgetPanel({ projectId }: ProjectBudgetPanelProps) {
  const [t, locale] = await Promise.all([getTranslations('budgets'), getLocale()]);

  const workspace = await withOrgContext(async (context) => {
    const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);
    const financialsPromise = canReadFinancials
      ? loadCachedProjectFinancials(projectId)
      : null;
    const data = await getProjectBudgetWorkspace(context, projectId, {
      costPromise: financialsPromise
        ? financialsPromise.then((row) => row.cost)
        : Promise.resolve(null),
      profitabilityModePromise: financialsPromise
        ? financialsPromise.then(
            (row) => row.projectProfitabilityMode ?? DEFAULT_PROJECT_PROFITABILITY_MODE,
          )
        : undefined,
    });
    return {
      ...data,
      canManage: hasPermission(context, PERMISSIONS.BUDGETS_MANAGE),
      baseCurrency: context.organization.baseCurrency,
    };
  });

  const currency = workspace.budget?.currency ?? workspace.baseCurrency;
  const includeGeneral = workspace.profitabilityMode === 'include_general';
  const forecastLabel = includeGeneral ? t('metrics.forecastFull') : t('metrics.forecast');
  const varianceLabel = includeGeneral ? t('metrics.varianceFull') : t('metrics.variance');

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <div className="min-w-0 text-start">
        <h2 className="text-lg font-semibold">{t('panel.title')}</h2>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.description')}</p>
      </div>

      {workspace.control ? (
        <BudgetVarianceSummary
          control={workspace.control}
          hasEngineActual={workspace.hasEngineActual}
          labels={{
            budget: t('metrics.budget'),
            actual: t('metrics.actual'),
            remainingCommitment: t('metrics.remainingCommitment'),
            etc: t('metrics.etc'),
            forecast: forecastLabel,
            variance: varianceLabel,
            engineMissing: t('metrics.engineMissing'),
          }}
        />
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.empty')}</p>
      )}

      {workspace.budget && workspace.lineControls.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <p className="text-xs text-[var(--pf-text-muted)]">
            {t('lines.mode', {
              mode:
                workspace.mode === 'advanced'
                  ? t('lines.modeAdvanced')
                  : t('lines.modeLightweight'),
            })}
            {' · '}
            {t('lines.revision', { number: workspace.budget.currentRevisionNumber })}
          </p>
          <BudgetLineControlList
            rows={workspace.lineControls}
            locale={locale}
            labels={{
              title: t('lines.title'),
              mappingHint: t('lines.mappingHint'),
              unmappedRow: t('lines.unmappedRow'),
              unmappedRowHint: t('lines.unmappedRowHint'),
              unmappedValue: t('lines.unmappedValue'),
              mappedStatus: t('lines.mappedStatus'),
              unmappedStatus: t('lines.unmappedStatus'),
              engineTotalStatus: t('lines.engineTotalStatus'),
              budget: t('metrics.budget'),
              actual: t('metrics.actual'),
              remainingCommitment: t('metrics.remainingCommitment'),
              etc: t('metrics.etc'),
              forecast: forecastLabel,
              variance: varianceLabel,
              lineTypes: {
                total: t('lineTypes.total'),
                category: t('lineTypes.category'),
                work_package: t('lineTypes.work_package'),
                discipline: t('lineTypes.discipline'),
                cost_code: t('lineTypes.cost_code'),
              },
            }}
          />
        </div>
      ) : null}

      {workspace.revisions.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('revisions.title')}</h3>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-md border border-[var(--pf-border-default)]">
            {workspace.revisions.map((revision) => {
              const snapshot =
                fromNumericString(revision.snapshotTotalAmount, currency) ??
                zeroMoney(currency);
              return (
                <li
                  key={revision.id}
                  className="flex flex-col gap-1 px-3 py-2 text-start sm:flex-row sm:items-baseline sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t('revisions.item', { number: revision.revisionNumber })}
                    </p>
                    <p className="text-xs text-[var(--pf-text-muted)]">{revision.reason}</p>
                  </div>
                  <MoneyText value={snapshot} className="shrink-0 text-sm" />
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-[var(--pf-text-muted)]">{t('revisions.historyHint')}</p>
        </div>
      ) : null}

      {workspace.canManage ? (
        <BudgetManageForms
          projectId={projectId}
          budgetId={workspace.budget?.id ?? null}
          currency={currency}
          mode={workspace.budget ? 'revise' : 'create'}
        />
      ) : null}
    </div>
  );
}
