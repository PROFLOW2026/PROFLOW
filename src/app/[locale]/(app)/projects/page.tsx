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
import { listProjectsForOrg } from '@/modules/projects';
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
import { PrefetchOnIntentLink } from '@/components/ui/prefetch-on-intent-link';
import { ProjectListFilters } from './project-list-filters';
import { ProjectStatusBadge } from './project-status-badge';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'projects' });
  return { title: t('title') };
}

interface ProjectsPageProps {
  searchParams: Promise<{
    q?: string;
    facet?: string;
    /** @deprecated Prefer `facet`; kept for old bookmarks. */
    status?: string;
  }>;
}

function resolveFacet(params: { facet?: string; status?: string }): WorkListFacet {
  if (isWorkListFacet(params.facet)) return params.facet;
  if (params.status === 'draft') return 'new';
  if (params.status === 'active') return 'active';
  if (params.status === 'completed') return 'completed';
  return 'all';
}

function hasActiveFilters(params: { q?: string; facet: WorkListFacet }): boolean {
  return Boolean(params.q?.trim() || params.facet !== 'all');
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const [t, tStatus, tCommon, params, shell] = await Promise.all([
    getTranslations('projects'),
    getTranslations('status.project'),
    getTranslations('common'),
    searchParams,
    getShellContext(),
  ]);
  const facet = resolveFacet(params);
  const resolved = resolveWorkListFacet(facet);

  const canCreate = shell?.permissions.has(PERMISSIONS.PROJECTS_CREATE) ?? false;
  const filtersActive = hasActiveFilters({ q: params.q, facet });

  const projects = await withOrgContext((context) =>
    listProjectsForOrg(context, {
      search: params.q,
      workKind: 'project',
      status: resolved.status,
      awaitingPayment: resolved.awaitingPayment,
    }),
  );

  const noResultsQuery = params.q?.trim() || t(`list.facets.${facet}`);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new" prefetch={false}>
                <Plus aria-hidden />
                {t('newProject')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ProjectListFilters initialQuery={params.q ?? ''} initialFacet={facet} namespace="projects" />

      {projects.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: noResultsQuery })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/projects" prefetch={false}>{tCommon('actions.clearSearch')}</Link>
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
                  <Link href="/projects/new" prefetch={false}>{t('empty.action')}</Link>
                </Button>
              ) : undefined
            }
            secondaryAction={
              <Button asChild variant="secondary">
                <Link href={canCreate ? '/jobs/new' : '/jobs'} prefetch={false}>
                  {t('empty.jobsAffordance')}
                </Link>
              </Button>
            }
          />
        )
      ) : (
        <ResponsiveTable
          items={projects}
          getRowKey={(project) => project.id}
          desktop={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('list.columns.name')}</TableHead>
                  <TableHead>{t('list.columns.client')}</TableHead>
                  <TableHead>{t('list.columns.status')}</TableHead>
                  <TableHead numeric>{t('list.columns.contractValue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const money =
                    project.currentContractValue && project.contractCurrency
                      ? fromNumericString(project.currentContractValue, project.contractCurrency)
                      : null;

                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <PrefetchOnIntentLink
                          href={`/projects/${project.id}`}
                          className={cn(textNavLinkClassName, 'rounded-sm font-medium')}
                        >
                          {project.name}
                        </PrefetchOnIntentLink>
                      </TableCell>
                      <TableCell className="text-[var(--pf-text-secondary)]">
                        {project.clientName ?? t('list.columns.noClient')}
                      </TableCell>
                      <TableCell>
                        <ProjectStatusBadge status={project.status} label={tStatus(project.status)} />
                      </TableCell>
                      <TableCell numeric>
                        {money ? <MoneyText value={money} compact /> : t('noContractValue')}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          }
          renderMobileCard={(project) => {
            const money =
              project.currentContractValue && project.contractCurrency
                ? fromNumericString(project.currentContractValue, project.contractCurrency)
                : null;

            return (
              <PrefetchOnIntentLink
                href={`/projects/${project.id}`}
                className={cn(pressableCardLinkClassName, 'min-w-0 max-w-full')}
              >
                <div className="flex min-w-0 items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 break-words font-semibold">{project.name}</span>
                  <ProjectStatusBadge status={project.status} label={tStatus(project.status)} />
                </div>
                <p className="mt-1 min-w-0 break-words text-sm text-[var(--pf-text-secondary)]">
                  {project.clientName ?? t('list.columns.noClient')}
                </p>
                {money ? (
                  <p className="mt-2 min-w-0 max-w-full overflow-x-auto text-sm">
                    <MoneyText value={money} />
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('noContractValue')}</p>
                )}
              </PrefetchOnIntentLink>
            );
          }}
        />
      )}
    </div>
  );
}
