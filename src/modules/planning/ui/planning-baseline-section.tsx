import 'server-only';

import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { loadBaselineComparison } from '../application/load-baseline-comparison';
import { PlanningBaselinePanel } from './planning-baseline-panel';

export async function PlanningBaselineSection({ projectId }: { readonly projectId: string }) {
  const [t, locale] = await Promise.all([getTranslations('planningBaselines'), getLocale()]);

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.PLANNING_READ)) return null;
    const comparison = await loadBaselineComparison(context, projectId);
    const canWrite = hasPermission(context, PERMISSIONS.PLANNING_WRITE);
    return { comparison, canWrite };
  });

  if (!data) return null;

  return (
    <PlanningBaselinePanel
      projectId={projectId}
      canWrite={data.canWrite}
      latestBaselineCreatedAtIso={data.comparison.latestBaselineCreatedAt?.toISOString() ?? null}
      latestBaselineLabel={data.comparison.latestBaselineLabel}
      comparisonRows={data.comparison.rows}
      messages={{
        title: t('title'),
        description: t('description'),
        save: t('save'),
        label: t('label'),
        empty: t('empty'),
        savedAt: t('savedAt'),
        compareTitle: t('compareTitle'),
        colName: t('columns.name'),
        colBaselineStart: t('columns.baselineStart'),
        colCurrentStart: t('columns.currentStart'),
        colBaselineEnd: t('columns.baselineEnd'),
        colCurrentEnd: t('columns.currentEnd'),
        colStartDelta: t('columns.startDelta'),
        colEndDelta: t('columns.endDelta'),
        error: t('errors.not_allowed'),
      }}
      key={`${locale}:${data.comparison.latestBaselineCreatedAt?.toISOString() ?? 'none'}:${data.comparison.rows.length}`}
    />
  );
}
