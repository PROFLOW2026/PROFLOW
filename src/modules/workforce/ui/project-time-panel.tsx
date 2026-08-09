import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { listProjectTimeEntries } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { canLogTime, canViewWorkforceCosts } from './employees-table';
import { TimeEntriesTable } from './time-entries-table';

export interface ProjectTimePanelProps {
  readonly projectId: string;
}

/**
 * Embeddable project workspace Time tab (doc 52).
 * Renders only when the caller passes a project id; workforce chrome stays absent elsewhere.
 */
export async function ProjectTimePanel({ projectId }: ProjectTimePanelProps) {
  const t = await getTranslations('workforce');

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.WORKFORCE_READ) && !hasPermission(context, PERMISSIONS.PROJECTS_READ)) {
      return null;
    }

    const entries = await listProjectTimeEntries(context, projectId);
    const showCosts = canViewWorkforceCosts(context);
    const allowLog = canLogTime(context);

    const totalHours = entries.reduce((sum, entry) => sum + Number(entry.hours), 0);

    return { entries, showCosts, allowLog, totalHours };
  });

  if (!data) return null;

  const { entries, showCosts, allowLog, totalHours } = data;

  return (
    <Card className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{t('projectPanel.title')}</h2>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {t('projectPanel.summary', { hours: totalHours.toFixed(2), count: entries.length })}
          </p>
        </div>
        {allowLog ? (
          <Button asChild size="sm">
            <Link href={`/workforce/time/new?projectId=${projectId}`}>{t('projectPanel.logTime')}</Link>
          </Button>
        ) : null}
      </div>

      <TimeEntriesTable entries={entries.slice(0, 10)} showCosts={showCosts} canLogTime={allowLog} />

      {entries.length > 10 ? (
        <Button asChild variant="ghost" className="self-start">
          <Link href={`/workforce/time?projectId=${projectId}`}>{t('projectPanel.viewAll')}</Link>
        </Button>
      ) : null}
    </Card>
  );
}
