import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalItemCardClass,
  portalItemCardDangerClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalSegmentBarClass,
  portalSegmentClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorDefects, resolveContractorProjectOrganization } from '@/modules/defects';
import type { DefectStatusFilter } from '@/modules/defects/domain/lifecycle';
import { defectStatusTone } from '@/modules/defects/ui/tones';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export default async function ContractorDefectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const status = parseStatus(query.status);
  const context = await requireExternalContext();
  const covered = context.grants.some(
    (grant) =>
      grant.capabilities.has(EXTERNAL_CAPABILITIES.DEFECT_WORK) && (!grant.projectId || grant.projectId === projectId),
  );
  if (!covered) notFound();

  const organizationId = await loadOrNotFound(() => resolveContractorProjectOrganization(context, projectId));
  const list = await loadOrNotFound(() => listContractorDefects(context, { organizationId, projectId, status }));
  const t = await getTranslations('defects');
  const base = `/contractor/projects/${projectId}/defects`;

  return (
    <div className={portalPageStackClass}>
      <header className={portalPageHeaderClass}>
        <h1 className={portalPageTitleClass}>{t('portal.title')}</h1>
        <p className={portalPageSubtitleClass}>{t('portal.description')}</p>
      </header>

      <nav className={portalSegmentBarClass} aria-label={t('portal.title')}>
        <Link href={base} className={portalSegmentClass(status === 'active')} aria-current={status === 'active' ? 'page' : undefined}>
          {t('filters.active')}
        </Link>
        <Link href={`${base}?status=all`} className={portalSegmentClass(status === 'all')} aria-current={status === 'all' ? 'page' : undefined}>
          {t('filters.all')}
        </Link>
      </nav>

      {list.items.length === 0 ? (
        <EmptyState title={t('portal.empty')} size="sm" />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {list.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${base}/${item.id}`}
                className={cn(
                  portalItemCardClass,
                  'block hover:bg-[var(--pf-teal-50)]/30',
                  item.status === 'open' || item.status === 'reopened' || item.status === 'assigned'
                    ? portalItemCardDangerClass
                    : null,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 font-semibold text-[var(--pf-text-primary)]">
                    <span className="pf-numeric text-[var(--pf-text-secondary)]">#{item.referenceNo} </span>
                    {item.title}
                  </p>
                  <Badge tone={defectStatusTone(item.status)}>{t(`status.${item.status}`)}</Badge>
                </div>
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {t('list.cycle', { n: item.cycleNo })}
                  {item.dueDate ? ` · ${t('list.due', { date: item.dueDate })}` : ''}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function parseStatus(value?: string): DefectStatusFilter {
  return value === 'all' ? 'all' : 'active';
}
