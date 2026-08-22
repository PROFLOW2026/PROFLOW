import type { DashboardMissingDataItem } from '../domain/dashboard-missing-data';
import type { DashboardMissingDataItemView } from './dashboard-missing-data-trigger';

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

export function mapDashboardMissingDataToView(
  items: readonly DashboardMissingDataItem[],
  t: TranslateFn,
): DashboardMissingDataItemView[] {
  return items.map((item) => {
    const countSuffix =
      item.count != null && item.count > 0
        ? t(`missingData.items.${item.code}.descriptionCount`, { count: item.count })
        : null;
    const baseDescription = t(`missingData.items.${item.code}.description`);
    const scope =
      item.scope === 'project' && item.projectName
        ? t('missingData.scopeProject', { name: item.projectName })
        : t('missingData.scopeOrganization');

    return {
      code: item.code,
      kind: item.kind,
      title: t(`missingData.items.${item.code}.title`),
      description: countSuffix ? `${baseDescription} ${countSuffix}` : baseDescription,
      why: t(`missingData.items.${item.code}.why`),
      scope,
      affectedLabel: item.affectedMetrics
        .map((metric) => t(`missingData.affected.${metric}`))
        .join(' · '),
      actionHref: item.actionHref,
      actionLabel: t(`missingData.items.${item.code}.action`),
    };
  });
}
