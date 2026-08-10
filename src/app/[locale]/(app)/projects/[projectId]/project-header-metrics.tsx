import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import type { MoneyValue } from '@/shared/money';

export async function ProjectHeaderMetrics({
  currentContractValue,
  displayOriginalValue,
  managedOpeningValue,
}: {
  currentContractValue: MoneyValue | null;
  /** Real-world original — context only; never used as a KPI base. */
  displayOriginalValue?: MoneyValue | null;
  /** Managed opening (original event) when an opening reduction exists. */
  managedOpeningValue?: MoneyValue | null;
}) {
  const t = await getTranslations('projects.workspace.header');

  if (!currentContractValue) return null;

  const showBaselineContext =
    Boolean(displayOriginalValue) &&
    Boolean(managedOpeningValue) &&
    displayOriginalValue!.amount !== managedOpeningValue!.amount;

  return (
    <div className="grid min-w-0 max-w-full gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {showBaselineContext ? (
        <>
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('displayOriginalValue')}</p>
            <p className="min-w-0 max-w-full overflow-x-auto text-sm text-[var(--pf-text-secondary)]">
              <MoneyText value={displayOriginalValue!} />
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-[var(--pf-text-muted)]">{t('managedOpeningValue')}</p>
            <p className="min-w-0 max-w-full overflow-x-auto text-sm text-[var(--pf-text-secondary)]">
              <MoneyText value={managedOpeningValue!} />
            </p>
          </div>
        </>
      ) : null}
      <div className="min-w-0">
        <p className="text-xs text-[var(--pf-text-muted)]">{t('currentContractValue')}</p>
        <p className="min-w-0 max-w-full overflow-x-auto text-lg font-semibold">
          <MoneyText value={currentContractValue} />
        </p>
      </div>
    </div>
  );
}
