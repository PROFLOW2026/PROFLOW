import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  portalItemCardClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
  portalSegmentBarClass,
  portalSegmentClass,
} from '@/modules/contractor-portal/ui/portal-surface';
import { listContractorInstructions } from '@/modules/site-instructions';
import { INSTRUCTION_STATUS_TONE } from '@/modules/site-instructions/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export default async function ContractorInstructionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const [{ projectId }, query] = await Promise.all([params, searchParams]);
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const status = query.status === 'all' ? 'all' : 'open';
  const items = await loadOrNotFound(async () => {
    const context = await requireExternalContext();
    return listContractorInstructions(context, projectId, { status });
  });
  const basePath = `/contractor/projects/${projectId}/instructions`;
  const pending = items.filter((item) => item.status === 'issued');

  return (
    <div className={portalPageStackClass}>
      <header className={cn(portalPageHeaderClass, 'flex flex-wrap items-start justify-between gap-3')}>
        <div className="min-w-0 space-y-1.5">
          <h1 className={portalPageTitleClass}>{t('portal.instructions.title')}</h1>
          <p className={portalPageSubtitleClass}>{t('portal.instructions.description')}</p>
        </div>
        {pending.length > 0 ? (
          <Badge tone="warning">{t('portal.instructions.pendingCount', { count: pending.length })}</Badge>
        ) : null}
      </header>

      <nav className={portalSegmentBarClass} aria-label={t('instructions.filterLabel')}>
        <Link href={basePath} className={portalSegmentClass(status === 'open')} aria-current={status === 'open' ? 'page' : undefined}>
          {t('instructions.filters.open')}
        </Link>
        <Link
          href={`${basePath}?status=all`}
          className={portalSegmentClass(status === 'all')}
          aria-current={status === 'all' ? 'page' : undefined}
        >
          {t('instructions.filters.all')}
        </Link>
      </nav>

      {items.length === 0 ? (
        <EmptyState title={t('portal.instructions.emptyTitle')} description={t('portal.instructions.emptyDescription')} />
      ) : (
        <ul className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={`${basePath}/${item.id}`}
                className={cn(
                  portalItemCardClass,
                  'block hover:bg-[var(--pf-teal-50)]/30',
                  item.status === 'issued' ? 'border-[var(--pf-status-warning-border)]' : null,
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 break-words font-semibold text-[var(--pf-text-primary)]">
                    <span className="pf-numeric text-[var(--pf-text-secondary)]">#{item.instructionNumber} </span>
                    {item.title}
                  </p>
                  <Badge tone={INSTRUCTION_STATUS_TONE[item.status]}>{t(`instructionStatus.${item.status}`)}</Badge>
                </div>
                <p className="text-xs text-[var(--pf-text-secondary)]">
                  {format.dateTime(item.issuedAt, { dateStyle: 'medium' })}
                  {item.dueDate ? ` · ${t('instructions.dueOn', { date: item.dueDate })}` : ''}
                </p>
                {item.status === 'issued' ? (
                  <span className="text-sm font-medium text-[var(--pf-accent)]">
                    {t('portal.instructions.tapToAcknowledge')}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
