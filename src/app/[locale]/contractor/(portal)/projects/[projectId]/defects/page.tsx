import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorDefects, resolveContractorProjectOrganization } from '@/modules/defects';
import { defectStatusTone } from '@/modules/defects/ui/tones';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import type { DefectStatusFilter } from '@/modules/defects/domain/lifecycle';

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
  const tabClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium sm:flex-none',
      active ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]' : 'text-[var(--pf-text-secondary)]',
    );

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-6">
      <PageHeader title={t('portal.title')} description={t('portal.description')} />

      <nav className="flex gap-1" aria-label={t('portal.title')}>
        <Link href={base} className={tabClass(status === 'active')} aria-current={status === 'active' ? 'page' : undefined}>
          {t('filters.active')}
        </Link>
        <Link href={`${base}?status=all`} className={tabClass(status === 'all')} aria-current={status === 'all' ? 'page' : undefined}>
          {t('filters.all')}
        </Link>
      </nav>

      {list.items.length === 0 ? (
        <EmptyState title={t('portal.empty')} size="sm" />
      ) : (
        <ul className="flex flex-col gap-2">
          {list.items.map((item) => (
            <li key={item.id}>
              <Link href={`${base}/${item.id}`} className="block">
                <Card>
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 font-medium">
                        <span className="pf-numeric text-[var(--pf-text-secondary)]">#{item.referenceNo} </span>
                        {item.title}
                      </p>
                      <Badge tone={defectStatusTone(item.status)}>{t(`status.${item.status}`)}</Badge>
                    </div>
                    <p className="text-xs text-[var(--pf-text-secondary)]">
                      {t('list.cycle', { n: item.cycleNo })}
                      {item.dueDate ? ` · ${t('list.due', { date: item.dueDate })}` : ''}
                    </p>
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

function parseStatus(value?: string): DefectStatusFilter {
  return value === 'all' ? 'all' : 'active';
}
