import { getFormatter, getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorInstructions } from '@/modules/site-instructions';
import { INSTRUCTION_STATUS_TONE } from '@/modules/site-instructions/ui/status-tone';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { Link } from '@/shared/i18n/navigation';

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
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader
        title={t('portal.instructions.title')}
        description={t('portal.instructions.description')}
        meta={pending.length > 0 ? <Badge tone="warning">{t('portal.instructions.pendingCount', { count: pending.length })}</Badge> : null}
      />

      <nav className="flex gap-2" aria-label={t('instructions.filterLabel')}>
        <Button asChild size="sm" variant={status === 'open' ? 'primary' : 'secondary'}>
          <Link href={basePath}>{t('instructions.filters.open')}</Link>
        </Button>
        <Button asChild size="sm" variant={status === 'all' ? 'primary' : 'secondary'}>
          <Link href={`${basePath}?status=all`}>{t('instructions.filters.all')}</Link>
        </Button>
      </nav>

      {items.length === 0 ? (
        <EmptyState title={t('portal.instructions.emptyTitle')} description={t('portal.instructions.emptyDescription')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <li key={item.id}>
              <Link href={`${basePath}/${item.id}`} className="block">
                <Card className={item.status === 'issued' ? 'border-[var(--pf-status-warning-border)]' : undefined}>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-medium">
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
                      <span className="text-sm font-medium text-[var(--pf-text-brand)]">{t('portal.instructions.tapToAcknowledge')}</span>
                    ) : null}
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
