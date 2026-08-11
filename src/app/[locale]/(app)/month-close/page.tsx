import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import {
  getMonthClosePeriodDetail,
  listMonthCloseWorkspace,
  type MonthCloseAdjustment,
  type MonthClosePeriod,
} from '@/modules/month-close';
import { MonthClosePanel } from '@/modules/month-close/ui/month-close-panel';
import { getModuleVisibility } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  closeMonthClosePeriodAction,
  createMonthCloseAdjustmentAction,
  demoteMonthCloseAction,
  ensureMonthClosePeriodAction,
  markMonthCloseReadyAction,
  refreshMonthCloseAction,
} from './actions';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('monthClose');
  return { title: t('title') };
}

type PageData =
  | { readonly allowed: false }
  | {
      readonly allowed: true;
      readonly moduleEnabled: boolean;
      readonly periods: readonly MonthClosePeriod[];
      readonly selected: MonthClosePeriod | null;
      readonly adjustments: readonly MonthCloseAdjustment[];
      readonly canManage: boolean;
      readonly suggestedYearMonth: string;
    };

export default async function MonthClosePage({
  searchParams,
}: {
  searchParams: Promise<{ periodId?: string }>;
}) {
  const t = await getTranslations('monthClose');
  const params = await searchParams;
  const requestedId = params.periodId?.trim() || null;

  const data: PageData = await withOrgContext(async (context) => {
    const canRead = hasPermission(context, PERMISSIONS.MONTH_CLOSE_READ);
    if (!canRead) {
      return { allowed: false as const };
    }

    const [modules, workspace] = await Promise.all([
      getModuleVisibility(context),
      listMonthCloseWorkspace(context),
    ]);

    const selectedId =
      requestedId && workspace.periods.some((period) => period.id === requestedId)
        ? requestedId
        : (workspace.periods[0]?.id ?? null);

    const detail = selectedId
      ? await getMonthClosePeriodDetail(context, selectedId)
      : null;

    return {
      allowed: true as const,
      moduleEnabled: modules.month_close,
      periods: workspace.periods,
      selected: detail?.period ?? null,
      adjustments: detail?.adjustments ?? [],
      canManage: workspace.canManage,
      suggestedYearMonth: workspace.suggestedYearMonth,
    };
  });

  if (!data.allowed) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />
        <Card className="p-5 text-sm text-[var(--pf-text-secondary)]">{t('notAllowed')}</Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="p-5">
        <MonthClosePanel
          periods={data.periods}
          selected={data.selected}
          adjustments={data.adjustments}
          canManage={data.canManage}
          suggestedYearMonth={data.suggestedYearMonth}
          moduleEnabled={data.moduleEnabled}
          ensureAction={ensureMonthClosePeriodAction}
          refreshAction={refreshMonthCloseAction}
          markReadyAction={markMonthCloseReadyAction}
          demoteAction={demoteMonthCloseAction}
          closeAction={closeMonthClosePeriodAction}
          adjustmentAction={createMonthCloseAdjustmentAction}
        />
      </Card>
    </div>
  );
}
