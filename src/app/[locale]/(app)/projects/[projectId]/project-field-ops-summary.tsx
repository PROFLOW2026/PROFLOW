import { getLocale, getTranslations } from 'next-intl/server';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import {
  getProjectFieldOpsSummary,
  type InspectionStatus,
} from '@/modules/field-ops';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

function inspectionShape(status: InspectionStatus): StatusShape {
  switch (status) {
    case 'scheduled':
      return 'pending';
    case 'in_progress':
      return 'active';
    case 'passed':
      return 'completed';
    case 'failed':
      return 'rejected';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

/** Project Workspace overview: field-ops counts + deep links (module-gated by caller). */
export async function ProjectFieldOpsSummaryPanel({ projectId }: { projectId: string }) {
  const t = await getTranslations('fieldOps.projectSummary');
  const tStatus = await getTranslations('status.inspection');
  const locale = await getLocale();

  const summary = await withOrgContext((context) =>
    getProjectFieldOpsSummary(context, projectId),
  ).catch(() => null);

  if (!summary) return null;

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <ul className="flex flex-wrap gap-3 text-sm">
          <li>
            <Link
              href={`/field-ops/logs?projectId=${projectId}`}
              className="text-[var(--pf-text-secondary)] hover:underline"
            >
              {t('links.logs')}
            </Link>
          </li>
          <li>
            <Link
              href={`/field-ops/punch?projectId=${projectId}`}
              className="text-[var(--pf-text-secondary)] hover:underline"
            >
              {t('links.punch')}
            </Link>
          </li>
          <li>
            <Link
              href={`/field-ops/inspections?projectId=${projectId}`}
              className="text-[var(--pf-text-secondary)] hover:underline"
            >
              {t('links.inspections')}
            </Link>
          </li>
        </ul>
      </div>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('openPunch')}
          </dt>
          <dd className="mt-1 text-2xl font-semibold tabular-nums">{summary.openPunchCount}</dd>
          <Link
            href={`/field-ops/punch/new?projectId=${projectId}`}
            className="mt-1 inline-block text-sm hover:underline"
          >
            {t('addPunch')}
          </Link>
        </div>

        <div className="sm:col-span-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('latestLog')}
          </dt>
          <dd className="mt-1 text-sm">
            {summary.latestLog ? (
              <Link
                href={`/field-ops/logs/${summary.latestLog.id}`}
                className="hover:underline"
              >
                <span className="font-medium">
                  {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                    new Date(summary.latestLog.logDate),
                  )}
                </span>
                <span className="mt-0.5 block line-clamp-2 text-[var(--pf-text-secondary)]">
                  {summary.latestLog.summary}
                </span>
              </Link>
            ) : (
              <span className="text-[var(--pf-text-secondary)]">{t('noLog')}</span>
            )}
          </dd>
          <Link
            href={`/field-ops/logs/new?projectId=${projectId}`}
            className="mt-1 inline-block text-sm hover:underline"
          >
            {t('addLog')}
          </Link>
        </div>
      </dl>

      <div className="mt-4 border-t border-[var(--pf-border-default)] pt-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-[var(--pf-text-secondary)]">
          {t('upcomingInspections')}
        </h3>
        {summary.upcomingInspections.length === 0 ? (
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{t('noInspections')}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {summary.upcomingInspections.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <Link
                  href={`/field-ops/inspections/${item.id}`}
                  className="font-medium hover:underline"
                >
                  {item.title}
                </Link>
                <span className="flex items-center gap-2 text-[var(--pf-text-secondary)]">
                  {item.scheduledOn ?? t('unscheduled')}
                  <StatusBadge
                    shape={inspectionShape(item.status)}
                    label={tStatus(item.status)}
                  />
                </span>
              </li>
            ))}
          </ul>
        )}
        <Link
          href={`/field-ops/inspections/new?projectId=${projectId}`}
          className="mt-2 inline-block text-sm hover:underline"
        >
          {t('addInspection')}
        </Link>
      </div>
    </section>
  );
}
