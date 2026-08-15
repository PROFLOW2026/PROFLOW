import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { jobListMissingProfitKind, listJobsForOrg } from '@/modules/projects';
import { titleWithDocumentNumber } from '@/modules/tenancy';
import { SavedListViewsBar } from '@/modules/tenancy/ui/saved-list-views-bar';
import {
  isWorkListFacet,
  resolveWorkListFacet,
  type WorkListFacet,
} from '@/modules/projects/domain/work-list-facets';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { fromNumericString } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';
import { ProjectStatusBadge } from '../projects/project-status-badge';
import { JobListFilters } from './job-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'jobs' });
  return { title: t('title') };
}

interface JobsPageProps {
  searchParams: Promise<{
    q?: string;
    facet?: string;
    /** @deprecated Prefer `facet`. */
    status?: string;
  }>;
}

function resolveFacet(params: { facet?: string; status?: string }): WorkListFacet {
  if (isWorkListFacet(params.facet)) return params.facet;
  if (params.status === 'draft') return 'new';
  if (params.status === 'active') return 'active';
  if (params.status === 'completed') return 'completed';
  if (params.status === 'archived') return 'archived';
  return 'all';
}

function hasActiveFilters(params: { q?: string; facet: WorkListFacet }): boolean {
  return Boolean(params.q?.trim() || params.facet !== 'all');
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const [t, tStatus, tCommon, params, shell] = await Promise.all([
    getTranslations('jobs'),
    getTranslations('status.project'),
    getTranslations('common'),
    searchParams,
    getShellContext(),
  ]);
  const facet = resolveFacet(params);
  const resolved = resolveWorkListFacet(facet);

  const canCreate = shell?.permissions.has(PERMISSIONS.PROJECTS_CREATE) ?? false;
  const filtersActive = hasActiveFilters({ q: params.q, facet });

  const jobs = await withOrgContext((context) =>
    listJobsForOrg(context, {
      search: params.q,
      status: resolved.status,
      awaitingPayment: resolved.awaitingPayment,
      includeArchived: resolved.includeArchived,
    }),
  );

  const noResultsQuery = params.q?.trim() || t(`list.facets.${facet}`);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6" data-pf-jobs-list="">
      <PageHeader
        title={t('title')}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/jobs/new">
                <Plus aria-hidden />
                {t('newJob')}
              </Link>
            </Button>
          ) : null
        }
      />

      <JobListFilters initialQuery={params.q ?? ''} initialFacet={facet} />
      <SavedListViewsBar
        listKey="jobs"
        searchParams={{ q: params.q, facet, status: params.status }}
        keys={['q', 'facet']}
      />

      {jobs.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: noResultsQuery })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/jobs">{tCommon('actions.clearSearch')}</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={t('empty.title')}
            description={t('empty.body')}
            action={
              canCreate ? (
                <Button asChild>
                  <Link href="/jobs/new">{t('empty.action')}</Link>
                </Button>
              ) : undefined
            }
            secondaryAction={
              <Button asChild variant="ghost">
                <Link href="/settings/features">{t('empty.workMixLink')}</Link>
              </Button>
            }
          />
        )
      ) : (
        <ResponsiveTable
          items={jobs}
          getRowKey={(job) => job.id}
          desktop={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.columns.client')}</TableHead>
                  <TableHead>{t('list.columns.name')}</TableHead>
                  <TableHead>{t('list.columns.date')}</TableHead>
                  <TableHead>{t('list.columns.status')}</TableHead>
                  <TableHead numeric>{t('list.columns.price')}</TableHead>
                  <TableHead numeric>{t('list.columns.actualCost')}</TableHead>
                  <TableHead numeric>{t('list.columns.profit')}</TableHead>
                  <TableHead>{t('list.columns.billing')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const currency =
                    job.contractCurrency ??
                    job.currency ??
                    shell?.organization.baseCurrency ??
                    'ILS';
                  const price =
                    job.pricingMode === 'open'
                      ? null
                      : job.currentContractValue
                        ? fromNumericString(job.currentContractValue, currency)
                        : null;
                  const actual =
                    job.actualCostAmount != null
                      ? fromNumericString(job.actualCostAmount, currency)
                      : null;
                  const profit =
                    job.profitDefined && job.profitAmount != null
                      ? fromNumericString(job.profitAmount, currency)
                      : null;

                  return (
                    <TableRow key={job.id}>
                      <TableCell>{job.clientName ?? t('list.columns.noClient')}</TableCell>
                      <TableCell>
                        <Link href={`/jobs/${job.id}`} className={cn(textNavLinkClassName, 'font-medium')}>
                          {titleWithDocumentNumber(job.name, job.documentNumber ?? '')}
                        </Link>
                      </TableCell>
                      <TableCell className="pf-ltr-island" dir="ltr">
                        {job.startDate ?? '—'}
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={job.status} label={tStatus(job.status)} />
                      </TableCell>
                      <TableCell numeric>
                        {price ? (
                          <MoneyText value={price} />
                        ) : (
                          <span className="text-[var(--pf-text-secondary)]">
                            {t('pricing.priceNotSet')}
                          </span>
                        )}
                      </TableCell>
                      <TableCell numeric>
                        {actual ? <MoneyText value={actual} /> : '—'}
                      </TableCell>
                      <TableCell numeric>
                        {profit ? (
                          <MoneyText value={profit} colorizeNegative />
                        ) : (
                          <span className="text-[var(--pf-text-secondary)]">
                            {jobListMissingProfitKind(job.pricingMode) === 'price_not_set'
                              ? t('pricing.priceNotSet')
                              : '—'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        {t(`list.billingStatus.${job.billingPaymentStatus}`)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          }
          renderMobileCard={(job) => {
            const currency =
              job.contractCurrency ?? job.currency ?? shell?.organization.baseCurrency ?? 'ILS';
            const price =
              job.pricingMode === 'open'
                ? null
                : job.currentContractValue
                  ? fromNumericString(job.currentContractValue, currency)
                  : null;
            const profit =
              job.profitDefined && job.profitAmount != null
                ? fromNumericString(job.profitAmount, currency)
                : null;

            return (
              <Link
                href={`/jobs/${job.id}`}
                className={cn(pressableCardLinkClassName, 'min-w-0 max-w-full')}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold">
                    {titleWithDocumentNumber(job.name, job.documentNumber ?? '')}
                  </span>
                  <ProjectStatusBadge status={job.status} label={tStatus(job.status)} />
                </div>
                <p className="mt-1 min-w-0 break-words text-sm text-[var(--pf-text-secondary)]">
                  {job.clientName ?? t('list.columns.noClient')}
                  {job.startDate ? ` · ${job.startDate}` : ''}
                </p>
                <div className="mt-2 flex min-w-0 flex-wrap gap-3 text-sm">
                  <span>
                    {t('list.columns.price')}:{' '}
                    {price ? <MoneyText value={price} /> : t('pricing.priceNotSet')}
                  </span>
                  <span>
                    {t('list.columns.profit')}:{' '}
                    {profit ? (
                      <MoneyText value={profit} colorizeNegative />
                    ) : jobListMissingProfitKind(job.pricingMode) === 'price_not_set' ? (
                      t('pricing.priceNotSet')
                    ) : (
                      '—'
                    )}
                  </span>
                  <span>{t(`list.billingStatus.${job.billingPaymentStatus}`)}</span>
                </div>
              </Link>
            );
          }}
        />
      )}
    </div>
  );
}
