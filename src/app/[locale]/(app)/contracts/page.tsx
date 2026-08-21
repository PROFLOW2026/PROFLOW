import { FileText } from 'lucide-react';
import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import { listOrgContracts, listProjectsForOrg } from '@/modules/projects';
import { listClientsForOrg } from '@/modules/clients';
import { money } from '@/shared/money';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { pressableCardLinkClassName, textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import { WithClientMessages } from '@/shared/i18n/with-client-messages';
import { ContractsListFilters } from './contracts-list-filters';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contracts' });
  return { title: t('title') };
}

function statusShape(status: string): StatusShape {
  switch (status) {
    case 'active':
      return 'active';
    case 'draft':
      return 'pending';
    case 'closed':
      return 'completed';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    type?: string;
    clientId?: string;
    projectId?: string;
  }>;
}) {
  const t = await getTranslations('contracts');
  const params = await searchParams;

  const { items, clients, projects } = await withOrgContext(async (context) => ({
    items: await listOrgContracts(context, {
      status:
        params.status && params.status !== 'all'
          ? (params.status as 'draft' | 'active' | 'closed' | 'cancelled')
          : 'all',
      contractType:
        params.type && params.type !== 'all'
          ? (params.type as 'primary' | 'additional' | 'secondary')
          : 'all',
      clientId: params.clientId && params.clientId !== 'all' ? params.clientId : undefined,
      projectId: params.projectId && params.projectId !== 'all' ? params.projectId : undefined,
    }),
    clients: await listClientsForOrg(context, {}).catch(() => []),
    projects: await listProjectsForOrg(context, {}).catch(() => []),
  }));

  return (
    <WithClientMessages extra={['contracts']}>
      <div className="flex flex-col gap-6">
        <PageHeader title={t('title')} description={t('description')} />

        <ContractsListFilters
          initialStatus={params.status ?? 'all'}
          initialType={params.type ?? 'all'}
          initialClientId={params.clientId ?? ''}
          initialProjectId={params.projectId ?? ''}
          clients={clients.map((client) => ({ id: client.id, name: client.name }))}
          projects={projects.map((project) => ({ id: project.id, name: project.name }))}
        />

        {items.length === 0 ? (
          <EmptyState icon={FileText} title={t('empty.title')} description={t('empty.body')} />
        ) : (
          <ResponsiveTable
            items={items}
            getRowKey={(item) => item.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('list.columns.client')}</TableHead>
                      <TableHead>{t('list.columns.project')}</TableHead>
                      <TableHead>{t('list.columns.type')}</TableHead>
                      <TableHead>{t('list.columns.status')}</TableHead>
                      <TableHead>{t('list.columns.number')}</TableHead>
                      <TableHead>{t('list.columns.original')}</TableHead>
                      <TableHead>{t('list.columns.current')}</TableHead>
                      <TableHead>{t('list.columns.dates')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.clientName ?? '—'}</TableCell>
                        <TableCell>
                          <Link
                            href={`/projects/${item.projectId}?tab=contracts`}
                            className={cn(textNavLinkClassName, 'font-medium')}
                          >
                            {item.projectName}
                          </Link>
                        </TableCell>
                        <TableCell>{t(`types.${item.contractType}`)}</TableCell>
                        <TableCell>
                          <StatusBadge
                            shape={statusShape(item.status)}
                            label={t(`statuses.${item.status}`)}
                          />
                        </TableCell>
                        <TableCell dir="ltr">
                          {item.contractNumber || item.name || '—'}
                        </TableCell>
                        <TableCell>
                          {item.originalAmount ? (
                            <MoneyText value={money(item.originalAmount, item.currency)} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          {item.currentAmount ? (
                            <MoneyText value={money(item.currentAmount, item.currency)} />
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="pf-ltr-island" dir="ltr">
                            {[item.startDate, item.endDate].filter(Boolean).join(' → ') || '—'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(item) => (
              <Link
                href={`/projects/${item.projectId}?tab=contracts`}
                className={pressableCardLinkClassName}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.contractNumber || item.name || item.projectName}
                  </span>
                  <StatusBadge
                    className="shrink-0"
                    shape={statusShape(item.status)}
                    label={t(`statuses.${item.status}`)}
                  />
                </div>
                <p className="mt-1 text-sm text-[var(--pf-text-secondary)]">
                  {item.clientName ?? '—'} · {item.projectName}
                </p>
              </Link>
            )}
          />
        )}
      </div>
    </WithClientMessages>
  );
}
