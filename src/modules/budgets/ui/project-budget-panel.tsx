import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { withOrgContext } from '@/shared/auth/session';
import { fromNumericString, zeroMoney } from '@/shared/money/money';
import { getProjectBudgetWorkspace } from '../application/queries';
import { BudgetVarianceSummary } from './budget-variance-summary';
import { BudgetManageForms } from './budget-manage-forms';

export interface ProjectBudgetPanelProps {
  readonly projectId: string;
}

export async function ProjectBudgetPanel({ projectId }: ProjectBudgetPanelProps) {
  const t = await getTranslations('budgets');

  const workspace = await withOrgContext(async (context) => {
    const data = await getProjectBudgetWorkspace(context, projectId);
    return {
      ...data,
      canManage: hasPermission(context, PERMISSIONS.BUDGETS_MANAGE),
      baseCurrency: context.organization.baseCurrency,
    };
  });

  const currency = workspace.budget?.currency ?? workspace.baseCurrency;

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
            forecast: t('metrics.forecast'),
            variance: t('metrics.variance'),
            engineMissing: t('metrics.engineMissing'),
          }}
        />
      ) : (
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('panel.empty')}</p>
      )}

      {workspace.budget && workspace.lines.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-sm font-semibold">{t('lines.title')}</h3>
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
          </div>
          <ul className="divide-y divide-[var(--pf-border-default)] rounded-md border border-[var(--pf-border-default)]">
            {workspace.lines.map((line) => {
              const amount =
                fromNumericString(line.budgetAmount, currency) ?? zeroMoney(currency);
              return (
                <li
                  key={line.id}
                  className="flex items-baseline justify-between gap-3 px-3 py-2 text-start"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{line.label}</p>
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {t(`lineTypes.${line.lineType}`)}
                      {line.costCode ? ` · ${line.costCode}` : null}
                      {line.categoryKey ? ` · ${line.categoryKey}` : null}
                      {line.disciplineKey ? ` · ${line.disciplineKey}` : null}
                    </p>
                  </div>
                  <MoneyText value={amount} className="shrink-0 text-sm" />
                </li>
              );
            })}
          </ul>
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
