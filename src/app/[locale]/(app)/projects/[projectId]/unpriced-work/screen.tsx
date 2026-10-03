import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getProjectUnpricedWork, UNPRICED_WORK_STATUSES, type UnpricedWorkStatus } from '@/modules/subcontracts';
import { RecordUnpricedWorkForm, UnpricedWorkActions } from '@/modules/subcontracts/ui/forms';
import { loadOrNotFound } from '@/modules/subcontracts/ui/page-guard';
import { UnpricedStatusBadge } from '@/modules/subcontracts/ui/status';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { bidiIsolate } from '@/shared/money';
import { cn } from '@/shared/ui/cn';

const FILTERS = ['open', ...UNPRICED_WORK_STATUSES.filter((status) => status !== 'recorded'), 'all'] as const;
type Filter = (typeof FILTERS)[number];

function parseFilter(value: string | string[] | undefined): Filter {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (FILTERS as readonly string[]).includes(candidate ?? '') ? (candidate as Filter) : 'open';
}

export async function UnpricedWorkScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string | string[]; offset?: string }>;
}) {
  const { projectId } = await params;
  const query = await searchParams;
  const filter = parseFilter(query.status);
  const offset = Math.max(0, Number.parseInt(query.offset ?? '0', 10) || 0);
  const t = await getTranslations('subcontracts');
  const data = await loadOrNotFound(() =>
    withOrgContext(async (context) => ({
      page: await getProjectUnpricedWork(context, projectId, {
        status: filter === 'open' || filter === 'all' ? filter : (filter as UnpricedWorkStatus),
        offset,
      }),
      today: todayInTimeZone(context.organization.timezone),
    })),
  );
  const { page } = data;
  const locations = page.locations.map((location) => ({
    id: location.id,
    name: location.code ? `${location.code} · ${location.name}` : location.name,
  }));
  const locationName = new Map(locations.map((location) => [location.id, location.name]));
  const runningAgreementIds = new Set(
    page.agreements.filter((agreement) => agreement.status === 'active' || agreement.status === 'suspended').map((a) => a.id),
  );
  const base = `${surfaceRoot ?? ('/projects/' + projectId)}/unpriced-work`;

  return (
    <WithClientMessages extra={['subcontracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('unpriced.pageTitle')} description={t('unpriced.pageDescription')} />

        {page.access.canCoordinate && page.agreements.some((agreement) => runningAgreementIds.has(agreement.id)) ? (
          <Card>
            <CardHeader>
              <CardTitle>{t('unpriced.recordTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <RecordUnpricedWorkForm
                projectId={projectId}
                agreements={page.agreements.filter((agreement) => agreement.status !== 'completed')}
                locations={locations}
                workPackages={page.workPackages}
                today={data.today}
              />
            </CardContent>
          </Card>
        ) : null}

        <nav aria-label={t('unpriced.filterLabel')} className="flex gap-2 overflow-x-auto">
          {FILTERS.map((key) => (
            <Link
              key={key}
              href={key === 'open' ? base : `${base}?status=${key}`}
              aria-current={key === filter ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-3 text-sm md:min-h-9',
                key === filter
                  ? 'bg-[var(--pf-teal-50)] font-medium text-[var(--pf-teal-800)]'
                  : 'text-[var(--pf-text-secondary)] hover:bg-[var(--pf-action-subtle-hover)]',
              )}
            >
              {t(`unpriced.filters.${key}`)}
            </Link>
          ))}
        </nav>

        {page.items.length === 0 ? (
          <EmptyState title={t('unpriced.emptyTitle')} description={t('unpriced.emptyDescription')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {page.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-[var(--pf-border-subtle)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold break-words">{item.title}</p>
                    <p className="text-xs text-[var(--pf-text-muted)]">
                      {[
                        item.vendorName,
                        item.agreementTitle,
                        bidiIsolate(item.workDate),
                        item.locationId ? locationName.get(item.locationId) : null,
                        item.issuerName ? t('unpriced.issuedBy', { name: item.issuerName }) : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <UnpricedStatusBadge status={item.status} label={t(`unpricedStatus.${item.status}`)} />
                </div>
                {item.scopeDescription ? <p className="mt-2 whitespace-pre-line text-sm">{item.scopeDescription}</p> : null}
                {item.decisionReason ? (
                  <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
                    {t('changes.decisionReason')}: {item.decisionReason}
                  </p>
                ) : null}
                {item.convertedChangeId ? (
                  <Link
                    href={`${surfaceRoot ?? ('/projects/' + projectId)}/contractors/${item.agreementId}/changes`}
                    className="mt-2 inline-block text-sm text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
                  >
                    {t('unpriced.viewChange')}
                  </Link>
                ) : null}
                {item.status === 'recorded' && page.access.canCoordinate ? (
                  <div className="mt-3">
                    <UnpricedWorkActions
                      projectId={projectId}
                      agreementId={item.agreementId}
                      unpricedWorkId={item.id}
                      canConvert={runningAgreementIds.has(item.agreementId)}
                    />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {offset > 0 || page.hasMore ? (
          <div className="flex justify-between gap-2">
            {offset > 0 ? (
              <Link href={`${base}?status=${filter}&offset=${Math.max(0, offset - 50)}`} className="text-sm text-[var(--pf-text-brand)]">
                {t('common.previous')}
              </Link>
            ) : (
              <span />
            )}
            {page.hasMore ? (
              <Link href={`${base}?status=${filter}&offset=${offset + 50}`} className="text-sm text-[var(--pf-text-brand)]">
                {t('common.next')}
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </WithClientMessages>
  );
}

export default function UnpricedWorkPage(
  props: Omit<Parameters<typeof UnpricedWorkScreen>[0], 'surfaceRoot'>,
) {
  return <UnpricedWorkScreen {...props} />;
}
