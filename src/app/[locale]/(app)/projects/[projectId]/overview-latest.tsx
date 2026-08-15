import { getTranslations } from 'next-intl/server';
import { listProjectChangeRequests } from '@/modules/commercial';
import { listDailyLogsForOrg, listPunchListItemsForOrg } from '@/modules/field-ops';
import { getModuleVisibility } from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';

interface LatestRow {
  readonly key: string;
  readonly label: string;
  readonly title: string;
  readonly href: string;
}

export async function ProjectOverviewLatest({
  projectId,
}: {
  readonly projectId: string;
}) {
  const t = await getTranslations('projects.overview.latest');

  const rows = await withOrgContext(async (context) => {
    const modules = await getModuleVisibility(context);
    const out: LatestRow[] = [];

    if (modules.field_ops && hasPermission(context, PERMISSIONS.FIELD_OPS_READ)) {
      const [logs, punchItems] = await Promise.all([
        listDailyLogsForOrg(context, { projectId }).catch(() => []),
        listPunchListItemsForOrg(context, { projectId }).catch(() => []),
      ]);
      const log = logs[0];
      if (log) {
        out.push({
          key: `log:${log.id}`,
          label: t('dailyLog'),
          title: log.summary,
          href: `/field-ops/logs/${log.id}`,
        });
      }
      const punch = punchItems[0];
      if (punch) {
        out.push({
          key: `punch:${punch.id}`,
          label: t('punch'),
          title: punch.title,
          href: `/field-ops/punch/${punch.id}`,
        });
      }
    }

    if (modules.changes && hasPermission(context, PERMISSIONS.CHANGES_READ)) {
      const changes = await listProjectChangeRequests(context, projectId).catch(() => []);
      const latest = [...changes].sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      )[0];
      if (latest) {
        out.push({
          key: `change:${latest.id}`,
          label: t('change'),
          title: latest.reference ? `${latest.reference} · ${latest.title}` : latest.title,
          href: `/changes/${latest.id}`,
        });
      }
    }

    return out.slice(0, 5);
  }).catch(() => [] as LatestRow[]);

  if (rows.length === 0) return null;

  return (
    <section className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4">
      <h2 className="text-sm font-semibold">{t('title')}</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((row) => (
          <li key={row.key} className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-[var(--pf-text-muted)]">{row.label}</p>
              <p className="truncate text-sm">{row.title}</p>
            </div>
            <Link href={row.href} className={cn(textNavLinkClassName, 'shrink-0 text-sm')}>
              {t('open')}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
