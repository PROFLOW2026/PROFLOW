import { Plus } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listProjectsForOrg, type PROJECT_STATUSES } from '@/modules/projects';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { fromNumericString } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';
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
    status?: string;
  }>;
}

function hasActiveFilters(params: { q?: string; status?: string }): boolean {
  return Boolean(params.q?.trim() || (params.status && params.status !== 'all'));
}

export default async function ProjectsPage({ searchParams }: ProjectsPageProps) {
  const t = await getTranslations('projects');
  const tStatus = await getTranslations('status.project');
  const tCommon = await getTranslations('common');
  const params = await searchParams;
  const shell = await getShellContext();

  const canCreate = shell?.permissions.has(PERMISSIONS.PROJECTS_CREATE) ?? false;
  const filtersActive = hasActiveFilters(params);

  const projects = await withOrgContext((context) =>
    listProjectsForOrg(context, {
      search: params.q,
      status: (params.status as (typeof PROJECT_STATUSES)[number] | 'all') ?? 'all',
    }),
  );

  const noResultsQuery = params.q?.trim() || t('list.filterStatus');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        actions={
          canCreate ? (
            <Button asChild>
              <Link href="/projects/new">
                <Plus aria-hidden />
                {t('newProject')}
              </Link>
            </Button>
          ) : null
        }
      />

      <ProjectListFilters
        initialQuery={params.q ?? ''}
        initialStatus={params.status ?? 'all'}
      />

      {projects.length === 0 ? (
        filtersActive ? (
          <EmptyState
            title={tCommon('states.noResultsForQuery', { query: noResultsQuery })}
            description={tCommon('states.noResultsHint')}
            action={
              <Button asChild variant="secondary">
                <Link href="/projects">{tCommon('actions.clearSearch')}</Link>
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
                  <Link href="/projects/new">{t('empty.action')}</Link>
                </Button>
              ) : undefined
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
                        <Link
                          href={`/projects/${project.id}`}
                          className="rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                        >
                          {project.name}
                        </Link>
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
              <Link
                href={`/projects/${project.id}`}
                className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold">{project.name}</span>
                  <ProjectStatusBadge status={project.status} label={tStatus(project.status)} />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {project.clientName ?? t('list.columns.noClient')}
                </p>
                {money ? (
                  <p className="mt-2 text-sm">
                    <MoneyText value={money} />
                  </p>
                ) : (
                  <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('noContractValue')}</p>
                )}
              </Link>
            );
          }}
        />
      )}
    </div>
  );
}
